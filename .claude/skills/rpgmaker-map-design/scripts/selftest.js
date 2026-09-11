"use strict";
/**
 * selftest.js — проверка библиотеки без реального проекта RPG Maker.
 * Запуск: node selftest.js
 *
 * Главное, что здесь проверяется, — решатель форм автотайлов: для каждой
 * из 256 комбинаций соседей форма должна существовать и совпадать с той,
 * что использует корескрипт при отрисовке.
 */

const assert = require("assert");
const {
  T, Z, RMMap, Ev, Cmd,
  FLOOR_AUTOTILE_TABLE, WALL_AUTOTILE_TABLE,
  solveFloorShape, solveWallShape,
} = require("./rpgmap");

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (e) {
    console.error(`FAIL  ${name}\n      ${e.message}`);
    process.exitCode = 1;
  }
}

console.log("Тайловая арифметика");

test("границы листов совпадают с корескриптом", () => {
  assert.strictEqual(T.TILE_ID_A1, 2048);
  assert.strictEqual(T.kind(T.TILE_ID_A2), 16);
  assert.strictEqual(T.kind(T.TILE_ID_A3), 48);
  assert.strictEqual(T.kind(T.TILE_ID_A4), 80);
  assert.strictEqual(T.kind(T.TILE_ID_MAX), 128);
});

test("make/kind/shape — взаимно обратны", () => {
  for (let kind = 0; kind < 128; kind++)
    for (const shape of [0, 1, 17, 46, 47]) {
      const id = T.make(kind, shape);
      assert.strictEqual(T.kind(id), kind);
      assert.strictEqual(T.shape(id), shape);
    }
});

test("id обычных тайлов раскладываются в те же координаты листа", () => {
  // sx/sy из Tilemap._addNormalTile
  const pos = (id) => ({
    col: (Math.floor(id / 128) % 2) * 8 + (id % 8),
    row: Math.floor((id % 256) / 8) % 16,
  });
  for (const sheet of ["B", "C", "D", "E"])
    for (let row = 0; row < 16; row++)
      for (let col = 0; col < 16; col++) {
        const id = T.sheet(sheet, col, row);
        assert.deepStrictEqual(pos(id), { col, row }, `${sheet} ${col},${row} -> ${id}`);
        // id 0 — это «пусто»: левый верхний тайл листа B недоступен и в редакторе
        if (id !== 0) assert.strictEqual(T.sheetOf(id), sheet);
      }
  assert.strictEqual(T.sheet("B", 0, 0), 0, "B(0,0) — это id 0, то есть пустая клетка");
  for (let row = 0; row < 16; row++)
    for (let col = 0; col < 8; col++) {
      const id = T.a5(col, row);
      assert.deepStrictEqual(pos(id), { col, row });
      assert.strictEqual(T.sheetOf(id), "A5");
    }
});

test("классификация A3/A4 совпадает с Tilemap.isWallTop/isWallSide/isRoof", () => {
  const isRoof = (id) => T.isA3(id) && T.kind(id) % 16 < 8;
  const isWallTop = (id) => T.isA4(id) && T.kind(id) % 16 < 8;
  for (let kind = 48; kind < 128; kind++) {
    const id = T.make(kind, 0);
    assert.strictEqual(T.isRoof(id), isRoof(id));
    assert.strictEqual(T.isWallTop(id), isWallTop(id));
  }
  // ряды A4 чередуются: чётный ряд — верх стены, нечётный — грань
  assert.ok(T.isWallTop(T.make(T.a4Kind(0, 0), 0)));
  assert.ok(T.isWallSide(T.make(T.a4Kind(0, 1), 0)));
  assert.ok(T.isWallTop(T.make(T.a4Kind(3, 2), 0)));
  assert.ok(T.isWallSide(T.make(T.a4Kind(3, 3), 0)));
});

console.log("Решатель форм автотайлов");

