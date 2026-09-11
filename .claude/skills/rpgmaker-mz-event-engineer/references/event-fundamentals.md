# Event Fundamentals — what the engine actually does

Everything here is verified against RPG Maker MZ corescript `rmmz_objects.js`
(`Game_Event`, `Game_Map`, `Game_Player`, `Game_Interpreter`, `Game_CommonEvent`).
`Game_Event` is functionally identical in MV and MZ, so page/trigger/condition behaviour is
shared. See `source-index.md`.

---

## 1. Page selection

```js
Game_Event.prototype.findProperPageIndex = function() {
    const pages = this.event().pages;
    for (let i = pages.length - 1; i >= 0; i--) {
        if (this.meetsConditions(pages[i])) return i;
    }
    return -1;
};
```

**The highest-numbered page whose conditions are all satisfied wins.** Pages are scanned from
the bottom up and the first match is taken. Consequences:

- Page 1 is the fallback / default state. Later pages are progressively more specific states.
- Conditions on a page are ANDed. There is no OR between conditions on one page — model OR by
  duplicating pages or by folding the condition into a Variable.
- Only **one** page is ever active. A page does not "inherit" anything from lower pages: when
  a page becomes active, `setupPageSettings` overwrites graphic, move type, speed, frequency,
  priority, walk/step anime, direction fix, through, move route and trigger from that page.
- If **no** page matches, `clearPageSettings` runs: blank graphic, `trigger = null`,
  `through = true`, no interpreter. The event still exists and occupies its tile logically,
  but it is invisible, intangible and untriggerable.

### The five condition types

```js
if (c.switch1Valid  && !$gameSwitches.value(c.switch1Id))      return false;
if (c.switch2Valid  && !$gameSwitches.value(c.switch2Id))      return false;
if (c.variableValid && $gameVariables.value(c.variableId) < c.variableValue) return false;
if (c.selfSwitchValid && $gameSelfSwitches.value([mapId,eventId,c.selfSwitchCh]) !== true) return false;
if (c.itemValid     && !$gameParty.hasItem($dataItems[c.itemId]))   return false;
if (c.actorValid    && !$gameParty.members().includes(actor))       return false;
```

- **Two switch slots maximum** per page. Need three global conditions? Use a Variable, or set
  a derived "gate" switch from a Common Event.
- **The Variable condition is `>=`, always.** There is no "equal to" or "less than" page
  condition. This is the single most important constraint on state-machine design: order your
  state values ascending and put the *higher* state on the *higher* page, so the
  bottom-up scan picks the right one. See `event-state-machines.md`.
- **Self Switch** condition tests one of `A`/`B`/`C`/`D`, keyed by `[mapId, eventId, letter]`.
- **Item** checks possession of at least 1; **Actor** checks party membership (not just
  existence).

### When pages are re-evaluated

Setting a Switch, Variable or Self Switch calls `$gameMap.requestRefresh()`, which only sets
a flag. The actual `Game_Map.refresh()` (which calls `refresh()` on every event and common
event) happens at the top of the next `Game_Map.update()`, or immediately when something calls
`refreshIfNeeded()` — notably `Game_Map.setupStartingEvent()` and `command205` (Set Movement
Route).

**Practical consequence:** page conditions are *not* re-checked mid-command. Turning a switch
ON does not instantly swap the running page — the currently running command list keeps
running to completion on the old page. That is usually what you want, and it is why
`Control Self Switch` followed by more commands is safe.

---

## 2. Triggers

Stored as `page.trigger`:

| Value | Trigger | Started by |
|---|---|---|
| 0 | Action Button | Player presses OK facing it, or standing on it |
| 1 | Player Touch | Player walks onto it, or walks into it |
| 2 | Event Touch | Same as Player Touch, **plus** the event walking into the player |
| 3 | Autorun | Automatically, every frame the page is active, blocking |
| 4 | Parallel | Automatically, every frame, non-blocking |

### Action Button — the priority rule that confuses everyone

```js
Game_Player.prototype.triggerButtonAction = function() {
    if (Input.isTriggered("ok")) {
        this.checkEventTriggerHere([0]);        // same tile,   normal = false
        ...
        this.checkEventTriggerThere([0,1,2]);   // tile in front, normal = true
```

and `startMapEvent(x, y, triggers, normal)` requires `event.isNormalPriority() === normal`.

- **Same tile as the player**: only fires if priority is *Below Characters* or *Above
  Characters* (i.e. NOT "Same as Characters"). This is how floor-plate and sign-under-foot
  events work.
- **Tile in front of the player**: only fires if priority is *Same as Characters*. This is the
  normal "talk to the NPC" case — and it is why an Action Button event set to *Below
  Characters* cannot be talked to from the front; you must walk on top of it.
