# Advanced Eventing Tricks

Non-obvious techniques, engine behaviours worth exploiting, and things people commonly assume
need a plugin. Each explains *why* it works — copy the reasoning, not just the steps.

---

## Page-selection tricks

### 1. Encode "less than" with a higher blank page
Page conditions only offer `variable >= value`. Because selection is bottom-up and takes the
first match, "active only while `10 <= X < 20`" is:

```
Page 2  Var X >= 10    the content
Page 3  Var X >= 20    blank
```

Page 3 wins from 20 upward, so page 2 effectively covers exactly `[10, 20)`. Every bounded
range is expressible this way. This is the foundational trick behind state-machine pages.

### 2. An empty page as an off-switch
A page with no commands and no graphic makes the event invisible, Through, and untriggerable
(`Game_Event.start()` requires list length > 1). It is the idiomatic "this object does not
exist right now", and unlike `Erase Event` it persists across map visits.

### 3. Escape the two-switch limit
A page allows two switches plus one variable. When you need more conditions:
- Fold several booleans into one variable used as a threshold or a bitfield.
- Compute a derived "gate" switch from a Common Event whenever the inputs change.
- Move the extra tests into a Conditional Branch inside the page — page conditions only need
  to select the *behaviour*, not to validate everything.

### 4. Highest page as an override
Because the highest matching page wins, putting a story flag on the last page gives you a
priority override that beats every behaviour state below it, with no extra logic.

---

## Self-switch tricks

### 5. Set another event's self switch
The one thing no command can do, and the highest-value script call in the engine:

```js
$gameSelfSwitches.setValue([$gameMap.mapId(), 12, "A"], true)
```

Enables: resetting a puzzle room, respawning resource nodes, a boss disabling every lever,
one event opening a distant door, a "clear all torches" system.

### 6. Read another event's self switch
```js
$gameSelfSwitches.value([$gameMap.mapId(), 12, "A"])
```
in a Conditional Branch → Script. Combined with `.every()` / `.filter()` this checks a whole
group without a counter variable — and unlike a counter, it cannot drift out of sync, because
the self switches *are* the state.

```js
[3,4,5,6].every(id => $gameSelfSwitches.value([$gameMap.mapId(), id, "A"]))
```

### 7. Address events by name
`$gameMap.events()` gives live `Game_Event` objects, and `ev.event().name` is the editor name.
Naming events by convention turns the name into a selector:

```js
$gameMap.events()
  .filter(ev => ev.event().name.startsWith("TORCH_"))
  .forEach(ev => $gameSelfSwitches.setValue([$gameMap.mapId(), ev.eventId(), "A"], true))
```

This is a genuinely powerful, plugin-free group-addressing mechanism, and it survives event
renumbering — which hard-coded ID lists do not.

### 8. Self switches as free local state on a controller
An invisible controller event has four booleans nobody else can clash with. Use them for
per-room puzzle flags instead of minting global switches.

---

## Variable tricks

### 9. Bitfields
```
set bit 2:    Control Variables [F] = Script:  $gameVariables.value(45) | 4
clear bit 2:  Control Variables [F] = Script:  $gameVariables.value(45) & ~4
test bit 2:   Conditional Branch  Script:      ($gameVariables.value(45) & 4) !== 0
all of 0-2:   Conditional Branch  Var [F] == 7
```
Eight independent flags in one variable, and "are all done" is a single equality test. Always
document the bit assignment in a Comment.

### 10. Packed coordinates
`X * 1000 + Y` stores a position in one variable; `% 1000` and `/ 1000` recover it (integer
division truncates because `setValue` floors). Useful for remembering a return point.

### 11. Modulo for cycles
`Control Variables: [V] %= 4` after `+= 1` gives a repeating 0-1-2-3 cycle with two commands —
the basis of day/night phases, rotating statues, and cycling dialogue.

### 12. Random with weights
`Control Variables → Random 0..99`, then branch on thresholds: `< 60` common, `< 90` uncommon,
else rare. Far clearer than nested random rolls.

### 13. Variables can hold non-numbers
`setValue` only floors when `typeof value === "number"`. Via a Script operand you can store
strings, arrays and objects, and they survive save/load:

```js
$gameVariables.setValue(30, [])                                   // a real list
$gameVariables.setValue(30, $gameVariables.value(30).concat(7))   // append
```
Keep these out of page conditions (which compare with `<`).

### 14. Clamping and absolute value without script
Absolute value: branch on `< 0` and multiply by −1. Clamping: branch on `>` max and set to max.
Verbose but visible to search and to the linter — prefer it in shared logic.

---

## Move-route tricks

### 15. Switch ON as a completion signal
Move-route commands 27/28 toggle a global switch *from inside the route*. That is the only way
to know a non-waiting route has finished, and it is the basis of exact multi-actor
synchronisation (see `movement-routes.md` §5).

### 16. Through ON for guaranteed arrival
Cutscene actors with Through ON cannot be blocked by the player, followers or each other. Turn
it off at the end of the route. This single habit eliminates most cutscene softlocks.

### 17. Route script steps run *in sequence with movement*
A `Script` step (code 45) executes at its position in the route, so you can change opacity
exactly when a character reaches a spot without any timing arithmetic. `this` is the
`Game_Character`.

### 18. Direction Fix for backwards walking and pose locking
Direction Fix ON + `1 Step Backward` makes a character retreat while still facing the player.
It also suppresses the automatic turn-to-face when the player talks to the event.

