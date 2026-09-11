# Recipes — Puzzles

## 1. Several switches, any order

Each lever owns its own state; a shared checker decides what the combination means.

```
PZ_Lever_A … PZ_Lever_D   (event IDs 3,4,5,6)

Page 1  [always]         Action Button / Same as Characters / lever-up graphic
  ◆Play SE: Switch1
  ◆Control Self Switch: A = ON
  ◆Common Event: CE_PZ_Levers_Check

Page 2  [Self Switch A]  Action Button / Same as Characters / lever-down graphic
  ◆Play SE: Switch2
  ◆Control Self Switch: A = OFF
  ◆Common Event: CE_PZ_Levers_Check
```

```
CE_PZ_Levers_Check              (trigger: None)
  ◆Comment: Levers are map events 3,4,5,6 on the Crypt map. Update this list if they move.
  ◆Conditional Branch: Script:
  ◆   [3,4,5,6].every(id => $gameSelfSwitches.value([$gameMap.mapId(), id, "A"]))
    ◆Conditional Branch: SW_PZ_LeversDone is OFF        ← idempotence guard
      ◆Play SE: Open2
      ◆Screen Shake: 5, 5, 30, Wait ON
      ◆Control Switches: [SW_PZ_LeversDone] = ON
    ◆
  ◆
```

**Why read the self switches rather than count with a variable:** a counter can drift out of
sync with reality (a reset, a page change, an interrupted event) and then the puzzle is
unsolvable with no visible cause. The self switches **are** the state, so reading them cannot
drift. This is the one place where a script call clearly beats the vanilla alternative.

**Why the idempotence guard:** the checker runs on every lever toggle. Without it, toggling a
lever off and on again replays the fanfare and re-fires anything downstream.

**Cost of the script call:** hard-coded event IDs. Document them in the Comment, or select by
event name instead so renumbering cannot break it:

```js
$gameMap.events().filter(ev => ev.event().name.startsWith("PZ_Lever_"))
        .every(ev => $gameSelfSwitches.value([$gameMap.mapId(), ev.eventId(), "A"]))
```

---

## 2. Lever sequence (order matters)

State is one variable acting as a progress counter; a wrong input resets it.

```
VAR_PZ_Sequence   0..4 — how many correct presses so far
Correct order:    lever 1, lever 3, lever 2, lever 4

Lever N   (each lever knows which step it is: k = 0, 1, 2 or 3)
Page 1  [always]   Action Button / Same as Characters
  ◆Conditional Branch: Var VAR_PZ_Sequence == <k>
    ◆Play SE: Decision1                         ← distinct "correct" sound
    ◆Set Movement Route: This Event [Wait ON] — Change Image (lever_down)
    ◆Control Variables: [VAR_PZ_Sequence] += 1
    ◆Conditional Branch: Var VAR_PZ_Sequence == 4
      ◆Play ME: Mystery
      ◆Control Switches: [SW_PZ_SequenceDone] = ON
    ◆
  ◆Else
    ◆Play SE: Buzzer1                           ← distinct "wrong" sound
    ◆Screen Flash: (255,0,0,120), 15 frames, Wait ON
    ◆Control Variables: [VAR_PZ_Sequence] = 0
    ◆Common Event: CE_PZ_Sequence_Reset         ← visibly reset every lever
  ◆
```

```
CE_PZ_Sequence_Reset
  ◆Script: $gameMap.events()
  ◆      :   .filter(ev => ev.event().name.startsWith("PZ_Seq_"))
  ◆      :   .forEach(ev => ev.setImage("!Door2", 0));
```

**Why `== k` and not `>= k`:** Conditional Branch has the full operator set (unlike page
conditions, which are `>=` only). Exact equality is what "is this the next expected lever"
means — use it.

**Feedback is the design, not decoration.** A distinct positive sound, a distinct negative
sound, and a *visible* reset are what make a sequence puzzle fair. Without them the player
cannot tell whether they are making progress, and the puzzle reads as broken.

---

## 3. Pressure plate

A plate is Below Characters + Player Touch. The hard part is detecting the player stepping
*off*, for which there is no trigger — so the plate polls **only while pressed**.

```
Page 1  [always]         Player Touch / Below Characters / plate-up graphic
  ◆Play SE: Push
  ◆Control Self Switch: A = ON
  ◆Control Variables: [VAR_PZ_Plates] += 1
  ◆Common Event: CE_PZ_Plates_Check

Page 2  [Self Switch A]  Parallel / Below Characters / plate-down graphic
  ◆Conditional Branch: Script: $gamePlayer.pos(this.character(0).x, this.character(0).y)
    ◆Comment: still standing on it — nothing to do
  ◆Else
    ◆Get Location Info: [VAR_TMP_EventOnTile], Event ID, at This Event
    ◆Conditional Branch: Var VAR_TMP_EventOnTile == 0        ← and no block holding it down
      ◆Play SE: Push
      ◆Control Variables: [VAR_PZ_Plates] -= 1
      ◆Control Self Switch: A = OFF          ← page 2 dies; this parallel stops instantly
      ◆Common Event: CE_PZ_Plates_Check
    ◆
  ◆
  ◆Wait: 6
```

**Why this is cheap:** the parallel exists only while the plate is pressed. Ten plates cost ten
interpreters only in the worst case where all ten are down simultaneously — and in that case
the puzzle is solved anyway.

