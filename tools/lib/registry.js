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

  for (const r of table("04_Switches")) {
    const id = num(r["switch_id"]), n = (r["имя"] || "").trim();
    if (id && n) put(sw, id, n);
  }
  for (const r of table("05_Variables_Enums")) {
    const id = num(r["variable_id"]), n = (r["имя"] || "").trim();
    if (id && n) { put(vr, id, n); vr.init[id] = num(r["начальное значение"], 0); }
  }
  for (const [id, d] of Object.entries(ext.switches)) put(sw, Number(id), d.name);
  // One switch per NPC map instance. Allocated from 1000, clear of every range
  // the workbook uses (its highest is 905), so no existing numeric ID moves.
  // These drive instance page conditions; see tools/build/50-npc-schedules.js.
  for (const [, a] of Object.entries(require("../build/50-npc-schedules").allocateSwitches())) {
    put(sw, a.id, a.name);
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
  // Day_N_Started / Day_N_Complete resolve by number.
  const dayStarted = (d) => S(`S_0${99 + d}_Day_${d}_Started`);
  const dayComplete = (d) => S(`S_0${119 + d}_Day_${d}_Complete`);

  return { switches: sw, variables: vr, S, V, dayStarted, dayComplete, extensions: ext };
}

module.exports = { build };
