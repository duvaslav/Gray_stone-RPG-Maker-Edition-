#!/usr/bin/env node
"use strict";
// Confirms every asset the project REFERENCES actually exists on disk.
//   node tools/verify_assets.js
//
// Until tools/hydrate_assets.sh has been run this reports everything as
// missing, which is correct and is exactly why the asset bindings carry a
// "verify" field. Once assets are present, anything still listed here is a
// binding that needs correcting -- in the bindings file, never in a map.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DATA = path.join(ROOT, "data");
const read = (n) => JSON.parse(fs.readFileSync(path.join(DATA, n), "utf8"));

const AUDIO_EXT = [".ogg", ".m4a", ".wav"];
const refs = { bgm: new Set(), bgs: new Set(), me: new Set(), se: new Set(), characters: new Set(), faces: new Set(), tilesets: new Set() };

function walk(obj, cb) {
  if (Array.isArray(obj)) { obj.forEach((v) => walk(v, cb)); return; }
  if (!obj || typeof obj !== "object") return;
  cb(obj);
  for (const v of Object.values(obj)) walk(v, cb);
}

function collect() {
  const mapInfos = read("MapInfos.json");
  const files = ["CommonEvents.json", "Actors.json", "System.json"];
  for (let i = 1; i < mapInfos.length; i++) if (mapInfos[i]) files.push(`Map${String(i).padStart(3, "0")}.json`);

  for (const f of files) {
    const data = read(f);
    walk(data, (o) => {
      if (Array.isArray(o.list)) {
        for (const c of o.list) {
          if (!c || !Array.isArray(c.parameters)) continue;
          const a = c.parameters[0];
          if (c.code === 241 && a && a.name) refs.bgm.add(a.name);
          if (c.code === 245 && a && a.name) refs.bgs.add(a.name);
          if (c.code === 249 && a && a.name) refs.me.add(a.name);
          if (c.code === 250 && a && a.name) refs.se.add(a.name);
          if (c.code === 101 && a) refs.faces.add(a);
          // SE embedded in a movement route step
          if (c.code === 205 && c.parameters[1] && Array.isArray(c.parameters[1].list)) {
            for (const st of c.parameters[1].list) {
              if (st.code === 44 && st.parameters[0] && st.parameters[0].name) refs.se.add(st.parameters[0].name);
            }
          }
        }
      }
      if (o.characterName) refs.characters.add(o.characterName);
      if (o.faceName) refs.faces.add(o.faceName);
    });
  }

  for (const ts of read("Tilesets.json")) {
    if (!ts) continue;
    for (const n of ts.tilesetNames) if (n) refs.tilesets.add(n);
  }
  refs.faces.delete("");
  refs.characters.delete("");
}

function existsImage(dir, name) {
  return fs.existsSync(path.join(ROOT, "img", dir, name + ".png"));
}
function existsAudio(dir, name) {
  return AUDIO_EXT.some((e) => fs.existsSync(path.join(ROOT, "audio", dir, name + e)));
}

function main() {
  collect();
  const groups = [
    ["audio/bgm", [...refs.bgm], (n) => existsAudio("bgm", n)],
    ["audio/bgs", [...refs.bgs], (n) => existsAudio("bgs", n)],
    ["audio/me", [...refs.me], (n) => existsAudio("me", n)],
    ["audio/se", [...refs.se], (n) => existsAudio("se", n)],
    ["img/characters", [...refs.characters], (n) => existsImage("characters", n.replace(/^!/, "!"))],
    ["img/faces", [...refs.faces], (n) => existsImage("faces", n)],
    ["img/tilesets", [...refs.tilesets], (n) => existsImage("tilesets", n)],
  ];

  let total = 0, missing = 0;
  console.log("Gray Stone asset verification");
  console.log("=".repeat(64));
  for (const [label, names, test] of groups) {
    if (!names.length) continue;
    const bad = names.filter((n) => !test(n)).sort();
    total += names.length;
    missing += bad.length;
    const status = bad.length ? `${names.length - bad.length}/${names.length}` : `${names.length}/${names.length} ok`;
    console.log(`\n${label}  ${status}`);
    for (const n of bad) console.log(`   missing: ${n}`);
  }
  console.log("\n" + "=".repeat(64));
  if (!fs.existsSync(path.join(ROOT, "img"))) {
    console.log(`${total} asset reference(s); img/ and audio/ are not present.`);
    console.log("Assets are not in this repository by licence. Run:");
    console.log("  tools/hydrate_assets.sh /path/to/RPGMZ/NewData");
    return 0;   // not a failure before hydration
  }
  console.log(`${total - missing} of ${total} referenced assets present, ${missing} missing.`);
  if (missing) {
    console.log("Correct a missing name in the bindings file it comes from:");
    console.log("  tools/data/audio-bindings.json   audio slots");
    console.log("  tools/data/face-bindings.json    speaker portraits");
    console.log("  tools/data/tile-bindings.json    tile slots");
    console.log("then rerun 'node tools/build/index.js'. Never edit a generated map by hand.");
  }
  return missing ? 1 : 0;
}

if (require.main === module) process.exit(main());
