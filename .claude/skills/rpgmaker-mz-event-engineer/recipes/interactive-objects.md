# Recipes — Interactive Objects

## 1. Door / map transition

```
Page 1  [always]   Player Touch / Below Characters / Fixed / no graphic (or a doorway tile)
  ◆Play SE: Move1
  ◆Transfer Player: Map 12, (14, 8), Direction Up, Fade Black
```

**Why:** no state is needed, so none is used. Below Characters + Player Touch means walking
onto the tile triggers it (`checkEventTriggerHere` requires non-normal priority).

**The one thing to get right:** the destination tile must **not** be on top of the return
doorway's trigger, or the player instantly bounces back. Land one tile *past* the matching
door, facing away from it.

For a door the player opens first, use Action Button / Same as Characters and add
`Change Image` → `Wait 10` before the Transfer.

---

## 2. Locked door + key

```
Page 1  [always]              Action Button / Same as Characters / closed graphic
  ◆Play SE: Buzzer1
  ◆Text: "The door is locked. A heavy iron lock."

Page 2  [Item: Iron Key]      Action Button / Same as Characters / closed graphic
  ◆Play SE: Key
  ◆Text: "The iron key fits."
  ◆Set Movement Route: This Event [Wait ON] — Change Image (door_open)
  ◆Wait: 10
  ◆Control Self Switch: A = ON

Page 3  [Self Switch A]       Player Touch / Below Characters / open graphic
  ◆Transfer Player: Map 12, (5, 9), Direction Up, Fade Black
```

**Why three pages:** the item condition selects *can it be unlocked*; the self switch records
*it has been unlocked*. Keeping them separate means the door stays open even if the key is
later removed by quest cleanup — page 3 is higher, so it wins regardless of the item.

**Priority change matters:** page 3 is Below Characters so the player can walk through the open
doorway. A door that stays solid after opening is the classic bug here.

Substitute `[Switch SW_MAP_GateOpen]` for the item condition when the door is opened by
something elsewhere.

---

## 3. Chest

```
Page 1  [always]         Action Button / Same as Characters / !Chest[0] pattern 1 / Direction Fix
  ◆Comment: EV_Chest_Cave_01 — Exit: Self Switch A (page 2)
  ◆Play SE: Chest1
  ◆Set Movement Route: This Event [Wait ON] — Direction Fix OFF, Turn Left, Wait 3,
                                              Turn Right, Wait 3, Direction Fix ON
  ◆Control Self Switch: A = ON
  ◆Change Items: Potion +1
  ◆Play ME: Item
  ◆Text: \}Potion obtained!\{

Page 2  [Self Switch A]  Action Button / Same as Characters / !Chest open frame / Direction Fix
  (empty, or ◆Text: "Empty.")
```

**Why:** local state, so a Self Switch. Two pages, nothing more. **Do not** build a state
machine for a chest.

The `Direction Fix` keeps the chest from swivelling to face the player (`Game_Event.lock()`
calls `turnTowardPlayer` otherwise). The little turn-left/turn-right route is the standard
"opening" flourish — the `!` prefix on the sprite name draws it without the tile offset.

**Set the Self Switch before granting the item**, so a crash between the two leaves the chest
open and unlooted rather than infinitely lootable.

Variants: `Change Gold` for money · a `Conditional Branch: Party has key` wrapper for a locked
chest · `Battle Processing` before the reward for a mimic.

---

## 4. Lever (toggleable)

```
Page 1  [always]         Action Button / Same as Characters / lever-up graphic
  ◆Play SE: Switch1
  ◆Control Self Switch: A = ON
  ◆Common Event: CE_PZ_Levers_Check

Page 2  [Self Switch A]  Action Button / Same as Characters / lever-down graphic
  ◆Play SE: Switch2
  ◆Control Self Switch: A = OFF
  ◆Common Event: CE_PZ_Levers_Check
```

**Why:** each lever owns its own state and reports the change. The checker Common Event decides
what the combination means, so adding a fifth lever needs no edits to the other four.

**Distinct SE for on and off.** Without it the player cannot tell the lever's state by ear, and
they will not always be looking at it.

---

## 5. One-shot object

Anything that must happen exactly once, then never again:

```
Page 1  [always]         Action Button
  ◆(the thing)
  ◆Control Self Switch: A = ON

Page 2  [Self Switch A]  Action Button
  ◆Text: "Nothing more here."          ← or leave the list empty for silence
```

**Why:** Self Switch, not `Erase Event`. `Erase Event` is forgotten when the map reloads, so the
object comes back. Self switch state persists in the save.

Give page 2 *something* to say when the player will plausibly try again — silence reads as a
bug.

---

## 6. Reusable object

```
Page 1  [always]   Action Button
  ◆Play SE: Book
  ◆Text: "Rows of dusty ledgers."
```

**Why it is listed:** the discipline is knowing when *not* to add state. Most scenery is this.
Adding a self switch "in case" is how projects accumulate unmaintainable events.

Upgrade to variety without adding state:

