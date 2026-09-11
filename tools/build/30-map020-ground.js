"use strict";
// MAP_020 Manor Ground Floor, 44x34, tileset 4 (Inside).
//
// Room footprints and door positions come from spec/08_Mansion_Blueprint. The
// blueprint rectangles are the room's FOOTPRINT INCLUDING its walls -- that is
// what makes the listed doors (22,32), (22,27), (42,11) land on wall lines and
// what gives the two-tile wall height the blueprint states. Interiors are
// therefore carved one cell inside each rectangle.
//
// Architecture is not rearranged for convenience: the formal route
// (vestibule -> main hall -> study / library / dining) and the service route
// (service corridor -> kitchen / servants' hall / laundry / stairs) stay where
// the blueprint puts them.
const path = require("path");
const { table, num } = require("../lib/spec");
const tiles = require("../lib/tiles");
const { RMMap, T, Z } = require(path.join(__dirname, "..", "..", ".claude", "skills", "rpgmaker-map-design", "scripts", "rpgmap.js"));

const WIDTH = 44, HEIGHT = 34, TILESET_ID = 4, MAP_ID = 20;

// Floor character per room: formal rooms are carpeted or parquet, service rooms
// flagstone or tile. This is what stops thirteen rooms reading as one box.
const FLOOR = {
  vestibule: "FLOOR_STONE",
  main_hall: "FLOOR_CARPET",
  grand_stair: "FLOOR_CARPET",
  study: "FLOOR_WOOD",
  library: "FLOOR_WOOD",
  archive_room: "FLOOR_WOOD",
  dining: "FLOOR_CARPET",
  kitchen: "FLOOR_STONE",
  service_corridor: "FLOOR_STONE",
  servants_hall: "FLOOR_WOOD",
  laundry: "FLOOR_TILE",
  service_stair_gf: "FLOOR_STONE",
  basement_stair_gf: "FLOOR_STONE",
};

// Build order matters where the blueprint nests one space inside another
// (the basement stair sits inside the kitchen block, the service stair inside
// the service corridor, the archive above the library): the nested room is
// carved last so its own walls survive.
const ORDER = [
  "library", "archive_room", "kitchen", "service_corridor", "servants_hall",
  "laundry", "study", "dining", "main_hall", "grand_stair", "vestibule",
  "service_stair_gf", "basement_stair_gf",
];

// A blueprint "door" entry is one of three things, and they must not be treated
// alike. Only a real door is an opening cut through a wall; a transfer is a
// point you stand on to leave the floor (a staircase head, the courtyard door),
// and a secret panel is a disguised wall that opens later in the story.
function classifyDoor(label) {
  const l = label.toLowerCase();
  if (/тайн|панел/.test(l)) return "secret";
  if (/переход|верх|низ|подвал|двор|калитк|^юг$/.test(l.trim())) return "transfer";
  return "door";
}

function readRooms() {
  const rows = table("08_Mansion_Blueprint").filter((r) => r.map_key === "MAP_020_Manor_Ground_Floor");
  const rooms = {};
  for (const r of rows) {
    const doors = [];
    for (const part of String(r["двери"]).split(";")) {
      const m = part.match(/^\s*(.*?)\s*\((\d+)\s*,\s*(\d+)\)\s*$/);
      if (!m) continue;
      doors.push({ label: m[1], x: Number(m[2]), y: Number(m[3]), kind: classifyDoor(m[1]) });
    }
    rooms[r.room_id] = {
      id: r.room_id,
      name: r["название помещения"],
      purpose: r["назначение"],
      x1: num(r.x1), y1: num(r.y1), x2: num(r.x2), y2: num(r.y2),
      doors,
    };
  }
  for (const id of ORDER) if (!rooms[id]) throw new Error(`blueprint room missing: ${id}`);
  return rooms;
}

