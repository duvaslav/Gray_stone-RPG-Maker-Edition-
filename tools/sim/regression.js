#!/usr/bin/env node
"use strict";
// Gray Stone regression suite.  node tools/sim/regression.js
//
// Runs the scenarios from the project brief's regression list against the
// generated data/ layer using the headless interpreter. These EXECUTE the real
// generated command lists -- they are not assertions about the design.
const fs = require("fs");
const path = require("path");
const { Game, runMapAutoruns, triggerEvent, callCommonEvent, findProperPageIndex } = require("./interpreter");

const ROOT = path.join(__dirname, "..", "..");
const DATA = path.join(ROOT, "data");
const read = (n) => JSON.parse(fs.readFileSync(path.join(DATA, n), "utf8"));

function loadDb() {
  const system = read("System.json");
  const mapInfos = read("MapInfos.json");
  const maps = {};
  for (let i = 1; i < mapInfos.length; i++) {
    if (!mapInfos[i]) continue;
    maps[i] = read(`Map${String(i).padStart(3, "0")}.json`);
  }
  return { system, mapInfos, maps, commonEvents: read("CommonEvents.json"), items: read("Items.json") };
}

// Named lookups so a failing test reads as a sentence, not as switch 12.
function makeRefs(db) {
  const S = {}, V = {};
  db.system.switches.forEach((n, i) => { if (n) S[n] = i; });
  db.system.variables.forEach((n, i) => { if (n) V[n] = i; });
  return { S, V };
}

// --- tiny test harness -----------------------------------------------------
const results = [];
let current = null;

function scenario(name, fn) {
  current = { name, checks: [], error: null };
  results.push(current);
  try { fn(); } catch (e) { current.error = e.message; }
  current = null;
}

function check(label, condition, detail) {
  current.checks.push({ label, pass: !!condition, detail });
}

