#!/usr/bin/env node
"use strict";
// Gray Stone static project validator.
//   node tools/validate/validate.js
//
// Checks the generated data/ layer for the defect classes that break an MZ
// project before it ever runs. Exits non-zero if any ERROR is found.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const DATA = path.join(ROOT, "data");

const findings = [];
const err = (code, msg, where) => findings.push({ level: "ERROR", code, msg, where });
const warn = (code, msg, where) => findings.push({ level: "WARN", code, msg, where });
const info = (code, msg, where) => findings.push({ level: "INFO", code, msg, where });

function readJson(name) {
  const f = path.join(DATA, name);
  if (!fs.existsSync(f)) return null;
  try {
    return JSON.parse(fs.readFileSync(f, "utf8"));
  } catch (e) {
    err("JSON_PARSE", `${name} is not valid JSON: ${e.message}`, name);
    return undefined;
  }
}

// Command codes that may legitimately appear; anything else is suspicious.
const KNOWN_CODES = new Set([
  0, 101, 102, 103, 104, 105, 108, 111, 112, 113, 115, 117, 118, 119, 121, 122,
  123, 124, 125, 126, 127, 128, 129, 132, 133, 134, 135, 136, 137, 138, 139,
  140, 201, 202, 203, 204, 205, 206, 211, 212, 213, 214, 216, 217, 221, 222,
  223, 224, 225, 230, 231, 232, 233, 234, 235, 236, 241, 242, 243, 244, 245,
  246, 249, 250, 251, 261, 281, 282, 283, 284, 285, 301, 302, 303, 311, 312,
  313, 314, 315, 316, 317, 318, 319, 320, 321, 322, 323, 324, 325, 326, 331,
  332, 333, 334, 335, 336, 337, 339, 340, 342, 351, 352, 353, 354, 355, 356,
  357, 401, 402, 403, 404, 405, 408, 411, 412, 413, 505, 601, 602, 603, 604,
  655, 657,
]);

// ---------------------------------------------------------------- helpers
function walkLists(obj, cb, trail = []) {
  // Visit every EVENT COMMAND list in maps / common events.
  //
  // A movement route also has a .list, but its entries are route steps
  // (code + parameters, no indent) and must not be validated as commands --
  // treating them as such reports every route as a malformed command list.
  if (Array.isArray(obj)) { obj.forEach((v, i) => walkLists(v, cb, trail.concat(i))); return; }
  if (!obj || typeof obj !== "object") return;
  const isRoute = Object.prototype.hasOwnProperty.call(obj, "repeat") &&
                  Object.prototype.hasOwnProperty.call(obj, "skippable");
  if (!isRoute && Array.isArray(obj.list) && obj.list.some((c) => c && typeof c.code === "number")) {
    cb(obj.list, trail, obj);
  }
  for (const [k, v] of Object.entries(obj)) {
    if (k === "list" && !isRoute) continue;
    if (k === "moveRoute" || (k === "list" && isRoute)) continue;
    walkLists(v, cb, trail.concat(k));
  }
}

function checkCommandList(list, where) {
  if (!list.length || list[list.length - 1].code !== 0) {
    err("LIST_TERMINATOR", "command list does not end with {code:0}", where);
  }
  let indent = 0;
  const labels = new Set(), jumps = [];
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    if (typeof c.code !== "number") { err("CMD_SHAPE", `command ${i} has no numeric code`, where); continue; }
    if (!KNOWN_CODES.has(c.code)) warn("CMD_UNKNOWN", `unknown command code ${c.code} at ${i}`, where);
    if (typeof c.indent !== "number") err("CMD_INDENT", `command ${i} (code ${c.code}) has no indent`, where);
    if (c.indent < 0) err("CMD_INDENT", `negative indent at ${i}`, where);
    if (!Array.isArray(c.parameters)) err("CMD_PARAMS", `command ${i} parameters is not an array`, where);
    if (c.code === 118) labels.add(String(c.parameters[0]));
    if (c.code === 119) jumps.push({ name: String(c.parameters[0]), i });
    // block structure
    if (c.code === 411 || c.code === 412 || c.code === 413 || c.code === 404 || c.code === 402 || c.code === 403) {
      // closing/branching markers sit at the OUTER indent
    }
  }
  for (const j of jumps) {
    if (!labels.has(j.name)) err("DANGLING_JUMP", `Jump to Label "${j.name}" with no matching label`, where);
  }
  // indent balance: every 111/112 opens, every 412/413 closes
  let depth = 0, minDepth = 0;
  for (const c of list) {
    if (c.code === 111 || c.code === 112) depth++;
    else if (c.code === 412 || c.code === 413) depth--;
    if (depth < minDepth) minDepth = depth;
  }
  if (depth !== 0) err("BLOCK_UNBALANCED", `conditional/loop blocks unbalanced (net ${depth})`, where);
  if (minDepth < 0) err("BLOCK_UNBALANCED", "a block is closed before it is opened", where);
  return { labels };
}

