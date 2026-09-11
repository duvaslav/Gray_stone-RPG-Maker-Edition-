"use strict";
// Reads the extracted design workbook (spec/*.json) as row objects.
// The workbook is a build-time source only; nothing at runtime touches it.
const fs = require("fs");
const path = require("path");

const SPEC_DIR = path.join(__dirname, "..", "..", "spec");

function rows(sheet) {
  const file = path.join(SPEC_DIR, sheet + ".json");
  if (!fs.existsSync(file)) throw new Error(`spec sheet missing: ${sheet}`);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

// Returns the sheet as objects keyed by its header row.
function table(sheet) {
  const raw = rows(sheet);
  if (!raw.length) return [];
  const head = raw[0];
  return raw.slice(1).map((r) => {
    const o = {};
    head.forEach((h, i) => { o[h] = r[i] === undefined ? "" : r[i]; });
    return o;
  });
}

// The workbook stores every number as a float string ("5.0", "0012").
// num() recovers the integer; id4() recovers a zero-padded registry id.
function num(v, fallback = 0) {
  if (v === undefined || v === null || v === "") return fallback;
  const n = Number(String(v).trim());
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

function id4(v) {
  return String(v).trim().replace(/\.0$/, "").padStart(4, "0");
}

module.exports = { rows, table, num, id4, SPEC_DIR };
