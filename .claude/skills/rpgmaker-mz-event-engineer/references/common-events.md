# Common Events — the function abstraction

`data/CommonEvents.json`, entries of `{id, name, trigger, switchId, list}`.
`trigger`: 0 None · 1 Autorun · 2 Parallel.

---

## 1. How calling actually works

```js
Game_Interpreter.prototype.command117 = function(params) {
    const commonEvent = $dataCommonEvents[params[0]];
    if (commonEvent) {
        const eventId = this.isOnCurrentMap() ? this._eventId : 0;
        this.setupChild(commonEvent.list, eventId);
    }
    return true;
};
Game_Interpreter.prototype.setupChild = function(list, eventId) {
    this._childInterpreter = new Game_Interpreter(this._depth + 1);
    this._childInterpreter.setup(list, eventId);
};
```

Facts that follow, all of them load-bearing:

- **A child interpreter is created.** The parent blocks in `updateChild()` until the child
  finishes, then continues. Calls are synchronous and ordered, exactly like a function call.
- **The calling event's ID is inherited.** Inside the Common Event, `Control Self Switch`,
  `Erase Event`, `Set Movement Route: This Event`, and `Conditional Branch: Self Switch` all
  refer to **the map event that called it**. This is the mechanism that makes reusable
  interaction logic possible.
- **…unless the caller is not on the current map.** `isOnCurrentMap()` compares the
  interpreter's `_mapId` (fixed at `setup()`) with the live map. After a `Transfer Player`, or
  when called from a battle or the menu, `eventId` becomes `0` — and then every self-switch and
  "this event" operation inside the Common Event **silently does nothing**.
- **Depth is capped at 100.** `checkOverflow()` throws
  `"Common event calls exceeded the limit"` at depth 100. Direct or mutual recursion hits this
  fast and crashes the game.
- **`Exit Event Processing` (115) inside a Common Event exits only the Common Event.** The
  caller resumes at the next command. To abort the *caller* too, set a flag variable and branch
  in the caller.
- **A `Wait` inside a Common Event blocks the caller**, as you would expect from a synchronous
  call.

### Three ways to invoke

| Method | Mechanism | Caller's event ID | Blocking |
|---|---|---|---|
| Command 117 | child interpreter | inherited | yes, synchronous |
| `$gameTemp.reserveCommonEvent(id)` | queued, picked up by `setupStartingEvent` | **0** | no — runs after the current event finishes |
| `trigger: Parallel` + switch | own interpreter, every frame | 0 | no — concurrent |

`reserveCommonEvent` is how items and skills fire Common Events. In MZ it is a **queue**
(`_commonEventQueue`, FIFO) so multiple reservations all run; **[MV]** it is a single slot and
a second reservation *overwrites* the first.

---

## 2. Common Event as a function

There is no parameter passing in the engine, so establish a convention and stick to it.

### Convention

Reserve a contiguous band of variables as the argument/return registers, e.g.

```
0091  TMP_ARG0
0092  TMP_ARG1
0093  TMP_ARG2
0094  TMP_RET
```

Every function Common Event begins with a Comment stating its signature:

```
◆Comment: CE_Give_Reward
◆Comment: IN : TMP_ARG0 = item id, TMP_ARG1 = quantity
◆Comment: OUT: TMP_RET = 1 if the party had room, else 0
◆Comment: SIDE: plays SE, shows a message. Uses TMP_ARG0..1 destructively.
```

Call site:

```
◆Control Variables: [0091 TMP_ARG0] = 7
◆Control Variables: [0092 TMP_ARG1] = 1
◆Common Event: CE_Give_Reward
◆Conditional Branch: Variable [0094 TMP_RET] == 0
  ◆Text: Your pack is full.
```

### The reentrancy rule

**Argument registers are only valid from the `Control Variables` that set them to the `Common
Event` call that consumes them.** Never read `TMP_ARG0` after a `Wait`, a `Show Text`, or any
command that yields a frame — a Parallel process or another event could have run in between and
clobbered it.

If a function needs its arguments after yielding, copy them into locals at the top:

```
CE_Escort_Walk
  ◆Control Variables: [0110 TMP_LOCAL_A] = TMP_ARG0     ← snapshot immediately
  ◆(now safe to Wait, Show Text, etc.)
```

For a function that a Parallel might call, give parallels their **own** register band
(`TMP_PAR_ARG0`) so map-event calls and parallel calls can never collide.

