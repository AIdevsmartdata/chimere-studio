// VADDetector.ts
// Simple RMS-based Voice Activity Detector.
// Used to drive the Granola-style auto-stop after a configurable silence window.
//
// The detector taps the same MediaStream used by the recorder and analyses
// short frames in the Web Audio AnalyserNode. No model inference, no worker —
// just fast math on the time-domain buffer.

export interface VADOptions {
  /** RMS (0..1) threshold above which a frame is considered voiced. Default 0.02. */
  voiceThreshold?: number;
  /** How long the input must stay below threshold before firing onSilence (ms). Default 1500. */
  silenceHangMs?: number;
  /** Minimum cumulative voiced duration before silence can fire (ms). Default 400. */
  minVoiceMs?: number;
  /** Called each analysis frame with the current RMS level (0..1). */
  onLevel?: (rms: number) => void;
  /** Called once silenceHangMs of silence is observed after some speech. */
  onSilence?: () => void;
  /** Called the first time we detect voice after start(). */
  onSpeechStart?: () => void;
}

export class VADDetector {
  private ctx: AudioContext;
  private analyser: AnalyserNode;
  private source: MediaStreamAudioSourceNode;
  // Typed over a dedicated ArrayBuffer (not ArrayBufferLike) so modern TS
  // lib types accept it in AnalyserNode.getByteTimeDomainData.
  private buf: Uint8Array<ArrayBuffer>;
  private raf = 0;
  private running = false;

  private voiceThreshold: number;
  private silenceHangMs: number;
  private minVoiceMs: number;
  private onLevel?: (rms: number) => void;
  private onSilence?: () => void;
  private onSpeechStart?: () => void;

  private voiceAccumMs = 0;
  private silenceAccumMs = 0;
  private lastTs = 0;
  private speechFired = false;
  private silenceFired = false;

  constructor(stream: MediaStream, opts: VADOptions = {}) {
    this.voiceThreshold = opts.voiceThreshold ?? 0.02;
    this.silenceHangMs = opts.silenceHangMs ?? 1500;
    this.minVoiceMs = opts.minVoiceMs ?? 400;
    this.onLevel = opts.onLevel;
    this.onSilence = opts.onSilence;
    this.onSpeechStart = opts.onSpeechStart;

    const AC = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
    this.ctx = new AC();
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.2;
    this.source = this.ctx.createMediaStreamSource(stream);
    this.source.connect(this.analyser);
    this.buf = new Uint8Array(new ArrayBuffer(this.analyser.fftSize));
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.voiceAccumMs = 0;
    this.silenceAccumMs = 0;
    this.speechFired = false;
    this.silenceFired = false;
    this.lastTs = performance.now();
    const tick = () => {
      if (!this.running) return;
      this.analyser.getByteTimeDomainData(this.buf);
      // Center around 0 (Uint8 is 0..255, 128 == silence) and compute RMS.
      let sum = 0;
      for (let i = 0; i < this.buf.length; i++) {
        const v = (this.buf[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / this.buf.length);
      this.onLevel?.(rms);

      const now = performance.now();
      const dt = now - this.lastTs;
      this.lastTs = now;
      if (rms >= this.voiceThreshold) {
        this.voiceAccumMs += dt;
        this.silenceAccumMs = 0;
        if (!this.speechFired && this.voiceAccumMs >= 80) {
          this.speechFired = true;
          this.onSpeechStart?.();
        }
      } else {
        this.silenceAccumMs += dt;
        if (
          !this.silenceFired &&
          this.voiceAccumMs >= this.minVoiceMs &&
          this.silenceAccumMs >= this.silenceHangMs
        ) {
          this.silenceFired = true;
          this.onSilence?.();
        }
      }
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop() {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  async dispose() {
    this.stop();
    try {
      this.source.disconnect();
    } catch {}
    try {
      await this.ctx.close();
    } catch {}
  }
}
