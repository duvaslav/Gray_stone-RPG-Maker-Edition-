"use strict";
// Furnishing pass for MAP_020.
//
// Placement rules this pass obeys (docs/MAP_DESIGN_RULES.md):
//   - every room gets one focal point and some evidence of being lived in;
//   - blocking furniture goes on z1, wall-hung decor on z2 as star tiles so it
//     can never make a wall walkable;
//   - primary routes and every doorway cell stay clear -- the reachability
//     check after this pass is what proves it, not the placement intent.
const { Z } = require(require("path").join(__dirname, "..", "..", ".claude", "skills", "rpgmaker-map-design", "scripts", "rpgmap.js"));

// x, y, tile, [layer]   layer defaults to z1 (blocking furniture)
const FURNITURE = {
  // Buffer at the main entrance: two plants frame the door, centre axis clear.
  vestibule: [
    [19, 29, "PLANT"], [25, 29, "PLANT"],
    [19, 31, "CABINET"], [25, 31, "CABINET"],
  ],

  // Ceremonial centre. Focal point: the grand staircase opening to the north.
  // A large carpet holds the middle; seating is set slightly off-axis so the
  // room is not a mirror.
  main_hall: [
    [18, 18, "ARMCHAIR"], [18, 19, "ARMCHAIR"],
    [27, 18, "ARMCHAIR"],
    [17, 25, "CLOCK", Z.UPPER],
    [16, 22, "TABLE"], [16, 23, "CHAIR"],
    [28, 22, "TABLE"], [28, 23, "PLANT"],
    [26, 26, "PLANT"], [17, 26, "PLANT"],
  ],
  grand_stair: [
    [21, 13, "STAIR_UP"], [22, 13, "STAIR_UP"], [23, 13, "STAIR_UP"], [24, 13, "STAIR_UP"],
  ],

  // Leonard's study: the desk is the focal point and the search target.
  // Bookcases line the north wall, the fireplace anchors the west.
  // The bookcase run along the north wall is broken at x=8,9 so the wall is
  // approachable; a continuous run would seal the cells behind the desk into a
  // dead pocket the player can see but never reach. The desk stands clear of the
  // wall, facing into the room, and is the search target.
  study: [
    [4, 18, "BOOKSHELF"], [5, 18, "BOOKSHELF"], [6, 18, "BOOKSHELF"], [7, 18, "BOOKSHELF"],
    [10, 18, "BOOKSHELF"], [11, 18, "BOOKSHELF"], [12, 18, "BOOKSHELF"], [13, 18, "BOOKSHELF"],
    [6, 21, "DESK"], [7, 21, "DESK"],
    [6, 22, "CHAIR"],
    [4, 24, "FIREPLACE"], [4, 25, "ARMCHAIR"],
    [12, 20, "CABINET"], [13, 20, "CABINET"],
    [12, 27, "PLANT"],
  ],

  // Library: two long bookcase runs with a reading table between them, and the
  // catalogue by the archive door.
  library: [
    [4, 7, "BOOKSHELF"], [4, 9, "BOOKSHELF"], [4, 10, "BOOKSHELF"],
    [4, 12, "BOOKSHELF"], [4, 13, "BOOKSHELF"], [4, 14, "BOOKSHELF"],
    [14, 7, "BOOKSHELF"], [14, 8, "BOOKSHELF"], [14, 9, "BOOKSHELF"],
    [14, 11, "BOOKSHELF"], [14, 12, "BOOKSHELF"], [14, 13, "BOOKSHELF"],
    [7, 10, "TABLE"], [8, 10, "TABLE"],
    [7, 11, "CHAIR"], [8, 11, "CHAIR"],
    [11, 6, "CABINET"], [12, 6, "CABINET"],
    [6, 14, "ARMCHAIR"], [11, 14, "PLANT"],
  ],

  // Archive: closed cabinets, nothing comfortable. A working room, not a room
  // anyone sits in.
  archive_room: [
    [9, 2, "CABINET"], [10, 2, "CABINET"], [11, 2, "CABINET"], [12, 2, "CABINET"],
    [13, 2, "CABINET"],
    [13, 4, "CRATE"],
  ],

  // Dining: the long table is the focal point and the stage for public rank.
  dining: [
    [35, 21, "TABLE"], [36, 21, "TABLE"], [37, 21, "TABLE"],
    [35, 22, "TABLE"], [36, 22, "TABLE"], [37, 22, "TABLE"],
    [35, 20, "CHAIR"], [36, 20, "CHAIR"], [37, 20, "CHAIR"],
    [35, 23, "CHAIR"], [36, 23, "CHAIR"], [37, 23, "CHAIR"],
    [34, 21, "CHAIR"], [38, 22, "CHAIR"],
    [41, 19, "CABINET"], [41, 20, "CABINET"],
    [31, 27, "PLANT"], [41, 27, "PLANT"],
    [31, 19, "FIREPLACE"],
  ],

  // Kitchen: a working range against the north wall, a central work block the
  // staff move around, stores to the east.
  kitchen: [
    [33, 5, "STOVE"], [34, 5, "STOVE"],
    [38, 5, "COUNTER"], [39, 5, "COUNTER"], [40, 5, "COUNTER"],
    [35, 9, "COUNTER"], [36, 9, "COUNTER"], [37, 9, "COUNTER"],
    [35, 10, "COUNTER"], [36, 10, "COUNTER"], [37, 10, "COUNTER"],
    [41, 13, "BARREL"], [41, 14, "BARREL"], [40, 14, "CRATE"],
    [32, 14, "CABINET"], [33, 14, "CABINET"],
  ],
  service_corridor: [
    [30, 6, "CRATE"], [28, 16, "PLANT"],
  ],

  // Servants' hall: one long table where the staff actually sit. The room where
  // rumour happens, so it needs to look used.
  servants_hall: [
    [20, 8, "TABLE"], [21, 8, "TABLE"], [22, 8, "TABLE"], [23, 8, "TABLE"],
    [20, 7, "CHAIR"], [22, 7, "CHAIR"],
    [20, 9, "CHAIR"], [22, 9, "CHAIR"], [23, 9, "CHAIR"],
    [18, 6, "FIREPLACE"], [25, 6, "CABINET"],
    [25, 11, "CRATE"],
  ],
  laundry: [
    [19, 2, "COUNTER"], [20, 2, "COUNTER"], [21, 2, "COUNTER"],
    [24, 2, "BARREL"], [25, 2, "BARREL"],
    [18, 4, "CRATE"],
  ],
  service_stair_gf: [
    [28, 13, "STAIR_UP"], [29, 13, "STAIR_UP"],
  ],
  basement_stair_gf: [
    [36, 5, "STAIR_DOWN"],
  ],
};

