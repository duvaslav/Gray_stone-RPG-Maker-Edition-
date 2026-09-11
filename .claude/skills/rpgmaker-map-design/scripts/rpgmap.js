"use strict";
/**
 * rpgmap.js — библиотека для чтения/создания/правки карт RPG Maker MV и MZ.
 *
 * Без зависимостей, Node.js >= 14. Вся арифметика тайлов и автотайлов
 * выведена из официального корескрипта (rmmz_core.js / rmmz_objects.js),
 * поэтому результат рендерится движком байт-в-байт так же, как из редактора.
 *
 *   const { RMMap, T, Ev, Cmd, Project } = require('./rpgmap');
 *
 * Смотри references/ рядом со скиллом: там разобран формат и семантика.
 */

const fs = require("fs");
const path = require("path");

/* ═══════════════════════════════════════════════════════════════════════
   1. ТАЙЛОВЫЕ ID
   ═══════════════════════════════════════════════════════════════════════ */

const TILE_ID_B = 0;
const TILE_ID_C = 256;
const TILE_ID_D = 512;
const TILE_ID_E = 768;
const TILE_ID_A5 = 1536;
const TILE_ID_A1 = 2048;
const TILE_ID_A2 = 2816;
const TILE_ID_A3 = 4352;
const TILE_ID_A4 = 5888;
const TILE_ID_MAX = 8192;

/** Первый kind каждого автотайлового листа (kind = (id - 2048) / 48). */
const KIND_A1 = 0; // 0..15
const KIND_A2 = 16; // 16..47
const KIND_A3 = 48; // 48..79
const KIND_A4 = 80; // 80..127

const T = {
  TILE_ID_B, TILE_ID_C, TILE_ID_D, TILE_ID_E, TILE_ID_A5,
  TILE_ID_A1, TILE_ID_A2, TILE_ID_A3, TILE_ID_A4, TILE_ID_MAX,
  KIND_A1, KIND_A2, KIND_A3, KIND_A4,

  isVisible: (id) => id > 0 && id < TILE_ID_MAX,
  isAutotile: (id) => id >= TILE_ID_A1,
  kind: (id) => Math.floor((id - TILE_ID_A1) / 48),
  shape: (id) => (id - TILE_ID_A1) % 48,
  make: (kind, shape) => TILE_ID_A1 + kind * 48 + shape,

  isA1: (id) => id >= TILE_ID_A1 && id < TILE_ID_A2,
  isA2: (id) => id >= TILE_ID_A2 && id < TILE_ID_A3,
  isA3: (id) => id >= TILE_ID_A3 && id < TILE_ID_A4,
  isA4: (id) => id >= TILE_ID_A4 && id < TILE_ID_MAX,
  isA5: (id) => id >= TILE_ID_A5 && id < TILE_ID_A1,

  /** Водопад: A1, kind >= 4 и нечётный. */
  isWaterfall(id) {
    if (id >= TILE_ID_A1 + 192 && id < TILE_ID_A2) return T.kind(id) % 2 === 1;
    return false;
  },
  isWater(id) {
    if (T.isA1(id)) {
      return !(id >= TILE_ID_A1 + 96 && id < TILE_ID_A1 + 192);
    }
    return false;
  },
  /** Крыша (A3, левая половина листа) — рисуется настенным набором четвертей. */
  isRoof: (id) => T.isA3(id) && T.kind(id) % 16 < 8,
  /** Верх стены (A3/A4, чётные ряды kind'ов) — рисуется «половым» набором. */
  isWallTop: (id) => T.isA4(id) && T.kind(id) % 16 < 8,
  isWallSide: (id) => (T.isA3(id) || T.isA4(id)) && T.kind(id) % 16 >= 8,
  isWall: (id) => T.isWallTop(id) || T.isWallSide(id),
  /** Тайлы, которые отбрасывают автотень и «съедают» тень снизу. */
  isShadowing: (id) => T.isA3(id) || T.isA4(id),

  isFloorType: (id) =>
    (T.isA1(id) && !T.isWaterfall(id)) || T.isA2(id) || T.isWallTop(id),
  isWallType: (id) => T.isRoof(id) || T.isWallSide(id),

  /* --- конструкторы id по позиции на листе ---------------------------- */

  /** A5: лист 8 столбцов × 16 рядов. */
  a5: (col, row) => TILE_ID_A5 + row * 8 + col,
  /** B/C/D/E: лист 16 столбцов × 16 рядов. sheet — 'B'|'C'|'D'|'E'. */
  sheet(sheet, col, row) {
    const base = { B: TILE_ID_B, C: TILE_ID_C, D: TILE_ID_D, E: TILE_ID_E }[
      String(sheet).toUpperCase()
    ];
    if (base === undefined) throw new Error(`Неизвестный лист: ${sheet}`);
    if (col < 0 || col > 15 || row < 0 || row > 15)
      throw new Error(`B..E: col/row вне 0..15 (${col},${row})`);
    return base + (col >= 8 ? 128 : 0) + row * 8 + (col % 8);
  },
  b: (col, row) => T.sheet("B", col, row),
  c: (col, row) => T.sheet("C", col, row),
  d: (col, row) => T.sheet("D", col, row),
  e: (col, row) => T.sheet("E", col, row),

  /** kind автотайла по позиции в палитре листа (8 kind'ов в ряду). */
  a1Kind: (col, row) => KIND_A1 + row * 8 + col, // row 0..1
  a2Kind: (col, row) => KIND_A2 + row * 8 + col, // row 0..3
  a3Kind: (col, row) => KIND_A3 + row * 8 + col, // row 0..3 (0,2 — крыши; 1,3 — стены)
  a4Kind: (col, row) => KIND_A4 + row * 8 + col, // row 0..5 (чётные — верх, нечётные — бок)

  /** Обратно: в какой лист попадает id (для диагностики). */
  sheetOf(id) {
    if (!T.isVisible(id)) return "empty";
    if (T.isA1(id)) return "A1";
    if (T.isA2(id)) return "A2";
    if (T.isA3(id)) return "A3";
    if (T.isA4(id)) return "A4";
    if (T.isA5(id)) return "A5";
    if (id < TILE_ID_C) return "B";
    if (id < TILE_ID_D) return "C";
    if (id < TILE_ID_E) return "D";
    if (id < 1024) return "E";
    return "unused";
  },

  /** Позиция обычного (не авто) тайла на своём листе: {sheet, col, row}. */
  atlasPos(id) {
    const sheet = T.sheetOf(id);
    const col = (Math.floor(id / 128) % 2) * 8 + (id % 8);
    const row = Math.floor((id % 256) / 8) % 16;
    return { sheet, col, row };
  },
};

