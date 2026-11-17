# Working agreements

- **Boundaries.** `src/core` is pure domain logic: no React, no DOM or browser APIs, no imports
  from `src/app` or `src/storage` (enforced by ESLint and a DOM-free tsconfig). It must run in
  Node. `src/storage` and `src/app` may import core; core never imports them.
- **Time.** Durations are integer minutes. Clock times are UTC ISO strings.
- **Privacy.** Never commit real logbook data or personal names (crew names appear in exports).
  Real exports live only in the gitignored `data/`. Use synthetic data in `fixtures/`.
- **Tests.** Everything in `src/core` requires tests (Vitest, colocated `*.test.ts`).
- **Before finishing**, run: `npm run lint`, `npm run format:check`, `npm run typecheck`,
  `npm test`, `npm run build`.
- **Design.** Decisions live in `docs/DESIGN.md`; update it when behaviour changes.
- **Start here.** `docs/HANDOFF.md` has the current state, known gaps and the next step. Keep it
  current when a milestone lands.
