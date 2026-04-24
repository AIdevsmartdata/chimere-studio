// stt_client.ts
// Thin client for the local Parakeet server (OpenAI /v1/audio/transcriptions
// compatible). Running on 127.0.0.1:8087 by default, configurable through
// localStorage.getItem('chimere:stt') for parity with the backend setting.

export const DEFAULT_STT_URL = 'http://127.0.0.1:8087/v1';

export function getSttUrl(): string {
  if (typeof window === 'undefined') return DEFAULT_STT_URL;
  return localStorage.getItem('chimere:stt') || DEFAULT_STT_URL;
}

/**
 * Ask the browser for a microphone MediaStream suitable for speech input.
 * Echo cancellation and noise suppression are on; we force mono so the
 * downstream encoder stays compact.
 */
export async function getMicStream(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Web Audio non disponible dans ce contexte.');
  }
  return navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });
}

/**
 * Pick a MIME type the current browser actually supports for MediaRecorder.
 * Parakeet normalises with ffmpeg, so any of webm/ogg/wav is fine.
 */
export function pickRecorderMime(): string {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/ogg',
    'audio/mp4',
    'audio/wav',
  ];
  const MR: any = (globalThis as any).MediaRecorder;
  if (!MR?.isTypeSupported) return 'audio/webm';
  for (const mime of candidates) {
    try {
      if (MR.isTypeSupported(mime)) return mime;
    } catch {}
  }
  return 'audio/webm';
}

/**
 * Upload a recorded blob to the Parakeet server and return the transcript.
 * Passes `language=fr` by default — Parakeet TDT v3 is multilingual and
 * ignores `language` when mismatched, so French is a sane default here.
 */
export async function transcribeBlob(
  blob: Blob,
  opts: { language?: string; signal?: AbortSignal; baseUrl?: string } = {},
): Promise<string> {
  const base = opts.baseUrl || getSttUrl();
  const form = new FormData();
  const ext = blob.type.includes('wav') ? 'wav' : blob.type.includes('ogg') ? 'ogg' : 'webm';
  form.append('file', blob, `clip.${ext}`);
  form.append('language', opts.language || 'fr');
  form.append('response_format', 'json');

  const res = await fetch(`${base}/audio/transcriptions`, {
    method: 'POST',
    body: form,
    signal: opts.signal,
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`STT ${res.status}: ${txt.slice(0, 200)}`);
  }
  const data = await res.json().catch(() => ({}));
  return typeof data?.text === 'string' ? data.text.trim() : '';
}
