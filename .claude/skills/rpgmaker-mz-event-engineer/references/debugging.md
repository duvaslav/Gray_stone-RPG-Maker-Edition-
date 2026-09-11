# Debugging Events

Never fix an event by changing things until it works. Diagnose in a fixed order, then make one
targeted change.

---

## The procedure

Work top-down. Most bugs are resolved at step 2 or 3.

### 1. What is the *observed* behaviour, exactly?
"It doesn't work" is not a symptom. Establish: does it trigger at all? Does the wrong thing
happen? Does it happen once and then stop, or repeat? Does it happen only after some other
action? Reproduce it deliberately before changing anything.

### 2. Which page is active?
This is the first technical question, always. Page selection is bottom-up — the highest page
whose conditions all hold. Check, in order:

- List every page and its conditions.
- Check the current value of every switch/variable/self switch used in those conditions
  (F9 debug window in playtest shows and lets you set switches and variables).
- Remember the variable condition is **`>=`**, never `==` or `<`.
- Remember only **two** switch slots exist per page.
- Is a higher page unexpectedly matching? A blank higher page silently disables the event.
- Is **no** page matching? Then the event is invisible, Through, and untriggerable.

### 3. Is the trigger right for the geometry?
- **Action Button, standing on the event** requires priority *Below* or *Above* Characters.
- **Action Button, facing the event** requires priority *Same as* Characters.
  An Action Button event set to Below Characters cannot be talked to from the front — this is
  the single most common "my NPC doesn't respond" cause.
- **Player/Event Touch** from walking *onto* it requires Below/Above; from walking *into* it
  requires Same as.
- Nothing triggers while another event is running (`$gameMap.isEventRunning()`).
- An empty page (list length ≤ 1) **cannot start** even if the trigger is set.

### 4. Is the state what you think it is?
- Open the F9 debug window and read the actual switch and variable values.
- Add a temporary `Show Text: \V[31] / \V[32]` at the top of the event to print state inline.
- For self switches, print via a script call:
  `$gameSelfSwitches.value([$gameMap.mapId(), <id>, "A"])` in a Conditional Branch → Script,
  with different messages in each branch.
- Confirm the **ID** is right, not just the value — a near-miss ID (variable 24 vs 25) looks
  identical in the editor's collapsed view.

### 5. Follow the command flow
- Read the `indent` values, not the visual indentation. Corrupted indents produce silently
  wrong control flow with no error.
