# Event Architecture — choosing the right structure

The most valuable decision you make is *where state lives*. Everything downstream —
readability, bugs, performance, extensibility — follows from it.

---

## 1. The four state containers

| Container | Scope | Values | Persisted in saves | Cost |
|---|---|---|---|---|
| **Self Switch** | One event, one map (`[mapId, eventId, letter]`) | 4 booleans (A–D) | yes | free |
| **Switch** | Global | boolean | yes | free |
| **Variable** | Global | any number (or object via script) | yes | free |
| **Erase Event** | One event, until the map reloads | — | **no** | free |

Plus **Event Page** as the *selector* over that state, and **Common Event** as reusable
behaviour rather than state.

### Choosing

```
Is the state about ONE specific event, and nothing else needs to read it?
  → Self Switch.                       (chests, doors, one-shot NPC lines, sensor armed/disarmed)

Is it a global yes/no that several things read?
  → Switch.                            (story flags, "the bridge is repaired", system enables)

Does it have more than two meaningful values, or is it a count, phase or progress?
  → Variable.                          (quest stages, puzzle step counters, time of day, NPC schedules)

Is it behaviour rather than state, used in more than one place?
  → Common Event.

Is it temporary, only meaningful for the next few commands?
  → A dedicated temp Variable (see style-guide.md's TMP_ band) — and never store anything
    across a Wait in a temp variable that a parallel might also use.
```

### Self Switches are underused

Four Self Switches per event is a lot of local state, and they cost nothing globally.
Anything answerable by "has *this* event been used / opened / talked to / triggered" should
be a Self Switch, not a global Switch. A project with `SW_Chest_Cave1_Opened` through
`SW_Chest_Cave1_Opened_47` has made an architectural mistake.

**Self Switch limits worth knowing:**
- Only A, B, C, D.
- Only settable for "this event" by the standard command — `Control Self Switch` writes
  `[this._mapId, this._eventId, letter]`. Setting *another* event's self switch requires a
  script call (`$gameSelfSwitches.setValue([mapId, eventId, "A"], true)`) — see
  `advanced-tricks.md`.
- The key includes the map ID and event ID. **Renumbering an event silently reassigns its
  saved local state.**
- Self switch state survives leaving and re-entering the map; `Erase Event` does not.

### Switches are for *shared* facts

A Switch is justified when two or more events must agree about something, or when a page
condition elsewhere needs it. If exactly one event reads it and exactly one writes it, and
they are the same event, it should have been a Self Switch.

### Variables are for *ordered* or *counted* state

Any time you find yourself creating `SW_Quest_Started`, `SW_Quest_TalkedToSmith`,
`SW_Quest_GotOre`, `SW_Quest_Done`, stop: that is one variable with four values. See
`event-state-machines.md`.

Remember the constraint that shapes all of this: **page conditions compare variables with `>=`
only.** Conditional Branch has the full operator set; page conditions do not.

---

## 2. Event Pages as states

A page *is* a state. Model an object as a small state machine and give each state a page.

```
Chest                       Door (locked)                NPC across a quest
  Page 1  closed              Page 1  locked               Page 1  stranger
  Page 2  opened (SS A)       Page 2  unlocked (SW Key)    Page 2  quest offered   (VAR >= 10)
                                                           Page 3  quest active    (VAR >= 20)
                                                           Page 4  quest complete  (VAR >= 100)
```

### Page ordering rules

Because the engine scans **bottom-up and takes the first match**:

- Page 1 must be the **most general fallback** (usually no conditions at all).
- Later pages are **more specific**. With a state variable, higher pages carry higher
  thresholds.
- Never leave a gap where no page matches unless invisibility is what you want — the event
  becomes blank, intangible and untriggerable.
- Never add a blank page "to hide the event" without checking what else it turns off: it also
  clears the trigger and sets Through, which is usually fine, but the event will also refuse to
  start (`list.length <= 1`) even if you later add commands to a lower page.

### When *not* to add a page

Pages are cheap but they duplicate settings. If two states differ only in dialogue, use **one
page with a Conditional Branch** on the state variable instead. Rule of thumb:

- Different **graphic, movement, priority, or trigger** → different page.
- Different **words only** → same page, branch inside.

Ten pages that all look the same and differ by one line of text is worse than one page with a
branch. Four pages that look and behave differently is correct.

---

## 3. Common Events as functions and as systems

Three distinct uses, do not confuse them:

1. **Function** (`trigger: None`, called with command 117): reusable logic. See
   `common-events.md`.
