/**
 * tones.ts — a tiny Web Audio synth for game feedback and reference pitches.
 *
 * We lazily create a single shared AudioContext (resumed on first use, since
 * browsers require a user gesture) and schedule short enveloped oscillator
 * tones. This is completely independent of the microphone / pitch-detection
 * pipeline.
 */

let ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!ctx) {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    ctx = new Ctor();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

export interface ToneOptions {
  /** Frequency in Hz. */
  frequency: number;
  /** Duration in seconds (default 0.6). */
  duration?: number;
  /** Oscillator type (default "sine"). */
  type?: OscillatorType;
  /** Peak gain 0–1 (default 0.2). */
  gain?: number;
  /** Delay before the tone starts, in seconds (default 0). */
  when?: number;
}

/** Play a single enveloped tone. Returns when it is scheduled (not finished). */
export function playTone({
  frequency,
  duration = 0.6,
  type = "sine",
  gain = 0.2,
  when = 0,
}: ToneOptions): void {
  const audio = getCtx();
  const start = audio.currentTime + when;

  const osc = audio.createOscillator();
  const env = audio.createGain();
  osc.type = type;
  osc.frequency.value = frequency;

  // Simple attack/decay envelope to avoid clicks.
  env.gain.setValueAtTime(0.0001, start);
  env.gain.exponentialRampToValueAtTime(gain, start + 0.02);
  env.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  osc.connect(env).connect(audio.destination);
  osc.start(start);
  osc.stop(start + duration + 0.05);
}

/** A short, bright confirmation "ding" (rising two-note chime). */
export function playSuccess(): void {
  playTone({ frequency: 880, duration: 0.12, type: "triangle", gain: 0.18 });
  playTone({
    frequency: 1318.51,
    duration: 0.22,
    type: "triangle",
    gain: 0.18,
    when: 0.1,
  });
}

/** A soft low "buzz" for a wrong / missed note. */
export function playError(): void {
  playTone({ frequency: 174.61, duration: 0.28, type: "sawtooth", gain: 0.12 });
}

/**
 * Play a reference pitch (used by Interval Echo and for ear-training hints).
 */
export function playReference(frequency: number, duration = 0.8): void {
  playTone({ frequency, duration, type: "sine", gain: 0.22 });
}

/**
 * Best-effort resume of the shared context on a user gesture. Safe to call
 * repeatedly.
 */
export function warmUpAudio(): void {
  getCtx();
}