```
  ◆Control Variables: [VAR_TMP_Line] = Random 0..2
  ◆Conditional Branch: VAR_TMP_Line == 0   ◆Text: "..."
  ◆Conditional Branch: VAR_TMP_Line == 1   ◆Text: "..."
  ◆Conditional Branch: VAR_TMP_Line == 2   ◆Text: "..."
```

---

## 7. Teleport pad

```
Page 1  [always]   Action Button / Below Characters / glowing pad graphic
  ◆Text: "A rune circle hums underfoot."
  ◆Show Choices: [Activate, Leave]   (cancel → branch)
    ◆When Activate:
      ◆Play SE: Teleport
      ◆Show Animation: Player, Warp
      ◆Fadeout Screen
      ◆Transfer Player: Map 20, (10, 12), Direction Down, Fade None
      ◆Fadein Screen
    ◆When Leave:
    ◆When Cancel:
```

**Why `Fade None` on the Transfer:** the event already faded manually, so letting the Transfer
fade again double-fades. Manual fade gives you room for the SE and animation between.

For a network of pads, put the transfer in one Common Event that reads a destination variable;
each pad sets the variable and calls it. One place to edit the map list.

---

## 8. Trap

```
Page 1  [always]   Player Touch / Below Characters / invisible or a subtle floor graphic
  ◆Play SE: Damage3
  ◆Show Animation: Player, Hit Physical
  ◆Screen Shake: 4, 6, 20, Wait ON
  ◆Change HP: Entire Party, -20, Allow Knockout OFF
  ◆Text: "Darts fire from the wall!"
```

**Decide explicitly:**
- **Fire once?** Add `Control Self Switch: A = ON` and an empty page 2.
- **Every time?** Leave it as is — but then the player can grind past it, so make the damage
  meaningful.
- **Can it kill?** `Allow Knockout` OFF leaves the party at 1 HP. Turning it on is a design
  decision, not a default.
- **Visible after triggering?** A sprung-trap graphic on page 2 teaches the player to look.

Continuous hazards (lava, poison swamp) should be **damage floor tiles** in the tileset, not
events.

---

## 9. Resource node

```
Page 1  [always]         Action Button / Same as Characters / full-bush graphic
  ◆Play SE: Sheep
  ◆Change Items: Herb +1
  ◆Text: \}Herb obtained!\{
  ◆Control Self Switch: A = ON

Page 2  [Self Switch A]  Action Button / Below Characters / picked-bush graphic
  ◆Text: "Picked clean."
```

Note the priority change on page 2: a picked bush no longer needs to block.

---

## 10. Respawning resource

The clean vanilla approach: **one Common Event clears a list of self switches** when the world
event happens (sleeping at an inn, a day change, re-entering the region).

```
CE_SYS_RespawnNodes          (trigger: None — called by the inn / day system)
  ◆Comment: Clears self switch A on every gathering node.
  ◆Comment: Map 14: events 3,4,5,9   Map 15: events 2,7
  ◆Script: const nodes = [[14,3],[14,4],[14,5],[14,9],[15,2],[15,7]];
  ◆       : nodes.forEach(([m,e]) => $gameSelfSwitches.setValue([m,e,"A"], false));
```

**Why a script call is justified here:** there is no event command that can touch another
event's self switch. This is one of the few places where the escalation to a script call is
clearly correct — the alternative is one polling parallel per node.

**More robust variant** — select by event name instead of hard-coded IDs, so renumbering cannot
break it (only works for nodes on the current map):

```js
$gameMap.events()
  .filter(ev => ev.event().name.startsWith("NODE_"))
  .forEach(ev => $gameSelfSwitches.setValue([$gameMap.mapId(), ev.eventId(), "A"], false));
```

Name every node `NODE_Herb_01` etc. and call this from an Autorun on map entry, gated so it
only runs when the harvest generation has advanced.

---

## 11. Event cooldown

"Usable again after N in-game hours/days", without a polling parallel:

```
Requires: VAR_SYS_Tick — a global counter advanced by the clock system.
          VAR_EV_ShrineLastUse — this object's own timestamp.

Page 1  [always]   Action Button
  ◆Control Variables: [VAR_TMP_Delta] = VAR_SYS_Tick
  ◆Control Variables: [VAR_TMP_Delta] -= VAR_EV_ShrineLastUse
  ◆Conditional Branch: VAR_TMP_Delta >= 24        ← cooldown length
    ◆(the effect)
    ◆Control Variables: [VAR_EV_ShrineLastUse] = VAR_SYS_Tick
  ◆Else
    ◆Play SE: Buzzer1
    ◆Text: "The shrine is still dormant."
  ◆
```

**Why this shape:** the cooldown is evaluated only when the player interacts, so it costs
nothing while waiting. Storing a *timestamp* and subtracting beats decrementing a counter,
because nothing has to tick it down.

Initialise `VAR_EV_ShrineLastUse` to a large negative number (or leave it at 0 and make the
first use free) so the object is available at game start.