/* ═══════════════════════════════════════════════════════════════════════
   2. ТАБЛИЦЫ ЧЕТВЕРТЕЙ (копия из rmmz_core.js) И РЕШАТЕЛЬ ФОРМ
   ═══════════════════════════════════════════════════════════════════════ */

// prettier-ignore
const FLOOR_AUTOTILE_TABLE = [
  [[2,4],[1,4],[2,3],[1,3]], [[2,0],[1,4],[2,3],[1,3]], [[2,4],[3,0],[2,3],[1,3]], [[2,0],[3,0],[2,3],[1,3]],
  [[2,4],[1,4],[2,3],[3,1]], [[2,0],[1,4],[2,3],[3,1]], [[2,4],[3,0],[2,3],[3,1]], [[2,0],[3,0],[2,3],[3,1]],
  [[2,4],[1,4],[2,1],[1,3]], [[2,0],[1,4],[2,1],[1,3]], [[2,4],[3,0],[2,1],[1,3]], [[2,0],[3,0],[2,1],[1,3]],
  [[2,4],[1,4],[2,1],[3,1]], [[2,0],[1,4],[2,1],[3,1]], [[2,4],[3,0],[2,1],[3,1]], [[2,0],[3,0],[2,1],[3,1]],
  [[0,4],[1,4],[0,3],[1,3]], [[0,4],[3,0],[0,3],[1,3]], [[0,4],[1,4],[0,3],[3,1]], [[0,4],[3,0],[0,3],[3,1]],
  [[2,2],[1,2],[2,3],[1,3]], [[2,2],[1,2],[2,3],[3,1]], [[2,2],[1,2],[2,1],[1,3]], [[2,2],[1,2],[2,1],[3,1]],
  [[2,4],[3,4],[2,3],[3,3]], [[2,4],[3,4],[2,1],[3,3]], [[2,0],[3,4],[2,3],[3,3]], [[2,0],[3,4],[2,1],[3,3]],
  [[2,4],[1,4],[2,5],[1,5]], [[2,0],[1,4],[2,5],[1,5]], [[2,4],[3,0],[2,5],[1,5]], [[2,0],[3,0],[2,5],[1,5]],
  [[0,4],[3,4],[0,3],[3,3]], [[2,2],[1,2],[2,5],[1,5]], [[0,2],[1,2],[0,3],[1,3]], [[0,2],[1,2],[0,3],[3,1]],
  [[2,2],[3,2],[2,3],[3,3]], [[2,2],[3,2],[2,1],[3,3]], [[2,4],[3,4],[2,5],[3,5]], [[2,0],[3,4],[2,5],[3,5]],
  [[0,4],[1,4],[0,5],[1,5]], [[0,4],[3,0],[0,5],[1,5]], [[0,2],[3,2],[0,3],[3,3]], [[0,2],[1,2],[0,5],[1,5]],
  [[0,4],[3,4],[0,5],[3,5]], [[2,2],[3,2],[2,5],[3,5]], [[0,2],[3,2],[0,5],[3,5]], [[0,0],[1,0],[0,1],[1,1]],
];

// prettier-ignore
const WALL_AUTOTILE_TABLE = [
  [[2,2],[1,2],[2,1],[1,1]], [[0,2],[1,2],[0,1],[1,1]], [[2,0],[1,0],[2,1],[1,1]], [[0,0],[1,0],[0,1],[1,1]],
  [[2,2],[3,2],[2,1],[3,1]], [[0,2],[3,2],[0,1],[3,1]], [[2,0],[3,0],[2,1],[3,1]], [[0,0],[3,0],[0,1],[3,1]],
  [[2,2],[1,2],[2,3],[1,3]], [[0,2],[1,2],[0,3],[1,3]], [[2,0],[1,0],[2,3],[1,3]], [[0,0],[1,0],[0,3],[1,3]],
  [[2,2],[3,2],[2,3],[3,3]], [[0,2],[3,2],[0,3],[3,3]], [[2,0],[3,0],[2,3],[3,3]], [[0,0],[3,0],[0,3],[3,3]],
];

// prettier-ignore
const WATERFALL_AUTOTILE_TABLE = [
  [[2,0],[1,0],[2,1],[1,1]], [[0,0],[1,0],[0,1],[1,1]],
  [[2,0],[3,0],[2,1],[3,1]], [[0,0],[3,0],[0,1],[3,1]],
];

/**
 * Какая четверть берётся из блока для каждого угла итогового тайла.
 * Порядок углов: 0=TL, 1=TR, 2=BL, 3=BR.
 *  solid  — угол внутри массива
 *  inner  — оба соседа есть, диагонали нет (внутренний угол)
 *  vEdge  — нет горизонтального соседа (вертикальная кромка)
 *  hEdge  — нет вертикального соседа (горизонтальная кромка)
 *  outer  — нет обоих (внешний угол)
 * Значения сверены с FLOOR_AUTOTILE_TABLE.
 */
const FLOOR_QUAD = [
  { solid: [2, 4], inner: [2, 0], vEdge: [0, 4], hEdge: [2, 2], outer: [0, 2] },
  { solid: [1, 4], inner: [3, 0], vEdge: [3, 4], hEdge: [1, 2], outer: [3, 2] },
  { solid: [2, 3], inner: [2, 1], vEdge: [0, 3], hEdge: [2, 5], outer: [0, 5] },
  { solid: [1, 3], inner: [3, 1], vEdge: [3, 3], hEdge: [1, 5], outer: [3, 5] },
];

