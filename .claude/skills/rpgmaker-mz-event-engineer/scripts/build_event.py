#!/usr/bin/env python3
"""Correct-by-construction builders for RPG Maker MZ/MV event data.

Hand-writing event JSON gets the fiddly parts wrong: block terminators, the
per-block `code 0` markers, `indent` bookkeeping, and the mirror `505` lines
after a Set Movement Route. Use these helpers instead.

Use as a library:

    import build_event as B

    lst = (B.CommandList()
           .comment("EV_Chest -- Action Button. Self Switch A marks it opened.")
           .play_se("Chest1")
           .move_route(0, [B.route.change_image("!Chest", 1)], wait=True)
           .wait(10)
           .change_item(7, 1)
           .text("Potion obtained!", speaker="")
           .self_switch("A", True)
           .build())

    page = B.new_page(trigger=0, priority=1, character="!Chest", char_index=0, list=lst)
    event = B.new_event(1, "EV_Chest", 8, 6, [page, B.new_page(
        conditions={"selfSwitchValid": True, "selfSwitchCh": "A"},
        character="!Chest", char_index=0, pattern=2)])

Or run it directly for a self-test / demo:

    python3 build_event.py --demo
"""

import copy
import json


# ---------------------------------------------------------------------------
# Move route steps
# ---------------------------------------------------------------------------

class _Route:
    """Move-route step constructors. `parameters` is omitted when empty, as
    the editor does."""

    @staticmethod
    def _s(code, *params):
        step = {"code": code}
        if params:
            step["parameters"] = list(params)
        return step

    def move_down(self):            return self._s(1)
    def move_left(self):            return self._s(2)
    def move_right(self):           return self._s(3)
    def move_up(self):              return self._s(4)
    def move_lower_left(self):      return self._s(5)
    def move_lower_right(self):     return self._s(6)
    def move_upper_left(self):      return self._s(7)
    def move_upper_right(self):     return self._s(8)
    def move_random(self):          return self._s(9)
    def move_toward_player(self):   return self._s(10)
    def move_away_from_player(self):return self._s(11)
    def move_forward(self):         return self._s(12)
    def move_backward(self):        return self._s(13)
    def jump(self, dx, dy):         return self._s(14, dx, dy)
    def wait(self, frames):         return self._s(15, frames)
    def turn_down(self):            return self._s(16)
    def turn_left(self):            return self._s(17)
    def turn_right(self):           return self._s(18)
    def turn_up(self):              return self._s(19)
    def turn_90_right(self):        return self._s(20)
    def turn_90_left(self):         return self._s(21)
    def turn_180(self):             return self._s(22)
    def turn_90_random(self):       return self._s(23)
    def turn_random(self):          return self._s(24)
    def turn_toward_player(self):   return self._s(25)
    def turn_away_from_player(self):return self._s(26)
    def switch_on(self, sid):       return self._s(27, sid)
    def switch_off(self, sid):      return self._s(28, sid)
    def change_speed(self, s):      return self._s(29, s)
    def change_frequency(self, f):  return self._s(30, f)
    def walk_anime(self, on):       return self._s(31 if on else 32)
    def step_anime(self, on):       return self._s(33 if on else 34)
    def direction_fix(self, on):    return self._s(35 if on else 36)
    def through(self, on):          return self._s(37 if on else 38)
    def transparent(self, on):      return self._s(39 if on else 40)
    def change_image(self, name, index=0):  return self._s(41, name, index)
    def change_opacity(self, o):    return self._s(42, o)
    def change_blend_mode(self, m): return self._s(43, m)
    def play_se(self, name, volume=90, pitch=100, pan=0):
        return self._s(44, {"name": name, "volume": volume, "pitch": pitch, "pan": pan})
    def script(self, code):         return self._s(45, code)

    def move(self, direction, times=1):
        """direction: 2 down, 4 left, 6 right, 8 up."""
        code = {2: 1, 4: 2, 6: 3, 8: 4}[direction]
        return [self._s(code) for _ in range(times)]

    def turn(self, direction):
        return self._s({2: 16, 4: 17, 6: 18, 8: 19}[direction])


