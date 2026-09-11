//=============================================================================
// GrayStone_MessageUI.js
//=============================================================================
/*:
 * @target MZ
 * @plugindesc Styles the NATIVE Window_Message and Window_NameBox for Gray Stone:
 * late-Victorian graphite with a restrained bronze accent. Show Text is untouched.
 * @author Gray Stone project
 *
 * @param nameBoxOffsetX
 * @text Name box offset X
 * @desc Horizontal offset of the name box from the message window's left edge.
 * @type number
 * @min -200
 * @default 8
 *
 * @param messagePadding
 * @text Message padding
 * @desc Inner padding of the message window, in pixels.
 * @type number
 * @default 16
 *
 * @param fontSize
 * @text Message font size
 * @desc Body text size. MZ's default is 26, which reads small once the window is
 * scaled up on a large display. 30 is comfortable for Russian text.
 * @type number
 * @default 30
 *
 * @param nameFontSize
 * @text Name font size
 * @type number
 * @default 26
 *
 * @param lineHeight
 * @text Message line height
 * @desc Vertical space per line. Must grow with the font or lines collide; MZ's
 * default 36 leaves a 30px font cramped. The message window resizes itself.
 * @type number
 * @default 42
 *
 * @param backOpacity
 * @text Window back opacity
 * @desc Higher is more opaque. Gray Stone wants the text legible over a dim manor.
 * @type number
 * @min 0
 * @max 255
 * @default 216
 *
 * @param nameColor
 * @text Speaker name colour
 * @desc CSS colour for the speaker's name. Muted brass, not fantasy gold.
 * @default #c9a227
 *
 * @help
 * This plugin does NOT replace the message system. It restyles the two windows
 * MZ already has, so every line of dialogue stays an ordinary Show Text command
 * with MZ's own native speaker name -- no plugin was installed merely to put a
 * name above a box, and removing this plugin loses the styling, not the script.
 *
 * What it changes:
 *   - the name box sits flush on top of the message window, left-aligned to it,
 *     instead of floating with MZ's default gap;
 *   - graphite background with a faint warm edge, drawn under the windowskin so
 *     a project windowskin still shows through;
 *   - the speaker's name is drawn in muted brass;
 *   - padding and font sizes are tuned for Russian text at 816x624.
 *
 * Face graphics are untouched and keep working; the name box reflows around
 * them because it measures the message window rather than assuming a width.
 *
 * Terms: free for commercial and non-commercial use in this project.
 */
(() => {
  "use strict";
  const PLUGIN = "GrayStone_MessageUI";
  const p = PluginManager.parameters(PLUGIN);
  const NAME_OFFSET_X = Number(p.nameBoxOffsetX || 8);
  const PADDING = Number(p.messagePadding || 16);
  const FONT_SIZE = Number(p.fontSize || 30);
  const NAME_FONT_SIZE = Number(p.nameFontSize || 26);
  const LINE_HEIGHT = Number(p.lineHeight || 42);
  const BACK_OPACITY = Number(p.backOpacity || 216);
  const NAME_COLOR = String(p.nameColor || "#c9a227");

  const INK = "rgba(18, 19, 22, 0.94)";        // graphite ground
  const EDGE = "rgba(120, 96, 48, 0.55)";      // thin bronze edge
  const PAPER = "rgba(196, 188, 172, 0.05)";   // barely-there paper tooth

  //--------------------------------------------------------------------------
  // Message window
  //--------------------------------------------------------------------------
  const _Window_Message_initialize = Window_Message.prototype.initialize;
  Window_Message.prototype.initialize = function (rect) {
    _Window_Message_initialize.call(this, rect);
    this.backOpacity = BACK_OPACITY;
  };

  Window_Message.prototype.updatePadding = function () { this.padding = PADDING; };

  // Line height has to grow with the font size, or a larger font simply overlaps
  // itself inside MZ's fixed 36px rows. Window_Message sizes itself from
  // fittingHeight(4), so overriding this also makes the box taller to match.
  Window_Message.prototype.lineHeight = function () { return LINE_HEIGHT; };

  const _Window_Message_resetFontSettings = Window_Message.prototype.resetFontSettings;
  Window_Message.prototype.resetFontSettings = function () {
    _Window_Message_resetFontSettings.call(this);
    this.contents.fontSize = FONT_SIZE;
  };

  // Paint the Gray Stone ground beneath whatever windowskin is in use, so the
  // styling holds even with the stock skin and improves with a project one.
  const _Window_Message_drawBackground = Window_Base.prototype._refreshBack;
  Window_Message.prototype._refreshBack = function () {
    _Window_Message_drawBackground.call(this);
    paintGround(this);
  };

  //--------------------------------------------------------------------------
  // Name box: attached to the message window, not floating
  //--------------------------------------------------------------------------
  const _Window_NameBox_initialize = Window_NameBox.prototype.initialize;
  Window_NameBox.prototype.initialize = function () {
    _Window_NameBox_initialize.call(this);
    this.backOpacity = BACK_OPACITY;
  };

  Window_NameBox.prototype.updatePadding = function () { this.padding = Math.round(PADDING * 0.65); };
  Window_NameBox.prototype.lineHeight = function () { return Math.round(LINE_HEIGHT * 0.85); };

  Window_NameBox.prototype.updatePlacement = function () {
    this.width = this.windowWidth();
    this.height = this.windowHeight();
    const messageWindow = this._messageWindow;
    // Flush to the message window's top edge: the two read as one unit rather
    // than as a label hovering above a box.
    this.x = messageWindow.x + NAME_OFFSET_X;
    if (messageWindow.y > 0) {
      this.y = messageWindow.y - this.height + this.margin * 0.5;
    } else {
      this.y = messageWindow.y + messageWindow.height - this.margin * 0.5;
    }
    // Never let the name box run off-screen on a narrow speaker-less line.
    this.x = Math.max(0, Math.min(this.x, Graphics.boxWidth - this.width));
  };

  const _Window_NameBox_resetFontSettings = Window_NameBox.prototype.resetFontSettings;
  Window_NameBox.prototype.resetFontSettings = function () {
    _Window_NameBox_resetFontSettings.call(this);
    this.contents.fontSize = NAME_FONT_SIZE;
  };

  const _Window_NameBox_refresh = Window_NameBox.prototype.refresh;
  Window_NameBox.prototype.refresh = function () {
    _Window_NameBox_refresh.call(this);
    if (!this._name) return;
    // Redraw the name in brass over MZ's own layout, keeping its metrics.
    this.contents.clear();
    this.resetFontSettings();
    this.changeTextColor(NAME_COLOR);
    const rect = this.baseTextRect();
    this.drawText(this._name, rect.x, rect.y, rect.width);
    this.resetTextColor();
  };

  const _Window_NameBox_refreshBack = Window_Base.prototype._refreshBack;
  Window_NameBox.prototype._refreshBack = function () {
    _Window_NameBox_refreshBack.call(this);
    paintGround(this);
  };

  //--------------------------------------------------------------------------
  function paintGround(win) {
    const back = win._backSprite;
    if (!back || !back.bitmap) return;
    const w = win.width, h = win.height;
    if (w <= 0 || h <= 0) return;
    const b = new Bitmap(w, h);
    b.fillRect(0, 0, w, h, INK);
    b.fillRect(0, 0, w, 1, EDGE);
    b.fillRect(0, h - 1, w, 1, EDGE);
    // A single faint horizontal tooth keeps the panel from reading as flat
    // digital black without becoming a texture.
    b.fillRect(0, Math.floor(h * 0.5), w, 1, PAPER);
    back.bitmap = b;
  }
})();
