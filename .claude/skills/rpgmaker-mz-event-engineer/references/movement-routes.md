# Move Routes

Move Routes are not only locomotion — they are the engine's staging system. Direction changes,
graphic swaps, opacity, blend mode, SE and arbitrary script all live here, which makes the
route the primary tool for choreography.

---

## 1. Route object format

```json
{"repeat": false, "skippable": false, "wait": true,
 "list": [ {"code": 1}, {"code": 15, "parameters":[30]}, {"code": 0} ]}
```

| Flag | Effect |
|---|---|
| `repeat` | On reaching the end, `_moveRouteIndex` resets to 0 and the route loops forever |
| `skippable` | **Critical.** If false, a step that cannot execute is retried forever |
| `wait` | The *calling event* waits for the route to finish (`setWaitMode("route")`) |

The list always ends with `{"code": 0}`. Steps with no arguments omit `parameters` entirely.
Remember the mirror `505` lines in the event list — see `event-json-format.md`.

## 2. Complete move-route command codes

From `Game_Character.ROUTE_*` constants.

| Code | Command | Params |
|---|---|---|
| 0 | End of route | — |
| 1–4 | Move Down / Left / Right / Up | — |
| 5–8 | Move Lower L / Lower R / Upper L / Upper R | — |
| 9 | Move at Random | — |
| 10 | Move toward Player | — |
| 11 | Move away from Player | — |
| 12 | 1 Step Forward | — |
| 13 | 1 Step Backward | — |
| 14 | Jump | `[dx, dy]` (relative tiles; `[0,0]` = jump in place) |
| 15 | Wait | `[frames]` |
| 16–19 | Turn Down / Left / Right / Up | — |
| 20 | Turn 90° Right | — |
| 21 | Turn 90° Left | — |
| 22 | Turn 180° | — |
| 23 | Turn 90° Right or Left (random) | — |
| 24 | Turn at Random | — |
| 25 | Turn toward Player | — |
| 26 | Turn away from Player | — |
| 27 | Switch ON | `[switchId]` |
| 28 | Switch OFF | `[switchId]` |
| 29 | Change Speed | `[1..6]` |
| 30 | Change Frequency | `[1..5]` |
| 31 / 32 | Walking Animation ON / OFF | — |
| 33 / 34 | Stepping Animation ON / OFF | — |
| 35 / 36 | Direction Fix ON / OFF | — |
| 37 / 38 | Through ON / OFF | — |
| 39 / 40 | Transparent ON / OFF | — |
| 41 | Change Image | `[characterName, characterIndex]` |
| 42 | Change Opacity | `[0..255]` |
| 43 | Change Blend Mode | `[0 normal, 1 add, 2 multiply, 3 screen]` |
| 44 | Play SE | `[{name,volume,pitch,pan}]` |
| 45 | Script | `["expression"]` |

Codes 27/28 (Switch ON/OFF) are the classic way to signal "this actor has arrived" from inside
a non-waiting route — see §5.

---

## 3. The stall trap — the number one cause of frozen cutscenes

```js
Game_Character.prototype.advanceMoveRouteIndex = function() {
    const moveRoute = this._moveRoute;
    if (moveRoute && (this.isMovementSucceeded() || moveRoute.skippable)) {
        this._moveRouteIndex++;
        ...
    }
};
```

**If a move fails and `skippable` is false, the index does not advance — the engine retries the
same step forever.** Combined with `wait: true`, the calling event waits forever too. The
player cannot move, no other event can run: a total softlock, with no error message.

A move fails when: the target tile is impassable; another Same-as-Characters event or the
player is standing there; the tile is off the map edge; or a follower is in the way.

### Defences, in order of preference

1. **Make the path genuinely clear.** Verify the tiles in the editor. This is the real fix.
2. **Tick `skippable`** on any route whose path could be blocked by the player. Cost: the actor
   may end up somewhere unintended, so follow with an explicit `Set Event Location` if the
   final position matters.
