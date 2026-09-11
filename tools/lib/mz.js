"use strict";
// Typed builders for RPG Maker MZ event command objects.
//
// Every generator writes commands through here rather than hand-rolling
// {code, indent, parameters} literals, so parameter arity and the trailing
// {code:0} terminator are enforced in one place.

const C = {
  SHOW_TEXT: 101, TEXT_LINE: 401, SHOW_CHOICES: 102, WHEN: 402, WHEN_CANCEL: 403,
  END_CHOICES: 404, COMMENT: 108, COMMENT_LINE: 408,
  IF: 111, ELSE: 411, END_IF: 412, LOOP: 112, REPEAT_ABOVE: 413, BREAK_LOOP: 113,
  EXIT_EVENT: 115, COMMON_EVENT: 117, LABEL: 118, JUMP_TO_LABEL: 119,
  SWITCHES: 121, VARIABLES: 122, SELF_SWITCH: 123,
  SAVE_ACCESS: 134, MENU_ACCESS: 135, ENCOUNTER: 136, FORMATION_ACCESS: 137,
  TRANSFER: 201, SET_EVENT_LOCATION: 203, SCROLL_MAP: 204, MOVE_ROUTE: 205,
  ROUTE_STEP: 505, WAIT_FOR_MOVE: 210, TRANSPARENCY: 211, ANIMATION: 212,
  FADEOUT: 221, FADEIN: 222, TINT: 223, FLASH: 224, SHAKE: 225, WAIT: 230,
  SHOW_PICTURE: 231, ERASE_PICTURE: 235, WEATHER: 236,
  BGM: 241, FADEOUT_BGM: 242, SAVE_BGM: 243, REPLAY_BGM: 244,
  BGS: 245, FADEOUT_BGS: 246, ME: 249, SE: 250, STOP_SE: 251,
  CHANGE_ITEMS: 126, CHANGE_MAP_NAME_DISPLAY: 281, SCRIPT: 355, SCRIPT_LINE: 655,
  PLUGIN_COMMAND_MZ: 357, END: 0,
};

// Movement-route step codes (Game_Character.ROUTE_*)
const R = {
  END: 0, DOWN: 1, LEFT: 2, RIGHT: 3, UP: 4,
  LOWER_L: 5, LOWER_R: 6, UPPER_L: 7, UPPER_R: 8,
  RANDOM: 9, TOWARD: 10, AWAY: 11, FORWARD: 12, BACKWARD: 13, JUMP: 14,
  TURN_DOWN: 16, TURN_LEFT: 17, TURN_RIGHT: 18, TURN_UP: 19,
  TURN_90D_R: 20, TURN_90D_L: 21, TURN_180D: 22, TURN_90D_R_L: 23,
  TURN_RANDOM: 24, TURN_TOWARD: 25, TURN_AWAY: 26,
  SWITCH_ON: 27, SWITCH_OFF: 28,
  CHANGE_SPEED: 29, CHANGE_FREQ: 30,
  WALK_ANIME_ON: 31, WALK_ANIME_OFF: 32, STEP_ANIME_ON: 33, STEP_ANIME_OFF: 34,
  DIR_FIX_ON: 35, DIR_FIX_OFF: 36, THROUGH_ON: 37, THROUGH_OFF: 38,
  TRANSPARENT_ON: 39, TRANSPARENT_OFF: 40,
  CHANGE_IMAGE: 41, CHANGE_OPACITY: 42, CHANGE_BLEND_MODE: 43,
  PLAY_SE: 44, SCRIPT: 45, WAIT: 15,
};

const DIR = { DOWN: 2, LEFT: 4, RIGHT: 6, UP: 8, RETAIN: 0 };

const audio = (name, volume = 90, pitch = 100, pan = 0) => ({ name, volume, pitch, pan });

// --- command factory -------------------------------------------------------
class CmdList {
  constructor(indent = 0) { this.list = []; this._indent = indent; }
  get indent() { return this._indent; }

  push(code, parameters = [], indent = this._indent) {
    this.list.push({ code, indent, parameters });
    return this;
  }

  raw(cmd) { this.list.push(cmd); return this; }
  concat(other) {
    const src = other instanceof CmdList ? other.list : other;
    for (const c of src) this.list.push(c);
    return this;
  }

  comment(text) {
    const lines = String(text).split("\n");
    this.push(C.COMMENT, [lines[0]]);
    for (const l of lines.slice(1)) this.push(C.COMMENT_LINE, [l]);
    return this;
  }

  // Show Text. MZ code 101 params: [faceName, faceIndex, background, position, speakerName]
  text(lines, { faceName = "", faceIndex = 0, background = 0, position = 2, speaker = "" } = {}) {
    this.push(C.SHOW_TEXT, [faceName, faceIndex, background, position, speaker]);
    for (const l of [].concat(lines)) this.push(C.TEXT_LINE, [l]);
    return this;
  }

