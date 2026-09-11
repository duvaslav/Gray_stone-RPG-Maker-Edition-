# Recipe Index

Ready-to-build patterns. Each explains **why** it works, not just what to click, so you can
compose and adapt them rather than copying blindly.

Notation used throughout:

```
Page N  [conditions]  trigger / priority / movement
  ◆Command
  ◆Conditional Branch: test
    ◆(indented body)
  ◆
```

`SW_`, `VAR_`, `CE_` are placeholder names — use the target project's conventions
(`../references/style-guide.md`).

---

## Interactive objects — `interactive-objects.md`
| Recipe | Core idea |
|---|---|
| [Door / map transition](interactive-objects.md#1-door--map-transition) | Player Touch, Below Characters, no state |
| [Locked door + key](interactive-objects.md#2-locked-door--key) | Item page condition + Self Switch for the unlocked state |
| [Chest](interactive-objects.md#3-chest) | The canonical two-page Self Switch event |
| [Lever (toggleable)](interactive-objects.md#4-lever-toggleable) | Two pages, each flipping its own Self Switch |
| [One-shot object](interactive-objects.md#5-one-shot-object) | Do it once, then an inert page |
| [Reusable object](interactive-objects.md#6-reusable-object) | No state at all — the hardest to get right is the simplest |
| [Teleport](interactive-objects.md#7-teleport-pad) | Confirmation choice + Transfer, with arrival-tile discipline |
| [Trap](interactive-objects.md#8-trap) | Player Touch damage, with a fire-once decision |
| [Resource node](interactive-objects.md#9-resource-node) | Gather → Self Switch → depleted page |
| [Respawning resource](interactive-objects.md#10-respawning-resource) | One Common Event clears a list of self switches |
| [Event cooldown](interactive-objects.md#11-event-cooldown) | Timestamp variable compared against a global tick |

## NPCs — `npc-recipes.md`
| Recipe | Core idea |
|---|---|
| [Multi-state NPC](npc-recipes.md#1-npc-with-several-states) | Pages as states over a quest variable |
| [Conditional dialogue](npc-recipes.md#2-conditional-dialogue) | Highest state first, in one page |
| [NPC schedule](npc-recipes.md#3-npc-schedule-day-parts) | Several events, threshold pages — not movement |
| [Patrol](npc-recipes.md#4-patrol) | Custom autonomous route, repeat + **skippable** |
| [Guard: chase and return](npc-recipes.md#5-guard--patrol-chase-return-friendly) | 4 pages, gated sensor, hysteresis |
| [Quest NPC](npc-recipes.md#6-quest-npc) | Dialogue in a Common Event, state via a dispatcher |
| [Blocker](npc-recipes.md#7-blocker) | Priority, not map data |
| [Day/night reaction](npc-recipes.md#8-daynight-reaction) | One branch on the time variable |

## Triggers and sensors — `triggers-and-sensors.md`
| Recipe | Core idea |
|---|---|
| [Proximity trigger](triggers-and-sensors.md#1-proximity-trigger) | Distance in a self-terminating gated parallel |
| [Region trigger](triggers-and-sensors.md#2-region-trigger) | One map controller reads the player's region |
| [Secret area](triggers-and-sensors.md#3-secret-area) | Reward once, remember with a Switch |
| [Parallel sensor](triggers-and-sensors.md#4-parallel-sensor-gated) | The general shape for any polling sensor |
| [One-shot parallel](triggers-and-sensors.md#5-one-shot-parallel) | Self switch to an empty non-parallel page |
| [Timer](triggers-and-sensors.md#6-timer) | `Control Timer` plus checks at natural points |
| [Random event](triggers-and-sensors.md#7-random-event) | Weighted roll on thresholds |
| [Common Event function](triggers-and-sensors.md#8-common-event-as-a-function) | Argument registers and the reentrancy rule |

## Quests and flow — `quests-and-flow.md`
| Recipe | Core idea |
|---|---|
| [Multi-stage quest](quests-and-flow.md#1-multi-stage-quest) | One variable, one dispatcher, monotonic |
| [Quest dispatcher](quests-and-flow.md#2-the-dispatcher-common-event) | Single writer for the state |
| [Collect-N objective](quests-and-flow.md#3-collect-n-objective) | Counter variable feeding the dispatcher |
| [Branching outcome](quests-and-flow.md#4-branching-outcome) | Progress and choice on separate axes |

## Cutscenes — `cutscene-recipes.md`
| Recipe | Core idea |
|---|---|
| [One-shot cutscene](cutscene-recipes.md#1-one-shot-cutscene) | Guard, lock, setup, beats, teardown, release |
| [Four NPCs entering at once](cutscene-recipes.md#2-four-npcs-entering-simultaneously) | Non-waiting routes; longest one waits |
| [Exact synchronisation](cutscene-recipes.md#3-exact-synchronisation-switch-handshake) | Switch handshake for unequal routes |
| [Begin / End brackets](cutscene-recipes.md#4-ce_cut_begin--ce_cut_end) | Enforce the teardown checklist by construction |

## Puzzles — `puzzle-recipes.md`
| Recipe | Core idea |
|---|---|
| [Several switches, any order](puzzle-recipes.md#1-several-switches-any-order) | Read self switches by script — cannot drift |
| [Lever sequence](puzzle-recipes.md#2-lever-sequence-order-matters) | Progress counter that resets on error |
| [Pressure plate](puzzle-recipes.md#3-pressure-plate) | Parallel exists only while pressed |
| [Pushable block](puzzle-recipes.md#4-pushable-block) | Player Touch + self-directed one-step route |
| [Moving-object puzzle](puzzle-recipes.md#5-moving-object-puzzle-goal-tiles) | Regions as goal tiles; read, don't track |

---

## Choosing between recipes

```
Does it have a discrete trigger (talk / step on / bump into)?
    → an ordinary trigger event. No parallel. Start here, always.

Does it need to know about something continuous (distance, time, position)?
    → can the *cause* set the state instead?           → dirty-flag; no sensor needed
    → otherwise a gated, self-terminating parallel     → triggers-and-sensors.md#4

Does one object have several distinct appearances or behaviours?
    → pages as states                                   → npc-recipes.md#1

Does the state span maps or events?
    → a Switch (boolean) or a Variable (ordered)        → quests-and-flow.md

Is the state local to one object?
    → a Self Switch. Four of them, free.

Is the same logic in three or more places?
    → a Common Event                                    → triggers-and-sensors.md#8
```
