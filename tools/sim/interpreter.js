"use strict";
// A headless re-implementation of the parts of RPG Maker MZ that Gray Stone's
// event logic depends on.
//
// WHY THIS EXISTS
// ---------------
// The proprietary MZ runtime is not present in this environment, so the game
// cannot be played here. That does NOT have to mean the logic is unverified.
// Event command semantics are precisely specified, so the control flow can be
// executed faithfully and the regression scenarios actually RUN: culprit
// selection, AP accounting, repeat-interaction guards, Autorun termination and
// save/load persistence are exercised, not asserted.
//
// WHAT IT PROVES AND WHAT IT DOES NOT
// -----------------------------------
// It proves: branch and loop semantics, switch/variable state, self switches,
// page selection, common-event call graphs, interpreter termination.
// It does NOT prove: rendering, audio playback, collision at runtime, plugin
// behaviour, or anything requiring the real engine. Those stay BLOCKED until
// the project is opened in RPG Maker MZ.
//
// Branch, loop, label and skip semantics below mirror Game_Interpreter.

class Game_Switches {
  constructor() { this._data = []; }
  value(id) { return !!this._data[id]; }
  setValue(id, v) { this._data[id] = !!v; }
  clone() { const s = new Game_Switches(); s._data = this._data.slice(); return s; }
}

class Game_Variables {
  constructor() { this._data = []; }
  value(id) { return this._data[id] || 0; }
  setValue(id, v) { this._data[id] = Math.floor(v); }
  clone() { const s = new Game_Variables(); s._data = this._data.slice(); return s; }
}

class Game_SelfSwitches {
  constructor() { this._data = {}; }
  value(key) { return !!this._data[JSON.stringify(key)]; }
  setValue(key, v) { this._data[JSON.stringify(key)] = !!v; }
  clone() { const s = new Game_SelfSwitches(); s._data = Object.assign({}, this._data); return s; }
}

class Game {
  constructor(db, opts = {}) {
    this.db = db;
    this.switches = new Game_Switches();
    this.variables = new Game_Variables();
    this.selfSwitches = new Game_SelfSwitches();
    this.mapId = opts.mapId || db.system.startMapId;
    this.playerX = opts.x !== undefined ? opts.x : db.system.startX;
    this.playerY = opts.y !== undefined ? opts.y : db.system.startY;
    this.items = {};                 // itemId -> count
    this.saveEnabled = true;
    this.menuEnabled = true;
    this.formationEnabled = true;
    this.transparent = false;
    this.mapNameDisplay = true;
    this.bgm = null; this.bgs = null;
    this.tone = [0, 0, 0, 0];
    this.weather = { type: 0, power: 0 };
    this.messages = [];              // every Show Text shown, in order
    this.autosaves = 0;
    this.transfers = [];
    this.log = [];
    this.frames = 0;
    this.trace = !!opts.trace;
  }

  itemCount(id) { return this.items[id] || 0; }
  gainItem(id, n) { this.items[id] = Math.max(0, this.itemCount(id) + n); }

  // A save file captures exactly what MZ captures: the game objects. Anything
  // not in here does not survive a load, which is the point of the save tests.
  save() {
    return JSON.stringify({
      switches: this.switches._data,
      variables: this.variables._data,
      selfSwitches: this.selfSwitches._data,
      mapId: this.mapId, playerX: this.playerX, playerY: this.playerY,
      items: this.items,
    });
  }

  load(blob) {
    const d = JSON.parse(blob);
    this.switches._data = d.switches.slice();
    this.variables._data = d.variables.slice();
    this.selfSwitches._data = Object.assign({}, d.selfSwitches);
    this.mapId = d.mapId; this.playerX = d.playerX; this.playerY = d.playerY;
    this.items = Object.assign({}, d.items);
    // A load is a fresh Scene_Map: transient screen state is not restored by
    // the save, which is exactly why CE_024 has to run on map entry.
    this.bgm = null; this.bgs = null;
    this.tone = [0, 0, 0, 0];
  }
}

const MAX_STEPS = 200000;      // a runaway interpreter is a bug, not a wait

class Interpreter {
  constructor(game, opts = {}) {
    this.game = game;
    this.depth = opts.depth || 0;
    this.eventId = opts.eventId || 0;
    this.mapId = opts.mapId || game.mapId;
    this._list = null;
    this._index = 0;
    this._indent = 0;
    this._branch = {};
    this._steps = 0;
    this.terminated = false;
  }

