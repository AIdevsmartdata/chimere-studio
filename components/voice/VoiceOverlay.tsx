"use client";

// VoiceOverlay.tsx
// Fullscreen voice capture UI, Granola-style:
//   - black canvas with a live waveform reacting to mic RMS
//   - interim transcript at the bottom while the user speaks
//   - auto-stop on 1.5s silence, then STT -> LLM -> (optional TTS)
//   - state pill: "écoute" / "réfléchit" / "répond"
//
// The overlay owns its MediaStream + MediaRecorder + VAD + fetch-stream to
// the /chat/completions endpoint, so the caller only has to mount/unmount it
// and react to onTranscript(user, assistant) when a turn completes.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Mic, X } from 'lucide-react';
import { VADDetector } from './VADDetector';
import { getMicStream, pickRecorderMime, transcribeBlob } from '@/lib/stt_client';
import { speak, getTtsUrl } from '@/lib/tts_client';

type Phase = 'idle' | 'listening' | 'transcribing' | 'thinking' | 'speaking' | 'error';

export interface VoiceTurn {
  user: string;
  assistant: string;
  reasoning?: string;
}

export interface VoiceOverlayProps {
  open: boolean;
  onClose: () => void;
  /** Conversation history (role + content) so the LLM has context. */
  history: { role: 'user' | 'assistant'; content: string }[];
  /** Backend base URL (OpenAI-compat), e.g. http://127.0.0.1:8084/v1 */
  backend: string;
  /** Fired when a turn (user utterance + assistant reply) is complete. */
  onTurn: (turn: VoiceTurn) => void;
}

