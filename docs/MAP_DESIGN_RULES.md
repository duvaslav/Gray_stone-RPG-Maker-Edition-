# Map design rules

A map is not finished because its JSON is valid. These are the rules, and — more
importantly — how each one is *enforced*, because a rule nothing checks is a
preference.

## Rooms must be rooms

Every room needs a clear function, a visual focal point, a primary route,
secondary detail, signs of habitation, moderate asymmetry, and negative space to
move through. Thirteen identical boxes with furniture pushed to the walls is a
failure even if every check passes.

In MAP_020 this shows as: floor material changes by function (parquet in the
formal rooms, flagstone in the service wing, tile in the laundry); the dining
table and the study desk are focal objects, not wall furniture; the servants'
hall has one long table people actually sit at; the archive has closed cabinets
and nothing comfortable, because nobody sits in an archive.

## The rules that are enforced automatically

The build **fails** — it does not warn — if any of these breaks.

| Rule | Enforced by |
|---|---|
| Painted passability matches the design's own collision intent | MAP_005: every cell compared against the blueprint's collision column. Currently 0 mismatches across 768 cells. |
| No walkable cell is unreachable | MAP_020 build throws on any walkable-but-unreachable cell. Currently 0. |
| Every room reachable from the entrance | 13/13 verified after furnishing. |
| Furniture never blocks a door corridor | door corridors are a protected set; furnishing refuses them, including the first floor cell each side — furniture parked on the far side of a doorway blocks it just as effectively. |
| Furniture never blocks a transfer point or a secret panel | same protected set. |
| Furniture stays in its own room | a placement landing on a wall or in a neighbour is reported, not silently drawn. |
| One object per cell | interactive furniture is an **event carrying a tile graphic**; those cells are reserved so no map tile is painted under them. |
| Autotile seams solved, not guessed | the map library computes every shape; the validator reports any seam that disagrees with its neighbours. |
| Wall decoration cannot make a wall walkable | paintings, windows, clocks and curtains are ★ tiles on an upper layer. A passable decoration laid straight onto a wall would override it — this is the single most common mapping bug in RPG Maker. |
| A blueprint door that cannot physically open | must be declared explicitly; the generator throws on any new one rather than quietly routing around it. |

## Tiles are never guessed in place

Maps are painted from semantic symbols resolved through
`tools/data/tile-bindings.json`. A wrong slot is corrected there and the maps are
repainted. Autotile IDs follow the engine's own arithmetic
(`2048 + kind*48 + shape`) with **engine-global** kinds — see defect D-11 in
`docs/QA.md` for what happens when the sheet-local number is taken literally.

## Routes and staging

- Every scripted Move Route is walked cell by cell before it ships. All six
  prologue routes were verified: every cell walkable, and the two concurrent
  routes (Roland and Leonard entering together) stay in separate lanes so they
  cannot collide.
- Bad geometry is not papered over with permanent `Through ON`. `Through` is a
  deliberate staging choice, and the state is restored.
- `Skip If Cannot Move` is not used to hide a bad route: in a story scene a
  skipped step destroys the choreography.
- Cutscene staging areas are kept clear. On MAP_005 the central axis (x=14..18)
  is free of blocking decor from the drive to the door, and the shadow pen is
  explicitly cleared off it so shadows do not fall across faces or the route.

## Decoration and events

An object becomes an event when it needs animation, state or interaction —
otherwise it stays a tile. A decorative event must not become an invisible wall:
visual-only objects get `Through ON`, and collision comes from the tile or from
a separate physical part of the object.

Flames, candles and ambient animation use Event Page settings — stepping
animation, direction fix, fixed movement — **not** a Parallel Process. A parallel
interpreter to make a candle flicker is waste.

## Composition checks that need eyes

These cannot be automated and are done by reading the rendered map:

- no oversized empty space, and no meaningless rectangles;
- decoration not repeated on a grid;
- furniture composed, not lined up against walls;
- every room has a focal point;
- objects do not visually cover characters;
- the six maids' rooms must have individual character **without visually
  spoiling which one is guilty**.

`node .claude/skills/rpgmaker-map-design/scripts/cli.js preview <project> <mapId>`
renders a map with passability, region, shadow and event overlays once tilesets
are present.

## Period

1896. No detail that reads as modern. Not a museum reconstruction, but the
interior must read as a late-Victorian manor. Where "prettier as a JRPG" and
"more plausible for Gray Stone" conflict, Gray Stone wins.
