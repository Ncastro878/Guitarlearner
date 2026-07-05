/**
 * songFlightEngine.ts — the canvas renderer + game clock behind Fret Bird.
 *
 * Framework-free, same split as auroraEngine: the React component owns the
 * <canvas>, score state and phase transitions; this class owns the clock,
 * the per-frame drawing (pipes, bird, particles) and the judging plumbing.
 * The component feeds detected notes in via `handlePitch` and hears results
 * back through callbacks.
 *
 * Scene: the bird hovers at a fixed x; each song note is a pair of pipes
 * with a gap whose height maps to pitch (higher note = higher gap) and a
 * label (note name or a mini tab stave). Pipes scroll left; play the right
 * note while a gap crosses the bird and it flaps through in a burst of
 * sparks. Miss and the pipe flushes red, the screen bumps, the bird dips.
 */

import { pitchClassName, type DetectedNote } from "../lib/theory";
import { playTick } from "../lib/tones";
import {
  LEAD_BEATS,
  judgeNote,
  noteTimeS,
  noteToTab,
  secondsPerBeat,
  songEndS,
  sweepMisses,
  type NoteState,
  type Song,
} from "./songFlight";

export type SongDisplayMode = "note" | "tab";

export interface SongFlightCallbacks {
  onHit: (index: number) => void;
  onMiss: (index: number) => void;
  onWrong: (note: DetectedNote) => void;
  onEnd: () => void;
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  hue: number;
}

const BIRD_X_FRAC = 0.28;
const GAP_H = 92;
const PIPE_W = 58;
/** Horizontal pixels one beat occupies (scroll speed = this / secondsPerBeat). */
const PX_PER_BEAT = 150;

