"use strict";
// MAP_005 Prologue Front Drive, 32x24, tileset 2 (Outside).
//
// The map is painted from the literal grid in spec/61_Prologue_Map_Blueprint,
// so the cinematic composition is the level designer's, not the generator's.
// Column value_1 is the ground layer, value_2 the structure layer, value_3 the
// detail layer, and value_4 the collision the blueprint EXPECTS -- which this
// script verifies against the flags the engine will actually read.
const path = require("path");
const { table } = require("../lib/spec");
const tiles = require("../lib/tiles");
const { RMMap, T, Z } = require(path.join(__dirname, "..", "..", ".claude", "skills", "rpgmaker-map-design", "scripts", "rpgmap.js"));

const WIDTH = 32, HEIGHT = 24, TILESET_ID = 2, MAP_ID = 5;

function readGrid() {
  const rows = table("61_Prologue_Map_Blueprint").filter((r) => r.section === "GRID");
  const grid = [];
  for (const r of rows) {
    const y = Math.round(Number(r.key_or_y));
    grid[y] = { ground: r.value_1, structure: r.value_2, detail: r.value_3, collision: r.value_4 };
  }
  for (let y = 0; y < HEIGHT; y++) {
    const g = grid[y];
    if (!g) throw new Error(`blueprint row ${y} missing`);
    for (const k of ["ground", "structure", "detail", "collision"]) {
      if (g[k].length !== WIDTH) {
        throw new Error(`row ${y} ${k}: expected ${WIDTH} cells, got ${g[k].length}`);
      }
    }
  }
  return grid;
}

function build() {
  const grid = readGrid();
  const map = RMMap.create({ width: WIDTH, height: HEIGHT, tilesetId: TILESET_ID, displayName: "" });
  map.disableDashing = true;   // cinematic map: the player never walks it
  map.scrollType = 0;
  map.encounterStep = 30;

  const A = (k) => tiles.resolve("outside", k).kind;
  const B = (k) => tiles.resolve("outside", k).id;

  // --- layer 0: ground ------------------------------------------------------
  // Autotiles are placed by kind first, then every seam is solved in one pass,
  // so the borders between lawn, gravel and paving are computed, not guessed.
  const GROUND_KIND = {
    G: A("GRASS"), P: A("DRIVE"), S: A("STONE"), F: A("SOIL"),
  };
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const sym = grid[y].ground[x];
      const kind = GROUND_KIND[sym];
      if (kind === undefined) throw new Error(`row ${y} col ${x}: unknown ground symbol '${sym}'`);
      map.putAutotile(x, y, Z.LOWER, kind);
    }
  }
  // The doorway cells get a stone threshold, as the palette allows ("under the
  // door - S or a neutral A5 stone"). It must be laid down BEFORE the seams are
  // solved: A5 is a normal tile, not an autotile, so the surrounding lawn has to
  // shape its edge against it or the threshold shows six torn seams.
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      if (grid[y].structure[x] === "D") map.set(x, y, Z.LOWER, B("STEP_STONE"));
    }
  }
  map.refreshAutotiles(null, Z.LOWER);

  // --- layer 1: structure ---------------------------------------------------
  // R (roof) and W (facade) are A3 autotile families and are painted by kind;
  // T/H/# are single decoration tiles from sheet B.
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const sym = grid[y].structure[x];
      switch (sym) {
        case ".": break;
        case "R": map.putAutotile(x, y, Z.LOWER2, A("ROOF")); break;
        case "W": map.putAutotile(x, y, Z.LOWER2, A("FACADE")); break;
        // The blueprint writes windows into the STRUCTURE row, not the detail
        // row. Keep the facade autotile solid and continuous underneath and put
        // the window on the layer above as a star tile -- a passable decoration
        // laid straight onto a wall would make the wall walkable.
        case "w":
          map.putAutotile(x, y, Z.LOWER2, A("FACADE"));
          map.set(x, y, Z.UPPER, B("WINDOW_LIT"));
          break;
        case "T": map.set(x, y, Z.LOWER2, B("TREE_TRUNK")); break;
        case "H": map.set(x, y, Z.LOWER2, B("HEDGE")); break;
        case "#": map.set(x, y, Z.LOWER2, B("HEDGE")); break;  // sealed frame edge
        case "D": break;  // doorway: the opening stays clear, EV_PR_DOOR draws the door
        default: throw new Error(`row ${y} col ${x}: unknown structure symbol '${sym}'`);
      }
    }
  }
  map.refreshAutotiles(null, Z.LOWER2);

  // --- layer 2: detail ------------------------------------------------------
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const sym = grid[y].detail[x];
      switch (sym) {
        case ".": break;
        case "L": map.set(x, y, Z.UPPER, B("LAMP")); break;
        case "w": map.set(x, y, Z.UPPER, B("WINDOW_LIT")); break;
        default: throw new Error(`row ${y} col ${x}: unknown detail symbol '${sym}'`);
      }
    }
  }

  // Flowerbeds: the blueprint marks them F on the ground layer; the planting
  // itself is a detail tile so the bed reads as bed, not as bare soil.
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      if (grid[y].ground[x] === "F") map.set(x, y, Z.UPPER, B("FLOWERS"));
    }
  }

  // Tree canopies sit above the player so Leonard can pass beneath the boundary
  // planting without the frame looking flat.
  for (let y = 1; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      if (grid[y].structure[x] === "T") map.set(x, y - 1, Z.UPPER2, B("TREE_CROWN"));
    }
  }

  // --- shadows and regions --------------------------------------------------
  map.castWallShadows();
  // The blueprint reserves the central axis for the cutscene; the shadow pen
  // must not darken the route the camera holds on.
  for (let y = 8; y <= 23; y++) for (let x = 14; x <= 18; x++) map.setShadow(x, y, 0);

  // Regions are QA markers for the staging areas, not gameplay triggers.
  for (let y = 18; y <= 23; y++) for (let x = 12; x <= 20; x++) map.setRegion(x, y, 1); // lower drive
  for (let y = 11; y <= 18; y++) for (let x = 7;  x <= 25; x++) map.setRegion(x, y, 2); // turning circle
  for (let y = 8;  y <= 12; y++) for (let x = 11; x <= 20; x++) map.setRegion(x, y, 3); // porch / tableau

  return { map, grid };
}

// Compare the flags the engine will read against the blueprint's own collision
// column. A mismatch means the painted map does not match the design intent.
function verifyCollision(map, grid, flags) {
  const problems = [];
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const expectBlocked = grid[y].collision[x] === "1";
      const actualWalkable = map.isWalkable(x, y, flags);
      if (expectBlocked === actualWalkable) {
        problems.push({
          x, y,
          expected: expectBlocked ? "blocked" : "walkable",
          actual: actualWalkable ? "walkable" : "blocked",
          ground: grid[y].ground[x], structure: grid[y].structure[x], detail: grid[y].detail[x],
        });
      }
    }
  }
  return problems;
}

module.exports = { build, verifyCollision, WIDTH, HEIGHT, TILESET_ID, MAP_ID, readGrid };
