# QA — status, results and defect log

## Definitions of done

Used literally throughout this repository. Nothing is called "done".

| Status | Meaning |
|---|---|
| `SPECIFIED` | exists in the Gray Stone workbook |
| `GENERATED` | the file exists in the project |
| `STATIC_VALIDATED` | passes the automated checks |
| `EDITOR_VERIFIED` | RPG Maker MZ opens the project without error |
| `RUNTIME_VERIFIED` | behaviour proved in the running game |
| `BLOCKED` | objectively not verifiable in the current environment |

A workbook status of `READY`, `PASS` or `READY_EXACT_COMMAND` means the
**specification** is ready. It is not evidence that anything runs.

## Current status by object

| Object | Status | Evidence |
|---|---|---|
| Switch / variable registries (200 / 203 named) | `STATIC_VALIDATED` | every reference in range; unregistered names fail the build |
| `System`, `Actors`, `Classes`, `Items` (49 clues), `Tilesets` | `STATIC_VALIDATED` | validator |
| `CommonEvents` CE_001–CE_025 | `STATIC_VALIDATED` + logic executed | all 25 terminate from a cold start |
| MAP_005 Prologue | `STATIC_VALIDATED` + logic executed | 0 collision mismatches; 0 map-library findings; all routes walkable |
| MAP_020 Ground Floor | `STATIC_VALIDATED` | 13/13 rooms reachable; 0 dead cells |
| Prologue cutscene | logic executed | terminates; state committed; control returned |
| Time / AP system | logic executed | every hour boundary; clamp at 23:00 |
| Evidence / search | logic executed | charges once; repeat is free; no duplicates |
| Day cycle 1→10 → final phase | logic executed | no double-advance |
| Ending resolver | logic executed | 96/96 combinations resolve |
| Save / load | logic executed | culprit, clock, AP, evidence, history all survive |
| NPC schedules + singleton (CE_009) | logic executed | 700 (npc, day, block) combinations: never two instances of one NPC; zero shared cells |
| `GrayStone_Core`, `_MessageUI`, `_8DirMovement` | `GENERATED`, syntax-checked | **`EDITOR_VERIFIED` blocked** |
| Message window appearance | `BLOCKED` | needs the runtime |
| Audio playback, tilesets, sprites, faces | `BLOCKED` | assets absent by licence |
| Editor load, play-test | `BLOCKED` | RPG Maker MZ not present |

**Nothing in this project is `RUNTIME_VERIFIED`.** That status requires the real
engine. What the headless interpreter proves is stated precisely below.

## What the headless interpreter does and does not prove

`tools/sim/` re-implements the parts of MZ that Gray Stone's event logic depends
on: branch, loop, label and skip semantics mirroring `Game_Interpreter`, page
selection (last matching page wins), self switches, and the common-event call
graph. The scenarios **execute the real generated command lists** from `data/`.

| Proved | Not proved |
|---|---|
| control flow, branch and loop correctness | rendering, window layout, fonts |
| switch / variable / self-switch state | audio actually playing |
| common-event call graphs and recursion limits | plugin behaviour under the real engine |
| interpreter termination (no hung Autorun) | runtime collision and movement feel |
| save/load persistence of game objects | anything needing a frame loop |

Map passability and reachability are computed from `Tilesets.json` flags using
the engine's own layered `checkPassage` rule (z3→z0, first tile that speaks
wins, ★ skipped). That is a faithful static model, but it is still static.

## Automated results

```
node tools/validate/validate.js   ->  0 errors, 0 warnings, 4 notes
node tools/sim/regression.js      ->  235 checks, 36 scenarios, 0 failures
node tools/sim/vertical-slice.js  ->  PASSED end to end
node tools/verify_assets.js       ->  44 references, 0 resolvable (assets absent)
node tools/pick_tiles.js         ->  contact sheets (needs hydrated assets)
```

### Regression coverage

