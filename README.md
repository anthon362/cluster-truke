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

## Level editor

**Level Editor** on the main menu opens a map of a level seen from above.

- **Add** puts a new thing in the middle of the view: scenery boxes, every hazard, road points,
  extra roads and convoys. **Open a copy of…** starts from any level of the game.
- Drag a thing to move it, drag empty space to pan, use the wheel to zoom. Delete removes the
  selected thing, Ctrl+Z undoes.
- The panel on the right shows every setting of the selected thing (or of the level when
  nothing is selected). Optional settings appear as `+ name` buttons.
- **Problems** lists what the game's own level check says, as you edit. **Play** is enabled
  when there are none; quitting the level comes back to the editor. Levels from the editor earn
  no points and save no times.
- **Export file** downloads the level as JSON, **Import file** opens one. The format is exactly
  that of the files in `src/level/data/`: put an exported file in a world's folder and give it
  an id like `3-7` to make it part of the campaign.
- The draft is kept in the browser between visits.

The player looks up the map, so their left is on the map's right.

## Release

```bash
npm run check
npm run package
```

`check` runs formatting, type check, lint and every test. `package` builds the game and writes
`release/righop-<version>-web.zip` (about 1.4 MB). The zip has `index.html` at its top and loads
everything by relative path, so it can be unpacked into any folder of a static web host or
uploaded as it is to a web game portal. There is no server part. The version on the menu comes
from `package.json`.

The tests also write three reports (not committed): `dockyard-report.txt` and
`worlds-report.txt` (each level finished without abilities), `campaign-report.txt` (par time
against the fastest scripted run) and `performance-report.txt` (simulation cost of the largest
level).

## Other commands

```bash
npm run test
npm run lint
npm run build
npm run preview
```

Gameplay numbers are in `src/config/tuning.ts`; changes are logged in `TUNING.md`.
