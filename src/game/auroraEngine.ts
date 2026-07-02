/**
 * auroraEngine.ts — the canvas renderer behind the Aurora visualizer.
 *
 * Framework-free: the React component owns a <canvas>, constructs an engine
 * around it, and calls `pulse()` / `dissonance()` as notes arrive. Everything
 * else — the starfield, the polyrhythmic orbit rings, particles, ripples,
 * screen shake and the global "flow" level — lives in the per-frame loop
 * here.
 *
 * Rendering notes:
 * - Each frame paints a translucent dark rect instead of clearing, so bright
 *   marks leave fading trails (cheap motion blur / glow persistence).
 * - Bursts and comets draw with `globalCompositeOperation = "lighter"` for
 *   additive neon blending.
 * - "Flow" (0–1) rises with consecutive in-key notes and collapses on a
 *   dissonant one; it drives ring saturation, star brightness and comet
 *   trail length, so the whole scene visibly blooms while you stay in key.
 */

import type { OrbitRing } from "./aurora";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number; // seconds remaining
  maxLife: number;
  size: number;
  hue: number;
  sat: number;
  light: number;
  /** "dot" = round glow, "shard" = jagged streak (dissonance). */
  kind: "dot" | "shard";
  angle: number;
  spin: number;
}

interface Ripple {
  x: number;
  y: number;
  r: number;
  vr: number;
  life: number;
  maxLife: number;
  hue: number;
}

interface Star {
  x: number; // 0–1, fraction of width
  y: number; // 0–1, fraction of height
  size: number;
  phase: number;
  speed: number;
}

const MAX_PARTICLES = 700;
const STAR_COUNT = 90;
const FLOW_DECAY_PER_S = 0.045;
const FLOW_PER_PULSE = 0.14;

