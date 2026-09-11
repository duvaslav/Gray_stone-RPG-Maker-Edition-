# Event Commands (MZ) — code, parameters, and what the interpreter really does

Parameters are given as the JSON `parameters` array. Behaviour notes come from
`Game_Interpreter` in the MZ corescript. "**returns false**" means the command can stall the
interpreter for a frame and retry — useful to know when reasoning about timing.

MV differences are marked **[MV]**; see `mv-mz-differences.md` for the full list.

---

## Messages

| Code | Command | Parameters |
|---|---|---|
| 101 | Show Text | `[faceName, faceIndex, background, positionType, speakerName]` |
| 401 | ↳ text line | `[text]` |
| 102 | Show Choices | `[choices[], cancelType, defaultType, positionType, background]` |
| 402 | ↳ When [n] | `[index, choiceText]` |
| 403 | ↳ When Cancel | `[]` |
| 404 | ↳ End Choices | `[]` |
| 103 | Input Number | `[variableId, digits]` |
| 104 | Select Item | `[variableId, itemType]` |
| 105 | Show Scrolling Text | `[speed, noFastForward]` |
| 405 | ↳ text line | `[text]` |

- `background`: 0 Window · 1 Dim · 2 Transparent. `positionType`: 0 Top · 1 Middle · 2 Bottom.
- `speakerName` is **MZ only**; `""` = no name box. **[MV]** has only 4 parameters.
- **101 returns false while `$gameMessage.isBusy()`**, then consumes all following 401 lines
  *and* an immediately following 102/103/104. That last part matters: a `Show Choices`
  directly after a `Show Text` is absorbed into the same window, so the text stays on screen
  behind the choices. Insert any other command between them to break that coupling.
- `cancelType`: `-1` disallow cancel · `-2` run the `403` branch · `0..n-1` cancel selects that
  choice. The engine coerces any value `>= choices.length` to `-2`.
- `defaultType`: `-1` none, else the pre-highlighted index.
- `itemType` for 104: 0 normal · 1 key item · 2 hidden A · 3 hidden B.
- Text codes usable inside 401: `\V[n]` variable, `\N[n]` actor name, `\P[n]` party member,
  `\G` currency, `\C[n]` colour, `\I[n]` icon, `\{` `\}` size, `\\` backslash, `\$` gold
  window, `\.` ¼s wait, `\|` 1s wait, `\!` wait for input, `\>` `\<` instant text, `\^` skip
  the closing input.

## Flow control

| Code | Command | Parameters |
|---|---|---|
| 108 | Comment | `[text]` |
| 408 | ↳ further comment line | `[text]` |
| 109 | Skip (MZ ≥ 1.5) | `[]` — skips the indented block below it |
| 111 | Conditional Branch | see below |
| 411 | ↳ Else | `[]` |
| 412 | ↳ End | `[]` |
| 112 | Loop | `[]` |
| 413 | ↳ Repeat Above | `[]` |
| 113 | Break Loop | `[]` |
| 115 | Exit Event Processing | `[]` |
| 117 | Common Event | `[commonEventId]` |
| 118 | Label | `[name]` |
| 119 | Jump to Label | `[name]` |

### 111 Conditional Branch parameter layouts

`parameters[0]` selects the type:

| Type | Layout | Notes |
|---|---|---|
| 0 Switch | `[0, switchId, 0\|1]` | `0` means "is ON" |
| 1 Variable | `[1, varId, operandType, operand, comparison]` | operandType 0 constant / 1 variable; comparison 0 `==` 1 `>=` 2 `<=` 3 `>` 4 `<` 5 `!=` |
| 2 Self Switch | `[2, "A".."D", 0\|1]` | **only works when `_eventId > 0`** — always false inside a Common Event called from the menu or a battle |
| 3 Timer | `[3, seconds, 0\|1]` | 0 `>=`, 1 `<=`; false if the timer is not running |
| 4 Actor | `[4, actorId, kind, value]` | kind 0 in party · 1 name · 2 class · 3 skill · 4 weapon · 5 armor · 6 state |
| 5 Enemy | `[5, index, kind, stateId]` | kind 0 appeared · 1 state |
| 6 Character | `[6, charId, direction]` | charId −1 player · 0 this event · n event n |
| 7 Gold | `[7, amount, 0\|1\|2]` | 0 `>=` · 1 `<=` · 2 `<` |
| 8/9/10 | Item / Weapon / Armor | `[8, itemId]`, `[9, weaponId, includeEquip]`, `[10, armorId, includeEquip]` |
| 11 Button | `[11, keyName, mode]` | mode 0 pressed · 1 triggered · 2 repeated |
| 12 Script | `[12, "expression"]` | `eval`'d; `this` is the interpreter |
| 13 Vehicle | `[13, vehicleType]` | |

