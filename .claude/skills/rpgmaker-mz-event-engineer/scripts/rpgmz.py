"""Shared helpers for reading RPG Maker MZ/MV project data.

Used by inspect_project.py, validate_events.py and build_event.py.
Pure stdlib, no dependencies.
"""

import json
import os
import re

# --------------------------------------------------------------------------
# Command code tables
# --------------------------------------------------------------------------

COMMAND_NAMES = {
    0: "(end)", 101: "Show Text", 401: "  text", 102: "Show Choices",
    402: "When", 403: "When Cancel", 404: "End Choices", 103: "Input Number",
    104: "Select Item", 105: "Show Scrolling Text", 405: "  scroll text",
    108: "Comment", 408: "  comment", 109: "Skip",
    111: "Conditional Branch", 411: "Else", 412: "End Branch",
    112: "Loop", 413: "Repeat Above", 113: "Break Loop",
    115: "Exit Event Processing", 117: "Common Event",
    118: "Label", 119: "Jump to Label",
    121: "Control Switches", 122: "Control Variables", 123: "Control Self Switch",
    124: "Control Timer", 125: "Change Gold", 126: "Change Items",
    127: "Change Weapons", 128: "Change Armors", 129: "Change Party Member",
    132: "Change Battle BGM", 133: "Change Victory ME", 134: "Change Save Access",
    135: "Change Menu Access", 136: "Change Encounter", 137: "Change Formation Access",
    138: "Change Window Color", 139: "Change Defeat ME", 140: "Change Vehicle BGM",
    201: "Transfer Player", 202: "Set Vehicle Location", 203: "Set Event Location",
    204: "Scroll Map", 205: "Set Movement Route", 505: "  route step",
    206: "Get on/off Vehicle", 211: "Change Transparency", 212: "Show Animation",
    213: "Show Balloon Icon", 214: "Erase Event", 216: "Change Player Followers",
    217: "Gather Followers", 221: "Fadeout Screen", 222: "Fadein Screen",
    223: "Tint Screen", 224: "Flash Screen", 225: "Shake Screen", 230: "Wait",
    231: "Show Picture", 232: "Move Picture", 233: "Rotate Picture",
    234: "Tint Picture", 235: "Erase Picture", 236: "Set Weather Effect",
    241: "Play BGM", 242: "Fadeout BGM", 243: "Save BGM", 244: "Resume BGM",
    245: "Play BGS", 246: "Fadeout BGS", 249: "Play ME", 250: "Play SE",
    251: "Stop SE", 261: "Play Movie", 281: "Change Map Name Display",
    282: "Change Tileset", 283: "Change Battle Background", 284: "Change Parallax",
    285: "Get Location Info", 301: "Battle Processing", 601: "If Win",
    602: "If Escape", 603: "If Lose", 604: "End Battle",
    302: "Shop Processing", 605: "  shop goods", 303: "Name Input Processing",
    311: "Change HP", 312: "Change MP", 313: "Change State", 314: "Recover All",
    315: "Change EXP", 316: "Change Level", 317: "Change Parameter",
    318: "Change Skill", 319: "Change Equipment", 320: "Change Name",
    321: "Change Class", 322: "Change Actor Images", 323: "Change Vehicle Image",
    324: "Change Nickname", 325: "Change Profile", 326: "Change TP",
    331: "Change Enemy HP", 332: "Change Enemy MP", 333: "Change Enemy State",
    334: "Enemy Recover All", 335: "Enemy Appear", 336: "Enemy Transform",
    337: "Show Battle Animation", 339: "Force Action", 340: "Abort Battle",
    342: "Change Enemy TP", 351: "Open Menu Screen", 352: "Open Save Screen",
    353: "Game Over", 354: "Return to Title Screen",
    355: "Script", 655: "  script", 356: "Plugin Command (MV)",
    357: "Plugin Command", 657: "  plugin arg",
}

# Openers -> (continuation codes, terminator code)
BLOCK_STRUCTURE = {
    111: ({411}, 412),
    102: ({402, 403}, 404),
    112: (set(), 413),
    301: ({601, 602, 603}, 604),
}
CONTINUATIONS = {411, 412, 402, 403, 404, 413, 601, 602, 603, 604}

