#!/usr/bin/env node
"use strict";
// Tile picker: renders a tileset sheet as a labelled contact sheet so a slot can
// be confirmed by looking rather than by guessing.
//
//   node tools/pick_tiles.js                 # every sheet Gray Stone uses
//   node tools/pick_tiles.js Outside_B       # one sheet
//
// Output: tools/out/tiles-<sheet>.html  -- open it in a browser.
//
// Each cell shows its column,row and its numeric tile id, and is bordered by the
// passability the project will actually read from data/Tilesets.json:
//   red   = solid        blue = drawn above the player (star)
//   grey  = passable     yellow ring = a Gray Stone binding points here
//
// No dependencies: the PNG is embedded as a data URI and sliced with CSS.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "tools", "out");
const TILE = 48, ZOOM = 2;

const SHEET_BASE = { B: 0, C: 256, D: 512, E: 768 };

function tileId(sheetLetter, col, row) {
  if (sheetLetter === "A5") return 1536 + row * 8 + col;
  return SHEET_BASE[sheetLetter] + (col >= 8 ? 128 : 0) + row * 8 + (col % 8);
}

function loadTilesets() {
  const f = path.join(ROOT, "data", "Tilesets.json");
  if (!fs.existsSync(f)) return null;
  return JSON.parse(fs.readFileSync(f, "utf8"));
}

// Which binding, if any, currently points at a given (set, sheet, col, row).
function bindingIndex() {
  const b = JSON.parse(fs.readFileSync(path.join(ROOT, "tools", "data", "tile-bindings.json"), "utf8"));
  const byTile = {};       // "<sheetLetter>:<col>,<row>" -> [names]
  const byKind = {};       // kind -> [names]
  for (const [setName, set] of Object.entries(b)) {
    if (setName.startsWith("_")) continue;
    for (const [key, t] of Object.entries(set.tiles || {})) {
      const k = `${t.sheet}:${t.col},${t.row}`;
      (byTile[k] = byTile[k] || []).push({ set: setName, key, verify: t.verify, note: t.note });
    }
    for (const [key, a] of Object.entries(set.autotiles || {})) {
      (byKind[a.kind] = byKind[a.kind] || []).push({ set: setName, key, verify: a.verify, note: a.note });
    }
  }
  return { byTile, byKind };
}

function flagClass(f) {
  if (f === undefined) return "unknown";
  if (f & 0x10) return "star";
  if ((f & 0x0f) === 0x0f) return "solid";
  if (f & 0x0f) return "partial";
  return "open";
}

function pngDataUri(file) {
  return "data:image/png;base64," + fs.readFileSync(file).toString("base64");
}

function sheetLetterOf(name) {
  const m = name.match(/_(A[1-5]|B|C|D|E)$/);
  return m ? m[1] : null;
}

function renderNormalSheet(sheetName, letter, pngFile, flags, bindings) {
  const uri = pngDataUri(pngFile);
  const cols = letter === "A5" ? 8 : 16;
  const rows = 16;
  const sheetW = cols * TILE;
  let cells = "";
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const id = tileId(letter, col, row);
      const f = flags ? flags[id] : undefined;
      const cls = flagClass(f);
      const key = `${letter}:${col},${row}`;
      const bound = bindings.byTile[key] || [];
      const boundCls = bound.length ? " bound" : "";
      const label = bound.length ? bound.map((x) => `${x.set}.${x.key}`).join("<br>") : "";
      cells += `<div class="cell ${cls}${boundCls}" title="col ${col}, row ${row} — tile id ${id} — ${cls}">
        <div class="img" style="background-image:url(${uri});background-position:${-col * TILE * ZOOM}px ${-row * TILE * ZOOM}px;background-size:${sheetW * ZOOM}px auto"></div>
        <div class="tag">${col},${row}<span class="id">#${id}</span></div>
        ${label ? `<div class="bind">${label}</div>` : ""}
      </div>`;
    }
  }
  return { cells, cols };
}

// A-sheet autotiles are families ("kinds"), not single cells: A2/A4-top use a
// 2x3 block, A3 and A4-side a 2x2. Showing the block's top-left corner is enough
// to recognise the family, which is what a binding selects.
function renderAutotileSheet(sheetName, letter, pngFile, flags, bindings) {
  const uri = pngDataUri(pngFile);
  const base = { A1: 0, A2: 16, A3: 48, A4: 80 }[letter];
  const blockW = 2 * TILE;
  const blockH = letter === "A1" || letter === "A2" ? 3 * TILE : 2 * TILE;
  const kindsPerRow = 8;
  const rowsOfKinds = letter === "A4" ? 6 : 4;
  const sheetW = 16 * TILE;
  let cells = "";
  for (let r = 0; r < rowsOfKinds; r++) {
    for (let c = 0; c < kindsPerRow; c++) {
      const kind = base + r * 8 + c;
      const id = 2048 + kind * 48;
      const f = flags ? flags[id] : undefined;
      const cls = flagClass(f);
      const bound = bindings.byKind[kind] || [];
      const label = bound.length ? bound.map((x) => `${x.set}.${x.key}`).join("<br>") : "";
      const px = c * blockW, py = r * blockH;
      let role = "";
      if (letter === "A3") role = r % 2 === 0 ? "roof" : "wall";
      if (letter === "A4") role = r % 2 === 0 ? "wall top" : "wall face";
      cells += `<div class="cell ${cls}${bound.length ? " bound" : ""}" title="kind ${kind} — first tile id ${id} — ${cls}">
        <div class="img big" style="background-image:url(${uri});background-position:${-px * ZOOM}px ${-py * ZOOM}px;background-size:${sheetW * ZOOM}px auto;height:${blockH * ZOOM}px"></div>
        <div class="tag">kind ${kind}${role ? ` <span class="id">${role}</span>` : ""}<span class="id">#${id}</span></div>
        ${label ? `<div class="bind">${label}</div>` : ""}
      </div>`;
    }
  }
  return { cells, cols: kindsPerRow };
}