/** Обратный индекс «четыре четверти → номер формы». */
const FLOOR_SHAPE_BY_QUADS = new Map();
FLOOR_AUTOTILE_TABLE.forEach((entry, shape) => {
  const key = entry.map((q) => q.join(",")).join("|");
  if (!FLOOR_SHAPE_BY_QUADS.has(key)) FLOOR_SHAPE_BY_QUADS.set(key, shape);
});

/**
 * Форма «полового» автотайла (A1-вода, A2, верх стены A4) по восьми соседям.
 * Соседи — объект {n,e,s,w,nw,ne,se,sw} с булевыми «сосед той же породы».
 */
function solveFloorShape(nb) {
  const n = !!nb.n, e = !!nb.e, s = !!nb.s, w = !!nb.w;
  // Диагональ учитывается только если оба ведущих к ней кардинала связаны.
  const nw = !!nb.nw && n && w;
  const ne = !!nb.ne && n && e;
  const sw = !!nb.sw && s && w;
  const se = !!nb.se && s && e;
  const sides = [
    [n, w, nw], // TL
    [n, e, ne], // TR
    [s, w, sw], // BL
    [s, e, se], // BR
  ];
  const key = sides
    .map(([vert, horz, diag], i) => {
      const q = FLOOR_QUAD[i];
      if (vert && horz) return diag ? q.solid : q.inner;
      if (vert && !horz) return q.vEdge;
      if (!vert && horz) return q.hEdge;
      return q.outer;
    })
    .map((q) => q.join(","))
    .join("|");
  const shape = FLOOR_SHAPE_BY_QUADS.get(key);
  if (shape === undefined) throw new Error("solveFloorShape: недостижимая комбинация");
  return shape;
}

/** Форма «настенного» автотайла (A3, бок стены A4): бит = соседа НЕТ. */
function solveWallShape(nb) {
  return (nb.w ? 0 : 1) | (nb.n ? 0 : 2) | (nb.e ? 0 : 4) | (nb.s ? 0 : 8);
}

/** Форма водопада: связность только по горизонтали. */
function solveWaterfallShape(nb) {
  return (nb.w ? 0 : 1) | (nb.e ? 0 : 2);
}

/** К какому семейству относится автотайл: 'floor' | 'wall' | 'waterfall'. */
function autotileFamily(tileId) {
  if (T.isWaterfall(tileId)) return "waterfall";
  if (T.isA3(tileId)) return "wall"; // и крыши, и боковые стены A3
  if (T.isA4(tileId)) return T.isWallTop(tileId) ? "floor" : "wall";
  return "floor"; // A1-вода, A2
}

/* ═══════════════════════════════════════════════════════════════════════
   3. ФЛАГИ ТАЙЛСЕТА
   ═══════════════════════════════════════════════════════════════════════ */

const FLAG = {
  BLOCK_DOWN: 0x0001,
  BLOCK_LEFT: 0x0002,
  BLOCK_RIGHT: 0x0004,
  BLOCK_UP: 0x0008,
  STAR: 0x0010, // ★ — рисуется над героем, на проходимость не влияет
  LADDER: 0x0020,
  BUSH: 0x0040,
  COUNTER: 0x0080, // прилавок; для A2 ещё и режим «стол»
  DAMAGE: 0x0100,
  NO_BOAT: 0x0200,
  NO_SHIP: 0x0400,
  NO_AIRSHIP_LAND: 0x0800,
  TERRAIN_MASK: 0xf000,
};

const DIR_BIT = { 2: FLAG.BLOCK_DOWN, 4: FLAG.BLOCK_LEFT, 6: FLAG.BLOCK_RIGHT, 8: FLAG.BLOCK_UP };

function describeFlag(flag) {
  const out = [];
  const dirs = [];
  if (flag & FLAG.BLOCK_DOWN) dirs.push("↓");
  if (flag & FLAG.BLOCK_LEFT) dirs.push("←");
  if (flag & FLAG.BLOCK_RIGHT) dirs.push("→");
  if (flag & FLAG.BLOCK_UP) dirs.push("↑");
  if (dirs.length === 4) out.push("непроходим");
  else if (dirs.length) out.push("блок " + dirs.join(""));
  else out.push("проходим");
  if (flag & FLAG.STAR) out.push("★ над героем");
  if (flag & FLAG.LADDER) out.push("лестница");
  if (flag & FLAG.BUSH) out.push("куст");
  if (flag & FLAG.COUNTER) out.push("прилавок/стол");
  if (flag & FLAG.DAMAGE) out.push("урон");
  const tag = (flag & FLAG.TERRAIN_MASK) >> 12;
  if (tag) out.push("terrain tag " + tag);
  return out.join(", ");
}

/* ═══════════════════════════════════════════════════════════════════════
   4. ПРОЕКТ (доступ к data/ и img/)
   ═══════════════════════════════════════════════════════════════════════ */

class Project {
  constructor(root) {
    this.root = path.resolve(root);
    const dataDir = path.join(this.root, "data");
    if (!fs.existsSync(dataDir)) {
      throw new Error(`Не похоже на проект RPG Maker: нет ${dataDir}`);
    }
    this.dataDir = dataDir;
  }

  /** MV или MZ — определяется по наличию js/rmmz_core.js. */
  get engine() {
    if (fs.existsSync(path.join(this.root, "js", "rmmz_core.js"))) return "MZ";
    if (fs.existsSync(path.join(this.root, "js", "rpg_core.js"))) return "MV";
    return "unknown";
  }

  readJson(name) {
    return JSON.parse(fs.readFileSync(path.join(this.dataDir, name), "utf8"));
  }

  writeJson(name, obj) {
    // Редактор пишет компактный JSON в одну строку — держим тот же стиль,
    // чтобы diff'ы не взрывались и редактор не переформатировал файл.
    fs.writeFileSync(path.join(this.dataDir, name), JSON.stringify(obj), "utf8");
  }

  get tilesets() {
    if (!this._tilesets) this._tilesets = this.readJson("Tilesets.json");
    return this._tilesets;
  }

  get mapInfos() {
    if (!this._mapInfos) this._mapInfos = this.readJson("MapInfos.json");
    return this._mapInfos;
  }

