# RIGHOP (working title)

An original first-person platformer: run and jump across a convoy of moving trucks. Touching
anything that is not a truck fails the run.

## Run

```bash
npm install
npm run dev
```

Open the printed localhost URL and click to play.

| Key     | Action                                          |
| ------- | ----------------------------------------------- |
| W A S D | Move                                            |
| Shift   | Sprint                                          |
| Space   | Jump (hold for full height, tap for a low jump) |
| R       | Restart                                         |
| Esc     | Pause (releases the mouse)                      |
| F3      | Debug overlay                                   |

URL parameters: `?seed=123` fixed seed, `?god=1` no falling-off reset, `?debug=1` overlay open,
`?level=convoy` (default), `?level=block` (obstacle on the road), `?level=single` (one truck).

## Other commands

```bash
npm run test
npm run lint
npm run build
npm run preview
```

Gameplay numbers are in `src/config/tuning.ts`; changes are logged in `TUNING.md`.
