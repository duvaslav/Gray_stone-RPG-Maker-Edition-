# Architecture

## The one rule

**The spreadsheet is not a database.** Nothing in the running game reads it. The
workbook is a source specification, extracted once into `spec/*.json`, and
build-time generators turn that into ordinary RPG Maker JSON. At runtime there
is only an MZ project.

```
Gray Stone.xlsx
      │  python3 tools/extract_workbook.py
      ▼
  spec/*.json          69 sheets, committed so builds are reproducible
      │  node tools/build/index.js
      ▼
  data/*.json          the game: database, common events, maps
  js/plugins/*.js      hand-written, not generated
```

`data/` is **generated output**. Editing a `MapXXX.json` by hand is always wrong;
the next build overwrites it. Fix the generator or the bindings file.

## Layout

```
spec/                     extracted workbook (source specification)
data/                     GENERATED RPG Maker project data
js/plugins/               project plugins (hand-written)
js/plugins.js             plugin list and parameters
tools/
  extract_workbook.py     xlsx -> spec/
  lib/
    spec.js               reads spec sheets as row objects
    mz.js                 typed builders for MZ event commands and routes
    registry.js           switch/variable IDs; fails on unregistered names
    tiles.js              semantic tile palette -> tile IDs and passability flags
  data/
    tile-bindings.json    every tile slot, with a confidence flag
    face-bindings.json    speaker_id + emotion_id -> face + index
    audio-bindings.json   39 semantic audio slots -> filenames
    registry-extensions.json   IDs the workbook references but never allocates
  build/                  the generators, run in order by index.js
  validate/validate.js    static project validation
  sim/                    headless MZ interpreter + regression + vertical slice
  hydrate_assets.sh       copy runtime and assets from a licensed install
  verify_assets.js        confirm every referenced asset exists
.claude/skills/           vendored build-time toolkits (not shipped)
```

## The bindings layer

Three things could not be verified while authoring: which cell of a tilesheet
holds a hedge, which face index is a given expression, which audio file fills a
semantic slot. Rather than scatter guesses through 700 map cells and hundreds of
commands, each kind lives in **one file**:

| File | Resolves |
|---|---|
| `tile-bindings.json` | `GRASS`, `HEDGE`, `BOOKSHELF`… → tile ID, and the passability flags derived from the same entries |
| `face-bindings.json` | `speaker_id` + `emotion_id` → `faceName` + `faceIndex` |
| `audio-bindings.json` | `AUD_BGM_MANOR_EVENING` → file, volume, pitch |

Every entry carries a `verify` flag: `CALCULATED` (follows from engine
arithmetic), `SPEC` (the workbook states it), `ASSUMED` (plausible, unchecked).
Correcting a guess is a one-line edit plus a rebuild.

Because the Tilesets flags are **derived from the same file the maps are painted
from**, a map's passability and its appearance cannot drift apart.

## Time, AP and the clock

`Current_Day`, `Current_Hour`, `Current_Minute`, `Time_Block` and `AP_Remaining`
are the **source of truth**. Lighting, weather, audio and NPC schedules *read*
them; none of them owns time. This is why no third-party calendar plugin is
installed.

| Block | Window | Duration |
|---|---|---|
| 1 Early morning | 05:30 – 08:00 | 150 min |
| 2 Morning | 08:00 – 12:00 | 240 min |
| 3 Afternoon | 12:00 – 17:00 | 300 min |
| 4 Evening | 17:00 – 21:00 | 240 min |
| 5 Night | 21:00 – 23:00 | 120 min |

Five meaningful AP a day. Moving between rooms costs minutes but **zero AP**.
Mandatory story reactions cost zero AP. A repeated, useless examination costs
nothing a second time.

**Atomicity.** `CE_007_Spend_AP` mutates AP, the clock and its inputs with no
yielding command between them, so an interruption cannot spend AP without
advancing time. Every exit path clears `Action_Minutes` and `Action_AP_Cost`.

`CE_006_Advance_Time` snapshots the old block, rolls minutes into hours, clamps
at 23:00 (requesting day end rather than overflowing), derives the new block by
an ascending cascade over absolute minutes, and only calls the schedule, audio,
lighting and mandatory-event refreshes **when the block actually changed**.

## The culprit

Chosen once per New Game: `Culprit_ID = random 1..6`, in `CE_002_Select_Culprit`,
behind a double guard — `S_0002_Culprit_Locked` is off **and** `Culprit_ID` is
still 0. After a load the lock is on, so the roll cannot happen again even if the
whole init chain is re-entered. Exactly one per-culprit version switch is set.

The player never sees `Culprit_ID`, suspicion numbers, switch values or the
hidden crime version.

Each NPC carries two layers: a permanent personal story, and a crime-version
layer that depends on the current culprit. A clue scoped to one culprit is
emitted behind that culprit's version switch, so in other runs it simply is not
there to find.

## Save schema

`Schema_Version = 1`. A save captures what MZ captures: switches, variables,
self switches, map and position, inventory. Nothing is stored outside
`$gameSwitches` / `$gameVariables`, so saves are plain MZ saves with nothing
custom to migrate.

After a load:

- `Culprit_ID` does not change — proved by re-running CE_001 and CE_002 against a
  loaded save with a different RNG stream;
- ambience, lighting and schedules are restored, because `GrayStone_Core` arms
  the map-entry switch in `Game_Map.setup`, which runs on load exactly as on a
  transfer, and the guarded Autorun calls `CE_024`;
- day, clock and AP are **not** reset — `CE_024` deliberately does not touch
  them; only `CE_004_Day_Start` does, and it runs only on a day transition;
- one-shot scenes do not replay: self switches persist in the save;
- no Autorun can be left pending — the validator proves every Autorun has an exit.

`CE_023_Autosave_Checkpoint` uses the real API (`requestAutosave`, slot 0), not
an invented "Autosave" command, and never fires while the save-lock switch is
set. Nothing persistent is mutated after the Script call, so a failed autosave
cannot leave half-applied state.

## Performance

Schedules, audio and weather are refreshed **event-driven** only: day start, time
block change, map enter, explicit scene override. Nothing recomputes 59 NPCs per
frame.

There is exactly one Autorun per map and it disables itself on its first run.
There are **no Parallel Process events at all** — the one thing that genuinely
needed per-frame-like behaviour, detecting map entry, is handled by a single
engine hook in `GrayStone_Core` instead.
