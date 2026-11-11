# RIGHOP (working title)

An original first-person platformer: run and jump across a convoy of moving trucks. Touching
anything that is not a truck fails the run.

## Run

```bash
npm install
npm run dev
```

Open the printed localhost URL and press Play. Keys can be changed under Settings.

| Input       | Action                                                                                                |
| ----------- | ----------------------------------------------------------------------------------------------------- |
| W A S D     | Move                                                                                                  |
| Shift       | Sprint                                                                                                |
| Space       | Jump (hold for full height, tap for a low jump). Against a truck side: hold to climb, tap to kick off |
| Left mouse  | Movement ability                                                                                      |
| Right mouse | Utility ability                                                                                       |
| R           | Restart (after failing, any key restarts)                                                             |
| Esc         | Pause (releases the mouse)                                                                            |
| M           | Mute music                                                                                            |
| F3          | Debug overlay                                                                                         |
| Gamepad     | Left stick move, right stick look, A jump, LB or L3 sprint, RT / LT abilities, Start pause, Y restart |

URL parameters: `?seed=123` fixed seed, `?god=1` no falling-off reset, `?debug=1` overlay open,
`?level=<id>` (test levels: `convoy`, `block`, `hazards`, `single`), `?unlock=1` (all levels open), `?abilities=all` (every
ability unlocked for the session, nothing saved), `?equip=towLine,slowLane`.

Levels are JSON files in `src/level/data/`. A file with mistakes is listed in the level
select screen together with what is wrong in it.

## Other commands

```bash
npm run test
npm run lint
npm run build
npm run preview
```

Gameplay numbers are in `src/config/tuning.ts`; changes are logged in `TUNING.md`.
