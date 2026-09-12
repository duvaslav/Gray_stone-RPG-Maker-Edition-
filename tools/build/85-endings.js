"use strict";
// Generates CE_022's ending resolver from 38_Ending_Matrix.
//
// 78 rows: 6 culprits x 3 strategies x 4 qualities, plus one no-strategy leaf per
// culprit. The resolver is TOTAL by construction -- every reachable combination
// lands on a row, and the build fails if the matrix does not cover one.
const { table, num } = require("../lib/spec");
const { CmdList, C } = require("../lib/mz");

const ENDING_SWITCH_BASE = 1200;        // 1200 = resolved flag, 1201.. = per ending

const STRATEGY = { none: 0, official: 1, ambush: 2, lockdown: 3 };

// 05_Variables_Enums defines Evelyn_Status; "derived" means the ending does not
// set it and whatever the run produced stands.
const EVELYN_STATUS = { safe: 1, harmed: 3, dead: 4 };
// No Culprit_Status enum exists in the workbook; allocated as V_0037 here.
const CULPRIT_STATUS = { detained: 1, escaped: 2, free: 3 };

function rows() {
  return table("38_Ending_Matrix")
    .map((r) => ({
      endingId: (r.ending_id || "").trim(),
      culprit: num(r.culprit_id),
      strategy: STRATEGY[String(r.strategy || "").trim()],
      quality: num(r.strategy_quality),
      evelyn: String(r.Evelyn_Status || "").trim().split(" ")[0],
      culpritStatus: String(r.culprit_status || "").trim(),
    }))
    .filter((r) => r.endingId && r.culprit && r.strategy !== undefined);
}

function allocate() {
  const list = rows().slice().sort((a, b) =>
    a.culprit - b.culprit || a.strategy - b.strategy || a.quality - b.quality);
  const resultId = {}, switchId = {}, switchName = {};
  list.forEach((r, i) => {
    resultId[r.endingId] = i + 1;                      // Final_Result_ID, always > 0
    switchId[r.endingId] = ENDING_SWITCH_BASE + 1 + i;
    switchName[r.endingId] = `S_${ENDING_SWITCH_BASE + 1 + i}_${r.endingId}`;
  });
  return {
    list, resultId, switchId, switchName,
    resolvedSwitchId: ENDING_SWITCH_BASE,
    resolvedSwitchName: `S_${ENDING_SWITCH_BASE}_FINAL_RESOLVED`,
  };
}

function build(reg) {
  const { S, V } = reg;
  const alloc = allocate();
  const c = new CmdList();

  c.comment([
    "CE_022 Final Resolver.",
    `Generated from 38_Ending_Matrix (${alloc.list.length} endings).`,
    "",
    "Total by construction: every culprit x strategy x quality reachable from the",
    "scoring events has a row, including strategy=none. The assertion after the",
    "tree can therefore only fire if the matrix itself is incomplete.",
  ].join("\n"));

  c.callCommon(15);                                    // settle derived states
  c.ifVar(V("V_0007_Strategy_ID"), 1, 0); c.callCommon(19); c.endIf();
  c.ifVar(V("V_0007_Strategy_ID"), 2, 0); c.callCommon(20); c.endIf();
  c.ifVar(V("V_0007_Strategy_ID"), 3, 0); c.callCommon(21); c.endIf();

  // With no strategy chosen there is nothing to score: the quality stays 0 and
  // the per-culprit "none" leaf answers.
  c.ifVar(V("V_0007_Strategy_ID"), 0, 0);
    c.varSet(V("V_0008_Strategy_Quality"), 0);
  c.endIf();

  c.varFromVar(V("V_0009_Effective_Strategy_Quality"), V("V_0008_Strategy_Quality"), 0);
  c.varSet(V("V_0030_Final_Result_ID"), 0);

  const byCulprit = {};
  for (const r of alloc.list) (byCulprit[r.culprit] = byCulprit[r.culprit] || []).push(r);

  for (const culprit of Object.keys(byCulprit).map(Number).sort((a, b) => a - b)) {
    c.ifVar(V("V_0006_Culprit_ID"), culprit, 0);
      const byStrategy = {};
      for (const r of byCulprit[culprit]) (byStrategy[r.strategy] = byStrategy[r.strategy] || []).push(r);
      for (const strategy of Object.keys(byStrategy).map(Number).sort((a, b) => a - b)) {
        c.ifVar(V("V_0007_Strategy_ID"), strategy, 0);
          for (const r of byStrategy[strategy].sort((a, b) => a.quality - b.quality)) {
            c.ifVar(V("V_0009_Effective_Strategy_Quality"), r.quality, 0);
              c.comment(r.endingId);
              c.varSet(V("V_0030_Final_Result_ID"), alloc.resultId[r.endingId]);
              const ev = EVELYN_STATUS[r.evelyn];
              if (ev !== undefined) c.varSet(V("V_0015_Evelyn_Status"), ev);
              const cs = CULPRIT_STATUS[r.culpritStatus];
              if (cs !== undefined) c.varSet(V("V_0037_Culprit_Status"), cs);
              c.switchOn(S(alloc.resolvedSwitchName));
              c.switchOn(S(alloc.switchName[r.endingId]));
              c.jumpTo("END_RESOLVED");
            c.endIf();
          }
        c.endIf();
      }
    c.endIf();
  }

  c.label("END_RESOLVED");
  c.comment("Assertion: the matrix must have answered.");
  c.ifVar(V("V_0030_Final_Result_ID"), 0, 0);
    c.comment("Unreachable unless 38_Ending_Matrix is missing a combination.");
    c.text(["Дело закрыто без окончательного вывода."], { background: 1 });
    c.varSet(V("V_0030_Final_Result_ID"), alloc.list.length + 1);
    c.switchOn(S(alloc.resolvedSwitchName));
  c.endIf();

  return { list: c.done(), alloc };
}

// Fails the build if the matrix cannot answer some reachable combination.
function coverage() {
  const have = new Set(rows().map((r) => `${r.culprit}:${r.strategy}:${r.quality}`));
  const missing = [];
  for (let culprit = 1; culprit <= 6; culprit++) {
    missing.push(...[0].filter((q) => !have.has(`${culprit}:0:${q}`)).map(() => `culprit ${culprit} strategy none`));
    for (let s = 1; s <= 3; s++) {
      for (let q = 0; q <= 3; q++) {
        if (!have.has(`${culprit}:${s}:${q}`)) missing.push(`culprit ${culprit} strategy ${s} quality ${q}`);
      }
    }
  }
  return missing;
}

module.exports = { build, allocate, rows, coverage, ENDING_SWITCH_BASE, STRATEGY };