MOVE_ROUTE_NAMES = {
    0: "End", 1: "Move Down", 2: "Move Left", 3: "Move Right", 4: "Move Up",
    5: "Move Lower L", 6: "Move Lower R", 7: "Move Upper L", 8: "Move Upper R",
    9: "Move Random", 10: "Move toward Player", 11: "Move away from Player",
    12: "1 Step Forward", 13: "1 Step Backward", 14: "Jump", 15: "Wait",
    16: "Turn Down", 17: "Turn Left", 18: "Turn Right", 19: "Turn Up",
    20: "Turn 90 R", 21: "Turn 90 L", 22: "Turn 180", 23: "Turn 90 R/L",
    24: "Turn Random", 25: "Turn toward Player", 26: "Turn away from Player",
    27: "Switch ON", 28: "Switch OFF", 29: "Change Speed", 30: "Change Frequency",
    31: "Walk Anime ON", 32: "Walk Anime OFF", 33: "Step Anime ON",
    34: "Step Anime OFF", 35: "Direction Fix ON", 36: "Direction Fix OFF",
    37: "Through ON", 38: "Through OFF", 39: "Transparent ON",
    40: "Transparent OFF", 41: "Change Image", 42: "Change Opacity",
    43: "Change Blend Mode", 44: "Play SE", 45: "Script",
}

TRIGGER_NAMES = {0: "Action Button", 1: "Player Touch", 2: "Event Touch",
                 3: "Autorun", 4: "Parallel", None: "(none)"}
PRIORITY_NAMES = {0: "Below Characters", 1: "Same as Characters", 2: "Above Characters"}
MOVETYPE_NAMES = {0: "Fixed", 1: "Random", 2: "Approach", 3: "Custom"}
CE_TRIGGER_NAMES = {0: "None", 1: "Autorun", 2: "Parallel"}

# Commands that ALWAYS make an interpreter yield at least one frame.
WAITING_CODES = {230, 101, 102, 103, 104, 105, 201, 221, 222, 261, 301, 302,
                 303, 351, 352, 353, 354, 217}

# Commands that yield only when their "wait for completion" flag is set,
# mapped to the index of that flag in `parameters`.
CONDITIONAL_WAIT_CODES = {204: 3, 212: 2, 213: 2, 223: 2, 224: 2, 225: 3,
                          232: 11, 234: 3, 236: 3}


def is_yielding(cmd):
    """True if this command can cost the interpreter at least one frame.

    Covers the always-waiting commands, the ones gated by a 'wait for
    completion' parameter, and Set Movement Route whose route object carries
    wait: true (which sets wait mode 'route').
    """
    code = cmd.get("code")
    if code in WAITING_CODES:
        return True
    params = cmd.get("parameters") or []
    if code == 205:
        route = params[1] if len(params) > 1 and isinstance(params[1], dict) else {}
        return bool(route.get("wait"))
    idx = CONDITIONAL_WAIT_CODES.get(code)
    if idx is not None and len(params) > idx:
        return bool(params[idx])
    return False


def route_enables_through(route):
    """True if the route turns Through ON before any movement step.

    A route that does this cannot be blocked, so it carries no stall risk
    even when it waits for completion and is not skippable.
    """
    movement = {1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14}
    for step in (route.get("list") or []):
        code = step.get("code")
        if code == 37:          # Through ON
            return True
        if code in movement:
            return False
    return False


# --------------------------------------------------------------------------
# Project loading
# --------------------------------------------------------------------------