export class SongFlightEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private song: Song;
  private cb: SongFlightCallbacks;
  private displayMode: SongDisplayMode;
  private useFlats: boolean;
  private metronome: boolean;
  private lastBeat = -1;

  private states: NoteState[];
  private sparks: Spark[] = [];
  private flash: { kind: "hit" | "miss"; t: number } | null = null;
  private shake = 0;
  private birdY: number | null = null;
  private birdVy = 0;
  private wobblePhase = 0;
  private ended = false;

  private raf: number | null = null;
  private startT: number | null = null;
  private lastT: number | null = null;
  private width = 0;
  private height = 0;
  private dpr = 1;

  constructor(
    canvas: HTMLCanvasElement,
    song: Song,
    displayMode: SongDisplayMode,
    useFlats: boolean,
    metronome: boolean,
    cb: SongFlightCallbacks,
  ) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas is not supported");
    this.ctx = ctx;
    this.song = song;
    this.displayMode = displayMode;
    this.useFlats = useFlats;
    this.metronome = metronome;
    this.cb = cb;
    this.states = song.notes.map(() => "pending");
    this.resize();
  }

  setDisplayMode(mode: SongDisplayMode): void {
    this.displayMode = mode;
  }

  setMetronome(on: boolean): void {
    this.metronome = on;
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.width = Math.max(1, rect.width);
    this.height = Math.max(1, rect.height);
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
  }

  start(): void {
    if (this.raf !== null) return;
    const loop = (t: number) => {
      if (this.startT === null) this.startT = t;
      this.frame(t);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    if (this.raf !== null) cancelAnimationFrame(this.raf);
    this.raf = null;
  }

  /** Seconds into the run (starts at 0; first note lands at LEAD_IN_S). */
  private elapsed(t: number): number {
    return this.startT === null ? 0 : (t - this.startT) / 1000;
  }

  /** Feed a detected (debounced) note from the pitch engine. */
  handlePitch(note: DetectedNote): void {
    if (this.ended || this.startT === null || this.lastT === null) return;
    const now = this.elapsed(this.lastT);
    const j = judgeNote(this.song, this.states, now, note.pitchClass);
    if (j.kind === "hit") {
      this.states[j.index] = "hit";
      this.flash = { kind: "hit", t: 1 };
      this.birdVy = -140; // flap!
      this.spawnSparks(this.gapY(j.index), 45 + (this.song.notes[j.index].midi % 12) * 24);
      this.cb.onHit(j.index);
    } else if (j.kind === "wrong") {
      this.cb.onWrong(note);
    }
  }

  // --- geometry ------------------------------------------------------------

  private midiRange(): { lo: number; hi: number } {
    let lo = Infinity;
    let hi = -Infinity;
    for (const n of this.song.notes) {
      lo = Math.min(lo, n.midi);
      hi = Math.max(hi, n.midi);
    }
    return { lo, hi: Math.max(hi, lo + 1) };
  }

  /** Vertical centre of a note's gap: higher pitch = higher on screen. */
  private gapY(index: number): number {
    const { lo, hi } = this.midiRange();
    const t = (this.song.notes[index].midi - lo) / (hi - lo);
    const top = this.height * 0.24;
    const bottom = this.height * 0.78;
    return bottom - t * (bottom - top);
  }

  /** X of a note's pipe centre at a moment (bird sits at the hit line). */
  private pipeX(index: number, now: number): number {
    const pxPerS = (PX_PER_BEAT * this.song.bpm) / 60;
    return this.width * BIRD_X_FRAC + (noteTimeS(this.song, index) - now) * pxPerS;
  }

  private spawnSparks(y: number, hue: number): void {
    const x = this.width * BIRD_X_FRAC;
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 40 + Math.random() * 200;
      this.sparks.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 40,
        life: 0.5 + Math.random() * 0.6,
        maxLife: 1.1,
        size: 1.5 + Math.random() * 2.5,
        hue: hue + Math.random() * 40,
      });
    }
  }

  // --- frame -----------------------------------------------------------------

  private frame(t: number): void {
    const dt = this.lastT === null ? 1 / 60 : Math.min(0.05, (t - this.lastT) / 1000);
    this.lastT = t;
    const now = this.elapsed(t);
    this.wobblePhase += dt * 5;

    // The pulse: tick every beat during the count-in (always) and through
    // the song (when the metronome is on), accenting downbeats. This is what
    // locks the player to the song's actual tempo.
    if (!this.ended) {
      const spb = secondsPerBeat(this.song);
      const beat = Math.floor(now / spb);
      if (beat !== this.lastBeat && now <= songEndS(this.song)) {
        this.lastBeat = beat;
        const songBeat = beat - LEAD_BEATS;
        if (songBeat < 0) {
          playTick(beat === 0); // count-in always ticks, first beat accented
        } else if (this.metronome) {
          playTick(songBeat % this.song.meter === 0);
        }
      }
    }

    // Sweep misses and detect the end of the song.
    if (!this.ended) {
      for (const i of sweepMisses(this.song, this.states, now)) {
        this.states[i] = "missed";
        this.flash = { kind: "miss", t: 1 };
        this.shake = 8;
        this.birdVy = 120; // stumble
        this.cb.onMiss(i);
      }
      if (now > songEndS(this.song)) {
        this.ended = true;
        this.cb.onEnd();
      }
    }

    this.shake = Math.max(0, this.shake - 30 * dt);
    if (this.flash) {
      this.flash.t -= dt * 2.5;
      if (this.flash.t <= 0) this.flash = null;
    }

    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // Sky.
    const sky = ctx.createLinearGradient(0, 0, 0, this.height);
    sky.addColorStop(0, "#0b1023");
    sky.addColorStop(1, "#111a35");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, this.width, this.height);

    if (this.shake > 0) {
      ctx.translate(
        (Math.random() - 0.5) * this.shake,
        (Math.random() - 0.5) * this.shake,
      );
    }

    this.drawClouds(ctx, now);
    this.drawGround(ctx, now);
    this.drawPipes(ctx, now);
    this.drawBird(ctx, dt);
    this.drawSparks(ctx, dt);
    this.drawHud(ctx, now);

    if (this.flash) {
      ctx.fillStyle =
        this.flash.kind === "hit"
          ? `rgba(52, 211, 153, ${0.12 * this.flash.t})`
          : `rgba(244, 63, 94, ${0.16 * this.flash.t})`;
      ctx.fillRect(0, 0, this.width, this.height);
    }
  }

  private drawClouds(ctx: CanvasRenderingContext2D, now: number): void {
    ctx.fillStyle = "rgba(148, 163, 184, 0.07)";
    for (let i = 0; i < 5; i++) {
      const w = 90 + i * 34;
      const x =
        this.width - (((now * (12 + i * 5) + i * 240) % (this.width + w)) - w / 2);
      const y = this.height * (0.12 + 0.14 * i);
      ctx.beginPath();
      ctx.ellipse(x, y, w / 2, 13 + i * 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawGround(ctx: CanvasRenderingContext2D, now: number): void {
    const y = this.height - 14;
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(0, y, this.width, 14);
    ctx.strokeStyle = "rgba(52, 211, 153, 0.35)";
    ctx.lineWidth = 2;
    const pxPerS = (PX_PER_BEAT * this.song.bpm) / 60;
    const dashOffset = (now * pxPerS) % 24;
    ctx.setLineDash([12, 12]);
    ctx.lineDashOffset = dashOffset;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(this.width, y);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  private drawPipes(ctx: CanvasRenderingContext2D, now: number): void {
    for (let i = 0; i < this.song.notes.length; i++) {
      const x = this.pipeX(i, now);
      if (x < -PIPE_W || x > this.width + PIPE_W) continue;
      const gy = this.gapY(i);
      const state = this.states[i];

      const body =
        state === "hit"
          ? "rgba(16, 185, 129, 0.55)"
          : state === "missed"
            ? "rgba(244, 63, 94, 0.5)"
            : "rgba(51, 65, 85, 0.9)";
      const edge =
        state === "hit"
          ? "rgba(110, 231, 183, 0.9)"
          : state === "missed"
            ? "rgba(251, 113, 133, 0.9)"
            : "rgba(100, 116, 139, 0.9)";

      const lx = x - PIPE_W / 2;
      const topH = gy - GAP_H / 2;
      const botY = gy + GAP_H / 2;

      // Duration band: held notes ring past their gap, so half notes read
      // longer than quarters and the song's rhythm is visible.
      const durW = this.song.notes[i].dur * PX_PER_BEAT;
      if (durW > PIPE_W) {
        ctx.fillStyle =
          state === "missed"
            ? "rgba(244, 63, 94, 0.06)"
            : "rgba(16, 185, 129, 0.08)";
        ctx.fillRect(x, gy - GAP_H / 4, durW - PIPE_W / 2, GAP_H / 2);
      }

      ctx.fillStyle = body;
      ctx.strokeStyle = edge;
      ctx.lineWidth = 2;
      // Top pipe + lip.
      ctx.fillRect(lx, 0, PIPE_W, topH);
      ctx.strokeRect(lx, -2, PIPE_W, topH + 2);
      ctx.fillRect(lx - 5, topH - 12, PIPE_W + 10, 12);
      ctx.strokeRect(lx - 5, topH - 12, PIPE_W + 10, 12);
      // Bottom pipe + lip.
      ctx.fillRect(lx, botY, PIPE_W, this.height - botY);
      ctx.strokeRect(lx, botY, PIPE_W, this.height - botY + 2);
      ctx.fillRect(lx - 5, botY, PIPE_W + 10, 12);
      ctx.strokeRect(lx - 5, botY, PIPE_W + 10, 12);

      // Label in the gap.
      if (state === "pending") {
        if (this.displayMode === "note") this.drawNoteLabel(ctx, i, x, gy);
        else this.drawTabLabel(ctx, i, x, gy);
      } else {
        ctx.font = "bold 20px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = state === "hit" ? "#6ee7b7" : "#fb7185";
        ctx.fillText(state === "hit" ? "✓" : "✕", x, gy);
      }
    }
  }

  private drawNoteLabel(
    ctx: CanvasRenderingContext2D,
    i: number,
    x: number,
    gy: number,
  ): void {
    const midi = this.song.notes[i].midi;
    const name = pitchClassName(((midi % 12) + 12) % 12, this.useFlats);
    const octave = Math.floor(midi / 12) - 1;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "900 26px system-ui, sans-serif";
    ctx.fillStyle = "#f8fafc";
    ctx.fillText(name, x, gy - 4);
    ctx.font = "600 11px system-ui, sans-serif";
    ctx.fillStyle = "#94a3b8";
    ctx.fillText(String(octave), x, gy + 15);
  }

  private drawTabLabel(
    ctx: CanvasRenderingContext2D,
    i: number,
    x: number,
    gy: number,
  ): void {
    const tab = noteToTab(this.song.notes[i].midi);
    if (!tab) return;
    const w = 40;
    const spacing = 6;
    const top = gy - (spacing * 5) / 2;
    ctx.strokeStyle = "rgba(148, 163, 184, 0.55)";
    ctx.lineWidth = 1;
    for (let s = 0; s < 6; s++) {
      const y = top + s * spacing;
      ctx.beginPath();
      ctx.moveTo(x - w / 2, y);
      ctx.lineTo(x + w / 2, y);
      ctx.stroke();
    }
    // Fret number sits on its string's line (string 1 = top line, like tab).
    const y = top + (tab.string - 1) * spacing;
    ctx.font = "900 13px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const tw = ctx.measureText(String(tab.fret)).width + 6;
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(x - tw / 2, y - 7, tw, 14);
    ctx.fillStyle = "#fbbf24";
    ctx.fillText(String(tab.fret), x, y);
  }

  private drawBird(ctx: CanvasRenderingContext2D, dt: number): void {
    const bx = this.width * BIRD_X_FRAC;

    // Aim at the next pending note's gap; hover mid-screen when done.
    let target = this.height * 0.5;
    for (let i = 0; i < this.song.notes.length; i++) {
      if (this.states[i] === "pending") {
        target = this.gapY(i);
        break;
      }
    }
    if (this.birdY === null) this.birdY = target;
    this.birdVy *= 1 - 4 * dt;
    this.birdY += (target - this.birdY) * Math.min(1, dt * 3.2) + this.birdVy * dt;
    const by = this.birdY + Math.sin(this.wobblePhase) * 3;

    // Body.
    ctx.fillStyle = "#fbbf24";
    ctx.strokeStyle = "#b45309";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(bx, by, 14, 11, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Wing (flaps with the wobble).
    ctx.fillStyle = "#f59e0b";
    ctx.beginPath();
    ctx.ellipse(
      bx - 4,
      by + Math.sin(this.wobblePhase * 2.2) * 3,
      7,
      4.5,
      -0.5,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    // Eye + beak.
    ctx.fillStyle = "#0f172a";
    ctx.beginPath();
    ctx.arc(bx + 6, by - 3, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fb923c";
    ctx.beginPath();
    ctx.moveTo(bx + 13, by - 1);
    ctx.lineTo(bx + 20, by + 1);
    ctx.lineTo(bx + 13, by + 4);
    ctx.closePath();
    ctx.fill();
  }

  private drawSparks(ctx: CanvasRenderingContext2D, dt: number): void {
    ctx.globalCompositeOperation = "lighter";
    this.sparks = this.sparks.filter((p) => {
      p.life -= dt;
      if (p.life <= 0) return false;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 150 * dt;
      const a = Math.min(1, p.life / (p.maxLife * 0.5));
      ctx.fillStyle = `hsla(${p.hue}, 95%, 65%, ${a})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      return true;
    });
    ctx.globalCompositeOperation = "source-over";
  }

  private drawHud(ctx: CanvasRenderingContext2D, now: number): void {
    // Song progress across the top.
    const total = songEndS(this.song);
    const frac = Math.min(1, Math.max(0, now / total));
    ctx.fillStyle = "rgba(30, 41, 59, 0.9)";
    ctx.fillRect(0, 0, this.width, 4);
    ctx.fillStyle = "rgba(52, 211, 153, 0.9)";
    ctx.fillRect(0, 0, this.width * frac, 4);

    // Hit line under the bird.
    const bx = this.width * BIRD_X_FRAC;
    ctx.strokeStyle = "rgba(148, 163, 184, 0.18)";
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.moveTo(bx, 8);
    ctx.lineTo(bx, this.height - 14);
    ctx.stroke();
    ctx.setLineDash([]);

    // Count-in before the first note, in beats at the song's tempo (the
    // first note lands right on the next downbeat).
    const spb = secondsPerBeat(this.song);
    const beatsNow = now / spb;
    if (beatsNow < LEAD_BEATS) {
      ctx.font = "900 52px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "rgba(248, 250, 252, 0.85)";
      ctx.fillText(
        String(Math.ceil(LEAD_BEATS - beatsNow)),
        this.width / 2,
        this.height * 0.38,
      );
      ctx.font = "600 12px system-ui, sans-serif";
      ctx.fillStyle = "rgba(148, 163, 184, 0.8)";
      ctx.fillText(
        `${this.song.bpm} bpm`,
        this.width / 2,
        this.height * 0.38 + 40,
      );
    }
  }
}