- **Counters**: if the front tile has the Counter flag and nothing started, the engine looks
  one tile further. That is how shop counters work.

### Player Touch vs Event Touch

Both fire from the player's side in two situations:

1. **Walking onto the tile.** `updateNonmoving` → `checkEventTriggerHere([1,2])` with
   `normal = false` → only *Below/Above Characters* priority events.
2. **Walking into it.** `moveStraight` fails → `checkEventTriggerTouchFront` →
   `startMapEvent(..., [1,2], true)` → only *Same as Characters* priority events.

Event Touch additionally fires when the **event** moves into the player
(`Game_Event.checkEventTriggerTouch`, which requires `!isJumping() && isNormalPriority()`).
That is the entire difference. Use Event Touch for chasing enemies; use Player Touch for
tripwires the player must walk into.

All touch checks are gated by `if (!$gameMap.isEventRunning())` — nothing triggers while
another event is running.

### Autorun

```js
Game_Event.prototype.update = function() {
    Game_Character.prototype.update.call(this);
    this.checkEventTriggerAuto();   // if (this._trigger === 3) this.start();
    this.updateParallel();
};
```

`checkEventTriggerAuto` runs **every frame**, and also from `setupPage`. So an Autorun page
re-arms itself every single frame while its conditions hold. The interpreter picks it up in
`Game_Map.updateInterpreter`, runs it to the end, then immediately picks it up again. There is
no "run once" — the *only* thing that stops an Autorun is the page ceasing to be active.

The player cannot move and no other event can start while an Autorun runs
(`Game_Map.isEventRunning()` is true). An Autorun that cannot leave its own page is a hard
softlock. See `parallel-and-autorun.md`.

### Parallel

Each event page with trigger 4 gets its **own private `Game_Interpreter`**, created in
`setupPageSettings` and updated every frame:

```js
Game_Event.prototype.updateParallel = function() {
    if (this._interpreter) {
        if (!this._interpreter.isRunning()) this._interpreter.setup(this.list(), this._eventId);
        this._interpreter.update();
    }
};
```

So: run the list to the end → it terminates → next frame it is set up again. **Parallel is an
infinite loop by construction.** It does not block the player, it does not block the map
interpreter, and it keeps running while an Autorun or a message is on screen.

---

## 3. Which event runs when several want to

`Game_Map.setupStartingEvent()` resolves competition in this fixed order:

1. A Common Event reserved via `$gameTemp.reserveCommonEvent()` (queue, FIFO in MZ).
2. `$testEvent` (playtesting a single event from the editor).
3. **Starting map events**, scanned by ascending Event ID — `setupStartingMapEvent` returns the
   first `isStarting()` event it finds, so **the lowest Event ID wins**.
4. Autorun Common Events, scanned by ascending Common Event ID.

Two Autorun events active on the same map at once: the lower ID runs to completion first,
then the higher one. If the lower one never ends, the higher never runs.

`Game_Event.start()` also refuses to start an effectively empty page:

```js
const list = this.list();
if (list && list.length > 1) { this._starting = true; ... }
```

A page containing only the terminating `{"code":0}` has `length === 1` and **will not
trigger** — but it is still the active page, so it still replaces the graphic, priority and
trigger of every lower page. This is the classic "my event stopped working after I added a
blank page" bug.

---

## 4. Priority (`priorityType`) and Through

| `priorityType` | Meaning | `isNormalPriority()` | Blocks movement |
|---|---|---|---|
| 0 | Below Characters | false | no |
| 1 | Same as Characters | true | yes (unless Through) |
| 2 | Above Characters | false | no |

Collision (`Game_CharacterBase.isCollidedWithEvents`) only considers events where
`isNormalPriority()` is true **and** `posNt(x,y)` — `posNt` is "at this position and *not*
Through". So:

- **Through ON cancels the blocking effect of Same as Characters**, and also lets the event
  itself walk through anything (`canPass` returns true immediately when `isThrough()`).
- An event with Through ON and priority Same as Characters is still drawn in the character
  layer and can still be triggered by Action Button from the front — it just is not solid.
- Events with no matching page get `through = true` automatically, so a "switched-off" event
  never blocks a corridor.

Use Through ON deliberately for: NPCs that must not trap the player, cutscene actors that need
to walk to exact positions regardless of obstacles, and invisible trigger tiles that also need
to be non-blocking.

---

## 5. Autonomous movement

`page.moveType`: 0 Fixed · 1 Random · 2 Approach · 3 Custom.

```js
Game_Event.prototype.updateSelfMovement = function() {
    if (!this._locked && this.isNearTheScreen() && this.checkStop(this.stopCountThreshold())) { ... }
};
Game_Event.prototype.stopCountThreshold = function() { return 30 * (5 - this.moveFrequency()); };
```