| Scenario | Result |
|---|---|
| New Game selects exactly one culprit, 1..6 | pass |
| Culprit distribution uniform (3000 runs: 469–521 per value) | pass |
| Day 1 opens 18:00, Evening block, 5 AP | pass |
| Control, menu, save, transparency and tint all returned | pass |
| Replay guard — self switch | pass |
| Replay guard — global switch, independently | pass |
| No cast residue or leftover collision | pass |
| Culprit survives load; survives a forced re-run of CE_001 and CE_002 | pass |
| Day, clock, AP restored after load | pass |
| Map entry after load restores ambience without touching AP or day | pass |
| Minutes roll into hours; blocks change at the right boundary (6 cases) | pass |
| Exactly one block switch on, at all 24 hours | pass |
| Past 23:00 clamps and requests day end | pass |
| AP spend charges once; inputs cleared | pass |
| AP exhausted refuses and charges nothing | pass |
| Search costs once; second look free; gated point charges nothing | pass |
| Last AP offers day end but never forces it | pass |
| Day end advances exactly one day; cannot double-advance | pass |
| All ten days advance, then final phase | pass |
| 96/96 culprit × strategy × quality resolve, incl. strategy = none | pass |
| Re-entering a map does not restart the same track | pass |
| Locked scenes are never autosaved into | pass |
| All 25 Common Events terminate | pass |
| No map leaves an Autorun running | pass |
| NPC singleton across 700 (npc, day, block) combinations | pass |
| Two different NPCs never share a cell | pass |
| An inactive NPC instance holds no collision and shows no sprite | pass |

---

# Defect log

Defects found in the specification or in the implementation while building.
Every one was found by running something, not by reading.

### D-01 — Time-block boundaries contradict each other — **High**

`06_Common_Events` CE_006 derives the block from hour ranges
`06–09=1, 10–13=2, 14–17=3, 18–21=4, else=5`. `15_Time_AP` gives the five block
durations as 150 / 240 / 300 / 240 / 120 minutes, which resolve to
05:30–08:00 / 08:00–12:00 / 12:00–17:00 / 17:00–21:00 / 21:00–23:00 — matching
the project brief exactly. The two disagree: CE_006 puts 17:00 in Afternoon and
has no representation for 05:30.

**Resolution:** implemented the `15_Time_AP` durations, which agree with the
brief. Source priority puts the brief and canon above a derived sheet. Verified
at every hour boundary.

### D-02 — Two prologue servants stand inside the hedge — **High**

`62_Prologue_Event_Registry` places Linda at (10,9) and Agnes at (22,9). Both
cells carry the formal hedge on the structure layer, and both lie outside the
porch zone the blueprint itself defines (`PR_ZONE_PORCH x=11..20`).

**Resolution:** the six servants are re-laid as a receiving line parted on the
door axis — 13,14,15 / 17,18,19 — all on the stone paving, camera axis clear,
order and role unchanged. Verified: all six on walkable floor inside the zone.

### D-03 — The prologue never selects a culprit — **Critical**

`63_Prologue_Command_List` contains **no Call Common Event at all** — there is no
code 117 anywhere in its 105 commands. Yet MAP_005 is the New Game start map and
CE_001 is specified as "start map Autorun". Taken literally, CE_002 never runs,
`Culprit_ID` stays 0, and the entire playthrough has no culprit for the ending
resolver.

**Resolution:** the controller calls CE_001 under the black screen, before any
prologue state is set, so the prologue's own dusk clock still overrides CE_004's
06:00 default. Verified: culprit in 1..6 with exactly one version switch, and
uniform across 3000 runs.

### D-04 — Door threshold tore six autotile seams — **Medium**

The doorway's stone threshold was laid **after** the ground autotile seams were
solved. A5 is a normal tile, not an autotile, so the surrounding lawn never
shaped its edge against it.

**Resolution:** threshold laid before the seam solve. Map-library findings went
from 6 to 0.

### D-05 — The library and archive are sealed off the map — **Critical**

`08_Mansion_Blueprint` gives the library door as (15,13) "to the hall". At y=13
the main hall does not exist — its own rectangle is (15,16)-(29,27), so its
interior spans y17..26 — and the five cells east of (15,13) are solid, the
nearest floor being the grand stair six cells away. The library and archive had
no connection to anything.

**Resolution:** the library opens onto the study across the boundary the two
rooms actually share. A private library reached through the master's study is
period-correct and keeps the blueprint's own hall → study → library → archive
privacy gradient. Verified: 13/13 rooms reachable.

### D-06 — The grand staircase does not open onto the hall — **High**

The hall lists its neighbours by name only — "вестибюль; кабинет; библиотека;
столовая; лестница" — with no coordinates, so it receives its doors from the
neighbouring rooms. Every neighbour supplies one except the staircase. Without
it the only route upstairs was through the servants' hall.

**Resolution:** added the hall ↔ grand stair opening on their shared wall line.

### D-07 — Laundry door opens into solid fill — **Medium**