Note there is **no "variable equals variable with an operator" shortcut beyond this** — the
comparison operators do exist here (unlike page conditions, which are `>=` only). Use
Conditional Branch when you need exact equality on a state variable.

### Loops and labels

- `112`/`413` is a true infinite loop with **zero frame cost per iteration**. Without a `Wait`
  or a `Break Loop` it burns 100000 iterations per frame forever (`checkFreeze`) and the game
  appears hung.
- `113 Break Loop` scans forward for the matching `413`, tracking nesting depth. It breaks out
  of **one** loop level.
- `115 Exit Event Processing` sets `_index = _list.length`, ending this list. Inside a Common
  Event called by `117`, it exits **only the Common Event**; the caller resumes.
- `119 Jump to Label` jumps to the first `118` with a matching name, anywhere in the list —
  including backwards, and including into a different indent level. `jumpTo` nulls the branch
  state of every indent it crosses, so jumping into the middle of a conditional block leaves
  that block's `_branch` undefined and its `411`/`412` behave unpredictably. Jump only to
  labels at indent 0, or at the same indent as the jump.

## Game progression

| Code | Command | Parameters |
|---|---|---|
| 121 | Control Switches | `[startId, endId, 0\|1]` (0 = ON) |
| 122 | Control Variables | `[startId, endId, opType, operand, ...]` |
| 123 | Control Self Switch | `["A".."D", 0\|1]` (0 = ON) |
| 124 | Control Timer | `[0\|1, seconds]` (0 = start) |

### 122 Control Variables

`opType`: 0 Set · 1 Add · 2 Sub · 3 Mul · 4 Div · 5 Mod.
`operand` (`parameters[3]`) selects the rest:

| operand | Remaining parameters |
|---|---|
| 0 Constant | `[4] = value` |
| 1 Variable | `[4] = sourceVarId` |
| 2 Random | `[4] = min, [5] = max` (inclusive) |
| 3 Game Data | `[4] = type, [5] = param1, [6] = param2` |
| 4 Script | `[4] = "expression"` |

Game Data types: 0 Item count · 1 Weapon · 2 Armor · 3 Actor (`param2`: 0 level, 1 exp, 2 hp,
3 mp, 12 tp, 4–11 params) · 4 Enemy · 5 **Character** (`param1` = −1 player / 0 this event /
n event; `param2`: 0 Map X · 1 Map Y · 2 Direction · 3 Screen X · 4 Screen Y) · 6 Party member
actor ID · 7 Other (0 Map ID · 1 party size · 2 gold · 3 steps · 4 playtime · 5 timer ·
6 save count · 7 battle count · 8 win count · 9 escape count) · 8 Last action data.

Type 5 is the workhorse for spatial logic — see `spatial-eventing.md`.

**Important arithmetic facts:**
- `Game_Variables.setValue` **floors** any number. Division truncates toward −∞
  (`-7 / 2` stores `-4`). Store scaled integers if you need fractions.
- Division by zero yields `Infinity`, which floors to `Infinity` and poisons the variable —
  guard divisors.
- `operateVariable` is wrapped in try/catch and stores `0` on exception.
- Setting a variable ID outside `0 < id < $dataSystem.variables.length` is **silently
  ignored**. If your variable "won't set", check the declared count in `System.json` first.
- Variables can hold non-numbers if set via a Script operand (strings, arrays, objects). They
  are saved and loaded fine, but page conditions compare them with `<` and will behave oddly.

## Movement

| Code | Command | Parameters |
|---|---|---|
| 201 | Transfer Player | `[designation, mapId, x, y, direction, fadeType]` |
| 202 | Set Vehicle Location | `[vehicle, designation, mapId, x, y]` |
| 203 | Set Event Location | `[charId, designation, x, y, direction]` |
| 204 | Scroll Map | `[direction, distance, speed, waitForCompletion]` |
| 205 | Set Movement Route | `[charId, routeObject]` + mirror `505` lines |
| 206 | Get on/off Vehicle | `[]` |

- `designation` 0 = literal values, 1 = read from variables. For **203** `designation` 2 means
  "swap position with the event whose ID is in `parameters[2]`".
