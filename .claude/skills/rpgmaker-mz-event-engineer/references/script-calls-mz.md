# Script Calls (MZ)

Every entry below was verified to exist in the MZ 1.8.0 corescript. **Never invent an API.** If
a method is not here, grep the project's `js/rmmz_objects.js` before using it.

## The rule

> If a standard Event Command does the job cleanly, use the Event Command.

A script call is justified when it (a) does something no command can do, (b) collapses fifteen
commands into one readable line, or (c) is the only way to reach another event's state. It is
**not** justified for arithmetic, branching, or anything the editor already exposes — those
become invisible to search, to the linter, and to the next maintainer.

## Execution context

| Where | `this` is | Notes |
|---|---|---|
| `Script` command (355/655) | `Game_Interpreter` | `this._eventId`, `this.character(n)`, `this.setWaitMode()` available. All 355/655 lines are joined and `eval`'d as one block, so multi-line code and `const` work |
| `Conditional Branch → Script` (111 type 12) | `Game_Interpreter` | Must be a single **expression**; its truthiness is the result |
| `Control Variables → Script` (122 operand 4) | `Game_Interpreter` | Single expression; the value is floored on storage |
| Move Route `Script` (route code 45) | the **`Game_Character`** | *Not* the interpreter. `Game_Interpreter` methods are unavailable. Runs in sequence with the movement |
| Damage formulas, plugin params | various | out of scope here |

Errors are **not** caught in MZ — a thrown exception crashes to the console. Test every script
call in playtest.

---

## Global objects

`$gameSwitches` `$gameVariables` `$gameSelfSwitches` `$gameMap` `$gamePlayer` `$gameParty`
`$gameActors` `$gameTroop` `$gameSystem` `$gameScreen` `$gameMessage` `$gameTimer` `$gameTemp`
`$dataMap` `$dataCommonEvents` `$dataItems` `$dataWeapons` `$dataArmors` `$dataActors`
`$dataSystem` `$dataTroops` `$dataEnemies` `$dataStates` `$dataSkills`

---

## Switches, variables, self switches

| Call | Does | Alternative |
|---|---|---|
| `$gameSwitches.value(n)` | read | Conditional Branch |
| `$gameSwitches.setValue(n, true)` | write | Control Switches |
| `$gameVariables.value(n)` | read | Control Variables |
| `$gameVariables.setValue(n, v)` | write; **numbers are floored** | Control Variables |
| `$gameSelfSwitches.value([mapId, eventId, "A"])` | read **any** event's self switch | none |
| `$gameSelfSwitches.setValue([mapId, eventId, "A"], true)` | write **any** event's self switch | none |

The self-switch pair is the most valuable script call in the engine, because there is no
command that can touch another event's local state. Common uses: resetting a room's puzzle,
respawning resource nodes, a boss disabling all the levers in its arena.

```js
// Reset every chest in this room
[3,4,5,6].forEach(id => $gameSelfSwitches.setValue([$gameMap.mapId(), id, "A"], false));
```

All three `setValue` methods call `$gameMap.requestRefresh()`, so pages update on the next map
update — you do not need to force a refresh.

**Bounds:** `setValue` on a switch or variable outside `0 < id < $dataSystem.<array>.length` is
silently ignored. Self switches have no bounds check and no declaration, so a typo in the key
creates a phantom entry that is never read.

Variables can hold non-numbers when set by script (`setValue` only floors `typeof === "number"`):

```js
$gameVariables.setValue(30, ["a","b","c"]);      // arrays survive save/load
$gameVariables.setValue(31, $gamePlayer.x + "," + $gamePlayer.y);
```
Useful for lists and sets, but page conditions compare with `<` and will behave oddly — keep
non-numeric variables out of page conditions.

---

## Map and events

| Call | Does |
|---|---|
| `$gameMap.mapId()` | current map ID |
| `$gameMap.event(id)` | `Game_Event`, or `undefined` |
| `$gameMap.events()` | all live events (excludes `null` holes) |
| `$gameMap.eventsXy(x, y)` | events at a tile |
| `$gameMap.eventsXyNt(x, y)` | events at a tile that are not Through |
| `$gameMap.eventIdXy(x, y)` | first event ID at a tile, else 0 |
| `$gameMap.regionId(x, y)` | region, 0 if out of bounds |
| `$gameMap.terrainTag(x, y)` | terrain tag 0–7 |
| `$gameMap.tileId(x, y, z)` | raw tile ID on layer z (0–5) |
| `$gameMap.isPassable(x, y, d)` | can a character *leave* `(x,y)` heading `d` |
| `$gameMap.isValid(x, y)` | inside the map bounds |
| `$gameMap.distance(x1,y1,x2,y2)` | **Manhattan** distance, loop-aware |
| `$gameMap.deltaX(x1, x2)` / `deltaY` | signed difference, loop-aware |
| `$gameMap.isCounter(x, y)` / `isLadder` / `isBush` / `isDamageFloor` | tile flags |
| `$gameMap.eraseEvent(id)` | erase for this map visit |
| `$gameMap.requestRefresh()` | schedule a page re-evaluation |
| `$gameMap.startScroll(dir, dist, speed)` | camera scroll |
| `$gameMap.width()` / `height()` | dimensions |