route = _Route()


def make_route(steps, wait=False, repeat=False, skippable=False):
    """Build a move-route object. Flattens nested lists from route.move()."""
    flat = []
    for step in steps:
        flat.extend(step if isinstance(step, list) else [step])
    if not flat or flat[-1].get("code") != 0:
        flat.append({"code": 0})
    return {"list": flat, "repeat": bool(repeat),
            "skippable": bool(skippable), "wait": bool(wait)}


# ---------------------------------------------------------------------------
# Command list builder
# ---------------------------------------------------------------------------

class CommandList:
    """Builds a valid event command list.

    Block helpers (`if_switch`, `choices`, `loop`, ...) open a block; call
    `end()` to close it, which emits the block's `code 0` marker and its
    terminator at the right indents. `build()` closes any still-open blocks
    and appends the final `{code:0, indent:0}` terminator.
    """

    def __init__(self):
        self._cmds = []
        self._indent = 0
        self._stack = []   # (opener_code, opener_indent)

    # -- internals ---------------------------------------------------------

    def _add(self, code, params=None, indent=None):
        self._cmds.append({"code": code,
                           "indent": self._indent if indent is None else indent,
                           "parameters": [] if params is None else list(params)})
        return self

    def _open(self, code, params):
        self._stack.append((code, self._indent))
        self._add(code, params)
        self._indent += 1
        return self

    def raw(self, code, params=None, indent=None):
        """Escape hatch for a command with no helper."""
        return self._add(code, params, indent)

    # -- messages ----------------------------------------------------------

    def text(self, *lines, face="", face_index=0, background=0, position=2, speaker=""):
        """Show Text. Each argument is one line; MZ shows 4 per window."""
        self._add(101, [face, face_index, background, position, speaker])
        for line in lines:
            self._add(401, [line])
        return self

    def scrolling_text(self, *lines, speed=2, no_fast_forward=False):
        self._add(105, [speed, no_fast_forward])
        for line in lines:
            self._add(405, [line])
        return self

    def comment(self, *lines):
        if not lines:
            return self
        self._add(108, [lines[0]])
        for line in lines[1:]:
            self._add(408, [line])
        return self

    def input_number(self, variable_id, digits=2):
        return self._add(103, [variable_id, digits])

    # -- flow --------------------------------------------------------------

    def choices(self, options, cancel_type=-2, default_type=0, position=2, background=0):
        """Open a Show Choices block. Follow with .when(i) / .when_cancel()."""
        self._stack.append((102, self._indent))
        self._add(102, [list(options), cancel_type, default_type, position, background])
        self._choice_names = list(options)
        return self

    def when(self, index):
        """Start (or switch to) a choice branch. Closes the previous branch."""
        self._close_branch_body()
        name = getattr(self, "_choice_names", [])
        self._add(402, [index, name[index] if index < len(name) else ""],
                  indent=self._stack[-1][1])
        self._indent = self._stack[-1][1] + 1
        return self

    def when_cancel(self):
        self._close_branch_body()
        self._add(403, [], indent=self._stack[-1][1])
        self._indent = self._stack[-1][1] + 1
        return self

    def _close_branch_body(self):
        """Emit the `code 0` marker ending the current branch body, if any."""
        opener_indent = self._stack[-1][1]
        if self._indent > opener_indent:
            self._add(0, [], indent=opener_indent + 1)

    def if_switch(self, switch_id, on=True):
        return self._open(111, [0, switch_id, 0 if on else 1])

    def if_variable(self, variable_id, op, value, value_is_variable=False):
        """op: '==', '>=', '<=', '>', '<', '!='"""
        ops = {"==": 0, ">=": 1, "<=": 2, ">": 3, "<": 4, "!=": 5}
        return self._open(111, [1, variable_id, 1 if value_is_variable else 0,
                                value, ops[op]])

    def if_self_switch(self, ch="A", on=True):
        return self._open(111, [2, ch, 0 if on else 1])

    def if_item(self, item_id):
        return self._open(111, [8, item_id])

    def if_actor_in_party(self, actor_id):
        return self._open(111, [4, actor_id, 0, 0])

    def if_facing(self, char_id, direction):
        return self._open(111, [6, char_id, direction])

    def if_gold(self, amount, op=">="):
        return self._open(111, [7, amount, {">=": 0, "<=": 1, "<": 2}[op]])

    def if_script(self, expression):
        return self._open(111, [12, expression])

    def else_(self):
        opener_code, opener_indent = self._stack[-1]
        if opener_code != 111:
            raise ValueError("else_() outside a Conditional Branch")
        self._add(0, [], indent=opener_indent + 1)
        self._add(411, [], indent=opener_indent)
        self._indent = opener_indent + 1
        return self

    def loop(self):
        return self._open(112, [])

    def break_loop(self):
        return self._add(113)

    def exit_event(self):
        return self._add(115)

    def end(self):
        """Close the innermost open block."""
        if not self._stack:
            raise ValueError("end() with no open block")
        opener_code, opener_indent = self._stack.pop()
        terminator = {111: 412, 102: 404, 112: 413, 301: 604}[opener_code]
        if opener_code == 102:
            self._indent = opener_indent + 1
            self._close_branch_body_at(opener_indent)
        else:
            self._add(0, [], indent=opener_indent + 1)
        self._add(terminator, [], indent=opener_indent)
        self._indent = opener_indent
        return self

    def _close_branch_body_at(self, opener_indent):
        if self._cmds and not (self._cmds[-1]["code"] == 0
                               and self._cmds[-1]["indent"] == opener_indent + 1):
            self._add(0, [], indent=opener_indent + 1)

    def label(self, name):
        return self._add(118, [name])

    def jump_to_label(self, name):
        return self._add(119, [name])

    def common_event(self, ce_id):
        return self._add(117, [ce_id])

    # -- state -------------------------------------------------------------

    def switch(self, switch_id, on=True, end_id=None):
        return self._add(121, [switch_id, end_id or switch_id, 0 if on else 1])

    def self_switch(self, ch="A", on=True):
        return self._add(123, [ch, 0 if on else 1])

    def variable(self, variable_id, value, op="=", end_id=None):
        ops = {"=": 0, "+=": 1, "-=": 2, "*=": 3, "/=": 4, "%=": 5}
        return self._add(122, [variable_id, end_id or variable_id, ops[op], 0, value])

    def variable_from_variable(self, variable_id, source_id, op="="):
        ops = {"=": 0, "+=": 1, "-=": 2, "*=": 3, "/=": 4, "%=": 5}
        return self._add(122, [variable_id, variable_id, ops[op], 1, source_id])

    def variable_random(self, variable_id, low, high, op="="):
        ops = {"=": 0, "+=": 1, "-=": 2, "*=": 3, "/=": 4, "%=": 5}
        return self._add(122, [variable_id, variable_id, ops[op], 2, low, high])

    def variable_game_data(self, variable_id, kind, p1, p2=0, op="="):
        """kind 5 = Character (p1: -1 player / 0 this event / n event n;
        p2: 0 Map X, 1 Map Y, 2 Direction). kind 7 = Other (p1: 0 Map ID...)."""
        ops = {"=": 0, "+=": 1, "-=": 2, "*=": 3, "/=": 4, "%=": 5}
        return self._add(122, [variable_id, variable_id, ops[op], 3, kind, p1, p2])

    def timer(self, seconds=None):
        return self._add(124, [0, seconds] if seconds is not None else [1, 0])

    # -- world -------------------------------------------------------------

    def wait(self, frames):
        return self._add(230, [frames])

    def play_se(self, name, volume=90, pitch=100, pan=0):
        return self._add(250, [{"name": name, "volume": volume, "pitch": pitch, "pan": pan}])

    def play_me(self, name, volume=90, pitch=100, pan=0):
        return self._add(249, [{"name": name, "volume": volume, "pitch": pitch, "pan": pan}])

    def play_bgm(self, name, volume=90, pitch=100, pan=0):
        return self._add(241, [{"name": name, "volume": volume, "pitch": pitch, "pan": pan}])

    def save_bgm(self):     return self._add(243)
    def resume_bgm(self):   return self._add(244)

    def balloon(self, char_id=0, balloon_id=1, wait=True):
        return self._add(213, [char_id, balloon_id, wait])

    def animation(self, char_id=0, animation_id=1, wait=True):
        return self._add(212, [char_id, animation_id, wait])

    def erase_event(self):
        return self._add(214)

    def transfer(self, map_id, x, y, direction=0, fade=0):
        return self._add(201, [0, map_id, x, y, direction, fade])

    def set_event_location(self, char_id, x, y, direction=0):
        return self._add(203, [char_id, 0, x, y, direction])

    def scroll_map(self, direction, distance, speed=4, wait=True):
        return self._add(204, [direction, distance, speed, wait])

    def get_location_info(self, variable_id, info_type=6, char_id=None, x=0, y=0):
        """info_type: 0 terrain tag, 1 event id, 2-5 tile ids, 6 region id.
        char_id given -> designation 2 (MZ only)."""
        if char_id is not None:
            return self._add(285, [variable_id, info_type, 2, char_id, 0])
        return self._add(285, [variable_id, info_type, 0, x, y])

    def fadeout(self):  return self._add(221)
    def fadein(self):   return self._add(222)

    def tint(self, r=0, g=0, b=0, gray=0, duration=60, wait=True):
        return self._add(223, [[r, g, b, gray], duration, wait])

    def flash(self, r=255, g=255, b=255, intensity=170, duration=30, wait=True):
        return self._add(224, [[r, g, b, intensity], duration, wait])

    def shake(self, power=5, speed=5, duration=30, wait=True):
        return self._add(225, [power, speed, duration, wait])

    def change_item(self, item_id, amount):
        return self._add(126, [item_id, 0 if amount >= 0 else 1, 0, abs(amount)])

    def change_gold(self, amount):
        return self._add(125, [0 if amount >= 0 else 1, 0, abs(amount)])

    def change_followers(self, show):
        return self._add(216, [0 if show else 1])

    def gather_followers(self):
        return self._add(217)

    def script(self, *lines):
        if not lines:
            return self
        self._add(355, [lines[0]])
        for line in lines[1:]:
            self._add(655, [line])
        return self

    def plugin_command(self, plugin_name, command_name, args=None, display_name=""):
        """MZ (357). Verify the names against js/plugins/<plugin_name>.js first."""
        args = args or {}
        self._add(357, [plugin_name, command_name, display_name or command_name, args])
        for key, value in args.items():
            self._add(657, ["%s = %s" % (key, value)])
        return self

    def move_route(self, char_id, steps, wait=False, repeat=False, skippable=False):
        """Set Movement Route, automatically emitting the mirror 505 lines."""
        obj = make_route(steps, wait=wait, repeat=repeat, skippable=skippable)
        self._add(205, [char_id, obj])
        for step in obj["list"]:
            if step.get("code") != 0:
                self._add(505, [copy.deepcopy(step)])
        return self

    # -- output ------------------------------------------------------------

    def build(self):
        while self._stack:
            self.end()
        cmds = list(self._cmds)
        if not cmds or cmds[-1]["code"] != 0 or cmds[-1]["indent"] != 0:
            cmds.append({"code": 0, "indent": 0, "parameters": []})
        return cmds