  setup(list, eventId, mapId) {
    this._list = list;
    this._index = 0;
    this._indent = 0;
    this._branch = {};
    if (eventId !== undefined) this.eventId = eventId;
    if (mapId !== undefined) this.mapId = mapId;
  }

  currentCommand() { return this._list[this._index]; }

  run() {
    while (this._index < this._list.length) {
      if (++this._steps > MAX_STEPS) {
        throw new Error(`interpreter exceeded ${MAX_STEPS} steps: probable infinite loop`);
      }
      const cmd = this._list[this._index];
      if (!cmd) break;
      this._indent = cmd.indent;
      const keepGoing = this.execute(cmd);
      if (keepGoing === false) break;
      this._index++;
    }
    this.terminated = true;
    return this;
  }

  skipBranch() {
    while (this._list[this._index + 1] && this._list[this._index + 1].indent > this._indent) {
      this._index++;
    }
  }

  jumpTo(index) {
    const lastIndent = this._indent;
    this._index = index;
    this._indent = this._list[index].indent;
    if (this._indent < lastIndent) this._branch = {};
  }

  execute(cmd) {
    const g = this.game;
    const p = cmd.parameters;
    if (g.trace) g.log.push(`${"  ".repeat(cmd.indent)}${cmd.code} ${JSON.stringify(p).slice(0, 90)}`);

    switch (cmd.code) {
      case 0: return true;                                  // end of list
      case 108: case 408: return true;                      // comment

      // ---- messages
      case 101: {
        this._pendingMessage = { faceName: p[0], faceIndex: p[1], background: p[2], position: p[3], speaker: p[4] || "", lines: [] };
        g.messages.push(this._pendingMessage);
        return true;
      }
      case 401: {
        if (this._pendingMessage) this._pendingMessage.lines.push(p[0]);
        return true;
      }

      // ---- flow
      case 111: {
        const result = this.evalCondition(p);
        this._branch[this._indent] = result;
        if (result === false) this.skipBranch();
        return true;
      }
      case 411: {
        if (this._branch[this._indent] !== false) this.skipBranch();
        return true;
      }
      case 412: return true;                                // end if
      case 112: return true;                                // loop
      case 413: {                                           // repeat above
        do { this._index--; } while (this._list[this._index] && this._list[this._index].indent !== this._indent);
        return true;
      }
      case 113: {                                           // break loop
        let depth = 0;
        while (this._index < this._list.length - 1) {
          this._index++;
          const c = this._list[this._index];
          if (c.code === 112) depth++;
          if (c.code === 413) { if (depth > 0) depth--; else break; }
        }
        return true;
      }
      case 115: { this._index = this._list.length; return false; }   // exit event
      case 118: return true;                                          // label
      case 119: {                                                     // jump to label
        for (let i = 0; i < this._list.length; i++) {
          const c = this._list[i];
          if (c.code === 118 && c.parameters[0] === p[0]) { this.jumpTo(i); return true; }
        }
        return true;
      }
      case 117: {                                                     // call common event
        const ce = g.db.commonEvents[p[0]];
        if (!ce) throw new Error(`Call Common Event ${p[0]}: does not exist`);
        if (this.depth > 40) throw new Error(`common event recursion too deep at CE ${p[0]}`);
        const child = new Interpreter(g, { depth: this.depth + 1, eventId: this.eventId, mapId: this.mapId });
        child.setup(ce.list, this.eventId, this.mapId);
        child.run();
        return true;
      }

      // ---- state
      case 121: {
        for (let id = p[0]; id <= p[1]; id++) g.switches.setValue(id, p[2] === 0);
        return true;
      }
      case 122: {
        const value = this.operandValue(p);
        for (let id = p[0]; id <= p[1]; id++) {
          const old = g.variables.value(id);
          let next = value;
          switch (p[2]) {
            case 0: next = value; break;
            case 1: next = old + value; break;
            case 2: next = old - value; break;
            case 3: next = old * value; break;
            case 4: next = value === 0 ? old : Math.floor(old / value); break;
            case 5: next = value === 0 ? old : old % value; break;
          }
          g.variables.setValue(id, next);
        }
        return true;
      }
      case 123: {
        g.selfSwitches.setValue([this.mapId, this.eventId, p[0]], p[1] === 0);
        return true;
      }
      case 126: {
        const amount = p[1] === 0 ? p[3] : -p[3];
        g.gainItem(p[0], amount);
        return true;
      }

      // ---- access
      case 134: g.saveEnabled = p[0] === 0; return true;
      case 135: g.menuEnabled = p[0] === 0; return true;
      case 137: g.formationEnabled = p[0] === 0; return true;

      // ---- map / screen
      case 201: {
        const mapId = p[0] === 0 ? p[1] : g.variables.value(p[1]);
        const x = p[0] === 0 ? p[2] : g.variables.value(p[2]);
        const y = p[0] === 0 ? p[3] : g.variables.value(p[3]);
        g.transfers.push({ mapId, x, y, direction: p[4], fade: p[5] });
        g.mapId = mapId; g.playerX = x; g.playerY = y;
        // Game_Map.setup runs on a transfer, and GrayStone_Core arms the
        // map-entry switch there. Model that, or the map-entry Autorun would
        // never fire in simulation and the test would prove nothing.
        g.switches.setValue(17, true);
        return true;
      }
      case 204: return true;                                 // scroll map
      case 205: {                                            // set movement route
        const route = p[1];
        g.log.push(`move-route target=${p[0]} steps=${route.list.length} wait=${route.wait}`);
        return true;
      }
      case 505: return true;                                 // route step echo
      case 210: return true;                                 // wait for move
      case 211: g.transparent = p[0] === 0; return true;
      case 221: g.faded = true; return true;
      case 222: g.faded = false; return true;
      case 223: g.tone = p[0].slice(); return true;
      case 230: g.frames += p[0]; return true;
      case 236: g.weather = { type: p[0], power: p[1] }; return true;
      case 281: g.mapNameDisplay = p[0] === 0; return true;

      // ---- audio
      case 241: g.bgm = Object.assign({}, p[0]); return true;
      case 242: g.bgm = null; return true;
      case 245: g.bgs = Object.assign({}, p[0]); return true;
      case 246: g.bgs = null; return true;
      case 249: g.me = Object.assign({}, p[0]); return true;
      case 250: g.lastSe = Object.assign({}, p[0]); return true;
      case 251: g.lastSe = null; return true;

      // ---- script
      case 355: {
        let src = p[0];
        let i = this._index;
        while (this._list[i + 1] && this._list[i + 1].code === 655) {
          i++;
          src += "\n" + this._list[i].parameters[0];
        }
        this._index = i;
        this.evalScript(src);
        return true;
      }
      case 655: return true;

      default:
        return true;   // commands with no simulated effect
    }
  }