// An Autorun that can stay active is a hard softlock. A page qualifies as
// terminating when it turns on a self switch or global switch that some LATER
// page of the same event is conditioned on, or erases itself, or the list ends
// in Exit Event Processing on every path.
function autorunTerminates(ev, pageIndex) {
  const pg = ev.pages[pageIndex];
  const later = ev.pages.slice(pageIndex + 1);
  const setsSelf = new Set(), setsSwitch = new Set(), clearsSwitch = new Set(), clearsSelf = new Set();
  let exits = false, erases = false;
  for (const c of pg.list) {
    if (c.code === 123 && c.parameters[1] === 0) setsSelf.add(c.parameters[0]);
    if (c.code === 123 && c.parameters[1] === 1) clearsSelf.add(c.parameters[0]);
    if (c.code === 121) {
      const bag = c.parameters[2] === 0 ? setsSwitch : clearsSwitch;
      for (let s = c.parameters[0]; s <= c.parameters[1]; s++) bag.add(s);
    }
    if (c.code === 115) exits = true;
    if (c.code === 214) erases = true;
  }
  if (erases) return { ok: true, how: "Erase Event" };

  // A page guarded by a switch that the page itself turns OFF stops matching
  // as soon as it runs, so it terminates just as surely as one that hands over
  // to a later page.
  const co0 = pg.conditions;
  if (co0.switch1Valid && clearsSwitch.has(co0.switch1Id)) {
    return { ok: true, how: `clears its own guard switch ${co0.switch1Id}` };
  }
  if (co0.switch2Valid && clearsSwitch.has(co0.switch2Id)) {
    return { ok: true, how: `clears its own guard switch ${co0.switch2Id}` };
  }
  if (co0.selfSwitchValid && clearsSelf.has(co0.selfSwitchCh)) {
    return { ok: true, how: `clears its own guard self switch ${co0.selfSwitchCh}` };
  }
  for (const lp of later) {
    const co = lp.conditions;
    if (co.selfSwitchValid && setsSelf.has(co.selfSwitchCh)) {
      return { ok: true, how: `self switch ${co.selfSwitchCh} -> later page` };
    }
    if (co.switch1Valid && setsSwitch.has(co.switch1Id)) {
      return { ok: true, how: `switch ${co.switch1Id} -> later page` };
    }
    if (co.switch2Valid && setsSwitch.has(co.switch2Id)) {
      return { ok: true, how: `switch ${co.switch2Id} -> later page` };
    }
  }
  if (exits) return { ok: false, how: "Exit Event Processing only: the page will re-run next frame" };
  return { ok: false, how: "no page change, no erase" };
}