class Project:
    """A loaded RPG Maker MZ/MV project."""

    def __init__(self, root):
        self.root = os.path.abspath(root)
        self.data_dir = self._find_data_dir()
        if self.data_dir is None:
            raise SystemExit(
                "No RPG Maker data folder found under %s\n"
                "Expected <root>/data/System.json or <root>/www/data/System.json" % self.root)
        self.js_dir = os.path.join(os.path.dirname(self.data_dir), "js")
        self.engine = self._detect_engine()
        self.system = self._load("System.json") or {}
        self.common_events = self._load("CommonEvents.json") or []
        self.map_infos = self._load("MapInfos.json") or []
        self.troops = self._load("Troops.json") or []
        self._maps = {}

    # -- discovery ---------------------------------------------------------

    def _find_data_dir(self):
        for cand in (os.path.join(self.root, "data"),
                     os.path.join(self.root, "www", "data")):
            if os.path.isfile(os.path.join(cand, "System.json")):
                return cand
        # Fall back to a shallow search.
        for dirpath, dirnames, filenames in os.walk(self.root):
            if "System.json" in filenames and os.path.basename(dirpath) == "data":
                return dirpath
            if dirpath.count(os.sep) - self.root.count(os.sep) > 3:
                dirnames[:] = []
        return None

    def _detect_engine(self):
        if os.path.isfile(os.path.join(self.js_dir, "rmmz_objects.js")):
            return "MZ"
        if os.path.isfile(os.path.join(self.js_dir, "rpg_objects.js")):
            return "MV"
        return "MZ?"  # data-only checkout; assume MZ but say so

    def _load(self, name):
        path = os.path.join(self.data_dir, name)
        if not os.path.isfile(path):
            return None
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)

    # -- maps --------------------------------------------------------------

    def map_ids(self):
        ids = []
        for name in os.listdir(self.data_dir):
            m = re.fullmatch(r"Map(\d{3,})\.json", name)
            if m:
                ids.append(int(m.group(1)))
        return sorted(ids)

    def map_name(self, map_id):
        if isinstance(self.map_infos, list) and map_id < len(self.map_infos):
            info = self.map_infos[map_id]
            if info:
                return info.get("name", "")
        return ""

    def load_map(self, map_id):
        if map_id not in self._maps:
            self._maps[map_id] = self._load("Map%03d.json" % map_id)
        return self._maps[map_id]

    # -- names -------------------------------------------------------------

    def switch_name(self, sid):
        arr = self.system.get("switches") or []
        return arr[sid] if 0 < sid < len(arr) else None

    def variable_name(self, vid):
        arr = self.system.get("variables") or []
        return arr[vid] if 0 < vid < len(arr) else None

    def switch_count(self):
        return len(self.system.get("switches") or [])

    def variable_count(self):
        return len(self.system.get("variables") or [])

    def common_event(self, ce_id):
        if isinstance(self.common_events, list) and 0 < ce_id < len(self.common_events):
            return self.common_events[ce_id]
        return None

    def plugins(self):
        """Parse js/plugins.js into a list of dicts. Returns [] if unavailable."""
        path = os.path.join(self.js_dir, "plugins.js")
        if not os.path.isfile(path):
            return []
        with open(path, encoding="utf-8") as fh:
            text = fh.read()
        start, end = text.find("["), text.rfind("]")
        if start < 0 or end < 0:
            return []
        try:
            return json.loads(text[start:end + 1])
        except (ValueError, TypeError):
            return []


# --------------------------------------------------------------------------
# Event list iteration
# --------------------------------------------------------------------------

class ListRef:
    """Identifies one command list within a project."""

    def __init__(self, kind, list_, map_id=None, event_id=None, page_index=None,
                 ce_id=None, troop_id=None, name=""):
        self.kind = kind                # "map" | "common" | "troop"
        self.list = list_ or []
        self.map_id = map_id
        self.event_id = event_id
        self.page_index = page_index
        self.ce_id = ce_id
        self.troop_id = troop_id
        self.name = name

    def label(self):
        if self.kind == "map":
            return "Map%03d ev%d(%s) page%d" % (
                self.map_id, self.event_id, self.name or "?", (self.page_index or 0) + 1)
        if self.kind == "common":
            return "CommonEvent %d (%s)" % (self.ce_id, self.name or "?")
        return "Troop %d (%s) page%d" % (self.troop_id, self.name or "?",
                                         (self.page_index or 0) + 1)


def iter_map_events(project, map_id):
    """Yield (event_dict, page_index, page_dict) for a map."""
    data = project.load_map(map_id)
    if not data:
        return
    for ev in (data.get("events") or []):
        if not ev:
            continue
        for pi, page in enumerate(ev.get("pages") or []):
            yield ev, pi, page


