"use strict";
// Generates the dialogue scene Common Events from 53_Dialogue_Event_Commands.
//
// 2630 rows, 15 scenes, already expressed as ordered MZ commands with indent and
// parameters. Most rows map straight through; a few are written abstractly and
// are expanded here into native commands:
//
//   111 "Conditional Route"  a variable with named branches -> nested native
//                            Conditional Branch + Jump to Label
//   117 with inputEvidenceId -> set the clue input variable, then call CE_012
//   121/122                  names resolved through the registry (canonical ids,
//                            per-NPC metrics, reversed npc_metric forms)
const { table, num } = require("../lib/spec");
const { CmdList, C } = require("../lib/mz");

const FIRST_DIALOGUE_CE = 100;         // core events occupy 1..25
const SCENE_SWITCH_BASE = 1100;        // clear of NPC instance switches (1000+)

const BACKGROUND = { Window: 0, Dim: 1, Transparent: 2 };
const POSITION = { Top: 0, Middle: 1, Bottom: 2 };
const CHOICE_POSITION = { Left: 0, Middle: 1, Right: 2 };

// D-24: the workbook contradicts itself on Strategy_Quality by exactly one.
//   38_Ending_Matrix : 0 invalid, 1 weak, 2 partial, 3 clean
//   05_Variables_Enums: 0 not-calculated, 1 invalid, 2 weak, 3 partial, 4 clean
// The matrix is the resolver's own data and is complete -- 78 rows covering every
// culprit x strategy x quality -- and CE_019..021 already compute 0..3 to match
// it. The enum table's extra "not calculated" at 0 shifts everything up and is
// redundant, since "invalid" already means no usable strategy. The matrix
// convention wins, so "clean" is 3.
const QUALITY_LABEL = { invalid: 0, weak: 1, partial: 2, clean: 3 };

// leonard_power_position: never allocated by the workbook (V_0036 here).
const POWER_POSITION = { disclosed: 1, legal: 2, hidden: 3, renounce: 4 };

const VARIABLE_ALIASES = { strategy: "Strategy_ID" };

// A scene id abbreviates some names; the registry uses the full ones.
const NPC_ALIASES = { bart: "bartolomeo", edrian: "edrian" };

// Clue references in the dialogue sheet that do not match 23_Evidence_Items.
//
//   item_chapel_night_register -- the Edrian confession grants BOTH this and
//     clue_chapel_night_entry, and 25_Clue_Logic names that scene as the source
//     of clue_chapel_night_entry. It is a duplicate alias for the same clue, so
//     it resolves to it and the scene grants it exactly once (CE_012 guards the
//     rest).
//
//   item_creditor_letters -- no evidence item of that name exists anywhere, and
//     the Evelyn audit grants nothing else. A genuinely dangling reference. It is
//     NOT invented: the scene plays and records the gap instead, because granting
//     the wrong clue would be worse than granting none. See docs/QA.md D-25.
const CLUE_ALIASES = { item_chapel_night_register: "clue_chapel_night_entry" };

function clueItemIds() {
  const map = {};
  for (const r of table("23_Evidence_Items")) {
    const id = num(r["item_id RPG Maker"]);
    const key = (r["canonical clue_id"] || "").trim();
    if (id && key) map[key] = id;
  }
  return map;
}

function scenes() {
  const rows = table("53_Dialogue_Event_Commands");
  const byCe = new Map();
  for (const r of rows) {
    const ce = r.common_event_logical_id;
    if (!ce) continue;
    if (!byCe.has(ce)) byCe.set(ce, []);
    byCe.get(ce).push(r);
  }
  for (const list of byCe.values()) list.sort((a, b) => num(a.command_order) - num(b.command_order));
  return byCe;
}

// Scene id -> the character it is about, for resolving a bare metric like
// "respect" inside scene_linda_shifts.
function npcOfScene(sceneId) {
  const m = String(sceneId).match(/^scene_([a-z]+)_/);
  return m ? m[1] : null;
}

