# Event State Machines

The single technique that most improves large RPG Maker projects: replace a pile of unrelated
switches with **one variable holding a named state**.

---

## 1. Why a variable beats N switches

With 6 booleans you have 64 representable combinations, 58 of which are nonsense
("quest completed but not started"). Bugs live in those 58. With one variable you have exactly
the states you defined, and a single place to inspect when something is wrong.

Practical wins:
- One value to print when debugging (`\V[31]` in a debug message, or the F9 debug window).
- Impossible to be in two states at once.
- A new stage is a new number, not a new switch ID hunt.
- Page conditions read naturally as thresholds.
- Skipping to a stage for testing is one `Control Variables`.

---

## 2. The numbering convention

**Use gaps of 10, and reserve 100 for "finished".**

```
QUEST_Blacksmith
   0   UNKNOWN     — player has not met the smith
  10   OFFERED     — smith asked for iron ore
  20   ACTIVE      — player accepted
  30   ORE_FOUND   — player has the ore, has not returned
 100   COMPLETE    — reward given
 900   FAILED      — smith left town (optional failure band)
```

Gaps let you insert `15 — heard a rumour` later without renumbering anything. Reserving a high
value for the terminal state means `>= 100` reads as "done" forever, and reserving 900+ for
failure means `>= 900` reads as "failed" and sorts above every success state — which matters
because pages are scanned bottom-up.

Always write the value table in a Comment at the top of the owning event, and in the variable's
name if the project's naming allows.

---

## 3. Encoding conditions with a `>=`-only page condition

Page conditions only support `variable >= value`. Every state test must be expressed as a
threshold, exploiting bottom-up page selection.

### Exact-value states — use bands, highest page last

```
Page 1  (none)                       state 0    stranger
Page 2  Var QUEST >= 10              state 10   offering the quest
Page 3  Var QUEST >= 20              state 20-30 in progress
Page 4  Var QUEST >= 100             state 100  completed, thanks the player
```

Page 4 wins whenever `QUEST >= 100`, page 3 whenever `20 <= QUEST < 100`, and so on. **Each
page implicitly covers the range up to the next page's threshold.** This is the whole trick.

### "Less than" — put the state on a *higher* page and make it blank

There is no `<` page condition. To hide an NPC before stage 20:

```
Page 1  (none)                blank, no commands       ← invisible while QUEST < 20
Page 2  Var QUEST >= 20       sprite + dialogue
Page 3  Var QUEST >= 100      blank                    ← invisible again after completion
```

### Exact equality — branch inside, not by page

When you truly need `== 30` and not `>= 30`, use a Conditional Branch (which has the full
operator set) inside the page. Do not contort the page conditions.

### Combining a state variable with a switch
Page conditions allow two switches *and* one variable simultaneously, which covers almost
every real case: `Switch SW_Story_Act2` + `Var QUEST_Blacksmith >= 20`.

---

## 4. Transitions

Write transitions as a table before you build anything:

| From | Event / trigger | To | Side effects |
|---|---|---|---|
| 0 | Talk to smith | 10 | — |
| 10 | Choose "I'll help" | 20 | Journal entry; `SW_Mine_Open` ON |
| 10 | Choose "No" | 10 | Alternative line, no state change |
| 20 | Pick up ore (mine map) | 30 | Gain Item Iron Ore ×1 |
| 30 | Talk to smith | 100 | Lose ore, gain sword, gold +50; `SW_Mine_Open` OFF |
| 100 | Talk to smith | 100 | Idle post-quest line |

Then verify three things:
1. **Every state has an exit** (or is deliberately terminal).
2. **Every state has an entry** (unreachable states are dead code — delete them).
3. **The terminal state is idempotent** — talking again must be safe and must not re-award.

The last point is the most commonly missed. Always give the completed state its own branch
that awards nothing.

### Set the state as the *last* thing

Perform effects (items, switches, messages) first, then advance the state. If the player closes
the game mid-scene, the state is a truthful record of what completed.

---

## 5. Two useful shapes

### The dispatcher Common Event

For a quest touched by many events, centralise the transitions:

```
CE_Quest_Blacksmith_Advance                (trigger: None)
  ◆Comment: In: TMP_arg0 = requested new state. Out: QUEST_Blacksmith updated + journal.
  ◆Conditional Branch: TMP_arg0 > QUEST_Blacksmith        ← never move backwards
    ◆Control Variables: QUEST_Blacksmith = TMP_arg0
    ◆Common Event: CE_Journal_Refresh
  ◆
```

Every caller does `Control Variables: TMP_arg0 = 30` then `Common Event: CE_Quest_..._Advance`.
The monotonic guard makes out-of-order triggers harmless — a real robustness win when the
player can do things in an unexpected order.

### Sub-state in a second variable

When a stage has internal progress (collect 5 herbs), do not encode it in the main state.

```
QUEST_Herbs        = 20            (ACTIVE)
QUEST_Herbs_Count  = 0..5          (sub-progress)
```

The herb events increment the counter and, on reaching 5, call the dispatcher to move the main
state to 30. Main state stays coarse and readable; the counter stays a counter.

---

## 6. NPC behaviour state machines

The same discipline applies to moment-to-moment behaviour. A guard:

```
NPC_Guard_State (per-guard, or Self Switches when there is only one guard per event)
  0  PATROL     walking its route
  1  ALERTED    noticed something, turning
  2  CHASING    pursuing the player
  3  RETURNING  going home
  4  FRIENDLY   after the story switch
```

For a *single* event, prefer **Self Switches** over a global variable — A = chasing,
B = returning, C = friendly — because they cost nothing globally and the event is the only
reader. Use a global variable only when something outside the guard needs to know its state
(an alarm system, a HUD, other guards).

Each behaviour becomes a page:

```
Page 1  (none)                          PATROL:   Custom autonomous route, plus a gated sensor
Page 2  Self Switch A                   CHASING:  Approach movement, Event Touch → caught
Page 3  Self Switch B                   RETURNING: move route home, then clear B
Page 4  Switch SW_Story_GuardsFriendly  FRIENDLY: normal NPC, Action Button dialogue
```

The story page is highest so it wins over any behaviour state — a clean way to say "this
override beats everything".

---

## 7. Anti-patterns

| Anti-pattern | Why it hurts | Fix |
|---|---|---|
| A switch per quest step | Combinatorial nonsense states; unreadable | One state variable |
| State values 1,2,3,4 with no gaps | Inserting a step renumbers everything | Gaps of 10 |
| State advanced in five different events with no guard | Out-of-order play breaks it | Monotonic dispatcher CE |
| Terminal state falls through to the "in progress" branch | Infinite reward exploit | Explicit `>= 100` branch first |
| State meaning documented nowhere | Nobody can maintain it, including you | Comment header + variable name |
| Using the state variable for two unrelated things | Aliasing bugs | One variable, one concept |
| Page condition `>= 20` intended as `== 20` | Later stages wrongly match | Higher page with the next threshold, or branch inside |
