# Recipes — Cutscenes

## 1. One-shot cutscene

```
CUT_ThroneArrival    (invisible controller event, Below Characters, no graphic)

Page 1  [Switch SW_CUT_ThroneArrival]   Autorun
  ◆Comment: CUT_ThroneArrival — one-shot arrival scene.
  ◆Comment: ENTRY : SW_CUT_ThroneArrival ON (set by the map transfer event).
  ◆Comment: EXIT  : VAR_STORY = 30, SW_CUT_ThroneArrival OFF. Page 2 then locks it out.

  ◆Comment: --- LOCK ---
  ◆Common Event: CE_CUT_Begin

  ◆Comment: --- SETUP ---
  ◆Set Event Location: Event 3 (King),    (10, 4), Direction Down
  ◆Set Event Location: Event 4 (Steward), (12, 5), Direction Left
  ◆Set Movement Route: Player [Wait ON] — Turn Up

  ◆Comment: --- BEATS ---
  ◆Wait: 20
  ◆Set Movement Route: Event 3 [Wait ON] — Turn toward Player
  ◆Play SE: Flash1
  ◆Show Balloon Icon: Event 3, Exclamation [Wait ON]
  ◆Wait: 10
  ◆Text: <King> "So. You came after all."
  ◆Set Movement Route: Player [Wait ON] — 1 Step Forward
  ◆Text: <Player> "I had little choice."

  ◆Comment: --- TEARDOWN + RELEASE ---
  ◆Common Event: CE_CUT_End
  ◆Control Variables: [VAR_STORY] = 30
  ◆Control Switches: [SW_CUT_ThroneArrival] = OFF      ← last line, indent 0

Page 2  [Var VAR_STORY >= 30]          Action Button, empty list
```

**Why the exit is the last line at indent 0:** an Autorun re-arms every frame
(`checkEventTriggerAuto` runs from `Game_Event.update`) and only stops when its page stops
matching. An exit hidden inside a Conditional Branch can be skipped, and the game freezes with
no error. `validate_events.py` flags exactly this.

**Why page 2 exists:** even if the switch is turned on again by accident, the story variable
now selects a higher, inert page. Belt and braces on the thing that would otherwise hard-freeze
the game.

**Why the state is set before the switch:** if the game crashed between the two lines, the scene
records as "done" rather than replaying on next load.

---

## 2. Four NPCs entering simultaneously

```
◆Comment: --- SETUP: park all four off the visible area ---
◆Set Event Location: Event 3, (10,  0), Direction Down     north
◆Set Event Location: Event 4, (10, 14), Direction Up       south
◆Set Event Location: Event 5, ( 2,  7), Direction Right    west
◆Set Event Location: Event 6, (18,  7), Direction Left     east

◆Comment: --- ENTRANCE: all four at once. Through ON so nothing can block them. ---
◆Set Movement Route: Event 3 [Wait OFF] — Through ON, Move Down ×5,  Through OFF, Turn Down
◆Set Movement Route: Event 4 [Wait OFF] — Through ON, Move Up   ×5,  Through OFF, Turn Up
◆Set Movement Route: Event 5 [Wait OFF] — Through ON, Move Right×6,  Through OFF, Turn Right
◆Set Movement Route: Event 6 [Wait ON ] — Through ON, Move Left ×6,  Through OFF, Turn Left

◆Comment: --- CAMERA + REVEAL ---
◆Scroll Map: Up, 3, Speed 3, Wait ON
◆Wait: 20
◆Set Movement Route: Event 5 [Wait ON] — Move Right ×2         (one steps to the table)
◆Play SE: Open1
◆Flash Screen: (255,255,255,170), 20 frames, Wait ON
◆Set Movement Route: Event 9 [Wait ON] — Transparent OFF        (the item appears)
◆Wait: 25
◆Text: ...

◆Comment: --- EXEUNT ---
◆Set Movement Route: Event 3 [Wait OFF] — Through ON, Move Up ×5, Transparent ON
◆Set Movement Route: Event 4 [Wait OFF] — Through ON, Move Down ×5, Transparent ON
◆Set Movement Route: Event 5 [Wait OFF] — Through ON, Move Left ×8, Transparent ON
◆Set Movement Route: Event 6 [Wait ON ] — Through ON, Move Right ×8, Transparent ON
◆Scroll Map: Down, 3, Speed 4, Wait ON
```

**The three rules being applied:**

1. **`Wait OFF` on all but one route.** `Set Movement Route` with `wait: false` starts the route
   and returns immediately, so all four walk at once.
2. **`Wait ON` on the route that takes longest.** The interpreter only waits for the flagged
   route. Events 5 and 6 have 6 steps and 3/4 have 5, so the waiter must be 5 or 6 — not 3.
   Get this backwards and the dialogue starts while two actors are still walking.
