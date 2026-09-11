"use strict";
/**
 * tavern-room.js — рабочий пример: зал таверны 15×11 с обстановкой,
 * интерактивными свечами, сундуком, дверью и книжной полкой.
 *
 *   node examples/tavern-room.js <путь-к-проекту> [mapId] [--write]
 *
 * Без --write ничего не пишется: печатается схема и результат проверок.
 *
 * ВАЖНО: id тайлов ниже подобраны под стандартный интерьерный тайлсет
 * (Inside_A2 / Inside_A4 / Inside_B). В своём проекте сверься с реальными
 * координатами: `node cli.js tileset <проект> <id>` и палитрой редактора.
 * Правило: T.b(col,row) — координаты в листе B, считая с нуля.
 */

const path = require("path");
const { Project, RMMap, T, Z, Ev, Cmd } = require("../rpgmap");

const [, , projectDir, mapIdArg, ...rest] = process.argv;
const WRITE = rest.includes("--write") || mapIdArg === "--write";
const MAP_ID = Number(mapIdArg) || null;

if (!projectDir) {
  console.error("Использование: node examples/tavern-room.js <проект> [mapId] [--write]");
  process.exit(1);
}

const project = new Project(projectDir);

/* ── 1. Палитра: даём тайлам имена, а не магические числа ────────────────── */

const KIND = {
  floorWood: T.a2Kind(0, 0), // A2, левая верхняя порода — доски
  floorStone: T.a2Kind(1, 0), // A2, соседняя — камень (для очага)
  wallTop: T.a4Kind(0, 0), // A4, чётный ряд — верх стены
  wallSide: T.a4Kind(0, 1), // A4, нечётный ряд — грань стены
};

// Декор с листа B (col, row). Замени под свой тайлсет.
const B = {
  tableL: T.b(0, 4), tableR: T.b(1, 4),
  chairL: T.b(2, 4), chairR: T.b(3, 4),
  barrel: T.b(4, 5),
  shelfTop: T.b(6, 2), shelfBottom: T.b(6, 3),
  rugTL: T.b(0, 8), rugTR: T.b(1, 8), rugBL: T.b(0, 9), rugBR: T.b(1, 9),
  candleOff: T.b(5, 0),
  candleOn: T.b(6, 0),
  chestClosed: T.b(2, 6),
  chestOpen: T.b(3, 6),
  doorTop: T.b(7, 0), doorBottom: T.b(7, 1),
  window: T.b(4, 0),
  painting: T.b(5, 1),
  plant: T.b(3, 5),
};

/* ── 2. Геометрия комнаты ─────────────────────────────────────────────────
   Комната не квадратная: справа сделана ниша под очаг — это сразу читается
   как «отдельная зона» и даёт глазу за что зацепиться.                     */

// Пол занимает x 1..13, y 2..8; вокруг buildRoom сам добавит стены,
// так что коробка ровно ложится в карту 15×10 без пустых рядов.
const FLOOR = { x: 1, y: 2, w: 13, h: 7 };
const map = RMMap.create({ width: 15, height: 10, tilesetId: 1, displayName: "Таверна «Три бочки»" });
map.project = project;

map.buildRoom(FLOOR, {
  floorKind: KIND.floorWood,
  wallTopKind: KIND.wallTop,
  wallSideKind: KIND.wallSide,
  faceHeight: 1,
});

// Каменный пятачок у очага — смена материала вместо смены геометрии.
map.paintAutotile({ x: 10, y: 2, w: 3, h: 2 }, Z.LOWER, KIND.floorStone);

/* ── 3. Обстановка ────────────────────────────────────────────────────────
   Порядок важен: сначала крупное (что определяет маршрут), потом мелочь.   */

// Ковёр в центре зала — «якорь» композиции, кладём на второй нижний слой.
map.set(6, 5, Z.LOWER2, B.rugTL).set(7, 5, Z.LOWER2, B.rugTR);
map.set(6, 6, Z.LOWER2, B.rugBL).set(7, 6, Z.LOWER2, B.rugBR);