2. **Autorun system** (`trigger: Autorun` + switch): a blocking global sequence — a game-over
   handler, a forced tutorial. Rare, and it competes with map Autoruns (map events win).
3. **Parallel system** (`trigger: Parallel` + switch): a background global process — clock,
   weather, HUD. One per subsystem, gated by a switch.

Extract to a Common Event when: the same 6+ commands appear in three or more events; the logic
will need to change in one place later; or a map event needs to survive the player leaving the
map.

Do **not** extract when it makes the calling event unreadable — a two-line Common Event called
once is worse than the two lines inline.

---

## 4. Worked example: the scheduled, quest-aware NPC

*"Morning near his house, daytime in the shop, evening at the tavern, reacts to a quest,
changes dialogue, and disappears after a story event."*

### Wrong instinct
One NPC event with a Parallel that constantly checks the clock and force-moves him, plus eight
switches for quest states, plus separate copies on each map.

### Correct architecture

**State inventory** — separate the *orthogonal* axes:

| Axis | Container | Why |
|---|---|---|
| Time of day | `SYS_TimeOfDay` variable (0 morning, 1 day, 2 evening, 3 night) | ordered, many values, globally shared, owned by one clock system |
| Quest progress | `QUEST_Miller` variable (0/10/20/100) | ordered stages |
| Story removal | `SW_Story_MillerGone` switch | a single global boolean many things read |
| "Talked to him today" | Self Switch D on each instance | local, per-event |

**Placement** — the NPC does not walk between maps. He is **three separate events**, one per
location, each with pages conditioned on the time variable. This is the standard solution and
it is correct: it is cheaper, it needs no pathfinding, it survives the player not being there
to watch, and each instance can have its own local state.

**Page layout for the shop instance:**

```
Page 1  (no conditions)                       blank graphic, no commands    ← not present
Page 2  Var SYS_TimeOfDay >= 1                sprite, Action Button
        AND Switch SW_Story_MillerGone is OFF   ...but pages allow only 2 switch slots
```

Two switch slots is a real constraint, so invert it: make the *removal* the highest page.

```
Page 1  —                                  blank            (absent in the shop)
Page 2  Var SYS_TimeOfDay >= 1             present, dialogue via CE_Miller_Talk
Page 3  Var SYS_TimeOfDay >= 2             blank            (he has gone to the tavern)
Page 4  Switch SW_Story_MillerGone         blank            (gone for good — highest page wins)
```

Because the scan is bottom-up, page 4 overrides everything once the story flag is set, and
page 3 blanks him in the evening without needing a "less than" condition. **Encoding "not
present" as a higher blank page is the idiomatic way to express a `<` condition.**

**Dialogue** lives in one Common Event `CE_Miller_Talk` that branches on `QUEST_Miller`, called
by all three instances. One place to edit his words.

**Movement**: none. No parallel, no move routes, no pathfinding. He simply exists in different
places at different times — which is exactly what the player perceives.

**The clock** is one Parallel Common Event with a 60-frame wait that advances
`SYS_TimeOfDay`, gated by a switch so it can be paused during cutscenes.

Total cost: one global parallel; zero per-NPC runtime cost.

---

## 5. Local vs global — a checklist

Ask of every piece of state:

- **Who writes it?** One event → probably local.
- **Who reads it?** One event → definitely local. Several maps → global.
- **Does it need to survive the map unloading?** Erase Event does not; Self Switch does.
- **Is it about the world or about this object?** World → Switch/Variable. Object → Self Switch.
- **Will there be many copies of this object?** Then it must be local, or you will be minting
  a switch per copy.

---

## 6. Proportionality

The single most common failure of an eager designer is over-engineering. Calibrate:

| Task | Right structure |
|---|---|
| Treasure chest | 2 pages, Self Switch A. Nothing else. |
| Simple door to another map | 1 page, Transfer Player. Not even a self switch. |
| Locked door + key | 2 pages (locked / unlocked), condition on an Item or a Switch |
| Sign / flavour NPC | 1 page, 1 Show Text |
| NPC with 3 quest reactions | 1 page + Conditional Branch on the quest variable |
| NPC that also changes sprite per stage | 3 pages on variable thresholds |
| 5-stage quest across 3 maps | 1 quest variable + a Common Event for the shared journal update |
| Day/night, weather, HUD | 1 gated Parallel Common Event each |
| Chase-and-return guard | 1 event, 3 pages, a Self Switch and one gated parallel sensor |

And the inverse failure: a 12-step quest tracked by 12 unrelated global switches with names
like `SW_0034`. That is not simplicity, it is unmaintainable.

**Rule: the structure should be the smallest one in which every state transition is obvious.**