Laundry door (26,3) "corridor": the service corridor's rectangle is (27,4)-(31,17),
so its interior begins at y=5 and never reaches y=3.

**Resolution:** no repair door needed. The laundry's other door (21,5) opens into
the servants' hall, which opens into the service corridor — and laundry →
servants' hall → corridor is the correct below-stairs circulation anyway.

### D-08 — Day end skipped the entire ten-day structure — **Critical**

Found by the regression suite. CE_005 branched on `Current_Day` while its own
branch body incremented `Current_Day`, so each branch re-qualified the next:
ending day 1 ran day 2's branch, then day 3's, and arrived at day 10 in a single
call. The whole ten-day game collapsed into one action.

**Resolution:** snapshot the day into a scratch variable and branch on the
immutable copy. Verified: day 1 → 2 exactly, and all ten days advance one at a
time.

### D-09 — The manor opened silent — **Medium**

Found by the vertical slice. `29_Audio_Library` leaves all 39 exact filenames as
`VERIFY_IN_PROJECT` (workbook finding F-018), so CE_010 had no Play BGM at all.
The prologue faded its own track out on the way in, and nothing replaced it.

**Resolution:** `tools/data/audio-bindings.json` — the same bindings pattern used
for tiles and faces. CE_010 resolves (map, time block) to a semantic slot and
issues Play BGM/BGS only when the profile actually changed.

### D-10 — Unallocated IDs referenced by name — **Medium**

CE_006 references `Temp_Old_Block`, CE_023 references `Checkpoint_Reason`, CE_002
requires a "version-ready switch allocated by project", and CE_008 tests
`Day_End_Available` and `Atomic_Scene`. None is allocated in `04_Switches` or
`05_Variables_Enums`.

**Resolution:** `tools/data/registry-extensions.json` allocates them in ID space
the workbook leaves unused (switches 14–25, variables 31–35), so **no existing
numeric ID moves**. The registry now fails the build on any unregistered name.

### D-11 — Autotile kinds are sheet-local in the spec, global in the engine — **High**

`68_Prologue_Tile_Palette` states grass as `kind=0`. The engine formula is
`2048 + kind*48`, which takes an **engine-global** kind — global 0 is A1 water.
Taken literally, the lawn would have been painted as water.

**Resolution:** converted to global kinds (A2 local `n` → global `16+n`; A3 →
`48+…`; A4 → `80+…`, eight kinds per palette row). Cross-checked against the map
library's own `T.a2Kind` / `a3Kind` / `a4Kind`; grass now resolves to 2816,
exactly as the sheet states.

### D-12 — Every NPC in a room stands on the same tile — **Critical**

`19_NPC_Map_Instances` gives one anchor coordinate per **room**, not per
**(npc, room)**. Every NPC scheduled into a room therefore occupies the identical
cell. Across ten days and five blocks that is **90 (day, block, cell) occurrences
where two or three different people stand on one tile** — on the upper floor at
night, three at once.

Two blocking events on one cell do not merge: both exist, one is drawn over the
other, the cell is blocked, and the player can only ever talk to whichever has
the lower event id. The other person is in the room but unreachable.

**Resolution:** `spreadAnchors()` keeps the first instance on the blueprint
anchor and moves the rest to the nearest free floor cell **in the same room**,
skipping furniture, door corridors, reserved interactive cells and cells already
taken. Deterministic, so coordinates are stable across rebuilds. 23 anchors were
spread on MAP_020. Verified: 0 shared cells across all 50 day/block states.

A related implementation defect was caught by the same test: a hand-written
Roland placeholder had only an active page, so it blocked its cell and showed its
sprite regardless of the schedule. It is superseded by the generated instance.

### D-13 — Generated `Tilesets.json` replaced the vendor's passability — **Critical**

Found the first time the project was run with real assets hydrated.

`Tilesets.json` pairs 8192 passability flags with the stock art. The build was
*authoring* that file from `tile-bindings.json`, and `hydrate_assets.sh`
deliberately skipped all of `data/` to protect the generated maps — so the
project ended up running the **real stock PNGs against our synthesized flags**.

Those flags name only the handful of decorations the bindings list: **7 nonzero
flags across the whole of sheets B–E**. Every other tile — real trees, fences,
rocks, walls, furniture — was therefore *passable*. The map also rendered wrong
objects, because the slots were the ones marked `ASSUMED`: lockers where hedges
were meant, barrels where facade windows were meant, dark archways where lamps
were meant, cracks where trees were meant.

