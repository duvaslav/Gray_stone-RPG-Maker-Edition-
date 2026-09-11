"use strict";
// NPC schedules and the singleton guarantee.
//
// THE RULE (project brief section 13): for one NPC, in one day+block, AT MOST
// ONE visible physical instance. Zero is fine (the NPC is off-map). Two or more
// is a Critical defect: the player sees the same person twice, and an inactive
// instance that still holds collision blocks a cell invisibly.
//
// WHY PER-INSTANCE SWITCHES
// 19_NPC_Map_Instances specifies each instance's activation as
// "V_NPC_Location_<npc> = <room>". MZ native page conditions cannot express
// variable EQUALITY -- they offer only "variable >= constant" -- and a >=
// condition would activate every instance whose room enum is lower too, which
// is exactly the two-copies bug.
//
// So each instance gets its own switch. CE_009 turns ALL of an NPC's instance
// switches off, then turns AT MOST ONE back on. The singleton property is
// structural, not a thing to remember.
const { table, num } = require("../lib/spec");
const { CmdList, page, event, DIR } = require("../lib/mz");

const BLOCK_NAME = { Dawn: 1, Morning: 2, Afternoon: 3, Evening: 4, Night: 5 };
const INSTANCE_SWITCH_BASE = 1000;   // clear of the workbook's ranges (max 905)

function parseDays(spec) {
  const s = String(spec).trim();
  const m = s.match(/^(\d+)\s*[–—-]\s*(\d+)$/);
  if (m) {
    const out = [];
    for (let d = Number(m[1]); d <= Number(m[2]); d++) out.push(d);
    return out;
  }
  const n = num(s, 0);
  return n ? [n] : [];
}

function schedules() {
  return table("18_NPC_Schedules")
    .map((r) => ({
      id: r.schedule_id,
      npc: r.npc_id,
      days: parseDays(r["дни"]),
      block: BLOCK_NAME[String(r["временной блок"]).trim()] || 0,
      location: String(r.location_id || "").trim(),
      mapKey: String(r.map_key || "").trim(),
    }))
    .filter((s) => s.npc && s.block && s.location && s.days.length);
}

function instances() {
  return table("19_NPC_Map_Instances")
    .map((r) => {
      const m = String(r.event_name).match(/^EV_NPC_(.+?)_(.+)$/);
      if (!m) return null;
      return {
        eventName: r.event_name,
        npc: m[1],
        location: m[2],
        mapKey: r.map_key,
        x: num(r.x), y: num(r.y),
      };
    })
    .filter(Boolean);
}

// D-12: 19_NPC_Map_Instances gives ONE anchor coordinate per ROOM, not per
// (npc, room). Every NPC scheduled into the same room therefore stands on the
// identical tile. Across the ten days and five blocks that is 90 (day, block,
// cell) occurrences where two or three different people occupy one cell -- on
// the upper floor at night, three at once.
//
// Two blocking events on one cell do not merge: both exist, one is drawn over
// the other, the cell is blocked, and the player can only ever talk to whichever
// has the lower event id. The other person is in the room but unreachable.
//
// spreadAnchors() keeps the first instance on the blueprint anchor and moves the
// rest to the nearest free floor cell IN THE SAME ROOM, skipping furniture, door
// corridors and cells already taken. Deterministic (sorted input, fixed search
// order) so coordinates are stable across rebuilds. Rooms are not rearranged and
// no anchor moves between rooms.
function spreadAnchors(list, ctx) {
  const taken = new Set();
  const moved = [];
  // Search outward in a fixed ring order: adjacent first, then diagonals, then
  // one further out. A servant standing beside the anchor still reads as being
  // "at" the fireplace or the table the anchor represents.
  const RING = [
    [0, 0],
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [-1, 1], [1, -1], [-1, -1],
    [2, 0], [-2, 0], [0, 2], [0, -2],
    [2, 1], [-2, 1], [2, -1], [-2, -1], [1, 2], [-1, 2], [1, -2], [-1, -2],
  ];

  const usable = (x, y, room) => {
    if (ctx.floorOf[`${x},${y}`] !== room) return false;      // same room only
    if (taken.has(`${x},${y}`)) return false;
    if (ctx.protectedCells && ctx.protectedCells.has(`${x},${y}`)) return false;
    if (ctx.reserved && ctx.reserved.has(`${x},${y}`)) return false;
    if (ctx.blockedByFurniture && ctx.blockedByFurniture.has(`${x},${y}`)) return false;
    return true;
  };

  for (const inst of list) {
    const room = ctx.floorOf[`${inst.x},${inst.y}`];
    if (!room) continue;                 // not on this map's floor; left as-is
    let placed = false;
    for (const [dx, dy] of RING) {
      const x = inst.x + dx, y = inst.y + dy;
      if (!usable(x, y, room)) continue;
      if (dx || dy) moved.push({ eventName: inst.eventName, from: [inst.x, inst.y], to: [x, y], room });
      inst.x = x; inst.y = y;
      taken.add(`${x},${y}`);
      placed = true;
      break;
    }
    if (!placed) {
      throw new Error(`no free cell near the ${room} anchor for ${inst.eventName}`);
    }
  }
  return moved;
}

// Allocate one switch per instance, deterministically ordered so IDs are stable
// across rebuilds.
function allocateSwitches() {
  const list = instances().slice().sort((a, b) =>
    a.npc.localeCompare(b.npc) || a.location.localeCompare(b.location) || a.mapKey.localeCompare(b.mapKey));
  const alloc = {};
  list.forEach((inst, i) => {
    alloc[inst.eventName] = {
      id: INSTANCE_SWITCH_BASE + i,
      name: `S_${INSTANCE_SWITCH_BASE + i}_NPCInst_${inst.npc}_${inst.location}`,
      inst,
    };
  });
  return alloc;
}

