"use strict";
// Gray Stone build entry point:  node tools/build/index.js
// spec/*.json  ->  data/*.json   (plus js/plugins.js)
const fs = require("fs");
const path = require("path");
const db = require("./00-database");
const ces = require("./10-common-events");
const registry = require("../lib/registry");
const map005 = require("./20-map005-prologue");
const map005ev = require("./21-map005-events");
const map020 = require("./30-map020-ground");
const map020furnish = require("./31-map020-furnish");
const map020ev = require("./32-map020-events");
const npcSched = require("./50-npc-schedules");
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
  write("CommonEvents.json", ces.build(reg));

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

  {
    const ctx = map020.build();
    const evb = map020ev.build(reg, ctx);
    // Interactive furniture is an event, so the map must not also paint a tile
    // in that cell -- one object per cell, never a tile and an event disagreeing.
    ctx.reserved = evb.reserved;
    const fres = map020furnish.furnish(ctx);

    // NPC instances. Anchors are spread BEFORE the events are built so no two
    // people share a cell, and furniture cells are known so nobody is placed
    // inside a bookcase.
    const flagsNow = flagsFor(map020.TILESET_ID);
    ctx.blockedByFurniture = new Set(
      fres.placed.filter((p) => p.z === 1 && !ctx.map.isWalkable(p.x, p.y, flagsNow)).map((p) => `${p.x},${p.y}`)
    );
    const alloc = npcSched.allocateSwitches();
    const onThisMap = Object.values(alloc)
      .map((a) => a.inst)
      .filter((i) => i.mapKey === "MAP_020_Manor_Ground_Floor")
      .sort((a, b) => a.eventName.localeCompare(b.eventName));
    const movedAnchors = npcSched.spreadAnchors(onThisMap, ctx);
    const npcEvents = npcSched.buildInstanceEvents(reg, "MAP_020_Manor_Ground_Floor", alloc, ctx);

    for (const ev of evb.events) ctx.map.addEvent(ev);
    for (const ev of npcEvents) ctx.map.addEvent(ev);

    const flags = flagsFor(map020.TILESET_ID);
    const reach = ctx.map.reachable(22, 31, flags);
    const K = (x, y) => y * ctx.map.width + x;
    const dead = [];
    for (const [k, room] of Object.entries(ctx.floorOf)) {
      const [x, y] = k.split(",").map(Number);
      if (reach.has(K(x, y))) continue;
      if (ctx.map.isWalkable(x, y, flags)) dead.push(`${k} [${room}]`);
    }
    if (dead.length) throw new Error(`MAP_020 has ${dead.length} walkable but unreachable cells: ${dead.slice(0, 10).join(", ")}`);

    write("Map020.json", ctx.map.toJSON());
    registerMap(20, "MAP_020_Manor_Ground_Floor", 0, 2);
    console.log(`  Map020    ${ctx.map.width}x${ctx.map.height}, ${evb.events.length + npcEvents.length} events (${npcEvents.length} NPC instances), ${fres.placed.length} furnishings, ${reach.size} reachable cells, 0 dead cells`);
    if (movedAnchors.length) {
      console.log(`            ${movedAnchors.length} NPC anchor(s) spread off a shared cell (D-12)`);
    }
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
  console.log(`  common events 25`);
  const assumed = tiles.assumedBindings();
  if (assumed.length) console.log(`  tile bindings still ASSUMED: ${assumed.length} (see docs/ASSET_SETUP.md)`);
  return reg;
}

if (require.main === module) main();
module.exports = { main, buildSystem, write, DATA };
