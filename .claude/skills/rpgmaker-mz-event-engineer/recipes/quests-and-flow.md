# Recipes — Quests and Flow

## 1. Multi-stage quest

One variable, gaps of ten, 100 for complete, 900+ for failed.

```
VAR_QUEST_Relic
    0  UNKNOWN
   10  OFFERED      the sage has mentioned it
   20  ACTIVE       accepted; the crypt is open
   30  SHARDS_DONE  all three shards collected
   40  CHAMBER_SEEN the relic-chamber scene has played
  100  COMPLETE     handed over, rewarded
  900  FAILED       the sage left town
```

**Why gaps of ten:** inserting "15 — heard a rumour in the tavern" later needs no renumbering,
and no other event has to change.

**Why 100 for complete:** `>= 100` reads as "done" forever on a page condition. **Why 900+ for
failed:** it sorts above every success state, so a `>= 900` page beats them all in the
bottom-up scan.

Layout across the project:

| Where | Event | Role |
|---|---|---|
| Town | `NPC_Sage` | Pages on the variable; calls `CE_NPC_Sage_Talk` |
| Town | `EV_CryptDoor` | Page 2 gated on `SW_QUEST_CryptOpen`; Transfer |
| Crypt | `EV_Shard_A/B/C` | Gain shard, Self Switch A, count, dispatcher at 3 |
| Crypt | `CUT_RelicChamber` | Autorun gated on `Var >= 30`; the set-piece |
| Town | `NPC_Sage` | `>= 40` branch hands over the reward → 100 |

**One rule makes this debuggable: nothing writes `VAR_QUEST_Relic` except the dispatcher.**

---

## 2. The dispatcher Common Event

```
CE_QUEST_Relic_Set              (trigger: None)
  ◆Comment: Single writer for VAR_QUEST_Relic.
  ◆Comment: IN : VAR_ARG_0 = requested state.
  ◆Comment: States 0/10/20/30/40/100/900. Monotonic: never moves backwards.
  ◆Conditional Branch: Var VAR_ARG_0 > VAR_QUEST_Relic
    ◆Control Variables: [VAR_QUEST_Relic] = VAR_ARG_0
    ◆Play SE: Book
    ◆Comment: --- per-state side effects ---
    ◆Conditional Branch: Var VAR_QUEST_Relic == 20
      ◆Control Switches: [SW_QUEST_CryptOpen] = ON
    ◆
    ◆Conditional Branch: Var VAR_QUEST_Relic >= 100
      ◆Comment: --- cleanup, runs exactly once on the transition ---
      ◆Control Switches: [SW_QUEST_CryptOpen] = OFF
      ◆Change Items: Relic Shard -3
      ◆Control Variables: [VAR_CNT_RelicShards] = 0
    ◆
  ◆
```

**Why the monotonic guard:** if the player somehow reaches the crypt and collects shards before
the sage offers the quest, `20` arriving after `30` is silently absorbed instead of rewinding
progress. Out-of-order play stops being a bug class.

**Why cleanup lives here:** it is inside the transition branch, so it runs exactly once —
never on a repeat conversation. Cleanup written into the NPC's dialogue would re-run every time
the player talks after finishing.

**Why the SE is inside the guard:** no "journal updated" sound when nothing actually changed.

---

## 3. Collect-N objective

Keep the main state coarse; count in its own variable.

```
Each shard event (EV_Shard_A/B/C)
Page 1  [always]                Action Button / Same as Characters / shard graphic
  ◆Play SE: Item3
  ◆Change Items: Relic Shard +1
  ◆Control Variables: [VAR_CNT_RelicShards] += 1
  ◆Control Self Switch: A = ON
  ◆Text: "Shard recovered. (\V[41]/3)"
  ◆Conditional Branch: Var VAR_CNT_RelicShards >= 3
    ◆Control Variables: [VAR_ARG_0] = 30
    ◆Common Event: CE_QUEST_Relic_Set
  ◆

Page 2  [Self Switch A]         Action Button / Below Characters
        (empty)
```

**Why the count is separate from the state:** the main state stays readable (0/10/20/30/…) and
the counter stays a counter. Encoding "2 of 3 shards" into the main state as 21/22/23 makes
every page condition and every branch harder to read.

