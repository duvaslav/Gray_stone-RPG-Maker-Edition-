"use strict";
/**
 * preview.js — рендер карты в самодостаточный HTML-файл.
 *
 * Повторяет Tilemap._addSpot / _addAutotile / _addNormalTile из корескрипта,
 * поэтому картинка совпадает с тем, что покажет игра. Нужен, чтобы смотреть
 * на карту глазами, а не на массив чисел.
 *
 * Оверлеи в готовой странице: сетка, проходимость, регионы, события, тени.
 *
 * Ограничения (сознательные, чтобы не тащить зависимости):
 *  - анимация воды/водопадов рисуется кадром 0;
 *  - «столы» (флаг counter на A2) рисуются без свисающей кромки.
 */

const fs = require("fs");
const path = require("path");
const {
  FLOOR_AUTOTILE_TABLE, WALL_AUTOTILE_TABLE, WATERFALL_AUTOTILE_TABLE,
} = require("./rpgmap");

const SHEET_KEYS = ["A1", "A2", "A3", "A4", "A5", "B", "C", "D", "E"];

function findSheetFile(projectRoot, name) {
  if (!name) return null;
  const p = path.join(projectRoot, "img", "tilesets", name + ".png");
  return fs.existsSync(p) ? p : null;
}

/**
 * @param {RMMap} map карта (с привязанным project)
 * @param {Project} project
 * @param {object} opts {embed:boolean, out:string}
 * @returns {string} путь к записанному html
 */
function renderHtml(map, project, opts = {}) {
  const out = path.resolve(opts.out || `map-preview-${map.id ?? "x"}.html`);
  const embed = opts.embed !== false;
  const tileset = project.tileset(map.tilesetId);
  const names = tileset.tilesetNames;

  const sheets = SHEET_KEYS.map((key, i) => {
    const file = findSheetFile(project.root, names[i]);
    if (!file) return { key, name: names[i] || "", src: null };
    let src;
    if (embed) {
      src = "data:image/png;base64," + fs.readFileSync(file).toString("base64");
    } else {
      src = path.relative(path.dirname(out), file).split(path.sep).join("/");
    }
    return { key, name: names[i], src };
  });

  const missing = sheets.filter((s) => s.name && !s.src).map((s) => `${s.key}: ${s.name}.png`);

  const payload = {
    width: map.width,
    height: map.height,
    data: map.data.data,
    events: map.data.events
      .filter(Boolean)
      .map((e) => ({ id: e.id, name: e.name, x: e.x, y: e.y, pages: e.pages.length })),
    flags: tileset.flags,
    tilesetName: tileset.name,
    displayName: map.data.displayName || "",
    mapId: map.id,
    sheets: sheets.map((s) => s.src),
    sheetNames: sheets.map((s) => s.name),
    tables: {
      floor: FLOOR_AUTOTILE_TABLE,
      wall: WALL_AUTOTILE_TABLE,
      waterfall: WATERFALL_AUTOTILE_TABLE,
    },
  };

  fs.writeFileSync(out, HTML(payload), "utf8");
  return { file: out, missing };
}

