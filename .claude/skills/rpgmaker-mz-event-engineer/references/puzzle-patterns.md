# Puzzle Patterns

Puzzles are where eventing gets algorithmic. The recurring question is *where does the puzzle
state live* and *who checks for the solution*.

---

## 1. The three architectures

| Architecture | State lives in | Solution checked by | Use when |
|---|---|---|---|
| **Self-contained** | Self Switches on each element | The last element toggled | Order does not matter and elements are few |
| **Controller + variable** | One variable on a controller event | The controller, on demand | Order matters, or the state is numeric |
| **Controller + polling** | Positions of objects on the map | A gated parallel on the controller | The state is *physical* (pushed blocks, plates) |

Prefer the first two. Only use polling when the state genuinely lives in the world's geometry
and cannot be reported by an action.

**The general rule: let the thing that changes the state also report it.** Most puzzles need
no parallel at all.

---

## 2. Multiple switches / levers — order irrelevant

Each lever toggles its own Self Switch and then calls a shared checker.

```
Lever event (×4)
  Page 1  (none)               graphic: lever up
          ◆Play SE: Switch1
          ◆Control Self Switch: A = ON
          ◆Common Event: CE_Puzzle_Levers_Check
  Page 2  Self Switch A        graphic: lever down
          ◆Play SE: Switch2
          ◆Control Self Switch: A = OFF
          ◆Common Event: CE_Puzzle_Levers_Check
```

The checker cannot read other events' self switches with a plain command, so either:

**(a) count with a variable** — each lever also does `Control Variables: [PZ_Levers] += 1` /
`-= 1`, and the checker tests `== 4`. Simple, but the variable can drift if the event is ever
reset. Prefer this and initialise the variable when the player enters the room.

**(b) read self switches by script** in the checker:

```js
[3,4,5,6].every(id => $gameSelfSwitches.value([$gameMap.mapId(), id, "A"]))
```

as a Conditional Branch → Script. This has no drift because the self switches *are* the state.
Hard-coding event IDs is the cost; document them in a Comment.

Solution step:
```
◆Conditional Branch: (all four on)
  ◆Play SE: Open2
  ◆Screen Shake: 5, 5, 30, Wait ON
  ◆Control Switches: [SW_PZ_LeversDone] = ON        ← the door's page 2 condition
```

## 3. Lever sequence — order matters

State is a single variable acting as a **progress counter**, and any wrong input resets it.

```
PZ_Sequence      0..4, the number of correct presses so far
Correct order:   lever 1, lever 3, lever 2, lever 4

Lever N (the "expected at step k" logic lives in each lever):
  ◆Conditional Branch: Var PZ_Sequence == <k>        ← this lever is the next expected one
    ◆Control Variables: [PZ_Sequence] += 1
    ◆Play SE: Decision1
    ◆Conditional Branch: Var PZ_Sequence == 4
      ◆(solved)
  ◆Else
    ◆Control Variables: [PZ_Sequence] = 0            ← wrong: reset
    ◆Play SE: Buzzer1
    ◆(visual reset: turn all lever self switches off via script, or a reset Common Event)
  ◆
```

Feedback is what makes a sequence puzzle fair: a distinct positive SE for a correct press and a
negative SE plus a visible reset for a wrong one. Without it, the player cannot tell they are
making progress.

## 4. Code locks and number entry

Vanilla `Input Number` (command 103) is the cleanest entry method:

```
◆Text: "A four-digit code is engraved here."
◆Input Number: [TMP_INPUT], 4 digits
◆Conditional Branch: TMP_INPUT == 4271
  ◆(open)
◆Else
  ◆Play SE: Buzzer1
  ◆Text: "Nothing happens."
◆
```

For a symbol/colour code, use nested `Show Choices` (four choices, four times) accumulating
into a variable with `×10 + n` arithmetic, or a variable per position compared at the end.

Always place the *clue* somewhere findable and make the lock re-attemptable.

## 5. Pressure plates

A plate is a **Below Characters, Player Touch** event on a passable tile — the trigger fires
when the player walks on. The hard part is detecting *stepping off*, which has no trigger.

**Two honest approaches:**

**(a) Plate polls only while pressed** (cheap, self-limiting):

```
Page 1  (none)              Below Characters, Player Touch, plate-up graphic
        ◆Play SE: Push
        ◆Control Self Switch: A = ON
        ◆Control Variables: [PZ_Plates] += 1
        ◆Common Event: CE_Puzzle_Plates_Check

Page 2  Self Switch A       Below Characters, Parallel, plate-down graphic
        ◆Get Location Info: [TMP_EID], Event ID, at This Event    ← anything on my tile?
        ◆Conditional Branch: (script) $gamePlayer.pos(this.character(0).x, this.character(0).y)
          ◆(still pressed — do nothing)
        ◆Else
          ◆Conditional Branch: TMP_EID == 0                       ← and no block on it either
            ◆Play SE: Push
            ◆Control Variables: [PZ_Plates] -= 1
            ◆Control Self Switch: A = OFF                          ← page 2 dies; parallel stops
        ◆Wait: 6
```

