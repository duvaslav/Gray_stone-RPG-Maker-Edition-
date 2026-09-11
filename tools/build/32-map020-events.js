"use strict";
// Events for MAP_020 Manor Ground Floor.
//
// Patterns used (docs/EVENT_ARCHITECTURE.md):
//   PAT_MAP_ENTER   one guarded Autorun that refreshes ambience and schedules
//   PAT_SEARCH      two-page search point; page 2 is the already-searched state
//   PAT_DOOR        transfer / locked-route gate
//   PAT_NPC_INSTANCE one visible instance per NPC per day+block
const { table, num } = require("../lib/spec");
const { CmdList, Route, audio, page, event, blankPage, DIR, C } = require("../lib/mz");
const tiles = require("../lib/tiles");

// Graphic for each search point: interactive furniture is the EVENT, not a map
// tile, so there is exactly one object in the cell and no tile/event mismatch.
const POI_TILE = {
  poi_hall_portraits: "PAINTING",
  poi_hall_keys: "CABINET",
  poi_study_desk: "DESK",
  poi_library_catalog: "BOOKSHELF",
  poi_archive_medical: "CABINET",
  poi_archive_grey: "CABINET",
  poi_dining_service: "CABINET",
  poi_kitchen_ledger: "COUNTER",
  poi_laundry_baskets: "CRATE",
  poi_laundry_schedule: "COUNTER",
};

// Flavour for each point: what Leonard finds, and what he finds on a second look.
const POI_TEXT = {
  poi_hall_portraits: {
    first: ["Портреты Грейстоунов висят ровным рядом.", "Под одним — табличка перевёрнута."],
    again: ["Портреты. Вы уже смотрели на них", "дольше, чем следовало."],
  },
  poi_hall_keys: {
    first: ["Доска с ключами. Один крючок пуст,", "и пыль вокруг него стёрта."],
    again: ["Крючок всё так же пуст."],
  },
  poi_study_desk: {
    first: ["Ваш стол. Бумаги лежат не так,", "как вы их оставили."],
    again: ["Больше на столе ничего нет."],
  },
  poi_library_catalog: {
    first: ["Каталог выдачи книг.", "Последняя запись оборвана."],
    again: ["Записи вы уже прочли."],
  },
  poi_archive_medical: {
    first: ["Медицинский журнал Элеоноры.", "Одного листа не хватает."],
    again: ["Журнал вы уже осмотрели."],
  },
  poi_archive_grey: {
    first: ["Серый реестр. Имена, даты, суммы —", "и почерк меняется на середине."],
    again: ["Реестр вы уже просмотрели."],
  },
  poi_dining_service: {
    first: ["Сервировочный шкаф.", "Один прибор не на месте."],
    again: ["Шкаф вы уже осмотрели."],
  },
  poi_kitchen_ledger: {
    first: ["Книга закупок. Травы заказаны", "в количестве, которого кухня не просила."],
    again: ["Книгу вы уже читали."],
  },
  poi_laundry_baskets: {
    first: ["Корзины с бельём.", "На одной манжете — тёмное пятно."],
    again: ["Бельё вы уже перебрали."],
  },
  poi_laundry_schedule: {
    first: ["График смен. Одна подпись", "поставлена другой рукой."],
    again: ["График вы уже изучили."],
  },
};

// Routes off this map. The destination maps are not built yet, so each one is a
// gate that says so in character instead of a Transfer to a map that does not
// exist -- an invalid transfer is a crash, and a silent dead end is a softlock.
const EXITS = [
  { x: 22, y: 32, to: "MAP_010", name: "EV_DOOR_FRONT", text: ["Парадная дверь. Снаружи уже темно —", "двор подождёт до утра."] },
  { x: 42, y: 11, to: "MAP_010", name: "EV_DOOR_SERVICE", text: ["Служебный выход во двор.", "Сейчас там никого."] },
  { x: 23, y: 13, to: "MAP_030", name: "EV_STAIR_GRAND", text: ["Парадная лестница ведёт наверх.", "Ваши покои готовы — но не сейчас."] },
  { x: 28, y: 14, to: "MAP_030", name: "EV_STAIR_SERVICE", text: ["Служебная лестница.", "Наверху — крыло прислуги."] },
  { x: 36, y: 5, to: "MAP_040", name: "EV_STAIR_BASEMENT", text: ["Лестница в подвал.", "Дверь внизу заперта."], switchName: "S_0207_Basement_Access" },
];

// Which clues a search point yields, from 25_Clue_Logic. A clue scoped to one
// culprit is only present in that culprit's run, so it is emitted behind that
// run's version switch -- the point still works in every other run, it simply
// has nothing of that kind to find.
const CULPRIT_SWITCH = {
  linda: "S_0020_Version_Linda", celeste: "S_0021_Version_Celeste",
  vera: "S_0022_Version_Vera", beatrice: "S_0023_Version_Beatrice",
  nika: "S_0024_Version_Nika", agnes: "S_0025_Version_Agnes",
};