- **Autonomous movement only runs while the event is near the screen** (`isNearTheScreen()`:
  within roughly one screen-width/height of the view). Off-screen NPCs freeze. Never build
  logic that assumes an off-screen NPC keeps walking.
- `moveFrequency` 1–5 maps to a stop-count threshold of 120/90/60/30/0 frames between moves.
  Frequency 5 means "no pause at all".
- **Approach** (`moveTypeTowardPlayer`) only homes in when `isNearThePlayer()` — Manhattan
  distance < 20 tiles — otherwise it moves randomly. It is a 4-in-6 chance to step toward the
  player, 1-in-6 random, 1-in-6 forward. It is *not* pathfinding: it will get stuck on walls.
  For real pathing use a Move Route with `Move toward Player` (which is the same primitive) or
  a script call to `findDirectionTo` (A*, capped at 12 tiles — see `spatial-eventing.md`).
- **Custom** runs the page's `moveRoute` through `updateRoutineMove`. Custom autonomous routes
  are *not* "forcing" routes: they yield to a forced Move Route and are restored afterwards.
- While the event is `_locked` (talking to the player), autonomous movement is suspended and
  the event turns to face the player. `unlock()` restores the pre-talk direction — which is
  why an NPC snaps back to its original facing after a conversation. Set **Direction Fix** to
  suppress the turn-to-face entirely.

---

## 6. Event Options recap

| Option | Field | Effect |
|---|---|---|
| Walking Animation | `walkAnime` | Cycles the 3-frame walk pattern while moving |
| Stepping Animation | `stepAnime` | Cycles the pattern **even while standing still** — use for idle life: a cook stirring, a flag-bearer |
| Direction Fix | `directionFix` | Sprite direction never changes: not by movement, not by `turnTowardPlayer`. Use for statues, objects, back-turned NPCs |
| Through | `through` | See §4 |

Direction Fix does **not** stop the event from moving; it stops the sprite from re-facing.
An event with Direction Fix moving left still shows its Down frames.

---

## 7. The interpreter loop (the part that explains most timing questions)

```js
Game_Interpreter.prototype.update = function() {
    while (this.isRunning()) {
        if (this.updateChild() || this.updateWait()) break;
        if (SceneManager.isSceneChanging()) break;
        if (!this.executeCommand()) break;
        if (this.checkFreeze()) break;
    }
};
```

- **Commands run in a tight loop within one frame.** A hundred `Control Variables` in a row
  all execute on the same frame. Line count is essentially free; *waiting* is what costs
  frames.
- A command method returning `false` stops the loop **without advancing the index**, so the
  same command retries next frame. That is how `Show Text` waits for the message box, how
  `Transfer Player` waits, how `Change Tileset` waits for images.
- `checkFreeze()` aborts after 100000 commands executed within a single `Graphics.frameCount`.
  This is a guard, not a fix: a `Loop` with no `Wait` will burn 100k iterations per frame
  forever and the game will appear frozen.
- `_branch[indent]` stores the result of the enclosing Conditional Branch or Show Choices.
  `jumpTo` clears branch state for indents it crosses — this is why jumping into the middle of
  a conditional block is unsafe.

### The Jump-to-Label frame cost (version-dependent)

In **MZ ≤ 1.4 and all of MV**, `command119` returns `undefined` after jumping. `executeCommand`
treats that as `false` and breaks the loop, so **each Jump to Label consumes one frame**.
Label loops were therefore self-throttling.

In **MZ ≥ 1.5** the code was changed to `break` out of the search loop and `return true`, so a
jump costs nothing and a Label/Jump loop **can hard-freeze the game** exactly like a
`Loop`/`Repeat Above` with no `Wait`.

Do not rely on the old behaviour. Always put an explicit `Wait` inside any label loop.

---

## 8. Timing constants worth memorising

- 60 frames = 1 second.
- `Wait` takes frames. `Control Timer` takes seconds (`$gameTimer.start(sec * 60)`).
- Screen fade in/out is 24 frames and the command waits for it automatically.
- Tint / Flash / Shake / Weather / Move Picture only wait if their "Wait for Completion"
  parameter is true; otherwise they run in the background.
- Move speed: 1 = 8× slower than normal … 4 = normal walking, 5 = 2× normal, 6 = 4× normal.
  `distancePerFrame() = 2^realMoveSpeed / 256` tiles, so speed 4 crosses a tile in 16 frames,
  speed 3 in 32, speed 5 in 8. Dashing adds +1 to the player's effective speed only.
- Balloon icons last `8 * 8 + 12 = 76` frames (`Sprite_Balloon`), so `Show Balloon Icon` with
  Wait ON is a ~1.25-second beat. Plan choreography around that, it is a long pause.