**Why `Get Location Info → Event ID`:** it is the vanilla way to detect a pushed block sitting
on the tile. MZ's designation 2 ("at this character") reads it without copying coordinates
first. **[MV]** has no designation 2 — copy the coordinates into variables and use
designation 1.

**Initialise `VAR_PZ_Plates` to 0** in the room's setup event, or a re-entry with plates still
pressed leaves the counter wrong.

---

## 4. Pushable block

```
PZ_Block   Page 1  [always]   Player Touch / Same as Characters / Fixed / crate graphic
  ◆Control Variables: [VAR_TMP_OldX] = Character[This Event] Map X
  ◆Control Variables: [VAR_TMP_OldY] = Character[This Event] Map Y
  ◆Conditional Branch: Character[Player] is facing Up
    ◆Set Movement Route: This Event [Wait ON, Skippable ON] — Move Up
  ◆
  ◆Conditional Branch: Character[Player] is facing Down
    ◆Set Movement Route: This Event [Wait ON, Skippable ON] — Move Down
  ◆
  ◆Conditional Branch: Character[Player] is facing Left
    ◆Set Movement Route: This Event [Wait ON, Skippable ON] — Move Left
  ◆
  ◆Conditional Branch: Character[Player] is facing Right
    ◆Set Movement Route: This Event [Wait ON, Skippable ON] — Move Right
  ◆
  ◆Control Variables: [VAR_TMP_NewX] = Character[This Event] Map X
  ◆Conditional Branch: Var VAR_TMP_NewX == VAR_TMP_OldX
    ◆Control Variables: [VAR_TMP_NewY] = Character[This Event] Map Y
    ◆Conditional Branch: Var VAR_TMP_NewY == VAR_TMP_OldY
      ◆Play SE: Buzzer1                          ← it didn't move: blocked
    ◆Else
      ◆Play SE: Push
    ◆
  ◆Else
    ◆Play SE: Push
  ◆
```

**Why Player Touch works here:** Player Touch fires when the player *bumps into* a
Same-as-Characters event, and at that moment the player's facing is already the push direction.
No input handling needed.

**Why `Skippable ON` is mandatory:** with `Wait ON` and `skippable` off, a block pushed against
a wall stalls forever — `advanceMoveRouteIndex` refuses to advance past a failed move, and the
interpreter waits on a route that never completes. That is a total softlock.

**Always provide a reset.** A lever or a room-entry event that runs `Set Event Location` on
every block returns them to their starting tiles. Without one, a block pushed into a corner
makes the room permanently unsolvable — the classic Sokoban softlock.

---

## 5. Moving-object puzzle (goal tiles)

Do not track where the objects are; **read** where they are.

Paint each goal tile with a distinct Region ID in the map editor (21, 22, 23), then:

```
CE_PZ_Statues_Check          (trigger: None — called after each push)
  ◆Get Location Info: [VAR_TMP_R1], Region ID, at Event 5
  ◆Get Location Info: [VAR_TMP_R2], Region ID, at Event 6
  ◆Get Location Info: [VAR_TMP_R3], Region ID, at Event 7
  ◆Conditional Branch: Var VAR_TMP_R1 == 21
    ◆Conditional Branch: Var VAR_TMP_R2 == 22
      ◆Conditional Branch: Var VAR_TMP_R3 == 23
        ◆Conditional Branch: SW_PZ_StatuesDone is OFF
          ◆Play ME: Mystery
          ◆Screen Flash: (255,255,255,170), 30 frames, Wait ON
          ◆Control Switches: [SW_PZ_StatuesDone] = ON
        ◆
      ◆
    ◆
  ◆
```

**Why regions rather than coordinates:** the check survives the room being redesigned, the goal
tiles are visible to the designer in the editor, and no state can drift because the positions
*are* the state.

**Why "each statue on its own region"** rather than "any statue on any goal": distinct region
IDs let you require a specific arrangement. Use one shared region ID if any order will do — then
compare all three against the same value.

For statues that must also *rotate*, give each one a state variable 0–3 and threshold pages for
the four facings, and add its value to the check.

---

## 6. Code lock

```
◆Text: "Four worn dials, and a scratched inscription."
◆Input Number: [VAR_TMP_Input], 4 digits
◆Conditional Branch: Var VAR_TMP_Input == 4271
  ◆Play SE: Open2
  ◆Control Switches: [SW_PZ_VaultOpen] = ON
◆Else
  ◆Play SE: Buzzer1
  ◆Text: "The dials spin back."
◆
```

`Input Number` (command 103) is the cleanest entry method and needs no plugin. For a
symbol or colour code, use nested `Show Choices` accumulating into a variable with `×10 + n`
arithmetic.

Make it re-attemptable, and put the clue somewhere findable — a code with no discoverable clue
is a guessing game, not a puzzle.

---

## 7. Puzzle hygiene checklist

- [ ] **Resettable.** A reset lever, a reset on room re-entry, or geometry that cannot trap the
      player.
- [ ] **No softlock.** Test the worst case: every block in a corner, every lever wrong, the
      required item missing.
- [ ] **Feedback.** Every input makes a sound and a visible change; correct and incorrect sound
      different.
- [ ] **Persistent solution.** Use a **Switch** so the door stays open after leaving the map.
- [ ] **Idempotent solution.** Guard the completion branch so re-triggering does not replay the
      fanfare or re-award anything.
- [ ] **Initialised on entry.** Counters that can drift are zeroed or recomputed by the room's
      setup event.
- [ ] **Discoverable.** The solution follows from in-world information.