3. **Through ON at the start of the route, Through OFF at the end.** Cutscene actors should
   almost always do this — it guarantees arrival regardless of where the player is standing.
   Remember to turn it back off, or the NPC stays non-solid.
4. **Move the player out of the way first** (or `Gather Followers` / hide followers).
5. **Never use `wait: true` on a route that can fail.** If you must, make it skippable.

A route with `repeat: true` **and** `wait: true` never returns — the interpreter waits for a
route that by definition never ends. Never combine those two flags.

---

## 4. Forced vs autonomous routes

`Set Movement Route` calls `forceMoveRoute()`:

```js
if (!this._originalMoveRoute) this.memorizeMoveRoute();
this._moveRoute = moveRoute; this._moveRouteIndex = 0;
this._moveRouteForcing = true; this._waitCount = 0;
```

- The page's autonomous Custom route is **memorised and restored** when the forced route ends
  (`processRouteEnd`). So a patrolling guard that you interrupt with a forced route resumes its
  patrol afterwards, from where it left off. That is usually desirable; if you want the patrol
  to restart cleanly, re-apply it explicitly.
- A forced route with `repeat: true` **never ends**, so the memorised route is never restored
  and `isMoveRouteForcing()` stays true forever. That is how you replace an autonomous route
  permanently — deliberately. It also means `Wait for Completion` on it will hang.
- `$gamePlayer.clearMoveRouteForcing()` is not a corescript method — do not invent it; to
  release the player, force a short non-repeating route instead.
- Changing pages calls `setMoveRoute()`, which, while a forced route is active, writes to
  `_originalMoveRoute` instead — the new page's autonomous route takes effect only after the
  forced route finishes.

---

## 5. Moving several characters at once

`Set Movement Route` with `wait: false` **starts** the route and returns immediately. This is
how simultaneous movement works.

### The standard pattern

```
◆Set Movement Route: Event 3 (Guard A)   [Wait: OFF]  — 6 steps
◆Set Movement Route: Event 4 (Guard B)   [Wait: OFF]  — 6 steps
◆Set Movement Route: Event 5 (Guard C)   [Wait: OFF]  — 6 steps
◆Set Movement Route: Event 6 (Captain)   [Wait: ON ]  — 6 steps   ← only the last one waits
```

**Caveat everyone hits:** the interpreter only waits for the *one* route flagged `wait`. If
Guard C's route is longer than the Captain's, the scene continues while Guard C is still
walking. So:

- Put `wait: ON` on the route that takes **longest**, or
- give every actor the same number of steps and speed, or
- pad the waiting route with `Wait` steps so it is provably the longest, or
- use the switch handshake below when durations genuinely differ.

### Switch handshake — exact synchronisation

Give each actor a route that ends with `Switch ON`:

```
Route for Event 3: … , Switch ON [SYS_Sync_A]
Route for Event 4: … , Switch ON [SYS_Sync_B]

Controller:
  ◆Control Switches: [SYS_Sync_A, SYS_Sync_B] = OFF
  ◆Set Movement Route: Event 3 [Wait OFF]
  ◆Set Movement Route: Event 4 [Wait OFF]
  ◆Loop
    ◆Conditional Branch: SYS_Sync_A is ON
      ◆Conditional Branch: SYS_Sync_B is ON
        ◆Break Loop
    ◆Wait: 3 frames
  ◆Repeat Above
```

This waits for **all** actors regardless of route length. The `Wait: 3` inside the loop is
mandatory — without it the loop burns 100000 iterations per frame.

### Delays inside routes, not outside

To stagger entrances, put `Wait` **inside** each actor's route:

```
Event 3: Wait 0,  Move Left ×4
Event 4: Wait 20, Move Left ×4
Event 5: Wait 40, Move Left ×4
```

A `Wait` command in the *event list* between the Set Movement Route commands would block the
whole scene, not stagger it.

---

## 6. Staging techniques

