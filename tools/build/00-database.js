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
function tilesetEntry(id, name, sheets, flags, mode = 1) {
  return { id, name, mode, note: "", tilesetNames: sheets, flags };
}

function buildTilesets() {
  const empty = new Array(8192).fill(0);
  const list = [null];
  // Slots 1..5 keep the standard NewData ordering so a hydrated project lines up.
  list[1] = tilesetEntry(1, "Overworld", ["World_A1", "World_A2", "", "", "", "World_B", "World_C", "", ""], empty.slice(), 0);
  list[2] = tilesetEntry(2, "Outside", ["Outside_A1", "Outside_A2", "Outside_A3", "Outside_A4", "Outside_A5", "Outside_B", "Outside_C", "", ""], tiles.buildFlags("outside"));
  list[3] = tilesetEntry(3, "Dungeon", ["Dungeon_A1", "Dungeon_A2", "Dungeon_A3", "Dungeon_A4", "Dungeon_A5", "Dungeon_B", "Dungeon_C", "", ""], tiles.buildFlags("inside"));
  list[4] = tilesetEntry(4, "Inside", ["Inside_A1", "Inside_A2", "", "Inside_A4", "Inside_A5", "Inside_B", "Inside_C", "", ""], tiles.buildFlags("inside"));
  list[5] = tilesetEntry(5, "Interior", ["Inside_A1", "Inside_A2", "", "Inside_A4", "Inside_A5", "Inside_B", "Inside_C", "", ""], tiles.buildFlags("inside"));
  return list;
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

module.exports = { write, buildSwitches, buildVariables, buildItems, buildTilesets, buildActors, buildClasses, DATA, ROOT };
