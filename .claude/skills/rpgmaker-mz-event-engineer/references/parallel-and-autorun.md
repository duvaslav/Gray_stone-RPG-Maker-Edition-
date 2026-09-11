# Parallel and Autorun — how they really work, and how to avoid them

The two triggers that cause the most bugs and the most lag. Almost every "I need a Parallel
Process" instinct is wrong.

---

## 1. Autorun

### Mechanics

```js
Game_Event.prototype.update = function() {
    Game_Character.prototype.update.call(this);
    this.checkEventTriggerAuto();        // if (trigger === 3) this.start();
    this.updateParallel();
};
```

`checkEventTriggerAuto` runs **every frame**. `Game_Map.updateInterpreter` runs the map
interpreter, and when it finishes, immediately calls `setupStartingEvent()` again — which
finds the same Autorun still flagged as starting.

So an Autorun page **restarts the instant it finishes**, forever, until its page stops being
the active page. While it runs, `$gameMap.isEventRunning()` is true: the player cannot move,
no other map event can trigger, and no touch/action check fires.

Autorun Common Events are lower priority than Autorun map events — `setupStartingEvent`
checks map events first — so a never-ending Autorun map event starves every Autorun Common
Event on that map.

### The only correct pattern

Every Autorun must end by **changing its own page conditions on every path through it**:

```
◆Comment: CUT_ThroneRoom — one-shot arrival cutscene
◆Comment: Entry: SW 42 CUT_ThroneArrival ON.  Exit: SW 42 OFF, SW 43 ON.
◆(cutscene body)
◆Control Switches: [42] = OFF        ← guaranteed exit, LAST line, indent 0
```

Acceptable exits:

| Exit | When to use |
|---|---|
| `Control Switches` OFF on the page's own condition switch | Global one-shot scenes |
| `Control Self Switch` A = ON, with a page above conditioned on A | Per-event one-shot, the default choice |
| `Control Variables` moving a state variable past the page's threshold | State-machine driven scenes |
| `Transfer Player` to another map | Arrival/departure scenes — but the Autorun *keeps running* until the list ends, and the switch state travels with it |
| `Erase Event` | Only for genuinely single-visit actors; state is lost on map re-entry |

**Never acceptable:** relying on the list simply ending, or on a `Break Loop`, or on the
player doing something. Those do not change the page.

### Failure modes to check for

- The exit command sits **inside a Conditional Branch** and some path skips it.
- The exit is after a `Show Choices` and one branch runs `Exit Event Processing` first.
- The exit switch is the *wrong* switch (a near-miss ID).
- Two Autorun pages on the same map both stay active — the lower Event ID wins and the other
  never runs, which reads as "my second cutscene never plays".
- An Autorun on a map the player can re-enter, whose switch is never turned off — the scene
  replays every visit.
- An Autorun triggered by a Variable page condition, where the variable is set *inside* the
  Autorun to a value that still satisfies `>=`. Remember page conditions are `>=` only.

### Autorun vs a touch-triggered event

For "cutscene when the player walks in", both work:

- **Autorun + Switch** — fires regardless of entry point, needed when the player is
  transferred in. The standard choice for story scenes.
- **Player Touch event on the doorway tile** — fires only if the player crosses that tile,
  and does not need a global switch. Better for local, repeatable, non-story triggers.

Use Autorun when the scene *must* happen; use touch when it is positional.

---

## 2. Parallel

### Mechanics

Every event page with `trigger === 4` gets its **own** `Game_Interpreter`, created in
`setupPageSettings` and driven in `updateParallel`:

```js
if (!this._interpreter.isRunning()) this._interpreter.setup(this.list(), this._eventId);
this._interpreter.update();
```

`Game_CommonEvent` does the same for Common Events with `trigger === 2`, gated by
`isActive() → trigger === 2 && $gameSwitches.value(switchId)`.

Facts that follow:

- **Parallel is an infinite loop.** The list runs to the end, terminates, and is set up again
  next frame. There is no "run once" trigger.
- **Every parallel runs in the same frame as every other**, and alongside the map interpreter.
  A Parallel keeps executing while an Autorun is blocking the player, while a message box is
  open, and during a cutscene.
- The whole list runs **within one frame** unless a `Wait` (or a waiting command) is hit.
  Command count is not the cost driver; per-frame *repetition* is.
- Parallel Common Event objects are constructed once at map setup from
  `parallelCommonEvents()`. Adding a new parallel Common Event mid-session does nothing until
  the map reloads. Their `_interpreter` is created/destroyed by `refresh()` when the gating
  switch flips.
- Parallel map events are **not** distance-culled. `isNearTheScreen()` gates autonomous
  *movement*, not `updateParallel`. Fifty parallel events on a large map all run every frame
  even when far off-screen.
- A Parallel event whose page becomes inactive stops immediately and **loses its position in
  the list** — it restarts from the top when reactivated. Never assume a parallel resumes.

### The cost model

Per frame, per active parallel, the engine pays: one interpreter `update()`, plus the
execution of every command from the current index up to the next wait. So:

| Shape | Cost per second |
|---|---|
| No `Wait` at all | 60 full passes |
| `Wait 1 frame` at the end | 30 full passes |
| `Wait 10 frames` | ~6 passes |
| `Wait 30 frames` | 2 passes |
| `Wait 60 frames` | 1 pass |