### 19. Jump in place
`Jump [0,0]` is a startle animation with no displacement. Pair with an SE.

### 20. Fake opacity fades
`Change Opacity` snaps. Emit a ladder — opacity 224, `Wait 2`, 192, `Wait 2`, … — inside the
route for a smooth fade with no plugin.

---

## Interpreter tricks

### 21. Label + Jump as a conversation hub
A `Label` before a `Show Choices` and a `Jump to Label` at the end of each informational branch
gives a proper re-entrant dialogue menu (see `dialogue-eventing.md` §4). Only jump to labels at
the same indent — `jumpTo` nulls branch state across indents.

### 22. `Exit Event Processing` inside a Common Event exits only the Common Event
Useful for early returns from a "function". To abort the caller too, set a return flag and
branch in the caller.

### 23. Common Events inherit the caller's event ID
So a shared Common Event can still set *that instance's* self switch and move "This Event".
This is what makes one interaction Common Event reusable across dozens of map events. It stops
working when the interpreter's event ID is 0 — parallels, autoruns, battles, item-triggered
common events, and after a `Transfer Player`.

### 24. `$gameTemp.reserveCommonEvent` for "run after this finishes"
It queues rather than nesting, so the reserved event runs after the current one ends, at the
map interpreter's next `setupStartingEvent`. MZ queues multiple reservations; **MV keeps only
the last one**.

### 25. Command 101 absorbs the next choice/number/item command
`Show Text` immediately followed by `Show Choices` shows both in one window with the text still
visible. Insert any other command between them to decouple them.

### 26. Show Choices cancel semantics
`cancelType = -2` routes cancel to the `403` branch; `-1` disables cancel entirely; `0..n-1`
maps cancel onto a specific choice. The engine coerces any value `>= choices.length` to `-2`.

---

## Spatial tricks

### 27. Regions instead of coordinate maths
Painting a region and testing one value beats four coordinate comparisons: it survives map
edits, supports arbitrary shapes, and is visible to the designer. Reserve a documented region
palette per project.

### 28. Region equality as a cheap line-of-sight test
Requiring the guard and the player to share a region means walls break sight for free, with no
ray casting. This is what most shipped RPG Maker stealth sections actually do.

### 29. `Get Location Info → Event ID` detects objects on a tile
The vanilla way to know a pushed block is standing on a pressure plate. MZ's designation 2
("at this character") reads it without copying coordinates first.

### 30. Hysteresis on detection radii
Detect at ≤5 tiles, give up at ≥9. Equal thresholds make a guard flicker between chase and
return at the boundary. This one detail is the difference between chase behaviour that feels
good and one that feels broken.

### 31. Terrain tags for material, regions for place
Terrain tags live on the tileset and apply everywhere it is used (footstep sounds, "is this
water"); regions live on the map and mean place-specific things. Using the right one keeps both
systems clean.

---

## Architecture tricks

### 32. Dirty-flag instead of polling
The highest-value optimisation in the engine: do not poll for a change, have whatever *causes*
the change set the state. Most parallels disappear entirely under this transformation.

### 33. One parallel that owns a subsystem
One gated Parallel Common Event per system (clock, weather, HUD) instead of one per map or per
NPC. It survives map changes, is easy to find, and costs once.

### 34. Self-terminating parallels
A parallel that sets a self switch which activates an *empty, non-parallel* page destroys its
own interpreter. Cost after completion: exactly zero.

### 35. The monotonic dispatcher
A Common Event that refuses to move a state variable backwards makes out-of-order player
actions harmless instead of a bug class.

### 36. Multiple copies instead of movement
A scheduled NPC is several events with time-gated pages, not one event that walks. Cheaper,
more robust, and indistinguishable to the player.

### 37. `CE_CUT_Begin` / `CE_CUT_End`
Bracketing every cutscene with two Common Events turns the long teardown checklist into
something enforced by construction, fixable in one place.

---

## Things people wrongly think need a plugin

| Believed to need a plugin | Vanilla approach |
|---|---|
| Proximity detection | Distance from Character X/Y in a gated parallel, or just Event Touch |
| Line of sight | Facing + axis alignment + shared region |
| Set another event's self switch | `$gameSelfSwitches.setValue([...], true)` |
| Conversation menus with topics | Label/Jump hub + Show Choices |
| Day/night NPC schedules | A time variable + threshold pages on duplicated events |
| Quest journal | Quest state variables + a Common Event that prints them |
| Pushable blocks | Player Touch + a self-directed one-step move route |
| Pressure plates | Player Touch + a self-terminating parallel, or `Get Location Info → Event ID` |
| Cutscene choreography | Non-waiting move routes + a switch handshake |
| Timed events | `Control Timer`, or a variable ticked by one gated parallel |
| Group operations on events | `$gameMap.events().filter(name)` + `forEach` |
| Weighted random loot | `Random 0..99` + threshold branches |
| Respawning resources | One Common Event clearing a list of self switches |
| Fade a sprite in | Opacity ladder inside a move route |

Plugins remain the right answer for: real pathfinding companions, save-persistent self
variables at scale, on-screen HUDs, message-window features (choice count, word wrap, name
boxes beyond MZ's), event spawning, and anything needing per-frame rendering. See
`plugins-and-eventing.md`.