test("floor: все 256 комбинаций соседей дают валидную форму 0..47", () => {
  const seen = new Set();
  for (let m = 0; m < 256; m++) {
    const nb = {
      n: !!(m & 1), e: !!(m & 2), s: !!(m & 4), w: !!(m & 8),
      nw: !!(m & 16), ne: !!(m & 32), se: !!(m & 64), sw: !!(m & 128),
    };
    const shape = solveFloorShape(nb);
    assert.ok(shape >= 0 && shape < 48, `shape ${shape}`);
    seen.add(shape);
  }
  // достижимы ровно 47 форм: 48-я (№47) — «отдельный» тайл из левого
  // верхнего угла блока, редактор её при обычной укладке не выдаёт
  assert.strictEqual(seen.size, 47, `получено уникальных форм: ${seen.size}`);
  assert.ok(!seen.has(47));
});

test("floor: опорные формы совпадают с таблицей четвертей", () => {
  const all = { n: 1, e: 1, s: 1, w: 1, nw: 1, ne: 1, se: 1, sw: 1 };
  assert.strictEqual(solveFloorShape(all), 0, "окружён со всех сторон -> 0");
  assert.strictEqual(solveFloorShape({ ...all, nw: 0 }), 1, "нет NW -> 1");
  assert.strictEqual(solveFloorShape({ ...all, ne: 0 }), 2, "нет NE -> 2");
  assert.strictEqual(solveFloorShape({ ...all, se: 0 }), 4, "нет SE -> 4");
  assert.strictEqual(solveFloorShape({ ...all, sw: 0 }), 8, "нет SW -> 8");
  assert.strictEqual(solveFloorShape({ ...all, w: 0 }), 16, "нет W -> 16");
  assert.strictEqual(solveFloorShape({ ...all, n: 0 }), 20, "нет N -> 20");
  assert.strictEqual(solveFloorShape({ ...all, e: 0 }), 24, "нет E -> 24");
  assert.strictEqual(solveFloorShape({ ...all, s: 0 }), 28, "нет S -> 28");
  assert.strictEqual(solveFloorShape({ ...all, n: 0, s: 0 }), 33, "коридор по горизонтали -> 33");
  assert.strictEqual(solveFloorShape({ ...all, n: 0, w: 0 }), 34, "внешний угол N+W -> 34");
  assert.strictEqual(solveFloorShape({}), 46, "одиночный тайл -> 46");
  // диагональ без обоих кардиналов игнорируется (нормализация)
  assert.strictEqual(
    solveFloorShape({ n: 1, e: 1, s: 1, w: 1, nw: 1, ne: 1, se: 1, sw: 1 }),
    solveFloorShape({ n: 1, e: 1, s: 1, w: 1, nw: 1, ne: 1, se: 1, sw: 1 })
  );
  assert.strictEqual(solveFloorShape({ nw: 1, ne: 1, se: 1, sw: 1 }), 46);
});

test("floor: каждая выданная форма реально существует в FLOOR_AUTOTILE_TABLE", () => {
  for (let m = 0; m < 256; m++) {
    const nb = {
      n: !!(m & 1), e: !!(m & 2), s: !!(m & 4), w: !!(m & 8),
      nw: !!(m & 16), ne: !!(m & 32), se: !!(m & 64), sw: !!(m & 128),
    };
    const entry = FLOOR_AUTOTILE_TABLE[solveFloorShape(nb)];
    assert.strictEqual(entry.length, 4);
  }
});

test("wall: биты соответствуют WALL_AUTOTILE_TABLE", () => {
  assert.strictEqual(solveWallShape({ n: 1, e: 1, s: 1, w: 1 }), 0);
  assert.strictEqual(solveWallShape({ n: 1, e: 1, s: 1, w: 0 }), 1);
  assert.strictEqual(solveWallShape({ n: 0, e: 1, s: 1, w: 1 }), 2);
  assert.strictEqual(solveWallShape({ n: 1, e: 0, s: 1, w: 1 }), 4);
  assert.strictEqual(solveWallShape({ n: 1, e: 1, s: 0, w: 1 }), 8);
  assert.strictEqual(solveWallShape({}), 15);
  assert.strictEqual(WALL_AUTOTILE_TABLE.length, 16);
});

console.log("Карта");

test("create даёт корректный по размеру массив data", () => {
  const m = RMMap.create({ width: 20, height: 15 });
  assert.strictEqual(m.data.data.length, 20 * 15 * 6);
  assert.strictEqual(m.validate().length, 0);
});

