# Claude Code project notes

## Workflow (owner-confirmed)

- Develop on the session's designated `claude/*` working branch.
- Before pushing: `npm test` and `npm run build` must both pass.
- **After finishing a feature, merge to the default branch without asking**:
  open a PR from the working branch into the default branch and merge it.
  The owner confirmed this standing routine — Vercel deploys the default
  branch, and features aren't "done" until they show up there.
- The default branch is `claude/guitar-learning-game-ghhsme` (there is no
  `main`).

## Architecture conventions

- Each game mode splits into a pure, unit-tested logic module
  (`src/game/<mode>.ts` + `<mode>.test.ts`) and a React component
  (`src/game/<Mode>.tsx`). Heavy per-frame rendering lives in
  framework-free classes (see `auroraEngine.ts`), not React state.
- Modes register with the shared pitch engine via
  `pitch.registerNoteHandler` and record results through the progress
  store (`src/store/progress.ts`). New mode ids added to
  `DEFAULT_PROGRESS` upgrade existing saved progress automatically
  (`loadJSON` merges defaults).
- Remaining stubbed modes: Arpeggio Gauntlet, Scale Runner.
