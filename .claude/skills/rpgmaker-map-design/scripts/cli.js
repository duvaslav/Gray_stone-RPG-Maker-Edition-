#!/usr/bin/env node
"use strict";
/**
 * cli.js — инструменты для работы с картами проекта RPG Maker MV/MZ.
 *
 *   node cli.js info      <проект>                     что вообще есть в проекте
 *   node cli.js tilesets  <проект>                     список тайлсетов и их листов
 *   node cli.js tileset   <проект> <id>                разбор одного тайлсета
 *   node cli.js map       <проект> <mapId>             сводка + ASCII-схема карты
 *   node cli.js validate  <проект> [mapId|all]         проверка карт
 *   node cli.js preview   <проект> <mapId> [-o f.html] визуальный рендер
 *   node cli.js fix       <проект> <mapId> [--write]   пересчёт форм автотайлов и теней
 *
 * Ничего не пишет в проект без явного флага (кроме preview, который создаёт
 * отдельный html). Перед --write делай бэкап или коммить проект в git.
 */

const fs = require("fs");
const path = require("path");
const { Project, RMMap, T, FLAG, describeFlag } = require("./rpgmap");
const { renderHtml } = require("./preview");

const args = process.argv.slice(2);
const cmd = args[0];

function fail(msg) {
  console.error("Ошибка: " + msg);
  process.exit(1);
}

function openProject(dir) {
  if (!dir) fail("не указан путь к проекту");
  try {
    return new Project(dir);
  } catch (e) {
    fail(e.message);
  }
}

function flag(name) {
  return args.includes(name);
}

function opt(name, def = null) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
}

const KIND_LABEL = (kind) => {
  if (kind < 16) return `A1 ряд${Math.floor(kind / 8)} #${kind % 8} — ${kind >= 4 && kind % 2 === 1 ? "водопад" : "вода/анимация"}`;
  if (kind < 48) return `A2 ряд${Math.floor((kind - 16) / 8)} #${(kind - 16) % 8} — земля/пол`;
  if (kind < 80) {
    const row = Math.floor((kind - 48) / 8);
    return `A3 ряд${row} #${(kind - 48) % 8} — ${kind % 16 < 8 ? "крыша" : "внешняя стена"}`;
  }
  const row = Math.floor((kind - 80) / 8);
  return `A4 ряд${row} #${(kind - 80) % 8} — ${kind % 16 < 8 ? "верх стены" : "грань стены"}`;
};

/* ── info ───────────────────────────────────────────────────────────────── */

function cmdInfo(dir) {
  const p = openProject(dir);
  console.log(`Проект: ${p.root}`);
  console.log(`Движок: ${p.engine}`);
  const sheetsDir = path.join(p.root, "img", "tilesets");
  const files = fs.existsSync(sheetsDir)
    ? fs.readdirSync(sheetsDir).filter((f) => f.endsWith(".png"))
    : [];
  console.log(`Листов тайлсетов в img/tilesets: ${files.length}`);
  const chars = path.join(p.root, "img", "characters");
  if (fs.existsSync(chars))
    console.log(`Спрайтов персонажей (для событий-объектов): ${fs.readdirSync(chars).filter((f) => f.endsWith(".png")).length}`);

  console.log(`\nТайлсеты (${p.tilesets.filter(Boolean).length}):`);
  for (const ts of p.tilesets) {
    if (!ts) continue;
    const used = ts.tilesetNames.filter(Boolean).length;
    console.log(`  ${String(ts.id).padStart(3)}  ${ts.name.padEnd(24)} листов: ${used}/9  mode: ${ts.mode === 0 ? "мир" : "область"}`);
  }

  console.log(`\nКарты (${p.listMaps().length}):`);
  for (const m of p.listMaps()) {
    const file = path.join(p.dataDir, p.mapFileName(m.id));
    let size = "—";
    if (fs.existsSync(file)) {
      const raw = JSON.parse(fs.readFileSync(file, "utf8"));
      size = `${raw.width}x${raw.height}`;
    }
    console.log(`  ${String(m.id).padStart(3)}  ${String(m.name).padEnd(28)} ${size.padStart(8)}  parent:${m.parentId}`);
  }
  console.log(`\nСледующий свободный id карты: ${p.nextMapId()}`);
}

