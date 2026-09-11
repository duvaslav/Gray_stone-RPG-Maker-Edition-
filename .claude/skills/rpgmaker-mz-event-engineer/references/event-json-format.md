# Event Data JSON Format

Verified by reading real RPG Maker MZ project data (see `source-index.md`), cross-checked
against `Game_Interpreter`, `Game_Event` and `Game_Map` in the corescript.

**Golden rule: open an existing event in the target project and mirror its exact shape before
writing a new one.** The editor omits trailing optional parameters, and different projects
(and different editor versions) produce slightly different-but-valid output.

---

## 1. `data/MapXXX.json`

Top-level keys (MZ):

```json
{
  "autoplayBgm": false, "autoplayBgs": false,
  "battleback1Name": "", "battleback2Name": "",
  "bgm": {"name":"","pan":0,"pitch":100,"volume":90},
  "bgs": {"name":"","pan":0,"pitch":100,"volume":90},
  "disableDashing": false, "displayName": "",
  "encounterList": [], "encounterStep": 30,
  "height": 13, "width": 17,
  "note": "", "parallaxLoopX": false, "parallaxLoopY": false,
  "parallaxName": "", "parallaxShow": true, "parallaxSx": 0, "parallaxSy": 0,
  "scrollType": 0, "specifyBattleback": false, "tilesetId": 4,
  "data": [ ...width*height*6 integers... ],
  "events": [ null, {...}, {...} ]
}
```

- `events[0]` is **always `null`** — the array is 1-indexed by Event ID. Deleted events leave
  `null` holes; preserve them, do not compact the array.
- `data` is a flat tile array of `width * height * 6` integers (6 z-layers: 4 tile layers,
  shadow, region). Region ID of `(x,y)` is `data[(5*height + y)*width + x]`. Do not touch it
  from this skill unless explicitly asked — that is map-design territory.
- MV maps lack `note` on the map and on events; otherwise the shape is the same.

### Event object

```json
{
  "id": 1,
  "name": "EV001",
  "note": "",
  "x": 8,
  "y": 6,
  "pages": [ {...}, {...} ]
}
```

`id` must equal the array index. `name` is editor-only (never shown to the player) — use it
for documentation. `note` exists in MZ only and is where plugins read notetags from.

### Page object — all 13 keys are required

```json
{
  "conditions": {
    "actorId": 1, "actorValid": false,
    "itemId": 1,  "itemValid": false,
    "selfSwitchCh": "A", "selfSwitchValid": false,
    "switch1Id": 1, "switch1Valid": false,
    "switch2Id": 1, "switch2Valid": false,
    "variableId": 1, "variableValid": false, "variableValue": 0
  },
  "directionFix": false,
  "image": {"characterIndex":0,"characterName":"People1","direction":2,"pattern":1,"tileId":0},
  "list": [ ... ],
  "moveFrequency": 3,
  "moveRoute": {"list":[{"code":0,"parameters":[]}],"repeat":true,"skippable":false,"wait":false},
  "moveSpeed": 3,
  "moveType": 0,
  "priorityType": 1,
  "stepAnime": false,
  "through": false,
  "trigger": 0,
  "walkAnime": true
}
```

Always write **all** condition keys even when `*Valid` is false — the editor does, and
omitting them risks `undefined` comparisons. Keep the inactive IDs at their defaults (`1`).

| Field | Values |
|---|---|
| `image.characterName` | Sprite sheet in `img/characters/`, no extension. `""` = invisible |
| `image.characterIndex` | 0–7, position in an 8-slot sheet. Sheets whose name starts with `$` are single-character: index must be 0 |
| `image.direction` | 2 down · 4 left · 6 right · 8 up |
| `image.pattern` | 0–2, which walk frame is shown at rest (1 = middle, the normal choice) |
| `image.tileId` | >0 means the event is drawn as a map tile instead of a sprite; then `characterName` is ignored |
| `moveType` | 0 Fixed · 1 Random · 2 Approach · 3 Custom |
| `moveSpeed` | 1–6 (4 = normal walk) |
| `moveFrequency` | 1–5 (5 = highest) |
| `priorityType` | 0 Below · 1 Same as · 2 Above |
| `trigger` | 0 Action · 1 Player Touch · 2 Event Touch · 3 Autorun · 4 Parallel |

A page with `moveType: 3` uses `moveRoute` as its autonomous route; otherwise leave the
default empty route object in place — do not delete the key.

