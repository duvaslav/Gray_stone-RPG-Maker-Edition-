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
node tools/sim/regression.js      ->  179 checks, 28 scenarios, 0 failures
node tools/sim/vertical-slice.js  ->  PASSED end to end
node tools/verify_assets.js       ->  44 references, 0 resolvable (assets absent)
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
| CE_016 mandatory events, CE_017 repeat dialogue | fall through safely; dependency graph not generated |
| CE_019–CE_022 quality rules | clamp correctly to 0..3 and always resolve; the scoring rules themselves are not generated |
| MAP_010, MAP_030, MAP_040, MAP_050, MAP_060 | not built. Their routes are **gates that say so in character**, never silent dead ends or transfers to a map that does not exist |
| Days 2–10 content | not built |
| 2631 dialogue commands in `53_Dialogue_Event_Commands` | not generated |

None of these is a softlock: every stub exits cleanly, and the validator proves
no Autorun can hang.