  tileset(id) {
    const ts = this.tilesets[id];
    if (!ts) throw new Error(`Тайлсет ${id} не найден в Tilesets.json`);
    return ts;
  }

  mapFileName(id) {
    return `Map${String(id).padStart(3, "0")}.json`;
  }

  loadMap(id) {
    const m = RMMap.load(path.join(this.dataDir, this.mapFileName(id)));
    m.project = this;
    m.id = id;
    return m;
  }

  saveMap(id, map) {
    this.writeJson(this.mapFileName(id), map.toJSON());
  }

  /** Список карт из MapInfos.json: [{id, name, parentId, order}]. */
  listMaps() {
    return this.mapInfos
      .map((info, id) => (info ? { id, name: info.name, parentId: info.parentId, order: info.order } : null))
      .filter(Boolean);
  }

  /** Свободный id карты (первая дырка в MapInfos). */
  nextMapId() {
    const infos = this.mapInfos;
    for (let i = 1; i < infos.length; i++) if (!infos[i]) return i;
    return Math.max(1, infos.length);
  }

  /** Регистрирует карту в MapInfos.json (не пишет на диск сам файл карты). */
  registerMap(id, name, { parentId = 0, order = null, x = 0, y = 0, scrollX = 0, scrollY = 0, expanded = false } = {}) {
    const infos = this.mapInfos;
    while (infos.length <= id) infos.push(null);
    infos[id] = {
      id, name, parentId, order: order === null ? id : order,
      expanded, scrollX, scrollY,
    };
    void x; void y;
    this.writeJson("MapInfos.json", infos);
    return infos[id];
  }

