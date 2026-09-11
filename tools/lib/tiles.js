"use strict";
// Resolves the semantic tile palette (tools/data/tile-bindings.json) into
// numeric MZ tile IDs and builds the matching Tilesets.json flag array.
const bindings = require("../data/tile-bindings.json");

const A1 = 2048, A2 = 2816, A3 = 4352, A4 = 5888, A5 = 1536;
const SHEET_BASE = { B: 0, C: 256, D: 512, E: 768 };

const FLAG = {
  DOWN: 0x0001, LEFT: 0x0002, RIGHT: 0x0004, UP: 0x0008,
  STAR: 0x0010, LADDER: 0x0020, BUSH: 0x0040, COUNTER: 0x0080,
  DAMAGE: 0x0100,
};
const IMPASSABLE = FLAG.DOWN | FLAG.LEFT | FLAG.RIGHT | FLAG.UP; // 0x000F

// tile id for a normal (non-autotile) slot
function tileId(sheet, col, row) {
  if (sheet === "A5") {
    if (col < 0 || col > 7) throw new Error(`A5 col out of range: ${col}`);
    return A5 + row * 8 + col;
  }
  const base = SHEET_BASE[sheet];
  if (base === undefined) throw new Error(`unknown sheet: ${sheet}`);
  if (col < 0 || col > 15 || row < 0 || row > 15) {
    throw new Error(`${sheet} slot out of range: col=${col} row=${row}`);
  }
  // Sheets B-E are 16 wide but stored 8 per block: cols 8..15 live +128 further on.
  return base + (col >= 8 ? 128 : 0) + row * 8 + (col % 8);
}

function autotileId(kind, shape = 0) { return A1 + kind * 48 + shape; }

// Resolve one named palette entry of a set ("outside" | "inside").
function resolve(setName, key) {
  const set = bindings[setName];
  if (!set) throw new Error(`unknown tile set: ${setName}`);
  if (set.autotiles[key]) {
    const a = set.autotiles[key];
    return { kind: a.kind, base: autotileId(a.kind, 0), autotile: true, spec: a };
  }
  const t = set.tiles[key];
  if (!t) throw new Error(`unknown tile binding: ${setName}.${key}`);
  return { id: tileId(t.sheet, t.col, t.row), autotile: false, spec: t };
}

// Build the 8192-entry flags array for one tileset.
//
// Base rule follows the engine's own tile families: A1 water is impassable,
// A2/A5 are ground, A3 (roofs and building walls) and A4 (wall top + face) are
// solid. Then every named decoration in the bindings stamps its own flag, so
// passability in the generated maps is derived from the same file the maps are
// painted from -- the two cannot drift apart.
function buildFlags(setName) {
  const flags = new Array(8192).fill(0);
  for (let id = 0; id < 8192; id++) {
    if (id >= A1 && id < A2) flags[id] = IMPASSABLE;        // A1 water
    else if (id >= A2 && id < A3) flags[id] = 0;            // A2 ground
    else if (id >= A3 && id < A4) flags[id] = IMPASSABLE;   // A3 roofs / building walls
    else if (id >= A4) flags[id] = IMPASSABLE;              // A4 walls
    else if (id >= A5 && id < A1) flags[id] = 0;            // A5 normal ground
    else flags[id] = 0;                                     // B-E decoration: open by default
  }
  const set = bindings[setName];
  for (const [key, t] of Object.entries(set.tiles)) {
    const id = tileId(t.sheet, t.col, t.row);
    let f = 0;
    if (t.star) f |= FLAG.STAR;            // drawn above the player, passability untouched
    else if (t.blocked) f |= IMPASSABLE;
    if (t.counter) f |= FLAG.COUNTER;
    if (t.ladder) f |= FLAG.LADDER;
    if (t.bush) f |= FLAG.BUSH;
    flags[id] = f;
    // A composite object occupying more cells keeps its extra slots consistent.
    if (t.width || t.height) {
      for (let dy = 0; dy < (t.height || 1); dy++) {
        for (let dx = 0; dx < (t.width || 1); dx++) {
          if (!dx && !dy) continue;
          flags[tileId(t.sheet, t.col + dx, t.row + dy)] = f;
        }
      }
    }
  }
  flags[0] = FLAG.STAR; // empty cell decides nothing (engine default)
  return flags;
}

// Every binding still carrying ASSUMED, for the validator and the asset docs.
function assumedBindings() {
  const out = [];
  for (const [setName, set] of Object.entries(bindings)) {
    if (setName.startsWith("_")) continue;
    for (const group of ["autotiles", "tiles"]) {
      for (const [key, t] of Object.entries(set[group] || {})) {
        if (t.verify === "ASSUMED") out.push(`${setName}.${key} (${t.sheet})`);
      }
    }
  }
  return out;
}

module.exports = { bindings, tileId, autotileId, resolve, buildFlags, assumedBindings, FLAG, IMPASSABLE, A1, A2, A3, A4, A5 };
