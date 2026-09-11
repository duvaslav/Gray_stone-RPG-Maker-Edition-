# MV vs MZ — verified differences

MZ is the reference implementation. Everything below was confirmed by diffing MV's
`rpg_objects.js` against MZ's `rmmz_objects.js`. See `source-index.md`.

**First step on any project: determine the engine.** MZ has `js/rmmz_objects.js`;
MV has `js/rpg_objects.js`. MV projects usually keep game data under `www/data/`, MZ under
`data/`.

---

## 1. What is identical

Good news first — the core event model does not differ:

- **`Game_Event` is functionally byte-identical** between MV and MZ (only formatting differs).
  Page selection, `meetsConditions`, triggers, priority, `isNearTheScreen` gating, autonomous
  movement and `stopCountThreshold` all behave the same.
- `Game_CommonEvent` is identical: `trigger === 2 && switch` for parallel.
- `Game_Map.setupStartingEvent` ordering, lowest-event-ID-wins, and the Autorun/Parallel model
  are the same.
- Move route command codes (`Game_Character.ROUTE_*`, 0–45) are the same.
- The JSON structure of maps, events, pages, common events and troops is the same, apart from
  the additions noted below.
- `Game_Variables.setValue` floors numbers in both.

So **architecture transfers directly**. Only specific commands and script APIs differ.

---

## 2. Event command differences

### Show Text (101) — the speaker name

| | Parameters |
|---|---|
| MZ | `[faceName, faceIndex, background, positionType, speakerName]` |
| MV | `[faceName, faceIndex, background, positionType]` |

MZ added the name box. Writing a 4-parameter 101 into an MZ project works
(`setSpeakerName(undefined)` = no name box) and real MZ projects contain both forms — but
**write 5 parameters for MZ**, with `""` for no speaker.

Porting MZ → MV: the 5th parameter is ignored, and the speaker name is silently lost. Move it
into the text (`\C[6]Mira\C[0]\n...`) or use a message plugin.

### Get Location Info (285) — "at this character"

MZ supports `parameters[2] === 2`, meaning "at the character in `parameters[3]`"
(−1 player / 0 this event / n event n). **MV has no such option** — it only supports literal
coordinates (0) and coordinates-from-variables (1).

Porting MZ → MV: copy the coordinates into two variables first, then use designation 1.

### Plugin Command — a total redesign

| | Code | Parameters | Handler |
|---|---|---|---|
| MV | 356 | `["PluginName arg1 arg2"]` — one space-separated string | `Game_Interpreter.pluginCommand(command, args)` |
| MZ | 357 | `[pluginName, commandName, displayName, argsObject]` | `PluginManager.callCommand(this, name, cmd, args)` |

In MZ, `Game_Interpreter.prototype.pluginCommand` is a **no-op stub** kept only for
compatibility. **An MV plugin command (356) in an MZ project does absolutely nothing, silently.**
That is the single most common MV→MZ porting failure.

MZ's `argsObject` values are **strings** even for numeric parameters, because they come from
the editor's parameter widgets: `{"animationId": "66"}`.

MZ ≥ 1.6 also runs `Utils.extractFileName(params[0])`, so a plugin stored in a subfolder
resolves correctly.

### Show Animation (212) / balloons

| | MV | MZ |
|---|---|---|
| Animation | `character.requestAnimation(id)` | `$gameTemp.requestAnimation([characters], id)` |
| Balloon | `character.requestBalloon(id)` | `$gameTemp.requestBalloon(character, id)` |

MZ can animate **multiple** targets at once and uses Effekseer for animation data; MV uses
sprite-sheet animations. Animation **IDs do not transfer** between engines — `Animations.json`
has a different format and different contents. Always re-pick animation IDs when porting.

Consequence for move-route scripts: `this.requestBalloon(1)` works in MV and **throws in MZ**.

### Move Picture (232) — easing

MZ added `parameters[12]`, the easing type (0 constant · 1 slow start · 2 slow end · 3 both).
MV has 12 parameters and always uses constant speed.

### Skip (109)

**MZ 1.5.0 added command 109 "Skip"**, which calls `skipBranch()` — it is how the editor
disables a block of commands without deleting them. MV has no such command; a 109 in data
loaded by MV is simply ignored (no `command109` method), which means **the block below it would
execute** rather than being skipped. Never port a 109 to MV.

### Commands present in one engine only

