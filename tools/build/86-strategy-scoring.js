"use strict";
// CE_015 derived states and CE_019..021 strategy scoring.
//
// 06_Common_Events states these in prose ("+1 ally_ready", "+1 victim_secured",
// "apply staff trust threshold modifier without exceeding 3") but gives no
// thresholds, and 37_Ending_Resolver lists the steps without formulas. The
// THRESHOLDS BELOW ARE A DESIGN DECISION made here, not a transcription -- they
// are collected in one table so they can be tuned in one place after play.
//
// What is not a decision: the shape. A strategy scores 0..3, quality 0 means the
// plan was invalid, and every score is reachable -- without that the ending
// matrix collapses onto its invalid row and 60 of its 78 endings can never be
// seen.
const { CmdList } = require("../lib/mz");

const THRESHOLDS = {
  evidenceCoreCount: 5,      // core clues needed before the case is "complete"
  witnessStaffTrust: 60,     // staff trust at which someone will testify
  allyStaffTrust: 50,        // trust at which a chosen ally actually turns up
  officialTrustBonus: 70,    // trust that adds weight to a formal accusation
  lockdownStaffTrust: 55,    // trust needed for the household to hold a lockdown
};

function buildDerivedStates(reg) {
  const { S, V } = reg;
  const c = new CmdList();
  c.comment([
    "CE_015 Recalculate derived states.",
    "Cheap no-op unless something marked the state dirty.",
    "Thresholds live in tools/build/86-strategy-scoring.js.",
  ].join("\n"));

  c.ifSwitch(S("S_0003_Derived_States_Dirty"), false);
    c.exitEvent();
  c.endIf();

  c.comment("Evidence core: enough corroborating clues to carry an accusation.");
  c.switchOff(S("S_0026_Derived_Evidence_Core_Complete"));
  c.ifVar(V("V_0010_Evidence_Core_Count"), THRESHOLDS.evidenceCoreCount, 1);
    c.switchOn(S("S_0026_Derived_Evidence_Core_Complete"));
  c.endIf();

  c.comment("Reliable witness: the staff trust Leonard enough for one to speak.");
  c.switchOff(S("S_0027_Derived_Reliable_Witness"));
  c.ifVar(V("V_0013_Staff_Trust"), THRESHOLDS.witnessStaffTrust, 1);
    c.switchOn(S("S_0027_Derived_Reliable_Witness"));
  c.endIf();

  c.comment("Victim secured: Evelyn is safe rather than threatened or harmed.");
  c.switchOff(S("S_0029_Derived_Victim_Secured"));
  c.ifVar(V("V_0015_Evelyn_Status"), 1, 0);
    c.switchOn(S("S_0029_Derived_Victim_Secured"));
  c.endIf();

  c.comment("Ally ready: an ally was chosen AND the household trusts him enough.");
  c.switchOff(S("S_0028_Derived_Ally_Ready"));
  c.ifVar(V("V_0019_Ambush_Ally_ID"), 1, 1);
    c.ifVar(V("V_0013_Staff_Trust"), THRESHOLDS.allyStaffTrust, 1);
      c.switchOn(S("S_0028_Derived_Ally_Ready"));
    c.endIf();
  c.endIf();

  c.comment("Keys controlled: the wine key is held and none is reported missing.");
  c.switchOff(S("S_0030_Derived_Keys_Controlled"));
  c.ifSwitch(S("S_0206_Wine_Key"));
    c.ifSwitch(S("S_0755_flag_key_missing"), false);
      c.switchOn(S("S_0030_Derived_Keys_Controlled"));
    c.endIf();
  c.endIf();

  c.comment("Passages controlled: the secret panel is known, so it can be watched.");
  c.switchOff(S("S_0031_Derived_Passages_Controlled"));
  c.ifSwitch(S("S_0205_Panel_Unlocked"));
    c.switchOn(S("S_0031_Derived_Passages_Controlled"));
  c.endIf();

  c.switchOff(S("S_0003_Derived_States_Dirty"));
  return c.done();
}

// Shared tail: clamp to 0..3, the range 38_Ending_Matrix uses.
function clamp(c, V) {
  c.ifVar(V("V_0008_Strategy_Quality"), 3, 3);
    c.varSet(V("V_0008_Strategy_Quality"), 3);
  c.endIf();
  c.ifVar(V("V_0008_Strategy_Quality"), 0, 4);
    c.varSet(V("V_0008_Strategy_Quality"), 0);
  c.endIf();
}