The parallel exists **only while the plate is pressed**, and destroys itself when released.
Ten plates cost ten parallels only in the worst case where all ten are pressed.

**(b) One room controller** polls all plate tiles every ~10 frames using
`$gameMap.eventsXy(x, y)` / `$gamePlayer.pos(x, y)` in a script conditional. One parallel total.
Better when there are many plates; worse for readability.

`Get Location Info → Event ID` returns the ID of an event on that tile (0 if none) and is the
vanilla way to detect a pushed block sitting on a plate.

## 6. Pushable blocks (Sokoban)

Vanilla push is a Player Touch event that moves itself one step in the player's facing
direction:

```
Block event: Same as Characters, Player Touch, movement Fixed
  ◆Conditional Branch: Character[Player] is facing Up
    ◆Set Movement Route: This Event [Wait ON] — Move Up          (skippable OFF)
  ◆Conditional Branch: Character[Player] is facing Down
    ◆Set Movement Route: This Event [Wait ON] — Move Down
  ◆(left, right)
  ◆Play SE: Push
```

Why it works: Player Touch fires when the player *bumps into* a Same-priority event, and the
player's facing is already correct at that moment. The move fails harmlessly if the block is
against a wall — with `skippable: false` and `wait: true` this would stall, so **either set
`skippable: true` or drop `wait`**. Prefer `skippable: true, wait: true` so the SE and any
follow-up happen after the attempt.

Refinements:
- Play a "blocked" SE when the move fails: compare the block's X/Y before and after into
  variables.
- To detect the block reaching a goal, use the plate pattern (goal tile reads
  `Get Location Info → Event ID`) or have the block report its own region after each push:
  `Get Location Info → Region ID, at This Event`.
- **Reset**: a lever or room re-entry that runs `Set Event Location` on every block to its
  start position. Always provide one — an unsolvable pushed-into-a-corner state that the player
  cannot undo is the classic Sokoban softlock.

## 7. Position puzzles (statues, mirrors, colours)

State is the **set of positions**, so read it rather than track it:

```
◆Get Location Info: [TMP_R1], Region ID, at Event 5
◆Get Location Info: [TMP_R2], Region ID, at Event 6
◆Get Location Info: [TMP_R3], Region ID, at Event 7
◆Conditional Branch: TMP_R1 == 21
  ◆Conditional Branch: TMP_R2 == 22
    ◆Conditional Branch: TMP_R3 == 23
      ◆(solved)
```

Paint each target tile with a distinct Region ID. This is far more robust than comparing raw
coordinates, and it survives the designer moving the room.

For **rotating** elements (mirrors, dials), each element holds a state variable 0–3 and its
page graphic is chosen by threshold pages, or by `Change Image` in a route.

## 8. Light / colour / matching puzzles

State per element is a small integer; the check is equality against a target pattern.
Encode compactly when there are many elements:

```
PZ_Colors = c1 + c2*4 + c3*16 + c4*64          ← base-4 packing, four elements of 4 colours
solved when PZ_Colors == 0b11_01_10_00 = 220
```

Recompute the packed value from scratch each time an element changes (do not try to
incrementally update it) — one `Control Variables` chain, and no drift possible.

## 9. Timed puzzles

`Control Timer` runs independently of interpreters and shows on screen. Start it when the
puzzle begins, check `Conditional Branch → Timer <= 0 sec` at the natural checkpoints, and
**stop it** on success or on leaving the room. A forgotten running timer that expires three
rooms later is a memorable bug.

For a countdown without the on-screen clock, use a variable decremented by a gated parallel
with `Wait: 60`.

## 10. Mazes and dynamic doors

- **Dynamic walls**: an event with priority Same as Characters and a blank/solid page pair.
  Toggle with switches. Cheaper and more reliable than editing map data.
- **One-way passages**: use tileset passage flags in the map, or a Player Touch event that
  transfers the player past the boundary.
- **Teleport mazes**: each pad is a Player Touch event with a Transfer to the same map at new
  coordinates, `fadeType: none` for instant, `black` for a disorienting effect.
- **Invisible walls** should be avoided; if used, telegraph them with a sound.

## 11. Puzzle design hygiene

- [ ] **Resettable.** Every puzzle must have a way back to a solvable state: a reset lever, a
      reset on room re-entry, or physically un-stuck-able geometry.
- [ ] **No softlock.** Verify the worst case: every block pushed into a corner, every lever in
      the wrong position, the player out of the required item.
- [ ] **Feedback.** Every input produces a sound and a visible change. Correct and incorrect
      must sound different.
- [ ] **Solved state is persistent.** Use a Switch (not Erase Event, not a self switch on a
      controller the player can leave) so the door stays open after leaving the map.
- [ ] **Solved state is idempotent.** Re-triggering the solution must not replay the fanfare or
      re-award anything. Guard the completion with its own switch check.
- [ ] **Initialise on entry.** Counters that can drift should be recomputed or zeroed by the
      room's setup event.
- [ ] The solution is **discoverable** from in-world information, not from guessing.