  operandValue(p) {
    const g = this.game;
    switch (p[3]) {
      case 0: return p[4];                                    // constant
      case 1: return g.variables.value(p[4]);                 // variable
      case 2: {                                               // random min..max
        const min = p[4], max = p[5];
        return min + Math.floor(this.random() * (max - min + 1));
      }
      case 4: return Number(this.evalScript(p[4])) || 0;       // script
      default: return 0;
    }
  }

  random() {
    // Deterministic when the scenario seeds it, so a failing run is reproducible.
    if (this.game.rng) return this.game.rng();
    return Math.random();
  }

  evalCondition(p) {
    const g = this.game;
    switch (p[0]) {
      case 0: return g.switches.value(p[1]) === (p[2] === 0);
      case 1: {
        const a = g.variables.value(p[1]);
        const b = p[2] === 0 ? p[3] : g.variables.value(p[3]);
        switch (p[4]) {
          case 0: return a === b;
          case 1: return a >= b;
          case 2: return a <= b;
          case 3: return a > b;
          case 4: return a < b;
          case 5: return a !== b;
          default: return false;
        }
      }
      case 2: return g.selfSwitches.value([this.mapId, this.eventId, p[1]]) === (p[2] === 0);
      case 4: return true;                                     // actor in party
      case 8: return g.itemCount(p[1]) > 0;
      case 12: return !!this.evalScript(p[1]);
      default: return true;
    }
  }