**Resolution:**
- `Tilesets.json` is now **consumed, not authored**. If a stock file is present
  the build preserves it and applies only a documented, currently-empty flag
  overlay.
- `hydrate_assets.sh` now copies `data/Tilesets.json` from NewData — the one data
  file that must travel with the art — while still protecting generated maps.
- A synthesized file is detected two ways, because the marker only exists on
  files written after it was introduced: an explicit `note` marker, **and** flag
  density (fewer than 24 nonzero flags across B–E cannot be stock).
- The validator raises a hard **ERROR** if synthesized flags are found while real
  tilesets are present, and a note when they are synthesized with no art yet.
- `tools/pick_tiles.js` renders each sheet as a labelled contact sheet — every
  cell tagged with its `col,row` and tile id, bordered by the passability the
  project will actually read, gold-outlined where a binding points — so a slot is
  confirmed by looking instead of guessed.

**Still open:** the tile *identities* themselves. Flags fix passability; they
cannot say which cell is a hedge. The 36 `ASSUMED` bindings remain assumed until
read off the real sheets.

### D-14 — Dialogue text too small, and lines too far apart — **Medium**

Reported from the first play-test. `GrayStone_MessageUI` set the body font to
**25px — smaller than MZ's own default of 26** — while leaving `lineHeight` at
MZ's fixed 36. The result was small text floating in tall rows, which is worse
than either problem alone and is very visible once the window is scaled up on a
large display.

**Resolution:** body font 30, name 26, and `lineHeight` raised to 42 with an
override on both windows — line height must grow with the font or a larger face
simply overlaps itself inside 36px rows. `Window_Message` sizes itself from
`fittingHeight(4)`, so overriding `lineHeight` also makes the box taller to
match. The System base font went 26 → 28. All four are plugin parameters, so they
can be tuned in the Plugin Manager without a rebuild.

### D-15 — Roof and facade were the wrong tile families — **High**

`68_Prologue_Tile_Palette` leaves the A3 roof and wall kinds as
`VERIFY_IN_PROJECT`, and the placeholders were kind 48 / 56. Read off the real
`Outside_A3` sheet, kind 48 is the **pastel pink-and-blue scalloped roof** and 56
is cream brick — a seaside cottage, not a grey Victorian manor.

**Resolution:** roof → kind 66 (grey slate/stone, A3 kind-row 2 col 2), facade →
kind 72 (grey ashlar stone, kind-row 3 col 0).

### D-16 — Sheet B (0,0) cannot hold a tile — **Low**

The lamp was to be a two-tile object with its head at `B(0,0)`. That slot's tile
id is **0**, which the engine reads as an empty cell, so the head would silently
vanish. Caught by the resolver before it shipped. The lamp is now a single tile.

Trees became single tiles for a related reason: the blueprint's collision column
blocks exactly one cell per tree, and a canopy tile above would have to be a star
tile laid on whatever is already there — the flowerbeds, in several cases.

### D-17 — Sheet C is modern city content — **Medium**

The only binding on sheet C was `inside.RUG` at C(0,0). In this asset set the C
sheets hold cars, neon signs, vending machines and conveyor belts. Dropping a
tile from there into an 1896 manor is an anachronism waiting to happen.

**Resolution:** `RUG` removed and sheet C is now excluded by policy, recorded in
the bindings file header. A period-appropriate carpet can be added later from a
sheet that has one.

### D-24 — `Strategy_Quality` is off by one between two sheets — **High**

`38_Ending_Matrix` and `05_Variables_Enums` disagree by exactly one:

| value | 38_Ending_Matrix | 05_Variables_Enums |
|---|---|---|
| 0 | invalid | не рассчитано |
| 1 | weak | invalid |
| 2 | partial | weak |
| 3 | clean | partial |
| 4 | — | clean |

The dialogue commands branch on `strategy_quality = clean`. Read against the enum
table that is 4; against the matrix it is 3. Since `CE_019..021` clamp to 0..3,
the enum reading would make the branch **permanently unreachable** and the best
outcome of the Evelyn audit impossible to see.

**Resolution:** the matrix wins. It is the resolver's own data, it is complete —
78 rows covering every culprit × strategy × quality — and the scoring events
already produce 0..3 to match. The enum table's extra "not calculated" at 0
shifts everything up and is redundant, since "invalid" already means no usable
strategy. `clean` is 3.

### D-25 — Two clue references in the dialogue do not exist — **Medium**