**Why `>= 3` and not `== 3`:** defensive. If the count ever exceeds 3 through some path you did
not anticipate, the quest still advances rather than sticking.

`\V[41]` in the message shows live progress for free.

For several **independent** objectives in one stage, use three plain variables (clearest), or
bit flags in one variable when there are more than about four — with the bit assignment written
in a Comment beside it.

---

## 4. Branching outcome

Keep progress and choice on **separate axes**.

```
VAR_QUEST_Feud_Progress   0 / 10 / 20 / 100        linear, comparable
VAR_QUEST_Feud_Side       0 undecided · 1 miller · 2 baker
```

At the branch point:

```
◆Text: "Both of them are waiting on your word."
◆Show Choices: [Side with the miller, Side with the baker, Say nothing]
  ◆When Side with the miller:
    ◆Control Variables: [VAR_QUEST_Feud_Side] = 1
    ◆Control Variables: [VAR_ARG_0] = 20
    ◆Common Event: CE_QUEST_Feud_Set
  ◆When Side with the baker:
    ◆Control Variables: [VAR_QUEST_Feud_Side] = 2
    ◆Control Variables: [VAR_ARG_0] = 20
    ◆Common Event: CE_QUEST_Feud_Set
  ◆When Say nothing:
    ◆Text: "They'll not wait forever."
```

Downstream events branch on `VAR_QUEST_Feud_Side` while page conditions still use the linear
progress variable.

**Why not encode branches into the progress numbers** (110/120/210/220…): it works for one
branch and collapses at the second. Two axes stay readable at any number of branches, and
"how far along is this quest" remains a single comparable number.

**Failure as a state, not an absence:**

```
Page 1  [always]                              stranger
Page 2  [Var VAR_QUEST_Feud_Progress >= 10]   in progress
Page 3  [Var VAR_QUEST_Feud_Progress >= 100]  completed
Page 4  [Var VAR_QUEST_Feud_Progress >= 900]  "You left them to it, didn't you."
```

Page 4 is highest so failure overrides everything, and the NPC can acknowledge it — which is
the entire point of modelling failure explicitly rather than just never advancing.

---

## 5. Repeatable quest

```
VAR_QUEST_Bounty         0 / 10 / 20 / 100      the current run
VAR_CNT_BountyDone       how many runs completed
VAR_QUEST_Bounty_Day     the day the last run was completed
```

In the dispatcher's `>= 100` branch:

```
◆Control Variables: [VAR_CNT_BountyDone] += 1
◆Control Variables: [VAR_QUEST_Bounty_Day] = VAR_SYS_Day
◆Control Variables: [VAR_QUEST_Bounty] = 0        ← reset for the next run
```

Setting the state back to 0 is the one place the monotonic guard must be bypassed — do it
inside the dispatcher, not from a caller, so the exception is visible in one place. Add a
Comment saying why.

Gate re-offering on the day so it is not farmable in a single visit:

```
◆Control Variables: [VAR_TMP_Delta] = VAR_SYS_Day
◆Control Variables: [VAR_TMP_Delta] -= VAR_QUEST_Bounty_Day
◆Conditional Branch: Var VAR_TMP_Delta >= 1
  ◆(offer a new bounty)
◆Else
  ◆Text: "Nothing new on the board today."
◆
```

Scale the reward with `VAR_CNT_BountyDone` if repeats should stay worthwhile.

---

## 6. Testing checklist

Walk the transition table, then specifically verify:

- [ ] **Talk twice at every stage.** No double rewards, no stuck dialogue.
- [ ] **Out of order.** Pick up the quest item before being asked — the monotonic guard should
      absorb it.
- [ ] **Leave and return mid-quest**, including saving and reloading.
- [ ] **The terminal state.** Talk to every quest NPC; they should all acknowledge completion.
- [ ] **Inventory.** No orphaned quest items or key items left behind.
- [ ] **Switches.** Everything the quest turned on for its duration is turned off again.
- [ ] **Failure/timeout**, if implemented, is reachable and acknowledged.

A single quest variable is trivially settable from the **F9 debug window** during playtest, so
stage-jumping for tests takes seconds — one more reason to prefer it over a switch farm.
