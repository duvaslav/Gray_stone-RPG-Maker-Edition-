"use strict";
// Gray Stone build entry point:  node tools/build/index.js
// spec/*.json  ->  data/*.json   (plus js/plugins.js)
const fs = require("fs");
const path = require("path");
const db = require("./00-database");
const ces = require("./10-common-events");
const dialogue = require("./80-dialogue");
const registry = require("../lib/registry");
const map005 = require("./20-map005-prologue");
const map005ev = require("./21-map005-events");
const furnishing = require("./62-furnish");
const npcSched = require("./50-npc-schedules");
const interior = require("../lib/interior");
const INTERIOR_PLANS = require("../data/interior-plans");
const mapEvents = require("./61-map-events");
const map010 = require("./70-map010-exterior");
const POI = require("../data/poi-text");
const tiles = require("../lib/tiles");

const ROOT = path.join(__dirname, "..", "..");
const DATA = path.join(ROOT, "data");

function write(name, obj) {
  fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(path.join(DATA, name), JSON.stringify(obj));
}

function buildSystem(reg) {
  const sound = (n, v = 90, p = 100) => ({ name: n, volume: v, pitch: p, pan: 0 });
  return {
    gameTitle: "Gray Stone",
    versionId: 1,
    locale: "ru_RU",
    // Prologue is the start map: a New Game opens on the cinematic drive.
    startMapId: 5, startX: 16, startY: 18,
    partyMembers: [1],
    currencyUnit: "ф.",
    // No combat anywhere in Gray Stone (RULE_NO_BATTLE).
    optDrawTitle1Name: "", optDrawTitle2Name: "",
    title1Name: "", title2Name: "",
    optTransparent: false, optFollowers: false, optSlipDeath: false,
    optFloorDeath: false, optDisplayTp: false, optExtraExp: false,
    optSideView: false, optAutosave: true, optKeyItemsNumber: false,
    battleSystem: 0, battleback1Name: "", battleback2Name: "",
    battlerHue: 0, battlerName: "",
    editMapId: 5,
    elements: ["", "Физический"],
    equipTypes: ["", "Оружие", "Щит", "Голова", "Тело", "Аксессуар"],
    skillTypes: ["", "Особое"],
    weaponTypes: [""], armorTypes: [""],
    switches: reg.switches.names,
    variables: reg.variables.names,
    terms: {
      basic: ["Ур", "Уровень", "HP", "HP", "MP", "MP", "TP", "TP", "Опыт", "EXP"],
      commands: [
        "Бой", "Побег", "Атака", "Защита", "Предмет", "Навык", "Экипировка",
        "Статус", "Строй", "Сохранить", "Выход", "Улики", "Оружие", "Броня",
        "Ключевые предметы", "Снять", "Настройки", "Громкость", "Новая игра",
        "Продолжить", null, "В меню", "Выйти из игры", "Дело", "Улики",
      ],
      params: ["MHP", "MMP", "АТК", "ЗАЩ", "МАТ", "МЗЩ", "ЛОВ", "УДЧ"],
      messages: {
        actionFailure: "Ничего не произошло.",
        actorDamage: "%1 получает %2 урона.",
        actorNoDamage: "%1 не получает урона.",
        alwaysDash: "Всегда бежать",
        bgmVolume: "Громкость BGM", bgsVolume: "Громкость BGS",
        meVolume: "Громкость ME", seVolume: "Громкость SE",
        commandRemember: "Запоминать команды",
        touchUI: "Сенсорный интерфейс",
        emerge: "", escapeFailure: "", escapeStart: "",
        expNext: "До %1", expTotal: "Всего %1",
        file: "Файл", loadMessage: "Загрузить сохранение?",
        saveMessage: "Сохранить игру?",
        obtainItem: "Получено: %1.",
        obtainExp: "", obtainGold: "", obtainSkill: "",
        levelUp: "", partyName: "%1 и спутники",
        possession: "Есть", preemptive: "", surprise: "",
        useItem: "%1 использует %2.", victory: "", defeat: "",
        buff: "", debuff: "", actorRecovery: "", actorGain: "", actorLoss: "",
        actorDrain: "", actorNoHit: "", enemyDamage: "", enemyNoDamage: "",
        enemyDrain: "", enemyGain: "", enemyLoss: "", enemyNoHit: "",
        enemyRecovery: "", evasion: "", magicEvasion: "", magicReflection: "",
        counterAttack: "", substitute: "", criticalToActor: "", criticalToEnemy: "",
      },
    },
    testBattlers: [], testTroopId: 1,
    titleBgm: sound("Theme1", 70), battleBgm: sound(""), victoryMe: sound(""),
    defeatMe: sound(""), gameoverMe: sound("Mystery", 70),
    sounds: [
      sound("Cursor1", 90), sound("Decision1", 90), sound("Cancel1", 90),
      sound("Buzzer1", 90), sound("Equip1", 90), sound("Save", 90),
      sound("Load", 90), sound("Book1", 90), sound("Book2", 90),
      sound("Blow1", 90), sound("Damage1", 90), sound("Collapse1", 90),
      sound("Miss", 90), sound("Evasion1", 90), sound("Evasion2", 90),
      sound("Reflection", 90), sound("Shot1", 90), sound("Recovery", 90),
      sound("Skill1", 90), sound("Skill2", 90), sound("Item1", 90),
      sound("Equip1", 90), sound("Run", 90), sound("Applause1", 90),
    ],
    airship: vehicle("Vehicle", 0), boat: vehicle("Vehicle", 0), ship: vehicle("Vehicle", 0),
    advanced: {
      gameId: 20250911,
      screenWidth: 816, screenHeight: 624,
      uiAreaWidth: 816, uiAreaHeight: 624,
      numberFontFilename: "", fallbackFonts: "", fontSize: 28,
      mainFontFilename: "", windowOpacity: 192,
      screenScale: 1, menuBackgroundBlur: true,
      autosaveType: 1, // 1 = autosave on map transfer and on request
      titleCommandWindow: { background: 0, offsetX: 0, offsetY: 0 },
    },
    itemCategories: [true, false, false, true], // Item + Key Item only
    magicSkills: [1],
    menuCommands: [true, false, false, false, true, true], // item, -, -, -, save, quit
    hasEncounter: false,
    windowTone: [-24, -20, -8, 0], // graphite/charcoal, faint warm bronze
  };
}

