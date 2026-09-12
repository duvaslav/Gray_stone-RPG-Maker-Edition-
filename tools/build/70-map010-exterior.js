"use strict";
// MAP_010 Estate Exterior, 50x38, tileset 2 (Outside).
//
// An exterior is not a set of carved rooms: it is open ground with buildings
// standing ON it. So this is painted by zone from 08_Mansion_Blueprint rather
// than by the interior builder, and the buildings are solid masses the player
// walks around.
//
// The manor's own footprint is not tabulated -- the blueprint describes the
// estate around it and gives only the front door at (26,20). The mass is placed
// so that door sits in its south wall, facing the drive.
const path = require("path");
const { table, num } = require("../lib/spec");
const tiles = require("../lib/tiles");
const { RMMap, Z } = require(path.join(__dirname, "..", "..", ".claude", "skills", "rpgmaker-map-design", "scripts", "rpgmap.js"));

const WIDTH = 50, HEIGHT = 38, TILESET_ID = 2, MAP_ID = 10;

const rect = (x1, y1, x2, y2) => ({ x1, y1, x2, y2 });

// Buildings. Each is roof over wall, with a doorway cell left walkable.
const MANOR     = rect(18, 10, 36, 19);   // door in the south wall at x=26
const STABLE    = rect(2, 2, 14, 9);
const GREENHOUSE = rect(38, 27, 48, 36);

function build() {
  const map = RMMap.create({ width: WIDTH, height: HEIGHT, tilesetId: TILESET_ID, displayName: "Поместье Грейстоун" });
  map.scrollType = 0;

  const A = (k) => tiles.resolve("outside", k).kind;
  const B = (k) => tiles.resolve("outside", k).id;
  const GRASS = A("GRASS"), DRIVE = A("DRIVE"), STONE = A("STONE"), SOIL = A("SOIL");
  const ROOF = A("ROOF"), FACADE = A("FACADE");

  const solid = new Set();     // cells a building or planting occupies
  const ground = (x, y, kind) => {
    if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) return;
    map.putAutotile(x, y, Z.LOWER, kind);
  };
  const fill = (r, kind) => {
    for (let y = r.y1; y <= r.y2; y++) for (let x = r.x1; x <= r.x2; x++) ground(x, y, kind);
  };

  // 1. lawn everywhere
  fill(rect(0, 0, WIDTH - 1, HEIGHT - 1), GRASS);

  // 2. the courtyard and the service yard: worked ground, not lawn
  fill(rect(3, 11, 17, 23), DRIVE);

  // 3. the drive: up the centre from the south edge, opening into a turning
  //    circle before the house, then the paved apron at the door.
  fill(rect(24, 30, 28, 37), DRIVE);
  fill(rect(19, 23, 33, 29), DRIVE);
  fill(rect(22, 20, 30, 22), STONE);

  // 4. the path to the chapel, east along the tree line
  fill(rect(37, 7, 49, 9), DRIVE);
  fill(rect(37, 9, 39, 20), DRIVE);

  // 5. the south garden: beds of worked soil between grass walks
  fill(rect(31, 22, 48, 36), GRASS);
  for (let by = 23; by <= 33; by += 4) {
    for (let bx = 32; bx <= 44; bx += 5) fill(rect(bx, by, bx + 2, by + 1), SOIL);
  }

  // 6. the back gate: a gap in the west boundary
  fill(rect(0, 17, 2, 21), DRIVE);

  // --- buildings ------------------------------------------------------------
  // A building is roof above, wall below, with one doorway left open.
  const building = (r, doorX, doorY, interiorRows) => {
    const roofBottom = r.y1 + Math.max(2, Math.floor((r.y2 - r.y1) / 2) - 1);
    for (let y = r.y1; y <= r.y2; y++) {
      for (let x = r.x1; x <= r.x2; x++) {
        // Interior rows are open floor inside the shell: the upper layer must
        // stay clear there, or the wall drawn above would make the cell solid
        // whatever the ground layer says.
        const isInterior = interiorRows && y >= interiorRows.from && y <= interiorRows.to &&
                           x > r.x1 && x < r.x2;
        if (isInterior) { ground(x, y, STONE); continue; }
        if (x === doorX && y === doorY) { ground(x, y, STONE); continue; }   // doorway
        map.putAutotile(x, y, Z.LOWER2, y <= roofBottom ? ROOF : FACADE);
        solid.add(`${x},${y}`);
      }
    }
  };

  // The manor. Its door is the estate's main entrance; the transfer stands on
  // the paved apron at (26,20) just outside it, so (26,19) is the opening.
  building(MANOR, 26, 19, null);
  ground(26, 20, STONE);

  // The stable: a shallow open-fronted building, so (8,8) inside and (8,9) in
  // the doorway are both standable, matching the transfer pair in the sheet.
  building(STABLE, 8, 9, { from: 7, to: 8 });
  ground(8, 8, STONE);
  ground(8, 9, STONE);

  // The greenhouse: glass walls, the door on its north face.
  building(GREENHOUSE, 42, 27, { from: 28, to: 35 });
  ground(42, 27, STONE);
  ground(42, 28, STONE);

  map.refreshAutotiles(null, Z.LOWER);
  map.refreshAutotiles(null, Z.LOWER2);

  // --- boundary and planting ------------------------------------------------
  // Trees frame the estate without sealing it: the map edge is the boundary, the
  // planting only reads as one. Cells that carry a route are left alone.
  const keepClear = (x, y) =>
    (x >= 24 && x <= 28 && y >= 29) ||        // the drive out
    (x <= 2 && y >= 17 && y <= 21) ||         // the back gate
    (x >= 46 && y >= 6 && y <= 10);           // the chapel path
  const plant = (x, y, tile) => {
    if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) return;
    if (solid.has(`${x},${y}`)) return;
    if (keepClear(x, y)) return;
    map.set(x, y, Z.LOWER2, B(tile));
    solid.add(`${x},${y}`);
  };
  for (let x = 0; x < WIDTH; x += 3) { plant(x, 0, "TREE"); plant(x, HEIGHT - 1, "TREE"); }
  for (let y = 0; y < HEIGHT; y += 3) { plant(0, y, "TREE"); plant(WIDTH - 1, y, "TREE"); }
  // a hedge along the front of the garden, and one screening the service yard
  for (let x = 31; x <= 47; x += 2) plant(x, 21, "HEDGE");
  for (let y = 12; y <= 22; y += 2) plant(18, y, "HEDGE");

  // lamps along the turning circle
  for (const [lx, ly] of [[20, 24], [32, 24], [20, 28], [32, 28]]) plant(lx, ly, "LAMP");

  map.castWallShadows();

  return { map, solid };
}

module.exports = { build, WIDTH, HEIGHT, TILESET_ID, MAP_ID, MANOR, STABLE, GREENHOUSE };