  switchOn(id) { return this.push(C.SWITCHES, [id, id, 0]); }
  switchOff(id) { return this.push(C.SWITCHES, [id, id, 1]); }
  switchRange(from, to, on) { return this.push(C.SWITCHES, [from, to, on ? 0 : 1]); }
  selfSwitch(ch, on) { return this.push(C.SELF_SWITCH, [ch, on ? 0 : 1]); }

  // Control Variables: [startId, endId, operation, operand, ...]
  // operation: 0 set 1 add 2 sub 3 mul 4 div 5 mod
  varSet(id, value) { return this.push(C.VARIABLES, [id, id, 0, 0, value]); }
  varAdd(id, value) { return this.push(C.VARIABLES, [id, id, 1, 0, value]); }
  varSub(id, value) { return this.push(C.VARIABLES, [id, id, 2, 0, value]); }
  varFromVar(id, srcId, op = 0) { return this.push(C.VARIABLES, [id, id, op, 1, srcId]); }
  varRandom(id, min, max) { return this.push(C.VARIABLES, [id, id, 0, 2, min, max]); }
  varScript(id, script, op = 0) { return this.push(C.VARIABLES, [id, id, op, 4, script]); }

  // Conditional Branch helpers. Each opens a block; close with endIf().
  ifSwitch(id, on = true) {
    this.push(C.IF, [0, id, on ? 0 : 1]); this._indent++; return this;
  }
  // op: 0 == 1 >= 2 <= 3 > 4 < 5 !=
  ifVar(id, value, op = 0) {
    this.push(C.IF, [1, id, 0, value, op]); this._indent++; return this;
  }
  ifVarVar(id, otherId, op = 0) {
    this.push(C.IF, [1, id, 1, otherId, op]); this._indent++; return this;
  }
  ifSelfSwitch(ch, on = true) {
    this.push(C.IF, [2, ch, on ? 0 : 1]); this._indent++; return this;
  }
  ifScript(script) { this.push(C.IF, [12, script]); this._indent++; return this; }
  else_() { this._indent--; this.push(C.ELSE, []); this._indent++; return this; }
  endIf() { this._indent--; this.push(C.END_IF, []); return this; }

  label(name) { return this.push(C.LABEL, [name]); }
  jumpTo(name) { return this.push(C.JUMP_TO_LABEL, [name]); }
  callCommon(id) { return this.push(C.COMMON_EVENT, [id]); }
  exitEvent() { return this.push(C.EXIT_EVENT, []); }

  wait(frames) { return this.push(C.WAIT, [frames]); }
  fadeout() { return this.push(C.FADEOUT, []); }
  fadein() { return this.push(C.FADEIN, []); }
  tint(tone, duration = 60, wait = true) { return this.push(C.TINT, [tone, duration, wait]); }
  weather(type, power, duration = 60, wait = false) {
    return this.push(C.WEATHER, [type, power, duration, wait]);
  }
  transparency(on) { return this.push(C.TRANSPARENCY, [on ? 0 : 1]); }
  mapNameDisplay(on) { return this.push(C.CHANGE_MAP_NAME_DISPLAY, [on ? 0 : 1]); }
  saveAccess(on) { return this.push(C.SAVE_ACCESS, [on ? 0 : 1]); }
  menuAccess(on) { return this.push(C.MENU_ACCESS, [on ? 0 : 1]); }
  formationAccess(on) { return this.push(C.FORMATION_ACCESS, [on ? 0 : 1]); }
  encounterAccess(on) { return this.push(C.ENCOUNTER, [on ? 0 : 1]); }

  bgm(a) { return this.push(C.BGM, [a]); }
  fadeoutBgm(sec) { return this.push(C.FADEOUT_BGM, [sec]); }
  bgs(a) { return this.push(C.BGS, [a]); }
  fadeoutBgs(sec) { return this.push(C.FADEOUT_BGS, [sec]); }
  me(a) { return this.push(C.ME, [a]); }
  se(a) { return this.push(C.SE, [a]); }

  // Transfer Player: [designation, mapId, x, y, direction, fade]
  // fade: 0 black, 1 white, 2 none
  transfer(mapId, x, y, direction = DIR.RETAIN, fade = 0) {
    return this.push(C.TRANSFER, [0, mapId, x, y, direction, fade]);
  }
  // Scroll Map: [direction, distance, speed]
  scrollMap(direction, distance, speed) {
    return this.push(C.SCROLL_MAP, [direction, distance, speed]);
  }
  changeItems(itemId, amount) {
    // [itemId, operation(0 inc/1 dec), operandType(0 const), value]
    return this.push(C.CHANGE_ITEMS, [itemId, amount >= 0 ? 0 : 1, 0, Math.abs(amount)]);
  }
  script(lines) {
    const arr = [].concat(lines);
    this.push(C.SCRIPT, [arr[0]]);
    for (const l of arr.slice(1)) this.push(C.SCRIPT_LINE, [l]);
    return this;
  }