// ---------------------------------------------------------------- main
function main() {
  const system = readJson("System.json");
  const mapInfos = readJson("MapInfos.json");
  const commonEvents = readJson("CommonEvents.json");
  const items = readJson("Items.json");
  const tilesets = readJson("Tilesets.json");
  const actors = readJson("Actors.json");

  for (const [name, v] of Object.entries({ System: system, MapInfos: mapInfos, CommonEvents: commonEvents, Items: items, Tilesets: tilesets, Actors: actors })) {
    if (v === null) err("FILE_MISSING", `data/${name}.json is missing`, name);
  }
  if (!system || !mapInfos || !commonEvents) {
    report(); return findings.some((f) => f.level === "ERROR") ? 1 : 0;
  }

  const switchCount = system.switches.length - 1;
  const varCount = system.variables.length - 1;

  // index-0 null conventions
  for (const [name, arr] of Object.entries({ CommonEvents: commonEvents, Items: items, Tilesets: tilesets, Actors: actors })) {
    if (Array.isArray(arr) && arr.length && arr[0] !== null) {
      err("INDEX0_NOT_NULL", `data/${name}.json[0] must be null`, name);
    }
  }
  for (let i = 1; i < commonEvents.length; i++) {
    if (commonEvents[i] && commonEvents[i].id !== i) {
      err("ID_INDEX_MISMATCH", `CommonEvents[${i}].id === ${commonEvents[i].id}`, "CommonEvents");
    }
  }

  // ---- maps
  const maps = {};
  const mapIds = [];
  for (let i = 1; i < mapInfos.length; i++) {
    if (!mapInfos[i]) continue;
    mapIds.push(i);
    const file = `Map${String(i).padStart(3, "0")}.json`;
    const m = readJson(file);
    if (!m) { err("MAP_FILE_MISSING", `${file} referenced by MapInfos but absent`, file); continue; }
    maps[i] = m;

    const expect = m.width * m.height * 6;
    if (!Array.isArray(m.data) || m.data.length !== expect) {
      err("MAP_DATA_LENGTH", `${file}: data length ${m.data && m.data.length} !== width*height*6 (${expect})`, file);
    }
    if (!tilesets || !tilesets[m.tilesetId]) {
      err("MAP_TILESET", `${file}: tilesetId ${m.tilesetId} not in Tilesets.json`, file);
    }
    if (!Array.isArray(m.events) || m.events[0] !== null) {
      err("INDEX0_NOT_NULL", `${file}: events[0] must be null`, file);
    }
    for (let e = 1; e < (m.events || []).length; e++) {
      const ev = m.events[e];
      if (!ev) continue;
      if (ev.id !== e) err("ID_INDEX_MISMATCH", `${file}: events[${e}].id === ${ev.id}`, file);
      if (ev.x < 0 || ev.y < 0 || ev.x >= m.width || ev.y >= m.height) {
        err("EVENT_OUT_OF_BOUNDS", `${file}: ${ev.name || ev.id} at (${ev.x},${ev.y}) outside ${m.width}x${m.height}`, file);
      }
      if (!ev.pages || !ev.pages.length) {
        err("EVENT_NO_PAGES", `${file}: ${ev.name || ev.id} has no pages`, file);
        continue;
      }
      ev.pages.forEach((pg, pi) => {
        if (pg.trigger === 3) {
          const t = autorunTerminates(ev, pi);
          if (!t.ok) {
            err("AUTORUN_NO_EXIT", `${file}: ${ev.name} page ${pi + 1} is Autorun with no guaranteed exit (${t.how})`, file);
          } else {
            info("AUTORUN_EXIT_OK", `${file}: ${ev.name} page ${pi + 1} Autorun terminates via ${t.how}`, file);
          }
        }
        if (pg.trigger === 4) {
          const guarded = pg.conditions.switch1Valid || pg.conditions.switch2Valid ||
                          pg.conditions.selfSwitchValid || pg.conditions.variableValid;
          if (!guarded) {
            warn("PARALLEL_UNGUARDED", `${file}: ${ev.name} page ${pi + 1} is a Parallel Process with no switch guard`, file);
          }
        }
      });
      // two blocking events on one cell
      for (let o = e + 1; o < m.events.length; o++) {
        const other = m.events[o];
        if (other && other.x === ev.x && other.y === ev.y) {
          warn("EVENT_CELL_SHARED", `${file}: ${ev.name} and ${other.name} both at (${ev.x},${ev.y})`, file);
        }
      }
    }
  }

  // ---- command-level checks across maps and common events
  const checkAll = (root, label) => {
    walkLists(root, (list, trail, owner) => {
      const where = `${label}${trail.length ? " " + trail.filter((t) => typeof t !== "string" || t !== "pages").join("/") : ""}`;
      checkCommandList(list, where);
      for (const c of list) {
        switch (c.code) {
          case 121: {
            for (const idx of [0, 1]) {
              const id = c.parameters[idx];
              if (typeof id === "number" && (id < 1 || id > switchCount)) {
                err("SWITCH_OUT_OF_RANGE", `Control Switches references switch ${id} (max ${switchCount})`, where);
              }
            }
            break;
          }
          case 122: {
            for (const idx of [0, 1]) {
              const id = c.parameters[idx];
              if (typeof id === "number" && (id < 1 || id > varCount)) {
                err("VAR_OUT_OF_RANGE", `Control Variables references variable ${id} (max ${varCount})`, where);
              }
            }
            break;
          }
          case 111: {
            if (c.parameters[0] === 0) {
              const id = c.parameters[1];
              if (id < 1 || id > switchCount) err("SWITCH_OUT_OF_RANGE", `branch on switch ${id}`, where);
            } else if (c.parameters[0] === 1) {
              const id = c.parameters[1];
              if (id < 1 || id > varCount) err("VAR_OUT_OF_RANGE", `branch on variable ${id}`, where);
              if (c.parameters[2] === 1) {
                const other = c.parameters[3];
                if (other < 1 || other > varCount) err("VAR_OUT_OF_RANGE", `branch compares to variable ${other}`, where);
              }
            }
            break;
          }
          case 117: {
            const id = c.parameters[0];
            if (!commonEvents[id]) err("COMMON_EVENT_MISSING", `Call Common Event ${id} which does not exist`, where);
            break;
          }
          case 126: {
            const id = c.parameters[0];
            if (items && !items[id]) err("ITEM_MISSING", `Change Items references item ${id} which does not exist`, where);
            break;
          }
          case 201: {
            const [, mapId, x, y] = c.parameters;
            if (c.parameters[0] === 0) {
              if (!maps[mapId] && !mapIds.includes(mapId)) {
                err("TRANSFER_TARGET_MISSING", `Transfer Player to map ${mapId} which is not registered in MapInfos`, where);
              } else if (maps[mapId]) {
                const t = maps[mapId];
                if (x < 0 || y < 0 || x >= t.width || y >= t.height) {
                  err("TRANSFER_OUT_OF_BOUNDS", `Transfer to map ${mapId} (${x},${y}) outside ${t.width}x${t.height}`, where);
                }
              }
            }
            break;
          }
        }
      }
    });
  };
  checkAll(commonEvents, "CommonEvents");
  for (const id of mapIds) if (maps[id]) checkAll(maps[id], `Map${String(id).padStart(3, "0")}`);

  // ---- transfer destination passability and event-blocking
  const tileFlagsFor = (m) => (tilesets && tilesets[m.tilesetId] ? tilesets[m.tilesetId].flags : null);
  const isWalkable = (m, x, y) => {
    const flags = tileFlagsFor(m);
    if (!flags) return true;
    for (let z = 3; z >= 0; z--) {
      const id = m.data[(z * m.height + y) * m.width + x] || 0;
      const f = flags[id] || 0;
      if (f & 0x10) continue;           // star: decides nothing
      return (f & 0x0f) !== 0x0f;
    }
    return true;
  };
  const walkAll = (root, label, cb) => walkLists(root, (list) => { for (const c of list) cb(c, label); });
  const checkTransferCell = (c, label) => {
    if (c.code !== 201 || c.parameters[0] !== 0) return;
    const [, mapId, x, y] = c.parameters;
    const t = maps[mapId];
    if (!t) return;
    if (x < 0 || y < 0 || x >= t.width || y >= t.height) return;
    if (!isWalkable(t, x, y)) {
      err("TRANSFER_INTO_SOLID", `${label}: Transfer lands on a solid tile at map ${mapId} (${x},${y})`, label);
    }
    const blocker = (t.events || []).find((e) => e && e.x === x && e.y === y &&
      e.pages.some((p) => p.priorityType === 1 && !p.through));
    if (blocker) {
      warn("TRANSFER_INTO_EVENT", `${label}: Transfer lands on blocking event "${blocker.name}" at map ${mapId} (${x},${y})`, label);
    }
  };
  walkAll(commonEvents, "CommonEvents", checkTransferCell);
  for (const id of mapIds) if (maps[id]) walkAll(maps[id], `Map${String(id).padStart(3, "0")}`, checkTransferCell);

  // ---- start position
  if (maps[system.startMapId]) {
    const sm = maps[system.startMapId];
    if (!isWalkable(sm, system.startX, system.startY)) {
      err("START_IN_SOLID", `System start position (${system.startX},${system.startY}) on map ${system.startMapId} is solid`, "System");
    }
  } else {
    err("START_MAP_MISSING", `System.startMapId ${system.startMapId} has no map file`, "System");
  }

  // ---- plugins declared vs present
  const pluginsJs = path.join(ROOT, "js", "plugins.js");
  if (fs.existsSync(pluginsJs)) {
    const src = fs.readFileSync(pluginsJs, "utf8");
    const names = [...src.matchAll(/"name"\s*:\s*"([^"]+)"/g)].map((m) => m[1]);
    for (const n of names) {
      if (!fs.existsSync(path.join(ROOT, "js", "plugins", n + ".js"))) {
        err("PLUGIN_FILE_MISSING", `plugins.js lists "${n}" but js/plugins/${n}.js is absent`, "plugins.js");
      }
    }
    if (names.length) info("PLUGINS", `${names.length} plugin(s) declared, all files present`, "plugins.js");
  }

  // ---- tileset provenance
  const synthesized = Array.isArray(tilesets) &&
    tilesets.some((t) => t && String(t.note || "").includes("<graystone_synthesized_flags>"));
  const imgPresent = fs.existsSync(path.join(ROOT, "img", "tilesets"));
  if (synthesized && imgPresent) {
    err("TILESET_FLAGS_SYNTHESIZED",
      "data/Tilesets.json carries synthesized flags while the real tilesets are present. " +
      "The stock passability has been replaced by ours, so tiles the bindings do not name are walkable. " +
      "Copy data/Tilesets.json from your RPG Maker MZ NewData (tools/hydrate_assets.sh does this) and rebuild.",
      "Tilesets");
  } else if (synthesized) {
    info("TILESET_FLAGS_SYNTHESIZED",
      "data/Tilesets.json flags are synthesized from tile-bindings.json; they do not describe the real art yet.",
      "Tilesets");
  } else if (tilesets) {
    info("TILESET_FLAGS_STOCK", "data/Tilesets.json carries stock passability flags.", "Tilesets");
  }

  // ---- asset references: recorded, not resolved (Company Assets are absent)
  const assetRefs = new Set();
  const collectAssets = (root) => walkLists(root, (list) => {
    for (const c of list) {
      if ([241, 245, 249, 250].includes(c.code) && c.parameters[0] && c.parameters[0].name) {
        assetRefs.add(`audio:${c.parameters[0].name}`);
      }
      if (c.code === 101 && c.parameters[0]) assetRefs.add(`face:${c.parameters[0]}`);
    }
  });
  collectAssets(commonEvents);
  for (const id of mapIds) if (maps[id]) collectAssets(maps[id]);
  for (const id of mapIds) {
    for (const ev of maps[id]?.events || []) {
      if (!ev) continue;
      for (const pg of ev.pages) if (pg.image.characterName) assetRefs.add(`character:${pg.image.characterName}`);
    }
  }
  const imgDir = path.join(ROOT, "img");
  if (!fs.existsSync(imgDir)) {
    info("ASSETS_NOT_HYDRATED", `${assetRefs.size} distinct asset references cannot be resolved: img/ and audio/ are not populated (see docs/ASSET_SETUP.md)`, "assets");
  }

  // ---- face index sanity: a standard MZ faceset holds 8 faces (4x2)
  const checkFaces = (root, label) => walkLists(root, (list) => {
    for (const c of list) {
      if (c.code === 101 && c.parameters[0] && (c.parameters[1] < 0 || c.parameters[1] > 7)) {
        err("FACE_INDEX", `${label}: Show Text uses face index ${c.parameters[1]} on "${c.parameters[0]}" (valid 0..7)`, label);
      }
    }
  });
  checkFaces(commonEvents, "CommonEvents");
  for (const id of mapIds) if (maps[id]) checkFaces(maps[id], `Map${String(id).padStart(3, "0")}`);

  return report();
}

function report() {
  const errors = findings.filter((f) => f.level === "ERROR");
  const warns = findings.filter((f) => f.level === "WARN");
  const infos = findings.filter((f) => f.level === "INFO");
  const show = (list) => {
    for (const f of list) console.log(`  ${f.level.padEnd(5)} ${f.code.padEnd(24)} ${f.msg}`);
  };
  console.log("Gray Stone static validation");
  console.log("=".repeat(72));
  if (errors.length) { console.log(`\nERRORS (${errors.length})`); show(errors); }
  if (warns.length) { console.log(`\nWARNINGS (${warns.length})`); show(warns); }
  if (infos.length) { console.log(`\nNOTES (${infos.length})`); show(infos); }
  console.log("\n" + "=".repeat(72));
  console.log(`${errors.length} error(s), ${warns.length} warning(s), ${infos.length} note(s)`);
  return errors.length ? 1 : 0;
}

if (require.main === module) process.exit(main());
module.exports = { main };
