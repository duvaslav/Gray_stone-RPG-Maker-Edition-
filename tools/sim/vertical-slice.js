#!/usr/bin/env node
"use strict";
// Day 1 vertical slice, end to end.   node tools/sim/vertical-slice.js
//
// The route the brief specifies:
//   New Game -> prologue -> enter the manor -> control -> conversation ->
//   investigation -> clue -> time/AP update -> repeat interaction ->
//   NPC scheduling -> save -> load -> correct state restored
//
// This runs the real generated command lists and prints what actually happened
// at each step, so the slice is evidence rather than a claim.
const fs = require("fs");
const path = require("path");
const { Game, runMapAutoruns, triggerEvent, findProperPageIndex } = require("./interpreter");

const DATA = path.join(__dirname, "..", "..", "data");
const read = (n) => JSON.parse(fs.readFileSync(path.join(DATA, n), "utf8"));

function loadDb() {
  const mapInfos = read("MapInfos.json");
  const maps = {};
  for (let i = 1; i < mapInfos.length; i++) if (mapInfos[i]) maps[i] = read(`Map${String(i).padStart(3, "0")}.json`);
  return { system: read("System.json"), mapInfos, maps, commonEvents: read("CommonEvents.json"), items: read("Items.json") };
}

const failures = [];
function assert(label, cond, detail) {
  const mark = cond ? "  ok " : "  XX ";
  console.log(`${mark} ${label}${detail ? "   " + detail : ""}`);
  if (!cond) failures.push(label);
}

function step(n, title) { console.log(`\n--- ${n}. ${title} ${"-".repeat(Math.max(0, 56 - title.length))}`); }

