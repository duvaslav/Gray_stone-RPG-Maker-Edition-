# Source Index

Where the claims in this skill come from, and how to re-verify them. Recorded so that any
disputed behaviour can be checked against a primary source rather than re-argued.

## Evidence hierarchy used throughout

1. **Corescript** — the engine's own JavaScript. Highest authority: it *is* the behaviour.
2. **Real project data** — actual `MapXXX.json` / `CommonEvents.json` / `Troops.json` written
   by the editor. Highest authority on **file format**, because it shows what the editor
   actually emits.
3. **Official documentation and official parameter references.** Authoritative on intent, but
   occasionally out of date or mistranslated.
4. **Community tutorials, forum threads, guides.** Useful for technique and practice. Treated
   as a hypothesis to confirm against 1–3, never accepted on its own for a non-obvious
   technical claim.

Where a community claim conflicted with corescript, corescript won and the discrepancy is
noted below.

---

## Primary sources read directly

### RPG Maker MZ corescript
- `stak/rmmz-corescript` (github.com/stak/rmmz-corescript) — **v1.1.0**, full source.
- `NotADev9000/RMMZ-CoreScripts` (github.com/NotADev9000/RMMZ-CoreScripts) — **v1.6.0**, split
  per class.
- `leandiez/rmmz-corescript-dev` (github.com/leandiez/rmmz-corescript-dev) — `corescript_190/`,
  **main.js reports v1.8.0**.

Classes read in full: `Game_Interpreter`, `Game_Event`, `Game_CommonEvent`, `Game_Map`,
`Game_Character`, `Game_CharacterBase`, `Game_Player`, `Game_Troop`, `Game_Switches`,
`Game_Variables`, `Game_SelfSwitches`, `Game_Temp`, `Game_Timer`, plus `Window_ChoiceList` and
`Sprite_Balloon` from `rmmz_windows.js` / `rmmz_sprites.js`.

**Version findings (from diffing 1.1.0 → 1.6.0 → 1.8.0):**
- The event-relevant classes are **byte-identical between 1.6.0 and 1.8.0**.
- Changes between 1.1.0 and 1.6.0 affecting events:
  - `command109` ("Skip") **added** — corroborated by external references as MZ 1.5.0.
  - `command119` (Jump to Label) changed `return;` → `break;`, removing the one-frame cost per
    jump. Documented in `event-fundamentals.md` §7 and `mv-mz-differences.md`.
  - Timer conditional branch switched from `$gameTimer.seconds()` to `frames() / 60`.
  - `command357` gained `Utils.extractFileName(params[0])`.
  - `Game_Map.tileWidth()` began reading `$dataSystem.tileSize`.

### RPG Maker MV corescript
- `rpgtkoolmv/corescript` (github.com/rpgtkoolmv/corescript) — official MV corescript
  repository, `js/rpg_objects/` split sources.

Used to verify every entry in `mv-mz-differences.md`, including the confirmation that
`Game_Event` is functionally identical between engines.

### Real RPG Maker MZ project data
- `nz-prism/RPG-Maker-MZ` (github.com/nz-prism/RPG-Maker-MZ) — the `RandomDungeon`,
  `FieldAction` and `CartRide` sample projects contain complete `data/` folders.

Used to confirm, by direct observation rather than inference:
- `events[0] === null`; the array is 1-indexed.
- The full page key set and default values.
- **The `code 0` block-terminator markers** inside every indented block, followed by `412` /
  `404` at the opener's indent.
- **The mirror `505` lines** emitted after every `205`, one per route step excluding the
  route's own `{code:0}`.
- **`657` lines** emitted after a `357` plugin command to display its arguments.
- Move-route steps omit `parameters` entirely when empty; some editor versions add
  `"indent": null`.
- Trailing optional parameters are omitted (`122` appears with 5 and with 7 parameters).
- `Show Text` appears with **both 4 and 5 parameters in the same MZ project**.
- Common Event objects have exactly `{id, name, trigger, switchId, list}`.
- Troop pages have exactly `{conditions, list, span}`.
- A real `357` argument object: `{"animationId": "66"}` — values are strings.

