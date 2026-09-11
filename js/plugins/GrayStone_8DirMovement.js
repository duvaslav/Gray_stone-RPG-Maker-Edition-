//=============================================================================
// GrayStone_8DirMovement.js
//=============================================================================
/*:
 * @target MZ
 * @plugindesc Eight-direction GRID movement for the player. Keeps MZ's tile
 * coordinate model intact; this is not pixel movement.
 * @author Gray Stone project
 *
 * @param enabled
 * @text Enabled
 * @desc Turn diagonal input off in one place if a cutscene or a test needs
 * strict four-direction movement.
 * @type boolean
 * @default true
 *
 * @param normalizeSpeed
 * @text Normalise diagonal speed
 * @desc A diagonal step covers ~1.41 tiles. Without this, moving diagonally is
 * measurably faster than moving straight.
 * @type boolean
 * @default true
 *
 * @param strictCorners
 * @text Block corner cutting
 * @desc Require BOTH component directions to be passable before allowing a
 * diagonal step, so the player can never slip through a wall corner.
 * @type boolean
 * @default true
 *
 * @help
 * Why grid and not pixel movement:
 *
 * Gray Stone is built on tile-exact triggers -- search points, doorway cells,
 * NPC coordinates, cutscene staging and scripted routes. True pixel movement
 * replaces MZ's collision model and would put all of that at risk. This plugin
 * instead uses the diagonal movement MZ already supports (Game_CharacterBase
 * .moveDiagonally), so every coordinate stays an integer tile and no event,
 * transfer or route changes behaviour.
 *
 * It affects the PLAYER ONLY. NPC and event coordinates, autonomous movement
 * and scripted Move Routes are untouched, which is what keeps cutscene
 * choreography exactly as authored.
 *
 * Corner cutting is blocked by default: a diagonal step is allowed only when
 * both of its component directions are individually passable, so a player
 * cannot squeeze diagonally between two wall corners into a room they should
 * have to walk around to.
 *
 * Terms: free for commercial and non-commercial use in this project.
 */
(() => {
  "use strict";
  const PLUGIN = "GrayStone_8DirMovement";
  const p = PluginManager.parameters(PLUGIN);
  const ENABLED = String(p.enabled || "true") === "true";
  const NORMALIZE = String(p.normalizeSpeed || "true") === "true";
  const STRICT_CORNERS = String(p.strictCorners || "true") === "true";

  if (!ENABLED) return;

  // Input.dir8 is already part of MZ; the default player simply ignores it.
  const _Game_Player_moveByInput = Game_Player.prototype.moveByInput;
  Game_Player.prototype.moveByInput = function () {
    if (!this.isMoving() && this.canMove()) {
      const d8 = Input.dir8;
      if (d8 % 2 === 0 && d8 !== 0) {
        // 2/4/6/8 -- an orthogonal direction; hand back to the default path.
        return _Game_Player_moveByInput.call(this);
      }
      if (d8 !== 0) {
        const horz = d8 === 1 || d8 === 7 ? 4 : 6;
        const vert = d8 === 1 || d8 === 3 ? 2 : 8;
        $gameTemp.clearDestination();
        this.executeDiagonalMove(horz, vert);
        return;
      }
    }
    _Game_Player_moveByInput.call(this);
  };

  Game_Player.prototype.executeDiagonalMove = function (horz, vert) {
    const x = this.x, y = this.y;
    if (this.canPassDiagonally(x, y, horz, vert)) {
      this.moveDiagonally(horz, vert);
    } else if (this.canPass(x, y, horz)) {
      // Sliding along the wall the player is pressing into reads far better
      // than stopping dead in a corridor.
      this.moveStraight(horz);
    } else if (this.canPass(x, y, vert)) {
      this.moveStraight(vert);
    } else {
      this.setDirection(vert);
      this.checkEventTriggerTouchFront(vert);
    }
  };

  if (STRICT_CORNERS) {
    // MZ's own canPassDiagonally already requires one L-shaped route to be
    // clear. Tighten it so BOTH component steps must be passable: otherwise a
    // player can cut the corner of two diagonally-touching walls.
    Game_Player.prototype.canPassDiagonally = function (x, y, horz, vert) {
      const x2 = $gameMap.roundXWithDirection(x, horz);
      const y2 = $gameMap.roundYWithDirection(y, vert);
      if (!this.canPass(x, y, horz)) return false;
      if (!this.canPass(x, y, vert)) return false;
      if (!this.canPass(x2, y, vert)) return false;
      if (!this.canPass(x, y2, horz)) return false;
      return true;
    };
  }

  if (NORMALIZE) {
    // A diagonal step covers sqrt(2) tiles in the same time as a straight one.
    // Scale the per-frame distance while the move is diagonal so the player's
    // real speed is constant in every direction.
    const _Game_Player_distancePerFrame = Game_Player.prototype.distancePerFrame;
    Game_Player.prototype.distancePerFrame = function () {
      const base = _Game_Player_distancePerFrame.call(this);
      return this.isMovingDiagonally() ? base / Math.SQRT2 : base;
    };
    Game_Player.prototype.isMovingDiagonally = function () {
      return this._realX !== this.x && this._realY !== this.y;
    };
  }
})();
