# Spatial Eventing — coordinates, regions, distance, vision

Everything about "where things are" and how events reason about it.

---

## 1. Reading positions

**Vanilla, no script:** `Control Variables → Game Data → Character → [target] → Map X / Map Y /
Direction / Screen X / Screen Y`, i.e. `parameters = [varId, varId, 0, 3, 5, charId, field]`
where `charId` is −1 player / 0 this event / n event n, and `field` is 0 Map X · 1 Map Y ·
2 Direction · 3 Screen X · 4 Screen Y.

Direction values: 2 down · 4 left · 6 right · 8 up.

**Map ID:** `Control Variables → Game Data → Other → Map ID`.

**Terrain / region / event ID / tile ID at a point:** `Get Location Info` (285). In MZ,
designation 2 reads "at this character", which avoids two variables of coordinate copying:

```json
{"code":285,"indent":0,"parameters":[21, 6, 2, -1, 0]}   // Var 21 = region under the player
```

**[MV]** has no designation 2 — you must copy the coordinates into variables first.

---

## 2. Distance

The engine's own metric (`Game_Map.distance`) is **Manhattan distance**, and it is map-loop
aware. Vanilla equivalent:

```
◆Control Variables: [TMP_DX] = Character[Player] Map X
◆Control Variables: [TMP_DX] -= Character[This Event] Map X
◆Conditional Branch: TMP_DX < 0
  ◆Control Variables: [TMP_DX] *= -1                       ← absolute value
◆
◆Control Variables: [TMP_DY] = Character[Player] Map Y
◆Control Variables: [TMP_DY] -= Character[This Event] Map Y
◆Conditional Branch: TMP_DY < 0
  ◆Control Variables: [TMP_DY] *= -1
◆
◆Control Variables: [TMP_DIST] = TMP_DX
◆Control Variables: [TMP_DIST] += TMP_DY                   ← Manhattan distance
```

Make this a Common Event (`CE_Calc_PlayerDistance`, output in `TMP_DIST`, `TMP_DX`, `TMP_DY`)
and call it from every sensor. Ten lines once, one line everywhere.

**One-line script equivalent** (identical result, loop-aware):

```js
$gameVariables.setValue(23, $gameMap.distance($gamePlayer.x, $gamePlayer.y, this.character(0).x, this.character(0).y))
```

**Circular-ish radius:** Manhattan distance gives a diamond. For something closer to a circle,
compare squared Euclidean distance: `TMP_DX * TMP_DX + TMP_DY * TMP_DY <= r * r`. In practice
the diamond is fine for gameplay and cheaper to read.

**Chebyshev (square) radius:** "within a 3-tile box" is `max(|dx|,|dy|) <= 3` — use two
conditional branches, `dx <= 3` AND `dy <= 3`.

---

## 3. Zone tests

### Rectangular zone

```
◆Conditional Branch: Var PLAYER_X >= 10
  ◆Conditional Branch: Var PLAYER_X <= 15
    ◆Conditional Branch: Var PLAYER_Y >= 4
      ◆Conditional Branch: Var PLAYER_Y <= 8
        ◆(inside)
```

Verbose but zero-cost and completely transparent. As a script conditional:
`$gamePlayer.x >= 10 && $gamePlayer.x <= 15 && $gamePlayer.y >= 4 && $gamePlayer.y <= 8`.

### Region zone — almost always better

Paint the zone with a Region ID in the map editor and test one value:

```
◆Get Location Info: [TMP_REGION], Region ID, at Player
◆Conditional Branch: TMP_REGION == 7
```

Regions beat coordinate maths for anything hand-authored: they survive map edits, they can be
any shape, and a designer can see them. Reserve a documented region palette per project, e.g.

```
 1  water (swim)          10  guard patrol zone A
 2  damage floor          11  guard patrol zone B
 3  no-encounter          20  puzzle target tile
 4  encounter set B       30  cutscene stage area
```

Region 0 means "no region", so never assign meaning to 0.

### Terrain tags

Terrain tags (0–7) live on the **tileset**, not the map, so they apply everywhere that tileset
is used. Use them for material properties — grass, stone, water, wood — and use regions for
place-specific meaning. Read with `Get Location Info → Terrain Tag`.

Typical use: footstep SE selection, or "can this be fished in".

---

## 4. Direction and facing

| Question | Test |
|---|---|
| Which way is the player facing? | `Control Variables → Character → Player → Direction`, or `Conditional Branch → Character → Player → facing X` |
| Is the player facing this event? | Compute the event→player direction and compare with the player's facing reversed |
| Is the event facing the player? | `Conditional Branch: Character[This Event] is facing <d>` plus a quadrant test |

Reverse-direction arithmetic: `10 - d` maps 2↔8 and 4↔6.

**Which side is the player on** (the quadrant test used by vision cones):

```
◆Control Variables: [TMP_DX] = Player X   ;  -= This Event X
◆Control Variables: [TMP_DY] = Player Y   ;  -= This Event Y
   TMP_DY < 0                → player is above  (event must face 8 to see them)
   TMP_DY > 0                → player is below  (face 2)
   TMP_DX < 0                → player is left   (face 4)
   TMP_DX > 0                → player is right  (face 6)
```

For a straight-line cone, require the perpendicular delta to be 0 (`TMP_DX == 0` for a
vertical cone) and the parallel delta within range.

---

## 5. Line of sight

There is no built-in LOS. Three honest options, in increasing cost:

### A. Straight-line, region-gated (recommended, vanilla)