function page(sheetName, body, cols) {
  return `<!doctype html><meta charset="utf-8"><title>${sheetName}</title>
<style>
 body{background:#16181d;color:#d7d3c8;font:13px/1.4 system-ui,sans-serif;margin:0;padding:20px}
 h1{font-size:18px;margin:0 0 4px;color:#c9a227}
 p{margin:0 0 16px;color:#8d8a82}
 .grid{display:grid;grid-template-columns:repeat(${cols},max-content);gap:6px}
 .cell{background:#1e2128;border:2px solid #333;border-radius:4px;padding:3px;position:relative}
 .cell .img{width:${TILE * ZOOM}px;height:${TILE * ZOOM}px;background-repeat:no-repeat;image-rendering:pixelated;
   background-color:#0d0f13}
 .cell.solid{border-color:#c1443b}
 .cell.star{border-color:#3f7fc1}
 .cell.partial{border-color:#c98a2b}
 .cell.open{border-color:#3a3f49}
 .cell.bound{outline:2px solid #c9a227;outline-offset:1px}
 .tag{font-size:10px;color:#9b978d;margin-top:2px;white-space:nowrap}
 .tag .id{color:#5f6470;margin-left:5px}
 .bind{font-size:10px;color:#c9a227;max-width:${TILE * ZOOM}px;word-break:break-word;margin-top:1px}
 .legend{margin:0 0 16px;color:#8d8a82}
 .legend b{display:inline-block;width:12px;height:12px;border:2px solid;vertical-align:-2px;margin:0 4px 0 12px;border-radius:2px}
</style>
<h1>${sheetName}</h1>
<p>Border shows the passability the project will actually read. Gold outline = a Gray Stone binding points here.</p>
<div class="legend">
 <b style="border-color:#c1443b"></b>solid
 <b style="border-color:#3f7fc1"></b>above player (★)
 <b style="border-color:#c98a2b"></b>partly blocked
 <b style="border-color:#3a3f49"></b>passable
</div>
<div class="grid">${body}</div>`;
}

function main() {
  const imgDir = path.join(ROOT, "img", "tilesets");
  if (!fs.existsSync(imgDir)) {
    console.error("img/tilesets not found. Run tools/hydrate_assets.sh first.");
    return 1;
  }
  const tilesets = loadTilesets();
  const bindings = bindingIndex();

  // Flags per sheet name: find a tileset that declares this sheet.
  const flagsForSheet = (sheetName) => {
    if (!tilesets) return null;
    for (const t of tilesets) {
      if (t && (t.tilesetNames || []).includes(sheetName)) return t.flags;
    }
    return null;
  };

  const wanted = process.argv.slice(2);
  const want = wanted.length ? wanted : [
    "Outside_A3", "Outside_A4", "Outside_A2", "Outside_B", "Outside_C",
    "Inside_A2", "Inside_A4", "Inside_B", "Inside_C",
  ];

  fs.mkdirSync(OUT, { recursive: true });
  let made = 0;
  for (const sheetName of want) {
    const png = path.join(imgDir, sheetName + ".png");
    if (!fs.existsSync(png)) { console.log(`  skip ${sheetName} (no PNG)`); continue; }
    const letter = sheetLetterOf(sheetName);
    if (!letter) { console.log(`  skip ${sheetName} (unrecognised sheet suffix)`); continue; }
    const flags = flagsForSheet(sheetName);
    const isAuto = /^A[1-4]$/.test(letter);
    const { cells, cols } = isAuto
      ? renderAutotileSheet(sheetName, letter, png, flags, bindings)
      : renderNormalSheet(sheetName, letter, png, flags, bindings);
    const file = path.join(OUT, `tiles-${sheetName}.html`);
    fs.writeFileSync(file, page(sheetName, cells, cols));
    console.log(`  ${path.relative(ROOT, file)}`);
    made++;
  }
  if (!made) { console.error("nothing rendered"); return 1; }
  console.log(`\n${made} contact sheet(s) written. Open them and read off col,row for each object.`);
  console.log("Then correct tools/data/tile-bindings.json and run: node tools/build/index.js");
  return 0;
}

if (require.main === module) process.exit(main());
