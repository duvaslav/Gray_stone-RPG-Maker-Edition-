"use strict";
// Generic per-map events: map entry, transfers, search points, secret panels.
//
// Transfers come from 09_Doors_Transfers, which is the authoritative list and is
// already paired A/B. Every one is a real Transfer Player command; a route the
// story has not opened yet is GATED with the sheet's own blocked message, never
// a silent dead end and never a transfer to a map that does not exist.
const { table, num } = require("../lib/spec");
const { CmdList, page, event, DIR } = require("../lib/mz");
const tiles = require("../lib/tiles");

const MAP_ID = {
  MAP_005_Prologue_Front_Drive: 5,
  MAP_010_Estate_Exterior: 10,
  MAP_020_Manor_Ground_Floor: 20,
  MAP_030_Manor_Upper_Floor: 30,
  MAP_040_Manor_Basement: 40,
  MAP_050_Chapel: 50,
  MAP_060_Secret_Passage: 60,
};

const DIRECTION = { Up: DIR.UP, Down: DIR.DOWN, Left: DIR.LEFT, Right: DIR.RIGHT, Retain: 0, "": 0 };

// D-21: two transfer conditions name a switch that does not exist, and in both
// cases the NUMBER is wrong while the NAME is meaningful, so the name decides.
//   S_0104_Chapel_Access -- 0104 is S_0104_Day_5_Started, a day flag. The chapel
//                           access switch the registry defines is S_0209.
//   S_0703_Lockdown      -- 0703 is S_0703_flag_leonard_secured. The lockdown
//                           flag is S_0704_flag_lockdown.
const CONDITION_FIXUPS = {
  S_0104_Chapel_Access: "S_0209_Chapel_Access",
  S_0703_Lockdown: "S_0704_flag_lockdown",
};

// "S_0205_Panel_Unlocked = ON OR S_0208_Underground_Access = ON" -> [205, 208]
// Any of the listed switches opens the route (OR semantics).
function parseCondition(reg, raw) {
  const text = String(raw || "").trim();
  if (!text || text.toLowerCase() === "true") return { switches: [], always: true };
  const out = [];
  for (const m of text.matchAll(/(S_\d+_\w+)\s*=\s*ON/gi)) {
    const name = CONDITION_FIXUPS[m[1]] || m[1];
    let id = reg.switches.byName[name];
    if (id === undefined) {
      // Tolerate a renumbered prefix by matching the descriptive tail.
      const tail = name.replace(/^S_\d+_/, "").toLowerCase();
      const alt = Object.keys(reg.switches.byName).find((n) => n.toLowerCase().endsWith("_" + tail));
      if (alt) id = reg.switches.byName[alt];
    }
    if (id === undefined) throw new Error(`transfer condition references unknown switch: ${m[1]}`);
    out.push(id);
  }
  return { switches: out, always: out.length === 0 };
}

function transfersFrom(mapKey) {
  return table("09_Doors_Transfers")
    .filter((r) => r["исходная карта"] === mapKey)
    .map((r) => ({
      id: r.transfer_id,
      x: num(r.x), y: num(r.y),
      targetKey: r["целевая карта"],
      targetId: MAP_ID[r["целевая карта"]],
      tx: num(r.target_x), ty: num(r.target_y),
      facing: DIRECTION[String(r["направление после переноса"]).trim()] || 0,
      kind: r["тип объекта"],
      condition: r["условие доступа"],
      blockedMessage: String(r["сообщение при блокировке"] || "").trim(),
    }))
    .filter((t) => t.targetId);
}

function searchPointsFor(mapKey) {
  return table("24_Search_Points")
    .filter((r) => r.map_key === mapKey)
    .map((r) => ({
      id: r.poi_id, x: num(r.x), y: num(r.y), eventKey: r.event_key,
      ap: num(r["стоимость ОД"], 1), minutes: num(r["стоимость минут"], 30),
      condition: String(r["условие"] || "true").trim(),
    }));
}

function cluesForPoi(poiId) {
  return table("25_Clue_Logic")
    .filter((r) => String(r["физический источник"]).includes(poiId))
    .map((r) => ({ clueId: r.clue_id, itemId: num(r.item_id), scope: String(r.culprit_scope || "Universal").trim() }))
    .filter((c) => c.itemId > 0);
}