A `Wait 1` genuinely halves the work, because the pass is split across two frames. That is the
cheapest possible improvement and costs nothing perceptually for most checks.

**Put the `Wait` at indent 0, at the end of the list — not inside a conditional branch.**
A `Wait` inside an `if` only throttles the iterations that take that branch; the others still
run at full speed.

---

## 3. Seven patterns to use instead of (or with) a naive Parallel

### A. One-shot Parallel
For "do something once, in the background, without blocking the player" — e.g. an ambient
sound fade-in on map entry.

```
Page 1: trigger Parallel, no conditions
  ◆(do the thing)
  ◆Control Self Switch: A = ON
Page 2: condition Self Switch A, trigger Parallel, EMPTY list
```

Page 2 must be empty *and* Parallel (or better, Action Button with an empty list) so that no
interpreter work happens at all. **Prefer conditioning page 2 to a non-parallel trigger**: an
Action Button page with a blank list creates no interpreter and costs literally nothing.

### B. Switch-gated Parallel
Never leave a Parallel running with no conditions. Put the system switch on the page:

```
Page 1: (no conditions)          trigger Action Button, empty  ← idle, free
Page 2: condition Switch SYS_ChaseActive, trigger Parallel      ← only runs when needed
```

The idle case must cost nothing. A "Parallel that immediately checks a switch and exits" still
pays for interpreter setup and one pass every frame — a page condition costs nothing.

### C. Periodic polling
When you genuinely must poll, poll at the coarsest rate the feel allows.

```
◆Loop
  ◆(check)
  ◆Wait: 20 frames
◆Repeat Above
```
or simply end the list with `Wait: 20` and let the natural restart loop it. Proximity checks
at 10–20 frames are indistinguishable from every-frame; UI numbers at 30 frames are fine.

### D. Local parallel sensor
One parallel **per sensing event**, gated by its own Self Switch, checking only its own
neighbourhood — and switching itself off the moment it fires.

```
Page 2 (Self Switch A off, Switch SYS_Stealth on), Parallel:
  ◆Control Variables: [TMP_dx] = Character[This] Map X
  ◆Control Variables: [TMP_dx] -= Character[Player] Map X   (then abs via branches)
  ◆Conditional Branch: TMP_dist <= 3
    ◆Control Self Switch: A = ON        ← disables this parallel
    ◆(react)
  ◆Wait: 10
```

### E. Global system Parallel
**One** parallel Common Event that owns a whole subsystem (clock, weather, HUD refresh),
rather than N per-map parallels. It survives map changes, is easy to find, easy to disable
with one switch, and its cost is paid once.

Prefer one 15-frame global tick over ten 1-frame local ones.

### F. Timer-based check
`Control Timer` runs independently of any interpreter. Start it, then check
`Conditional Branch: Timer <= 0 sec` from an existing parallel or from the event that cares —
no dedicated polling loop needed for the countdown itself.

### G. Dirty-flag / update-on-change (the best one)
Do not poll for a change; **make the thing that causes the change announce it.**

Instead of a parallel asking "does the player have 10 herbs yet?", put the check in the event
that *grants* herbs, and have it set `QUEST_HERBS = 20` when the count reaches 10. Instead of a
parallel watching the player's position, use a Player Touch event on the tile.

This eliminates the parallel entirely and is almost always available. Ask, for every proposed
parallel: *what actually causes this condition to become true, and can that thing set the
state itself?*

---

## 4. Decision procedure

Before creating any Parallel, answer in order:

1. **Is there a discrete cause?** → Use a touch/action trigger or set the state at the cause
   (pattern G). Stop.
2. **Does it only matter during a bounded activity?** → Switch-gated Parallel that turns itself
   off when the activity ends (pattern B/D). Stop.
3. **Does it need to run once?** → One-shot Parallel with a Self Switch (pattern A). Stop.
4. **Is it a genuine continuous global system** (clock, weather, HUD, input polling)? → One
   global Parallel Common Event with a sensible `Wait` (pattern E).
5. **Does it truly need per-frame precision?** (custom movement, input-driven mechanics) →
   Parallel with no wait is acceptable. Keep it to one, keep the body short, and gate it.

Legitimate uses of an ungated per-frame parallel are rare: real-time input handling, a custom
minigame loop, or a smooth per-frame interpolation. Everything else can be throttled.

---

## 5. Diagnosing an existing project

Symptoms and their usual cause:

| Symptom | Likely cause |
|---|---|
| Game freezes on entering a map, no input | Autorun with no exit, or an exit inside a skipped branch |
| Second cutscene never plays | Two Autoruns active; lower Event ID never ends |
| FPS drops on one map only | Many ungated Parallels, or a Parallel with no `Wait` doing picture/script work |
| An effect repeats endlessly (SE machine-guns) | Parallel doing a one-shot action with no self-switch guard |
| Parallel logic "resets itself" | Page condition flickered; the parallel restarts from the top on every reactivation |
| Something works on one map and not another | Parallel Common Event list is fixed at map setup; check the gating switch and `trigger === 2` |

`scripts/validate_events.py` flags Autoruns with no visible exit, Parallels with no `Wait`,
and loops with no `Wait` or `Break Loop`.
