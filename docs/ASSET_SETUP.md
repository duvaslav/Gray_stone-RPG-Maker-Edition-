# Asset setup

## Why nothing is in the repository

This repository is public. The RPG Maker MZ **core scripts** (`js/rmmz_*.js`),
the **Company Assets** shipped with the engine (`img/`, `audio/`, `effects/`,
fonts, the deployment shell) and the runtime itself are licensed to the holder
of an RPG Maker MZ licence. That licence permits using them in games you make;
it does not make them public-domain material that can be redistributed in a
public repository.

So they are excluded by `.gitignore` and hydrated locally instead. The licence
covers your local copy.

**Do not** fetch these files from GitHub mirrors, asset dumps or "RTP download"
sites. A file being easy to find does not make it redistributable, and a public
repository that contains them creates a licensing problem for everyone who
clones it.

## What you need

RPG Maker MZ, installed, with a NewData template or any project you have created
in the editor. Typical locations:

| Platform | Path |
|---|---|
| Windows | `C:\Program Files\KADOKAWA\RPGMZ\NewData` |
| Steam | `…/steamapps/common/RPG Maker MZ/NewData` |
| macOS | `/Applications/RPG Maker MZ.app/Contents/Resources/app.nw/NewData` |

## Procedure

```bash
tools/hydrate_assets.sh /path/to/RPGMZ/NewData
node tools/build/index.js
node tools/validate/validate.js
node tools/verify_assets.js
```

The hydration script copies the runtime, art, audio and deployment shell, plus
**`data/Tilesets.json`** — the one data file that must travel with the art,
because it pairs the vendor's 8192 passability flags with the vendor's tilesets.
Without it the project keeps synthesized flags and real trees, fences and walls
become walkable (defect D-13).

It deliberately does **not** copy:

- the rest of `data/` — Gray Stone's database and both maps are generated, and
  the template's `data/` would destroy them;
- `js/plugins.js` — that file lists the Gray Stone plugins; it is project
  source, not a Company Asset.

Check which flags the project is using:

```
node tools/validate/validate.js
```

`TILESET_FLAGS_STOCK` means the vendor's passability is in place.
`TILESET_FLAGS_SYNTHESIZED` alongside present art is a hard error.

## What the project currently references

`node tools/verify_assets.js` prints the exact list. As of now: **44 distinct
references**, every one a standard MZ NewData name.

| Folder | Files |
|---|---|
| `img/tilesets` | `Outside_A1…A5`, `Outside_B`, `Outside_C`, `Inside_A1`, `Inside_A2`, `Inside_A4`, `Inside_A5`, `Inside_B`, `Inside_C`, `Dungeon_*`, `World_*` |
| `img/characters` | `Actor1`, `People1`, `People2`, `!Door1`, `Vehicle` |
| `img/faces` | `Actor1`, `People1` |
| `audio/bgm` | `Theme1`, `Theme2`, `Theme4`, `Theme5`, `Theme6`, `Darkness` |
| `audio/bgs` | `Wind2`, `Darkness` |
| `audio/me` | `Mystery` |
| `audio/se` | `Sand`, `Horse`, `Crow`, `Door2` |

No external or purchased asset is required. The project's asset budget is
**zero mandatory external assets**, as the design rules require.

## After hydrating: confirming the guessed slots

Three kinds of binding were authored without being able to look at the art, and
each entry records how much confidence it carries:

| Flag | Meaning |
|---|---|
| `CALCULATED` | follows from the engine's own tile-ID arithmetic. Certain. |
| `SPEC` | the workbook names this exact value. |
| `ASSUMED` | plausible, **not** checked against the real file. |

`tools/data/tile-bindings.json` currently carries **36 ASSUMED entries** — mostly
which cell of `Outside_B` / `Inside_B` is a hedge, a lamp, a bookcase and so on.
The workbook itself marks these `VISUAL_SLOT_VERIFY_IN_PROJECT`, so this is a
known, expected step rather than a defect.

To confirm them, render the contact sheets:

```bash
node tools/pick_tiles.js
```

This writes `tools/out/tiles-<sheet>.html` for every sheet the project uses. Each
cell is tagged with its `col,row` and numeric tile id, bordered by the
passability the project will actually read (red solid, blue drawn-above-player,
grey passable), and outlined in gold where a binding currently points. Read off
the correct `col,row` for each object, correct the bindings file, set
`"verify": "CONFIRMED"`, then:

```bash
node tools/build/index.js
```

The maps are repainted from the corrected bindings. **Never hand-edit a
`MapXXX.json`** — it is generated output and the next build will overwrite it.

Getting a slot wrong is a cosmetic problem, not a structural one: passability is
derived from the same bindings file, so a mis-chosen tile is still solid if it
was declared solid, and the reachability guarantees in `docs/QA.md` continue to
hold.

## Deployment

Deploy from the RPG Maker MZ editor (Game → Deployment). The exclusion rules in
`.gitignore` do not affect a deployment — by then the assets are present
locally, and the deployed build is yours to distribute under the RPG Maker MZ
licence terms.