---

## 2. `data/CommonEvents.json`

A flat array, index 0 is `null`, each entry has exactly five keys:

```json
{ "id": 3, "name": "CE_Quest_Update", "trigger": 0, "switchId": 1, "list": [ ... ] }
```

`trigger`: **0 = None** (only callable via command 117 or a script call) · **1 = Autorun** ·
**2 = Parallel**. `switchId` is only meaningful for triggers 1 and 2, but the editor always
writes it (default `1`) — keep it.

---

## 3. `data/Troops.json` (battle events)

```json
{
  "id": 1, "name": "Slime*2",
  "members": [{"enemyId":1,"x":300,"y":300,"hidden":false}],
  "pages": [
    { "conditions": {"actorHp":50,"actorId":1,"actorValid":false,
                     "enemyHp":50,"enemyIndex":0,"enemyValid":false,
                     "switchId":1,"switchValid":false,
                     "turnA":0,"turnB":0,"turnEnding":false,"turnValid":false},
      "list": [ ... ],
      "span": 0 }
  ]
}
```

- `span`: **0 = Battle** (fires once per battle) · **1 = Turn** (once per turn) ·
  **2 = Moment** (every eligible check).
- `Game_Troop.setupBattleEvent` runs **only the first matching page** per check and then
  `break`s. Pages with `span <= 1` set an event flag so they do not repeat; `increaseTurn`
  clears the flags of `span === 1` pages.
- A page with **no condition checked at all never runs** — `meetsConditions` returns false when
  `turnEnding`, `turnValid`, `enemyValid`, `actorValid` and `switchValid` are all false.
- Turn condition maths: with `turnB === 0` it fires on exactly turn `turnA`; with `turnB > 0`
  it fires when `n >= 1 && n >= turnA && n % turnB === turnA % turnB` (i.e. "turn A + B×n").

---

## 4. The command list — structure rules

Every entry is `{"code": <int>, "indent": <int>, "parameters": [...]}`.

### Rule 1 — every list ends with a terminator

```json
{"code": 0, "indent": 0, "parameters": []}
```

