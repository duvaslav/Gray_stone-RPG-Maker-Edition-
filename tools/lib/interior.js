"use strict";
// Generic interior map builder.
//
// Every manor interior is laid out the same way, so the algorithm that produced
// MAP_020 lives here once and each map is a plan rather than a copy:
//
//   1. fill the whole plate with wall
//   2. carve each room's interior one cell inside its blueprint rectangle
//      (the rectangles are FOOTPRINTS INCLUDING walls -- that is what puts the
//      listed doors on wall lines and gives the stated wall height)
//   3. cut doorways along whichever axis reaches floor on both sides
//   4. turn wall cells with floor below them into wall faces
//
// Door corridors, transfer points and secret panels are collected as protected
// cells so furnishing can never block them.
const path = require("path");
const { table, num } = require("./spec");
const tiles = require("./tiles");
const { RMMap, Z } = require(path.join(__dirname, "..", "..", ".claude", "skills", "rpgmaker-map-design", "scripts", "rpgmap.js"));

// A blueprint "door" entry is one of three things and they must not be treated
// alike: a real door is an opening cut through a wall, a transfer is a point you
// stand on to leave the floor, a secret panel is a disguised wall.
function classifyDoor(label) {
  const l = String(label).toLowerCase();
  if (/тайн|панел|скрыт|ниша/.test(l)) return "secret";
  if (/переход|верх|низ|подвал|двор|калитк|лестниц|выход|внешний вход|^юг$/.test(l.trim())) return "transfer";
  return "door";
}

function readRooms(mapKey, order, extraRooms = {}) {
  const rows = table("08_Mansion_Blueprint").filter((r) => r.map_key === mapKey);
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
      wallHeight: num(r["высота стены в тайлах"], 2),
      doors,
    };
  }
  // Spaces the blueprint implies but never tabulates -- a porch outside a south
  // wall, a stair niche below a room. Declared in the plan with a stated reason.
  for (const [id, def] of Object.entries(extraRooms)) {
    rooms[id] = {
      id, name: def.name || id, purpose: def.why || "",
      x1: def.x1, y1: def.y1, x2: def.x2, y2: def.y2,
      wallHeight: def.wallHeight || 2,
      doors: (def.doors || []).map((d) => ({ ...d, kind: d.kind || classifyDoor(d.label || "") })),
      extra: true,
    };
  }
  for (const id of order) if (!rooms[id]) throw new Error(`${mapKey}: blueprint room missing: ${id}`);
  return rooms;
}