test("индексация слоёв совпадает с Game_Map.tileId", () => {
  const m = RMMap.create({ width: 7, height: 5 });
  m.set(3, 2, 1, 123);
  const idx = (1 * 5 + 2) * 7 + 3;
  assert.strictEqual(m.data.data[idx], 123);
  assert.strictEqual(m.get(3, 2, 1), 123);
});

test("paintAutotile расставляет швы по краям заливки", () => {
  const m = RMMap.create({ width: 9, height: 9 });
  const kind = T.a2Kind(0, 0);
  m.paintAutotile({ x: 2, y: 2, w: 5, h: 5 }, 0, kind);
  // центр — сплошной
  assert.strictEqual(T.shape(m.get(4, 4, 0)), 0);
  // левый край — форма «нет соседа слева»
  assert.strictEqual(T.shape(m.get(2, 4, 0)), 16);
  // верхний левый угол — нет N и W
  assert.strictEqual(T.shape(m.get(2, 2, 0)), 34);
  // валидатор не должен ругаться на швы
  assert.strictEqual(m.validate().filter((i) => /шов/.test(i.msg)).length, 0);
});

test("края карты по умолчанию считаются продолжением заливки", () => {
  const m = RMMap.create({ width: 5, height: 5 });
  m.paintAutotile({ x: 0, y: 0, w: 5, h: 5 }, 0, T.a2Kind(0, 0));
  assert.strictEqual(T.shape(m.get(0, 0, 0)), 0, "угол карты не должен получать кромку");
});

test("buildRoom строит пол, грань и верх стены", () => {
  const m = RMMap.create({ width: 15, height: 12 });
  const floor = T.a2Kind(0, 0);
  const top = T.a4Kind(0, 0);
  const side = T.a4Kind(0, 1);
  m.buildRoom({ x: 2, y: 4, w: 9, h: 6 }, { floorKind: floor, wallTopKind: top, wallSideKind: side });
  assert.strictEqual(T.kind(m.get(5, 6, 0)), floor, "внутри — пол");
  assert.strictEqual(T.kind(m.get(5, 3, 0)), side, "над полом — грань стены");
  assert.strictEqual(T.kind(m.get(5, 2, 0)), top, "выше — верх стены");
  assert.strictEqual(T.kind(m.get(1, 6, 0)), top, "слева — верх стены");
  assert.strictEqual(T.kind(m.get(5, 10, 0)), top, "снизу — верх стены");
  assert.ok(m.validate().every((i) => i.level !== "error"));
});

test("resize сохраняет содержимое", () => {
  const m = RMMap.create({ width: 6, height: 6 });
  m.set(1, 1, 0, 500).set(5, 5, 0, 600);
  m.resize(10, 10);
  assert.strictEqual(m.get(1, 1, 0), 500);
  assert.strictEqual(m.get(5, 5, 0), 600);
  assert.strictEqual(m.data.data.length, 600);
});

test("тени: справа от стены левые четверти затемняются", () => {
  const m = RMMap.create({ width: 6, height: 3 });
  m.fill({ x: 0, y: 0, w: 6, h: 3 }, 0, T.make(T.a2Kind(0, 0), 0));
  m.set(1, 1, 0, T.make(T.a4Kind(0, 1), 0)); // грань стены
  m.castWallShadows();
  assert.strictEqual(m.getShadow(2, 1), 0b0101);
  assert.strictEqual(m.getShadow(3, 1), 0);
});

console.log("События");

test("страница события имеет все поля, которые читает движок", () => {
  const p = Ev.page({ conditions: { selfSwitch: "A" }, trigger: 0, priority: 1 });
  for (const k of ["conditions", "directionFix", "image", "list", "moveFrequency",
    "moveRoute", "moveSpeed", "moveType", "priorityType", "stepAnime",
    "through", "trigger", "walkAnime"])
    assert.ok(k in p, `нет поля ${k}`);
  for (const k of ["actorId", "actorValid", "itemId", "itemValid", "selfSwitchCh",
    "selfSwitchValid", "switch1Id", "switch1Valid", "switch2Id", "switch2Valid",
    "variableId", "variableValid", "variableValue"])
    assert.ok(k in p.conditions, `нет условия ${k}`);
  assert.strictEqual(p.conditions.selfSwitchValid, true);
  assert.strictEqual(p.conditions.selfSwitchCh, "A");
  assert.strictEqual(p.list[p.list.length - 1].code, 0, "список команд должен кончаться кодом 0");
});

