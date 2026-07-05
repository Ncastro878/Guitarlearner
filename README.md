# 🎸 Fretboard Trainer

A browser-based guitar learning game that **listens to your real guitar through
the microphone** and uses pitch detection to verify the notes you play. No
backend, no accounts, no data leaves your device — the whole thing is a static
site you can host anywhere.

Built with **Vite + React + TypeScript**, **Tailwind CSS**, the **Web Audio
API**, and the **[`pitchy`](https://www.npmjs.com/package/pitchy)** pitch
detector.

---

## Quick start (local dev)

```bash
npm install
npm run dev      # start the dev server (http://localhost:5173)
```

Other scripts:

```bash
npm run build      # type-check + production build → dist/
npm run preview    # serve the production build locally
npm run test       # run the unit tests once (Vitest)
npm run test:watch # watch mode
npm run typecheck  # type-check only
```

> **Microphone note:** browsers only allow microphone access over `https://`
> (or `http://localhost`). The dev server and any HTTPS host both satisfy this.
> Access is requested on a button click — never automatically.

---

## How the pitch detection works (high level)

The core lives in [`src/hooks/usePitchDetection.ts`](src/hooks/usePitchDetection.ts).

1. **Mic access** is requested on a user gesture via `getUserMedia`
   (echo-cancellation / noise-suppression / auto-gain are turned **off** — they
   distort the pitch of a sustained string).
2. Audio is routed into a Web Audio **`AnalyserNode`** with a large FFT buffer
   (**4096 samples** by default) so the low E string (~82 Hz) has enough
   resolution.
3. On every animation frame (~30–60 Hz) we pull the raw **time-domain** samples
   (`getFloatTimeDomainData`) and run them through `pitchy`'s
   `PitchDetector`, which implements the **McLeod Pitch Method (MPM)** — a
   robust monophonic (single-note) detector. It returns a fundamental
   frequency plus a **clarity** score (0–1).
4. The frequency is converted to the **nearest note, octave and cents offset**
   (see the theory library below), and gated:
   - Signals outside the trusted guitar range (~70 Hz – 1400 Hz) are ignored.
   - A **clarity + volume threshold** (driven by the sensitivity setting)
     rejects noise and quiet plucks.
   - A **~150 ms debounce** means a note only "registers" once it's been held
     stably — guitar attack transients are noisy and would otherwise fire
     spurious detections.
5. The hook exposes two views of the signal:
   - **Live values** (`currentNote`, `frequency`, `centsOffset`, `clarity`) —
     updated every frame, powering the always-on **tuner strip**.
   - **`stableNote`** + an `onStableNote` callback — the debounced note the game
     logic reacts to.

The tuner strip is intentionally always visible: it shows exactly what the mic
heard, which builds player trust and makes debugging obvious. To test it, play
a note on a guitar (or an online tone generator) and watch the note name and
cents needle track it.

> **Why MPM / `pitchy` instead of a hand-rolled YIN?** MPM (a close cousin of
> YIN) handles the strong overtones and octave ambiguity of a plucked string
> more reliably out of the box, and `pitchy` is small, dependency-free and
> well-tested. The detection pipeline is isolated in one hook, so swapping in a
> custom YIN implementation later is a one-file change.

---

## Music theory library

[`src/lib/theory.ts`](src/lib/theory.ts) is a **pure, dependency-free,
framework-agnostic** module (no DOM, no React) so it's trivially testable and
reusable. It covers:

- **Note ↔ MIDI ↔ frequency** conversion, with a configurable A4 reference and
  cents offsets.
- **Interval math** — semitone distances and interval names (both directions).
- **Chord spelling** — maj, min, dom7, maj7, m7, dim, aug.
- **Scale generation** — major, natural/harmonic minor, and major/minor
  pentatonics.

Its unit tests are in [`src/lib/theory.test.ts`](src/lib/theory.test.ts)
(run with `npm test`).

---

## Game modes

The app is architected for four modes; the first two ship end-to-end and the
rest are stubbed as "coming soon".

| Mode | Status | What it does |
| --- | --- | --- |
| **🎯 Note Hunt** | ✅ Playable | Prompts you to find a named note anywhere on the neck against a timer. Levels progress: naturals → sharps/flats → string-specific → speed round. Correct note = point + streak; a timeout resets the streak. |
| **🎵 Interval Echo** | ✅ Playable | Plays a root note through the speakers, asks you to play a named interval above it. Levels progress: 3rds/4ths/5ths → 3rds & 6ths → 2nds, 7ths & tritone → full chromatic speed round. The clock only starts after the root finishes ringing, and the root can be replayed any time. |
| **🎸 Arpeggio Gauntlet** | 🚧 Coming soon | Shows a chord symbol; play every chord tone in any order. |
| **🏃 Scale Runner** | 🚧 Coming soon | Run a scale ascending — one wrong note resets the streak. |
| **🧠 Fret Quiz** | ✅ Playable | The reverse quiz — and the one mode that needs **no guitar or mic**. A fret lights up on the neck diagram; name the note before the clock runs out, by tapping a note button or typing A–G (with # / b modifiers). Levels: naturals on E+A strings → D+G → B+high E → the full chromatic neck. |
| **👂 Call & Response** | ✅ Playable | The app plays a short phrase through the speakers; echo it back note by note (first note's name shown as an anchor, the rest is your ear). Levels grow the phrase: 2 notes → 3 → 4 → 4 with wide leaps. Misses reveal the phrase on a fretboard diagram. |
| **🐦 Fret Bird** | ✅ Playable | Flappy-bird-meets-Guitar-Hero: a song's melody scrolls in as pipe gates labelled with the note to play (note names or a mini tab stave — toggleable). Play each note as its gap reaches the bird to flap through; unplayed gates are misses. Songs unlock in difficulty order: Mary Had a Little Lamb → Twinkle Twinkle → Ode to Joy → Happy Birthday. |
| **✨ Aurora** | ✅ Playable | A free-play visualizer, not a drill: pick a key, and a canvas of polyrhythmic orbit rings (one per scale degree, revolving at 3:4:5:… rpm) reacts to what you play. In-key notes erupt colour bursts from their ring and build "flow" that makes the scene bloom; out-of-key notes glitch it — screen shake, red wash, shards. No timer, no fail state. |

Notes are matched by **pitch class** (any octave / string / position), so
"Play a C#" is satisfied by any C# on the instrument. String-specific levels
display a target string but only check the pitch — the string is on the honor
system, since pitch alone can't distinguish which string produced a note. The
same applies to interval direction in Interval Echo: "a 5th above A" is checked
by pitch class (E), so an E below the root also counts. Wrong notes in Interval
Echo show which interval you actually played — a free ear-training hint.

Progress (level unlocks, best streaks, lifetime correct counts) and settings
(A4 reference, input sensitivity, sound effects, sharp/flat spelling) are
persisted in **`localStorage`**.

---

## Project structure

```
src/
  lib/
    theory.ts          # pure music-theory library (+ theory.test.ts)
    guitar.ts          # standard tuning & trusted pitch range
    tones.ts           # tiny Web Audio synth for feedback / reference tones
  hooks/
    usePitchDetection.ts  # the core audio engine
  store/
    storage.ts         # defensive localStorage helpers
    settings.ts        # persisted settings (A4, sensitivity, …)
    progress.ts        # persisted per-mode unlocks & streaks
  components/
    TunerStrip.tsx     # always-on "what the mic heard" readout
    Home.tsx           # mode select + mic gate + settings
    SettingsPanel.tsx  # settings modal
    GameShell.tsx      # shared in-game layout (header + tuner)
    Fretboard.tsx      # reusable SVG neck diagram with position highlights
    ComingSoon.tsx     # placeholder for modes 3–4
  game/
    noteHunt.ts        # pure level defs & target logic (+ noteHunt.test.ts)
    NoteHunt.tsx       # Note Hunt game mode
    intervalEcho.ts    # pure level defs & target logic (+ intervalEcho.test.ts)
    IntervalEcho.tsx   # Interval Echo game mode
    aurora.ts          # pure key/degree/ring logic (+ aurora.test.ts)
    auroraEngine.ts    # framework-free canvas renderer (particles, orbits)
    Aurora.tsx         # Aurora free-play visualizer
    songFlight.ts      # pure song data, timing & judging (+ songFlight.test.ts)
    songFlightEngine.ts # framework-free canvas renderer (pipes, bird)
    SongFlight.tsx     # Fret Bird song mode
    callResponse.ts    # pure phrase generation & matching (+ callResponse.test.ts)
    CallResponse.tsx   # Call & Response ear-training mode
    fretQuiz.ts        # pure question generation (+ fretQuiz.test.ts)
    FretQuiz.tsx       # Fret Quiz — name the lit fret (no mic needed)
  App.tsx              # screen router + shared pitch engine wiring
  main.tsx
```

---

## Deploying to Vercel (one step)

This is a fully client-side static app, so no configuration is needed:

1. Push the repo to GitHub.
2. In Vercel, **New Project → import the repo**. Vercel auto-detects Vite and
   uses **Build Command `npm run build`** and **Output Directory `dist`**.
3. Deploy. That's it — free tier, no backend, no environment variables.

(The same `dist/` folder works on Netlify, GitHub Pages, Cloudflare Pages, or
any static host.)

---

## Privacy

Audio is analysed **entirely in your browser**. Nothing is recorded, stored, or
sent anywhere. There is no server.
