"use strict";
// Prologue events for MAP_005, built from spec/62_Prologue_Event_Registry,
// spec/63_Prologue_Command_List (105 ordered commands) and
// spec/65_Prologue_Movement_Routes.
const { CmdList, Route, audio, page, event, blankPage, DIR, C, R } = require("../lib/mz");

// Blueprint cast positions.
//
// 62_Prologue_Event_Registry puts Linda at (10,9) and Agnes at (22,9). Both
// cells carry the formal hedge on the structure layer, so those two servants
// would stand inside the planting; both are also outside the porch zone that
// 61_Prologue_Map_Blueprint itself defines (PR_ZONE_PORCH x=11..20, cast_y=9..11).
// The six are re-laid as a receiving line parted on the door axis: three cells
// either side of x=16, all on the stone paving, axis left clear for the camera
// and for Leonard's and Roland's entry routes. Order and role are unchanged.
// See docs/QA.md D-02.
const CAST = [
  { key: "EV_PR_LINDA",    id: 5,  x: 13, y: 9, sheet: "People1", index: 7 },
  { key: "EV_PR_CELESTE",  id: 6,  x: 14, y: 9, sheet: "People2", index: 0 },
  { key: "EV_PR_VERA",     id: 7,  x: 15, y: 9, sheet: "People2", index: 1 },
  { key: "EV_PR_BEATRICE", id: 8,  x: 17, y: 9, sheet: "People2", index: 2 },
  { key: "EV_PR_NIKA",     id: 9,  x: 18, y: 9, sheet: "People2", index: 3 },
  { key: "EV_PR_AGNES",    id: 10, x: 19, y: 9, sheet: "People2", index: 4 },
];

const EV = { CONTROLLER: 1, LEONARD: 2, ROLAND: 3, MARLENA: 4, DOOR: 11 };
const SAND = (v, p, pan = 0) => audio("Sand", v, p, pan);

// --- movement routes (65_Prologue_Movement_Routes) -------------------------
function routes() {
  const r = {};
  r.LEONARD_APPROACH = new Route({ wait: false })
    .speed(3).freq(5)
    .move("UP", 2).se(SAND(28, 90))
    .move("UP", 2).se(SAND(28, 92))
    .move("UP", 2).se(SAND(28, 94))
    .move("UP", 1).waitFrames(12).turn("UP");           // -> (16,15)

  r.ROLAND_GREETING = new Route({ wait: true })
    .speed(3).freq(5)
    .move("DOWN", 1).se(SAND(22, 96)).turn("DOWN").waitFrames(10);  // -> (16,12)

  r.MARLENA_APPROACH = new Route({ wait: true })
    .speed(3).freq(5)
    .move("DOWN", 1).se(SAND(20, 98, -8))
    .move("RIGHT", 1).se(SAND(20, 100, -4)).turn("DOWN");           // -> (15,11)

  r.MARLENA_RETURN = new Route({ wait: true })
    .speed(3).freq(5)
    .move("LEFT", 1).se(SAND(20, 100, -4))
    .move("UP", 1).se(SAND(20, 98, -8)).turn("DOWN");                // -> (14,10)

  // The stock !Door1 sheet animates by pattern, so the opening is played as a
  // short turn sequence on a direction-fixed event rather than by walking.
  r.DOOR_OPEN = new Route({ wait: true })
    .se(audio("Door2", 65, 90))
    .turn("LEFT").waitFrames(3)
    .turn("RIGHT").waitFrames(3)
    .turn("UP").waitFrames(6);

  r.ROLAND_ENTER = new Route({ wait: false })
    .speed(3).freq(5)
    .turn("UP").move("LEFT", 1)
    .move("UP", 2).se(SAND(22, 96, -4))
    .move("UP", 2).se(SAND(22, 98, -2));                             // -> (15,8)

  r.LEONARD_ENTER = new Route({ wait: true })
    .speed(3).freq(5)
    .turn("UP")
    .move("UP", 2).se(SAND(26, 92))
    .move("UP", 2).se(SAND(26, 94))
    .move("UP", 2).se(SAND(26, 96))
    .move("UP", 1);                                                  // -> (16,8)
  return r;
}