function buildOfficial(reg) {
  const { S, V } = reg;
  const c = new CmdList();
  c.comment([
    "CE_019 Evaluate official inquiry.",
    "A wrong accusation, or none at all, scores 0 however good the evidence is:",
    "a formal inquiry that names the wrong woman is not a weak success.",
  ].join("\n"));
  c.switchOn(S("S_0003_Derived_States_Dirty"));
  c.callCommon(15);
  c.varSet(V("V_0008_Strategy_Quality"), 0);

  c.ifVar(V("V_0038_Accused_ID"), 1, 1);                       // someone was accused
    c.ifVarVar(V("V_0038_Accused_ID"), V("V_0006_Culprit_ID"), 0);
      c.varAdd(V("V_0008_Strategy_Quality"), 1);
      c.ifSwitch(S("S_0026_Derived_Evidence_Core_Complete"));
        c.varAdd(V("V_0008_Strategy_Quality"), 1);
      c.endIf();
      c.ifSwitch(S("S_0027_Derived_Reliable_Witness"));
        c.varAdd(V("V_0008_Strategy_Quality"), 1);
      c.endIf();
      c.comment("Household trust lends weight, but cannot push past a clean case.");
      c.ifVar(V("V_0013_Staff_Trust"), THRESHOLDS.officialTrustBonus, 1);
        c.varAdd(V("V_0008_Strategy_Quality"), 1);
      c.endIf();
    c.else_();
      c.comment("Wrong woman named: the inquiry fails outright.");
      c.varSet(V("V_0008_Strategy_Quality"), 0);
    c.endIf();
  c.endIf();

  clamp(c, V);
  return c.done();
}

function buildAmbush(reg) {
  const { S, V } = reg;
  const c = new CmdList();
  c.comment("CE_020 Evaluate ambush. Route, ally and Evelyn's safety each carry a point.");
  c.switchOn(S("S_0003_Derived_States_Dirty"));
  c.callCommon(15);
  c.varSet(V("V_0008_Strategy_Quality"), 0);

  c.ifSwitch(S("S_0705_flag_road_intercept_ready"));
    c.varAdd(V("V_0008_Strategy_Quality"), 1);
  c.endIf();
  c.ifSwitch(S("S_0028_Derived_Ally_Ready"));
    c.varAdd(V("V_0008_Strategy_Quality"), 1);
  c.endIf();
  c.ifSwitch(S("S_0029_Derived_Victim_Secured"));
    c.varAdd(V("V_0008_Strategy_Quality"), 1);
  c.endIf();

  c.comment("An ambush laid while Evelyn is already harmed cannot be called clean.");
  c.ifVar(V("V_0015_Evelyn_Status"), 3, 1);
    c.ifVar(V("V_0008_Strategy_Quality"), 2, 1);
      c.varSet(V("V_0008_Strategy_Quality"), 2);
    c.endIf();
  c.endIf();

  clamp(c, V);
  return c.done();
}

function buildLockdown(reg) {
  const { S, V } = reg;
  const c = new CmdList();
  c.comment("CE_021 Evaluate lockdown. Keys, passages and a household that will hold.");
  c.switchOn(S("S_0003_Derived_States_Dirty"));
  c.callCommon(15);
  c.varSet(V("V_0008_Strategy_Quality"), 0);

  c.ifSwitch(S("S_0030_Derived_Keys_Controlled"));
    c.varAdd(V("V_0008_Strategy_Quality"), 1);
  c.endIf();
  c.ifSwitch(S("S_0031_Derived_Passages_Controlled"));
    c.varAdd(V("V_0008_Strategy_Quality"), 1);
  c.endIf();
  c.ifSwitch(S("S_0029_Derived_Victim_Secured"));
    c.ifVar(V("V_0013_Staff_Trust"), THRESHOLDS.lockdownStaffTrust, 1);
      c.varAdd(V("V_0008_Strategy_Quality"), 1);
    c.endIf();
  c.endIf();

  c.comment("A house locked down with an unwatched passage is only ever partial.");
  c.ifSwitch(S("S_0031_Derived_Passages_Controlled"), false);
    c.ifVar(V("V_0008_Strategy_Quality"), 2, 1);
      c.varSet(V("V_0008_Strategy_Quality"), 2);
    c.endIf();
  c.endIf();

  clamp(c, V);
  return c.done();
}

module.exports = { buildDerivedStates, buildOfficial, buildAmbush, buildLockdown, THRESHOLDS };
