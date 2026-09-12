"use strict";
// Furnishing, per map.
//
// Placement rules (docs/MAP_DESIGN_RULES.md):
//   - every room gets one focal point and some evidence of being lived in;
//   - blocking furniture on z1, wall-hung decor on z2 as star tiles so it can
//     never make a wall walkable;
//   - primary routes and every doorway cell stay clear. The reachability check
//     after this pass is what proves it, not the placement intent -- the build
//     fails if any walkable cell becomes unreachable.
//
// A coordinate that lands on a wall, in a neighbouring room, on a door corridor
// or on a cell reserved for an interactive event is REPORTED and skipped, never
// silently drawn.
const { Z } = require(require("path").join(__dirname, "..", "..", ".claude", "skills", "rpgmaker-map-design", "scripts", "rpgmap.js"));

module.exports = {
  MAP_020_Manor_Ground_Floor: {
    furniture: {
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
      // A small working room, 7x3. Two search points already stand on the north
      // row, so a full wall of cabinets there leaves the row solid and the NPCs
      // scheduled here nowhere safe to stand. Three cabinets, and the north row
      // keeps gaps.
      [9, 2, "CABINET"], [10, 2, "CABINET"], [14, 2, "CABINET"],
      [8, 4, "CRATE"],
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
},
    wallDecor: [
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
      // Curtains hang beside the windows they belong to.
    ],
  },

  // --------------------------------------------------------------- MAP_030
  // The six maids' rooms are identical 4x4 boxes by design, so their CHARACTER
  // has to come from what each woman keeps, not from the architecture -- and it
  // must not tell the player who is guilty. Each room differs by role and
  // temperament only: the chapel maid has books, the one who helps with
  // correspondence has a desk, the youngest has almost nothing, the nurse keeps
  // a clock. None of that narrows the culprit.
  MAP_030_Manor_Upper_Floor: {
    furniture: {
      maid_linda:    [[4, 4, "BED"], [7, 4, "CABINET"], [7, 7, "CHAIR"]],
      maid_celeste:  [[10, 4, "BED"], [13, 4, "CABINET"], [13, 7, "BOOKSHELF"]],
      maid_vera:     [[16, 4, "BED"], [19, 4, "CABINET"], [19, 7, "TABLE"]],
      maid_beatrice: [[4, 11, "BED"], [7, 11, "DESK"], [7, 13, "CHAIR"]],
      maid_nika:     [[10, 11, "BED"], [13, 11, "CRATE"]],
      maid_agnes:    [[16, 11, "BED"], [19, 11, "CABINET"], [19, 14, "CLOCK"]],
      // Once the six rooms keep their walls, the wing IS its circulation: a
      // single band at y=9, seventeen cells wide and one cell deep. Anything
      // placed in it cuts the floor in half, so it stays empty.
      maids_wing:    [],
      service_corridor_up: [[22, 4, "CRATE"], [22, 16, "PLANT"]],
      linen_closet:  [[24, 5, "CABINET"], [25, 5, "CABINET"], [26, 5, "CABINET"], [27, 5, "CABINET"], [24, 7, "CRATE"]],
      service_stair_up: [[29, 15, "STAIR_DOWN"]],
      // The landing is ceremonial: seating off the axis, the stair head clear.
      upper_landing: [[19, 20, "ARMCHAIR"], [19, 21, "ARMCHAIR"], [27, 20, "TABLE"],
                      [18, 27, "PLANT"], [28, 27, "PLANT"], [27, 27, "CLOCK"]],
      hero_bedroom:  [[5, 20, "BED"], [6, 20, "BED"], [12, 20, "DESK"], [13, 20, "DESK"],
                      [12, 21, "CHAIR"], [4, 23, "FIREPLACE"], [4, 26, "ARMCHAIR"],
                      [14, 20, "CABINET"], [14, 27, "PLANT"]],
      guest_rooms:   [[31, 19, "CABINET"], [31, 28, "PLANT"], [41, 19, "CRATE"]],
      evelyn_room:   [[34, 21, "BED"], [35, 21, "BED"], [39, 22, "TABLE"], [39, 23, "CHAIR"],
                      [40, 21, "CABINET"], [34, 27, "PLANT"]],
    },
    wallDecor: [
      [5, 3, "WINDOW_IN"], [17, 3, "WINDOW_IN"], [8, 3, "PAINTING"],
      [3, 22, "WINDOW_IN"], [3, 26, "WINDOW_IN"], [3, 21, "CURTAIN"],
      [42, 22, "WINDOW_IN"], [42, 26, "WINDOW_IN"],
      [20, 29, "PAINTING"], [26, 29, "PAINTING"],
    ],
  },

  // --------------------------------------------------------------- MAP_040
  // A working cellar: stores, not decoration. Nothing here is comfortable.
  MAP_040_Manor_Basement: {
    furniture: {
      basement_entry: [[31, 3, "CRATE"], [32, 6, "BARREL"]],
      basement_main:  [[14, 7, "BARREL"], [15, 7, "BARREL"], [27, 14, "CRATE"],
                       [28, 14, "CRATE"], [14, 14, "CABINET"]],
      wine_store:     [[4, 16, "BARREL"], [4, 17, "BARREL"], [5, 17, "BARREL"],
                       [10, 16, "CABINET"], [11, 16, "CABINET"], [4, 22, "CRATE"]],
      underground_store: [[23, 15, "CRATE"], [24, 15, "CRATE"], [32, 15, "BARREL"],
                          [33, 15, "BARREL"], [33, 22, "CABINET"]],
      closed_passage: [[16, 18, "CRATE"]],
    },
    wallDecor: [],
  },

  // --------------------------------------------------------------- MAP_050
  // Pews in two banks with the centre aisle left clear, so the altar is the
  // focal point from the door.
  MAP_050_Chapel: {
    furniture: {
      chapel_main: [
        [6, 7, "CHAIR"], [6, 8, "CHAIR"], [6, 9, "CHAIR"], [6, 10, "CHAIR"],
        [8, 7, "CHAIR"], [8, 8, "CHAIR"], [8, 9, "CHAIR"], [8, 10, "CHAIR"],
        [15, 7, "CHAIR"], [15, 8, "CHAIR"], [15, 9, "CHAIR"], [15, 10, "CHAIR"],
        [17, 7, "CHAIR"], [17, 8, "CHAIR"], [17, 9, "CHAIR"], [17, 10, "CHAIR"],
        [4, 14, "PLANT"], [19, 14, "PLANT"],
      ],
      // Altar table only. A cabinet beside it walled (10,3) into a one-cell
      // pocket between the cabinet, the table and the candle stand.
      chapel_altar: [[11, 3, "TABLE"], [12, 3, "TABLE"]],
      sacristy:     [[21, 3, "CABINET"], [22, 3, "CABINET"], [21, 7, "CRATE"]],
      chapel_porch: [[11, 17, "PLANT"], [13, 17, "PLANT"]],
      sacristy_niche: [[21, 9, "CRATE"]],
    },
    wallDecor: [
      [3, 6, "WINDOW_IN"], [3, 11, "WINDOW_IN"],
      [20, 11, "WINDOW_IN"], [10, 2, "PAINTING"], [13, 2, "PAINTING"],
    ],
  },

  // --------------------------------------------------------------- MAP_060
  // The central passage is ONE TILE WIDE. Nothing is placed in it: a single
  // blocking object there cuts the whole system in two.
  MAP_060_Secret_Passage: {
    furniture: {
      passage_library_branch: [[5, 4, "CRATE"]],
      passage_upper_branch:   [[13, 4, "CRATE"]],
      passage_chapel_branch:  [[30, 4, "CRATE"]],
      passage_store_branch:   [[22, 12, "CRATE"]],
      eleanor_cache:          [[16, 16, "CRATE"], [18, 16, "CRATE"]],
      passage_dead_branches:  [[8, 12, "CRATE"], [29, 12, "CRATE"], [8, 16, "BARREL"]],
    },
    wallDecor: [],
  },
};