### Return values

Same registers, written last, consumed immediately by the caller. Keep returns to one or two
values; if you need more, the abstraction is wrong — split the function.

---

## 3. Nesting and recursion

Nesting is supported and normal: a Common Event calling a Common Event calling another. Each
level is a new child interpreter, so the depth counter climbs; 100 is the ceiling.

**Recursion is possible but almost always wrong.** The engine has no local variables, so a
recursive Common Event shares one set of globals across all levels — a recursive call
overwrites the caller's working values. If you need iteration, use `Loop`/`Repeat Above` with a
counter variable, not recursion.

**Mutual recursion is the sneaky failure**: `CE_A` calls `CE_B` which, under some condition,
calls `CE_A`. Under normal play it terminates; under an unexpected state it does not, and the
game throws. `validate_events.py` reports Common Event call cycles for this reason.

---

## 4. Function vs system

| | Function CE | Autorun CE | Parallel CE |
|---|---|---|---|
| `trigger` | 0 None | 1 | 2 |
| Started by | command 117 or reserve | its switch being ON | its switch being ON |
| Caller's event ID | inherited (117) / 0 (reserve) | 0 | 0 |
| Blocks the player | only while it runs | yes | no |
| Runs once | yes | **no** — repeats until the switch goes off | **no** — repeats forever |
| Typical use | reusable interaction, shared dialogue, reward handling | forced global sequence, game-over handler | clock, weather, HUD, input polling |

**Autorun and Parallel Common Events have `eventId = 0`.** They cannot touch self switches,
cannot use "This Event", and cannot `Erase Event`. If a global system needs to act on a
specific map event, it must address it by ID (`Set Movement Route: Event 4`) or via a script
call with an explicit `[mapId, eventId]` key.

Also: the set of Parallel Common Event objects is built at **map setup**
(`Game_Map.setupEvents` → `parallelCommonEvents()`). Changing a Common Event's trigger at
runtime is not possible from events, and adding one to the data mid-session has no effect until
a map loads.

---

## 5. What belongs in a Common Event

**Good candidates**
- Shared dialogue for an NPC that exists on several maps.
- Reward granting, journal updates, quest state transitions (the dispatcher pattern).
- A repeated interaction shape: "examine this object" boilerplate, gathering nodes, save points.
- Cutscene *sections*, so a long scene becomes a readable sequence of named calls.
- Anything a battle, item, skill or menu needs to trigger (those can only reach Common Events).
- Global systems (one per subsystem, gated).

**Poor candidates**
- Two lines used once — inlining is clearer.
- Logic that depends on the calling event's *position* or page in ways not passed explicitly;
  it becomes impossible to reason about.
- Anything that needs to know "which event am I" when it may be called from a parallel or a
  battle, where the event ID is 0.

---

## 6. Composing a long cutscene from Common Events

A 400-command cutscene in one event is unreadable and unmergeable. Split it:

```
Map event (Autorun, SW CUT_Throne)
  ◆Comment: Throne room arrival — see CE 40..43
  ◆Common Event: CE_CUT_Throne_01_Entrance
  ◆Common Event: CE_CUT_Throne_02_Confrontation
  ◆Common Event: CE_CUT_Throne_03_Reveal
  ◆Common Event: CE_CUT_Throne_04_Teardown
  ◆Control Switches: [CUT_Throne] = OFF
```

Each section is independently readable and testable (call one directly to preview it). Keep the
switch-off in the *parent* so the exit is visible in one place, and keep it outside any branch.

Caveat: `Set Movement Route: This Event` inside those sections refers to the Autorun event
itself, which is usually an invisible controller — address cutscene actors by explicit Event ID.

---

## 7. Checklist for any Common Event you write

- [ ] Name states what it does (`CE_` prefix or the project's convention).
- [ ] Comment header: purpose, IN, OUT, SIDE EFFECTS, and whether it is safe to call from a
      parallel.
- [ ] Does it use "This Event" or self switches? Then document that it must be called via
      command 117 from a map event on the current map — and only that way.
- [ ] Does it yield (Wait / Show Text / Move Route with wait)? Then it must snapshot its
      arguments first.
- [ ] Does it call other Common Events? Check for cycles.
- [ ] Is the trigger right? A function must be `None`; a `Parallel` by accident is a
      permanent background loop.