### Official parameter reference
- `leandiez/rmmz-corescript-dev` → `docs/RPG Maker MZ Script Call Reference.xlsx`, sheet
  "Event Code" — a translated official-derived table of all command codes and parameters.

Cross-checked against corescript. **Discrepancies found and resolved in favour of corescript:**
- Its `203` (Set Event Location) parameter 1 legend is garbled ("0 direct / 1 exchange /
  2 exchange"); corescript shows 0 direct, 1 variables, 2 exchange.
- It lists `357` as having three parameters; corescript uses `params[3]` for the argument
  object, with `params[2]` being the display name.
- It predates `109` and MZ's `285` designation 2.

- `tonbijp/RPGMakerMZ` → `Reference/Game_Interpreter_command.md` — corroborated that command
  109 ("Skip") was added in MZ 1.5.0.

---

## Secondary sources (consulted for technique, verified before use)

The RPG Maker Web forums, the official RPG Maker blog, Yanfly's wiki and Steam Guides were
**not directly reachable** from the environment this skill was built in (blocked by the network
egress policy), so they were consulted via search-result summaries only. Every technical claim
drawn from them was independently confirmed against corescript before being written down.
Where confirmation was not possible, the claim was omitted rather than repeated.

Community claims that were checked and **confirmed** against corescript:
- "A `Wait` of even 1 frame halves a parallel's cost." Confirmed: `updateParallel` runs one
  pass per frame; a single wait splits the pass across two frames.
- "Only the last of several simultaneous move routes needs Wait for Completion." Confirmed by
  `command205` / `setWaitMode("route")` — with the important caveat, added here, that the
  waiting route must be the **longest** or the scene continues early.
- "A blocked move route with Wait for Completion freezes the game." Confirmed by
  `advanceMoveRouteIndex`: the index does not advance unless the move succeeded or the route is
  `skippable`.
- "Autorun with no switch-off freezes the game." Confirmed by `checkEventTriggerAuto` running
  every frame from `Game_Event.update`.
- "Use `$gameSelfSwitches.setValue([mapId, eventId, 'A'], value)` for other events."
  Confirmed against `Game_SelfSwitches`.

Community claims **not** repeated here because they could not be confirmed, or are wrong:
- "Long events cause lag" — contradicted by the interpreter's per-frame `while` loop.
- "Changing Autorun to Parallel fixes a freeze" — it removes the symptom by removing the block,
  but leaves an unbounded loop. Rejected as advice.
- "Conditional Branch chains are slow" — no basis in the code.

Topic areas surveyed via search for technique (line of sight and stealth, NPC schedules and
day/night systems, quest state variables vs switch farms, multi-NPC cutscene synchronisation,
parallel process optimisation, Sokoban and pressure-plate puzzles, self-switch script calls,
autorun softlocks). Plugin families named in `plugins-and-eventing.md` (VisuStella, Yanfly YEP,
Casper Gaming, HimeWorks, Hakuen Studio, Galv) were identified through these searches; the
guidance given is limited to load-order and verification practice, which is checkable in any
project, rather than specific API claims.

---

## How to re-verify anything here

**Behaviour** — read the project's own corescript:
```bash
grep -n "Game_Interpreter.prototype.command205" <project>/js/rmmz_objects.js
sed -n '/Game_Event.prototype.meetsConditions/,/^};/p' <project>/js/rmmz_objects.js
```
This is better than any external source, because it is the exact version the project runs.

**File format** — read the project's own data:
```bash
python3 scripts/inspect_project.py <project> --map 1
python3 -c "import json;d=json.load(open('data/Map001.json'));print(json.dumps(d['events'][1],indent=2)[:2000])"
```

**Live state** — the playtest console (F8/F12):
```js
$gameMap.event(7)._pageIndex      // which page the engine actually chose
$gameSelfSwitches._data           // every self switch currently set
```

If a claim in this skill ever contradicts the corescript in front of you, **the corescript in
front of you is right** — the project may be on a different engine version, or a plugin may
have patched the method.
