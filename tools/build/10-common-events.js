"use strict";
// Generates data/CommonEvents.json (CE_001 .. CE_025) from the exact command
// specifications in spec/06_Common_Events.json.
//
// Every event here obeys two invariants the validator and the simulator check:
//   1. it terminates -- no branch can leave an Autorun caller spinning;
//   2. its scratch inputs (V21 minutes, V22 AP cost, V23 clue, V24/V25 relation)
//      are cleared on EVERY exit path, so a repeated call cannot double-charge.
const { CmdList, Route, audio, commonEvent, C, DIR } = require("../lib/mz");

// Time blocks. 15_Time_AP fixes the five durations (150/240/300/240/120 min);
// they resolve to these absolute-minute boundaries, which is also exactly what
// the brief specifies. 06_Common_Events' "06-09=1,10-13=2,14-17=3,18-21=4"
// hour ranges contradict both and are NOT used -- see docs/QA.md D-01.
const BLOCK = [
  { id: 1, from: 330,  to: 480,  name: "Раннее утро", sw: "S_0814_TimeBlock_Dawn" },
  { id: 2, from: 480,  to: 720,  name: "Утро",        sw: "S_0815_TimeBlock_Morning" },
  { id: 3, from: 720,  to: 1020, name: "День",        sw: "S_0816_TimeBlock_Afternoon" },
  { id: 4, from: 1020, to: 1260, name: "Вечер",       sw: "S_0817_TimeBlock_Evening" },
  { id: 5, from: 1260, to: 1380, name: "Ночь",        sw: "S_0818_TimeBlock_Night" },
];
const DAY_END_MINUTE = 1380; // 23:00 - the night block closes the day

const CULPRITS = [
  { id: 1, key: "linda",    name: "Линда",    threat: 1, sw: "S_0020_Version_Linda" },
  { id: 2, key: "celeste",  name: "Селеста",  threat: 1, sw: "S_0021_Version_Celeste" },
  { id: 3, key: "vera",     name: "Вера",     threat: 3, sw: "S_0022_Version_Vera" },
  { id: 4, key: "beatrice", name: "Беатриса", threat: 3, sw: "S_0023_Version_Beatrice" },
  { id: 5, key: "nika",     name: "Ника",     threat: 1, sw: "S_0024_Version_Nika" },
  { id: 6, key: "agnes",    name: "Агнес",    threat: 2, sw: "S_0025_Version_Agnes" },
];

const PLAY_MAPS = [10, 20, 30, 40, 50, 60];

