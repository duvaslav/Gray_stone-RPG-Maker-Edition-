# Quest Eventing Patterns

Quests are state machines with a UI. Get the state model right and the rest is bookkeeping.

---

## 1. The standard shape

**One variable per quest**, values in gaps of ten, 100+ = complete, 900+ = failed. See
`event-state-machines.md` for the numbering rationale.

```
QUEST_MissingCat
    0  UNKNOWN
   10  OFFERED       — the owner has asked
   20  ACTIVE        — accepted
   30  FOUND         — the cat is in the party's possession
  100  COMPLETE      — returned, rewarded
  900  FAILED        — the owner left town
```

**One dispatcher Common Event per quest** owning every transition, so that no event outside it
writes the variable directly:

```
CE_Quest_MissingCat_Set          (trigger: None)
  ◆Comment: IN TMP_ARG0 = new state. Monotonic: refuses to move backwards.
  ◆Conditional Branch: TMP_ARG0 > Var QUEST_MissingCat
    ◆Control Variables: [QUEST_MissingCat] = TMP_ARG0
    ◆Common Event: CE_Quest_Journal_Refresh
    ◆Play SE: Book                                   ← only on a real change
  ◆
```

The monotonic guard means an out-of-order trigger (player finds the cat before being asked) is
harmless rather than a bug.

**One dialogue/behaviour Common Event per quest-giver**, branching on the variable, called by
every copy of that NPC.

---

## 2. Objectives and sub-progress

Keep the main state coarse. Put counting in its own variable.

```
QUEST_Herbs        20            ← ACTIVE
QUEST_Herbs_Count  0..5          ← sub-progress
```

Each herb node:
```
◆Control Variables: [QUEST_Herbs_Count] += 1
◆Control Self Switch: A = ON                       ← this node is picked
◆Conditional Branch: QUEST_Herbs_Count >= 5
  ◆Control Variables: [TMP_ARG0] = 30
  ◆Common Event: CE_Quest_Herbs_Set
```

For several independent objectives within one stage, use **bit flags in one variable** rather
than several variables:

```
QUEST_Trials_Flags   bit 0 = fire trial, bit 1 = ice, bit 2 = storm
  set:      Control Variables: [Flags] = script:  $gameVariables.value(45) | 1
  test all: Conditional Branch: Flags == 7
  test one: Conditional Branch (script): ($gameVariables.value(45) & 2) !== 0
```

This is compact and reliable, but it needs a Comment explaining the bit assignment or it is
unreadable. For three or fewer objectives, three plain variables (or three self switches on a
controller event) are clearer. Use bit flags when the count is larger or when you need "how
many are done" via a popcount.

---

## 3. Requirements: items, party, prerequisites

**Item requirement** — check *and* consume atomically, and check first:

```
◆Conditional Branch: Party has Iron Ore
  ◆Change Items: Iron Ore -1
  ◆(reward)
◆Else
  ◆Text: "Come back when you have the ore."
◆
```

For a quantity, read the count into a variable
(`Control Variables → Game Data → Item → Iron Ore`) and compare. The Conditional Branch item
test only checks "has at least 1".

**Quest items** should use the Key Item type so they cannot be sold or discarded, and should be
**removed on completion** unless the player is meant to keep them. Leaving quest items in the
inventory forever is a common polish failure.

**Party requirement** — page condition `actorValid` (is actor N in the party) or
`Conditional Branch → Actor → In the Party`.

**Prerequisite quests** — a plain Conditional Branch on the other quest's variable at the point
of offering. Do not encode prerequisites as separate switches.

---

## 4. Branching, multiple outcomes, and failure

### Branching

Let the branch point set a **decision variable**, separate from the progress variable:

```
QUEST_Feud_Progress   0/10/20/100
QUEST_Feud_Side       0 undecided · 1 helped the miller · 2 helped the baker
```

Progress stays linear and comparable; the branch is a separate axis. Downstream events branch
on `QUEST_Feud_Side`. This is far easier to reason about than encoding branches into the
progress numbers (110/120/210/220…), which becomes unreadable at the third branch.

### Failure

A failed quest is a state (900+), not the absence of a quest. Model it explicitly so NPCs can
acknowledge it. Decide up front whether failure is:
- **Reachable and permanent** — the NPC leaves; a page conditioned on `>= 900` gives the
  post-failure line.
