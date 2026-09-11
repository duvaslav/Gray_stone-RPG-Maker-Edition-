# Recipes — Triggers, Sensors and Systems

## 1. Proximity trigger

**First, check you need one.** If the player must reach a specific tile, a Player Touch event
is free and exact. Use a distance sensor only when the reaction radius is genuinely circular or
when the sensing event moves.

```
EV_ProximityWarning
Page 1  [always]                     Action Button / Below Characters / no graphic
        (inert — costs nothing)

Page 2  [Switch SW_MAP_WardActive]   Parallel / Below Characters
  ◆Common Event: CE_UTIL_PlayerDistance         → VAR_TMP_Dist
  ◆Conditional Branch: Var VAR_TMP_Dist <= 4
    ◆Play SE: Darkness1
    ◆Screen Flash: (100,0,0,120), 20 frames, Wait ON
    ◆Text: "The ward burns cold."
    ◆Control Self Switch: A = ON               ← page 3 wins; this parallel stops
  ◆
  ◆Wait: 10                                     ← indent 0, always runs

Page 3  [Self Switch A]              Action Button / Below Characters
        (empty — the sensor is spent)
```

**Why this shape:** page 1 is the idle state and creates no interpreter at all. The parallel
only exists while the switch is on. Setting the self switch makes page 3 active, which destroys
the parallel's interpreter — a sensor that costs exactly nothing once it has fired.

`Wait: 10` at indent 0 cuts the cost by ~85 % and is imperceptible for a 4-tile radius.

---

## 2. Region trigger

One controller per map handles every region-based zone on it:

```
SYS_RegionWatcher   Page 1  [Switch SW_SYS_RegionsOn]   Parallel / Below Characters / no graphic
  ◆Get Location Info: [VAR_TMP_Region], Region ID, at Player
  ◆Conditional Branch: Var VAR_TMP_Region == VAR_SYS_LastRegion
    ◆(unchanged — do nothing)
  ◆Else
    ◆Control Variables: [VAR_SYS_LastRegion] = VAR_TMP_Region
    ◆Conditional Branch: Var VAR_TMP_Region == 7
      ◆Play BGS: Cave, volume 60
    ◆Conditional Branch: Var VAR_TMP_Region == 8
      ◆Fadeout BGS: 2
    ◆
  ◆
  ◆Wait: 8
```

**Why one controller, not one event per zone:** one interpreter instead of N. The
"last region" comparison means the reaction fires on *entering* a region rather than every
tick — an edge-triggered check built from a level-triggered poll.

**Why regions beat coordinate maths:** arbitrary shapes, visible to the designer in the editor,
and they survive the map being redesigned.

---

## 3. Secret area

```
TRG_SecretAlcove
Page 1  [always]   Player Touch / Below Characters / no graphic
  ◆Play ME: Mystery
  ◆Text: "You've found a hidden alcove."
  ◆Change Items: Ancient Coin +1
  ◆Control Switches: [SW_MAP_SecretAlcoveFound] = ON

Page 2  [Switch SW_MAP_SecretAlcoveFound]   Player Touch / Below Characters
        (empty)
```

**Switch rather than Self Switch** here only if something else needs to know — a completion
counter, an achievement, a "secrets found: 3/8" display. If nothing else reads it, use a Self
Switch.

For the "secrets found" counter, increment `VAR_CNT_Secrets` in the same page — that is the
dirty-flag pattern: the discovery reports itself instead of anything polling for it.

---

## 4. Parallel sensor (the general shape)

Every polling sensor should look like this. Memorise the shape.

```
Page N  [gate condition]   Parallel
  ◆Comment: what this senses, and what it sets when it fires
  ◆(cheap test first — distance, a variable, a switch)
  ◆Conditional Branch: cheap test passes
    ◆(expensive test — region lookup, script, pathfinding)
    ◆Conditional Branch: expensive test passes
      ◆(react)
      ◆Control Self Switch: X = ON       ← turn yourself off if this is one-shot
    ◆
  ◆
  ◆Wait: 10                               ← indent 0, outside every branch
```