`Game_Event.start()` refuses lists with `length <= 1`, so a page whose list is only the
terminator never triggers (but still overrides lower pages' settings).

### Rule 2 — every indented block ends with its own `code 0`, then the block terminator

This is the rule that hand-written JSON gets wrong. Real editor output:

```json
{"code":111,"indent":0,"parameters":[0, 5, 0]},        // If Switch 5 is ON
{"code":101,"indent":1,"parameters":["",0,0,2,""]},    //   body...
{"code":401,"indent":1,"parameters":["It is open."]},
{"code":0,  "indent":1,"parameters":[]},               //   <- end of the TRUE block
{"code":411,"indent":0,"parameters":[]},               // Else
{"code":101,"indent":1,"parameters":["",0,0,2,""]},
{"code":401,"indent":1,"parameters":["It is locked."]},
{"code":0,  "indent":1,"parameters":[]},               //   <- end of the ELSE block
{"code":412,"indent":0,"parameters":[]},               // End
{"code":0,  "indent":0,"parameters":[]}                // end of list
```

The `code 0` entries at indent > 0 are no-ops for the interpreter (`command0` does not exist,
so `executeCommand` just advances), but the **editor requires them** to render and re-parse the
block. Omit them and the editor may show a corrupted event or drop commands on save.

Block openers, their branch keywords and their terminators:

| Opener | Continuations | Terminator |
|---|---|---|
| `111` Conditional Branch | `411` Else | `412` |
| `102` Show Choices | `402` When[n] · `403` When Cancel | `404` |
| `112` Loop | — | `413` Repeat Above |
| `301` Battle Processing | `601` Win · `602` Escape · `603` Lose | `604` |
| `108` Comment | `408` further lines | — (no terminator) |
| `101` Show Text | `401` text lines | — |
| `105` Scrolling Text | `405` text lines | — |
| `355` Script | `655` further lines | — |
| `357` Plugin Command (MZ) | `657` argument display lines | — |
| `205` Set Movement Route | `505` mirror lines | — |
| `109` Skip (MZ ≥ 1.5) | — | skips the indented block below it |
| `302` Shop Processing | `605` extra goods rows | — |

`411`, `412`, `402`, `403`, `404`, `413`, `601`–`604` sit at the **same indent as their
opener**; their bodies sit one deeper.

`412`, `404` and `604` have no `command` method in the interpreter at all — they are pure
markers that `skipBranch()` stops at. `skipBranch` advances while
`this._list[this._index + 1].indent > this._indent`, so correct `indent` values are what make
branching work. **Corrupted indents produce silently wrong control flow, not an error.**

### Rule 3 — `Set Movement Route` needs mirror `505` lines

Command `205` carries the whole route in `parameters[1]`. The editor **additionally** writes
one `505` line per route step (excluding the route's own `{"code":0}` terminator) purely so the
list view can display and re-edit it:

```json
{"code":205,"indent":0,"parameters":[0,
   {"repeat":false,"skippable":false,"wait":true,
    "list":[{"code":36},{"code":17},{"code":15,"parameters":[3]},{"code":18},{"code":0}]}]},
{"code":505,"indent":0,"parameters":[{"code":36}]},
{"code":505,"indent":0,"parameters":[{"code":17}]},
{"code":505,"indent":0,"parameters":[{"code":15,"parameters":[3]}]},
{"code":505,"indent":0,"parameters":[{"code":18}]},
```

The game ignores `505` entirely (no `command505` method). But if you write a `205` **without**
the `505` lines, the route still runs correctly at runtime while the editor shows an empty
Move Route — and the next time a human edits and saves that event, the route is lost.
**Always emit the mirrors.** `scripts/build_event.py` does this for you.

Inside a route, `parameters` is **omitted entirely** when a step takes no arguments
(`{"code":36}`, not `{"code":36,"parameters":[]}`). Some editor versions add `"indent": null`
to route steps; both forms are accepted — copy whatever the project already uses.

### Rule 4 — trailing optional parameters are omitted

Real data contains `{"code":122,"parameters":[1,1,0,0,1]}` (5 params, constant operand) next to
`{"code":122,"parameters":[1,1,0,3,5,-1,0]}` (7 params, game-data operand). Do not pad arrays
to a fixed length; write exactly what the operand type requires.

Likewise `Show Text` appears as both 4 and 5 parameters in real MZ projects (the 5th is the MZ
speaker name). MZ tolerates the 4-parameter form — `setSpeakerName(undefined)` just means no
name box — but **write 5 parameters for MZ**, with `""` for no speaker.

---

## 5. Safe editing procedure

1. **Read before writing.** Load the file, find a comparable existing event, note its exact
   key set and parameter style.
2. **Preserve everything you did not intend to change**, including `note` strings, unknown
   keys added by plugins, and `null` holes in arrays.
3. **Do not renumber.** Adding an event means appending at the next free index (or filling a
   `null` hole). Changing an existing event's `id` breaks every `Set Movement Route`,
   `Set Event Location`, Self Switch key and plugin reference that points at it.
4. **Self Switch keys are `[mapId, eventId, letter]`.** Moving an event to a different ID
   silently transfers its saved self-switch state to whatever now holds that ID. In an existing
   save, chests will appear already-opened.
5. **Reference integrity.** Before using Switch 47 or Variable 12, check
   `System.json → switches / variables` — `Game_Switches.setValue` silently ignores IDs
   outside `0 < id < $dataSystem.switches.length`, so writing to an undeclared switch does
   **nothing**. Extend the arrays in `System.json` (they are plain string-name arrays, index 0
   is `""`) if you need more.
6. **JSON dialect.** RPG Maker writes compact UTF-8 JSON. Non-ASCII text is fine either
   escaped or literal. Keep whatever the project uses; do not reformat whole files —
   a wholesale re-indent produces an unreviewable diff and can churn float formatting.
7. **Validate after writing** with `python3 scripts/validate_events.py <project>`.

---

## 6. Where else events hide

| File | Contains |
|---|---|
| `data/MapXXX.json` | Map events |
| `data/CommonEvents.json` | Common events |
| `data/Troops.json` | Battle events |
| `data/System.json` | Switch/variable **names** and count, start position, `versionId` |
| `data/MapInfos.json` | Map tree: `name`, `parentId`, `order`, editor scroll position |
| `js/plugins.js` | Installed plugins, order, and their parameter values |

`System.json → versionId` changes when the editor saves; do not fabricate a value.
`MapInfos.json` is index-aligned with map files (`MapInfos[12]` ↔ `Map012.json`); if you ever
create a new map you must add both.