- **Reachable and recoverable** — then it is not failure, it is a stage; use a value below 100.
- **Unreachable** — then do not build the state.

Timed failure uses `Control Timer` plus a check, or a day-counter variable compared at a
checkpoint. Prefer the checkpoint: a quest that fails silently while the player is in a dungeon
feels arbitrary.

### Repeatable quests

```
QUEST_BountyWolves       0/10/20/100
QUEST_BountyWolves_Count how many times completed
```

On completion, award, increment the count, and reset the progress to 0 (or 10 if the NPC no
longer needs to explain it). Optionally gate re-offering behind a day change so it is not
farmable in one visit.

### Hidden objectives

A bonus objective is just another variable that is never displayed in the journal. Set it when
the player does the thing; read it at the reward step to upgrade the reward. Do not make hidden
objectives affect the main state, or the journal becomes wrong.

---

## 5. The journal

If the project has a quest-log plugin, use it — read its plugin commands from the plugin file
and call them from the dispatcher Common Event.

Vanilla journal, no plugin:
- Store quest states in variables (already done).
- A "Journal" item or menu Common Event that runs a `Show Text` per active quest, built from
  Conditional Branches on each quest variable.
- Because only Common Events can be triggered from items, make the journal an item with
  `occasion: always` that calls `CE_Journal_Show`, or bind it to a key with a parallel input
  check.

Keep journal text **in one place** — the same Common Event that owns the state — so text and
state can never disagree.

---

## 6. Cleanup on completion

The step almost everyone forgets. On reaching the terminal state:

- [ ] Remove quest items that no longer serve a purpose.
- [ ] Turn OFF any switches the quest turned ON for its duration (a dungeon door that should
      re-lock, a temporary NPC, an enabled encounter set).
- [ ] Disable any parallel the quest enabled.
- [ ] Ensure every quest-related event has a page for the completed state so nothing still
      offers the quest.
- [ ] Make the terminal state **idempotent** — talking again gives a post-quest line and no
      reward. Test it by talking three times in a row.
- [ ] Reset counters that could otherwise leak into a repeat of the quest.

Put all of this in the dispatcher's `>= 100` branch so it happens exactly once, on the
transition.

---

## 7. Multi-stage quest across several maps — worked layout

*Five stages, three maps, two NPCs, one dungeon.*

```
Variables
  0040  QUEST_Relic          0/10/20/30/40/100
  0041  QUEST_Relic_Shards   0..3
Switches
  0060  SW_Relic_CryptOpen   gates the dungeon entrance event's page
Common Events
  0030  CE_Quest_Relic_Set       dispatcher (monotonic, journal, cleanup at 100)
  0031  CE_NPC_Sage_Talk         all sage instances call this
```

| Map | Event | Role |
|---|---|---|
| Town | `NPC_Sage` | Pages on QUEST_Relic; calls CE_NPC_Sage_Talk |
| Town | `EV_CryptDoor` | Page 2 conditioned on SW_Relic_CryptOpen; Transfer |
| Crypt | `EV_Shard_A/B/C` | Each: gain shard, Self Switch A, count, dispatcher at 3 |
| Crypt | `CUT_RelicChamber` | Autorun gated by QUEST_Relic >= 30; the set-piece |
| Town | `NPC_Sage` | `>= 40` branch hands over the reward, dispatcher to 100 |

Every state change goes through `CE_Quest_Relic_Set`. Nothing else writes variable 40. That
single rule is what keeps a five-stage, three-map quest debuggable.

---

## 8. Testing a quest

Walk the transition table and verify each row in-game. Then specifically test:

1. **Talk twice at every stage** — no double rewards, no stuck dialogue.
2. **Out-of-order** — pick up the quest item before being asked; the monotonic guard should
   absorb it.
3. **Leave and return mid-quest** — including saving and reloading.
4. **The terminal state** — talk to every quest NPC, confirm they all acknowledge completion.
5. **Inventory** — no orphaned quest items, no lingering key items.
6. **Failure/timeout** if implemented.

A quest variable is trivially settable from the F9 debug window during playtest, which makes
stage-jumping for tests fast — another argument for a single variable over a switch farm.