  // Set Movement Route: 205 carries the route, each step repeats as 505.
  moveRoute(characterId, route) {
    const r = {
      list: route.list.slice(),
      repeat: !!route.repeat,
      skippable: !!route.skippable,
      wait: !!route.wait,
    };
    if (!r.list.length || r.list[r.list.length - 1].code !== R.END) {
      r.list.push({ code: R.END, parameters: [] });
    }
    this.push(C.MOVE_ROUTE, [characterId, r]);
    for (const step of r.list) this.push(C.ROUTE_STEP, [step]);
    return this;
  }
  waitForMove() { return this.push(C.WAIT_FOR_MOVE, []); }

  // Finish: append the mandatory terminator.
  done() {
    if (this._indent !== 0) {
      throw new Error(`CmdList.done(): unbalanced indent ${this._indent} (missing endIf?)`);
    }
    const out = this.list.slice();
    out.push({ code: C.END, indent: 0, parameters: [] });
    return out;
  }
}

// --- movement route builder ------------------------------------------------
class Route {
  constructor({ repeat = false, skippable = false, wait = false } = {}) {
    this.list = []; this.repeat = repeat; this.skippable = skippable; this.wait = wait;
  }
  step(code, parameters = []) { this.list.push({ code, parameters }); return this; }
  move(dir, times = 1) { for (let i = 0; i < times; i++) this.step(R[dir]); return this; }
  turn(dir) { return this.step(R["TURN_" + dir]); }
  waitFrames(n) { return this.step(R.WAIT, [n]); }
  se(a) { return this.step(R.PLAY_SE, [a]); }
  speed(n) { return this.step(R.CHANGE_SPEED, [n]); }
  freq(n) { return this.step(R.CHANGE_FREQ, [n]); }
  through(on) { return this.step(on ? R.THROUGH_ON : R.THROUGH_OFF); }
  stepAnime(on) { return this.step(on ? R.STEP_ANIME_ON : R.STEP_ANIME_OFF); }
  walkAnime(on) { return this.step(on ? R.WALK_ANIME_ON : R.WALK_ANIME_OFF); }
  dirFix(on) { return this.step(on ? R.DIR_FIX_ON : R.DIR_FIX_OFF); }
  image(name, index) { return this.step(R.CHANGE_IMAGE, [name, index]); }
  opacity(n) { return this.step(R.CHANGE_OPACITY, [n]); }
}

// --- event / page builders -------------------------------------------------
function conditions(o = {}) {
  return {
    actorId: o.actorId || 1, actorValid: !!o.actorValid,
    itemId: o.itemId || 1, itemValid: !!o.itemValid,
    selfSwitchCh: o.selfSwitchCh || "A", selfSwitchValid: !!o.selfSwitchValid,
    switch1Id: o.switch1Id || 1, switch1Valid: !!o.switch1Valid,
    switch2Id: o.switch2Id || 1, switch2Valid: !!o.switch2Valid,
    variableId: o.variableId || 1, variableValid: !!o.variableValid,
    variableValue: o.variableValue || 0,
  };
}

function page(o = {}) {
  return {
    conditions: conditions(o.conditions),
    directionFix: !!o.directionFix,
    image: {
      tileId: o.image?.tileId || 0,
      characterName: o.image?.characterName || "",
      characterIndex: o.image?.characterIndex || 0,
      direction: o.image?.direction || 2,
      pattern: o.image?.pattern === undefined ? 1 : o.image.pattern,
    },
    list: o.list || [{ code: 0, indent: 0, parameters: [] }],
    moveFrequency: o.moveFrequency === undefined ? 3 : o.moveFrequency,
    moveRoute: o.moveRoute || { list: [{ code: 0, parameters: [] }], repeat: true, skippable: false, wait: false },
    moveSpeed: o.moveSpeed === undefined ? 3 : o.moveSpeed,
    moveType: o.moveType || 0,
    priorityType: o.priorityType === undefined ? 1 : o.priorityType,
    stepAnime: !!o.stepAnime,
    through: !!o.through,
    trigger: o.trigger || 0,
    walkAnime: o.walkAnime === undefined ? true : !!o.walkAnime,
  };
}

function event(o) {
  return { id: o.id, name: o.name || "", note: o.note || "", x: o.x, y: o.y, pages: o.pages || [page()] };
}

// A page with no graphic, no collision and no commands: the standard
// "spent" page that replaces a cutscene actor once its scene is over.
function blankPage(cond) {
  return page({
    conditions: cond,
    priorityType: 0,
    through: true,
    trigger: 0,
    list: [{ code: 0, indent: 0, parameters: [] }],
  });
}

function commonEvent(o) {
  return {
    id: o.id, name: o.name || "", trigger: o.trigger || 0,
    switchId: o.switchId || 1, list: o.list || [{ code: 0, indent: 0, parameters: [] }],
  };
}

module.exports = { C, R, DIR, CmdList, Route, audio, page, event, blankPage, conditions, commonEvent };
