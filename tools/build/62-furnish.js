"use strict";
// Applies the furnishing plan for one map.
//
// Every coordinate is checked before it is drawn: it must be floor, in the room
// it was written for, and not on a door corridor, a transfer point, a secret
// panel or a cell reserved for an interactive event. Anything else is REPORTED
// and skipped rather than silently placed somewhere wrong.
const { Z } = require(require("path").join(__dirname, "..", "..", ".claude", "skills", "rpgmaker-map-design", "scripts", "rpgmap.js"));
const PLANS = require("../data/furnishing");

function furnish(ctx) {
  const { map, floorOf, B, protectedCells, reserved, plan } = ctx;
  const spec = PLANS[plan.mapKey];
  const placed = [], skipped = [];
  if (!spec) return { placed, skipped };

  const blocked = (x, y) =>
    (protectedCells && protectedCells.has(`${x},${y}`)) ||
    (reserved && reserved.has(`${x},${y}`));

  for (const [room, list] of Object.entries(spec.furniture || {})) {
    for (const [x, y, tile] of list) {
      const owner = floorOf[`${x},${y}`];
      if (owner !== room) {
        skipped.push({ room, x, y, tile, why: owner ? `belongs to ${owner}` : "not floor" });
        continue;
      }
      if (blocked(x, y)) {
        skipped.push({ room, x, y, tile, why: "protected: door corridor / transfer / interactive event" });
        continue;
      }
      map.set(x, y, Z.LOWER2, B(tile));
      placed.push({ room, x, y, tile, z: Z.LOWER2 });
    }
  }

  // Wall-hung decoration goes on z2 as star tiles. A passable decoration laid
  // straight onto a wall would override the wall and make it walkable.
  for (const [x, y, tile] of spec.wallDecor || []) {
    if (floorOf[`${x},${y}`]) {
      skipped.push({ room: "wall-decor", x, y, tile, why: "cell is floor, not wall" });
      continue;
    }
    map.set(x, y, Z.UPPER, B(tile));
    placed.push({ room: "wall-decor", x, y, tile, z: Z.UPPER });
  }

  return { placed, skipped };
}

module.exports = { furnish, PLANS };
