"use strict";
// Builds MAP_030, MAP_040, MAP_050 and MAP_060 from tools/data/interior-plans.js.
const interior = require("../lib/interior");
const PLANS = require("../data/interior-plans");

function buildAll() {
  const out = {};
  for (const [key, plan] of Object.entries(PLANS)) out[key] = interior.build(plan);
  return out;
}

module.exports = { buildAll, PLANS };