// Doors the blueprint does not supply, or supplies at a coordinate that cannot
// physically open. Each one records why it exists; no room rectangle is moved.
//
// D-05  library: 08_Mansion_Blueprint gives the library door as (15,13) "to the
//       hall". At y=13 the main hall does not exist -- its own rectangle is
//       (15,16)-(29,27), so its interior spans y17..26 -- and the five cells
//       east of (15,13) are solid, the nearest floor being the grand stair six
//       cells away. The library and archive would be sealed off from the whole
//       map. The library instead opens onto the study across their shared
//       boundary, which is where the two rooms actually touch. A private
//       library reached through the master's study is period-correct and keeps
//       the blueprint's own hall -> study -> library -> archive privacy
//       gradient intact.
//
// D-06  main hall: the blueprint lists the hall's neighbours by name only --
//       "вестибюль; кабинет; библиотека; столовая; лестница" -- with no
//       coordinates, so the hall receives its doors from the neighbouring
//       rooms' entries. Every neighbour supplies one except the staircase. The
//       grand stair (20,12)-(25,16) sits directly north of the hall
//       (15,16)-(29,27) sharing the wall line y=16, and a grand staircase that
//       does not open onto the ceremonial hall is not a grand staircase; without
//       it the only way up is through the servants' hall, which is exactly the
//       route a butler would never let the master take.
// Blueprint doors that cannot be built as given. Listed explicitly so the
// generator fails loudly on any NEW impossible door instead of quietly routing
// around it.
const SUPERSEDED_DOORS = {
  "library:15,13": "opens into five solid cells; the main hall's rectangle never reaches y=13. Superseded by D-05.",
  // D-07: the laundry's east wall is x=26 and the service corridor's rectangle
  // is (27,4)-(31,17), so its interior begins at y=5 -- at y=3 there is nothing
  // east of the laundry but solid fill. No repair door is needed: the laundry's
  // other door (21,5) opens into the servants' hall, which opens into the
  // service corridor, and laundry -> servants' hall -> corridor is the correct
  // below-stairs circulation anyway.
  "laundry:26,3": "the service corridor's interior starts at y=5 and never reaches y=3. Laundry stays connected via (21,5).",
};

const REPAIR_DOORS = [
  { x: 10, y: 16, room: "library", why: "D-05 library <-> study; blueprint door (15,13) opens into solid wall" },
  { x: 22, y: 16, room: "main_hall", why: "D-06 main hall <-> grand staircase; blueprint names the link but gives no coordinate" },
];