- Does an early `Exit Event Processing` short-circuit the path?
- Is a `Conditional Branch` missing its `Else`, so a case falls through to nothing?
- Is a `Jump to Label` landing inside a branch block (which nulls that block's branch state)?
- Is command 109 (Skip) disabling a block you thought was live?

### 6. Look outside the event
- Common Events it calls — and whether they were called with an event ID (see below).
- Other events writing the same switch/variable. Search the whole project for the ID.
- Plugins that patch the relevant behaviour.
- Whether the map interpreter is occupied by an Autorun.

---

## Symptom → cause table

| Symptom | Most likely causes |
|---|---|
| **Event does nothing at all** | Wrong page active · empty page (length ≤ 1) · priority/trigger mismatch (see step 3) · another event is running |
| **Wrong page runs** | Bottom-up selection: a higher page's conditions are satisfied · `>=` semantics on the variable condition · a switch you thought was off |
| **Event repeats forever** | Trigger is Autorun or Parallel with no state change · missing `Control Self Switch` at the end · the self switch is set but no page uses it as a condition |
| **Player is frozen, cannot move** | An Autorun whose page never stops matching. Check that the exit command runs on *every* path, at indent 0 |
| **Game appears hung, no error** | `Loop`/`Repeat Above` with no `Wait` or `Break Loop` · Label/Jump loop with no `Wait` (MZ ≥ 1.5) · `checkFreeze` trips at 100 000 commands/frame |
| **Cutscene stops partway** | A `Set Movement Route` with **Wait for Completion** whose route is blocked and **not skippable** — the index never advances. The classic cause |
| **NPC does not move** | Autonomous movement only runs when `isNearTheScreen()` · the event is `_locked` (talking) · a forced route with `repeat: true` is still active · move frequency too low · path blocked |
| **Move route runs but goes nowhere** | Every step failing (blocked) with `skippable: true`, so it advances without moving. Turn Through ON or clear the path |
| **NPC snaps back to its old facing after talking** | `Game_Event.unlock()` restores `_prelockDirection`. Set Direction Fix, or re-apply the facing after the conversation |
| **Self switch affects the wrong event** | The key is `[mapId, eventId, letter]` — the event was renumbered, or a script call used a hard-coded ID that has since changed |
| **Variable has an unexpected value** | Division truncation (`setValue` floors) · division by zero → `Infinity` · the ID is outside `$dataSystem.variables.length` so the write was **silently ignored** · another event writes it · a temp variable clobbered by a parallel between two commands |
| **Switch "won't turn on"** | ID beyond the declared count in `System.json` — `setValue` ignores it silently |
| **Event Touch fires unexpectedly** | Event Touch also fires when the *event* walks into the player. An Approach-movement NPC will trigger itself on contact |
| **Player Touch never fires** | Priority mismatch: walking *onto* it needs Below/Above; walking *into* it needs Same as |
| **Event became invisible / walkable** | No page matches → `clearPageSettings` blanks the graphic and sets Through · or `Erase Event` ran |
| **Erased event came back** | `Erase Event` lasts only for the current map visit. Use a self switch for persistence |
| **Common Event does nothing** | Its `trigger` is not None but you call it with 117 (works), or it *is* None but you expected it to autorun · a Parallel CE's gate switch is off · the CE was added to data after the map loaded |
| **Common Event's self switch / "This Event" does nothing** | It was invoked with event ID 0: from a Parallel or Autorun Common Event, from a battle, from an item/skill (`reserveCommonEvent`), or after a `Transfer Player` moved the interpreter off its original map |
| **Common Event runs forever** | Its trigger is Parallel (2) instead of None (0) — check the JSON, this is easy to set by accident |
| **"Common event calls exceeded the limit"** | Recursion or mutual recursion; depth cap is 100 |
| **Logic breaks after a Transfer** | The interpreter's `_mapId` is unchanged, so `Erase Event` becomes a no-op and self switches still write to the old map's keys. Put post-transfer logic on the destination map |
| **Second cutscene never plays** | Two Autoruns active at once; the lower Event ID monopolises the interpreter |
| **Plugin command does nothing** | An MV-style 356 command in an MZ project (silently ignored) · wrong plugin/command name · the plugin is not enabled in `js/plugins.js` |
| **Choices behave oddly after a Jump** | `jumpTo` nulls branch state across indents; never jump into a branch body |
| **JSON is invalid / the editor refuses to open the map** | Trailing comma, unbalanced braces, a missing `code: 0` terminator, or a block missing its `412`/`404`/`413`. Run `validate_events.py` |

---

## Tools

### F9 debug window (playtest only)
Lists every switch and variable by name and lets you toggle and set them live. This is the
fastest tool in the engine — use it to jump a quest to any stage and to confirm state.

### F8 / F12 developer console
Shows thrown errors from script calls with a stack trace. Also lets you evaluate expressions
against the live game:

```js
$gameVariables.value(40)
$gameSelfSwitches._data                            // every self switch currently set
$gameMap.event(7)._pageIndex                       // which page is active (0-based, -1 = none)
$gameMap.event(7)._trigger
$gameMap._interpreter._eventId                     // which event holds the map interpreter
$gameMap.events().filter(e => e._trigger === 4).map(e => e.eventId())   // parallels here
$gamePlayer.x + "," + $gamePlayer.y
```

`_pageIndex` is the single most useful diagnostic value in the engine: it tells you
definitively which page the engine chose.

### Temporary instrumentation
Add at the top of a suspect event:
```
◆Text: page OK. QUEST=\V[40] SS=?
```
and remove it when done. Cruder than the console but works in a distributed build.

### Static analysis
```bash
python3 scripts/validate_events.py <project-root>
python3 scripts/validate_events.py <project-root> --map 12
python3 scripts/inspect_project.py <project-root> --map 12   # readable pseudo-code dump
```
The pseudo-code dump is often faster than clicking through the editor, and it is the only way
to see `indent` corruption directly.

---

## Repair discipline

1. **Reproduce first.** A fix for a bug you cannot reproduce is a guess.
2. **Form a hypothesis** naming the mechanism ("page 3 matches because the variable condition
   is `>=` and QUEST is 40"), not a vibe.
3. **Test the hypothesis** with the debug window before editing.
4. **Change one thing.** Re-test.
5. **Re-test the neighbours** — the other pages, repeat interaction, and the state after
   leaving and re-entering the map.
6. **Check the save-game implication.** Self-switch and switch state persists in existing
   saves; a fix that assumes a fresh state may not repair an in-progress save. Say so if it
   matters.

## Prevention

- Comment header on every non-trivial event: purpose, trigger, entry state, what it changes,
  exit state.
- Meaningful event names in the editor.
- One owner per variable — route state changes through a dispatcher Common Event.
- Run `validate_events.py` before committing.
- Test every event three times in a row, and once after leaving and re-entering the map.