Only detect along the axis the guard faces, and require both to be in the same painted
"room" region. Painting the room means walls automatically break sight, with no ray casting.

```
◆Get Location Info: [TMP_R_EVT], Region ID, at This Event
◆Get Location Info: [TMP_R_PLR], Region ID, at Player
◆Conditional Branch: TMP_R_EVT == TMP_R_PLR                    ← same room
  ◆Conditional Branch: Character[This Event] is facing Up
    ◆Conditional Branch: TMP_DX == 0                           ← same column
      ◆Conditional Branch: TMP_DY >= -5                        ← within 5 tiles…
        ◆Conditional Branch: TMP_DY < 0                        ← …and above
          ◆(SPOTTED)
```

This is cheap, readable, and behaves sensibly. It is what most shipped RPG Maker stealth
sections actually do.

### B. Passability ray (script conditional)

Walk the tiles between the two points and fail on the first impassable one:

```js
(function(){
  const e = this.character(0), p = $gamePlayer;
  if (e.x !== p.x && e.y !== p.y) return false;         // straight lines only
  const dx = Math.sign(p.x - e.x), dy = Math.sign(p.y - e.y);
  const dist = Math.abs(p.x - e.x) + Math.abs(p.y - e.y);
  if (dist > 6) return false;
  for (let i = 1; i < dist; i++) {
    const x = e.x + dx * i, y = e.y + dy * i;
    if (!$gameMap.isPassable(x, y, 2) && !$gameMap.isPassable(x, y, 8)) return false;
  }
  return true;
}).call(this)
```

`Game_Map.isPassable(x, y, d)` is real corescript API. Note it tests passage *out of* the tile
in direction `d`; a fully blocked tile fails in every direction, which is what the check above
exploits. This does not account for events blocking sight — add
`$gameMap.eventsXyNt(x, y).some(ev => ev.isNormalPriority())` if you want that.

### C. Pathfinding distance

`Game_Character.findDirectionTo(x, y)` runs A* with `searchLimit() === 12` tiles. It returns a
*direction*, not a distance, and it is comparatively expensive. Use it for "chase the player
around a corner", never in a per-frame sensor for many events.

---

## 6. Proximity triggering without a parallel

Preferred approaches, cheapest first:

1. **Player Touch / Event Touch event** on the tile(s) that matter. Zero cost, no polling.
   For an area, place several small invisible touch events, or use one event with Event Touch
   and Approach movement.
2. **Region + a single map-wide parallel** that reads the player's region once per ~10 frames
   and sets a switch. One parallel serves every zone on the map.
3. **Per-event gated sensor** (see `parallel-and-autorun.md` pattern D) only when the sensing
   event moves, so its position genuinely changes every frame.

Never give every NPC on a map its own ungated proximity parallel.

---

## 7. Guard vision, assembled

The complete pattern used by the guard recipe:

```
Sensor (Page 1 of the guard, Parallel, gated by SW_SYS_StealthActive):
  ◆Common Event: CE_Calc_PlayerDistance          → TMP_DIST, TMP_DX, TMP_DY
  ◆Conditional Branch: TMP_DIST <= 5                       ← cheap early-out
    ◆Get Location Info: [TMP_R_E], Region, at This Event
    ◆Get Location Info: [TMP_R_P], Region, at Player
    ◆Conditional Branch: TMP_R_E == TMP_R_P                ← same room
      ◆Conditional Branch: (script) facing-cone test       ← direction + axis alignment
        ◆Control Self Switch: A = ON                       ← → CHASING page; sensor stops
  ◆Wait: 10                                                ← at indent 0, always runs
```

The early-out matters: the expensive checks only run for a player who is already close.

**Losing the player:** on the CHASING page, run the same distance calc and switch to RETURNING
when `TMP_DIST >= 9`. Use a larger radius to leave than to enter — hysteresis prevents the
guard flickering between states at the boundary. This is the single most important detail for
making chase behaviour feel good.

---

## 8. Passability and placement

Before placing an event, know whether its tile is passable and whether that matters:

- `Game_Map.isPassable(x, y, d)` — tileset passage flags only.
- `Game_CharacterBase.canPass(x, y, d)` — full check including other events and the player.
- `Game_CharacterBase.isMapPassable` checks **both** tiles: leaving `(x,y)` in direction `d`
  *and* entering the destination from the reverse direction. A one-way tile edge blocks in only
  one direction.

Rules of thumb:
- An event the player must **talk to** goes on a passable tile adjacent to walkable space,
  priority Same as Characters.
- An event the player must **stand on** (floor plate, doorway trigger) goes on a passable tile,
  priority Below Characters, trigger Player Touch.
- An event that is **scenery** goes anywhere, priority Same as Characters (to block) or
  Below/Above.
- A **controller** event (invisible logic host) goes on any tile, priority Below Characters,
  with no graphic — put all of a map's controllers in one corner so they are easy to find.

---

## 9. Coordinate gotchas

- Map coordinates are **tile** coordinates; `x` increases right, `y` increases **down**.
- `Game_Map.deltaX/deltaY` wrap on looping maps; plain subtraction does not. On a looping map,
  use the script distance rather than manual subtraction.
- `$gamePlayer.x` is the logical tile; `_realX` is the interpolated position mid-step. Read
  `.x`, never `._realX`, in logic.
- Screen X/Y are pixels and change with the camera — only useful for positioning pictures.
- After `Transfer Player`, coordinates refer to the new map immediately, but the event's
  `_mapId` does not change (see `event-commands-mz.md` on 201).