// Wall-hung decoration. Placed on z2 as star tiles: a passable decoration laid
// straight onto a wall would override the wall and make it walkable.
const WALL_DECOR = [
  // main hall portraits -- the family, watching
  [17, 16, "PAINTING"], [19, 16, "PAINTING"], [26, 16, "PAINTING"], [27, 16, "PAINTING"],
  [15, 20, "PAINTING"], [15, 24, "PAINTING"], [29, 20, "PAINTING"], [29, 24, "PAINTING"],
  // study
  [5, 17, "PAINTING"], [11, 17, "PAINTING"], [3, 21, "WINDOW_IN"], [3, 26, "WINDOW_IN"],
  // library
  [3, 8, "WINDOW_IN"], [3, 12, "WINDOW_IN"], [12, 5, "PAINTING"],
  // dining
  [33, 17, "PAINTING"], [39, 17, "PAINTING"], [42, 21, "WINDOW_IN"], [42, 25, "WINDOW_IN"],
  // kitchen and service
  [42, 8, "WINDOW_IN"], [33, 4, "WINDOW_IN"], [39, 4, "WINDOW_IN"],
  // servants' hall and laundry
  [19, 5, "WINDOW_IN"], [24, 5, "WINDOW_IN"], [20, 1, "WINDOW_IN"], [24, 1, "WINDOW_IN"],
  // vestibule
  [20, 28, "PAINTING"], [24, 28, "PAINTING"],
];

// Curtains hang beside the windows they belong to.
const CURTAINS = [[3, 20, "CURTAIN"], [3, 27, "CURTAIN"], [42, 20, "CURTAIN"], [42, 26, "CURTAIN"]];

function furnish(ctx) {
  const { map, floorOf, B, protectedCells, reserved } = ctx;
  const placed = [];
  const skipped = [];

  for (const [room, list] of Object.entries(FURNITURE)) {
    for (const [x, y, tile, layer] of list) {
      const z = layer === undefined ? Z.LOWER2 : layer;
      // Furniture belongs on this room's floor. Anything that would land on a
      // wall or in a neighbour is a placement bug, not a decoration.
      if (z === Z.LOWER2 && floorOf[`${x},${y}`] !== room) {
        skipped.push({ room, x, y, tile, why: floorOf[`${x},${y}`] ? `belongs to ${floorOf[`${x},${y}`]}` : "not floor" });
        continue;
      }
      // A door corridor, a staircase head or a secret panel must stay clear.
      // Furniture parked on the far side of a doorway blocks the door just as
      // effectively as furniture standing in it.
      if (z === Z.LOWER2 && protectedCells && protectedCells.has(`${x},${y}`)) {
        skipped.push({ room, x, y, tile, why: "protected: door corridor / transfer / secret panel" });
        continue;
      }
      // An interactive object is an EVENT carrying its own tile graphic. Painting
      // a tile under it too would put two objects in one cell.
      if (reserved && reserved.has(`${x},${y}`)) {
        skipped.push({ room, x, y, tile, why: "reserved for an interactive event" });
        continue;
      }
      map.set(x, y, z, B(tile));
      placed.push({ room, x, y, tile, z });
    }
  }

  for (const [x, y, tile] of [...WALL_DECOR, ...CURTAINS]) {
    if (floorOf[`${x},${y}`]) {
      skipped.push({ room: "wall-decor", x, y, tile, why: "cell is floor, not wall" });
      continue;
    }
    map.set(x, y, Z.UPPER, B(tile));
    placed.push({ room: "wall-decor", x, y, tile, z: Z.UPPER });
  }

  return { placed, skipped };
}

module.exports = { furnish, FURNITURE, WALL_DECOR };