3. **Through ON during the walk, OFF at the end.** The player, the followers and the four
   actors cannot block each other. Without this, a player standing in a doorway stalls a
   non-skippable route forever (`advanceMoveRouteIndex` does not advance on a failed move) and
   the game softlocks.

**`Scroll Map` does not return the camera automatically** — scroll back before releasing
control, or the view snaps back the next time the player moves.

---

## 3. Exact synchronisation (switch handshake)

When routes genuinely differ in length and "longest waits" is not good enough:

```
◆Control Switches: [SW_SYS_Sync_A, SW_SYS_Sync_D] = OFF        ← clear the whole range first

◆Set Movement Route: Event 3 [Wait OFF] — …steps…, Switch ON [SW_SYS_Sync_A]
◆Set Movement Route: Event 4 [Wait OFF] — …steps…, Switch ON [SW_SYS_Sync_B]
◆Set Movement Route: Event 5 [Wait OFF] — …steps…, Switch ON [SW_SYS_Sync_C]
◆Set Movement Route: Event 6 [Wait OFF] — …steps…, Switch ON [SW_SYS_Sync_D]

◆Loop
  ◆Conditional Branch: SW_SYS_Sync_A is ON
    ◆Conditional Branch: SW_SYS_Sync_B is ON
      ◆Conditional Branch: SW_SYS_Sync_C is ON
        ◆Conditional Branch: SW_SYS_Sync_D is ON
          ◆Break Loop
        ◆
      ◆
    ◆
  ◆
  ◆Wait: 3                                     ← mandatory, at indent 0
◆Repeat Above
```

**Why this works:** move-route commands 27/28 toggle a global switch *from inside the route*,
which is the only way to know a non-waiting route has finished.

**The `Wait: 3` is not optional.** `Loop`/`Repeat Above` costs zero frames per iteration, so
without a wait the loop burns 100 000 commands per frame (`checkFreeze`) and the game appears
hung. `validate_events.py` reports `loop-no-escape` for this.

Clear the sync switches **before** starting, not after — a leftover ON from a previous run
makes the loop exit immediately.

---

## 4. CE_CUT_Begin / CE_CUT_End

The teardown list is long and identical for every scene, so make it enforced by construction.

```
CE_CUT_Begin                 (trigger: None)
  ◆Comment: Standard cutscene lock. Pair with CE_CUT_End on every path.
  ◆Control Switches: [SW_SYS_ClockRunning] = OFF        pause your own parallels
  ◆Control Switches: [SW_SYS_WeatherTick]  = OFF
  ◆Change Menu Access: Disable
  ◆Change Encounter: Disable
  ◆Change Player Followers: OFF
  ◆Save BGM

CE_CUT_End                   (trigger: None)
  ◆Comment: Standard cutscene teardown. Restores everything CE_CUT_Begin changed.
  ◆Tint Screen: (0,0,0,0), 30 frames, Wait ON
  ◆Set Weather Effect: none, 0, 30, Wait OFF
  ◆Erase Picture: 20 … 49                                the cutscene picture band
  ◆Change Player Followers: ON
  ◆Change Encounter: Enable
  ◆Change Menu Access: Enable
  ◆Resume BGM
  ◆Control Switches: [SW_SYS_ClockRunning] = ON
  ◆Control Switches: [SW_SYS_WeatherTick]  = ON
```

**Why this is worth doing:** a missed teardown line is a bug that surfaces hours later somewhere
unrelated — followers permanently hidden, the menu still disabled, a tint that never clears, an
NPC left with Through ON standing inside a wall. Bracketing every scene means the checklist is
fixed in one place for the whole game.

Per-scene teardown still belongs in the scene itself: actor positions, graphics, Through flags,
speed, opacity, blend mode, direction fix, and the camera. `CE_CUT_End` handles only what is
global.

**Skip support:** if the project offers scene skipping, the skip path must also run
`CE_CUT_End`. That is the strongest argument for this pattern.

---

## 5. Long cutscene composition

A 400-command scene in one event is unreadable and unmergeable. Split it:

```
CUT_ThroneArrival  Page 1  [SW_CUT_ThroneArrival]  Autorun
  ◆Comment: Throne arrival — sections in CE 40..43.
  ◆Common Event: CE_CUT_Begin
  ◆Common Event: CE_CUT_Throne_01_Entrance
  ◆Common Event: CE_CUT_Throne_02_Confrontation
  ◆Common Event: CE_CUT_Throne_03_Reveal
  ◆Common Event: CE_CUT_End
  ◆Control Variables: [VAR_STORY] = 30
  ◆Control Switches: [SW_CUT_ThroneArrival] = OFF
```

Each section is independently readable and testable — call one directly from a debug event to
preview it. Keep the switch-off in the **parent**, outside any branch, so the exit is visible in
one glance.

**Caveat:** `Set Movement Route: This Event` inside those sections refers to the Autorun
controller, which is usually invisible. Address cutscene actors by explicit Event ID.