- `direction` 0 = keep current, else 2/4/6/8. `fadeType` 0 black · 1 white · 2 none.
- **201 returns false** while in battle or a message is busy, and sets wait mode `transfer`.
  Everything after a Transfer in the same event list runs **on the new map** — but the event's
  own `_mapId` is unchanged, so `Control Self Switch` after a transfer still writes to the
  *old* map's key, and `Erase Event` becomes a no-op (`command214` checks `isOnCurrentMap()`).
  Put post-transfer logic in a Common Event or an Autorun on the destination map.
- **205** calls `$gameMap.refreshIfNeeded()` first, then `forceMoveRoute`. If the route's
  `wait` flag is true it sets wait mode `route`. `charId`: −1 player · 0 this event · n event n.
  In battle `this.character()` returns `null` and the command silently does nothing.

## Character

| Code | Command | Parameters |
|---|---|---|
| 211 | Change Transparency | `[0\|1]` (0 = transparent ON) |
| 212 | Show Animation | `[charId, animationId, wait]` |
| 213 | Show Balloon Icon | `[charId, balloonId, wait]` |
| 214 | Erase Event | `[]` |
| 216 | Change Player Followers | `[0\|1]` (0 = show) |
| 217 | Gather Followers | `[]` |

- Balloon IDs: 1 Exclamation · 2 Question · 3 Music Note · 4 Heart · 5 Anger · 6 Sweat ·
  7 Cobweb · 8 Silence · 9 Light Bulb · 10 Zzz · 11–15 user.
- **214 Erase Event** sets `_erased = true` and refreshes to page index −1: the event goes
  invisible, intangible and inert **for the rest of this map visit only**. It is restored on
  re-entering the map. It is not a substitute for a Self Switch. Use it for one-visit cleanup
  (a cutscene actor who walks off), never for permanent state.
- **217 Gather Followers** sets wait mode `gather` and will wait forever if a follower cannot
  reach the player. Give followers a clear path, or hide them first with 216.

## Screen and pictures

| Code | Command | Parameters |
|---|---|---|
| 221 | Fadeout Screen | `[]` — always waits 24 frames |
| 222 | Fadein Screen | `[]` — always waits 24 frames |
| 223 | Tint Screen | `[[r,g,b,gray], duration, wait]` |
| 224 | Flash Screen | `[[r,g,b,intensity], duration, wait]` |
| 225 | Shake Screen | `[power, speed, duration, wait]` |
| 230 | Wait | `[frames]` |
| 231 | Show Picture | `[id, name, origin, designation, x, y, scaleX, scaleY, opacity, blendMode]` |
| 232 | Move Picture | `[id, _, origin, designation, x, y, scaleX, scaleY, opacity, blendMode, duration, wait, easing]` |
| 233 | Rotate Picture | `[id, speed]` |
| 234 | Tint Picture | `[id, [r,g,b,gray], duration, wait]` |
| 235 | Erase Picture | `[id]` |
| 236 | Set Weather Effect | `[type, power, duration, wait]` |

- Tint values are −255…255 for RGB and 0…255 for gray. `[0,0,0,0]` is neutral.
- Picture `origin` 0 upper-left · 1 centre. Centre origin is what you want for anything that
  scales or rotates.
- `easing` on 232 is MZ only: 0 constant · 1 slow start · 2 slow end · 3 slow both.
- Weather `type`: `"none"`, `"rain"`, `"storm"`, `"snow"`. **236 is ignored in battle.**
- Picture IDs are a global, shared namespace (1–100 by default). Collisions between a cutscene
  and a plugin HUD are a common bug — band your IDs (see `style-guide.md`).

## Audio

| Code | Command | Parameters |
|---|---|---|
| 241 | Play BGM | `[{name,volume,pitch,pan}]` |
| 242 | Fadeout BGM | `[seconds]` |
| 243 | Save BGM | `[]` |
| 244 | Resume BGM | `[]` |
| 245 | Play BGS | `[{...}]` |
| 246 | Fadeout BGS | `[seconds]` |
| 249 | Play ME | `[{...}]` |
| 250 | Play SE | `[{...}]` |
| 251 | Stop SE | `[]` |
| 261 | Play Movie | `[name]` |

243/244 (Save/Resume BGM) are the correct way to bracket a cutscene that changes music:
Save BGM → play scene music → Resume BGM. ME plays over the BGM and pauses it automatically.

## Map / scene / system