const HTML = (payload) => `<!doctype html>
<html lang="ru"><head><meta charset="utf-8">
<title>Карта ${payload.mapId ?? ""} ${payload.displayName}</title>
<style>
  :root { color-scheme: dark; }
  body { margin:0; background:#15171c; color:#dfe3ea;
         font:13px/1.5 ui-sans-serif,system-ui,"Segoe UI",Roboto,sans-serif; }
  header { position:sticky; top:0; z-index:2; display:flex; gap:14px; align-items:center;
           flex-wrap:wrap; padding:10px 14px; background:#1d2027; border-bottom:1px solid #2c313b; }
  h1 { font-size:14px; margin:0 10px 0 0; font-weight:600; }
  label { display:inline-flex; gap:5px; align-items:center; cursor:pointer; user-select:none; }
  .meta { color:#8b93a3; }
  #wrap { padding:16px; overflow:auto; }
  canvas { image-rendering:pixelated; box-shadow:0 0 0 1px #2c313b; display:block; }
  #tip { position:fixed; pointer-events:none; background:#0e1015ee; border:1px solid #333a46;
         padding:6px 8px; border-radius:6px; font-size:12px; white-space:pre; display:none; z-index:5; }
  .warn { color:#ffb454; }
</style></head><body>
<header>
  <h1>Карта ${payload.mapId ?? ""}${payload.displayName ? " — " + payload.displayName : ""}</h1>
  <span class="meta">${payload.width}×${payload.height} · тайлсет «${payload.tilesetName}» · событий: ${payload.events.length}</span>
  <label><input type="checkbox" id="grid"> сетка</label>
  <label><input type="checkbox" id="pass"> проходимость</label>
  <label><input type="checkbox" id="region"> регионы</label>
  <label><input type="checkbox" id="events" checked> события</label>
  <label><input type="checkbox" id="shadow" checked> тени</label>
  <label>масштаб <input type="range" id="zoom" min="25" max="200" value="100" step="25"></label>
</header>
<div id="wrap"><canvas id="cv"></canvas></div>
<div id="tip"></div>
<script>
const M = ${JSON.stringify(payload)};
const TS = 48, Q = TS / 2;

/* ---- та же арифметика, что в Tilemap ---- */
const A1=2048, A2=2816, A3=4352, A4=5888, A5=1536, MAXID=8192;
const kindOf = id => Math.floor((id - A1) / 48);
const shapeOf = id => (id - A1) % 48;
const isAuto = id => id >= A1;
const isA1 = id => id >= A1 && id < A2;
const isA2 = id => id >= A2 && id < A3;
const isA3 = id => id >= A3 && id < A4;
const isA4 = id => id >= A4 && id < MAXID;
const isA5 = id => id >= A5 && id < A1;
const isWaterfall = id => (id >= A1+192 && id < A2) ? kindOf(id) % 2 === 1 : false;
const isShadowing = id => isA3(id) || isA4(id);
const isVisible = id => id > 0 && id < MAXID;
const isHigher = id => (M.flags[id] || 0) & 0x10;

const imgs = [];
let loaded = 0, needed = 0;
M.sheets.forEach((src, i) => {
  if (!src) { imgs[i] = null; return; }
  needed++;
  const im = new Image();
  im.onload = () => { if (++loaded === needed) draw(); };
  im.onerror = () => { if (++loaded === needed) draw(); };
  im.src = src;
  imgs[i] = im;
});
if (!needed) setTimeout(draw, 0);

const cv = document.getElementById('cv'), ctx = cv.getContext('2d');
const readData = (x, y, z) =>
  (x < 0 || y < 0 || x >= M.width || y >= M.height) ? 0
  : (M.data[(z * M.height + y) * M.width + x] || 0);

function drawNormalTile(id, dx, dy) {
  const set = isA5(id) ? 4 : 5 + Math.floor(id / 256);
  const im = imgs[set];
  if (!im || !im.width) return;
  const sx = ((Math.floor(id / 128) % 2) * 8 + (id % 8)) * TS;
  const sy = (Math.floor((id % 256) / 8) % 16) * TS;
  ctx.drawImage(im, sx, sy, TS, TS, dx, dy, TS, TS);
}

function drawAutotile(id, dx, dy) {
  const kind = kindOf(id), shape = shapeOf(id);
  const tx = kind % 8, ty = Math.floor(kind / 8);
  let set = 0, bx = 0, by = 0, table = M.tables.floor;
  if (isA1(id)) {
    set = 0;
    if (kind === 0) { bx = 0; by = 0; }
    else if (kind === 1) { bx = 0; by = 3; }
    else if (kind === 2) { bx = 6; by = 0; }
    else if (kind === 3) { bx = 6; by = 3; }
    else {
      bx = Math.floor(tx / 4) * 8;
      by = ty * 6 + (Math.floor(tx / 2) % 2) * 3;
      if (kind % 2 !== 0) { bx += 6; table = M.tables.waterfall; }
    }
  } else if (isA2(id)) {
    set = 1; bx = tx * 2; by = (ty - 2) * 3;
  } else if (isA3(id)) {
    set = 2; bx = tx * 2; by = (ty - 6) * 2; table = M.tables.wall;
  } else if (isA4(id)) {
    set = 3; bx = tx * 2;
    by = Math.floor((ty - 10) * 2.5 + (ty % 2 === 1 ? 0.5 : 0));
    if (ty % 2 === 1) table = M.tables.wall;
  }
  const im = imgs[set];
  if (!im || !im.width) return;
  const entry = table[shape] || table[0];
  for (let i = 0; i < 4; i++) {
    const sx = (bx * 2 + entry[i][0]) * Q;
    const sy = (by * 2 + entry[i][1]) * Q;
    ctx.drawImage(im, sx, sy, Q, Q, dx + (i % 2) * Q, dy + Math.floor(i / 2) * Q, Q, Q);
  }
}

const drawTile = (id, dx, dy) => {
  if (!isVisible(id)) return;
  isAuto(id) ? drawAutotile(id, dx, dy) : drawNormalTile(id, dx, dy);
};

function passable(x, y) {
  for (const z of [3, 2, 1, 0]) {
    const id = readData(x, y, z);
    if (id === 0) continue;
    const f = M.flags[id] || 0;
    if (f & 0x10) continue;
    if ((f & 0x0f) === 0) return true;
    if ((f & 0x0f) === 0x0f) return false;
  }
  return false;
}

function draw() {
  const zoom = document.getElementById('zoom').value / 100;
  cv.width = M.width * TS; cv.height = M.height * TS;
  cv.style.width = (cv.width * zoom) + 'px';
  cv.style.height = (cv.height * zoom) + 'px';
  ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, cv.width, cv.height);

  const showShadow = document.getElementById('shadow').checked;
  // нижний проход: слои 0-1, тени, затем всё, что не «над героем»
  for (let y = 0; y < M.height; y++)
    for (let x = 0; x < M.width; x++) {
      const dx = x * TS, dy = y * TS;
      drawTile(readData(x, y, 0), dx, dy);
      drawTile(readData(x, y, 1), dx, dy);
      if (showShadow) {
        const bits = readData(x, y, 4);
        if (bits & 0x0f) {
          ctx.fillStyle = 'rgba(0,0,0,0.5)';
          for (let i = 0; i < 4; i++)
            if (bits & (1 << i))
              ctx.fillRect(dx + (i % 2) * Q, dy + Math.floor(i / 2) * Q, Q, Q);
        }
      }
      drawTile(readData(x, y, 2), dx, dy);
      drawTile(readData(x, y, 3), dx, dy);
    }

  if (document.getElementById('pass').checked) {
    for (let y = 0; y < M.height; y++)
      for (let x = 0; x < M.width; x++) {
        ctx.fillStyle = passable(x, y) ? 'rgba(60,200,120,0.22)' : 'rgba(230,70,70,0.30)';
        ctx.fillRect(x * TS, y * TS, TS, TS);
      }
  }
  if (document.getElementById('region').checked) {
    ctx.font = 'bold 16px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let y = 0; y < M.height; y++)
      for (let x = 0; x < M.width; x++) {
        const r = readData(x, y, 5);
        if (!r) continue;
        ctx.fillStyle = 'hsla(' + (r * 47 % 360) + ',80%,55%,0.45)';
        ctx.fillRect(x * TS, y * TS, TS, TS);
        ctx.fillStyle = '#fff';
        ctx.fillText(r, x * TS + Q, y * TS + Q);
      }
  }
  if (document.getElementById('grid').checked) {
    ctx.strokeStyle = 'rgba(255,255,255,0.13)'; ctx.lineWidth = 1;
    for (let x = 0; x <= M.width; x++) { ctx.beginPath(); ctx.moveTo(x*TS+.5,0); ctx.lineTo(x*TS+.5,cv.height); ctx.stroke(); }
    for (let y = 0; y <= M.height; y++) { ctx.beginPath(); ctx.moveTo(0,y*TS+.5); ctx.lineTo(cv.width,y*TS+.5); ctx.stroke(); }
  }
  if (document.getElementById('events').checked) {
    ctx.lineWidth = 2; ctx.strokeStyle = '#ffd166'; ctx.fillStyle = 'rgba(255,209,102,0.18)';
    for (const e of M.events) {
      ctx.fillRect(e.x * TS, e.y * TS, TS, TS);
      ctx.strokeRect(e.x * TS + 1, e.y * TS + 1, TS - 2, TS - 2);
    }
  }
}

for (const id of ['grid','pass','region','events','shadow','zoom'])
  document.getElementById(id).addEventListener('input', draw);

const tip = document.getElementById('tip');
cv.addEventListener('mousemove', ev => {
  const r = cv.getBoundingClientRect();
  const x = Math.floor((ev.clientX - r.left) / r.width * M.width);
  const y = Math.floor((ev.clientY - r.top) / r.height * M.height);
  if (x < 0 || y < 0 || x >= M.width || y >= M.height) { tip.style.display = 'none'; return; }
  const layers = [0,1,2,3].map(z => 'z' + z + ': ' + readData(x,y,z)).join('  ');
  const evs = M.events.filter(e => e.x === x && e.y === y).map(e => '#' + e.id + ' ' + e.name);
  tip.textContent = '(' + x + ',' + y + ')\\n' + layers
    + '\\nтень: ' + readData(x,y,4) + '  регион: ' + readData(x,y,5)
    + '\\nпроходима: ' + (passable(x,y) ? 'да' : 'нет')
    + (evs.length ? '\\nсобытия: ' + evs.join(', ') : '');
  tip.style.display = 'block';
  tip.style.left = (ev.clientX + 14) + 'px';
  tip.style.top = (ev.clientY + 14) + 'px';
});
cv.addEventListener('mouseleave', () => tip.style.display = 'none');
</script></body></html>`;

module.exports = { renderHtml };