function eq(label, actual, expected) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  current.checks.push({ label, pass, detail: pass ? undefined : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}` });
}

// Deterministic RNG so a failure can be reproduced exactly.
//
// The seed is hashed first and the stream warmed. A bare LCG seeded with small
// consecutive integers has a first output that is nearly linear in the seed --
// seeds 1..300 produced only the values 2 and 3 out of 1..6, which looked like
// a broken culprit roll and was in fact a broken test.
function seeded(seed) {
  let s = (seed >>> 0) || 1;
  s ^= s << 13; s >>>= 0;
  s ^= s >> 17;
  s ^= s << 5; s >>>= 0;
  const next = () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
  for (let i = 0; i < 8; i++) next();
  return next;
}

function newGame(db, seed = 1) {
  const g = new Game(db);
  g.rng = seeded(seed);
  g.switches.setValue(17, true);   // Game_Map.setup on New Game arms map entry
  return g;
}

// --- scenarios -------------------------------------------------------------
function main() {
  const db = loadDb();
  const { S, V } = makeRefs(db);

  // ---------------------------------------------------------------- NEW GAME
  scenario("New Game: the prologue runs and selects exactly one culprit", () => {
    const g = newGame(db, 7);
    const r = runMapAutoruns(g, 5);
    check("the prologue Autorun settled (no infinite Autorun)", r.settled, `passes=${r.passes}`);
    check("the prologue controller ran", r.executed.some((e) => e.event === "EV_PR_CONTROLLER"));
    const culprit = g.variables.value(V.V_0006_Culprit_ID);
    check("Culprit_ID is in 1..6", culprit >= 1 && culprit <= 6, `Culprit_ID=${culprit}`);
    check("the culprit is locked", g.switches.value(S.S_0002_Culprit_Locked));
    const versionSwitches = [20, 21, 22, 23, 24, 25].filter((id) => g.switches.value(id));
    eq("exactly one culprit version switch is on", versionSwitches.length, 1);
    eq("the version switch matches Culprit_ID", versionSwitches[0], 19 + culprit);
    check("Threat_Target was set", g.variables.value(V.V_0018_Threat_Target) > 0);
  });

  scenario("New Game: culprit selection is uniform across 1..6", () => {
    const seen = {};
    for (let seed = 1; seed <= 300; seed++) {
      const g = newGame(db, seed);
      runMapAutoruns(g, 5);
      const c = g.variables.value(V.V_0006_Culprit_ID);
      seen[c] = (seen[c] || 0) + 1;
    }
    const keys = Object.keys(seen).map(Number).sort((a, b) => a - b);
    eq("every value 1..6 occurs", keys, [1, 2, 3, 4, 5, 6]);
    check("no run produced an out-of-range culprit", !seen[0] && !seen[7], JSON.stringify(seen));
  });

  scenario("Prologue: day 1 opens in the evening with full AP", () => {
    const g = newGame(db, 3);
    runMapAutoruns(g, 5);
    eq("Current_Day", g.variables.value(V.V_0001_Current_Day), 1);
    eq("Current_Hour", g.variables.value(V.V_0002_Current_Hour), 18);
    eq("Time_Block is Evening", g.variables.value(V.V_0004_Time_Block), 4);
    eq("AP_Remaining", g.variables.value(V.V_0005_AP_Remaining), 5);
    check("the Evening block switch is on", g.switches.value(S.S_0817_TimeBlock_Evening));
    check("no other block switch is on", ![814, 815, 816, 818].some((id) => g.switches.value(id)));
    check("the player was transferred to the manor", g.mapId === 20 && g.playerX === 22 && g.playerY === 31, `at map ${g.mapId} (${g.playerX},${g.playerY})`);
  });

  scenario("Prologue: control, menu and save are all handed back", () => {
    const g = newGame(db, 5);
    runMapAutoruns(g, 5);
    check("save access restored", g.saveEnabled);
    check("menu access restored", g.menuEnabled);
    check("formation access restored", g.formationEnabled);
    check("player no longer transparent", !g.transparent);
    check("menu lock switch cleared", !g.switches.value(S.S_0004_Menu_Locked));
    check("save lock switch cleared", !g.switches.value(S.S_0005_Save_Locked));
    check("atomic scene flag cleared", !g.switches.value(S.S_0015_Atomic_Scene));
    // The prologue clears its own dusk tint, then CE_024 -> CE_011 applies the
    // tone for the CURRENT time block. Day 1 opens at 18:00, so an evening tone
    // is the correct end state -- a neutral [0,0,0,0] here would mean the
    // lighting system never ran and the manor would open flat and bright.
    check("cutscene tint was released and the block tone applied",
          JSON.stringify(g.tone) !== JSON.stringify([-52, -44, -24, 24]) && g.tone[0] < 0,
          JSON.stringify(g.tone));
  });

  scenario("Replay guard: re-entering the prologue map never replays it", () => {
    const g = newGame(db, 11);
    runMapAutoruns(g, 5);
    const culpritBefore = g.variables.value(V.V_0006_Culprit_ID);
    const messagesBefore = g.messages.length;

    // Guard 1 -- the self switch. Page 2 wins, so the Autorun does not even
    // exist any more and nothing can replay.
    g.mapId = 5;
    const r2 = runMapAutoruns(g, 5);
    check("the second visit settled", r2.settled);
    eq("no Autorun ran at all on the second visit", r2.executed.length, 0);
    eq("Culprit_ID unchanged", g.variables.value(V.V_0006_Culprit_ID), culpritBefore);
    eq("no new dialogue was shown", g.messages.length, messagesBefore);

    // Guard 2 -- the global switch. Clear the self switch (a save made before
    // the prologue existed, or the event re-created) so page 1 runs again. The
    // S_0012 branch must take the early exit: transfer out, no dialogue, and
    // absolutely no second culprit roll.
    g.selfSwitches.setValue([5, 1, "A"], false);
    g.mapId = 5;
    const r3 = runMapAutoruns(g, 5);
    check("the guarded re-run settled", r3.settled);
    check("page 1 did run this time", r3.executed.some((e) => e.event === "EV_PR_CONTROLLER"));
    eq("still no new dialogue", g.messages.length, messagesBefore);
    eq("Culprit_ID still unchanged", g.variables.value(V.V_0006_Culprit_ID), culpritBefore);
    check("the player was sent straight to the manor", g.mapId === 20, `map=${g.mapId}`);
    check("control was handed back", g.menuEnabled && g.saveEnabled);
  });

  scenario("Prologue cast leaves no residue or collision behind", () => {
    const g = newGame(db, 2);
    runMapAutoruns(g, 5);
    const map = db.maps[5];
    let blocking = 0, graphic = 0;
    for (const ev of map.events) {
      if (!ev || ev.name === "EV_PR_CONTROLLER") continue;
      const pi = findProperPageIndex(g, 5, ev);
      const pg = ev.pages[pi];
      if (pg.priorityType === 1 && !pg.through) blocking++;
      if (pg.image.characterName) graphic++;
    }
    eq("no cast member still blocks a cell", blocking, 0);
    eq("no cast member still shows a sprite", graphic, 0);
  });

  // ------------------------------------------------------------- SAVE / LOAD
  scenario("Save/Load: the culprit survives and is never re-rolled", () => {
    const g = newGame(db, 13);
    runMapAutoruns(g, 5);
    const culprit = g.variables.value(V.V_0006_Culprit_ID);
    const blob = g.save();

    const g2 = new Game(db);
    g2.rng = seeded(999);              // a DIFFERENT stream: a re-roll would show
    g2.load(blob);
    eq("Culprit_ID after load", g2.variables.value(V.V_0006_Culprit_ID), culprit);

    // The riskiest path: something calls the init chain again after loading.
    callCommonEvent(g2, 1);
    eq("Culprit_ID after re-running CE_001", g2.variables.value(V.V_0006_Culprit_ID), culprit);
    callCommonEvent(g2, 2);
    eq("Culprit_ID after re-running CE_002 directly", g2.variables.value(V.V_0006_Culprit_ID), culprit);
    const versionSwitches = [20, 21, 22, 23, 24, 25].filter((id) => g2.switches.value(id));
    eq("still exactly one version switch", versionSwitches.length, 1);
  });

  scenario("Save/Load: day, clock and AP are restored", () => {
    const g = newGame(db, 17);
    runMapAutoruns(g, 5);
    g.variables.setValue(V.V_0005_AP_Remaining, 3);
    g.variables.setValue(V.V_0002_Current_Hour, 20);
    const blob = g.save();
    const g2 = new Game(db); g2.rng = seeded(1); g2.load(blob);
    eq("AP", g2.variables.value(V.V_0005_AP_Remaining), 3);
    eq("hour", g2.variables.value(V.V_0002_Current_Hour), 20);
    eq("day", g2.variables.value(V.V_0001_Current_Day), 1);
    eq("map", g2.mapId, 20);
  });

  scenario("Load: entering the manor restores ambience without touching AP", () => {
    const g = newGame(db, 19);
    runMapAutoruns(g, 5);
    g.variables.setValue(V.V_0005_AP_Remaining, 2);
    const blob = g.save();
    const g2 = new Game(db); g2.rng = seeded(1); g2.load(blob);
    g2.switches.setValue(17, true);          // Game_Map.setup on load
    const r = runMapAutoruns(g2, 20);
    check("the map-entry Autorun settled", r.settled, `passes=${r.passes}`);
    check("it ran once", r.executed.filter((e) => e.event === "EV_MAP_ENTER").length === 1);
    check("the entry guard was consumed", !g2.switches.value(S.S_0017_Map_Entry_Pending));
    eq("AP was NOT reset by map entry", g2.variables.value(V.V_0005_AP_Remaining), 2);
    eq("the day was NOT restarted", g2.variables.value(V.V_0001_Current_Day), 1);
    check("a screen tone was applied for the current block", JSON.stringify(g2.tone) !== JSON.stringify([0, 0, 0, 0]), JSON.stringify(g2.tone));
  });

  // --------------------------------------------------------------- TIME / AP
  scenario("Time: minutes roll into hours and blocks change at the right boundary", () => {
    const cases = [
      { from: [6, 0], add: 30, to: [6, 30], block: 1 },
      { from: [7, 50], add: 20, to: [8, 10], block: 2 },
      { from: [11, 50], add: 20, to: [12, 10], block: 3 },
      { from: [16, 45], add: 30, to: [17, 15], block: 4 },
      { from: [20, 50], add: 30, to: [21, 20], block: 5 },
      { from: [9, 0], add: 195, to: [12, 15], block: 3 },
    ];
    for (const c of cases) {
      const g = newGame(db, 1);
      g.switches.setValue(S.S_0903_QA_Ignore_AP, false);
      g.variables.setValue(V.V_0002_Current_Hour, c.from[0]);
      g.variables.setValue(V.V_0003_Current_Minute, c.from[1]);
      g.variables.setValue(V.V_0021_Action_Minutes, c.add);
      callCommonEvent(g, 6);
      const got = [g.variables.value(V.V_0002_Current_Hour), g.variables.value(V.V_0003_Current_Minute)];
      eq(`${c.from[0]}:${String(c.from[1]).padStart(2, "0")} + ${c.add}min`, got, c.to);
      eq(`  -> Time_Block`, g.variables.value(V.V_0004_Time_Block), c.block);
      eq(`  -> Action_Minutes cleared`, g.variables.value(V.V_0021_Action_Minutes), 0);
    }
  });

  scenario("Time: exactly one block switch is ever on", () => {
    for (let h = 0; h <= 23; h++) {
      const g = newGame(db, 1);
      g.variables.setValue(V.V_0002_Current_Hour, h);
      g.variables.setValue(V.V_0003_Current_Minute, 0);
      g.variables.setValue(V.V_0021_Action_Minutes, 0);
      callCommonEvent(g, 6);
      const on = [814, 815, 816, 817, 818].filter((id) => g.switches.value(id));
      eq(`at ${String(h).padStart(2, "0")}:00 exactly one block switch`, on.length, 1);
    }
  });

  scenario("Time: past 23:00 the day closes instead of overflowing", () => {
    const g = newGame(db, 1);
    g.variables.setValue(V.V_0002_Current_Hour, 22);
    g.variables.setValue(V.V_0003_Current_Minute, 40);
    g.variables.setValue(V.V_0021_Action_Minutes, 90);
    callCommonEvent(g, 6);
    eq("clock clamped to 23:00", [g.variables.value(V.V_0002_Current_Hour), g.variables.value(V.V_0003_Current_Minute)], [23, 0]);
    check("day end was requested", g.switches.value(S.S_0009_Day_End_Requested));
  });

  scenario("AP: a spend costs AP and minutes exactly once", () => {
    const g = newGame(db, 1);
    g.switches.setValue(S.S_0903_QA_Ignore_AP, false);
    g.variables.setValue(V.V_0005_AP_Remaining, 5);
    g.variables.setValue(V.V_0002_Current_Hour, 10);
    g.variables.setValue(V.V_0003_Current_Minute, 0);
    g.variables.setValue(V.V_0021_Action_Minutes, 30);
    g.variables.setValue(V.V_0022_Action_AP_Cost, 1);
    callCommonEvent(g, 7);
    eq("AP spent", g.variables.value(V.V_0005_AP_Remaining), 4);
    eq("clock advanced", [g.variables.value(V.V_0002_Current_Hour), g.variables.value(V.V_0003_Current_Minute)], [10, 30]);
    eq("AP cost input cleared", g.variables.value(V.V_0022_Action_AP_Cost), 0);
    eq("minute input cleared", g.variables.value(V.V_0021_Action_Minutes), 0);
  });

  scenario("AP: running out refuses the action and charges nothing", () => {
    const g = newGame(db, 1);
    g.switches.setValue(S.S_0903_QA_Ignore_AP, false);
    g.variables.setValue(V.V_0005_AP_Remaining, 0);
    g.variables.setValue(V.V_0002_Current_Hour, 14);
    g.variables.setValue(V.V_0003_Current_Minute, 0);
    g.variables.setValue(V.V_0021_Action_Minutes, 30);
    g.variables.setValue(V.V_0022_Action_AP_Cost, 1);
    const before = g.messages.length;
    callCommonEvent(g, 7);
    eq("AP not driven negative", g.variables.value(V.V_0005_AP_Remaining), 0);
    eq("clock did NOT advance", [g.variables.value(V.V_0002_Current_Hour), g.variables.value(V.V_0003_Current_Minute)], [14, 0]);
    check("the player was told why", g.messages.length > before);
    eq("inputs cleared anyway", [g.variables.value(V.V_0021_Action_Minutes), g.variables.value(V.V_0022_Action_AP_Cost)], [0, 0]);
  });

  // ------------------------------------------------------------ INVESTIGATION
  scenario("Search point: costs AP once, and a second look is free", () => {
    const g = newGame(db, 23);
    runMapAutoruns(g, 5);
    runMapAutoruns(g, 20);
    g.switches.setValue(S.S_0903_QA_Ignore_AP, false);
    g.variables.setValue(V.V_0005_AP_Remaining, 5);

    const apStart = g.variables.value(V.V_0005_AP_Remaining);
    const hourStart = g.variables.value(V.V_0002_Current_Hour);
    const minStart = g.variables.value(V.V_0003_Current_Minute);

    const r1 = triggerEvent(g, 20, "EV_SEARCH_poi_hall_portraits");
    check("first search ran page 1", r1.ran && r1.page === 1, JSON.stringify(r1));
    const apAfter1 = g.variables.value(V.V_0005_AP_Remaining);
    eq("first search cost 1 AP", apStart - apAfter1, 1);
    const advanced = (g.variables.value(V.V_0002_Current_Hour) * 60 + g.variables.value(V.V_0003_Current_Minute)) - (hourStart * 60 + minStart);
    eq("first search cost 30 minutes", advanced, 30);

    const msgAfter1 = g.messages.length;
    const r2 = triggerEvent(g, 20, "EV_SEARCH_poi_hall_portraits");
    check("second search ran page 2 (already searched)", r2.ran && r2.page === 2, JSON.stringify(r2));
    eq("second search cost NO AP", g.variables.value(V.V_0005_AP_Remaining), apAfter1);
    eq("second search cost NO minutes",
       g.variables.value(V.V_0002_Current_Hour) * 60 + g.variables.value(V.V_0003_Current_Minute),
       hourStart * 60 + minStart + 30);
    check("but it still said something", g.messages.length > msgAfter1);
  });

  scenario("Search point: a gated point charges nothing while it is still shut", () => {
    const g = newGame(db, 29);
    runMapAutoruns(g, 5);
    runMapAutoruns(g, 20);
    g.switches.setValue(S.S_0903_QA_Ignore_AP, false);
    g.variables.setValue(V.V_0005_AP_Remaining, 5);
    // poi_study_desk is gated on day >= 2, and it is day 1.
    const r = triggerEvent(g, 20, "EV_SEARCH_poi_study_desk");
    check("it ran", r.ran);
    eq("no AP charged while gated", g.variables.value(V.V_0005_AP_Remaining), 5);
    const pi = findProperPageIndex(g, 20, db.maps[20].events.find((e) => e && e.name === "EV_SEARCH_poi_study_desk"));
    eq("it stays searchable (still on page 1)", pi, 0);

    // On day 2 the same point now pays out.
    g.variables.setValue(V.V_0001_Current_Day, 2);
    triggerEvent(g, 20, "EV_SEARCH_poi_study_desk");
    eq("now it costs 1 AP", g.variables.value(V.V_0005_AP_Remaining), 4);
  });

  scenario("Search: spending the last AP offers the day end but never forces it", () => {
    const g = newGame(db, 31);
    runMapAutoruns(g, 5);
    runMapAutoruns(g, 20);
    g.switches.setValue(S.S_0903_QA_Ignore_AP, false);
    g.variables.setValue(V.V_0005_AP_Remaining, 1);
    triggerEvent(g, 20, "EV_SEARCH_poi_hall_portraits");
    eq("AP is now zero", g.variables.value(V.V_0005_AP_Remaining), 0);
    check("the day end became available", g.switches.value(S.S_0014_Day_End_Available));
    eq("but the day did NOT advance on its own", g.variables.value(V.V_0001_Current_Day), 1);
  });

  // --------------------------------------------------------------- DAY CYCLE
  scenario("Day end: advances exactly one day and cannot double-advance", () => {
    const g = newGame(db, 37);
    runMapAutoruns(g, 5);
    eq("starts on day 1", g.variables.value(V.V_0001_Current_Day), 1);
    callCommonEvent(g, 5);
    eq("now day 2", g.variables.value(V.V_0001_Current_Day), 2);
    check("day 1 is marked complete", g.switches.value(S.S_0120_Day_1_Complete));
    eq("AP refilled", g.variables.value(V.V_0005_AP_Remaining), 5);
    check("day-end request cleared", !g.switches.value(S.S_0009_Day_End_Requested));

    // Re-entering day end for a day already completed must not skip a day.
    g.variables.setValue(V.V_0001_Current_Day, 1);
    callCommonEvent(g, 5);
    eq("re-running day end on a completed day does nothing", g.variables.value(V.V_0001_Current_Day), 1);
  });

  scenario("Day cycle: all ten days advance, then the final phase begins", () => {
    const g = newGame(db, 41);
    runMapAutoruns(g, 5);
    for (let d = 1; d <= 9; d++) {
      eq(`day ${d} before end`, g.variables.value(V.V_0001_Current_Day), d);
      callCommonEvent(g, 5);
    }
    eq("reached day 10", g.variables.value(V.V_0001_Current_Day), 10);
    check("final phase not yet set", !g.switches.value(S.S_0010_Final_Phase));
    callCommonEvent(g, 5);
    check("day 10 ends into the final phase", g.switches.value(S.S_0010_Final_Phase));
    eq("the calendar does not run past 10", g.variables.value(V.V_0001_Current_Day), 10);
  });

  // ----------------------------------------------------------------- ENDINGS
  scenario("Ending resolver: every culprit x strategy x quality yields a result", () => {
    let combos = 0, failures = [];
    for (let culprit = 1; culprit <= 6; culprit++) {
      for (let strategy = 0; strategy <= 3; strategy++) {
        for (let quality = 0; quality <= 3; quality++) {
          const g = newGame(db, 100 + combos);
          g.variables.setValue(V.V_0006_Culprit_ID, culprit);
          g.switches.setValue(S.S_0002_Culprit_Locked, true);
          g.variables.setValue(V.V_0007_Strategy_ID, strategy);
          g.variables.setValue(V.V_0008_Strategy_Quality, quality);
          callCommonEvent(g, 22);
          const result = g.variables.value(V.V_0030_Final_Result_ID);
          combos++;
          if (!(result > 0)) failures.push(`culprit=${culprit} strategy=${strategy} quality=${quality}`);
        }
      }
    }
    eq("combinations exercised", combos, 96);
    check("every combination produced a result > 0", failures.length === 0, failures.slice(0, 6).join("; "));
  });

  scenario("Ending resolver: no strategy at all still resolves (the fallback leaf)", () => {
    for (let culprit = 1; culprit <= 6; culprit++) {
      const g = newGame(db, 200 + culprit);
      g.variables.setValue(V.V_0006_Culprit_ID, culprit);
      g.variables.setValue(V.V_0007_Strategy_ID, 0);
      callCommonEvent(g, 22);
      check(`culprit ${culprit} with strategy=none resolves`, g.variables.value(V.V_0030_Final_Result_ID) > 0,
            `result=${g.variables.value(V.V_0030_Final_Result_ID)}`);
    }
  });

  // ------------------------------------------------------------------ AUDIO
  scenario("Audio: re-entering a map does not restart the same track", () => {
    const g = newGame(db, 43);
    runMapAutoruns(g, 5);
    runMapAutoruns(g, 20);
    const profileAfterFirst = g.variables.value(V.V_0027_Previous_BGM_State);
    callCommonEvent(g, 10);
    eq("the audio profile did not change on a second refresh", g.variables.value(V.V_0027_Previous_BGM_State), profileAfterFirst);
  });

  scenario("Autosave: locked scenes are never autosaved into", () => {
    const g = newGame(db, 47);
    g.switches.setValue(S.S_0005_Save_Locked, true);
    const before = g.autosaves;
    callCommonEvent(g, 23);
    eq("no autosave while save is locked", g.autosaves, before);
    g.switches.setValue(S.S_0005_Save_Locked, false);
    callCommonEvent(g, 23);
    check("autosave happens once unlocked", g.autosaves > before);
  });

  // ------------------------------------------------------- NPC SINGLETON
  scenario("NPC singleton: at most one visible instance per NPC, every day and block", () => {
    const npcs = [...new Set(Object.keys(S).filter((n) => /^S_1\d+_NPCInst_/.test(n))
      .map((n) => n.match(/NPCInst_(.+?)_/)[1]))];
    check("instance switches were generated", npcs.length > 0, `${npcs.length} NPCs`);
    let worst = 0, offenders = [];
    let combos = 0;
    for (let day = 1; day <= 10; day++) {
      for (let block = 1; block <= 5; block++) {
        const g = newGame(db, 1000 + day * 10 + block);
        g.variables.setValue(V.V_0001_Current_Day, day);
        g.variables.setValue(V.V_0004_Time_Block, block);
        callCommonEvent(g, 9);
        for (const npc of npcs) {
          combos++;
          const on = Object.keys(S).filter((n) => n.includes(`NPCInst_${npc}_`) && g.switches.value(S[n]));
          if (on.length > 1) {
            worst = Math.max(worst, on.length);
            if (offenders.length < 5) offenders.push(`${npc} d${day}b${block}: ${on.length}`);
          }
        }
      }
    }
    eq("combinations checked", combos, npcs.length * 50);
    check("no NPC is ever visible in two places at once", worst <= 1, offenders.join("; "));
  });

  scenario("NPC placement: two different NPCs never share a cell", () => {
    let collisions = [];
    for (let day = 1; day <= 10; day++) {
      for (let block = 1; block <= 5; block++) {
        const g = newGame(db, 2000 + day * 10 + block);
        g.variables.setValue(V.V_0001_Current_Day, day);
        g.variables.setValue(V.V_0004_Time_Block, block);
        callCommonEvent(g, 9);
        const cells = {};
        for (const ev of db.maps[20].events) {
          if (!ev || !/^EV_NPC_/.test(ev.name)) continue;
          const pi = findProperPageIndex(g, 20, ev);
          if (pi < 1) continue;                  // page 1 is the inactive state
          const k = `${ev.x},${ev.y}`;
          (cells[k] = cells[k] || []).push(ev.name);
        }
        for (const [k, v] of Object.entries(cells)) {
          if (v.length > 1 && collisions.length < 5) collisions.push(`d${day}b${block} ${k}: ${v.join(" + ")}`);
        }
      }
    }
    check("no cell holds two active NPCs", collisions.length === 0, collisions.join("; "));
  });

  scenario("NPC instances: an inactive instance holds no collision", () => {
    const g = newGame(db, 3001);
    let blocking = 0, visible = 0;
    for (const ev of db.maps[20].events) {
      if (!ev || !/^EV_NPC_/.test(ev.name)) continue;
      const pg = ev.pages[0];                    // the inactive page
      if (pg.priorityType === 1 && !pg.through) blocking++;
      if (pg.image.characterName) visible++;
    }
    eq("no inactive instance blocks its cell", blocking, 0);
    eq("no inactive instance shows a sprite", visible, 0);
  });

  // ------------------------------------------------------------- DIALOGUE
  scenario("Every dialogue scene runs to completion and marks itself played", () => {
    const scenes = db.commonEvents.filter((e) => e && /^CE_DLG_SCENE_/.test(e.name));
    check("dialogue scenes were generated", scenes.length === 15, `${scenes.length} scenes`);
    for (const sc of scenes) {
      const g = newGame(db, 4000 + sc.id);
      g.variables.setValue(V.V_0006_Culprit_ID, 3);
      g.switches.setValue(S.S_0002_Culprit_Locked, true);
      let ok = true, msg = "";
      try { callCommonEvent(g, sc.id); } catch (e) { ok = false; msg = e.message; }
      check(`${sc.name} terminates`, ok, msg);
      if (ok) check(`  ${sc.name} shows dialogue`, g.messages.length > 0, `${g.messages.length} windows`);
    }
  });

  scenario("A dialogue scene never replays", () => {
    const scene = db.commonEvents.find((e) => e && e.name === "CE_DLG_SCENE_MARLENA_FILES");
    check("scene found", !!scene);
    const g = newGame(db, 4100);
    callCommonEvent(g, scene.id);
    const first = g.messages.length;
    check("it played", first > 0, `${first} windows`);
    callCommonEvent(g, scene.id);
    eq("a second call shows nothing new", g.messages.length, first);
  });

  scenario("Dialogue evidence is granted once, however the scene is reached", () => {
    const scene = db.commonEvents.find((e) => e && e.name === "CE_DLG_SCENE_LINDA_SHIFTS");
    const g = newGame(db, 4200);
    callCommonEvent(g, scene.id);
    const afterFirst = JSON.stringify(g.items);
    check("the scene granted evidence", Object.keys(g.items).length > 0, afterFirst);
    // Force the scene guard off, as a reloaded save or a second trigger would.
    g.switches.setValue(1109, false);
    callCommonEvent(g, scene.id);
    eq("no duplicate evidence", JSON.stringify(g.items), afterFirst);
  });

  scenario("Dialogue speaker names and faces survive generation", () => {
    const g = newGame(db, 4300);
    const scene = db.commonEvents.find((e) => e && e.name === "CE_DLG_SCENE_ROLAND_PACKET");
    callCommonEvent(g, scene.id);
    const named = g.messages.filter((m) => m.speaker);
    const faced = g.messages.filter((m) => m.faceName);
    check("lines carry a speaker name", named.length > 0, `${named.length} of ${g.messages.length}`);
    check("lines carry a face", faced.length > 0, `${faced.length} of ${g.messages.length}`);
    check("face indices are valid", g.messages.every((m) => m.faceIndex >= 0 && m.faceIndex <= 7));
  });

  // ----------------------------------------------------- INTERPRETER SAFETY
  scenario("Every Common Event terminates from a cold start", () => {
    for (let id = 1; id <= 25; id++) {
      const g = newGame(db, 53);
      g.variables.setValue(V.V_0006_Culprit_ID, 3);
      let ok = true, msg = "";
      try { callCommonEvent(g, id); } catch (e) { ok = false; msg = e.message; }
      check(`CE_${String(id).padStart(3, "0")} terminates`, ok, msg);
    }
  });

  scenario("No map leaves an Autorun running", () => {
    for (const mapId of Object.keys(db.maps).map(Number)) {
      const g = newGame(db, 59);
      if (mapId !== 5) runMapAutoruns(g, 5);       // reach the manor legitimately
      g.mapId = mapId;
      g.switches.setValue(17, true);
      const r = runMapAutoruns(g, mapId);
      check(`map ${mapId} settles`, r.settled, `passes=${r.passes}, ran=${JSON.stringify(r.executed.slice(0, 3))}`);
    }
  });

  return report();
}

function report() {
  let pass = 0, fail = 0;
  console.log("Gray Stone regression suite (headless MZ interpreter)");
  console.log("=".repeat(74));
  for (const s of results) {
    const bad = s.checks.filter((c) => !c.pass);
    const status = s.error ? "ERROR" : bad.length ? "FAIL" : "PASS";
    console.log(`\n[${status}] ${s.name}`);
    if (s.error) { console.log(`   ! ${s.error}`); fail++; continue; }
    for (const c of s.checks) {
      if (c.pass) { pass++; continue; }
      fail++;
      console.log(`   FAIL  ${c.label}${c.detail ? "  -- " + c.detail : ""}`);
    }
    if (!bad.length) console.log(`   ${s.checks.length} check(s) passed`);
  }
  console.log("\n" + "=".repeat(74));
  console.log(`${pass} checks passed, ${fail} failed, across ${results.length} scenarios`);
  return fail ? 1 : 0;
}

if (require.main === module) process.exit(main());
module.exports = { main };