function clock(g, V) {
  const h = g.variables.value(V.V_0002_Current_Hour);
  const m = g.variables.value(V.V_0003_Current_Minute);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function main() {
  const db = loadDb();
  const S = {}, V = {};
  db.system.switches.forEach((n, i) => { if (n) S[n] = i; });
  db.system.variables.forEach((n, i) => { if (n) V[n] = i; });

  console.log("Gray Stone - Day 1 vertical slice");
  console.log("=".repeat(66));

  // 1 ---------------------------------------------------------------- NEW GAME
  step(1, "New Game");
  const g = new Game(db);
  g.switches.setValue(17, true);
  assert("starts on the prologue map", g.mapId === 5, `map ${g.mapId} at (${g.playerX},${g.playerY})`);

  // 2 ---------------------------------------------------------------- PROLOGUE
  step(2, "Prologue cutscene");
  const pr = runMapAutoruns(g, 5);
  assert("the Autorun terminated", pr.settled, `${pr.passes} pass(es)`);
  assert("dialogue was shown", g.messages.length > 0, `${g.messages.length} message windows`);
  const speakers = [...new Set(g.messages.map((m) => m.speaker).filter(Boolean))];
  assert("named speakers appeared", speakers.length >= 2, speakers.join(", "));
  const withFaces = g.messages.filter((m) => m.faceName).length;
  assert("speaker lines carry a face", withFaces > 0, `${withFaces} of ${g.messages.length}`);
  const culprit = g.variables.value(V.V_0006_Culprit_ID);
  assert("a culprit was chosen and locked", culprit >= 1 && culprit <= 6 && g.switches.value(S.S_0002_Culprit_Locked), `Culprit_ID=${culprit} (hidden from the player)`);
  assert("BGM and BGS were started", !!g.bgm || !!g.bgs, `bgm=${g.bgm && g.bgm.name} bgs=${g.bgs && g.bgs.name}`);

  // 3 ------------------------------------------------------------ ENTER MANOR
  step(3, "Enter the manor");
  assert("transferred into the vestibule", g.mapId === 20 && g.playerX === 22 && g.playerY === 31, `map ${g.mapId} at (${g.playerX},${g.playerY})`);
  const entry = runMapAutoruns(g, 20);
  assert("map entry settled", entry.settled);
  assert("the entry guard was consumed", !g.switches.value(S.S_0017_Map_Entry_Pending));
  assert("evening lighting applied", g.tone[0] < 0, `tint ${JSON.stringify(g.tone)}`);

  // 4 ----------------------------------------------------------------- CONTROL
  step(4, "Control returned to the player");
  assert("menu unlocked", g.menuEnabled);
  assert("save unlocked", g.saveEnabled);
  assert("player visible", !g.transparent);
  assert(`day 1, ${clock(g, V)}, block ${g.variables.value(V.V_0004_Time_Block)} (Evening)`,
         g.variables.value(V.V_0001_Current_Day) === 1 && g.variables.value(V.V_0004_Time_Block) === 4);
  assert("5 AP available", g.variables.value(V.V_0005_AP_Remaining) === 5);

  // 5 ------------------------------------------------------------ CONVERSATION
  step(5, "Conversation with Roland");
  // Find Roland where his SCHEDULE actually puts him at day 1 evening, rather
  // than assuming a room. If the schedule moves him, this follows.
  const rolandEvent = db.maps[20].events.find((e) =>
    e && /^EV_NPC_roland_/.test(e.name) && findProperPageIndex(g, 20, e) >= 1);
  assert("Roland is somewhere on the ground floor this block", !!rolandEvent,
         rolandEvent ? `${rolandEvent.name} at (${rolandEvent.x},${rolandEvent.y})` : "not scheduled here");
  const msgBefore = g.messages.length;
  const apBefore = g.variables.value(V.V_0005_AP_Remaining);
  const timeBefore = clock(g, V);
  const r1 = triggerEvent(g, 20, rolandEvent.name);
  assert("Roland responded", r1.ran && g.messages.length > msgBefore, `${g.messages.length - msgBefore} new window(s)`);
  assert("talking cost no AP", g.variables.value(V.V_0005_AP_Remaining) === apBefore, `AP still ${apBefore}`);
  assert("talking cost no time", clock(g, V) === timeBefore, `still ${timeBefore}`);
  const msgBefore2 = g.messages.length;
  triggerEvent(g, 20, rolandEvent.name);
  assert("a second approach also costs nothing", g.variables.value(V.V_0005_AP_Remaining) === apBefore);
  assert("and still says something", g.messages.length > msgBefore2);

  // 6 ----------------------------------------------------------- INVESTIGATION
  step(6, "Investigation: search the laundry baskets");
  g.switches.setValue(S.S_0903_QA_Ignore_AP, false);
  const apPre = g.variables.value(V.V_0005_AP_Remaining);
  const tPre = g.variables.value(V.V_0002_Current_Hour) * 60 + g.variables.value(V.V_0003_Current_Minute);
  const itemsPre = Object.keys(g.items).length;

  const s1 = triggerEvent(g, 20, "EV_SEARCH_poi_laundry_baskets");
  assert("the search ran (first look)", s1.ran && s1.page === 1);
  const apPost = g.variables.value(V.V_0005_AP_Remaining);
  const tPost = g.variables.value(V.V_0002_Current_Hour) * 60 + g.variables.value(V.V_0003_Current_Minute);
  assert("1 AP spent", apPre - apPost === 1, `${apPre} -> ${apPost}`);
  assert("30 minutes spent", tPost - tPre === 30, `${timeBefore} -> ${clock(g, V)}`);

  // clue_linda_linen_mark is scoped to the Linda version only
  const gotClue = g.itemCount(120) > 0;
  if (culprit === 1) {
    assert("the Linda-version clue was awarded", gotClue, "item 120 in the case file");
  } else {
    assert("no Linda-version clue in this run (correct)", !gotClue, `culprit is ${culprit}, not Linda`);
  }

  // 7 ------------------------------------------------------- REPEAT INTERACTION
  step(7, "Repeat the same interaction");
  const apRepeat = g.variables.value(V.V_0005_AP_Remaining);
  const tRepeat = g.variables.value(V.V_0002_Current_Hour) * 60 + g.variables.value(V.V_0003_Current_Minute);
  const itemsRepeat = JSON.stringify(g.items);
  const s2 = triggerEvent(g, 20, "EV_SEARCH_poi_laundry_baskets");
  assert("the second look ran page 2", s2.ran && s2.page === 2);
  assert("no AP charged again", g.variables.value(V.V_0005_AP_Remaining) === apRepeat);
  assert("no time charged again", g.variables.value(V.V_0002_Current_Hour) * 60 + g.variables.value(V.V_0003_Current_Minute) === tRepeat);
  assert("no duplicate evidence", JSON.stringify(g.items) === itemsRepeat, `case file unchanged: ${itemsRepeat}`);

  // 8 -------------------------------------------------------- NPC SCHEDULING
  step(8, "NPC scheduling: one visible instance");
  const roland = db.maps[20].events.filter((e) => e && /NPC_roland/.test(e.name));
  let visible = 0;
  for (const ev of roland) {
    const pi = findProperPageIndex(g, 20, ev);
    if (pi >= 0 && ev.pages[pi].image.characterName) visible++;
  }
  assert("exactly one visible Roland instance", visible === 1, `${visible} of ${roland.length} instance event(s) on this floor`);
  // And nobody else is standing in his cell.
  const sharing = db.maps[20].events.filter((e) =>
    e && /^EV_NPC_/.test(e.name) && e.x === rolandEvent.x && e.y === rolandEvent.y &&
    findProperPageIndex(g, 20, e) >= 1);
  assert("no other NPC shares his cell", sharing.length === 1, sharing.map((e) => e.name).join(", "));

  // 9 ------------------------------------------------------------ SAVE / LOAD
  step(9, "Save, then load");
  const blob = g.save();
  const snapshot = {
    culprit: g.variables.value(V.V_0006_Culprit_ID),
    day: g.variables.value(V.V_0001_Current_Day),
    ap: g.variables.value(V.V_0005_AP_Remaining),
    time: clock(g, V),
    items: JSON.stringify(g.items),
    talk: g.variables.value(V.V_0101_Talk_Count_roland),
  };
  console.log(`     saved: culprit=${snapshot.culprit} day=${snapshot.day} ${snapshot.time} AP=${snapshot.ap} talks=${snapshot.talk}`);

  const g2 = new Game(db);
  g2.load(blob);
  g2.switches.setValue(17, true);              // Game_Map.setup on load
  const after = runMapAutoruns(g2, 20);
  assert("map entry ran after load", after.settled && after.executed.length === 1);

  assert("culprit unchanged", g2.variables.value(V.V_0006_Culprit_ID) === snapshot.culprit, `still ${snapshot.culprit}`);
  assert("day unchanged", g2.variables.value(V.V_0001_Current_Day) === snapshot.day);
  assert("clock unchanged", clock(g2, V) === snapshot.time, snapshot.time);
  assert("AP unchanged", g2.variables.value(V.V_0005_AP_Remaining) === snapshot.ap, `AP=${snapshot.ap}`);
  assert("case file unchanged", JSON.stringify(g2.items) === snapshot.items);
  assert("conversation history unchanged", g2.variables.value(V.V_0101_Talk_Count_roland) === snapshot.talk);
  assert("ambience restored", g2.tone[0] < 0, `tint ${JSON.stringify(g2.tone)}`);

  step(10, "One-shot scenes do not replay after load");
  const s3 = triggerEvent(g2, 20, "EV_SEARCH_poi_laundry_baskets");
  assert("the searched point is still spent", s3.page === 2);
  assert("no evidence duplicated by the reload", JSON.stringify(g2.items) === snapshot.items);
  assert("AP not re-charged", g2.variables.value(V.V_0005_AP_Remaining) === snapshot.ap);
  // Count AFTER the search above, or the search's own "already looked" line
  // would be mistaken for the prologue replaying.
  const msgAfterLoad = g2.messages.length;
  g2.mapId = 5;
  g2.switches.setValue(17, true);
  const pr2 = runMapAutoruns(g2, 5);
  assert("the prologue does not replay", pr2.executed.length === 0 && g2.messages.length === msgAfterLoad);

  console.log("\n" + "=".repeat(66));
  if (failures.length) {
    console.log(`VERTICAL SLICE FAILED: ${failures.length} check(s)`);
    failures.forEach((f) => console.log(`  - ${f}`));
    return 1;
  }
  console.log("VERTICAL SLICE PASSED - New Game through save/load, end to end.");
  return 0;
}

if (require.main === module) process.exit(main());
module.exports = { main };