export class AuroraEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private rings: OrbitRing[] = [];
  private flares: number[] = [];
  private particles: Particle[] = [];
  private ripples: Ripple[] = [];
  private stars: Star[] = [];
  private flow = 0;
  private shake = 0;
  private dissonanceFlash = 0;
  private raf: number | null = null;
  private lastT: number | null = null;
  private elapsed = 0;
  private width = 0;
  private height = 0;
  private dpr = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas is not supported");
    this.ctx = ctx;
    this.seedStars();
    this.resize();
  }

  setRings(rings: OrbitRing[]): void {
    this.rings = rings;
    this.flares = rings.map(() => 0);
  }

  /** Match the backing store to the element's CSS size (call on resize). */
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
      this.frame(t);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    if (this.raf !== null) cancelAnimationFrame(this.raf);
    this.raf = null;
    this.lastT = null;
  }

  /**
   * An in-key note: flare the degree's ring and erupt a burst + ripple from
   * wherever its comet is right now. `scale` sizes the burst (low notes big).
   */
  pulse(ringIndex: number, hue: number, scale = 1): void {
    const ring = this.rings[ringIndex];
    if (!ring) return;
    this.flares[ringIndex] = 1;
    this.flow = Math.min(1, this.flow + FLOW_PER_PULSE);

    const { x, y } = this.cometPosition(ring);
    const count = Math.round(38 * scale);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (30 + Math.random() * 170) * scale;
      this.spawn({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0.8 + Math.random() * 1.2 * scale,
        maxLife: 2,
        size: (1.2 + Math.random() * 2.6) * scale,
        hue: hue + (Math.random() * 30 - 15),
        sat: 90,
        light: 60 + Math.random() * 25,
        kind: "dot",
        angle: 0,
        spin: 0,
      });
    }
    this.ripples.push({
      x,
      y,
      r: 6,
      vr: 160 * scale,
      life: 1.1,
      maxLife: 1.1,
      hue,
    });
  }

  /** An out-of-key note: shake, red flash, gray shards, flow collapses. */
  dissonance(): void {
    this.flow *= 0.35;
    this.shake = 9;
    this.dissonanceFlash = 1;
    const cx = this.width / 2;
    const cy = this.height / 2;
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 60 + Math.random() * 240;
      this.spawn({
        x: cx + (Math.random() - 0.5) * this.width * 0.5,
        y: cy + (Math.random() - 0.5) * this.height * 0.5,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0.5 + Math.random() * 0.5,
        maxLife: 1,
        size: 6 + Math.random() * 14,
        hue: 355,
        sat: 15 + Math.random() * 45,
        light: 40,
        kind: "shard",
        angle: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 10,
      });
    }
  }

  // --- internals -----------------------------------------------------------

  private seedStars(): void {
    this.stars = Array.from({ length: STAR_COUNT }, () => ({
      x: Math.random(),
      y: Math.random(),
      size: 0.5 + Math.random() * 1.4,
      phase: Math.random() * Math.PI * 2,
      speed: 0.3 + Math.random() * 0.8,
    }));
  }

  private spawn(p: Particle): void {
    if (this.particles.length >= MAX_PARTICLES) {
      this.particles.splice(0, this.particles.length - MAX_PARTICLES + 1);
    }
    this.particles.push(p);
  }

  private cometPosition(ring: OrbitRing): { x: number; y: number } {
    const cx = this.width / 2;
    const cy = this.height / 2;
    const sceneR = Math.min(this.width, this.height) * 0.46;
    const a = ring.speed * this.elapsed - Math.PI / 2;
    return {
      x: cx + Math.cos(a) * sceneR * ring.radiusFrac,
      y: cy + Math.sin(a) * sceneR * ring.radiusFrac,
    };
  }

  private frame(t: number): void {
    const dt = this.lastT === null ? 1 / 60 : Math.min(0.05, (t - this.lastT) / 1000);
    this.lastT = t;
    this.elapsed += dt;

    this.flow = Math.max(0, this.flow - FLOW_DECAY_PER_S * dt);
    this.shake = Math.max(0, this.shake - 30 * dt);
    this.dissonanceFlash = Math.max(0, this.dissonanceFlash - 2.2 * dt);
    for (let i = 0; i < this.flares.length; i++) {
      this.flares[i] = Math.max(0, this.flares[i] - 1.6 * dt);
    }

    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // Trail fade instead of a hard clear — this is what makes it glow.
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "rgba(2, 6, 23, 0.28)";
    ctx.fillRect(0, 0, this.width, this.height);

    if (this.shake > 0) {
      ctx.translate(
        (Math.random() - 0.5) * this.shake,
        (Math.random() - 0.5) * this.shake,
      );
    }

    this.drawStars(ctx);
    this.drawRings(ctx);
    this.drawRipples(ctx, dt);
    this.drawParticles(ctx, dt);

    // Dissonance = a brief blood-red vignette wash over everything.
    if (this.dissonanceFlash > 0) {
      ctx.globalCompositeOperation = "source-over";
      const g = ctx.createRadialGradient(
        this.width / 2,
        this.height / 2,
        Math.min(this.width, this.height) * 0.2,
        this.width / 2,
        this.height / 2,
        Math.max(this.width, this.height) * 0.7,
      );
      g.addColorStop(0, "rgba(127, 20, 30, 0)");
      g.addColorStop(1, `rgba(127, 20, 30, ${0.5 * this.dissonanceFlash})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, this.width, this.height);
    }
  }

  private drawStars(ctx: CanvasRenderingContext2D): void {
    ctx.globalCompositeOperation = "lighter";
    const bright = 0.25 + this.flow * 0.55;
    for (const s of this.stars) {
      const tw = 0.5 + 0.5 * Math.sin(this.elapsed * s.speed + s.phase);
      ctx.fillStyle = `rgba(190, 210, 255, ${bright * tw * 0.6})`;
      ctx.beginPath();
      ctx.arc(s.x * this.width, s.y * this.height, s.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawRings(ctx: CanvasRenderingContext2D): void {
    const cx = this.width / 2;
    const cy = this.height / 2;
    const sceneR = Math.min(this.width, this.height) * 0.46;
    ctx.globalCompositeOperation = "lighter";

    for (let i = 0; i < this.rings.length; i++) {
      const ring = this.rings[i];
      const flare = this.flares[i];
      const r = sceneR * ring.radiusFrac;
      const sat = 40 + this.flow * 45;

      // The orbit path.
      ctx.strokeStyle = `hsla(${ring.hue}, ${sat}%, 60%, ${0.08 + flare * 0.45})`;
      ctx.lineWidth = 1 + flare * 2;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();

      // The comet: a glowing head plus a trailing arc whose length grows
      // with flow — the polyrhythm becomes more visible as you play well.
      const a = ring.speed * this.elapsed - Math.PI / 2;
      const trail = 0.5 + this.flow * 1.6 + flare * 0.8;
      const grad = ctx.createLinearGradient(
        cx + Math.cos(a - trail) * r,
        cy + Math.sin(a - trail) * r,
        cx + Math.cos(a) * r,
        cy + Math.sin(a) * r,
      );
      grad.addColorStop(0, `hsla(${ring.hue}, 90%, 65%, 0)`);
      grad.addColorStop(1, `hsla(${ring.hue}, 90%, 65%, ${0.5 + flare * 0.5})`);
      ctx.strokeStyle = grad;
      ctx.lineWidth = 2.5 + flare * 2.5;
      ctx.beginPath();
      ctx.arc(cx, cy, r, a - trail, a);
      ctx.stroke();

      const hx = cx + Math.cos(a) * r;
      const hy = cy + Math.sin(a) * r;
      ctx.fillStyle = `hsla(${ring.hue}, 95%, ${70 + flare * 20}%, ${0.85})`;
      ctx.beginPath();
      ctx.arc(hx, hy, 2.5 + flare * 4 + this.flow * 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawRipples(ctx: CanvasRenderingContext2D, dt: number): void {
    ctx.globalCompositeOperation = "lighter";
    this.ripples = this.ripples.filter((rp) => {
      rp.life -= dt;
      if (rp.life <= 0) return false;
      rp.r += rp.vr * dt;
      rp.vr *= 1 - 1.2 * dt;
      const alpha = (rp.life / rp.maxLife) * 0.5;
      ctx.strokeStyle = `hsla(${rp.hue}, 90%, 70%, ${alpha})`;
      ctx.lineWidth = 2.5 * (rp.life / rp.maxLife) + 0.5;
      ctx.beginPath();
      ctx.arc(rp.x, rp.y, rp.r, 0, Math.PI * 2);
      ctx.stroke();
      return true;
    });
  }

  private drawParticles(ctx: CanvasRenderingContext2D, dt: number): void {
    ctx.globalCompositeOperation = "lighter";
    this.particles = this.particles.filter((p) => {
      p.life -= dt;
      if (p.life <= 0) return false;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - 1.1 * dt;
      p.vy = p.vy * (1 - 1.1 * dt) + 18 * dt; // gentle drift downwards
      p.angle += p.spin * dt;

      const a = Math.min(1, p.life / (p.maxLife * 0.6));
      if (p.kind === "dot") {
        ctx.fillStyle = `hsla(${p.hue}, ${p.sat}%, ${p.light}%, ${a})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.strokeStyle = `hsla(${p.hue}, ${p.sat}%, ${p.light}%, ${a * 0.9})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(
          p.x - Math.cos(p.angle) * p.size,
          p.y - Math.sin(p.angle) * p.size,
        );
        ctx.lineTo(
          p.x + Math.cos(p.angle) * p.size,
          p.y + Math.sin(p.angle) * p.size,
        );
        ctx.stroke();
      }
      return true;
    });
  }
}