  // A deliberately small sandbox: only the engine globals Gray Stone's own
  // Script commands actually touch. Anything else throws, which is how a typo
  // in a Script call is caught here instead of at runtime.
  evalScript(src) {
    const g = this.game;
    const $gameMap = { mapId: () => g.mapId };
    const $gameSwitches = g.switches;
    const $gameVariables = g.variables;
    const $gameSystem = { isSaveEnabled: () => g.saveEnabled };
    const SceneManager = {
      _scene: { requestAutosave: () => { if (!g.switches.value(5)) g.autosaves++; } },
    };
    const console_ = { warn: () => {}, log: () => {} };
    try {
      // eslint-disable-next-line no-new-func
      const fn = new Function("$gameMap", "$gameSwitches", "$gameVariables", "$gameSystem", "SceneManager", "console", `"use strict"; return (${src});`);
      return fn($gameMap, $gameSwitches, $gameVariables, $gameSystem, SceneManager, console_);
    } catch (e) {
      // Statement bodies (the autosave block) are not expressions.
      try {
        // eslint-disable-next-line no-new-func
        const fn = new Function("$gameMap", "$gameSwitches", "$gameVariables", "$gameSystem", "SceneManager", "console", `"use strict";\n${src}`);
        return fn($gameMap, $gameSwitches, $gameVariables, $gameSystem, SceneManager, console_);
      } catch (e2) {
        throw new Error(`Script command failed: ${e2.message}\n--- source ---\n${src}`);
      }
    }
  }
}

// Page selection: MZ takes the LAST page whose conditions are all satisfied.
function findProperPageIndex(game, mapId, ev) {
  for (let i = ev.pages.length - 1; i >= 0; i--) {
    const c = ev.pages[i].conditions;
    let ok = true;
    if (c.switch1Valid && !game.switches.value(c.switch1Id)) ok = false;
    if (c.switch2Valid && !game.switches.value(c.switch2Id)) ok = false;
    if (c.variableValid && !(game.variables.value(c.variableId) >= c.variableValue)) ok = false;
    if (c.selfSwitchValid && !game.selfSwitches.value([mapId, ev.id, c.selfSwitchCh])) ok = false;
    if (c.itemValid && game.itemCount(c.itemId) <= 0) ok = false;
    if (ok) return i;
  }
  return -1;
}

// Run every Autorun that currently matches on a map, the way Scene_Map would.
// Bounded: an Autorun that keeps re-qualifying after running is a softlock, and
// that is exactly what the regression suite needs to detect.
function runMapAutoruns(game, mapId, { maxPasses = 20 } = {}) {
  const map = game.db.maps[mapId];
  if (!map) throw new Error(`map ${mapId} not loaded`);
  const executed = [];
  for (let pass = 0; pass < maxPasses; pass++) {
    let ran = false;
    for (const ev of map.events) {
      if (!ev) continue;
      const pi = findProperPageIndex(game, mapId, ev);
      if (pi < 0) continue;
      const pg = ev.pages[pi];
      if (pg.trigger !== 3) continue;
      const it = new Interpreter(game, { eventId: ev.id, mapId });
      it.setup(pg.list, ev.id, mapId);
      it.run();
      executed.push({ event: ev.name, page: pi + 1, pass });
      ran = true;
      break;                         // one Autorun at a time, like the engine
    }
    if (!ran) return { executed, settled: true, passes: pass };
  }
  return { executed, settled: false, passes: maxPasses };
}

// Fire an Action Button event as if the player pressed OK facing it.
function triggerEvent(game, mapId, eventName) {
  const map = game.db.maps[mapId];
  const ev = map.events.find((e) => e && e.name === eventName);
  if (!ev) throw new Error(`event "${eventName}" not found on map ${mapId}`);
  const pi = findProperPageIndex(game, mapId, ev);
  if (pi < 0) return { ran: false, reason: "no page matches" };
  const pg = ev.pages[pi];
  const it = new Interpreter(game, { eventId: ev.id, mapId });
  it.setup(pg.list, ev.id, mapId);
  it.run();
  return { ran: true, page: pi + 1 };
}

function callCommonEvent(game, id) {
  const ce = game.db.commonEvents[id];
  if (!ce) throw new Error(`common event ${id} does not exist`);
  const it = new Interpreter(game, { eventId: 0, mapId: game.mapId });
  it.setup(ce.list, 0, game.mapId);
  it.run();
  return it;
}

module.exports = { Game, Interpreter, findProperPageIndex, runMapAutoruns, triggerEvent, callCommonEvent };