function build(reg) {
  const { S, V, dayStarted, dayComplete } = reg;
  const list = [null];
  const add = (id, name, cmds, opts = {}) => {
    list[id] = commonEvent({ id, name, trigger: opts.trigger || 0, switchId: opts.switchId || 1, list: cmds });
  };

  // ---------------------------------------------------------------- CE_001
  {
    const c = new CmdList();
    c.comment("CE_001 New Game Init. Runs once; S0001 is the replay guard.");
    c.ifSwitch(S("S_0001_New_Game_Initialized"), false);
      c.varSet(V("V_0020_Schema_Version"), 1);
      c.varSet(V("V_0001_Current_Day"), 1);
      c.varSet(V("V_0002_Current_Hour"), 6);
      c.varSet(V("V_0003_Current_Minute"), 0);
      c.varSet(V("V_0004_Time_Block"), 1);
      c.varSet(V("V_0005_AP_Remaining"), 5);
      c.callCommon(2);   // select culprit  (must precede default states)
      c.callCommon(3);   // default states
      c.switchOn(S("S_0001_New_Game_Initialized"));
      c.callCommon(4);   // day start
    c.else_();
      c.comment("Already initialised (load / re-entry): never re-roll anything.");
      c.exitEvent();
    c.endIf();
    add(1, "CE_001_New_Game_Init", c.done());
  }

  // ---------------------------------------------------------------- CE_002
  {
    const c = new CmdList();
    c.comment([
      "CE_002 Select Culprit. THE culprit is chosen exactly once per New Game.",
      "Double guard: S0002 locked AND Culprit_ID still 0. After a load S0002 is",
      "ON, so this returns without touching V6.",
    ].join("\n"));
    c.ifSwitch(S("S_0002_Culprit_Locked"), false);
      c.ifVar(V("V_0006_Culprit_ID"), 0, 0);
        c.varRandom(V("V_0006_Culprit_ID"), 1, 6);
        for (const cu of CULPRITS) {
          c.ifVar(V("V_0006_Culprit_ID"), cu.id, 0);
            c.varSet(V("V_0018_Threat_Target"), cu.threat);
            c.switchOn(S(cu.sw));
          c.endIf();
        }
        c.switchOn(S("S_0016_Culprit_Version_Ready"));
        c.switchOn(S("S_0002_Culprit_Locked"));
        c.varSet(V("V_0033_Checkpoint_Reason"), 2);
        c.callCommon(23);
      c.endIf();
    c.endIf();
    add(2, "CE_002_Select_Culprit", c.done());
  }

  // ---------------------------------------------------------------- CE_003
  {
    const c = new CmdList();
    c.comment("CE_003 Default states. Migration-guarded: only runs below current schema.");
    c.ifVar(V("V_0020_Schema_Version"), 1, 4); // < 1  => pre-schema save
      c.varSet(V("V_0020_Schema_Version"), 1);
    c.endIf();
    c.ifSwitch(S("S_0001_New_Game_Initialized"), false);
      c.comment("New game only: gameplay values are never reset on an ordinary load.");
      c.varSet(V("V_0005_AP_Remaining"), 5);
      for (const id of [7, 8, 9, 10, 11, 12, 15, 16, 17, 19, 27, 28, 29, 30]) {
        c.varSet(id, 0);
      }
      c.varSet(V("V_0013_Staff_Trust"), 50);
      c.varSet(V("V_0014_Leonard_Health"), 100);
      c.comment("All NPC location variables start off-map (0).");
      for (const [name, id] of Object.entries(reg.variables.byName)) {
        if (/^V_\d+_NPC_Location_/.test(name)) c.varSet(id, 0);
      }
      c.switchOn(S("S_0201_Main_Door_Access"));
      c.switchOn(S("S_0202_Study_Access"));
      c.switchOn(S("S_0212_Back_Gate_Access"));
      c.switchOn(S("S_0213_Stable_Access"));
      c.switchOn(S("S_0214_Garden_Access"));
    c.endIf();
    add(3, "CE_003_Set_Default_States", c.done());
  }

  // ---------------------------------------------------------------- CE_004
  {
    const c = new CmdList();
    c.comment("CE_004 Day Start. Called on day transition only, never on load (CE_024 does that).");
    c.ifVar(V("V_0001_Current_Day"), 1, 4);   // day < 1
      c.comment("Invalid day: refuse rather than start a broken day.");
      c.exitEvent();
    c.endIf();
    c.ifVar(V("V_0001_Current_Day"), 11, 1);  // day >= 11
      c.switchOn(S("S_0010_Final_Phase"));
      c.exitEvent();
    c.endIf();
    c.varSet(V("V_0005_AP_Remaining"), 5);
    c.varSet(V("V_0002_Current_Hour"), 6);
    c.varSet(V("V_0003_Current_Minute"), 0);
    c.varSet(V("V_0004_Time_Block"), 1);
    c.switchRange(S("S_0814_TimeBlock_Dawn"), S("S_0818_TimeBlock_Night"), false);
    c.switchOn(S("S_0814_TimeBlock_Dawn"));
    c.switchOff(S("S_0014_Day_End_Available"));
    c.switchOff(S("S_0009_Day_End_Requested"));
    for (let d = 1; d <= 10; d++) {
      c.ifVar(V("V_0001_Current_Day"), d, 0);
        c.switchOn(dayStarted(d));
      c.endIf();
    }
    c.callCommon(9);   // NPC schedules
    c.callCommon(11);  // weather / lighting
    c.callCommon(10);  // audio
    c.callCommon(16);  // mandatory events
    c.varSet(V("V_0033_Checkpoint_Reason"), 4);
    c.callCommon(23);  // autosave
    add(4, "CE_004_Day_Start", c.done());
  }

  // ---------------------------------------------------------------- CE_005
  {
    const c = new CmdList();
    c.comment([
      "CE_005 Day End. Guarded by the Day_N_Complete switch so an interrupted",
      "day-end cannot advance the calendar twice.",
    ].join("\n"));
    c.callCommon(16);
    c.ifSwitch(S("S_0008_Mandatory_Event_Pending"));
      c.comment("Window passed with the mandatory scene unresolved: run its fallback.");
      c.switchOff(S("S_0008_Mandatory_Event_Pending"));
      c.varSet(V("V_0029_Mandatory_Event_ID"), 0);
    c.endIf();
    for (let d = 1; d <= 10; d++) {
      c.ifVar(V("V_0001_Current_Day"), d, 0);
        c.ifSwitch(dayComplete(d), false);
          c.switchOn(dayComplete(d));
          c.varSet(V("V_0033_Checkpoint_Reason"), 5);
          c.callCommon(23);
          if (d < 10) {
            c.varAdd(V("V_0001_Current_Day"), 1);
            c.switchOff(S("S_0009_Day_End_Requested"));
            c.callCommon(4);
          } else {
            c.switchOn(S("S_0010_Final_Phase"));
            c.switchOff(S("S_0009_Day_End_Requested"));
          }
        c.endIf();
      c.endIf();
    }
    c.switchOff(S("S_0009_Day_End_Requested"));
    c.switchOff(S("S_0014_Day_End_Available"));
    add(5, "CE_005_Day_End", c.done());
  }

  // ---------------------------------------------------------------- CE_006
  {
    const c = new CmdList();
    c.comment([
      "CE_006 Advance Time. Input: V21 Action_Minutes. Always clears V21.",
      "Block boundaries come from 15_Time_AP durations (150/240/300/240/120).",
    ].join("\n"));
    c.varFromVar(V("V_0031_Temp_Old_Block"), V("V_0004_Time_Block"), 0);
    c.varFromVar(V("V_0003_Current_Minute"), V("V_0021_Action_Minutes"), 1);
    c.push(C.LOOP, []);
    c._indent++;
      c.ifVar(V("V_0003_Current_Minute"), 60, 1); // >= 60
        c.varSub(V("V_0003_Current_Minute"), 60);
        c.varAdd(V("V_0002_Current_Hour"), 1);
      c.else_();
        c.push(C.BREAK_LOOP, []);
      c.endIf();
    c._indent--;
    c.push(C.REPEAT_ABOVE, []);
    c.varSet(V("V_0021_Action_Minutes"), 0);

    c.comment("Absolute minutes, then derive the block by an ascending cascade.");
    c.varFromVar(V("V_0032_Temp_Total_Minutes"), V("V_0002_Current_Hour"), 0);
    c.push(C.VARIABLES, [V("V_0032_Temp_Total_Minutes"), V("V_0032_Temp_Total_Minutes"), 3, 0, 60]);
    c.varFromVar(V("V_0032_Temp_Total_Minutes"), V("V_0003_Current_Minute"), 1);

    c.comment("Past 23:00 the day is over: clamp and request day end.");
    c.ifVar(V("V_0032_Temp_Total_Minutes"), DAY_END_MINUTE, 1);
      c.varSet(V("V_0002_Current_Hour"), 23);
      c.varSet(V("V_0003_Current_Minute"), 0);
      c.varSet(V("V_0032_Temp_Total_Minutes"), DAY_END_MINUTE);
      c.switchOn(S("S_0009_Day_End_Requested"));
    c.endIf();

    c.varSet(V("V_0004_Time_Block"), 5);
    for (const b of BLOCK) {
      c.ifVar(V("V_0032_Temp_Total_Minutes"), b.from, 1);
        c.varSet(V("V_0004_Time_Block"), b.id);
      c.endIf();
    }
    c.switchRange(S("S_0814_TimeBlock_Dawn"), S("S_0818_TimeBlock_Night"), false);
    for (const b of BLOCK) {
      c.ifVar(V("V_0004_Time_Block"), b.id, 0);
        c.switchOn(S(b.sw));
      c.endIf();
    }
    c.comment("Block changed => refresh the systems that read the clock.");
    c.ifVarVar(V("V_0004_Time_Block"), V("V_0031_Temp_Old_Block"), 5); // !=
      c.callCommon(9);
      c.callCommon(10);
      c.callCommon(11);
      c.callCommon(16);
    c.endIf();
    add(6, "CE_006_Advance_Time", c.done());
  }

  // ---------------------------------------------------------------- CE_007
  {
    const c = new CmdList();
    c.comment([
      "CE_007 Spend AP. Inputs: V22 AP cost, V21 minutes.",
      "Atomic: AP, clock and inputs settle with no yielding command between them,",
      "so an interrupted call cannot spend AP without advancing time.",
      "Every path clears V21 and V22.",
    ].join("\n"));
    c.ifSwitch(S("S_0903_QA_Ignore_AP"));
      c.varSet(V("V_0022_Action_AP_Cost"), 0);
      c.callCommon(6);
      c.exitEvent();
    c.endIf();
    c.ifVarVar(V("V_0005_AP_Remaining"), V("V_0022_Action_AP_Cost"), 1); // AP >= cost
      c.push(C.VARIABLES, [V("V_0005_AP_Remaining"), V("V_0005_AP_Remaining"), 2, 1, V("V_0022_Action_AP_Cost")]);
      c.varSet(V("V_0022_Action_AP_Cost"), 0);
      c.callCommon(6);
      c.callCommon(8);
    c.else_();
      c.varSet(V("V_0021_Action_Minutes"), 0);
      c.varSet(V("V_0022_Action_AP_Cost"), 0);
      c.text(["Сил на сегодня не осталось.", "Стоит подумать до утра."], { background: 1 });
    c.endIf();
    add(7, "CE_007_Spend_AP", c.done());
  }

  // ---------------------------------------------------------------- CE_008
  {
    const c = new CmdList();
    c.comment("CE_008 Check AP. Only ever OFFERS the day end; it never advances the day itself.");
    c.ifVar(V("V_0005_AP_Remaining"), 0, 2); // <= 0
      c.switchOn(S("S_0014_Day_End_Available"));
      c.ifSwitch(S("S_0015_Atomic_Scene"), false);
        c.callCommon(16);
      c.endIf();
    c.else_();
      c.switchOff(S("S_0014_Day_End_Available"));
    c.endIf();
    add(8, "CE_008_Check_AP", c.done());
  }

  // ---------------------------------------------------------------- CE_009
  {
    const c = new CmdList();
    c.comment([
      "CE_009 Refresh NPC schedules.",
      "Instance switches are cleared FIRST, then at most one is turned back on,",
      "so the singleton invariant holds even if this is re-entered.",
      "Populated by tools/build/30-npc-schedules.js once schedules are generated.",
    ].join("\n"));
    for (const [name, id] of Object.entries(reg.switches.byName)) {
      if (/_Schedule_Valid$/.test(name)) c.switchOff(S(name));
    }
    c.comment("<<GENERATED_SCHEDULE_BRANCHES>>");
    for (const [name, id] of Object.entries(reg.switches.byName)) {
      if (/_Schedule_Valid$/.test(name)) c.switchOn(S(name));
    }
    add(9, "CE_009_Refresh_NPC_Schedules", c.done());
  }

  // ---------------------------------------------------------------- CE_010
  {
    const c = new CmdList();
    c.comment([
      "CE_010 Refresh audio. Compares the wanted profile against V27/V28 and only",
      "issues Play BGM/BGS when it actually changes -- entering a map must not",
      "restart the track that is already playing.",
    ].join("\n"));
    c.ifSwitch(S("S_0006_Audio_Scene_Override"));
      c.exitEvent();
    c.endIf();
    c.varSet(V("V_0034_Temp_Scratch_A"), 0);
    c.comment("Profile selection: interior manor maps share one profile, exteriors another.");
    for (const m of PLAY_MAPS) {
      c.ifScript(`$gameMap.mapId() === ${m}`);
        c.varSet(V("V_0034_Temp_Scratch_A"), m);
      c.endIf();
    }
    c.ifVarVar(V("V_0027_Previous_BGM_State"), V("V_0034_Temp_Scratch_A"), 5); // changed
      c.varFromVar(V("V_0027_Previous_BGM_State"), V("V_0034_Temp_Scratch_A"), 0);
      c.comment("<<GENERATED_BGM_SELECTION>> exact_file resolved from 29_Audio_Library");
    c.endIf();
    add(10, "CE_010_Refresh_Audio", c.done());
  }

  // ---------------------------------------------------------------- CE_011
  {
    const c = new CmdList();
    c.comment("CE_011 Weather + lighting. Native Tint Screen / Set Weather Effect only.");
    c.ifSwitch(S("S_0007_Weather_Override"));
      c.exitEvent();
    c.endIf();
    c.comment("Interiors carry no weather; only the exterior estate does.");
    c.ifScript("$gameMap.mapId() !== 10");
      c.weather(0, 0, 1, false);
    c.endIf();
    const TONE = {
      1: [-40, -34, -10, 24], 2: [-12, -10, 0, 8], 3: [0, 0, 0, 0],
      4: [-48, -40, -16, 28], 5: [-72, -62, -30, 40],
    };
    for (const b of BLOCK) {
      c.ifVar(V("V_0004_Time_Block"), b.id, 0);
        c.tint(TONE[b.id], 60, false);
      c.endIf();
    }
    add(11, "CE_011_Refresh_Weather_Lighting", c.done());
  }

  // ---------------------------------------------------------------- CE_012
  {
    const c = new CmdList();
    c.comment([
      "CE_012 Add evidence. Input V23 = clue item id.",
      "The per-clue switch is the idempotence guard: a second discovery of the same",
      "clue grants no item and no counter increment. V23 is always cleared.",
    ].join("\n"));
    c.comment("<<GENERATED_CLUE_BRANCHES>> emitted by tools/build/40-evidence.js");
    c.varSet(V("V_0023_Clue_Item_ID_Input"), 0);
    add(12, "CE_012_Add_Evidence", c.done());
  }

  // ---------------------------------------------------------------- CE_013
  {
    const c = new CmdList();
    c.comment("CE_013 Present evidence. Costs 0 AP and 0 minutes by design (RULE_MANDATORY).");
    c.comment("<<GENERATED_PRESENT_BRANCHES>>");
    c.varSet(V("V_0025_Current_NPC_ID"), 0);
    add(13, "CE_013_Present_Evidence", c.done());
  }

  // ---------------------------------------------------------------- CE_014
  {
    const c = new CmdList();
    c.comment("CE_014 Update relationship. Inputs V24 delta, V25 npc. Clamped to -100..100.");
    c.comment("<<GENERATED_RELATION_BRANCHES>>");
    c.varSet(V("V_0024_Relationship_Delta"), 0);
    c.varSet(V("V_0025_Current_NPC_ID"), 0);
    c.switchOn(S("S_0003_Derived_States_Dirty"));
    add(14, "CE_014_Update_Relationship", c.done());
  }

  // ---------------------------------------------------------------- CE_015
  {
    const c = new CmdList();
    c.comment("CE_015 Recalculate derived states. Cheap no-op unless the dirty flag is set.");
    c.ifSwitch(S("S_0003_Derived_States_Dirty"), false);
      c.exitEvent();
    c.endIf();
    c.comment("<<GENERATED_DERIVED_RULES>>");
    c.switchOff(S("S_0003_Derived_States_Dirty"));
    add(15, "CE_015_Recalculate_Derived_States", c.done());
  }

  // ---------------------------------------------------------------- CE_016
  {
    const c = new CmdList();
    c.comment([
      "CE_016 Mandatory event check. Never leaves S0008 pending on exit: whichever",
      "branch runs, the flag and V29 are cleared before returning.",
    ].join("\n"));
    c.comment("<<GENERATED_MANDATORY_BRANCHES>>");
    c.switchOff(S("S_0008_Mandatory_Event_Pending"));
    c.varSet(V("V_0029_Mandatory_Event_ID"), 0);
    add(16, "CE_016_Check_Mandatory_Event", c.done());
  }

  // ------------------------------------------------------- CE_017 / CE_018
  {
    const c = new CmdList();
    c.comment("CE_017 Repeat dialogue select. Falls through to CE_018 when nothing is left.");
    c.comment("<<GENERATED_TOPIC_BRANCHES>>");
    c.callCommon(18);
    add(17, "CE_017_Repeat_Dialogue_Select", c.done());
  }
  {
    const c = new CmdList();
    c.comment("CE_018 Exhausted dialogue. No AP, no minutes, no relationship change.");
    c.varRandom(V("V_0034_Temp_Scratch_A"), 1, 3);
    c.ifVar(V("V_0034_Temp_Scratch_A"), 1, 0);
      c.text(["Больше мне нечего добавить, господин."], { background: 0 });
    c.else_();
      c.ifVar(V("V_0034_Temp_Scratch_A"), 2, 0);
        c.text(["Простите — дела не ждут."], { background: 0 });
      c.else_();
        c.text(["…", "Мы ведь уже говорили об этом."], { background: 0 });
      c.endIf();
    c.endIf();
    c.varSet(V("V_0025_Current_NPC_ID"), 0);
    c.varSet(V("V_0026_Selected_Repeat_Topic"), 0);
    add(18, "CE_018_Repeat_Dialogue_Exhausted", c.done());
  }

  // ------------------------------------------------- CE_019..021 strategies
  const strategies = [
    [19, "CE_019_Evaluate_Official"],
    [20, "CE_020_Evaluate_Ambush"],
    [21, "CE_021_Evaluate_Lockdown"],
  ];
  for (const [id, name] of strategies) {
    const c = new CmdList();
    c.comment(`${name}. Always yields V8 in 0..3 -- a weak plan scores low, it never blocks.`);
    c.callCommon(15);
    c.varSet(V("V_0008_Strategy_Quality"), 0);
    c.comment("<<GENERATED_QUALITY_RULES>>");
    c.ifVar(V("V_0008_Strategy_Quality"), 3, 3); // > 3
      c.varSet(V("V_0008_Strategy_Quality"), 3);
    c.endIf();
    c.ifVar(V("V_0008_Strategy_Quality"), 0, 4); // < 0
      c.varSet(V("V_0008_Strategy_Quality"), 0);
    c.endIf();
    add(id, name, c.done());
  }

  // ---------------------------------------------------------------- CE_022
  {
    const c = new CmdList();
    c.comment([
      "CE_022 Final resolver. Total by construction: strategy 0 (the player never",
      "chose one) resolves to a per-culprit NONE leaf, so every Culprit x Strategy",
      "x Quality combination lands on a result. V30 > 0 is asserted before ending.",
    ].join("\n"));
    c.callCommon(15);
    c.ifVar(V("V_0007_Strategy_ID"), 1, 0); c.callCommon(19); c.endIf();
    c.ifVar(V("V_0007_Strategy_ID"), 2, 0); c.callCommon(20); c.endIf();
    c.ifVar(V("V_0007_Strategy_ID"), 3, 0); c.callCommon(21); c.endIf();
    c.varFromVar(V("V_0009_Effective_Strategy_Quality"), V("V_0008_Strategy_Quality"), 0);
    c.varSet(V("V_0030_Final_Result_ID"), 0);
    c.comment("<<GENERATED_ENDING_MATRIX>> 6 culprits x 4 strategy states x 4 qualities");
    c.comment("Fallback leaf: no generated branch matched, still produce a result.");
    c.ifVar(V("V_0030_Final_Result_ID"), 0, 0);
      c.varFromVar(V("V_0030_Final_Result_ID"), V("V_0006_Culprit_ID"), 0);
      c.push(C.VARIABLES, [V("V_0030_Final_Result_ID"), V("V_0030_Final_Result_ID"), 3, 0, 100]);
    c.endIf();
    c.label("END_RESOLVED");
    add(22, "CE_022_Final_Resolver", c.done());
  }

  // ---------------------------------------------------------------- CE_023
  {
    const c = new CmdList();
    c.comment([
      "CE_023 Autosave checkpoint. Uses the real MZ API (SceneManager requestAutosave",
      "-> slot 0), not an invented 'Autosave' command. A failed autosave must not",
      "damage game state, so nothing persistent is mutated after the Script call.",
    ].join("\n"));
    c.ifSwitch(S("S_0005_Save_Locked"), false);
      c.script([
        "// Autosave through the engine's own path; guarded so a missing scene",
        "// or a disabled save slot degrades to a no-op instead of an exception.",
        "try {",
        "  if ($gameSystem.isSaveEnabled() && SceneManager._scene) {",
        "    SceneManager._scene.requestAutosave();",
        "  }",
        "} catch (e) { console.warn('GrayStone autosave skipped:', e); }",
      ]);
    c.endIf();
    c.varSet(V("V_0033_Checkpoint_Reason"), 0);
    add(23, "CE_023_Autosave_Checkpoint", c.done());
  }

  // ---------------------------------------------------------------- CE_024
  {
    const c = new CmdList();
    c.comment([
      "CE_024 Map enter. The load/transfer entry point: restores ambience and",
      "schedules WITHOUT touching day, clock or AP (that is CE_004's job only).",
    ].join("\n"));
    c.varSet(V("V_0034_Temp_Scratch_A"), 0);
    for (const m of PLAY_MAPS) {
      c.ifScript(`$gameMap.mapId() === ${m}`);
        c.varSet(V("V_0034_Temp_Scratch_A"), 1);
      c.endIf();
    }
    c.ifVar(V("V_0034_Temp_Scratch_A"), 0, 0);
      c.comment("Cinematic or unknown map: leave schedules and audio to the scene.");
      c.exitEvent();
    c.endIf();
    c.ifSwitch(S("S_0015_Atomic_Scene"), false);
      c.switchOff(S("S_0006_Audio_Scene_Override"));
      c.switchOff(S("S_0007_Weather_Override"));
    c.endIf();
    c.callCommon(10);
    c.callCommon(11);
    c.callCommon(9);
    c.callCommon(16);
    add(24, "CE_024_Map_Enter_Audio", c.done());
  }

  // ---------------------------------------------------------------- CE_025
  {
    const c = new CmdList();
    c.comment("CE_025 Debug report. Deployment builds ship with S0900 OFF.");
    c.ifSwitch(S("S_0900_Debug_Mode"), false);
      c.exitEvent();
    c.endIf();
    c.text([
      "День \\V[1]  \\V[2]:\\V[3]  блок \\V[4]",
      "ОД: \\V[5]   схема: \\V[20]",
      "culprit=\\V[6] strategy=\\V[7] q=\\V[8]",
    ], { background: 1 });
    add(25, "CE_025_Debug_State_Report", c.done());
  }

  for (let i = 1; i <= 25; i++) {
    if (!list[i]) throw new Error(`CE_${String(i).padStart(3, "0")} not generated`);
  }
  return list;
}

module.exports = { build, BLOCK, CULPRITS, DAY_END_MINUTE, PLAY_MAPS };