def iter_all_lists(project, map_ids=None):
    """Yield ListRef for every command list in the project."""
    for ce in (project.common_events or []):
        if ce:
            yield ListRef("common", ce.get("list"), ce_id=ce.get("id"),
                          name=ce.get("name", ""))
    for tr in (project.troops or []):
        if tr:
            for pi, page in enumerate(tr.get("pages") or []):
                yield ListRef("troop", page.get("list"), troop_id=tr.get("id"),
                              page_index=pi, name=tr.get("name", ""))
    for mid in (map_ids if map_ids is not None else project.map_ids()):
        for ev, pi, page in iter_map_events(project, mid):
            yield ListRef("map", page.get("list"), map_id=mid, event_id=ev.get("id"),
                          page_index=pi, name=ev.get("name", ""))


# --------------------------------------------------------------------------
# Pretty printing
# --------------------------------------------------------------------------

def _short(value, limit=70):
    text = json.dumps(value, ensure_ascii=False)
    return text if len(text) <= limit else text[:limit - 1] + "…"


def describe_command(cmd, project=None):
    """One readable line for a single event command."""
    code = cmd.get("code", 0)
    params = cmd.get("parameters", []) or []
    name = COMMAND_NAMES.get(code, "Unknown(%d)" % code)

    def sw(i):
        n = project.switch_name(i) if project else None
        return "%d%s" % (i, ":%s" % n if n else "")

    def va(i):
        n = project.variable_name(i) if project else None
        return "%d%s" % (i, ":%s" % n if n else "")

    try:
        if code in (401, 405, 408, 655, 657):
            return '%s "%s"' % (name, params[0])
        if code == 101:
            speaker = params[4] if len(params) > 4 and params[4] else ""
            return "Show Text%s" % (" [%s]" % speaker if speaker else "")
        if code == 102:
            return "Show Choices %s (cancel=%s)" % (_short(params[0]), params[1])
        if code == 402:
            return 'When "%s"' % params[1]
        if code == 108:
            return 'Comment "%s"' % params[0]
        if code == 121:
            rng = sw(params[0]) if params[0] == params[1] else "%d..%d" % (params[0], params[1])
            return "Control Switches [%s] = %s" % (rng, "ON" if params[2] == 0 else "OFF")
        if code == 122:
            rng = va(params[0]) if params[0] == params[1] else "%d..%d" % (params[0], params[1])
            op = ["=", "+=", "-=", "*=", "/=", "%="][params[2]] if params[2] < 6 else "?"
            operand = params[3]
            if operand == 0:
                val = str(params[4])
            elif operand == 1:
                val = "Var[%s]" % va(params[4])
            elif operand == 2:
                val = "Random %s..%s" % (params[4], params[5])
            elif operand == 3:
                val = "GameData(type=%s,%s,%s)" % (params[4], params[5],
                                                   params[6] if len(params) > 6 else "")
            else:
                val = "Script(%s)" % _short(params[4], 40)
            return "Control Variables [%s] %s %s" % (rng, op, val)
        if code == 123:
            return "Control Self Switch %s = %s" % (params[0], "ON" if params[1] == 0 else "OFF")
        if code == 111:
            return "Conditional Branch: %s" % _describe_condition(params, sw, va)
        if code == 117:
            ce = project.common_event(params[0]) if project else None
            return "Common Event %d%s" % (params[0], " (%s)" % ce["name"] if ce else "")
        if code in (118, 119):
            return '%s "%s"' % (name, params[0])
        if code == 201:
            return "Transfer Player -> map %s (%s,%s)" % (params[1], params[2], params[3])
        if code == 205:
            route = params[1] if len(params) > 1 and isinstance(params[1], dict) else {}
            steps = [MOVE_ROUTE_NAMES.get(s.get("code"), str(s.get("code")))
                     for s in (route.get("list") or []) if s.get("code")]
            flags = "".join(f for f, k in (("W", "wait"), ("R", "repeat"), ("S", "skippable"))
                            if route.get(k))
            return "Set Movement Route %s [%s]: %s" % (
                _char_name(params[0]), flags or "-", ", ".join(steps) or "(empty)")
        if code == 505:
            step = params[0] if params else {}
            return "  route step: %s" % MOVE_ROUTE_NAMES.get(step.get("code"), step.get("code"))
        if code in (212, 213):
            return "%s on %s (id %s)%s" % (name, _char_name(params[0]), params[1],
                                           " [wait]" if len(params) > 2 and params[2] else "")
        if code == 230:
            return "Wait %s frames" % params[0]
        if code == 250:
            return "Play SE: %s" % (params[0] or {}).get("name", "?")
        if code == 285:
            kinds = {0: "Terrain Tag", 1: "Event ID", 2: "Tile1", 3: "Tile2",
                     4: "Tile3", 5: "Tile4"}
            return "Get Location Info [%s] = %s" % (
                va(params[0]), kinds.get(params[1], "Region ID"))
        if code == 355 or code == 655:
            return "Script: %s" % _short(params[0], 60)
        if code == 357:
            return "Plugin Command %s -> %s %s" % (
                params[0], params[1], _short(params[3] if len(params) > 3 else {}, 40))
        if code == 356:
            return "Plugin Command (MV) %s" % _short(params[0], 60)
    except (IndexError, TypeError, KeyError):
        pass
    return "%s %s" % (name, _short(params, 60)) if params else name


