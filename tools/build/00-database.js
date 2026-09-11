"use strict";
// Generates the Gray Stone database layer of data/ from spec/.
// Everything here is authored project data. No RPG Maker Company Asset is
// copied, created or embedded -- only filenames are referenced.
const fs = require("fs");
const path = require("path");
const { table, num, id4 } = require("../lib/spec");
const tiles = require("../lib/tiles");

const ROOT = path.join(__dirname, "..", "..");
const DATA = path.join(ROOT, "data");

// The editor writes JSON on one line; match it so the first editor save does
// not reformat every file into a noise diff.
function write(name, obj) {
  fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(path.join(DATA, name), JSON.stringify(obj));
  return obj;
}

// --- switches & variables --------------------------------------------------
function buildSwitches() {
  const rows = table("04_Switches");
  const names = [""];
  const registry = {};
  for (const r of rows) {
    const id = num(r["switch_id"]);
    const name = r["имя"].trim();
    if (!id || !name) continue;
    while (names.length <= id) names.push("");
    if (names[id]) throw new Error(`duplicate switch id ${id}: ${names[id]} vs ${name}`);
    names[id] = name;
    registry[name] = id;
  }
  return { names, registry };
}

function buildVariables() {
  const rows = table("05_Variables_Enums");
  const names = [""];
  const registry = {};
  const initial = {};
  for (const r of rows) {
    const id = num(r["variable_id"]);
    const name = r["имя"].trim();
    if (!id || !name) continue;
    while (names.length <= id) names.push("");
    if (names[id]) throw new Error(`duplicate variable id ${id}: ${names[id]} vs ${name}`);
    names[id] = name;
    registry[name] = id;
    initial[id] = num(r["начальное значение"], 0);
  }
  return { names, registry, initial };
}

// --- items (evidence) ------------------------------------------------------
function baseItem(id, name, description, iconIndex) {
  return {
    id, name, iconIndex, description,
    itypeId: 2,            // 2 = Key Item: evidence is never consumable
    price: 0, consumable: false, scope: 0, occasion: 3,
    speed: 0, successRate: 100, repeats: 1, tpGain: 0, hitType: 0,
    animationId: 0,
    damage: { critical: false, elementId: 0, formula: "0", type: 0, variance: 20 },
    effects: [], note: "",
  };
}

function buildItems() {
  const rows = table("23_Evidence_Items");
  const items = [null];
  const registry = {};
  for (const r of rows) {
    const id = num(r["item_id RPG Maker"]);
    const key = (r["canonical clue_id"] || "").trim();
    const name = (r["название"] || "").trim();
    if (!id || !key) continue;
    while (items.length <= id) items.push(null);
    if (items[id]) throw new Error(`duplicate item id ${id}`);
    const short = (r["короткое описание"] || "").trim();
    // IconSet indices belong to a Company Asset we cannot inspect; 83 is the
    // stock "document" slot and is corrected once assets are hydrated.
    items[id] = baseItem(id, name, short, 83);
    items[id].note = `<clue_id:${key}>`;
    registry[key] = id;
  }
  return { items, registry };
}

// --- tilesets --------------------------------------------------------------
function tilesetEntry(id, name, sheets, flags, mode = 1, note = "") {
  return { id, name, mode, note, tilesetNames: sheets, flags };
}

// Marker stamped into a tileset we authored ourselves, so a synthesized file can
// always be told apart from the stock one at a glance and by the validator.
const SYNTH_MARK = "<graystone_synthesized_flags>";

// A file we authored is detected two ways, because the marker only exists on
// files written after it was introduced:
//   1. the explicit marker, and
//   2. flag density. Our synthesized flags name only the handful of decorations
//      the bindings list, so the B-E range is almost entirely zero. A stock
//      sheet has dozens of solid tiles (trees, fences, rocks, furniture).
const STOCK_BE_FLAG_MIN = 24;

function isSynthesized(list) {
  if (!Array.isArray(list)) return true;
  if (list.some((t) => t && String(t.note || "").includes(SYNTH_MARK))) return true;
  for (const t of list) {
    if (!t || !t.flags) continue;
    const hasBSheet = (t.tilesetNames || []).slice(5).some((n) => n);
    if (!hasBSheet) continue;
    const be = t.flags.slice(0, 1024).filter((f) => f).length;
    if (be < STOCK_BE_FLAG_MIN) return true;   // far too sparse to be stock
  }
  return false;
}