// Where is each NPC, for a given day and block? The winning schedule row.
function resolve(day, block) {
  const out = {};
  for (const s of schedules()) {
    if (s.block !== block) continue;
    if (!s.days.includes(day)) continue;
    out[s.npc] = { location: s.location, mapKey: s.mapKey };
  }
  return out;
}

// Generate CE_009. Clear-then-set is what makes the singleton structural.
function buildRefreshSchedules(reg) {
  const { S, V } = reg;
  const alloc = allocateSwitches();
  const byNpc = {};
  for (const a of Object.values(alloc)) (byNpc[a.inst.npc] = byNpc[a.inst.npc] || []).push(a);

  const c = new CmdList();
  c.comment([
    "CE_009 Refresh NPC schedules.",
    "",
    "For every NPC: turn OFF every one of its instance switches, then turn AT",
    "MOST ONE back on. Clearing first is what makes 'at most one visible",
    "instance' structural rather than something to remember -- re-entering this",
    "event, or entering it from a half-applied state, still leaves one.",
    "",
    "Generated by tools/build/50-npc-schedules.js -- do not hand-edit.",
  ].join("\n"));

  const allNpcs = Object.keys(byNpc).sort();
  for (const npc of allNpcs) {
    const locVar = Object.keys(reg.variables.byName).find((n) => n === `V_0${""}`.length ? false : n.endsWith(`_NPC_Location_${npc}`));
    c.comment(`-- ${npc}: ${byNpc[npc].length} instance(s)`);
    for (const a of byNpc[npc]) c.switchOff(S(a.name));

    // Off-map by default; a matching schedule row overrides it below.
    if (locVar) c.varSet(V(locVar), 0);

    const rows = schedules().filter((s) => s.npc === npc);
    // Group identical (block, location) pairs across day ranges.
    const seen = new Set();
    for (const row of rows) {
      for (const day of row.days) {
        const key = `${day}:${row.block}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const target = byNpc[npc].find((a) => a.inst.location === row.location);
        if (!target) continue;
        c.ifVar(V("V_0001_Current_Day"), day, 0);
          c.ifVar(V("V_0004_Time_Block"), row.block, 0);
            c.switchOn(S(target.name));
            if (locVar) c.varSet(V(locVar), roomEnum(row.location));
          c.endIf();
        c.endIf();
      }
    }
    const validSw = Object.keys(reg.switches.byName).find((n) => n.endsWith(`_NPC_${npc}_Schedule_Valid`));
    if (validSw) c.switchOn(S(validSw));
  }

  return { list: c.done(), alloc, npcCount: allNpcs.length };
}

// Stable numeric enum per room name, for the location variables. The variables
// are for scripts and debug; the instance switches drive the pages.
const ROOM_ENUM = {};
function roomEnum(name) {
  if (!ROOM_ENUM[name]) ROOM_ENUM[name] = Object.keys(ROOM_ENUM).length + 1;
  return ROOM_ENUM[name];
}

// Build the instance events for one map.
function buildInstanceEvents(reg, mapKey, alloc, ctx) {
  const { S, V } = reg;
  const NPC_SPRITE = {};
  for (const r of table("17_NPC_Visuals")) {
    NPC_SPRITE[r.npc_id] = { file: (r.character_file || "People1").trim(), index: num(r.face_index, 0) };
  }
  const NPC_NAME = {};
  for (const r of table("16_NPC_Registry")) NPC_NAME[r.npc_id] = r["имя"];

  const events = [];
  for (const a of Object.values(alloc)) {
    if (a.inst.mapKey !== mapKey) continue;
    const { npc, location, x, y, eventName } = a.inst;
    const sprite = NPC_SPRITE[npc] || { file: "People1", index: 0 };

    const c = new CmdList();
    c.comment(`PAT_NPC_INSTANCE ${npc} @ ${location}. Talking costs no AP and no minutes.`);
    c.varSet(V("V_0025_Current_NPC_ID"), 1);
    c.callCommon(17);                       // repeat-dialogue selector
    c.varSet(V("V_0025_Current_NPC_ID"), 0);

    events.push(event({
      name: eventName, x, y,
      note: `<npc:${npc}><room:${location}>`,
      pages: [
        // Page 1 is the INACTIVE state: no graphic, no collision, through on.
        // An inactive instance that kept its collision would block a cell
        // invisibly -- the exact failure the brief calls out.
        page({
          trigger: 0, priorityType: 0, through: true, walkAnime: false,
          image: { characterName: "", characterIndex: 0, direction: DIR.DOWN, pattern: 1 },
          list: [{ code: 0, indent: 0, parameters: [] }],
        }),
        // Page 2 is the ACTIVE state, gated on this instance's own switch.
        page({
          trigger: 0, priorityType: 1, walkAnime: true,
          conditions: { switch1Valid: true, switch1Id: S(a.name) },
          image: { characterName: sprite.file, characterIndex: sprite.index, direction: DIR.DOWN, pattern: 1 },
          list: c.done(),
        }),
      ],
    }));
  }
  return events;
}

module.exports = { schedules, instances, allocateSwitches, spreadAnchors, resolve, buildRefreshSchedules, buildInstanceEvents, INSTANCE_SWITCH_BASE, BLOCK_NAME };
