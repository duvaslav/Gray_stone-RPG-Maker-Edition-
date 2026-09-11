# Performance

Optimise what actually costs, not what looks expensive. Most "event lag" folklore is wrong.

---

## 1. The frame budget

At 60 fps you have ~16.6 ms per frame. Per frame the engine runs, in order:

```
Game_Map.update()
  refreshIfNeeded()            ← only when a switch/variable/self switch changed
  updateInterpreter()          ← the map interpreter, plus starting-event resolution
  updateScroll()
  updateEvents()               ← EVERY Game_Event.update(), then EVERY parallel Game_CommonEvent
  updateVehicles(); updateParallax()
Game_Player.update()
Sprite/renderer updates
```

`updateEvents` walks **every event on the map every frame**, whether or not it is on screen.
`Game_Event.update()` itself is cheap (a stop-count increment, an autorun check, and — only if
the page is Parallel — an interpreter update). What costs is what those interpreters *do*.

---

## 2. What actually costs

Ranked, worst first.

### 1. Parallel processes — by far the dominant cost
Each active parallel runs its command list to the next wait, **every frame**. Ten ungated
parallels with no `Wait` is ten full command lists 60 times a second. This is the cause of
almost every real event-lag report.

The fix is architectural, not micro-optimisation: gate parallels behind page conditions, add a
`Wait`, or replace them with event-driven state changes. See `parallel-and-autorun.md`.

### 2. Per-frame pathfinding
`findDirectionTo` is A* with `searchLimit() === 12`, so it can expand a few hundred nodes per
call. `Move toward Player` in an autonomous route does **not** pathfind (it is a greedy step),
but the player's own click-to-move does, and so does any script call you write. One chaser at
10-frame intervals is fine; twenty chasers per frame is not.

### 3. Picture manipulation every frame
`Tint Picture` or `Move Picture` on a large picture, re-issued each frame from a parallel,
forces tone recalculation and re-rendering. Set a picture once with a duration and let the
engine tween it, rather than nudging it every frame.

### 4. Waitless loops
A `Loop`/`Repeat Above` with no `Wait` runs until `checkFreeze()` trips at **100 000 commands
in one frame**. That is not "some lag" — that is a hung-looking game. The same now applies to
Label/Jump loops in MZ ≥ 1.5.

### 5. Very large numbers of events on one map
Several hundred events cost measurably even when idle, because `updateEvents` iterates them
all and each `Game_Event.update()` runs. This only matters at scale (300+); a map with 40
events is not the problem.

### 6. Script calls — *sometimes*
A script call is a JS `eval` of a string. `eval` is genuinely slower than a compiled call, so
running one every frame in a parallel is worse than the equivalent event command. Running one
on an Action Button press is free. **The cost is the frequency, not the script.**

---

## 3. What does *not* cost (common myths)

| Myth | Reality |
|---|---|
| "Long events cause lag" | The interpreter runs commands in a tight `while` loop within one frame. 200 `Control Variables` in a row cost microseconds. Length is irrelevant; **repetition** is the cost |
| "Lots of Conditional Branches are slow" | A branch is a switch statement and a comparison. A 40-branch ladder run once on interaction is free. A 40-branch ladder in a waitless parallel is the parallel's fault, not the branches' |
| "Autorun causes lag" | Autorun blocks the player but does not burn extra cycles; it runs one command list per frame like any interpreter. Autorun causes *freezes*, not lag |
| "Self switches are slower than switches" | Both are hash/array lookups. Identical in practice |
| "Many switches/variables slow the game" | They are plain arrays. Thousands are fine. Save file size grows trivially |
| "Move routes are expensive" | Movement is a few float updates per frame per character. Only pathfinding is expensive |
| "Common Events are slower than inline commands" | One extra child interpreter object per call. Negligible |
| "Erase Event improves performance" | It stops the event drawing and triggering, but the object still exists and is still iterated. Marginal |
| "Comments slow the event down" | `command108` reads a string. Free. Comment generously |

**The one-line summary:** *cost is per-frame work, and per-frame work means Parallel.*

---

## 4. Measuring instead of guessing

- **F2** in playtest toggles the FPS/ms meter. Watch it, do not theorise.
- Bisect: turn off the switch gating your parallels one at a time and watch the meter.
- `console.log` from a script call inside a suspect parallel and watch the console flood rate —
  it directly shows the iteration frequency.
- Compare an empty map with the suspect map. If an empty map is also slow, the problem is not
  events (check plugins, picture layers, or the renderer).
- Chrome DevTools (F12 in playtest) → Performance tab gives a real profile. `Game_Interpreter`
  frames dominating the flame graph confirms an event cause.

---

## 5. Optimisation techniques, in order of payoff

1. **Delete the parallel.** Ask what causes the condition and set the state there instead
   (dirty-flag pattern). Biggest win available.
2. **Gate it with a page condition.** An inactive page creates no interpreter at all. This is
   strictly better than a parallel that checks a switch and exits.
3. **Add a `Wait`** at indent 0 at the end of the list. `Wait 10` cuts the cost by ~85 %.
4. **Merge parallels.** One map controller doing five checks beats five parallels doing one
   each — one interpreter instead of five.
5. **Early-out cheaply.** Order checks so the cheap test (distance) gates the expensive one
   (region lookups, pathfinding, script).
6. **Cache in variables.** Compute the player's region once per tick into a variable that other
   logic reads, rather than each consumer calling `Get Location Info`.
7. **Move work to the transition.** Recompute a derived value when its inputs change, not every
   frame.
8. **Throttle pathfinding** to every 5–10 frames; nobody perceives the difference.
9. **Split enormous maps.** Fewer live events per map, and it helps load time too.

---

## 6. Performance checklist

Run this over any map that feels slow, or before shipping a map with systems on it:

- [ ] How many event pages on this map have trigger **Parallel**? (Target: 0–2.)
- [ ] Is every parallel **gated** by a page condition, so it does not exist when unneeded?
- [ ] Does every parallel end with a `Wait` at **indent 0**, outside all branches?
- [ ] Is the `Wait` as long as the feel allows? (10–20 frames for sensing; 60 for clocks.)
- [ ] Does any `Loop` lack both a `Wait` and a guaranteed `Break Loop`?
- [ ] Does any Label/Jump loop lack a `Wait`?
- [ ] Is any script call executed every frame? Could its result be cached?
- [ ] Is pathfinding running for more than one character at a time?
- [ ] Are pictures being moved/tinted per frame instead of tweened with a duration?
- [ ] How many Parallel **Common Events** are active globally? Each runs on every map.
- [ ] Does the map have more events than it needs? (Merge scenery; delete leftovers.)
- [ ] Are one-shot parallels disabling themselves (self switch to an empty non-parallel page)?

`scripts/validate_events.py` reports parallel counts per map, parallels with no wait, and
unbounded loops.

---

## 7. Rules of thumb

- **One global parallel Common Event per subsystem**, gated. Not one per map, not one per NPC.
- **Zero to two parallels active per map** during normal play.
- **A parallel that has done its job must switch itself off.** The self-switch-to-empty-page
  pattern costs nothing once complete.
- **`Wait 1` is never wrong** on a polling parallel — it halves the cost for free.
- **Prefer page conditions to runtime checks.** A condition the engine evaluates on refresh is
  cheaper than a branch evaluated every frame.
- Optimise only what you have measured. A readable event that runs once on interaction needs no
  optimisation, ever, regardless of length.