// Gray Stone-specific flag overrides, applied ON TOP of the stock flags.
// Empty by design: the stock passability is authored by the engine vendor to
// match the stock art, and is authoritative. Add an entry here only with a
// stated reason, never to paper over a wrongly chosen tile.
const FLAG_OVERLAY = {
  // "2": { "1234": 0x0f },   // tilesetId: { tileId: flags }
};

// Tilesets are CONSUMED, not authored, whenever the stock file is present.
//
// This file pairs 8192 passability flags with the stock art. Regenerating it
// from our own guesses replaces the vendor's passability with ours: in practice
// that left only the handful of decorations we had named as solid and every
// other tree, fence and building tile walkable. The stock file wins; we only
// overlay deliberate, documented exceptions.
function buildTilesets(existing) {
  if (existing && !isSynthesized(existing)) {
    const out = JSON.parse(JSON.stringify(existing));
    let overlaid = 0;
    for (const [tid, tiles] of Object.entries(FLAG_OVERLAY)) {
      const t = out[Number(tid)];
      if (!t) continue;
      for (const [tileId, flag] of Object.entries(tiles)) {
        t.flags[Number(tileId)] = flag;
        overlaid++;
      }
    }
    return { list: out, source: "stock", overlaid };
  }

  // Fallback only: no stock file present (assets not hydrated). Passability is
  // derived from tools/data/tile-bindings.json so the project is internally
  // consistent and testable, but it does NOT describe the real art.
  const empty = new Array(8192).fill(0);
  const mark = SYNTH_MARK;
  const list = [null];
  list[1] = tilesetEntry(1, "Overworld", ["World_A1", "World_A2", "", "", "", "World_B", "World_C", "", ""], empty.slice(), 0, mark);
  list[2] = tilesetEntry(2, "Outside", ["Outside_A1", "Outside_A2", "Outside_A3", "Outside_A4", "Outside_A5", "Outside_B", "Outside_C", "", ""], tiles.buildFlags("outside"), 1, mark);
  list[3] = tilesetEntry(3, "Dungeon", ["Dungeon_A1", "Dungeon_A2", "Dungeon_A3", "Dungeon_A4", "Dungeon_A5", "Dungeon_B", "Dungeon_C", "", ""], tiles.buildFlags("inside"), 1, mark);
  list[4] = tilesetEntry(4, "Inside", ["Inside_A1", "Inside_A2", "", "Inside_A4", "Inside_A5", "Inside_B", "Inside_C", "", ""], tiles.buildFlags("inside"), 1, mark);
  list[5] = tilesetEntry(5, "Interior", ["Inside_A1", "Inside_A2", "", "Inside_A4", "Inside_A5", "Inside_B", "Inside_C", "", ""], tiles.buildFlags("inside"), 1, mark);
  return { list, source: "synthesized", overlaid: 0 };
}

// --- actors / classes ------------------------------------------------------
function buildActors() {
  return [null, {
    id: 1, name: "Леонард", nickname: "граф Грейстоун",
    note: "<speaker_id:leonard>",
    classId: 1, initialLevel: 1, maxLevel: 1,
    characterName: "Actor1", characterIndex: 0,
    faceName: "Actor1", faceIndex: 0,
    battlerName: "", equips: [0, 0, 0, 0, 0], profile: "Наследник Грейстоуна, вернувшийся домой спустя десять лет.",
    traits: [],
  }];
}

function buildClasses() {
  // Gray Stone has no combat; the class exists only because MZ requires the
  // party actor to have one. Flat params, no skills, no growth.
  const params = [];
  for (let i = 0; i < 8; i++) params.push(new Array(100).fill(i === 0 ? 100 : 1));
  return [null, {
    id: 1, name: "Расследователь", note: "",
    expParams: [30, 20, 30, 30], traits: [], learnings: [], params,
  }];
}

module.exports = { write, buildSwitches, buildVariables, buildItems, buildTilesets, buildActors, buildClasses, isSynthesized, SYNTH_MARK, DATA, ROOT };