| Code | Command | Parameters |
|---|---|---|
| 281 | Change Map Name Display | `[0\|1]` |
| 282 | Change Tileset | `[tilesetId]` — **returns false** until images load |
| 283 | Change Battle Background | `[bb1, bb2]` |
| 284 | Change Parallax | `[name, loopX, loopY, sx, sy]` |
| 285 | Get Location Info | `[varId, infoType, designation, x, y]` |
| 301 | Battle Processing | `[type, troopId, canEscape, canLose]` |
| 601/602/603/604 | ↳ Win / Escape / Lose / End | `[]` |
| 302 | Shop Processing | `[goodsType, id, priceType, price, purchaseOnly]` |
| 605 | ↳ additional goods row | `[goodsType, id, priceType, price]` |
| 303 | Name Input Processing | `[actorId, maxLength]` |
| 351 | Open Menu Screen | `[]` |
| 352 | Open Save Screen | `[]` |
| 353 | Game Over | `[]` |
| 354 | Return to Title Screen | `[]` |
| 355 | Script | `[line]` |
| 655 | ↳ further script line | `[line]` |
| 356 | Plugin Command (MV legacy) | `["Name arg1 arg2"]` |
| 357 | Plugin Command (MZ) | `[pluginName, commandName, displayName, argsObject]` |
| 657 | ↳ argument display line | `[text]` |

### 285 Get Location Info

`infoType`: 0 Terrain Tag · 1 Event ID · 2–5 Tile ID layers 1–4 · 6+ Region ID.
`designation`: 0 literal x/y · 1 x/y from variables · **2 = "at this character"**, where
`parameters[3]` is the character ID (−1 player, 0 this event, n event n). Designation 2 is
**MZ only** and is the cleanest way to read the region under an NPC.

### 355 Script

All consecutive 355/655 lines are concatenated with newlines and `eval`'d **in the interpreter's
scope**, so `this` is the `Game_Interpreter`: `this._eventId`, `this.character(0)`,
`this.setWaitMode("route")` all work. The command always returns `true` — a thrown error
propagates and crashes to the console, it is not swallowed. See `script-calls-mz.md`.

### 357 Plugin Command (MZ)

`PluginManager.callCommand(this, Utils.extractFileName(params[0]), params[1], params[3])`.
- `parameters[0]` is the **plugin file name** (the editor may store a path; MZ ≥ 1.6 strips it).
- `parameters[1]` is the internal command name registered with `PluginManager.registerCommand`.
- `parameters[2]` is the human-readable name shown in the editor — cosmetic.
- `parameters[3]` is an object whose **values are strings**, even for numbers, because they come
  from the editor's parameter widgets. Real data: `{"animationId": "66"}`.

Never invent these. Open `js/plugins/<Name>.js`, find the `@command` / `@arg` annotations and
the `registerCommand` calls, and copy the exact names. Then add the `657` display lines to
match, or the editor shows a blank argument list.

**[MV]** uses 356 with a single space-separated string. MZ's `pluginCommand` hook is a no-op
stub, so an MV plugin command in an MZ project does nothing at all — silently.

## Actor / party / battle commands

125 Change Gold · 126/127/128 Change Items/Weapons/Armors · 129 Change Party Member ·
132–140 system settings (battle BGM, victory ME, save/menu/encounter/formation access, window
colour, defeat ME, vehicle BGM) · 311–326 actor changes (HP, MP, TP, state, recover, EXP,
level, parameter, skill, equipment, name, class, images, nickname, profile) ·
331–342 enemy changes · 339 Force Action · 340 Abort Battle.

Their parameter layouts follow the same conventions: `[..., operation(0 add/1 remove),
operandType(0 const/1 var), operand]`. Look one up in real project data before writing it.

---

## Commands that block, and for how long

Knowing which commands cost frames is how you reason about cutscene pacing and parallel cost.

| Command | Blocking behaviour |
|---|---|
| 101/102/103/104/105 | Wait mode `message` until the window closes |
| 201 Transfer | Wait mode `transfer`; execution resumes on the new map |
| 204 Scroll Map | Wait mode `scroll` only if `waitForCompletion` |
| 205 Move Route | Wait mode `route` only if `route.wait`; **waits forever if the route stalls** |
| 212 / 213 | Wait mode `animation` / `balloon` only if the wait flag is set |
| 217 Gather Followers | Wait mode `gather`, indefinite |
| 221 / 222 Fade | Unconditional 24-frame wait |
| 223/224/225/234/236 | Frame wait equal to `duration` only if the wait flag is set |
| 230 Wait | Exactly `frames` |
| 261 Play Movie | Wait mode `video` |
| 282 Change Tileset | Returns false (retries) until tileset images are loaded |
| 301 Battle Processing | Scene change |
| everything else | Free — completes within the same frame |