function allocate() {
  const keys = [...scenes().keys()].sort();
  const ceId = {}, switchName = {}, switchId = {}, sheetName = {};
  keys.forEach((k, i) => {
    const bare = k.replace(/^CE_/, "");                   // DLG_SCENE_AGNES_ORDER
    ceId[k] = FIRST_DIALOGUE_CE + i;
    switchId[k] = SCENE_SWITCH_BASE + i;
    switchName[k] = `S_${SCENE_SWITCH_BASE + i}_${bare}_COMPLETE`;
    // Exactly how 53_Dialogue_Event_Commands writes the reference, registered as
    // a canonical alias so its own Control Switch rows resolve.
    sheetName[k] = `S_${bare}_COMPLETE`;
  });
  return { keys, ceId, switchName, switchId, sheetName };
}

function build(reg) {
  const alloc = allocate();
  const sceneRows = scenes();
  const clues = clueItemIds();
  const out = [];
  const problems = [];

  for (const key of alloc.keys) {
    const rows = sceneRows.get(key);
    const sceneId = rows[0].scene_id;
    const npc = NPC_ALIASES[npcOfScene(sceneId)] || npcOfScene(sceneId);
    const c = new CmdList();

    c.comment([
      `${key}`,
      `Generated from 53_Dialogue_Event_Commands (${rows.length} rows).`,
      "Canonical text preserved verbatim; do not hand-edit.",
    ].join("\n"));

    // Replay guard: a scene plays once. Without it, re-entering the trigger
    // repeats the whole conversation and every relationship change in it.
    c.ifSwitch(alloc.switchId[key]);
      c.exitEvent();
    c.endIf();

    let i = 0;
    while (i < rows.length) {
      const r = rows[i];
      const code = num(r.mz_code);
      const indent = num(r.indent);
      let p = {};
      try { p = JSON.parse(r.parameters_json || "{}"); } catch (e) { p = {}; }

      switch (code) {
        case 108: {
          const lines = String(p.text || "").split("\n");
          c.push(C.COMMENT, [lines[0]], indent);
          for (const l of lines.slice(1)) c.push(C.COMMENT_LINE, [l], indent);
          break;
        }
        case 101: {
          c.push(C.SHOW_TEXT, [
            p.faceName || "", p.faceIndex || 0,
            BACKGROUND[p.background] ?? 0, POSITION[p.position] ?? 2,
            p.speakerName || "",
          ], indent);
          for (const line of p.lines || []) c.push(C.TEXT_LINE, [line], indent);
          break;
        }
        case 102: {
          c.push(C.SHOW_CHOICES, [
            p.choices || [],
            p.cancelType === "Disallow" ? -1 : num(p.cancelType, -1),
            num(p.defaultType, 0),
            CHOICE_POSITION[p.positionType] ?? 2,
            BACKGROUND[p.background] ?? 0,
          ], indent);
          break;
        }
        case 402: c.push(C.WHEN, [num(p.choiceIndex, 0), p.choiceText || ""], indent); break;
        case 404: c.push(C.END_CHOICES, [], indent); break;
        case 115: c.push(C.EXIT_EVENT, [], indent); break;
        case 118: c.push(C.LABEL, [p.label], indent); break;
        case 119: c.push(C.JUMP_TO_LABEL, [p.label], indent); break;

        case 121: {
          const id = reg.resolveSwitch(p.switch, npc);
          if (id === undefined) { problems.push(`${key}: unknown switch ${p.switch}`); break; }
          c.push(C.SWITCHES, [id, id, p.value === "ON" ? 0 : 1], indent);
          break;
        }
        case 122: {
          const name = VARIABLE_ALIASES[p.variable] || p.variable;
          const id = reg.resolveVariable(name, npc);
          if (id === undefined) { problems.push(`${key}: unknown variable ${p.variable}`); break; }
          const op = { SET: 0, ADD: 1, SUB: 2 }[String(p.operation || "SET").toUpperCase()] ?? 0;
          c.push(C.VARIABLES, [id, id, op, 0, num(p.value, 0)], indent);
          break;
        }

        case 117: {
          // Evidence hand-off: the clue id is an input to CE_012, which owns the
          // "grant exactly once" guard, so no extra guard is emitted here.
          if (p.inputEvidenceId) {
            const clueKey = CLUE_ALIASES[p.inputEvidenceId] || p.inputEvidenceId;
            const itemId = clues[clueKey];
            if (!itemId) {
              problems.push(`${key}: dangling clue reference "${p.inputEvidenceId}" - no such evidence item; grant skipped`);
              c.push(C.COMMENT, [`UNRESOLVED clue reference: ${p.inputEvidenceId} (see docs/QA.md D-25)`], indent);
              break;
            }
            c.push(C.VARIABLES, [
              reg.V("V_0023_Clue_Item_ID_Input"), reg.V("V_0023_Clue_Item_ID_Input"), 0, 0, itemId,
            ], indent);
          }
          const target = String(p.commonEvent || "").match(/^CE_(\d+)/);
          c.push(C.COMMON_EVENT, [target ? Number(target[1]) : 12], indent);
          break;
        }

        case 111: {
          if (p.branches) {
            // Abstract "Conditional Route": one variable, named destinations.
            // Expanded into native equality branches that jump to the scene's
            // own labels, with the else route last so no value falls through.
            const id = reg.resolveVariable(VARIABLE_ALIASES[p.variable] || p.variable, npc);
            if (id === undefined) { problems.push(`${key}: unknown route variable ${p.variable}`); break; }
            c.push(C.COMMENT, [`Conditional route on ${p.variable}`], indent);
            for (const [label, target] of Object.entries(p.branches)) {
              const value = POWER_POSITION[label];
              if (value === undefined) { problems.push(`${key}: unknown route value ${label}`); continue; }
              c.push(C.IF, [1, id, 0, value, 0], indent);
              c.push(C.JUMP_TO_LABEL, [target], indent + 1);
              c.push(C.END_IF, [], indent);
            }
            if (p.else) c.push(C.JUMP_TO_LABEL, [p.else], indent);
            break;
          }
          // A real native branch expressed as "<variable> = <label>".
          const logic = String(p.conditionLogic || "");
          const m = logic.match(/^(\w+)\s*=\s*(\w+)$/);
          if (!m) { problems.push(`${key}: unparsable condition "${logic}"`); c.push(C.IF, [1, 1, 0, 0, 0], indent); break; }
          const id = reg.resolveVariable(VARIABLE_ALIASES[m[1]] || m[1], npc);
          const value = QUALITY_LABEL[m[2]] ?? num(m[2], 0);
          if (id === undefined) { problems.push(`${key}: unknown condition variable ${m[1]}`); c.push(C.IF, [1, 1, 0, 0, 0], indent); break; }
          c.push(C.IF, [1, id, 0, value, 0], indent);
          break;
        }
        case 411: c.push(C.ELSE, [], indent); break;
        case 412: c.push(C.END_IF, [], indent); break;

        default:
          problems.push(`${key}: unhandled command code ${code}`);
      }
      i++;
    }

    // Mark the scene played, on whatever path reaches the end.
    c.push(C.SWITCHES, [alloc.switchId[key], alloc.switchId[key], 0], 0);
    c._indent = 0;

    out.push({
      id: alloc.ceId[key], name: key, trigger: 0, switchId: 1,
      list: c.done(),
      sceneId, npc,
    });
  }

  return { events: out, alloc, problems };
}

module.exports = { build, allocate, scenes, FIRST_DIALOGUE_CE, SCENE_SWITCH_BASE, QUALITY_LABEL };