/* ── tilesets ───────────────────────────────────────────────────────────── */

function cmdTilesets(dir) {
  const p = openProject(dir);
  for (const ts of p.tilesets) {
    if (!ts) continue;
    console.log(`\n[${ts.id}] ${ts.name}   (mode: ${ts.mode === 0 ? "мир" : "область"})`);
    const sheets = p.tilesetSheets(ts.id);
    for (const [k, v] of Object.entries(sheets)) {
      if (!v) continue;
      const exists = fs.existsSync(path.join(p.root, "img", "tilesets", v + ".png"));
      console.log(`    ${k.padEnd(3)} ${v}${exists ? "" : "   ← файла нет!"}`);
    }
    if (ts.note && ts.note.trim()) console.log(`    note: ${ts.note.trim().split("\n")[0]}`);
  }
}

function cmdTileset(dir, idStr) {
  const p = openProject(dir);
  const id = Number(idStr);
  const ts = p.tileset(id);
  console.log(`[${ts.id}] ${ts.name}  (mode: ${ts.mode === 0 ? "мир" : "область"})\n`);
  const sheets = p.tilesetSheets(id);
  console.log("Листы:");
  for (const [k, v] of Object.entries(sheets)) console.log(`  ${k.padEnd(3)} ${v || "—"}`);

  console.log("\nАвтотайловые породы (kind) листов, которые есть в тайлсете.");
  console.log("Номер kind — это то, что передаётся в paintAutotile/buildRoom:");
  const flags = ts.flags;
  const shown = new Set();
  for (let kind = 0; kind < 128; kind++) {
    const base = T.make(kind, 0);
    const f = flags[base] || 0;
    const sheetKey = kind < 16 ? "A1" : kind < 48 ? "A2" : kind < 80 ? "A3" : "A4";
    if (!sheets[sheetKey]) continue;
    if (shown.has(kind)) continue;
    shown.add(kind);
    console.log(`  kind ${String(kind).padStart(3)}  ${KIND_LABEL(kind).padEnd(38)} ${describeFlag(f)}`);
  }

  console.log("\nНепроходимые/особые тайлы листов B..E (первые 40):");
  let count = 0;
  for (let tid = 1; tid < 1024 && count < 40; tid++) {
    const f = flags[tid] || 0;
    if (!f) continue;
    const pos = T.atlasPos(tid);
    if (!sheets[pos.sheet]) continue;
    console.log(`  id ${String(tid).padStart(4)}  ${pos.sheet}(${pos.col},${pos.row})  ${describeFlag(f)}`);
    count++;
  }
  console.log("\nПодсказка: id тайла = T.b(col,row) / T.c(col,row) / T.d(...) / T.e(...)");
}

/* ── map ────────────────────────────────────────────────────────────────── */

function cmdMap(dir, idStr) {
  const p = openProject(dir);
  const map = p.loadMap(Number(idStr));
  const s = map.stats();
  console.log(`Карта ${map.id}  "${map.data.displayName || ""}"  ${s.size}  тайлсет ${map.tilesetId} (${p.tileset(map.tilesetId).name})`);
  console.log(`Клеток: ${s.tiles} · с декором на верхних слоях: ${(s.decorDensity * 100).toFixed(1)}% · событий: ${s.events}`);
  console.log(`Использование листов: ${Object.entries(s.perSheet).map(([k, v]) => `${k}:${v}`).join("  ")}`);
  console.log(`Регионов задействовано: ${new Set(collectRegions(map)).size - (collectRegions(map).includes(0) ? 1 : 0)}`);
  console.log("\nСхема (#, . — непроходимо/проходимо, E — событие):");
  console.log(map.toAscii());
  if (s.events) {
    console.log("\nСобытия:");
    for (const e of map.events) {
      if (!e) continue;
      const pg = e.pages[0] || {};
      const trig = ["кнопка", "касание игроком", "касание событием", "автозапуск", "параллельно"][pg.trigger] || "?";
      const prio = ["под героем", "вровень", "над героем"][pg.priorityType] || "?";
      console.log(`  #${String(e.id).padStart(3)} ${String(e.name).padEnd(20)} (${e.x},${e.y})  страниц:${e.pages.length}  ${trig}, ${prio}`);
    }
  }
}