function cluesForPoi(poiId) {
  return table("25_Clue_Logic")
    .filter((r) => String(r["физический источник"]).includes(poiId))
    .map((r) => ({
      clueId: r.clue_id,
      itemId: num(r.item_id),
      scope: String(r.culprit_scope || "Universal").trim(),
    }))
    .filter((c) => c.itemId > 0);
}

function searchPoints() {
  return table("24_Search_Points")
    .filter((r) => r.map_key === "MAP_020_Manor_Ground_Floor")
    .map((r) => ({
      id: r.poi_id,
      x: num(r.x), y: num(r.y),
      eventKey: r.event_key,
      ap: num(r["стоимость ОД"], 1),
      minutes: num(r["стоимость минут"], 30),
      condition: String(r["условие"] || "true").trim(),
    }));
}

// Native page conditions only understand a switch, a variable >= constant, a
// self switch, an item or an actor. A workbook condition string is translated
// into a runtime Conditional Branch instead, which native branches DO support.
function conditionBranch(c, cond) {
  const m = cond.match(/^day\s*>=\s*(\d+)$/i);
  if (m) { c.ifVar(c._V("V_0001_Current_Day"), Number(m[1]), 1); return true; }
  const f = cond.match(/^(\w+)\s*=\s*true$/i);
  if (f) {
    const swName = Object.keys(c._reg.switches.byName).find((n) => n.toLowerCase().endsWith("_" + f[1].toLowerCase()) || n.toLowerCase().includes(f[1].toLowerCase()));
    if (swName) { c.ifSwitch(c._reg.S(swName)); return true; }
  }
  return false; // "true" and anything unrecognised: always available
}