def _char_name(char_id):
    if char_id == -1:
        return "Player"
    if char_id == 0:
        return "This Event"
    return "Event %s" % char_id


def _describe_condition(params, sw, va):
    kind = params[0]
    if kind == 0:
        return "Switch [%s] is %s" % (sw(params[1]), "ON" if params[2] == 0 else "OFF")
    if kind == 1:
        ops = ["==", ">=", "<=", ">", "<", "!="]
        rhs = str(params[3]) if params[2] == 0 else "Var[%s]" % va(params[3])
        return "Var [%s] %s %s" % (va(params[1]), ops[params[4]] if params[4] < 6 else "?", rhs)
    if kind == 2:
        return "Self Switch %s is %s" % (params[1], "ON" if params[2] == 0 else "OFF")
    if kind == 3:
        return "Timer %s %s sec" % (">=" if params[2] == 0 else "<=", params[1])
    if kind == 4:
        return "Actor %s ..." % params[1]
    if kind == 6:
        return "%s is facing %s" % (_char_name(params[1]), params[2])
    if kind == 7:
        return "Gold %s %s" % ([">=", "<=", "<"][params[2]], params[1])
    if kind == 8:
        return "Party has item %s" % params[1]
    if kind == 11:
        return "Button %s" % params[1]
    if kind == 12:
        return "Script: %s" % _short(params[1], 50)
    return "type %s %s" % (kind, _short(params[1:], 40))


def format_list(list_, project=None, indent_width=2):
    """Render a command list as readable pseudo-code lines."""
    out = []
    for i, cmd in enumerate(list_ or []):
        pad = " " * (indent_width * (cmd.get("indent", 0) or 0))
        out.append("%4d | %s%s" % (i, pad, describe_command(cmd, project)))
    return out


def describe_conditions(cond, project=None):
    """Human-readable page conditions."""
    parts = []
    if cond.get("switch1Valid"):
        n = project.switch_name(cond["switch1Id"]) if project else None
        parts.append("SW %d%s ON" % (cond["switch1Id"], ":%s" % n if n else ""))
    if cond.get("switch2Valid"):
        n = project.switch_name(cond["switch2Id"]) if project else None
        parts.append("SW %d%s ON" % (cond["switch2Id"], ":%s" % n if n else ""))
    if cond.get("variableValid"):
        n = project.variable_name(cond["variableId"]) if project else None
        parts.append("VAR %d%s >= %s" % (cond["variableId"], ":%s" % n if n else "",
                                         cond.get("variableValue")))
    if cond.get("selfSwitchValid"):
        parts.append("SelfSW %s ON" % cond.get("selfSwitchCh"))
    if cond.get("itemValid"):
        parts.append("has item %s" % cond.get("itemId"))
    if cond.get("actorValid"):
        parts.append("actor %s in party" % cond.get("actorId"))
    return " AND ".join(parts) if parts else "(always)"