function collectRegions(map) {
  const out = [];
  for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) out.push(map.getRegion(x, y));
  return out;
}

/* ── validate ───────────────────────────────────────────────────────────── */

function cmdValidate(dir, which) {
  const p = openProject(dir);
  const ids = !which || which === "all"
    ? p.listMaps().map((m) => m.id).filter((id) => fs.existsSync(path.join(p.dataDir, p.mapFileName(id))))
    : [Number(which)];
  let errors = 0, warns = 0;
  for (const id of ids) {
    const map = p.loadMap(id);
    const issues = map.validate();
    if (!issues.length) {
      console.log(`Карта ${id}: чисто`);
      continue;
    }
    console.log(`Карта ${id} (${map.data.displayName || p.mapInfos[id]?.name || ""}):`);
    for (const i of issues) {
      console.log(`  ${i.level === "error" ? "ОШИБКА" : "предупр"}  ${i.msg}`);
      i.level === "error" ? errors++ : warns++;
    }
  }
  console.log(`\nИтого: ошибок ${errors}, предупреждений ${warns}`);
  if (errors) process.exitCode = 1;
}

/* ── preview ────────────────────────────────────────────────────────────── */

function cmdPreview(dir, idStr) {
  const p = openProject(dir);
  const map = p.loadMap(Number(idStr));
  const out = opt("-o", path.join(process.cwd(), `map-${map.id}-preview.html`));
  const res = renderHtml(map, p, { out, embed: !flag("--link") });
  console.log(`Готово: ${res.file}`);
  if (res.missing.length) {
    console.log("Не найдены файлы листов (эти тайлы не отрисуются):");
    for (const m of res.missing) console.log("  " + m);
  }
  console.log("Открой файл в браузере. Оверлеи: сетка, проходимость, регионы, события.");
}

/* ── fix ────────────────────────────────────────────────────────────────── */

function cmdFix(dir, idStr) {
  const p = openProject(dir);
  const id = Number(idStr);
  const map = p.loadMap(id);
  const before = JSON.stringify(map.data.data);
  map.refreshAutotiles();
  if (flag("--shadows")) map.castWallShadows();
  const changed = JSON.stringify(map.data.data) !== before;
  if (!changed) {
    console.log("Менять нечего — формы автотайлов уже согласованы.");
    return;
  }
  let diff = 0;
  const a = JSON.parse(before), b = map.data.data;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diff++;
  console.log(`Изменилось клеток: ${diff}`);
  if (flag("--write")) {
    const backup = path.join(p.dataDir, p.mapFileName(id) + ".bak");
    fs.copyFileSync(path.join(p.dataDir, p.mapFileName(id)), backup);
    p.saveMap(id, map);
    console.log(`Записано. Бэкап: ${backup}`);
  } else {
    console.log("Это был сухой прогон. Добавь --write, чтобы сохранить.");
  }
}

/* ── main ───────────────────────────────────────────────────────────────── */

switch (cmd) {
  case "info": cmdInfo(args[1]); break;
  case "tilesets": cmdTilesets(args[1]); break;
  case "tileset": cmdTileset(args[1], args[2]); break;
  case "map": cmdMap(args[1], args[2]); break;
  case "validate": cmdValidate(args[1], args[2]); break;
  case "preview": cmdPreview(args[1], args[2]); break;
  case "fix": cmdFix(args[1], args[2]); break;
  default:
    console.log(
      fs.readFileSync(__filename, "utf8")
        .split("*/")[0].split("/**")[1]
        .split("\n").map((l) => l.replace(/^\s*\*\s?/, "")).join("\n").trim()
    );
    if (cmd) process.exitCode = 1;
}