function vehicle(characterName, characterIndex) {
  return {
    bgm: { name: "", volume: 90, pitch: 100, pan: 0 },
    characterIndex, characterName, startMapId: 0, startX: -1, startY: -1,
  };
}

function main() {
  const reg = registry.build();

  // Tilesets: preserve the stock file if it is there. It pairs the vendor's
  // passability with the vendor's art, and overwriting it with our own guesses
  // is what makes real trees and walls walkable.
  let stockTilesets = null;
  const tsPath = path.join(DATA, "Tilesets.json");
  if (fs.existsSync(tsPath)) {
    try { stockTilesets = JSON.parse(fs.readFileSync(tsPath, "utf8")); } catch (e) { stockTilesets = null; }
  }
  const ts = db.buildTilesets(stockTilesets);

  write("System.json", buildSystem(reg));
  write("Actors.json", db.buildActors());
  write("Classes.json", db.buildClasses());
  write("Items.json", db.buildItems().items);
  write("Tilesets.json", ts.list);
  // Common Events: the core system at 1..25, one dialogue scene per id from 100.
  const commonEvents = ces.build(reg);
  const dlg = dialogue.build(reg);
  for (const ev of dlg.events) {
    while (commonEvents.length <= ev.id) commonEvents.push(null);
    commonEvents[ev.id] = { id: ev.id, name: ev.name, trigger: ev.trigger, switchId: ev.switchId, list: ev.list };
  }
  write("CommonEvents.json", commonEvents);

  // --- maps ---------------------------------------------------------------
  const mapInfos = [null];
  const registerMap = (id, name, parentId, order) => {
    while (mapInfos.length <= id) mapInfos.push(null);
    mapInfos[id] = { id, name, parentId, order, expanded: false, scrollX: 0, scrollY: 0 };
  };

  const flagsFor = (tilesetId) => ts.list[tilesetId].flags;

  {
    const { map, grid } = map005.build();
    for (const ev of map005ev.build(reg)) if (ev) map.addEvent(ev);
    const mismatches = map005.verifyCollision(map, grid, flagsFor(map005.TILESET_ID));
    if (mismatches.length) {
      throw new Error(`MAP_005 collision differs from the blueprint in ${mismatches.length} cells`);
    }
    write("Map005.json", map.toJSON());
    registerMap(5, "MAP_005_Prologue_Front_Drive", 0, 1);
    console.log(`  Map005    ${map.width}x${map.height}, ${map.events.length - 1} events, collision matches blueprint`);
  }

  // --- interior maps ------------------------------------------------------
  // One algorithm for all of them (tools/lib/interior.js); each map is a plan.
  // The build FAILS if any walkable cell becomes unreachable, so furniture,
  // search points and NPCs can never quietly seal a room.
  const inboundArrival = (mapKey) => {
    const row = require("../lib/spec").table("09_Doors_Transfers")
      .find((r) => r["целевая карта"] === mapKey);
    return row ? { x: Number(row.target_x), y: Number(row.target_y) } : null;
  };

  for (const plan of Object.values(INTERIOR_PLANS)) {
    const ctx = interior.build(plan);
    const flags = flagsFor(plan.tilesetId);

    // Sweep from where the player actually arrives, falling back to the first
    // room's floor when nothing transfers into this map yet.
    const arrival = inboundArrival(plan.mapKey);
    const fallback = Object.entries(ctx.floorOf)
      .find(([, r]) => r === plan.order[0])[0].split(",").map(Number);
    const start = arrival && ctx.floorOf[`${arrival.x},${arrival.y}`]
      ? arrival : { x: fallback[0], y: fallback[1] };

    const evb = mapEvents.build(reg, {
      mapKey: plan.mapKey, mapId: plan.mapId, ctx,
      poiText: POI.text, poiTile: POI.tile, poiFloorLevel: POI.floorLevel,
    });
    ctx.reserved = evb.reserved;

    const fres = furnishing.furnish(ctx);
    ctx.blockedByFurniture = new Set(
      fres.placed.filter((f) => f.z === 1 && !ctx.map.isWalkable(f.x, f.y, flags)).map((f) => `${f.x},${f.y}`)
    );

    // Everything already standing in the way before NPCs are placed.
    // An event blocks only in the state it ENDS in: a locked door's last page is
    // the unlocked one, so it must not count as a permanent wall, while a search
    // point and an NPC stay solid on their last page and do.
    const blocksFinally = (ev) => {
      const last = ev.pages[ev.pages.length - 1];
      return last.priorityType === 1 && !last.through;
    };
    const preBlocked = new Set(ctx.blockedByFurniture);
    for (const ev of evb.events) if (blocksFinally(ev)) preBlocked.add(`${ev.x},${ev.y}`);

    const alloc = npcSched.allocateSwitches();
    const onThisMap = Object.values(alloc).map((a) => a.inst)
      .filter((i) => i.mapKey === plan.mapKey)
      .sort((a, b) => a.eventName.localeCompare(b.eventName));
    ctx.connectivity = { flags, start, blocked: preBlocked };
    const movedAnchors = npcSched.spreadAnchors(onThisMap, ctx);
    const npcEvents = npcSched.buildInstanceEvents(reg, plan.mapKey, alloc, ctx);

    for (const ev of evb.events) ctx.map.addEvent(ev);
    for (const ev of npcEvents) ctx.map.addEvent(ev);

    // Reachability with EVENTS taken into account. Tile passability alone does
    // not see a blocking search point or NPC, so one object parked in a
    // one-tile-wide passage would cut the map in two and still pass every
    // tile-only check.
    const eventBlockers = new Set(ctx.blockedByFurniture);
    for (const ev of ctx.map.events) {
      if (!ev) continue;
      if (blocksFinally(ev)) eventBlockers.add(`${ev.x},${ev.y}`);
    }

    const a = interior.audit(ctx, flags, start, eventBlockers);
    const dead = a.dead.filter((d) => !eventBlockers.has(d.split(" ")[0]));
    if (dead.length) {
      throw new Error(`${plan.mapKey}: ${dead.length} walkable but unreachable cells: ${dead.slice(0, 8).join(", ")}`);
    }
    if (a.unreachable.length) {
      throw new Error(`${plan.mapKey}: rooms sealed off: ${a.unreachable.join(", ")}`);
    }

    const file = `Map${String(plan.mapId).padStart(3, "0")}.json`;
    write(file, ctx.map.toJSON());
    registerMap(plan.mapId, plan.mapKey, 0, plan.mapId);
    console.log(`  ${file.replace(".json", "")}   ${ctx.map.width}x${ctx.map.height}  ` +
      `${evb.events.length + npcEvents.length} events (${npcEvents.length} NPC, ` +
      `${mapEvents.transfersFrom(plan.mapKey).length} transfers), ` +
      `${fres.placed.length} furnishings, ${a.reach.size} reachable, 0 dead`);
    if (movedAnchors.length) {
      console.log(`              ${movedAnchors.length} NPC anchor(s) relocated (D-12 / connectivity)`);
    }
    if (fres.skipped.length) {
      console.log(`              ${fres.skipped.length} furnishing(s) skipped:`);
      for (const sk of fres.skipped.slice(0, 5)) {
        console.log(`                ${sk.room} (${sk.x},${sk.y}) ${sk.tile} - ${sk.why}`);
      }
      if (fres.skipped.length > 5) console.log(`                ... and ${fres.skipped.length - 5} more`);
    }
  }

  // --- MAP_010 estate exterior --------------------------------------------
  // Open ground rather than carved rooms, so it is painted by its own generator.
  // Everything downstream -- events, NPC placement, the reachability audit --
  // works off the same shape, with one synthetic "room" covering the grounds.
  {
    const { map } = map010.build();
    const flags = flagsFor(map010.TILESET_ID);
    const floorOf = {};
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) if (map.isWalkable(x, y, flags)) floorOf[`${x},${y}`] = "grounds";
    }
    const ctx = {
      map, floorOf, protectedCells: new Set(), reserved: new Set(),
      B: (k) => require("../lib/tiles").resolve("outside", k).id,
      plan: { mapKey: "MAP_010_Estate_Exterior", mapId: 10, order: ["grounds"], tilesetId: map010.TILESET_ID },
    };

    const evb = mapEvents.build(reg, {
      mapKey: "MAP_010_Estate_Exterior", mapId: 10, ctx,
      poiText: POI.text, poiTile: POI.tile, poiFloorLevel: POI.floorLevel,
    });
    ctx.reserved = evb.reserved;
    for (const t of mapEvents.transfersFrom("MAP_010_Estate_Exterior")) ctx.protectedCells.add(`${t.x},${t.y}`);

    const blocksFinally = (ev) => {
      const last = ev.pages[ev.pages.length - 1];
      return last.priorityType === 1 && !last.through;
    };
    const preBlocked = new Set();
    for (const ev of evb.events) if (blocksFinally(ev)) preBlocked.add(`${ev.x},${ev.y}`);

    const alloc = npcSched.allocateSwitches();
    const onThisMap = Object.values(alloc).map((a) => a.inst)
      .filter((i) => i.mapKey === "MAP_010_Estate_Exterior")
      .sort((a, b) => a.eventName.localeCompare(b.eventName));
    ctx.connectivity = { flags, start: { x: 26, y: 20 }, blocked: preBlocked };
    const movedAnchors = npcSched.spreadAnchors(onThisMap, ctx);
    const npcEvents = npcSched.buildInstanceEvents(reg, "MAP_010_Estate_Exterior", alloc, ctx);

    for (const ev of evb.events) map.addEvent(ev);
    for (const ev of npcEvents) map.addEvent(ev);

    const blockers = new Set();
    for (const ev of map.events) if (ev && blocksFinally(ev)) blockers.add(`${ev.x},${ev.y}`);
    const reach = interior.reachableAvoiding(map, flags, { x: 26, y: 20 }, blockers);
    const K = (x, y) => y * map.width + x;
    for (const t of mapEvents.transfersFrom("MAP_010_Estate_Exterior")) {
      if (!reach.has(K(t.x, t.y))) {
        throw new Error(`MAP_010: transfer ${t.id} at (${t.x},${t.y}) is not reachable from the front door`);
      }
    }

    write("Map010.json", map.toJSON());
    registerMap(10, "MAP_010_Estate_Exterior", 0, 10);
    console.log(`  Map010   ${map.width}x${map.height}  ${evb.events.length + npcEvents.length} events ` +
      `(${npcEvents.length} NPC, ${mapEvents.transfersFrom("MAP_010_Estate_Exterior").length} transfers), ` +
      `${reach.size} reachable`);
    if (movedAnchors.length) console.log(`              ${movedAnchors.length} NPC anchor(s) relocated`);
  }

  write("MapInfos.json", mapInfos);

  // Databases MZ requires to exist even when the game never uses them.
  write("Skills.json", [null]);
  write("Weapons.json", [null]);
  write("Armors.json", [null]);
  write("Enemies.json", [null]);
  write("Troops.json", [null, { id: 1, members: [], name: "", pages: [] }]);
  write("States.json", [null]);
  write("Animations.json", [null]);

  console.log("database written:");
  if (ts.source === "stock") {
    console.log(`  tilesets  STOCK file preserved${ts.overlaid ? ` (+${ts.overlaid} deliberate flag overrides)` : ""}`);
  } else {
    console.log("  tilesets  SYNTHESIZED -- no stock Tilesets.json present.");
    console.log("            Passability is derived from tile-bindings.json and does NOT");
    console.log("            describe the real art. Hydrate assets to replace it.");
  }
  console.log(`  switches  ${reg.switches.names.length - 1} slots, ${Object.keys(reg.switches.byName).length} named`);
  console.log(`  variables ${reg.variables.names.length - 1} slots, ${Object.keys(reg.variables.byName).length} named`);
  console.log(`  items     ${db.buildItems().items.length - 1}`);
  console.log(`  common events ${25 + dlg.events.length} (25 core + ${dlg.events.length} dialogue scenes, ${dlg.events.reduce((a, e) => a + e.list.length, 0)} commands)`);
  if (dlg.problems.length) {
    const uniq = [...new Set(dlg.problems)];
    console.log(`  dialogue: ${uniq.length} unresolved reference(s)`);
    for (const p of uniq) console.log(`    ${p}`);
  }
  const assumed = tiles.assumedBindings();
  if (assumed.length) console.log(`  tile bindings still ASSUMED: ${assumed.length} (see docs/ASSET_SETUP.md)`);
  return reg;
}

if (require.main === module) main();
module.exports = { main, buildSystem, write, DATA };
