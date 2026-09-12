"use strict";
// One plan per interior map. The algorithm lives in tools/lib/interior.js.
//
// `order` matters wherever the blueprint nests one space inside another: the
// nested room is carved LAST so its own walls survive the parent's carve.
// `supersededDoors` records a blueprint door that cannot physically be built,
// with the reason; the builder throws on any undeclared one.
// `repairDoors` are added ONLY where the connectivity audit proves a room is
// otherwise sealed -- never speculatively.

module.exports = {
  MAP_020_Manor_Ground_Floor: {
    mapKey: "MAP_020_Manor_Ground_Floor",
    mapId: 20, width: 44, height: 34, tilesetId: 4,
    displayName: "Поместье Грейстоун",
    // Nested spaces carved last: the basement stair sits inside the kitchen
    // block, the service stair inside the service corridor, the archive above
    // the library.
    order: [
      "library", "archive_room", "kitchen", "service_corridor", "servants_hall",
      "laundry", "study", "dining", "main_hall", "grand_stair", "vestibule",
      "service_stair_gf", "basement_stair_gf",
    ],
    floors: {
      vestibule: "FLOOR_STONE", main_hall: "FLOOR_CARPET", grand_stair: "FLOOR_CARPET",
      study: "FLOOR_WOOD", library: "FLOOR_WOOD", archive_room: "FLOOR_WOOD",
      dining: "FLOOR_CARPET", kitchen: "FLOOR_STONE", service_corridor: "FLOOR_STONE",
      servants_hall: "FLOOR_WOOD", laundry: "FLOOR_TILE",
      service_stair_gf: "FLOOR_STONE", basement_stair_gf: "FLOOR_STONE",
    },
    supersededDoors: {
      "library:15,13": "opens into five solid cells; the main hall's rectangle never reaches y=13. Superseded by D-05.",
      "laundry:26,3": "the service corridor's interior starts at y=5 and never reaches y=3. Laundry stays connected via (21,5). D-07.",
    },
    repairDoors: [
      { x: 10, y: 16, room: "library", why: "D-05 library <-> study; the blueprint door opens into solid wall" },
      { x: 22, y: 16, room: "main_hall", why: "D-06 main hall <-> grand staircase; the blueprint names the link but gives no coordinate" },
    ],
  },

  MAP_030_Manor_Upper_Floor: {
    mapKey: "MAP_030_Manor_Upper_Floor",
    mapId: 30, width: 44, height: 32, tilesetId: 4,
    displayName: "Второй этаж",
    // The maids' wing is one hall containing six rooms, so the wing is carved
    // first and each maid's room after it. Evelyn's room nests in the guest wing.
    order: [
      "maids_wing", "maid_linda", "maid_celeste", "maid_vera",
      "maid_beatrice", "maid_nika", "maid_agnes",
      "service_corridor_up", "linen_closet", "service_stair_up",
      "secret_upper_entry",
      "upper_landing", "hero_bedroom", "guest_rooms", "evelyn_room",
    ],
    floors: {
      maids_wing: "FLOOR_WOOD",
      maid_linda: "FLOOR_WOOD", maid_celeste: "FLOOR_WOOD", maid_vera: "FLOOR_WOOD",
      maid_beatrice: "FLOOR_WOOD", maid_nika: "FLOOR_WOOD", maid_agnes: "FLOOR_WOOD",
      service_corridor_up: "FLOOR_STONE",
      linen_closet: "FLOOR_TILE",
      service_stair_up: "FLOOR_STONE",
      secret_upper_entry: "FLOOR_STONE",
      upper_landing: "FLOOR_CARPET",
      hero_bedroom: "FLOOR_WOOD",
      guest_rooms: "FLOOR_CARPET",
      evelyn_room: "FLOOR_CARPET",
    },
    // Private rooms keep their own walls: the wing corridor is carved AROUND
    // them, so each is entered only through its door. Without this the six
    // maids' rooms are open on the sides they share with the corridor and their
    // doors are decoration -- and a maid's room that anyone can walk into from
    // three sides is not a place where anything can be hidden.
    nested: {
      maids_wing: ["maid_linda", "maid_celeste", "maid_vera",
                   "maid_beatrice", "maid_nika", "maid_agnes"],
      guest_rooms: ["evelyn_room"],
      service_corridor_up: ["linen_closet"],
    },
    // D-22: with the private rooms keeping their walls, the maids' wing turns out
    // to have NO corridor at all across y=4..8 and y=10..15 -- the three rooms in
    // each row sit wall-to-wall and reach the wing's own east edge. The only
    // circulation is the open band at y=9 between the two rows. Three doors were
    // drawn on walls that face another bedroom or the outer wall rather than that
    // band, so they could not open:
    //   maid_linda (8,6)    east wall -> faces Celeste's west wall
    //   maid_beatrice (8,12) east wall -> faces Nika's west wall
    //   maids_wing (21,10)  meets Agnes's east wall, not the corridor
    // Each moves to the wall that actually faces the circulation band. Celeste,
    // Vera, Nika and Agnes were already correct and are untouched.
    supersededDoors: {
      "maid_linda:8,6": "east wall faces Celeste's room, not a corridor. Superseded by D-22.",
      "maid_beatrice:8,12": "east wall faces Nika's room, not a corridor. Superseded by D-22.",
      "maids_wing:21,10": "meets Agnes's east wall; the wing's circulation band is y=9. Superseded by D-22.",
    },
    // D-20a: the service corridor and the formal landing never meet. Every other
    // link on this floor is tabulated -- bedroom, guest wing, each maid's room,
    // the linen closet, the stairs -- but the two halves of the floor are joined
    // by nothing, leaving the landing, the master bedroom, the guest wing and
    // Evelyn's room sealed off from the only staircase that reaches them.
    // Their rectangles do overlap in x over 22..28; the door goes on that overlap.
    repairDoors: [
      { x: 24, y: 17, room: "service_corridor_up", why: "D-20a service corridor <-> upper landing; without it the whole formal half of the floor is unreachable" },
      { x: 6,  y: 8,  room: "maid_linda",    why: "D-22 Linda's door onto the y=9 circulation band" },
      { x: 6,  y: 10, room: "maid_beatrice", why: "D-22 Beatrice's door onto the y=9 circulation band" },
      { x: 21, y: 9,  room: "maids_wing",    why: "D-22 maids' wing <-> service corridor, on the band that actually reaches the corridor" },
    ],
  },

  MAP_040_Manor_Basement: {
    mapKey: "MAP_040_Manor_Basement",
    mapId: 40, width: 36, height: 26, tilesetId: 3,
    displayName: "Подвал",
    order: ["basement_main", "basement_entry", "wine_store", "underground_store", "closed_passage"],
    floors: {
      basement_entry: "FLOOR_STONE",
      basement_main: "FLOOR_STONE",
      wine_store: "FLOOR_STONE",
      underground_store: "FLOOR_STONE",
      closed_passage: "FLOOR_STONE",
    },
    // D-18: the wine store's door is given at (12,18), but the main basement's
    // rectangle is (13,5)-(29,16) so its interior ends at y=15 -- at y=18 there is
    // nothing east of the wine store but fill, and the nearest floor is the closed
    // passage four cells away. The two rooms DO touch: the wine store's east wall
    // is x=12, the main basement's west wall x=13, and they overlap in y over
    // 14..16. The door moves up to that overlap; neither rectangle changes.
    supersededDoors: {
      "wine_store:12,18": "main basement interior ends at y=15; nothing reachable east at y=18. Superseded by D-18.",
    },
    repairDoors: [
      { x: 12, y: 15, room: "wine_store", why: "D-18 wine store <-> main basement, on the wall the two rooms actually share" },
    ],
  },

  MAP_050_Chapel: {
    mapKey: "MAP_050_Chapel",
    mapId: 50, width: 24, height: 20, tilesetId: 4,
    displayName: "Часовня",
    order: ["chapel_main", "chapel_altar", "sacristy", "chapel_porch", "sacristy_niche"],
    floors: {
      chapel_main: "FLOOR_STONE",
      chapel_altar: "FLOOR_CARPET",
      sacristy: "FLOOR_WOOD",
      chapel_porch: "FLOOR_STONE",
      sacristy_niche: "FLOOR_STONE",
    },
    // D-19: 09_Doors_Transfers puts the chapel's exterior entrance at (12,18) and
    // its secret panel at (22,10). Neither cell is inside any blueprint rectangle:
    // chapel_main is (3,3)-(20,16) so its interior stops at y=15, and the sacristy
    // (20,2)-(23,8) stops at y=7. Both transfer points would have been unreachable
    // fill. The blueprint lists the doors, so the spaces they open into are implied
    // but untabulated; they are added here rather than by moving any rectangle.
    extraRooms: {
      chapel_porch: {
        name: "Паперть", x1: 10, y1: 16, x2: 14, y2: 19,
        why: "porch outside the south wall so the exterior entrance at (12,18) is standable",
        doors: [{ label: "в зал", x: 12, y: 16, kind: "door" }],
      },
      sacristy_niche: {
        name: "Ниша ризницы", x1: 20, y1: 8, x2: 23, y2: 11,
        why: "stair niche below the sacristy so the secret panel at (22,10) is standable",
        doors: [{ label: "из ризницы", x: 22, y: 8, kind: "door" }],
      },
    },
    supersededDoors: {
      "chapel_main:12,18": "handled by the chapel_porch extra room (D-19); the porch owns this cell",
      "chapel_main:22,10": "handled by the sacristy_niche extra room (D-19)",
    },
    repairDoors: [],
  },

  // Wall height 1 throughout: a passage cut through rock, not a built room.
  MAP_060_Secret_Passage: {
    mapKey: "MAP_060_Secret_Passage",
    mapId: 60, width: 34, height: 18, tilesetId: 3,
    displayName: "",
    // The dead branches are the widest rectangle and would swallow the cache and
    // the store branch, so they are carved FIRST and the real spaces after.
    order: [
      "passage_dead_branches", "passage_central",
      "passage_library_branch", "passage_upper_branch", "passage_chapel_branch",
      "passage_store_branch", "eleanor_cache",
    ],
    floors: {
      passage_central: "FLOOR_STONE",
      passage_library_branch: "FLOOR_STONE",
      passage_upper_branch: "FLOOR_STONE",
      passage_chapel_branch: "FLOOR_STONE",
      passage_store_branch: "FLOOR_STONE",
      eleanor_cache: "FLOOR_STONE",
      passage_dead_branches: "FLOOR_STONE",
    },
    // D-23: the central passage's rectangle (2,8)-(31,10) leaves an interior
    // exactly ONE tile deep -- the whole spine of the secret system is a single
    // row. 18_NPC_Schedules sends a maid into it, and one person standing in a
    // one-tile corridor severs the passage completely; so does the player meeting
    // anyone at all. Deepened by one row. It is still a crawlspace, but it is a
    // passage two people can pass in rather than a pipe.
    rectOverrides: {
      passage_central: { x1: 2, y1: 8, x2: 31, y2: 11 },
    },
    supersededDoors: {},
    // D-20b: every branch tabulates its EXIT to another map, but none tabulates
    // its junction with the central passage it branches from. Taken literally the
    // passage is four disconnected stubs: you could enter a branch from the
    // library and never reach the rest of the system. Each junction is a single
    // cell in the wall line the branch and the passage already share.
    repairDoors: [
      { x: 4,  y: 8,  room: "passage_library_branch", why: "D-20b library branch <-> central passage" },
      { x: 12, y: 8,  room: "passage_upper_branch",   why: "D-20b upper branch <-> central passage" },
      { x: 29, y: 8,  room: "passage_chapel_branch",  why: "D-20b chapel branch <-> central passage" },
      { x: 21, y: 10, room: "passage_store_branch",   why: "D-20b central passage <-> store branch and the cache beyond it" },
    ],
  },
};