function build(plan) {
  const { mapKey, width, height, tilesetId, displayName, floors, order,
          supersededDoors = {}, repairDoors = [], extraRooms = {}, nested = {},
          rectOverrides = {}, tileSet = "inside" } = plan;

  const rooms = readRooms(mapKey, order, extraRooms);
  // A blueprint rectangle can be overridden where the literal one produces a
  // space the game cannot use. Each override states why.
  for (const [id, rect] of Object.entries(rectOverrides)) {
    if (!rooms[id]) throw new Error(`${mapKey}: rectOverride for unknown room ${id}`);
    Object.assign(rooms[id], rect);
  }
  const map = RMMap.create({ width, height, tilesetId, displayName: displayName || "" });
  map.scrollType = 0;

  const A = (k) => tiles.resolve(tileSet, k).kind;
  const B = (k) => tiles.resolve(tileSet, k).id;
  const WALL_TOP = A("WALL_TOP"), WALL_SIDE = A("WALL_SIDE");

  // 1. solid plate
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) map.putAutotile(x, y, Z.LOWER, WALL_TOP);
  }

  // 2. carve interiors.
  //
  // `nested` lists private rooms that sit INSIDE a larger space. A container's
  // interior is carved around their FULL rectangles, walls included -- otherwise
  // the container's floor runs straight through the private room's walls, the
  // room ends up open on the sides it shares with the container, and its door
  // becomes decoration. That is what happened to the six maids' rooms.
  const floorOf = {};
  const carveHoles = {};
  for (const [container, children] of Object.entries(nested)) {
    carveHoles[container] = children.map((id) => {
      const c = rooms[id];
      if (!c) throw new Error(`${mapKey}: nested room ${id} of ${container} not found`);
      return c;
    });
  }
  const insideAnyChild = (container, x, y) =>
    (carveHoles[container] || []).some((c) => x >= c.x1 && x <= c.x2 && y >= c.y1 && y <= c.y2);

  for (const id of order) {
    const r = rooms[id];
    const kind = A(floors[id]);
    for (let y = r.y1 + 1; y <= r.y2 - 1; y++) {
      for (let x = r.x1 + 1; x <= r.x2 - 1; x++) {
        if (x < 1 || y < 1 || x >= width - 1 || y >= height - 1) continue;
        if (insideAnyChild(id, x, y)) continue;    // leave the private room its walls
        map.putAutotile(x, y, Z.LOWER, kind);
        floorOf[`${x},${y}`] = id;
      }
    }
  }
  const isFloor = (x, y) => floorOf[`${x},${y}`] !== undefined;

  // 3. doorways
  const doorCells = [], transfers = [], secrets = [], impossible = [];
  const protectedCells = new Set();

  const allDoors = [];
  for (const id of order) for (const d of rooms[id].doors) allDoors.push({ ...d, room: id });
  for (const d of repairDoors) allDoors.push({ ...d, kind: d.kind || "door", label: d.label || "repair" });

  for (const d of allDoors) {
    const id = d.room;
    if (supersededDoors[`${id}:${d.x},${d.y}`]) continue;

    if (d.kind === "transfer" || d.kind === "secret") {
      // Must be standable. Inside a room it already is; on an outer wall it
      // needs an alcove cut inward so the player can reach it.
      if (!isFloor(d.x, d.y)) {
        let cut = false;
        for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
          if (isFloor(d.x + dx, d.y + dy)) {
            map.putAutotile(d.x, d.y, Z.LOWER, A(floors[id]));
            floorOf[`${d.x},${d.y}`] = id;
            cut = true;
            break;
          }
        }
        if (!cut) { impossible.push({ ...d, why: "touches no floor" }); continue; }
      }
      protectedCells.add(`${d.x},${d.y}`);
      (d.kind === "transfer" ? transfers : secrets).push({ ...d });
      continue;
    }

    const axes = [{ dx: 0, dy: 1 }, { dx: 1, dy: 0 }];
    let carved = null;
    for (const ax of axes) {
      const reach = (sign) => {
        for (let step = 1; step <= 3; step++) {
          const x = d.x + ax.dx * step * sign, y = d.y + ax.dy * step * sign;
          if (x < 0 || y < 0 || x >= width || y >= height) return null;
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
    // Protect the corridor INCLUDING the first floor cell each end: furniture
    // parked on the far side blocks a door just as effectively as furniture in it.
    for (let s = -up - 1; s <= down + 1; s++) {
      const x = d.x + ax.dx * s, y = d.y + ax.dy * s;
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      if (s >= -up && s <= down && !isFloor(x, y)) {
        map.putAutotile(x, y, Z.LOWER, A(floors[id]));
        floorOf[`${x},${y}`] = id;
      }
      if (isFloor(x, y)) protectedCells.add(`${x},${y}`);
    }
    doorCells.push({ ...d, axis: ax.dx ? "h" : "v" });
  }

  const undeclared = impossible.filter((d) => !supersededDoors[`${d.room}:${d.x},${d.y}`]);
  if (undeclared.length) {
    const lines = undeclared.map((d) => `  ${d.room} (${d.x},${d.y}) "${d.label}": ${d.why}`);
    throw new Error(`${mapKey}: blueprint doors that cannot be built:\n${lines.join("\n")}`);
  }

  map.refreshAutotiles(null, Z.LOWER);

  // 4. wall faces
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (isFloor(x, y)) continue;
      if (y + 1 < height && isFloor(x, y + 1)) map.putAutotile(x, y, Z.LOWER, WALL_SIDE);
    }
  }
  map.refreshAutotiles(null, Z.LOWER);

  return { map, rooms, floorOf, doorCells, transfers, secrets, protectedCells, isFloor, A, B, plan };
}

// Reachability report: which rooms can be reached from a starting cell, and
// whether any walkable cell is cut off. A walkable cell nobody can reach is a
// mapping bug, not a design choice.
// `blockers` are cells occupied by a blocking EVENT. Tile passability alone does
// not see them, so a search point or an NPC parked in a one-tile-wide passage
// would cut the map in two and every tile-only check would still pass.
function audit(ctx, flags, start, blockers = null) {
  const { map, floorOf, plan } = ctx;
  const reach = blockers && blockers.size
    ? reachableAvoiding(map, flags, start, blockers)
    : map.reachable(start.x, start.y, flags);
  const K = (x, y) => y * map.width + x;
  const perRoom = {};
  const dead = [];
  for (const [k, room] of Object.entries(floorOf)) {
    const [x, y] = k.split(",").map(Number);
    perRoom[room] = perRoom[room] || { total: 0, reached: 0 };
    perRoom[room].total++;
    if (reach.has(K(x, y))) perRoom[room].reached++;
    else if (map.isWalkable(x, y, flags)) dead.push(`${k} [${room}]`);
  }
  const unreachable = Object.entries(perRoom).filter(([, v]) => v.reached === 0).map(([k]) => k);
  return { reach, perRoom, dead, unreachable, floorCells: Object.keys(floorOf).length };
}

// Flood fill that treats blocked event cells as walls.
function reachableAvoiding(map, flags, start, blockers) {
  const K = (x, y) => y * map.width + x;
  const seen = new Set();
  if (!map.isWalkable(start.x, start.y, flags) || blockers.has(`${start.x},${start.y}`)) return seen;
  const stack = [[start.x, start.y]];
  seen.add(K(start.x, start.y));
  while (stack.length) {
    const [x, y] = stack.pop();
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) continue;
      if (seen.has(K(nx, ny))) continue;
      if (!map.isWalkable(nx, ny, flags)) continue;
      if (blockers.has(`${nx},${ny}`)) continue;
      seen.add(K(nx, ny));
      stack.push([nx, ny]);
    }
  }
  return seen;
}

module.exports = { build, audit, readRooms, classifyDoor, reachableAvoiding };