`$gameMap.event(id)` returns `undefined` for a deleted/nonexistent event — guard before using
it, or the script call throws and crashes the game.

---

## Characters

`$gamePlayer`, `$gameMap.event(n)` and `this.character(n)` are all `Game_Character`s.
`this.character(n)`: `-1` player, `0` this event, `n` event n; returns `null` in battle.

**Reading**
`x` `y` `_realX` `_realY` · `direction()` · `isMoving()` · `isJumping()` · `isThrough()` ·
`isTransparent()` · `screenX()` `screenY()` · `regionId()` · `terrainTag()` · `pos(x,y)` ·
`posNt(x,y)` · `isNormalPriority()` · `isMoveRouteForcing()` · `moveSpeed()` ·
`isNearTheScreen()`

**Writing**
`locate(x,y)` (teleport, ignores passability) · `setPosition(x,y)` · `setDirection(d)` ·
`setThrough(bool)` · `setTransparent(bool)` · `setOpacity(0..255)` · `setBlendMode(0..3)` ·
`setImage(name, index)` · `setMoveSpeed(1..6)` · `setMoveFrequency(1..5)` ·
`setWalkAnime(bool)` · `setStepAnime(bool)` · `setDirectionFix(bool)` · `setPriorityType(0..2)`

**Movement** (`Game_Character`)
`moveStraight(d)` · `moveDiagonally(h,v)` · `moveRandom()` · `moveTowardCharacter(char)` ·
`moveAwayFromCharacter(char)` · `moveForward()` · `moveBackward()` · `jump(dx,dy)` ·
`turnTowardCharacter(char)` · `turnAwayFromCharacter(char)` · `turnRight90()` · `turnLeft90()` ·
`turn180()` · `turnRandom()` · `findDirectionTo(x,y)` (A*, `searchLimit()` = 12 tiles) ·
`forceMoveRoute(route)` · `swap(char)` · `deltaXFrom(x)` / `deltaYFrom(y)` (loop-aware signed
delta from this character to a coordinate)

```js
// Turn event 5 to look at event 8
$gameMap.event(5).turnTowardCharacter($gameMap.event(8))
// This event steps toward the player once
this.character(0).moveTowardCharacter($gamePlayer)
```

`Game_Event`-only: `eventId()` · `event()` (the raw data) · `page()` · `list()` ·
`erase()` · `refresh()` · `lock()` / `unlock()` · `isStarting()` · `start()`

`Game_Player`-only: `reserveTransfer(mapId,x,y,d,fade)` · `isDashing()` · `followers()` ·
`gatherFollowers()` · `showFollowers()` / `hideFollowers()` · `vehicle()` · `isInVehicle()` ·
`refresh()`

Followers: `$gamePlayer.followers().follower(i)` (0-based, excludes the leader) ·
`.visibleFollowers()` · `.setPosition(x,y)` on an individual follower.

---

## Party, actors, inventory

| Call | Does |
|---|---|
| `$gameParty.members()` | battle-order actor array |
| `$gameParty.leader()` | front actor |
| `$gameParty.size()` | member count |
| `$gameParty.gold()` / `gainGold(n)` | money |
| `$gameParty.numItems($dataItems[7])` | quantity held |
| `$gameParty.hasItem($dataItems[7])` | boolean |
| `$gameParty.gainItem($dataItems[7], 1)` | add/remove (negative to remove) |
| `$gameParty.addActor(id)` / `removeActor(id)` | roster |
| `$gameParty.steps()` | steps walked |
| `$gameActors.actor(id)` | a `Game_Actor` |

On a `Game_Actor`: `name()` · `level` · `hp` · `mp` · `tp` · `param(n)` · `isStateAffected(id)`
(inherited from `Game_BattlerBase`) · `hasSkill(id)` · `isClass($dataClasses[n])` ·
`gainHp(n)` · `recoverAll()` · `changeExp(n, show)` · `setName(s)`

