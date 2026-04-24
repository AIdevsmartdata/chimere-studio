// tts_client.ts
// Optional TTS layer. Piper/Orpheus aren't shipped with this station yet, so
// the default behaviour is a noop: the UI simply displays the assistant reply.
// If the user later runs a local OpenAI-compat TTS (e.g. `piper-server`, or
// the openai-edge-tts FastAPI bridge), they can set
// `localStorage.setItem('chimere:tts', 'http://127.0.0.1:5005/v1')` and the
// overlay will auto-stream audio.

export const TTS_STORAGE_KEY = 'chimere:tts';

export function getTtsUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const v = localStorage.getItem(TTS_STORAGE_KEY);
  return v && v.trim().length > 0 ? v : null;
}

export interface SpeakOptions {
  voice?: string;
  signal?: AbortSignal;
  /** Fired when playback actually starts (first byte played). */
  onStart?: () => void;
  /** Fired when audio element finishes or errors. */
  onEnd?: () => void;
}

/**
 * Speak `text` through the configured local TTS, if any. Returns the
 * HTMLAudioElement so the caller can abort playback (for interrupt / VAD).
 * Returns null when no TTS is configured — the caller should silently skip.
 */
export async function speak(text: string, opts: SpeakOptions = {}): Promise<HTMLAudioElement | null> {
  const base = getTtsUrl();
  if (!base || !text.trim()) return null;

  const res = await fetch(`${base}/audio/speech`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: opts.signal,
    body: JSON.stringify({
      model: 'tts-1',
      input: text,
      voice: opts.voice || 'fr_FR-siwis-medium',
      response_format: 'mp3',
    }),
  });
  if (!res.ok) {
    opts.onEnd?.();
    return null;
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  audio.addEventListener('play', () => opts.onStart?.(), { once: true });
  const cleanup = () => {
    URL.revokeObjectURL(url);
    opts.onEnd?.();
  };
  audio.addEventListener('ended', cleanup, { once: true });
  audio.addEventListener('error', cleanup, { once: true });
  try {
    await audio.play();
  } catch {
    cleanup();
    return null;
  }
  return audio;
}