# ---------------------------------------------------------------------------
# Page and event scaffolding
# ---------------------------------------------------------------------------

DEFAULT_CONDITIONS = {
    "actorId": 1, "actorValid": False, "itemId": 1, "itemValid": False,
    "selfSwitchCh": "A", "selfSwitchValid": False,
    "switch1Id": 1, "switch1Valid": False, "switch2Id": 1, "switch2Valid": False,
    "variableId": 1, "variableValid": False, "variableValue": 0,
}
EMPTY_ROUTE = {"list": [{"code": 0, "parameters": []}],
               "repeat": True, "skippable": False, "wait": False}


def new_page(list=None, conditions=None, character="", char_index=0, direction=2,
             pattern=1, tile_id=0, trigger=0, priority=1, move_type=0, move_speed=3,
             move_frequency=3, walk_anime=True, step_anime=False, direction_fix=False,
             through=False, move_route=None):
    """Build a complete, valid event page. All 13 keys are always written."""
    cond = dict(DEFAULT_CONDITIONS)
    if conditions:
        cond.update(conditions)
    return {
        "conditions": cond,
        "directionFix": direction_fix,
        "image": {"characterIndex": char_index, "characterName": character,
                  "direction": direction, "pattern": pattern, "tileId": tile_id},
        "list": list if list is not None else [{"code": 0, "indent": 0, "parameters": []}],
        "moveFrequency": move_frequency,
        "moveRoute": move_route or copy.deepcopy(EMPTY_ROUTE),
        "moveSpeed": move_speed,
        "moveType": move_type,
        "priorityType": priority,
        "stepAnime": step_anime,
        "through": through,
        "trigger": trigger,
        "walkAnime": walk_anime,
    }