---

## Messages, screen, audio, system

```js
$gameMessage.setSpeakerName("Mira")           // MZ only
$gameMessage.setFaceImage("Actor1", 3)
$gameMessage.isBusy()

$gameScreen.startTint([-68,-68,0,0], 60)
$gameScreen.startFlash([255,255,255,255], 30)
$gameScreen.startShake(5, 5, 30)
$gameScreen.showPicture(id, name, origin, x, y, sx, sy, opacity, blend)
$gameScreen.erasePicture(id)

AudioManager.playSe({name:"Cursor1", volume:90, pitch:100, pan:0})
AudioManager.playBgm({name:"Town1", volume:90, pitch:100, pan:0})

$gameSystem.disableSave() / enableSave() / disableMenu() / enableMenu()
$gameSystem.playtime()            // seconds
$gameTimer.start(60 * 60)         // frames
$gameTimer.stop() / seconds() / frames() / isWorking()
```

---

## Interpreter control (Script command only)

```js
this._eventId                       // the calling map event's ID (0 if none)
this.character(0)                   // this event as a Game_Character
this.setWaitMode("route")           // make the event wait as if "Wait for Completion"
this.wait(30)                       // wait 30 frames from inside a script
$gameTemp.reserveCommonEvent(12)    // queue a Common Event to run after this one ends
$gameTemp.requestBalloon(character, 1)      // MZ. MV: character.requestBalloon(1)
$gameTemp.requestAnimation([character], 5)  // MZ takes an ARRAY. MV: character.requestAnimation(5)
```

---

## High-value idioms

**Set another event's self switch** — the canonical script call:
```js
$gameSelfSwitches.setValue([$gameMap.mapId(), 12, "A"], true)
```

**Loop over many events** without one command per event:
```js
$gameMap.events().filter(ev => ev.event().name.startsWith("TORCH"))
        .forEach(ev => $gameSelfSwitches.setValue([$gameMap.mapId(), ev.eventId(), "A"], true))
```
Naming events by convention and selecting on the name is a genuinely powerful, plugin-free way
to address groups.

**Distance in one line** (Conditional Branch → Script):
```js
$gameMap.distance($gamePlayer.x, $gamePlayer.y, this.character(0).x, this.character(0).y) <= 4
```

**Is the player standing on this event's tile:**
```js
$gamePlayer.pos(this.character(0).x, this.character(0).y)
```

**Count how many events of a group have a self switch set:**
```js
$gameVariables.setValue(40, [3,4,5,6].filter(id =>
  $gameSelfSwitches.value([$gameMap.mapId(), id, "A"])).length)
```

**Nearest event of a kind:**
```js
$gameMap.events()
  .filter(ev => ev.event().name.startsWith("NODE"))
  .sort((a,b) => $gameMap.distance($gamePlayer.x,$gamePlayer.y,a.x,a.y)
                - $gameMap.distance($gamePlayer.x,$gamePlayer.y,b.x,b.y))[0]
```

**Force a move route from script** (when the target is computed, not literal):
```js
const route = {list:[{code:1},{code:0}], repeat:false, skippable:true, wait:false};
$gameMap.event(7).forceMoveRoute(route);
```

---

## Risks

| Risk | Mitigation |
|---|---|
| Exceptions crash the game (no catch in MZ) | Guard `undefined` returns; playtest every call |
| `this` differs between the Script command and a Move Route script | Know which context you are in |
| `$dataMap` refers to the **current** map only | Never read another map's event data at runtime |
| Hard-coded event IDs break on renumbering | Comment the IDs, or select by event name |
| Non-numeric variables in page conditions | Keep them out of page conditions |
| Script calls are invisible to editor search and to reference checking | Prefer commands; comment every script call with what it does and why |
| MV/MZ API drift (`requestAnimation`, `requestBalloon`, `_params`) | See `mv-mz-differences.md` |
| Plugins override these methods | Check `js/plugins/` before relying on exact vanilla behaviour |

## Things that do **not** exist in vanilla — do not use them

`$gamePlayer.clearMoveRouteForcing()` · `$gameSelfSwitches.setValueByName()` ·
`Game_CharacterBase.requestBalloon` **in MZ** (MV only) ·
`Game_CharacterBase.requestAnimation` **in MZ** (MV only) ·
`$gameMap.spawnEvent()` · `$gameVariables.setSelfValue()`

Every one of those is a plugin API. If a project has the plugin installed, using it is fine —
verify in `js/plugins/` first.