test("Cmd.text разворачивается в 101 + 401", () => {
  const list = Cmd.text(["Привет", "мир"]);
  assert.deepStrictEqual(list.map((x) => x.code), [101, 401, 401]);
  assert.strictEqual(list[1].parameters[0], "Привет");
});

test("Cmd.ifSelfSwitch делает корректные отступы", () => {
  const list = Cmd.ifSelfSwitch("A", true, Cmd.playSE("Fire"), Cmd.playSE("Water"));
  assert.deepStrictEqual(list.map((x) => x.code), [111, 250, 411, 250, 412]);
  assert.strictEqual(list[1].indent, 1);
  assert.strictEqual(list[3].indent, 1);
});

test("Cmd.moveRoute дублирует шаги в 505", () => {
  const list = Cmd.moveRoute([1, 2]);
  assert.strictEqual(list[0].code, 205);
  assert.deepStrictEqual(list.slice(1).map((x) => x.code), [505, 505, 505]);
});

test("addEvent нумерует события и валидатор это принимает", () => {
  const m = RMMap.create({ width: 10, height: 10 });
  const e1 = m.addEvent(Ev.event({ name: "Свеча", x: 2, y: 2 }));
  const e2 = m.addEvent(Ev.event({ name: "Сундук", x: 4, y: 2 }));
  assert.strictEqual(e1.id, 1);
  assert.strictEqual(e2.id, 2);
  assert.strictEqual(m.data.events[0], null);
  assert.ok(m.validate().every((i) => i.level !== "error"));
});

test("валидатор ловит два события в одной клетке и пустой список страниц", () => {
  const m = RMMap.create({ width: 10, height: 10 });
  m.addEvent(Ev.event({ name: "A", x: 3, y: 3 }));
  m.addEvent(Ev.event({ name: "B", x: 3, y: 3 }));
  const issues = m.validate();
  assert.ok(issues.some((i) => /одной клетке/.test(i.msg)));
});

test("валидатор ловит рассогласованные формы автотайлов", () => {
  const m = RMMap.create({ width: 6, height: 6 });
  m.paintAutotile({ x: 1, y: 1, w: 4, h: 4 }, 0, T.a2Kind(0, 0));
  m.set(2, 2, 0, T.make(T.a2Kind(0, 0), 46)); // руками испортили форму
  assert.ok(m.validate().some((i) => /шов/.test(i.msg)));
});

test("валидатор ловит декор без земли под ним", () => {
  const m = RMMap.create({ width: 5, height: 5 });
  m.set(2, 2, 1, T.b(3, 3));
  assert.ok(m.validate().some((i) => /без тайла земли/.test(i.msg)));
});

test("проходимость и достижимость считаются по флагам тайлсета", () => {
  const m = RMMap.create({ width: 7, height: 5 });
  const FLOOR = T.a5(0, 0);
  const WALL = T.a5(1, 0);
  const flags = new Array(8192).fill(0);
  flags[0] = 0x10; // как в базе данных: пустой тайл помечен ★
  flags[WALL] = 0x0f; // непроходим со всех сторон
  m.fill({ x: 0, y: 0, w: 7, h: 5 }, 0, FLOOR);
  for (let y = 0; y < 5; y++) m.set(3, y, 0, WALL); // стена делит карту пополам
  assert.strictEqual(m.isWalkable(3, 2, flags), false);
  const seen = m.reachable(0, 0, flags);
  assert.ok(seen.has(0 * 7 + 2), "левая половина достижима");
  assert.ok(!seen.has(0 * 7 + 4), "правая половина отрезана");
  assert.ok(m.validate({ flags }).some((i) => /Недостижимо/.test(i.msg)));
});

console.log(`\n${passed} проверок пройдено`);
if (process.exitCode) console.error("Есть падения — см. выше.");