Four rules, each of which is a common failure when broken:

1. **Gate it with a page condition.** A parallel that starts by checking a switch and exiting
   still pays for interpreter setup and a full pass every frame. A page condition costs zero.
2. **`Wait` at indent 0.** A `Wait` inside a branch only throttles the iterations that take
   that branch.
3. **Cheap test outermost.** Distance before region lookups; region before pathfinding.
4. **Turn yourself off** when the job is done, by switching to a page that is not Parallel.

### The distance helper

```
CE_UTIL_PlayerDistance         (trigger: None)
  ◆Comment: OUT VAR_TMP_DX, VAR_TMP_DY, VAR_TMP_Dist (Manhattan). No yields: parallel-safe.
  ◆Control Variables: [VAR_TMP_DX] = Character[Player] Map X
  ◆Control Variables: [VAR_TMP_DX] -= Character[This Event] Map X
  ◆Conditional Branch: Var VAR_TMP_DX < 0
    ◆Control Variables: [VAR_TMP_DX] *= -1
  ◆
  ◆Control Variables: [VAR_TMP_DY] = Character[Player] Map Y
  ◆Control Variables: [VAR_TMP_DY] -= Character[This Event] Map Y
  ◆Conditional Branch: Var VAR_TMP_DY < 0
    ◆Control Variables: [VAR_TMP_DY] *= -1
  ◆
  ◆Control Variables: [VAR_TMP_Dist] = VAR_TMP_DX
  ◆Control Variables: [VAR_TMP_Dist] += VAR_TMP_DY
```

"This Event" resolves to the **calling** map event, because command 117 passes the caller's
event ID to the child interpreter. That is what makes one helper serve every sensor.

It contains no yields, so its temp variables cannot be clobbered mid-call — safe from a
parallel. A helper that *does* yield must snapshot its arguments first.

---

## 5. One-shot parallel

Background work that must happen once on map entry, without blocking the player:

```
Page 1  [always]         Parallel
  ◆(the work — fade in ambience, position NPCs, seed randomness)
  ◆Control Self Switch: A = ON

Page 2  [Self Switch A]  Action Button      ← NOT Parallel
        (empty list)
```

**Why page 2 must not be Parallel:** a Parallel page always constructs an interpreter and
updates it every frame, even with an empty list. An Action Button page with an empty list
constructs nothing. The difference is small but it is free.

Use Autorun instead when the work must block the player (a scene). Use this when it must not.

---

## 6. Timer

```
Start:   ◆Control Timer: Start, 60 sec
Check:   ◆Conditional Branch: Timer <= 0 sec
Stop:    ◆Control Timer: Stop
```

`$gameTimer` runs independently of any interpreter, counts down on its own, and displays
on screen. It does **not** need a parallel to tick.

Check it at the points that matter — when the player reaches the door, when they interact with
the mechanism — rather than polling. If you do need a poll (to fire the failure when time
expires anywhere), one gated parallel with `Wait: 30` is plenty.

**Always stop the timer** on success and on leaving the area. A forgotten timer that expires
three rooms later is a memorable bug.

For a countdown without the on-screen clock, decrement a variable from the global clock
parallel instead.

---

## 7. Random event

```
◆Control Variables: [VAR_TMP_Roll] = Random 0..99
◆Conditional Branch: Var VAR_TMP_Roll < 60
  ◆(common outcome)
◆Else
  ◆Conditional Branch: Var VAR_TMP_Roll < 90
    ◆(uncommon outcome)
  ◆Else
    ◆(rare outcome)
  ◆
◆
```

**Why thresholds on one roll** rather than nested rolls: the weights are visible at a glance
and always sum correctly. Nested rolls make "how likely is the rare outcome" require
arithmetic.

For a random encounter-style event, gate it so it cannot fire twice in the same visit
(Self Switch) or too soon (the cooldown recipe in `interactive-objects.md#11`).