// --- the controller's 105-command Autorun ----------------------------------
function controllerCommands(reg) {
  const { S, V } = reg;
  const rt = routes();
  const c = new CmdList();
  const narr = { background: 1, position: 2 };            // Dim box, bottom
  const speak = (face, idx, name) => ({ faceName: face, faceIndex: idx, background: 0, position: 2, speaker: name });

  c.label("PROLOGUE_START");

  // -- replay guard. Two independent guards, because either alone can fail:
  //    the global switch survives a load, the self switch survives a re-enter.
  c.ifSwitch(S("S_0012_Prologue_Complete"));
    c.switchRange(S("S_0004_Menu_Locked"), S("S_0005_Save_Locked"), false);
    c.saveAccess(true); c.menuAccess(true); c.formationAccess(true);
    c.transparency(false);
    c.selfSwitch("A", true);
    c.transfer(20, 22, 31, DIR.UP, 0);
    c.exitEvent();
  c.endIf();

  // -- lock the scene down while the cutscene owns the screen
  c.fadeout();
  c.saveAccess(false); c.menuAccess(false); c.formationAccess(false);
  c.switchRange(S("S_0004_Menu_Locked"), S("S_0005_Save_Locked"), true);
  c.switchOn(S("S_0015_Atomic_Scene"));
  c.transparency(true);
  c.mapNameDisplay(false);

  // -- FIX: initialise the game here.
  //    63_Prologue_Command_List contains no Call Common Event at all (no code
  //    117), yet MAP_005 is the New Game start map and CE_001 is specified as
  //    "start map Autorun". Without this call CE_002 never runs, Culprit_ID
  //    stays 0, and the ending resolver has no culprit for the whole run.
  //    Called under a black screen, before any prologue state is set, so the
  //    prologue's own dusk clock below overrides CE_004's 06:00 default.
  //    See docs/QA.md D-03.
  c.callCommon(1);

  c.tint([-34, -34, -17, 34], 1, true);
  c.bgm(audio("Theme4", 45, 100, 0));
  c.bgs(audio("Wind2", 22, 90, 0));
  c.wait(30);
  c.fadein();
  c.se(audio("Horse", 55, 90, -15));
  c.se(SAND(35, 76, -10));
  c.wait(20);

  c.text(["Карета остановилась у ворот", "Грейстоуна."], narr);
  c.text(["Дом возвышается на холме, его", "шпили чернеют на фоне", "предзакатного неба."], narr);

  // SHOT_02: Leonard walks up as the camera reveals the turning circle.
  c.moveRoute(EV.LEONARD, rt.LEONARD_APPROACH);
  c.scrollMap(8, 5, 3);          // direction 8 = up
  c.se(audio("Crow", 32, 88, 25));
  c.text(["Десять лет — и ничего, кажется,", "не изменилось."], narr);
  c.text(["И всё же что-то не так."], narr);
  c.wait(12);

  // SHOT_03: Roland.
  c.moveRoute(EV.ROLAND, rt.ROLAND_GREETING);
  c.text(["Господин граф.", "Добро пожаловать домой.", "Ваши покои готовы."], speak("People1", 0, "Роланд"));
  c.wait(12);
  c.text(["Дворецкий Роланд встречает вас", "на ступенях."], narr);
  c.text(["За его плечом — выстроенная", "прислуга.", "Шесть служанок."], narr);
  c.text(["Их лица — маски почтения,", "но один взгляд держится на вас", "чуть дольше, чем подобает."], narr);
  c.wait(18);

  // SHOT_04: the tableau opens; Marlena steps out.
  c.scrollMap(8, 3, 3);
  c.moveRoute(EV.MARLENA, rt.MARLENA_APPROACH);
  c.text(["Господин, экономка Марлена", "к вашим услугам.", "Если позволите — после ужина", "я хотела бы переговорить с вами"], speak("People1", 1, "Марлена"));
  c.text(["наедине.", "Дело… деликатное."], speak("People1", 1, "Марлена"));
  c.moveRoute(EV.MARLENA, rt.MARLENA_RETURN);
  c.wait(20);

  // SHOT_05: the door.
  c.moveRoute(EV.DOOR, rt.DOOR_OPEN);
  c.tint([-52, -44, -24, 24], 30, false);
  c.moveRoute(EV.ROLAND, rt.ROLAND_ENTER);
  c.moveRoute(EV.LEONARD, rt.LEONARD_ENTER);
  c.wait(18);

  // SHOT_06: title card, then the transfer under a black screen.
  c.fadeoutBgs(2);
  c.fadeoutBgm(2);
  c.fadeout();
  c.wait(20);
  c.me(audio("Mystery", 55, 95, 0));
  c.text(["ДЕНЬ ПЕРВЫЙ", "Возвращение"], { background: 2, position: 1 });
  c.wait(60);

  // -- commit prologue state. Day 1 opens in the evening, not at CE_004's
  //    06:00 dawn: Leonard arrives at dusk.
  c.switchOn(S("S_0012_Prologue_Complete"));
  c.switchOn(S("S_0013_Arrived"));
  c.switchOn(S("S_0100_Day_1_Started"));
  c.varSet(V("V_0001_Current_Day"), 1);
  c.varSet(V("V_0002_Current_Hour"), 18);
  c.varSet(V("V_0003_Current_Minute"), 0);
  c.varSet(V("V_0004_Time_Block"), 4);
  c.switchRange(S("S_0814_TimeBlock_Dawn"), S("S_0818_TimeBlock_Night"), false);
  c.switchOn(S("S_0817_TimeBlock_Evening"));
  c.varSet(V("V_0005_AP_Remaining"), 5);

  c.selfSwitch("A", true);
  c.transfer(20, 22, 31, DIR.UP, 2);   // fade 2 = none; already black
  c.transparency(false);

  // -- hand control back. Every lock taken above is released here, and this is
  //    the only path out of the Autorun besides the guarded early exit.
  c.switchOff(S("S_0015_Atomic_Scene"));
  c.switchRange(S("S_0004_Menu_Locked"), S("S_0005_Save_Locked"), false);
  c.saveAccess(true); c.menuAccess(true); c.formationAccess(true);
  c.mapNameDisplay(true);
  c.tint([0, 0, 0, 0], 1, false);
  c.callCommon(24);                    // restore ambience for MAP_020
  c.fadein();
  c.varSet(V("V_0033_Checkpoint_Reason"), 12);
  c.callCommon(23);                    // autosave: the prologue is a checkpoint
  c.exitEvent();

  return c.done();
}