def new_event(event_id, name, x, y, pages, note=""):
    return {"id": event_id, "name": name, "note": note, "x": x, "y": y, "pages": pages}


def new_common_event(ce_id, name, list, trigger=0, switch_id=1):
    return {"id": ce_id, "name": name, "trigger": trigger,
            "switchId": switch_id, "list": list}


def next_free_event_id(map_data):
    """Lowest usable event ID: fills a null hole, else appends."""
    events = map_data.get("events") or [None]
    for i in range(1, len(events)):
        if events[i] is None:
            return i
    return len(events) if len(events) > 1 else 1


def add_event(map_data, event):
    """Insert an event into map data at its own id, padding with nulls."""
    events = map_data.setdefault("events", [None])
    while len(events) <= event["id"]:
        events.append(None)
    events[event["id"]] = event
    return map_data


# ---------------------------------------------------------------------------

def _demo():
    chest = (CommandList()
             .comment("EV_Chest - Action Button, Same as Characters.",
                      "Entry: Self Switch A off.  Exit: Self Switch A on (page 2).")
             .play_se("Chest1")
             .move_route(0, [route.change_image("!Chest", 1)], wait=True)
             .wait(10)
             .change_item(7, 1)
             .play_me("Item")
             .text("\\}Potion obtained!\\{")
             .self_switch("A", True)
             .build())

    guard = (CommandList()
             .comment("Sensor: gated parallel. Sets Self Switch A (CHASE) when spotted.")
             .common_event(12)                       # CE_Calc_PlayerDistance
             .if_variable(91, "<=", 5)
             .get_location_info(92, 6, char_id=0)
             .get_location_info(93, 6, char_id=-1)
             .if_variable(92, "==", 93, value_is_variable=True)
             .play_se("Flash1")
             .balloon(0, 1, wait=True)
             .self_switch("A", True)
             .end()
             .end()
             .wait(10)
             .build())

    menu = (CommandList()
            .text("Rest for 10 gold?")
            .choices(["Rest", "Leave"], cancel_type=1)
            .when(0)
            .if_gold(10, ">=")
            .change_gold(-10)
            .fadeout().wait(60).fadein()
            .else_()
            .text("You can't afford it.")
            .end()
            .when(1)
            .end()
            .build())

    for name, lst in (("chest", chest), ("guard sensor", guard), ("inn menu", menu)):
        print("### %s" % name)
        for i, c in enumerate(lst):
            print("%4d | %s%s %s" % (i, "  " * c["indent"], c["code"],
                                     json.dumps(c["parameters"], ensure_ascii=False)[:70]))
        print()


if __name__ == "__main__":
    import sys
    if "--demo" in sys.argv:
        _demo()
    else:
        print(__doc__)