`53_Dialogue_Event_Commands` hands `CE_012_Add_Evidence` two ids that are in
neither `23_Evidence_Items` nor `25_Clue_Logic`:

- **`item_chapel_night_register`** — the Edrian confession grants both this *and*
  `clue_chapel_night_entry`, and `25_Clue_Logic` names that scene as the source
  of `clue_chapel_night_entry`. It is a duplicate alias for the same clue, so it
  resolves to it and the scene grants it exactly once.
- **`item_creditor_letters`** — no evidence item of that name exists anywhere,
  and the Evelyn audit grants nothing else. Genuinely dangling.

**Resolution:** the alias is mapped; the dangling one is **not invented**. The
scene plays, records the gap in a comment, and the build reports it. Granting the
wrong clue would be worse than granting none — but this does mean the Evelyn
audit currently yields no evidence, and it needs a decision: either an evidence
item for the creditor letters, or confirmation that the scene is meant to yield
none.

### D-26 — Strategy scoring was a stub, so 60 of 78 endings were unreachable — **Critical**

Found by tightening the ending test from "produces a result" to "produces a
DISTINCT result". `CE_019..021` set `Strategy_Quality` to 0 and then contained
only a `<<GENERATED_QUALITY_RULES>>` marker, so every run scored 0 whatever the
player did. `CE_022` then always took the quality-0 row: **24 distinct endings out
of 78**, and the entire clean/partial/weak half of the matrix was dead content.

The earlier test passed because it wrote `Strategy_Quality` directly — and
`CE_019..021` promptly overwrote it. A test that injects a value the system
recomputes proves nothing.

**Resolution:** `CE_015` now computes the six derived states the scoring reads
(evidence core, reliable witness, victim secured, ally ready, keys controlled,
passages controlled), and `CE_019..021` score from them. The tests drive quality
through that state instead of writing it.

Note on authorship: `06_Common_Events` states the scoring in prose ("+1
ally_ready", "apply staff trust threshold modifier without exceeding 3") and
`37_Ending_Resolver` lists steps without formulas, so **the thresholds are a
design decision made here, not a transcription.** They are collected in one table
in `tools/build/86-strategy-scoring.js` to be tuned after play. Newly allocated
for the same reason: six derived-state switches and `V_0038_Accused_ID`, because
nothing recorded who the player actually accused.

---

## Defects in the tests, not the game

Recorded because a green suite that was green for the wrong reason is worse than
a red one.

- **Degenerate seeded RNG.** A bare LCG seeded with consecutive small integers
  has a first output nearly linear in the seed; seeds 1..300 produced only the
  values 2 and 3 out of 1..6, which looked exactly like a broken culprit roll.
  Confirmed against real `Math.random` (uniform, 469–521 per value over 3000
  runs) before changing anything. Fixed by hashing the seed and warming the
  stream.
- **Wrong expectation about the tint.** A test asserted the manor should open at
  neutral `[0,0,0,0]`. It should not: day 1 opens at 18:00 and an evening tone is
  correct — neutral would mean the lighting system never ran.
- **Mis-sequenced replay assertion.** A message counter was captured before an
  unrelated search, so the search's own line was mistaken for the prologue
  replaying.

## Known gaps

Honest list of what is stubbed rather than implemented.

| Area | State |
|---|---|
| CE_009 NPC schedules | **generated** for all 14 NPCs and 59 instances, singleton proven. Only MAP_020's 36 instances are placed as events; the other 23 await their maps |
| CE_013 present evidence, CE_014 relationships | structure and clean exits; branch trees not generated |
| Dialogue scenes | **generated**: 15 scenes, 5927 commands, each with a replay guard and verified to terminate |
| Ending resolver (CE_022) | **generated** from all 78 matrix rows; every combination resolves to its own distinct ending, none falls through to the fallback |
| Strategy scoring (CE_019-021) + derived states (CE_015) | **implemented**; all four qualities reachable for each strategy |
| CE_016 mandatory events, CE_017 repeat dialogue | fall through safely; dependency graph not generated |
| CE_019–CE_022 quality rules | clamp correctly to 0..3 and always resolve; the scoring rules themselves are not generated |
| MAP_010, MAP_030, MAP_040, MAP_050, MAP_060 | not built. Their routes are **gates that say so in character**, never silent dead ends or transfers to a map that does not exist |
| Days 2–10 content | not built |
| 2631 dialogue commands in `53_Dialogue_Event_Commands` | not generated |

None of these is a softlock: every stub exits cleanly, and the validator proves
no Autorun can hang.