  /** Имена png-листов тайлсета: {A1..A5, B..E} → имя файла без расширения. */
  tilesetSheets(id) {
    const names = this.tileset(id).tilesetNames;
    const keys = ["A1", "A2", "A3", "A4", "A5", "B", "C", "D", "E"];
    const out = {};
    keys.forEach((k, i) => (out[k] = names[i] || ""));
    return out;
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   5. КАРТА
   ═══════════════════════════════════════════════════════════════════════ */

const DEFAULT_MAP = {
  autoplayBgm: false,
  autoplayBgs: false,
  battleback1Name: "",
  battleback2Name: "",
  bgm: { name: "", pan: 0, pitch: 100, volume: 90 },
  bgs: { name: "", pan: 0, pitch: 100, volume: 90 },
  disableDashing: false,
  displayName: "",
  encounterList: [],
  encounterStep: 30,
  height: 13,
  note: "",
  parallaxLoopX: false,
  parallaxLoopY: false,
  parallaxName: "",
  parallaxShow: true,
  parallaxSx: 0,
  parallaxSy: 0,
  scrollType: 0,
  specifyBattleback: false,
  tilesetId: 1,
  width: 17,
};

/** Слои карты. */
const Z = { LOWER: 0, LOWER2: 1, UPPER: 2, UPPER2: 3, SHADOW: 4, REGION: 5 };

class RMMap {
  constructor(data) {
    this.data = data; // сырой объект MapXXX.json
    this.project = null;
    this.id = null;
  }

  static load(file) {
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    const m = new RMMap(raw);
    m.file = file;
    return m;
  }

  static create({ width = 17, height = 13, tilesetId = 1, displayName = "", note = "" } = {}) {
    const data = JSON.parse(JSON.stringify(DEFAULT_MAP));
    data.width = width;
    data.height = height;
    data.tilesetId = tilesetId;
    data.displayName = displayName;
    data.note = note;
    data.data = new Array(width * height * 6).fill(0);
    data.events = [null];
    return new RMMap(data);
  }

  save(file) {
    fs.writeFileSync(file || this.file, JSON.stringify(this.toJSON()), "utf8");
  }

  toJSON() {
    return this.data;
  }

  get width() { return this.data.width; }
  get height() { return this.data.height; }
  get tilesetId() { return this.data.tilesetId; }
  set tilesetId(v) { this.data.tilesetId = v; }
  get events() { return this.data.events; }

  inside(x, y) {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  index(x, y, z) {
    return (z * this.height + y) * this.width + x;
  }

  get(x, y, z = 0) {
    if (!this.inside(x, y)) return 0;
    return this.data.data[this.index(x, y, z)] || 0;
  }

  set(x, y, z, tileId) {
    if (!this.inside(x, y)) return this;
    if (tileId < 0 || tileId >= TILE_ID_MAX) {
      throw new Error(`tileId ${tileId} вне диапазона 0..${TILE_ID_MAX - 1}`);
    }
    this.data.data[this.index(x, y, z)] = tileId;
    return this;
  }

  /** Все четыре тайловых слоя в клетке, сверху вниз (как layeredTiles движка). */
  layered(x, y) {
    return [3, 2, 1, 0].map((z) => this.get(x, y, z));
  }

  /* --- изменение размера ------------------------------------------------ */

  resize(width, height) {
    const out = new Array(width * height * 6).fill(0);
    for (let z = 0; z < 6; z++)
      for (let y = 0; y < Math.min(height, this.height); y++)
        for (let x = 0; x < Math.min(width, this.width); x++)
          out[(z * height + y) * width + x] = this.get(x, y, z);
    this.data.width = width;
    this.data.height = height;
    this.data.data = out;
    return this;
  }

  /* --- массовые операции ------------------------------------------------ */

  /** Прямоугольник (x,y,w,h) с клипом по границам карты. */
  static rect(x, y, w, h) {
    return { x, y, w, h };
  }

  forRect(rect, fn) {
    const { x, y, w, h } = rect;
    for (let j = y; j < y + h; j++)
      for (let i = x; i < x + w; i++) if (this.inside(i, j)) fn(i, j);
    return this;
  }

  fill(rect, z, tileId) {
    return this.forRect(rect, (x, y) => this.set(x, y, z, tileId));
  }

  /** Рамка толщиной 1 по периметру прямоугольника. */
  outline(rect, z, tileId) {
    const { x, y, w, h } = rect;
    for (let i = x; i < x + w; i++) {
      this.set(i, y, z, tileId);
      this.set(i, y + h - 1, z, tileId);
    }
    for (let j = y; j < y + h; j++) {
      this.set(x, j, z, tileId);
      this.set(x + w - 1, j, z, tileId);
    }
    return this;
  }

  /** Разбросать тайлы-«вариации» случайно (для травы, трещин, пятен). */
  scatter(rect, z, tileIds, chance = 0.08, rng = Math.random) {
    const list = [].concat(tileIds);
    return this.forRect(rect, (x, y) => {
      if (rng() < chance) this.set(x, y, z, list[Math.floor(rng() * list.length)]);
    });
  }

  /* --- автотайлы -------------------------------------------------------- */

  /**
   * Заливка автотайлом с автоматическим подбором форм.
   * kind — номер породы (T.a2Kind(col,row) и т.п.).
   */
  paintAutotile(rect, z, kind) {
    const raw = T.make(kind, 0);
    this.forRect(rect, (x, y) => this.set(x, y, z, raw));
    this.refreshAutotiles(
      { x: rect.x - 1, y: rect.y - 1, w: rect.w + 2, h: rect.h + 2 },
      z
    );
    return this;
  }

  /** Поставить одну клетку автотайла и пересчитать формы вокруг. */
  putAutotile(x, y, z, kind) {
    this.set(x, y, z, T.make(kind, 0));
    this.refreshAutotiles({ x: x - 1, y: y - 1, w: 3, h: 3 }, z);
    return this;
  }

  /**
   * Пересчитать формы всех автотайлов в области (по умолчанию — всей карты).
   * Именно это делает редактор при рисовании; без пересчёта швы будут «рваные».
   */
  refreshAutotiles(rect = null, z = null) {
    const zs = z === null ? [0, 1, 2, 3] : [z];
    const r = rect || { x: 0, y: 0, w: this.width, h: this.height };
    for (const zz of zs) {
      this.forRect(r, (x, y) => {
        const id = this.get(x, y, zz);
        if (!T.isAutotile(id)) return;
        this.set(x, y, zz, T.make(T.kind(id), this.solveShape(x, y, zz)));
      });
    }
    return this;
  }

  /** Правильная форма для автотайла в клетке (x,y,z). */
  solveShape(x, y, z, { outsideConnects = true } = {}) {
    const id = this.get(x, y, z);
    if (!T.isAutotile(id)) return 0;
    const kind = T.kind(id);
    const same = (dx, dy) => {
      const nx = x + dx, ny = y + dy;
      if (!this.inside(nx, ny)) return outsideConnects;
      const nid = this.get(nx, ny, z);
      return T.isAutotile(nid) && T.kind(nid) === kind;
    };
    const nb = {
      n: same(0, -1), s: same(0, 1), w: same(-1, 0), e: same(1, 0),
      nw: same(-1, -1), ne: same(1, -1), sw: same(-1, 1), se: same(1, 1),
    };
    switch (autotileFamily(id)) {
      case "wall": return solveWallShape(nb);
      case "waterfall": return solveWaterfallShape(nb);
      default: return solveFloorShape(nb);
    }
  }

  /* --- тени и регионы --------------------------------------------------- */

  /** Слой теней: биты 1=верх-лево, 2=верх-право, 4=низ-лево, 8=низ-право. */
  setShadow(x, y, bits) { return this.set(x, y, Z.SHADOW, bits & 0x0f); }
  getShadow(x, y) { return this.get(x, y, Z.SHADOW); }
  setRegion(x, y, id) { return this.set(x, y, Z.REGION, id & 0xff); }
  getRegion(x, y) { return this.get(x, y, Z.REGION); }

  /**
   * Автотень «как кистью тени в редакторе»: справа от вертикальной грани стены
   * левая половина соседней клетки затемняется.
   */
  castWallShadows({ clear = true } = {}) {
    if (clear) for (let y = 0; y < this.height; y++) for (let x = 0; x < this.width; x++) this.setShadow(x, y, 0);
    for (let y = 0; y < this.height; y++) {
      for (let x = 1; x < this.width; x++) {
        const left = this.get(x - 1, y, 0);
        const here = this.get(x, y, 0);
        const wallLeft = T.isShadowing(left) || T.isWall(left);
        const openHere = !(T.isShadowing(here) || T.isWall(here));
        if (wallLeft && openHere) this.setShadow(x, y, 0b0101); // левые четверти
      }
    }
    return this;
  }

  /* --- события ---------------------------------------------------------- */

  nextEventId() {
    const ev = this.data.events;
    for (let i = 1; i < ev.length; i++) if (!ev[i]) return i;
    return Math.max(1, ev.length);
  }

  addEvent(event) {
    const id = event.id || this.nextEventId();
    event.id = id;
    while (this.data.events.length <= id) this.data.events.push(null);
    this.data.events[id] = event;
    return event;
  }

  eventAt(x, y) {
    return this.data.events.filter((e) => e && e.x === x && e.y === y);
  }

  removeEvent(id) {
    if (this.data.events[id]) this.data.events[id] = null;
    return this;
  }

  /* --- строительные помощники ------------------------------------------ */

  /**
   * Классическая интерьерная комната RPG Maker.
   * rect — ПОЛ (внутренняя площадь). Сверху дорисовываются грань стены и её верх,
   * по бокам и снизу — один ряд верха стены.
   *
   * opts: {floorKind, wallTopKind, wallSideKind, faceHeight=1, z=0}
   * Все *Kind — номера пород (T.a2Kind / T.a4Kind).
   */
  buildRoom(rect, opts) {
    const { floorKind, wallTopKind, wallSideKind, faceHeight = 1, z = 0 } = opts;
    const { x, y, w, h } = rect;
    const outer = {
      x: x - 1,
      y: y - 1 - faceHeight,
      w: w + 2,
      h: h + 2 + faceHeight,
    };
    // 1. вся коробка — верх стены
    this.forRect(outer, (i, j) => this.set(i, j, z, T.make(wallTopKind, 0)));
    // 2. грань стены (то, что видно как «стена») над полом
    this.forRect({ x, y: y - faceHeight, w, h: faceHeight }, (i, j) =>
      this.set(i, j, z, T.make(wallSideKind, 0))
    );
    // 3. пол
    this.forRect(rect, (i, j) => this.set(i, j, z, T.make(floorKind, 0)));
    this.refreshAutotiles(
      { x: outer.x - 1, y: outer.y - 1, w: outer.w + 2, h: outer.h + 2 },
      z
    );
    return this;
  }

  /**
   * Ставит многотайловый объект (стол, шкаф, дерево) из «штампа».
   * stamp: { w, h, layers: { '0'|'1'|'2'|'3': [id, id, ...] } } — по строкам,
   * 0 = «не трогать».
   */
  stamp(x, y, stamp) {
    for (const [zStr, ids] of Object.entries(stamp.layers)) {
      const z = Number(zStr);
      ids.forEach((id, i) => {
        if (!id) return;
        this.set(x + (i % stamp.w), y + Math.floor(i / stamp.w), z, id);
      });
    }
    return this;
  }

  /* --- анализ ----------------------------------------------------------- */

  /** Флаги тайлсета (нужен project или явно переданный массив). */
  flags(explicit = null) {
    if (explicit) return explicit;
    if (!this.project) throw new Error("Нужен project, чтобы читать флаги тайлсета");
    return this.project.tileset(this.tilesetId).flags;
  }

  /**
   * Повторяет Game_Map.checkPassage. bit — 1|2|4|8 или 0x0f.
   *
   * Движок идёт по слоям сверху вниз и останавливается на первом тайле,
   * который «высказался» о проходимости. Пустая клетка (id 0) при этом
   * пропускается: в базе данных у тайла 0 стоит ★, иначе любая дырка в
   * верхнем слое делала бы стену под ней проходимой. Мы пропускаем id 0
   * явно, чтобы расчёт был верным и без загруженного тайлсета.
   */
  checkPassage(x, y, bit, flags) {
    const f = this.flags(flags);
    for (const tile of this.layered(x, y)) {
      if (tile === 0) continue;
      const flag = f[tile] || 0;
      if ((flag & FLAG.STAR) !== 0) continue;
      if ((flag & bit) === 0) return true;
      if ((flag & bit) === bit) return false;
    }
    return false;
  }

  /** Проходима ли клетка хоть в каком-то направлении (грубая проверка). */
  isWalkable(x, y, flags) {
    if (!this.inside(x, y)) return false;
    return this.checkPassage(x, y, 0x0f, flags);
  }

  /** Заливка достижимости из точки (учитывает только тайлы, не события). */
  reachable(startX, startY, flags) {
    const f = this.flags(flags);
    const seen = new Set();
    const key = (x, y) => y * this.width + x;
    if (!this.isWalkable(startX, startY, f)) return seen;
    const stack = [[startX, startY]];
    seen.add(key(startX, startY));
    const steps = [[0, -1, 8, 2], [0, 1, 2, 8], [-1, 0, 4, 6], [1, 0, 6, 4]];
    while (stack.length) {
      const [x, y] = stack.pop();
      for (const [dx, dy, d, back] of steps) {
        const nx = x + dx, ny = y + dy;
        if (!this.inside(nx, ny) || seen.has(key(nx, ny))) continue;
        if (!this.checkPassage(x, y, DIR_BIT[d], f)) continue;
        if (!this.checkPassage(nx, ny, DIR_BIT[back], f)) continue;
        seen.add(key(nx, ny));
        stack.push([nx, ny]);
      }
    }
    return seen;
  }

  /** ASCII-превью нижнего слоя: # стена/непроходимо, . пол, E событие. */
  toAscii({ flags = null, showEvents = true } = {}) {
    let f = null;
    try { f = this.flags(flags); } catch (_) { f = null; }
    const evMap = new Map();
    if (showEvents)
      for (const e of this.data.events) if (e) evMap.set(e.y * this.width + e.x, e);
    const lines = [];
    for (let y = 0; y < this.height; y++) {
      let line = "";
      for (let x = 0; x < this.width; x++) {
        const ev = evMap.get(y * this.width + x);
        if (ev) { line += "E"; continue; }
        const id = this.get(x, y, 0);
        if (!T.isVisible(id) && !T.isVisible(this.get(x, y, 1))) { line += " "; continue; }
        if (f) { line += this.isWalkable(x, y, f) ? "." : "#"; continue; }
        line += T.isWall(id) || T.isA3(id) ? "#" : ".";
      }
      lines.push(line);
    }
    return lines.join("\n");
  }

  /**
   * Набор проверок «карта не сломана и в неё можно играть».
   * Возвращает [{level:'error'|'warn', msg, x?, y?}].
   */
  validate({ flags = null, start = null } = {}) {
    const issues = [];
    const d = this.data;
    const expect = this.width * this.height * 6;
    if (!Array.isArray(d.data) || d.data.length !== expect) {
      issues.push({ level: "error", msg: `data.length = ${d.data && d.data.length}, ожидается ${expect} (w*h*6)` });
      return issues;
    }
    for (let i = 0; i < d.data.length; i++) {
      const v = d.data[i];
      if (!Number.isInteger(v) || v < 0 || (i < this.width * this.height * 4 && v >= TILE_ID_MAX)) {
        issues.push({ level: "error", msg: `data[${i}] = ${v} — некорректный tileId` });
        break;
      }
    }
    // события
    const seenPos = new Map();
    d.events.forEach((e, i) => {
      if (!e) return;
      if (e.id !== i) issues.push({ level: "error", msg: `Событие в events[${i}] имеет id=${e.id}` });
      if (!this.inside(e.x, e.y))
        issues.push({ level: "error", msg: `Событие ${e.id} (${e.name}) вне карты: ${e.x},${e.y}`, x: e.x, y: e.y });
      const k = `${e.x},${e.y}`;
      if (seenPos.has(k))
        issues.push({ level: "warn", msg: `События ${seenPos.get(k)} и ${e.id} стоят в одной клетке ${k}`, x: e.x, y: e.y });
      else seenPos.set(k, e.id);
      if (!e.pages || !e.pages.length)
        issues.push({ level: "error", msg: `У события ${e.id} нет страниц` });
    });
    // формы автотайлов
    for (let z = 0; z < 4; z++)
      for (let y = 0; y < this.height; y++)
        for (let x = 0; x < this.width; x++) {
          const id = this.get(x, y, z);
          if (!T.isAutotile(id)) continue;
          const want = this.solveShape(x, y, z);
          if (T.shape(id) !== want && T.shape(id) !== 47)
            issues.push({
              level: "warn",
              msg: `Автотайл (${x},${y},z${z}): форма ${T.shape(id)}, по соседям ожидается ${want} — будет видимый шов`,
              x, y,
            });
        }
    // «висящая» декорация: верхний слой есть, а земли под ним нет
    for (let y = 0; y < this.height; y++)
      for (let x = 0; x < this.width; x++) {
        const ground = this.get(x, y, 0);
        const upper = this.get(x, y, 1) || this.get(x, y, 2) || this.get(x, y, 3);
        if (!T.isVisible(ground) && T.isVisible(upper))
          issues.push({ level: "warn", msg: `(${x},${y}): декор на слое выше без тайла земли на слое 0`, x, y });
      }
    // проходимость
    let f = null;
    try { f = this.flags(flags); } catch (_) { /* без проекта — пропускаем */ }
    if (f) {
      if (((f[0] || 0) & FLAG.STAR) === 0)
        issues.push({
          level: "warn",
          msg: "У тайла 0 в тайлсете не стоит ★ — редактор так не делает; проверь настройки проходимости листа B",
        });
      // декор поверх стены, который случайно сделал стену проходимой
      for (let y = 0; y < this.height; y++)
        for (let x = 0; x < this.width; x++) {
          const ground = this.get(x, y, 0);
          if (!T.isWall(ground) && !T.isRoof(ground)) continue;
          if (![1, 2, 3].some((z) => T.isVisible(this.get(x, y, z)))) continue;
          if (this.isWalkable(x, y, f))
            issues.push({
              level: "warn",
              msg: `(${x},${y}): декор на стене сделал её проходимой — поставь этому тайлу ★ или запрет прохода в тайлсете`,
              x, y,
            });
        }
      const startPt = start || this.guessStart(f);
      if (!startPt) {
        issues.push({ level: "warn", msg: "На карте нет ни одной проходимой клетки" });
      } else {
        const seen = this.reachable(startPt.x, startPt.y, f);
        let walkable = 0, unreachable = 0;
        for (let y = 0; y < this.height; y++)
          for (let x = 0; x < this.width; x++) {
            if (!this.isWalkable(x, y, f)) continue;
            walkable++;
            if (!seen.has(y * this.width + x)) unreachable++;
          }
        if (unreachable > 0)
          issues.push({
            level: "warn",
            msg: `Недостижимо ${unreachable} из ${walkable} проходимых клеток (старт ${startPt.x},${startPt.y}) — проверь, не отрезана ли часть карты`,
          });
        // события, до которых нельзя дотянуться
        for (const e of d.events) {
          if (!e || !e.pages || !e.pages.length) continue;
          const trigger = e.pages[0].trigger;
          if (trigger !== 0 && trigger !== 1 && trigger !== 2) continue;
          const spots = [[0, 0], [0, -1], [0, 1], [-1, 0], [1, 0]];
          const ok = spots.some(([dx, dy]) => seen.has((e.y + dy) * this.width + (e.x + dx)));
          if (!ok)
            issues.push({
              level: "warn",
              msg: `К событию ${e.id} (${e.name}) в (${e.x},${e.y}) нельзя подойти`,
              x: e.x, y: e.y,
            });
        }
      }
    }
    return issues;
  }

  guessStart(flags) {
    for (let y = 0; y < this.height; y++)
      for (let x = 0; x < this.width; x++)
        if (this.isWalkable(x, y, flags)) return { x, y };
    return null;
  }

  /** Сводка: сколько чего использовано (полезно для «а что тут вообще есть»). */
  stats() {
    const perSheet = {};
    let decorated = 0, total = this.width * this.height;
    for (let y = 0; y < this.height; y++)
      for (let x = 0; x < this.width; x++) {
        let hasDecor = false;
        for (let z = 0; z < 4; z++) {
          const id = this.get(x, y, z);
          if (!T.isVisible(id)) continue;
          const s = T.sheetOf(id);
          perSheet[s] = (perSheet[s] || 0) + 1;
          if (z >= 1) hasDecor = true;
        }
        if (hasDecor) decorated++;
      }
    return {
      size: `${this.width}x${this.height}`,
      tiles: total,
      decorDensity: +(decorated / total).toFixed(3),
      events: this.data.events.filter(Boolean).length,
      perSheet,
    };
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   6. СОБЫТИЯ: КОМАНДЫ И КОНСТРУКТОР
   ═══════════════════════════════════════════════════════════════════════ */

const c = (code, parameters = [], indent = 0) => ({ code, indent, parameters });

/** Команды событий. Полный список кодов — в references/06-event-commands.md. */
const Cmd = {
  raw: c,
  /** Текст в окне сообщения. lines — массив строк (по 4 на окно). */
  text(lines, { face = "", faceIndex = 0, background = 0, position = 2, speakerName = "" } = {}) {
    const out = [c(101, [face, faceIndex, background, position, speakerName])];
    for (const line of [].concat(lines)) out.push(c(401, [line]));
    return out;
  },
  /** Выбор из вариантов. choices — массив строк. */
  choices(choices, { cancelType = -1, defaultType = 0, position = 2, background = 0 } = {}) {
    return [c(102, [choices, cancelType, defaultType, position, background])];
  },
  when(index, label) { return [c(402, [index, label])]; },
  whenCancel() { return [c(403, [])]; },
  endBranch() { return [c(0, [])]; },

  selfSwitch(ch, on = true) { return [c(123, [ch, on ? 0 : 1])]; },
  gameSwitch(id, on = true) { return [c(121, [id, id, on ? 0 : 1])]; },
  variable(id, value, op = 0) { return [c(122, [id, id, op, 0, value])]; },

  playSE(name, { volume = 90, pitch = 100, pan = 0 } = {}) { return [c(250, [{ name, volume, pitch, pan }]) ]; },
  playME(name, { volume = 90, pitch = 100, pan = 0 } = {}) { return [c(249, [{ name, volume, pitch, pan }]) ]; },
  playBGM(name, { volume = 90, pitch = 100, pan = 0 } = {}) { return [c(241, [{ name, volume, pitch, pan }]) ]; },

  wait(frames) { return [c(230, [frames])]; },
  transfer(mapId, x, y, direction = 0, fade = 0) { return [c(201, [0, mapId, x, y, direction, fade])]; },
  showAnimation(eventId, animationId, wait = false) { return [c(212, [eventId, animationId, wait])]; },
  showBalloon(eventId, balloonId, wait = false) { return [c(213, [eventId, balloonId, wait])]; },
  changeItems(itemId, amount) { return [c(126, [itemId, 0, 0, amount, false])]; },
  changeGold(amount) { return [c(125, [amount >= 0 ? 0 : 1, 0, Math.abs(amount)])]; },
  commonEvent(id) { return [c(117, [id])]; },
  screenTint(tone, duration = 60, wait = true) { return [c(223, [tone, duration, wait])]; },
  /** Маршрут движения самого события (this): moves — массив кодов 1..47. */
  moveRoute(moves, { target = 0, repeat = false, skippable = true, wait = false } = {}) {
    const list = moves.map((m) => (typeof m === "number" ? { code: m, parameters: [] } : m));
    list.push({ code: 0, parameters: [] });
    const route = { list, repeat, skippable, wait };
    const out = [c(205, [target, route])];
    for (const step of list) out.push(c(505, [step]));
    return out;
  },
  /** Условная ветка по переключателю / собственному переключателю. */
  ifSelfSwitch(ch, on, thenCmds, elseCmds = null) {
    const body = [];
    body.push(c(111, [2, ch, on ? 0 : 1]));
    for (const cmd of thenCmds) body.push({ ...cmd, indent: cmd.indent + 1 });
    if (elseCmds) {
      body.push(c(411, []));
      for (const cmd of elseCmds) body.push({ ...cmd, indent: cmd.indent + 1 });
    }
    body.push(c(412, []));
    return body;
  },
  /** Завершающая команда списка (её добавляет Ev.page автоматически). */
  end() { return c(0, []); },
};

const EMPTY_CONDITIONS = {
  actorId: 1, actorValid: false,
  itemId: 1, itemValid: false,
  selfSwitchCh: "A", selfSwitchValid: false,
  switch1Id: 1, switch1Valid: false,
  switch2Id: 1, switch2Valid: false,
  variableId: 1, variableValid: false, variableValue: 0,
};

const EMPTY_IMAGE = {
  tileId: 0, characterName: "", direction: 2, pattern: 1, characterIndex: 0,
};

/** Конструктор событий. */
const Ev = {
  /**
   * Страница события.
   * opts:
   *  image: {characterName, characterIndex, direction, pattern} или {tileId}
   *  conditions: {selfSwitch:'A'} | {switch1:5} | {switch2:7} | {variable:[id,val]} | {item:3} | {actor:1}
   *  trigger: 0 кнопка действия, 1 касание игроком, 2 касание событием,
   *           3 автозапуск, 4 параллельный процесс
   *  priority: 0 под героем, 1 вровень (блокирует), 2 над героем
   *  through, walkAnime, stepAnime, directionFix, moveType, moveSpeed, moveFrequency
   */
  page(opts = {}) {
    const cond = { ...EMPTY_CONDITIONS };
    const cnd = opts.conditions || {};
    if (cnd.selfSwitch) { cond.selfSwitchValid = true; cond.selfSwitchCh = cnd.selfSwitch; }
    if (cnd.switch1) { cond.switch1Valid = true; cond.switch1Id = cnd.switch1; }
    if (cnd.switch2) { cond.switch2Valid = true; cond.switch2Id = cnd.switch2; }
    if (cnd.variable) { cond.variableValid = true; cond.variableId = cnd.variable[0]; cond.variableValue = cnd.variable[1]; }
    if (cnd.item) { cond.itemValid = true; cond.itemId = cnd.item; }
    if (cnd.actor) { cond.actorValid = true; cond.actorId = cnd.actor; }

    const list = (opts.list || []).map((cmd) => ({ ...cmd }));
    if (!list.length || list[list.length - 1].code !== 0) list.push(Cmd.end());

    return {
      conditions: cond,
      directionFix: opts.directionFix ?? false,
      image: { ...EMPTY_IMAGE, ...(opts.image || {}) },
      list,
      moveFrequency: opts.moveFrequency ?? 3,
      moveRoute: opts.moveRoute || { list: [{ code: 0, parameters: [] }], repeat: true, skippable: false, wait: false },
      moveSpeed: opts.moveSpeed ?? 3,
      moveType: opts.moveType ?? 0,
      priorityType: opts.priority ?? 0,
      stepAnime: opts.stepAnime ?? false,
      through: opts.through ?? false,
      trigger: opts.trigger ?? 0,
      walkAnime: opts.walkAnime ?? true,
    };
  },

  event({ id = 0, name = "EV", x = 0, y = 0, note = "", pages = [] }) {
    return { id, name, note, pages: pages.length ? pages : [Ev.page()], x, y };
  },

  /**
   * Тайл-объект: событие, которое выглядит как тайл из листа B..E.
   * Именно так делаются «предметы обстановки, с которыми можно взаимодействовать».
   * priority 0 — под героем (ковёр), 1 — вровень (сундук), 2 — над героем (крона).
   */
  tileImage(tileId, { direction = 2, pattern = 0 } = {}) {
    return { tileId, characterName: "", characterIndex: 0, direction, pattern };
  },

  charImage(characterName, characterIndex = 0, { direction = 2, pattern = 1 } = {}) {
    return { tileId: 0, characterName, characterIndex, direction, pattern };
  },
};

module.exports = {
  T, Z, FLAG, DIR_BIT, describeFlag,
  RMMap, Project, Ev, Cmd,
  FLOOR_AUTOTILE_TABLE, WALL_AUTOTILE_TABLE, WATERFALL_AUTOTILE_TABLE,
  solveFloorShape, solveWallShape, solveWaterfallShape, autotileFamily,
};