// Два стола со стульями — не в ряд, а со сдвигом, чтобы не было «казармы».
placeTable(3, 4);
placeTable(9, 6);

function placeTable(x, y) {
  map.set(x, y, Z.LOWER2, B.tableL).set(x + 1, y, Z.LOWER2, B.tableR);
  map.set(x - 1, y, Z.LOWER2, B.chairL);
  map.set(x + 2, y, Z.LOWER2, B.chairR);
}

// Стойка у левой стены, бочки рядом.
map.set(1, 3, Z.LOWER2, B.barrel).set(1, 4, Z.LOWER2, B.barrel);

// Полка: два тайла по вертикали, верхний уходит на слой «над героем»,
// чтобы персонаж проходил перед ней, а не сквозь неё.
map.set(4, 1, Z.UPPER, B.shelfTop);
map.set(4, 2, Z.LOWER2, B.shelfBottom);

// Окна и картина на грани стены — стена не должна быть голой.
map.set(6, 1, Z.LOWER2, B.window);
map.set(9, 1, Z.LOWER2, B.painting);

// Растение в углу — заполняет мёртвую зону, куда игрок всё равно не ходит.
map.set(13, 8, Z.LOWER2, B.plant);

/* ── 4. Тени и регионы ───────────────────────────────────────────────────── */

map.castWallShadows();

// Регион 1 — зона, где могут стоять NPC; регион 5 — «нельзя ставить мебель».
for (let x = FLOOR.x; x < FLOOR.x + FLOOR.w; x++) map.setRegion(x, FLOOR.y + FLOOR.h - 1, 1);

/* ── 5. Интерактивные объекты ────────────────────────────────────────────── */

map.addEvent(candle(5, 3, "Свеча слева"));
map.addEvent(candle(11, 3, "Свеча у очага"));
map.addEvent(chest(12, 7, "Сундук", { itemId: 1, amount: 1 }));
map.addEvent(door(7, 1, "Дверь наружу", { toMapId: 2, toX: 8, toY: 3 }));
map.addEvent(bookshelf(4, 2, "Полка"));

/**
 * СВЕЧА: одно событие, две страницы.
 *  стр.1 — погашена (условий нет): «зажечь?» → self switch A вкл
 *  стр.2 — горит (условие: self switch A): «потушить?» → self switch A выкл
 * Картинка страницы — тайл из листа B, поэтому свеча выглядит как часть
 * обстановки, а не как персонаж. priority 0 — герой проходит перед ней.
 */
function candle(x, y, name) {
  const off = Ev.page({
    image: Ev.tileImage(B.candleOff),
    trigger: 0, // кнопка действия
    priority: 0, // под героем: свеча стоит на столе/полке
    walkAnime: false, directionFix: true,
    list: [
      ...Cmd.text(["Свеча погасла. Зажечь её?"]),
      ...Cmd.choices(["Зажечь", "Оставить"], { cancelType: 1 }),
      ...Cmd.when(0, "Зажечь"),
      ...indent([
        ...Cmd.playSE("Fire"),
        ...Cmd.selfSwitch("A", true),
      ]),
      ...Cmd.when(1, "Оставить"),
      ...indent([]),
      ...Cmd.endBranch(),
    ],
  });

  const on = Ev.page({
    conditions: { selfSwitch: "A" },
    image: Ev.tileImage(B.candleOn),
    trigger: 0,
    priority: 0,
    walkAnime: false, directionFix: true,
    stepAnime: true, // если картинка анимирована спрайтом — оживёт огонёк
    list: [
      ...Cmd.text(["Пламя ровно горит."]),
      ...Cmd.choices(["Потушить", "Оставить"], { cancelType: 1 }),
      ...Cmd.when(0, "Потушить"),
      ...indent([
        ...Cmd.playSE("Wind7"),
        ...Cmd.selfSwitch("A", false),
      ]),
      ...Cmd.when(1, "Оставить"),
      ...indent([]),
      ...Cmd.endBranch(),
    ],
  });

  return Ev.event({ name, x, y, pages: [off, on] });
}