---

## 8. Common Event as a function

```
CE_Give_Reward                 (trigger: None)
  ◆Comment: CE_Give_Reward
  ◆Comment: IN  : VAR_ARG_0 = item id, VAR_ARG_1 = quantity
  ◆Comment: OUT : VAR_RET_0 = 1 on success, 0 if the party had no room
  ◆Comment: SIDE: plays ME, shows a message. YIELDS (Show Text) — args are snapshotted.
  ◆Control Variables: [VAR_TMP_Item] = VAR_ARG_0          ← snapshot immediately
  ◆Control Variables: [VAR_TMP_Qty]  = VAR_ARG_1
  ◆Control Variables: [VAR_RET_0] = 1
  ◆Play ME: Item
  ◆Text: \}You obtained \V[<VAR_TMP_Qty>] item(s)!\{
  ◆(grant via a branch on VAR_TMP_Item, or a plugin command if the project has one)
```

Call site:

```
◆Control Variables: [VAR_ARG_0] = 7
◆Control Variables: [VAR_ARG_1] = 2
◆Common Event: CE_Give_Reward
◆Conditional Branch: Var VAR_RET_0 == 0
  ◆Text: "Your pack is full."
◆
```

**The reentrancy rule:** argument registers are valid only from the `Control Variables` that
set them to the `Common Event` call that consumes them. Never read them after a `Wait`, a
`Show Text`, or a waiting move route — a parallel can run in between and clobber them. Any
function that yields must snapshot its arguments into locals on its first lines, as above.

Give parallel processes a **separate** register band (`VAR_PAR_ARG_*`) so map-event calls and
parallel calls can never collide.

Item granting cannot be parameterised by variable in vanilla (`Change Items` takes a literal
item ID), so a generic giver needs either a branch ladder or a script call:
`$gameParty.gainItem($dataItems[$gameVariables.value(91)], $gameVariables.value(92))`.
That is a legitimate escalation — it collapses a 60-branch ladder into one line.

---

## 9. Global clock (the reference system parallel)

```
CE_SYS_Clock            (trigger: Parallel, gate switch SW_SYS_ClockRunning)
  ◆Comment: Advances VAR_SYS_Minutes; derives VAR_SYS_TimeOfDay (0..3).
  ◆Comment: Pause during cutscenes by turning SW_SYS_ClockRunning OFF.
  ◆Control Variables: [VAR_SYS_Minutes] += 1
  ◆Conditional Branch: Var VAR_SYS_Minutes >= 1440
    ◆Control Variables: [VAR_SYS_Minutes] = 0
    ◆Control Variables: [VAR_SYS_Day] += 1
  ◆
  ◆Control Variables: [VAR_TMP_Hour] = VAR_SYS_Minutes
  ◆Control Variables: [VAR_TMP_Hour] /= 60
  ◆Control Variables: [VAR_SYS_TimeOfDay] = 0
  ◆Conditional Branch: Var VAR_TMP_Hour >= 10
    ◆Control Variables: [VAR_SYS_TimeOfDay] = 1
  ◆
  ◆Conditional Branch: Var VAR_TMP_Hour >= 17
    ◆Control Variables: [VAR_SYS_TimeOfDay] = 2
  ◆
  ◆Conditional Branch: Var VAR_TMP_Hour >= 21
    ◆Control Variables: [VAR_SYS_TimeOfDay] = 3
  ◆
  ◆Wait: 60
```

**One global parallel Common Event per subsystem** — it survives map changes, is easy to find,
easy to pause with one switch, and its cost is paid once for the whole game rather than per
map. The ascending `>=` ladder without `Else` works because each later test overwrites the
earlier result.

Note `VAR_TMP_Hour` uses integer division: `setValue` floors, so `/= 60` truncates correctly.

Every NPC schedule, tint change and shop-opening hour then reads `VAR_SYS_TimeOfDay` — no
further parallels needed anywhere.