export default function VoiceOverlay({ open, onClose, history, backend, onTurn }: VoiceOverlayProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [levels, setLevels] = useState<number[]>(() => new Array(48).fill(0.02));
  const [interim, setInterim] = useState('');
  const [finalUser, setFinalUser] = useState('');
  const [assistantPartial, setAssistantPartial] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const vadRef = useRef<VADDetector | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);
  const stopGuardRef = useRef(false);

  const hasTts = useMemo(() => (typeof window !== 'undefined' ? Boolean(getTtsUrl()) : false), []);

  // --- teardown helper ---
  const cleanup = async () => {
    stopGuardRef.current = true;
    try { recorderRef.current?.state !== 'inactive' && recorderRef.current?.stop(); } catch {}
    recorderRef.current = null;
    try { await vadRef.current?.dispose(); } catch {}
    vadRef.current = null;
    try { streamRef.current?.getTracks().forEach((t) => t.stop()); } catch {}
    streamRef.current = null;
    try { abortRef.current?.abort(); } catch {}
    abortRef.current = null;
    try { ttsAudioRef.current?.pause(); } catch {}
    ttsAudioRef.current = null;
  };

  // --- main listen flow ---
  const startListening = async () => {
    setErrorMsg(null);
    setFinalUser('');
    setAssistantPartial('');
    setInterim('');
    setPhase('listening');
    stopGuardRef.current = false;
    chunksRef.current = [];

    let stream: MediaStream;
    try {
      stream = await getMicStream();
    } catch (e: any) {
      setErrorMsg(e?.message || 'Accès micro refusé');
      setPhase('error');
      return;
    }
    streamRef.current = stream;

    const mime = pickRecorderMime();
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 48_000 });
    } catch {
      rec = new MediaRecorder(stream);
    }
    recorderRef.current = rec;
    rec.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
    };
    rec.onstop = () => {
      // Handed off in finalizeUtterance.
    };
    rec.start(200);

    const vad = new VADDetector(stream, {
      voiceThreshold: 0.02,
      silenceHangMs: 1500,
      minVoiceMs: 400,
      onLevel: (rms) => {
        setLevels((prev) => {
          const next = prev.slice(1);
          // Boost a bit so quiet voices still show movement.
          next.push(Math.min(1, rms * 6));
          return next;
        });
      },
      onSpeechStart: () => setInterim('…'),
      onSilence: () => {
        if (stopGuardRef.current) return;
        finalizeUtterance();
      },
    });
    vadRef.current = vad;
    vad.start();
  };

  const finalizeUtterance = async () => {
    if (stopGuardRef.current) return;
    stopGuardRef.current = true;
    setPhase('transcribing');

    const rec = recorderRef.current;
    const mime = rec?.mimeType || 'audio/webm';
    const waitStop = new Promise<void>((resolve) => {
      if (!rec || rec.state === 'inactive') return resolve();
      rec.addEventListener('stop', () => resolve(), { once: true });
      try { rec.stop(); } catch { resolve(); }
    });
    await waitStop;
    try { vadRef.current?.stop(); } catch {}
    try { streamRef.current?.getTracks().forEach((t) => t.stop()); } catch {}

    const blob = new Blob(chunksRef.current, { type: mime });
    chunksRef.current = [];
    if (blob.size < 1500) {
      setInterim('');
      setPhase('idle');
      return;
    }

    let transcript = '';
    try {
      transcript = await transcribeBlob(blob, { language: 'fr' });
    } catch (e: any) {
      setErrorMsg(e?.message || 'STT indisponible');
      setPhase('error');
      return;
    }
    if (!transcript) {
      setInterim('');
      setPhase('idle');
      return;
    }

    setFinalUser(transcript);
    setInterim('');
    await runLLM(transcript);
  };

  const runLLM = async (userText: string) => {
    setPhase('thinking');
    const ac = new AbortController();
    abortRef.current = ac;

    const messages = [
      ...history.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: userText },
    ];

    let assembled = '';
    let reasoning = '';
    try {
      const res = await fetch(`${backend}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'chimere',
          messages,
          stream: true,
          max_tokens: 4096,
        }),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6).trim();
          if (payload === '[DONE]') continue;
          try {
            const chunk = JSON.parse(payload);
            const delta = chunk.choices?.[0]?.delta;
            if (!delta) continue;
            const c: string = delta.content || '';
            const r: string = delta.reasoning_content || '';
            if (c) {
              assembled += c;
              setAssistantPartial(assembled);
            }
            if (r) {
              reasoning += r;
            }
          } catch {}
        }
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
      setErrorMsg(e?.message || 'Backend indisponible');
      setPhase('error');
      return;
    }

    onTurn({ user: userText, assistant: assembled, reasoning: reasoning || undefined });

    // Optional TTS; silently skipped when no local TTS is configured.
    if (assembled && hasTts) {
      setPhase('speaking');
      try {
        const audio = await speak(assembled, {
          onEnd: () => setPhase('idle'),
        });
        ttsAudioRef.current = audio;
        if (!audio) setPhase('idle');
      } catch {
        setPhase('idle');
      }
    } else {
      setPhase('idle');
    }
  };

  // Auto-start listening when the overlay opens.
  useEffect(() => {
    if (!open) return;
    startListening();
    return () => {
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ESC to close.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleClose = async () => {
    await cleanup();
    setPhase('idle');
    onClose();
  };

  const handleStopNow = async () => {
    if (phase === 'listening') {
      await finalizeUtterance();
    } else {
      // Restart a fresh listen cycle.
      await cleanup();
      startListening();
    }
  };

  if (!open) return null;

  const phaseLabel =
    phase === 'listening' ? 'Chimère écoute'
    : phase === 'transcribing' ? 'Chimère transcrit'
    : phase === 'thinking' ? 'Chimère réfléchit'
    : phase === 'speaking' ? 'Chimère répond'
    : phase === 'error' ? 'Erreur'
    : 'Prêt';

  return (
    <div className="fixed inset-0 z-50 bg-black text-white flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-2 text-sm">
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              phase === 'listening' ? 'bg-emerald-400 animate-pulse'
              : phase === 'thinking' ? 'bg-amber-400 animate-pulse'
              : phase === 'speaking' ? 'bg-sky-400 animate-pulse'
              : phase === 'error' ? 'bg-rose-500'
              : 'bg-zinc-500'
            }`}
          />
          <span className="tracking-wide text-zinc-300">{phaseLabel}</span>
        </div>
        <button
          onClick={handleClose}
          className="rounded-md p-2 text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
          aria-label="Fermer"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Waveform area */}
      <div className="flex-1 flex flex-col items-center justify-center px-8">
        <div className="flex items-end gap-1.5 h-40">
          {levels.map((lvl, i) => {
            const h = Math.max(4, Math.round(lvl * 160));
            const isActive = phase === 'listening';
            return (
              <span
                key={i}
                className={`w-1.5 rounded-full transition-[height] duration-75 ${
                  isActive ? 'bg-white/90' : 'bg-white/30'
                }`}
                style={{ height: `${h}px` }}
              />
            );
          })}
        </div>

        <div className="mt-10 max-w-2xl text-center space-y-3">
          {finalUser && (
            <div className="text-zinc-400 text-sm">
              <span className="uppercase tracking-widest text-[10px] mr-2">Vous</span>
              {finalUser}
            </div>
          )}
          {assistantPartial && (
            <div className="text-lg text-zinc-100 leading-relaxed whitespace-pre-wrap">
              {assistantPartial}
            </div>
          )}
          {!finalUser && !assistantPartial && phase === 'listening' && (
            <div className="text-zinc-500 text-sm">Parlez, puis faites une pause.</div>
          )}
          {errorMsg && phase === 'error' && (
            <div className="text-rose-400 text-sm">{errorMsg}</div>
          )}
        </div>
      </div>

      {/* Interim + controls */}
      <div className="px-8 pb-10 flex flex-col items-center gap-4">
        {phase === 'listening' && interim && (
          <div className="text-zinc-500 text-sm italic">{interim}</div>
        )}
        <div className="flex items-center gap-3">
          <button
            onClick={handleStopNow}
            disabled={phase === 'transcribing' || phase === 'thinking'}
            className="rounded-full bg-white text-black h-14 w-14 flex items-center justify-center shadow-lg hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            aria-label={phase === 'listening' ? 'Terminer' : 'Réécouter'}
            title={phase === 'listening' ? 'Terminer maintenant' : 'Nouvelle question'}
          >
            <Mic className="h-6 w-6" />
          </button>
        </div>
        <div className="text-zinc-600 text-[11px] tracking-wide">
          Auto-stop après 1.5 s de silence · Échap pour quitter
        </div>
      </div>
    </div>
  );
}