function build() {
  const rooms = readRooms();
  const map = RMMap.create({ width: WIDTH, height: HEIGHT, tilesetId: TILESET_ID, displayName: "Поместье Грейстоун" });
  map.disableDashing = false;
  map.scrollType = 0;

  const A = (k) => tiles.resolve("inside", k).kind;
  const B = (k) => tiles.resolve("inside", k).id;
  const WALL_TOP = A("WALL_TOP"), WALL_SIDE = A("WALL_SIDE");

  // 1. The whole floor plate starts as solid wall; rooms are carved out of it.
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) map.putAutotile(x, y, Z.LOWER, WALL_TOP);
  }

  // 2. Carve each room's interior (one cell inside its footprint).
  const floorOf = {};   // "x,y" -> room id
  for (const id of ORDER) {
    const r = rooms[id];
    const kind = A(FLOOR[id]);
    for (let y = r.y1 + 1; y <= r.y2 - 1; y++) {
      for (let x = r.x1 + 1; x <= r.x2 - 1; x++) {
        if (x < 1 || y < 1 || x >= WIDTH - 1 || y >= HEIGHT - 1) continue;
        map.putAutotile(x, y, Z.LOWER, kind);
        floorOf[`${x},${y}`] = id;
      }
    }
  }

  const isFloor = (x, y) => floorOf[`${x},${y}`] !== undefined;

  // 3. Doorways. A door sits in a wall line, so carving the single listed cell
  //    would still leave the wall closed -- the opening is cut along whichever
  //    axis actually reaches floor on both sides.
  const doorCells = [];
  const transfers = [];
  const secrets = [];
  const protectedCells = new Set();   // door corridors: furniture may never sit here
  const impossible = [];              // blueprint doors that cannot be cut as given

  const allDoors = [];
  for (const id of ORDER) for (const d of rooms[id].doors) allDoors.push({ ...d, room: id });
  for (const d of REPAIR_DOORS) allDoors.push({ ...d, kind: "door", label: "repair" });

  for (const d of allDoors) {
    const id = d.room;
    if (SUPERSEDED_DOORS[`${id}:${d.x},${d.y}`]) continue;
    if (d.kind === "transfer") {
      // A transfer point must be standable. Inside a room it already is; on an
      // outer wall it needs a doorway alcove cut inward.
      if (!isFloor(d.x, d.y)) {
        let cut = false;
        for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
          if (isFloor(d.x + dx, d.y + dy)) {
            map.putAutotile(d.x, d.y, Z.LOWER, A(FLOOR[id]));
            floorOf[`${d.x},${d.y}`] = id;
            cut = true;
            break;
          }
        }
        if (!cut) throw new Error(`transfer point (${d.x},${d.y}) of ${id} touches no floor`);
      }
      protectedCells.add(`${d.x},${d.y}`);
      transfers.push({ ...d });
      continue;
    }
    if (d.kind === "secret") {
      secrets.push({ ...d });
      protectedCells.add(`${d.x},${d.y}`);
      continue;
    }

    // A real door sits in a wall line, so carving only the listed cell would
    // leave the wall closed. Cut along whichever axis reaches floor on BOTH
    // sides, and protect the whole corridor including the first floor cell
    // either end -- furniture parked on the far side blocks the door just as
    // effectively as furniture in it.
    const axes = [{ dx: 0, dy: 1 }, { dx: 1, dy: 0 }];
    let carved = null;
    for (const ax of axes) {
      const reach = (sign) => {
        for (let step = 1; step <= 3; step++) {
          const x = d.x + ax.dx * step * sign, y = d.y + ax.dy * step * sign;
          if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) return null;
          if (isFloor(x, y)) return step;
        }
        return null;
      };
      const up = reach(-1), down = reach(1);
      if (up !== null && down !== null) { carved = { ax, up, down }; break; }
    }
    if (!carved) {
      impossible.push({ ...d, why: "reaches floor on at most one side within a 3-cell wall thickness" });
      continue;
    }
    const { ax, up, down } = carved;
    for (let s2 = -up; s2 <= down; s2++) {
      const x = d.x + ax.dx * s2, y = d.y + ax.dy * s2;
      if (!isFloor(x, y)) {
        map.putAutotile(x, y, Z.LOWER, A(FLOOR[id]));
        floorOf[`${x},${y}`] = id;
      }
      protectedCells.add(`${x},${y}`);
    }
    doorCells.push({ ...d, axis: ax.dx ? "h" : "v" });
  }

  map.refreshAutotiles(null, Z.LOWER);

  // 4. Wall faces: a wall cell with floor directly below it shows the wall's
  //    vertical face, not its top. Two rows deep, matching the blueprint's
  //    stated wall height of 2 tiles.
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      if (isFloor(x, y)) continue;
      if (y + 1 < HEIGHT && isFloor(x, y + 1)) map.putAutotile(x, y, Z.LOWER, WALL_SIDE);
    }
  }
  map.refreshAutotiles(null, Z.LOWER);

  const undeclared = impossible.filter((d) => !SUPERSEDED_DOORS[`${d.room}:${d.x},${d.y}`]);
  if (undeclared.length) {
    const lines = undeclared.map((d) => `  ${d.room} (${d.x},${d.y}) "${d.label}": ${d.why}`);
    throw new Error(`blueprint doors that cannot be built:\n${lines.join("\n")}`);
  }

  return { map, rooms, floorOf, doorCells, transfers, secrets, protectedCells, impossible, isFloor, A, B };
}

module.exports = { build, readRooms, WIDTH, HEIGHT, TILESET_ID, MAP_ID, FLOOR, ORDER };
