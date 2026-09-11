//=============================================================================
// GrayStone_Core.js
//=============================================================================
/*:
 * @target MZ
 * @plugindesc Gray Stone core: menu shaping, map-entry guard, and the state the
 * investigation systems rely on. No combat, no new message pipeline.
 * @author Gray Stone project
 *
 * @param mapEntrySwitch
 * @text Map entry switch
 * @desc Switch turned ON whenever a map is set up (transfer, new game or load).
 * The map's guarded Autorun consumes it and turns it back OFF.
 * @type switch
 * @default 17
 *
 * @param hideCombatCommands
 * @text Hide combat menu commands
 * @desc Gray Stone has one character and no combat, so Skill, Equip, Status and
 * Formation carry no information.
 * @type boolean
 * @default true
 *
 * @help
 * Gray Stone is a one-character investigation game. This plugin does three
 * small things that events cannot do for themselves, and nothing else:
 *
 *  1. Map entry. RPG Maker has no "on map enter" trigger. Rather than burn a
 *     Parallel Process on every map polling for arrival, this turns a switch ON
 *     inside Game_Map.setup. A guarded Autorun consumes it once and turns it
 *     OFF. That covers a transfer, a New Game and a LOAD identically, which is
 *     what makes ambience and NPC schedules come back correctly after loading.
 *
 *  2. Menu shaping. Skill, Equip, Status and Formation are removed, and the key
 *     item category is presented as the case file.
 *
 *  3. Nothing is stored outside $gameSwitches / $gameVariables, so saves stay
 *     plain MZ saves and there is no custom save data to migrate.
 *
 * Terms: free for commercial and non-commercial use in this project.
 */
(() => {
  "use strict";
  const PLUGIN = "GrayStone_Core";
  const params = PluginManager.parameters(PLUGIN);
  const MAP_ENTRY_SWITCH = Number(params.mapEntrySwitch || 17);
  const HIDE_COMBAT = String(params.hideCombatCommands || "true") === "true";

  //--------------------------------------------------------------------------
  // 1. Map entry guard
  //--------------------------------------------------------------------------
  // Game_Map.setup runs on transfer, on New Game and on load, so arming the
  // switch here is the one hook that covers all three the same way.
  const _Game_Map_setup = Game_Map.prototype.setup;
  Game_Map.prototype.setup = function (mapId) {
    _Game_Map_setup.call(this, mapId);
    if (MAP_ENTRY_SWITCH > 0 && $gameSwitches) {
      $gameSwitches.setValue(MAP_ENTRY_SWITCH, true);
    }
  };

  //--------------------------------------------------------------------------
  // 2. Menu shaping
  //--------------------------------------------------------------------------
  if (HIDE_COMBAT) {
    Window_MenuCommand.prototype.addMainCommands = function () {
      // Items only: they are the evidence. Skill/Equip/Status describe a combat
      // character Gray Stone does not have.
      if (this.needsCommand("item")) {
        this.addCommand(TextManager.item, "item", this.areMainCommandsEnabled());
      }
    };
    Window_MenuCommand.prototype.addFormationCommand = function () { /* one actor */ };
    Scene_Menu.prototype.commandPersonal = function () { this.popScene(); };
  }

  // The item screen carries evidence, not loot: drop the weapon/armour tabs.
  const _Window_ItemCategory_makeCommandList = Window_ItemCategory.prototype.makeCommandList;
  Window_ItemCategory.prototype.makeCommandList = function () {
    if (!HIDE_COMBAT) return _Window_ItemCategory_makeCommandList.call(this);
    if (this.needsCommand("item")) this.addCommand(TextManager.item, "item");
    if (this.needsCommand("keyItem")) this.addCommand(TextManager.keyItem, "keyItem");
  };

  //--------------------------------------------------------------------------
  // 3. Safety: never let a locked scene be saved into
  //--------------------------------------------------------------------------
  // The cutscene wrapper sets the save-lock switch; honour it at the engine
  // level too, so an autosave request mid-scene cannot capture a half-applied
  // atomic state.
  const _Scene_Base_requestAutosave = Scene_Base.prototype.requestAutosave;
  Scene_Base.prototype.requestAutosave = function () {
    if ($gameSwitches && $gameSwitches.value(5)) return;   // S_0005_Save_Locked
    _Scene_Base_requestAutosave.call(this);
  };
})();