/** СУНДУК: открылся один раз и остался открытым (self switch A). */
function chest(x, y, name, { itemId, amount }) {
  const closed = Ev.page({
    image: Ev.tileImage(B.chestClosed),
    trigger: 0,
    priority: 1, // вровень с героем: сундук загораживает проход
    directionFix: true, walkAnime: false,
    list: [
      ...Cmd.playSE("Chest"),
      ...Cmd.changeItems(itemId, amount),
      ...Cmd.text([`\\}Найдено: \\i[${itemId}] ×${amount}\\{`]),
      ...Cmd.selfSwitch("A", true),
    ],
  });
  const opened = Ev.page({
    conditions: { selfSwitch: "A" },
    image: Ev.tileImage(B.chestOpen),
    trigger: 0,
    priority: 1,
    directionFix: true, walkAnime: false,
    list: [...Cmd.text(["Пусто."])],
  });
  return Ev.event({ name, x, y, pages: [closed, opened] });
}

/** ДВЕРЬ: касание игроком + звук + перенос. */
function door(x, y, name, { toMapId, toX, toY }) {
  return Ev.event({
    name, x, y,
    pages: [
      Ev.page({
        image: Ev.tileImage(B.doorBottom),
        trigger: 1, // касание игроком
        priority: 1,
        directionFix: true, walkAnime: false,
        list: [
          ...Cmd.playSE("Open1"),
          ...Cmd.wait(20),
          ...Cmd.transfer(toMapId, toX, toY, 2, 0),
        ],
      }),
    ],
  });
}

/** ПОЛКА: чистый «осмотреть» — самый дешёвый способ добавить миру плотности. */
function bookshelf(x, y, name) {
  return Ev.event({
    name, x, y,
    pages: [
      Ev.page({
        image: Ev.tileImage(0), // картинки нет: тайл уже нарисован на карте
        trigger: 0,
        priority: 1,
        directionFix: true, walkAnime: false,
        list: [...Cmd.text([
          "Потрёпанные книги о торговых путях.",
          "Между страниц кто-то оставил засушенный цветок.",
        ])],
      }),
    ],
  });
}

/** Сдвиг блока команд на уровень вправо (тело ветки «Когда …»). */
function indent(cmds) {
  return cmds.map((c) => ({ ...c, indent: c.indent + 1 }));
}

/* ── 6. Проверка и сохранение ────────────────────────────────────────────── */

console.log(map.toAscii());
console.log("\nСводка:", JSON.stringify(map.stats(), null, 2));

// Замечание «декор на стене сделал её проходимой» — нормальная реакция на то,
// что у настенных тайлов (окно, картина) в тайлсете не выставлен ★.
// В проекте это чинится в базе данных, а не в коде карты.
const issues = map.validate();
if (issues.length) {
  console.log("\nЗамечания:");
  for (const i of issues) console.log(`  ${i.level === "error" ? "ОШИБКА" : "предупр"}  ${i.msg}`);
} else {
  console.log("\nПроверки пройдены.");
}

if (WRITE) {
  const id = MAP_ID || project.nextMapId();
  project.writeJson(project.mapFileName(id), map.toJSON());
  project.registerMap(id, "Таверна", { parentId: 0 });
  console.log(`\nЗаписано: data/${project.mapFileName(id)} (и запись в MapInfos.json)`);
  console.log("Открой проект в редакторе — карта появится в дереве.");
} else {
  console.log(`\nСухой прогон. Добавь --write, чтобы записать карту в проект (${path.resolve(projectDir)}).`);
}