| Effect | Route recipe |
|---|---|
| Fade an NPC in | Transparent ON → Change Opacity 0 → Transparent OFF → several Change Opacity steps with Waits (opacity does not tween; step it) |
| Walk in from off-screen | Place the event off the visible area, Through ON, Move ×n, Through OFF |
| Turn to look at someone | Turn toward Player, or Script `this.turnTowardCharacter($gameMap.event(5))` |
| Double-take | Turn away → Wait 8 → Turn toward Player → Wait 12 → balloon |
| Nod | Turn Down → Wait 6 → Turn Up → Wait 6 → Turn Down |
| Shake head "no" | Turn Left → Wait 5 → Turn Right → Wait 5 → Turn Left → Wait 5 → Turn Down |
| Startled hop | Jump `[0,0]` with a Play SE step |
| Recoil / step back | 1 Step Backward with Direction Fix ON so the sprite keeps facing forward |
| Sit down / change pose | Change Image to a pose sheet, Direction Fix ON |
| Sneak | Change Speed 2, Walking Animation ON, Change Frequency 5 |
| Ghost | Change Opacity 160 + Change Blend Mode 1 (add) + Through ON |
| Footstep sounds | Play SE steps interleaved between Move steps |
| Idle life | Stepping Animation ON on the page (no route needed) |

**Opacity does not interpolate.** `Change Opacity` snaps. For a fade, emit a ladder of
opacity/wait pairs inside the route (e.g. 0, 32, 64 … 255 with `Wait 2` between), or fade the
screen instead.

---

## 7. Direction Fix interactions

`Direction Fix ON` freezes the sprite's facing but **not** its movement, and it also blocks the
automatic turn-to-face-player that `Game_Event.lock()` performs when the player talks to it.

Use it for:
- Objects and statues that must not swivel when talked to.
- An NPC walking backwards away from the player (Direction Fix ON, facing the player, then
  1 Step Backward repeatedly).
- Keeping a cutscene actor's dramatic facing while they move.

Note that `setupPageSettings` resets Direction Fix from the page whenever the page changes, and
that changing `image.direction` on a page resets `_prelockDirection` and clears direction fix
before applying the page value.

---

## 8. Speed and frequency reference

| Speed | Name | Frames per tile |
|---|---|---|
| 1 | x8 Slower | 128 |
| 2 | x4 Slower | 64 |
| 3 | x2 Slower | 32 |
| 4 | Normal | 16 |
| 5 | x2 Faster | 8 |
| 6 | x4 Faster | 4 |

Frequency only affects **autonomous** movement (the pause between self-directed steps):
`stopCountThreshold = 30 * (5 - frequency)` → 120 / 90 / 60 / 30 / 0 frames. It has no effect
on forced routes, which execute steps back to back.

For cutscene timing arithmetic: an actor at speed 4 moving 5 tiles takes 80 frames ≈ 1.3 s.

---

## 9. Script steps inside routes (code 45)

Executed via `eval` with `this` bound to the **character**, not the interpreter. Useful because
it happens *in sequence with the movement*:

```js
this.setOpacity(128)
this.turnTowardCharacter($gameMap.event(5))
this.setBlendMode(1)
this.requestBalloon(2)                       // MV only; in MZ use $gameTemp.requestBalloon(this, 2)
$gameSelfSwitches.setValue([$gameMap.mapId(), 7, "A"], true)
```

Keep them to one expression. Anything longer belongs in the event list as a `Script` command or
in a plugin. Verify every method against `script-calls-mz.md` before use — `this` here is a
`Game_Character`, so `Game_Interpreter` methods are not available.

---

## 10. Checklist

- [ ] Can any step be blocked? If yes: `skippable`, or Through ON/OFF, or clear the path.
- [ ] Is `repeat` combined with `wait`? Never do that.
- [ ] Does exactly one route in a simultaneous group have `wait: ON`, and is it the longest?
- [ ] Do delays live inside the routes rather than between them?
- [ ] Is Through turned back OFF after the route?
- [ ] Are the mirror `505` lines written for every `205`?
- [ ] After the scene, is every actor's speed, opacity, blend mode, direction fix and graphic
      restored?