MZ has a slightly larger command set overall (notably 109 and the reworked plugin command). No
common command was removed in MZ. Battle command 337 gained the "whole troop" parameter as a
conversion artefact from MV data.

---

## 3. Interpreter architecture

| | MV | MZ |
|---|---|---|
| Parameter access | `this._params` set by `executeCommand` | passed as a function argument |
| Current character | `this._character` (a live object) | `this._characterId` (a number) |
| Error handling | try/catch that annotates and rethrows, with `_eventInfo` | no try/catch |
| Common Event reservation | `$gameTemp._commonEventId`, a **single slot** — a second reservation overwrites the first | `_commonEventQueue`, a **FIFO queue** — all reservations run |

Storing an ID rather than an object was a deliberate MZ change so the interpreter serialises
cleanly into save data. Plugins that patched MV's `_params` do not work in MZ.

### Jump to Label frame cost

- **MV, and MZ ≤ 1.4:** `command119` returns `undefined` after jumping → `executeCommand`
  treats it as `false` → the interpreter stops for that frame. Every jump costs one frame, so
  label loops were self-throttling.
- **MZ ≥ 1.5:** the code `break`s and returns `true` → a jump is free → a Label/Jump loop with
  no `Wait` **hard-freezes the game**.

Always put an explicit `Wait` in a label loop; never rely on the old implicit throttle.

### Timer condition precision

MZ ≥ 1.5 compares `$gameTimer.frames() / 60` instead of `seconds()` (which floors), so timer
conditional branches are sub-second accurate. MV and early MZ compare whole seconds.

---

## 4. Data and engine features

| | MV | MZ |
|---|---|---|
| Event `note` field | no | **yes** — plugins read notetags from it |
| Map `note` field | no | yes |
| Tile size | fixed 48 px | `$dataSystem.tileSize` (MZ ≥ 1.5); `Game_Map.tileWidth()` reads it |
| Data folder | usually `www/data/` | `data/` |
| Core scripts | `js/rpg_*.js` (6 files) | `js/rmmz_*.js` (6 files) |
| Renderer | Pixi 4 | Pixi 5 |
| Animations | sprite sheets, `Animations.json` | Effekseer `.efkefc` files |
| Autosave | no | yes (`optAutosave`) |
| Touch UI buttons | no | yes |
| Plugin parameter structs | limited | full struct/array support |

---

## 5. Plugins

**MV plugins do not run in MZ and vice versa**, except by coincidence for pure-logic plugins
that touch no changed API. The barriers are the plugin command system (356 vs 357), the
`_params` vs argument change, the animation system, and the renderer.

Never assume a plugin name means the same thing in both engines. Yanfly's MV plugins (YEP) and
VisuStella's MZ plugins are different products with different parameter names and different
notetags.

---

## 6. Porting checklist

**MV → MZ**
- [ ] Replace every 356 plugin command with the MZ plugin's 357 equivalent — or the call does
      nothing at all.
- [ ] Re-point every animation ID; MV animation data does not convert.
- [ ] Add the 5th parameter to every `Show Text`.
- [ ] Replace `character.requestAnimation/requestBalloon` script calls with the `$gameTemp`
      forms.
- [ ] Audit label loops for a missing `Wait` — the implicit per-jump frame is gone.
- [ ] Re-verify plugins; assume none carry over.

**MZ → MV**
- [ ] Remove command 109 blocks, or MV will execute what MZ skipped.
- [ ] Rewrite `Get Location Info` designation 2 as coordinate variables.
- [ ] Speaker names move into the message text.
- [ ] Remove `Move Picture` easing.
- [ ] Drop event/map `note` usage.
- [ ] Replace `$gameTemp.requestAnimation/requestBalloon` with the character methods.
- [ ] Multiple `reserveCommonEvent` calls: only the last survives in MV.

---

## 7. Writing engine-agnostic events

Most systems can be built to run on both:

- Use only the shared command set; avoid 109 and `Get Location Info` designation 2.
- Keep script calls to the APIs that exist in both (`$gameSwitches`, `$gameVariables`,
  `$gameSelfSwitches`, `$gameMap.event/distance/regionId`, character `x`/`y`/`direction()`,
  `moveTowardCharacter`, `turnTowardCharacter`).
- Wrap the few engine-specific calls in a Common Event so there is exactly one place to swap.
- Do not depend on the Jump-to-Label frame cost in either direction.
- Prefer standard commands over script calls generally — they are the most portable layer.
