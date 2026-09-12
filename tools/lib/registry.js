"use strict";
// Single source of truth for switch/variable IDs.
// Merges the workbook registries with tools/data/registry-extensions.json and
// fails loudly on any name that was never allocated -- a generator can never
// silently write switch 1 because it typed a name wrong.
const { table, num } = require("./spec");
const ext = require("../data/registry-extensions.json");

function build() {
  const sw = { names: [""], byName: {} };
  const vr = { names: [""], byName: {}, init: {} };

  const put = (bag, id, name) => {
    while (bag.names.length <= id) bag.names.push("");
    if (bag.names[id] && bag.names[id] !== name) {
      throw new Error(`id ${id} already held by ${bag.names[id]}, cannot assign ${name}`);
    }
    if (bag.byName[name] !== undefined && bag.byName[name] !== id) {
      throw new Error(`name ${name} already at id ${bag.byName[name]}, cannot assign ${id}`);
    }
    bag.names[id] = name;
    bag.byName[name] = id;
  };

  // Every registry row also carries a canonical_id -- the short name the design
  // sheets use ("flag_archive_access", "Trust_roland"). Dialogue and transfer
  // rows reference those, not the S_0203_ form, so both are indexed.
  sw.byCanonical = {};
  vr.byCanonical = {};
  for (const r of table("04_Switches")) {
    const id = num(r["switch_id"]), n = (r["имя"] || "").trim();
    if (id && n) put(sw, id, n);
    const c = (r["canonical_id"] || "").trim();
    if (id && c) sw.byCanonical[c] = id;
  }
  for (const r of table("05_Variables_Enums")) {
    const id = num(r["variable_id"]), n = (r["имя"] || "").trim();
    if (id && n) { put(vr, id, n); vr.init[id] = num(r["начальное значение"], 0); }
    const c = (r["canonical_id"] || "").trim();
    if (id && c) vr.byCanonical[c] = id;
  }
  for (const [id, d] of Object.entries(ext.switches)) put(sw, Number(id), d.name);
  // One switch per NPC map instance. Allocated from 1000, clear of every range
  // the workbook uses (its highest is 905), so no existing numeric ID moves.
  // These drive instance page conditions; see tools/build/50-npc-schedules.js.
  for (const [, a] of Object.entries(require("../build/50-npc-schedules").allocateSwitches())) {
    put(sw, a.id, a.name);
  }
  // One replay guard per dialogue scene. 53_Dialogue_Event_Commands sets these
  // by name but the workbook never allocates them; from 1100, clear of the NPC
  // instance block.
  {
    const dlg = require("../build/80-dialogue").allocate();
    for (const key of dlg.keys) {
      put(sw, dlg.switchId[key], dlg.switchName[key]);
      sw.byCanonical[dlg.sheetName[key]] = dlg.switchId[key];
    }
  }
  for (const [id, d] of Object.entries(ext.variables)) {
    put(vr, Number(id), d.name);
    vr.init[Number(id)] = d.init || 0;
  }

  const S = (name) => {
    const id = sw.byName[name];
    if (id === undefined) throw new Error(`unregistered switch: ${name}`);
    return id;
  };
  const V = (name) => {
    const id = vr.byName[name];
    if (id === undefined) throw new Error(`unregistered variable: ${name}`);
    return id;
  };
  // Resolve a name the way the design sheets write it, in order of certainty:
  // the full registry name, the canonical id, then the reversed "npc_metric"
  // form the dialogue sheet sometimes uses for "Metric_npc", then a
  // case-insensitive tail match. `npcContext` supplies the speaker for a bare
  // metric like "respect" inside a scene about one character.
  const resolve = (bag, name, npcContext) => {
    if (bag.byName[name] !== undefined) return bag.byName[name];
    if (bag.byCanonical[name] !== undefined) return bag.byCanonical[name];
    const lower = String(name).toLowerCase();
    // "roland_trust" -> "Trust_roland"
    const parts = lower.split("_");
    if (parts.length === 2) {
      const swapped = `${parts[1]}_${parts[0]}`;
      for (const key of Object.keys(bag.byCanonical)) {
        if (key.toLowerCase() === swapped) return bag.byCanonical[key];
      }
    }
    // a bare metric inside a scene about one character: "respect" -> "Respect_linda"
    if (npcContext) {
      const qualified = `${lower}_${npcContext.toLowerCase()}`;
      for (const key of Object.keys(bag.byCanonical)) {
        if (key.toLowerCase() === qualified) return bag.byCanonical[key];
      }
    }
    for (const key of Object.keys(bag.byName)) {
      if (key.toLowerCase().endsWith("_" + lower)) return bag.byName[key];
    }
    return undefined;
  };
  const resolveSwitch = (name, npc) => resolve(sw, name, npc);
  const resolveVariable = (name, npc) => resolve(vr, name, npc);

  // Day_N_Started / Day_N_Complete resolve by number.
  const dayStarted = (d) => S(`S_0${99 + d}_Day_${d}_Started`);
  const dayComplete = (d) => S(`S_0${119 + d}_Day_${d}_Complete`);

  return { switches: sw, variables: vr, S, V, resolveSwitch, resolveVariable, dayStarted, dayComplete, extensions: ext };
}

module.exports = { build };