function build(reg, ctx) {
  const { S, V } = reg;
  const B = (k) => tiles.resolve("inside", k).id;
  const events = [];
  let nextId = 1;
  const add = (e) => { e.id = nextId++; events.push(e); return e; };

  // --- 1. map entry --------------------------------------------------------
  // Guarded Autorun, not a Parallel: it does its work once per arrival and then
  // switches itself off, so nothing runs per frame. GrayStone_Core re-arms the
  // guard in Game_Map.setup, which covers a load as well as a transfer.
  {
    const c = new CmdList();
    c.comment("PAT_MAP_ENTER. Re-armed by GrayStone_Core on every Game_Map.setup.");
    c.switchOff(S("S_0017_Map_Entry_Pending"));
    c.callCommon(24);
    c.exitEvent();
    add(event({
      name: "EV_MAP_ENTER", x: 1, y: 1,
      pages: [
        page({
          trigger: 3, priorityType: 0, through: true, walkAnime: false, directionFix: true,
          conditions: { switch1Valid: true, switch1Id: S("S_0017_Map_Entry_Pending") },
          list: c.done(),
        }),
      ],
    }));
  }

  // --- 2. search points ----------------------------------------------------
  const reserved = new Set();
  for (const p of searchPoints()) {
    reserved.add(`${p.x},${p.y}`);
    const text = POI_TEXT[p.id] || { first: ["Здесь ничего нет."], again: ["Здесь ничего нет."] };

    // page 1: not yet searched
    const c = new CmdList();
    c._V = V; c._reg = reg;
    c.comment(`PAT_SEARCH ${p.id}. Costs ${p.ap} AP / ${p.minutes} min exactly once.`);
    const gated = conditionBranch(c, p.condition);
    c.text(text.first, { background: 0 });

    // Award whatever this point actually yields. Several points are
    // information-only by design (24_Search_Points marks their result type as
    // historical or access rather than evidence) and award nothing.
    const yields = cluesForPoi(p.id);
    for (const y of yields) {
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

    c.comment("Charge time and AP as one atomic step, then bank the result.");
    c.varSet(V("V_0021_Action_Minutes"), p.minutes);
    c.varSet(V("V_0022_Action_AP_Cost"), p.ap);
    c.callCommon(7);
    c.selfSwitch("A", true);
    c.switchOn(S("S_0003_Derived_States_Dirty"));
    if (gated) {
      c.else_();
      c.comment("Condition not met: no AP, no minutes, no self switch -- it stays searchable.");
      c.text(["Сейчас здесь нечего искать."], { background: 1 });
      c.endIf();
    }

    // page 2: already searched -- free, and gives nothing a second time
    const c2 = new CmdList();
    c2.comment("Already searched: no item, no AP, no minutes. Re-reading is free.");
    c2.text(text.again, { background: 1 });

    add(event({
      name: p.eventKey, x: p.x, y: p.y,
      note: `<poi:${p.id}>`,
      pages: [
        page({
          trigger: 0, priorityType: 1, directionFix: true, walkAnime: false,
          image: { tileId: B(POI_TILE[p.id] || "CABINET"), characterName: "", characterIndex: 0, direction: DIR.DOWN, pattern: 1 },
          list: c.done(),
        }),
        page({
          trigger: 0, priorityType: 1, directionFix: true, walkAnime: false,
          conditions: { selfSwitchValid: true, selfSwitchCh: "A" },
          image: { tileId: B(POI_TILE[p.id] || "CABINET"), characterName: "", characterIndex: 0, direction: DIR.DOWN, pattern: 1 },
          list: c2.done(),
        }),
      ],
    }));
  }

  // --- 3. exits and stairs -------------------------------------------------
  for (const e of EXITS) {
    reserved.add(`${e.x},${e.y}`);
    const c = new CmdList();
    c.comment(`PAT_DOOR ${e.name} -> ${e.to}. Gate, not a Transfer: ${e.to} is not built yet.`);
    if (e.switchName) {
      c.ifSwitch(S(e.switchName), false);
        c.text(e.text, { background: 1 });
        c.exitEvent();
      c.endIf();
    }
    c.text(e.text, { background: 1 });
    add(event({
      name: e.name, x: e.x, y: e.y,
      note: `<exit_to:${e.to}>`,
      pages: [page({ trigger: 0, priorityType: 0, through: true, directionFix: true, walkAnime: false, list: c.done() })],
    }));
  }

  // --- 4. secret panel -----------------------------------------------------
  {
    const c = new CmdList();
    c.comment("PAT_SECRET_PANEL. Closed until S_0205_Panel_Unlocked; never a dead end.");
    c.ifSwitch(S("S_0205_Panel_Unlocked"), false);
      c.text(["Книжная полка примыкает к стене", "неплотно. Но открыть её нечем."], { background: 1 });
      c.exitEvent();
    c.endIf();
    c.text(["Панель поддаётся.", "За ней — темнота и холодный воздух."], { background: 1 });
    add(event({
      name: "EV_SECRET_PANEL_LIBRARY", x: 4, y: 8,
      note: "<secret:passage_library_branch>",
      pages: [page({ trigger: 0, priorityType: 1, directionFix: true, walkAnime: false,
        image: { tileId: B("BOOKSHELF"), characterName: "", characterIndex: 0, direction: DIR.DOWN, pattern: 1 },
        list: c.done() })],
    }));
    reserved.add("4,8");
  }

  // --- 5. Roland, the one NPC instance the Day 1 slice needs ---------------
  {
    const c = new CmdList();
    c.comment([
      "PAT_NPC_INSTANCE Roland, main hall, Day 1 evening.",
      "Talking costs no AP and no minutes -- only investigation does.",
    ].join("\n"));
    c.varSet(V("V_0025_Current_NPC_ID"), 1);
    c.ifSwitch(S("S_0013_Arrived"));
      c.ifVar(V("V_0101_Talk_Count_roland"), 0, 0);
        c.text(["Дом готов принять вас, господин граф.", "Ужин подадут в девять."],
               { faceName: "People1", faceIndex: 0, background: 0, speaker: "Роланд" });
        c.text(["Если позволите — госпожа Марлена", "ждала этого разговора весь месяц."],
               { faceName: "People1", faceIndex: 0, background: 0, speaker: "Роланд" });
        c.varAdd(V("V_0101_Talk_Count_roland"), 1);
        c.varFromVar(V("V_0103_Last_Talk_Day_roland"), V("V_0001_Current_Day"), 0);
        c.varFromVar(V("V_0104_Last_Talk_Block_roland"), V("V_0004_Time_Block"), 0);
      c.else_();
        c.comment("Already spoken to this run: hand off to the repeat-dialogue system.");
        c.callCommon(17);
      c.endIf();
    c.else_();
      c.text(["…"], { background: 0 });
    c.endIf();
    c.varSet(V("V_0025_Current_NPC_ID"), 0);

    add(event({
      name: "EV_NPC_roland_hall", x: 22, y: 20,
      note: "<npc:roland><instance:hall>",
      pages: [
        page({
          trigger: 0, priorityType: 1, directionFix: false, walkAnime: true,
          conditions: { switch1Valid: true, switch1Id: S("S_0800_NPC_roland_Schedule_Valid") },
          image: { characterName: "People1", characterIndex: 0, direction: DIR.DOWN, pattern: 1 },
          list: c.done(),
        }),
      ],
    }));
    reserved.add("22,20");
  }

  return { events, reserved };
}

module.exports = { build, searchPoints, EXITS, POI_TILE };
