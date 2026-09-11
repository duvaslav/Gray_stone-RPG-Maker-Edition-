"use strict";
// Generates tools/data/face-bindings.json from the workbook NPC registries.
//
// The binding layer exists so that speaker_id + emotion_id -- never a filename
// -- is what a dialogue line refers to. When the real portraits arrive, only
// this file changes and every Show Text keeps working. speaker_id is permanent.
const fs = require("fs");
const path = require("path");
const { table, num } = require("../lib/spec");

// The shared emotional vocabulary. A character only declares the ones their
// scenes actually call for; nobody is padded out to all eight.
const EMOTIONS = ["neutral", "serious", "concerned", "suspicious", "irritated", "sad", "frightened", "relieved"];

// Which emotions each speaker actually needs, read from their role in the story
// rather than assigned mechanically.
const EMOTION_SETS = {
  leonard:    ["neutral", "serious", "concerned", "suspicious", "sad", "relieved"],
  roland:     ["neutral", "serious", "concerned"],
  marlena:    ["neutral", "serious", "concerned", "irritated"],
  bartolomeo: ["neutral", "irritated", "serious"],
  iona:       ["neutral", "concerned", "serious"],
  sybilla:    ["neutral", "serious", "concerned", "sad"],
  edrian:     ["neutral", "serious", "concerned"],
  caleb:      ["neutral", "frightened", "concerned"],
  linda:      ["neutral", "serious", "suspicious", "irritated", "frightened"],
  celeste:    ["neutral", "concerned", "suspicious", "frightened"],
  vera:       ["neutral", "serious", "irritated", "suspicious", "frightened"],
  beatrice:   ["neutral", "concerned", "suspicious", "sad", "frightened"],
  nika:       ["neutral", "frightened", "sad", "suspicious"],
  agnes:      ["neutral", "serious", "concerned", "suspicious", "frightened"],
  evelyn:     ["neutral", "serious", "concerned", "relieved"],
};

function build() {
  const visuals = table("17_NPC_Visuals");
  const registry = table("16_NPC_Registry");
  const names = {};
  for (const r of registry) names[r.npc_id] = r["имя"];

  const speakers = {};
  for (const v of visuals) {
    const id = v.npc_id;
    if (!id) continue;
    const faceFile = (v.face_file || "People1").trim();
    const emotions = EMOTION_SETS[id] || ["neutral", "serious"];
    // PLACEHOLDER STAGE: every emotion resolves to the one stock face this
    // character uses. The indices are deliberately identical -- a placeholder
    // that pretends to have eight distinct expressions would be a lie the
    // dialogue writer would design against.
    const faceIndex = num(v.face_index, 0);
    const map = {};
    for (const e of emotions) map[e] = { faceName: faceFile, faceIndex, placeholder: true };
    speakers[id] = {
      display_name: names[id] || v["имя"] || id,
      character_file: (v.character_file || "People1").trim(),
      face_file: faceFile,
      emotions: map,
    };
  }

  return {
    _doc: [
      "speaker_id + emotion_id -> faceName + faceIndex.",
      "",
      "Dialogue NEVER names a face file. It names a speaker and an emotion, and",
      "this file resolves them. When the real portraits are drawn, edit only this",
      "file and rebuild: no Show Text command changes, and speaker_id never changes.",
      "",
      "A standard MZ faceset is 576x288 = 4 columns x 2 rows = 8 faces of 144x144,",
      "so faceIndex is 0..7.",
      "",
      "Every entry below is placeholder:true -- all emotions of a speaker currently",
      "resolve to the same stock face. Replacing them is the portrait task; the",
      "emotion vocabulary is already correct and should not be re-derived.",
    ],
    emotion_vocabulary: EMOTIONS,
    speakers,
  };
}

if (require.main === module) {
  const out = path.join(__dirname, "..", "data", "face-bindings.json");
  const data = build();
  fs.writeFileSync(out, JSON.stringify(data, null, 2));
  const n = Object.keys(data.speakers).length;
  const e = Object.values(data.speakers).reduce((a, s) => a + Object.keys(s.emotions).length, 0);
  console.log(`face bindings: ${n} speakers, ${e} speaker/emotion pairs -> tools/data/face-bindings.json`);
}

module.exports = { build, EMOTIONS, EMOTION_SETS };