const CULPRIT_SWITCH = {
  linda: "S_0020_Version_Linda", celeste: "S_0021_Version_Celeste",
  vera: "S_0022_Version_Vera", beatrice: "S_0023_Version_Beatrice",
  nika: "S_0024_Version_Nika", agnes: "S_0025_Version_Agnes",
};

// Runtime branch for a workbook condition string. Native page conditions cannot
// express these, but a Conditional Branch inside the page can.
function openConditionBranch(c, reg, cond) {
  const m = cond.match(/^day\s*>=\s*(\d+)$/i);
  if (m) { c.ifVar(reg.V("V_0001_Current_Day"), Number(m[1]), 1); return true; }
  const f = cond.match(/^(\w+)\s*=\s*true$/i);
  if (f) {
    const name = Object.keys(reg.switches.byName)
      .find((n) => n.toLowerCase().includes(f[1].toLowerCase()));
    if (name) { c.ifSwitch(reg.S(name)); return true; }
  }
  return false;
}

function build(reg, { mapKey, mapId, ctx, poiText = {}, poiTile = {}, poiFloorLevel = null }) {
  const { S, V } = reg;
  const B = (k) => tiles.resolve("inside", k).id;
  const events = [];
  const reserved = new Set();
  let nextId = 1;
  const add = (e) => { e.id = nextId++; events.push(e); return e; };

  // --- map entry ------------------------------------------------------------
  {
    const c = new CmdList();
    c.comment("PAT_MAP_ENTER. Re-armed by GrayStone_Core on every Game_Map.setup.");
    c.switchOff(S("S_0017_Map_Entry_Pending"));
    c.callCommon(24);
    c.exitEvent();
    // Corner cell, but never on floor the player uses.
    add(event({
      name: "EV_MAP_ENTER", x: 0, y: 0,
      pages: [page({
        trigger: 3, priorityType: 0, through: true, walkAnime: false, directionFix: true,
        conditions: { switch1Valid: true, switch1Id: S("S_0017_Map_Entry_Pending") },
        list: c.done(),
      })],
    }));
  }

  // --- doors and transfers --------------------------------------------------
  // 09_Doors_Transfers models an ordinary interior doorway as a "transfer" of one
  // tile. 54 of its 74 rows are same-map pairs like (15,23) -> (14,23): stepping
  // through a door. The interior builder already carves those doorways, so
  // teleporting the player one tile would be a no-op at best.
  //
  // So a same-map row becomes a Transfer only if it is genuinely GATED: then it
  // is a locked door that blocks the opening until its switch is on. An ungated
  // same-map row is just a doorway and needs no event at all.
  for (const t of transfersFrom(mapKey)) {
    const cond = parseCondition(reg, t.condition);
    const sameMap = t.targetId === mapId;

    if (sameMap && cond.always) continue;            // an open doorway: already walkable

    if (sameMap) {
      // Locked door. Page 1 blocks the opening and says why; page 2 appears once
      // any of the switches is on, with no graphic and no collision.
      const c = new CmdList();
      c.comment(`PAT_DOOR ${t.id} (locked). ${t.kind}. Opens on: ${cond.switches.join(" or ")}.`);
      c.text([t.blockedMessage || "Заперто."], { background: 1 });
      const pages = [
        page({ trigger: 0, priorityType: 1, directionFix: true, walkAnime: false, list: c.done() }),
      ];
      // One page per opening switch: MZ page conditions are AND, so OR needs a
      // page each. All of them are empty and passable.
      for (const sw of cond.switches) {
        pages.push(page({
          trigger: 0, priorityType: 0, through: true, directionFix: true, walkAnime: false,
          conditions: { switch1Valid: true, switch1Id: sw },
          list: [{ code: 0, indent: 0, parameters: [] }],
        }));
      }
      add(event({
        name: `EV_DOOR_${t.id}`, x: t.x, y: t.y,
        note: `<locked_door:${t.id}>`,
        pages,
      }));
      reserved.add(`${t.x},${t.y}`);
      continue;
    }

    // A real transfer to another map.
    const c = new CmdList();
    c.comment(`PAT_DOOR ${t.id} -> ${t.targetKey} (${t.tx},${t.ty}). ${t.kind}.`);
    if (!cond.always) {
      c.varSet(V("V_0034_Temp_Scratch_A"), 0);
      for (const sw of cond.switches) {
        c.ifSwitch(sw);
          c.varSet(V("V_0034_Temp_Scratch_A"), 1);
        c.endIf();
      }
      c.ifVar(V("V_0034_Temp_Scratch_A"), 0, 0);
        c.text([t.blockedMessage || "Заперто."], { background: 1 });
        c.exitEvent();
      c.endIf();
      c.varSet(V("V_0034_Temp_Scratch_A"), 0);
    }
    // Moving between places costs minutes but never AP (RULE_TRAVEL).
    c.varSet(V("V_0021_Action_Minutes"), 5);
    c.varSet(V("V_0022_Action_AP_Cost"), 0);
    c.callCommon(6);
    c.switchOn(S("S_0017_Map_Entry_Pending"));
    c.transfer(t.targetId, t.tx, t.ty, t.facing, 0);
    add(event({
      name: `EV_TR_${t.id}`, x: t.x, y: t.y,
      note: `<transfer:${t.id}><to:${t.targetKey}>`,
      pages: [page({ trigger: 0, priorityType: 0, through: true, directionFix: true, walkAnime: false, list: c.done() })],
    }));
    reserved.add(`${t.x},${t.y}`);
  }

  // --- search points --------------------------------------------------------
  for (const p of searchPointsFor(mapKey)) {
    if (ctx && !ctx.floorOf[`${p.x},${p.y}`]) continue;   // not on this map's floor
    reserved.add(`${p.x},${p.y}`);
    const text = poiText[p.id] || {
      first: ["Вы осматриваете это внимательно."],
      again: ["Вы уже осматривали это."],
    };
    const tile = B(poiTile[p.id] || "CABINET");

    const c = new CmdList();
    c.comment(`PAT_SEARCH ${p.id}. Costs ${p.ap} AP / ${p.minutes} min exactly once.`);
    const gated = openConditionBranch(c, reg, p.condition);
    c.text(text.first, { background: 0 });
    for (const y of cluesForPoi(p.id)) {
      const gate = CULPRIT_SWITCH[y.scope.toLowerCase()];
      if (gate) {
        c.comment(`${y.clueId} exists only in the ${y.scope} version.`);
        c.ifSwitch(S(gate));
          c.varSet(V("V_0023_Clue_Item_ID_Input"), y.itemId);
          c.callCommon(12);
        c.endIf();
      } else {
        c.varSet(V("V_0023_Clue_Item_ID_Input"), y.itemId);
        c.callCommon(12);
      }
    }
    c.varSet(V("V_0021_Action_Minutes"), p.minutes);
    c.varSet(V("V_0022_Action_AP_Cost"), p.ap);
    c.callCommon(7);
    c.selfSwitch("A", true);
    c.switchOn(S("S_0003_Derived_States_Dirty"));
    if (gated) {
      c.else_();
        c.comment("Condition not met: no AP, no minutes, no self switch -- stays searchable.");
        c.text(["Сейчас здесь нечего искать."], { background: 1 });
      c.endIf();
    }

    const c2 = new CmdList();
    c2.comment("Already searched: no item, no AP, no minutes.");
    c2.text(text.again, { background: 1 });

    // A mark on the ground is laid BELOW the player and passable; an object
    // standing in the room blocks its cell like furniture.
    const onFloor = poiFloorLevel && poiFloorLevel.has(p.id);
    const prio = onFloor ? 0 : 1;
    const thru = onFloor;
    const img = { tileId: tile, characterName: "", characterIndex: 0, direction: DIR.DOWN, pattern: 1 };
    add(event({
      name: p.eventKey, x: p.x, y: p.y, note: `<poi:${p.id}>${onFloor ? "<floor_level>" : ""}`,
      pages: [
        page({ trigger: 0, priorityType: prio, through: thru, directionFix: true, walkAnime: false, image: img, list: c.done() }),
        page({ trigger: 0, priorityType: prio, through: thru, directionFix: true, walkAnime: false,
               conditions: { selfSwitchValid: true, selfSwitchCh: "A" }, image: img, list: c2.done() }),
      ],
    }));
  }

  return { events, reserved, nextId };
}

module.exports = { build, transfersFrom, searchPointsFor, MAP_ID, parseCondition };