function build(reg) {
  const { S } = reg;
  const events = [null];
  const put = (e) => { events[e.id] = e; };

  // 1 - controller. Page 2 is deliberately empty: once self switch A is on the
  // event has no graphic, no collision and no commands, so nothing can re-run
  // and nothing is left on screen.
  put(event({
    id: EV.CONTROLLER, name: "EV_PR_CONTROLLER", x: 1, y: 1,
    pages: [
      page({
        trigger: 3,                 // Autorun
        priorityType: 0, through: true, directionFix: true, walkAnime: false,
        list: controllerCommands(reg),
      }),
      blankPage({ selfSwitchValid: true, selfSwitchCh: "A" }),
    ],
  }));

  const actor = (id, name, x, y, sheet, index, dir, dirFix) => put(event({
    id, name, x, y,
    pages: [
      page({
        trigger: 0, priorityType: 1, directionFix: dirFix, walkAnime: true,
        image: { characterName: sheet, characterIndex: index, direction: dir, pattern: 1 },
      }),
      // Once the prologue is over these actors must leave no residue and,
      // crucially, no collision on the drive.
      blankPage({ switch1Valid: true, switch1Id: S("S_0012_Prologue_Complete") }),
    ],
  }));

  actor(EV.LEONARD, "EV_PR_LEONARD", 16, 22, "Actor1", 0, DIR.UP, false);
  actor(EV.ROLAND, "EV_PR_ROLAND", 16, 11, "People1", 0, DIR.DOWN, false);
  actor(EV.MARLENA, "EV_PR_MARLENA", 14, 10, "People1", 1, DIR.DOWN, false);
  for (const m of CAST) actor(m.id, m.key, m.x, m.y, m.sheet, m.index, DIR.DOWN, true);

  // 11 - the door. !-prefixed sheets have no shadow and align to the tile.
  put(event({
    id: EV.DOOR, name: "EV_PR_DOOR", x: 16, y: 7,
    pages: [
      page({
        trigger: 0, priorityType: 1, directionFix: false, walkAnime: false,
        image: { characterName: "!Door1", characterIndex: 0, direction: DIR.DOWN, pattern: 1 },
      }),
      blankPage({ switch1Valid: true, switch1Id: S("S_0012_Prologue_Complete") }),
    ],
  }));

  for (let i = 1; i <= 11; i++) if (!events[i]) throw new Error(`prologue event ${i} missing`);
  return events;
}

module.exports = { build, routes, CAST, EV };
