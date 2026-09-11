#!/usr/bin/env python3
"""Static analyser ("linter") for RPG Maker MZ/MV event data.

Reports structural corruption, dangling references, freeze risks and style
issues across every map event, common event and troop event in a project.

    python3 validate_events.py <project-root>
    python3 validate_events.py <project-root> --map 12
    python3 validate_events.py <project-root> --level error
    python3 validate_events.py <project-root> --quiet     # exit code only

Exit code 1 if any ERROR was found, else 0.

Severity levels
    ERROR  a definite defect: corrupt structure, dangling reference, or a
           construct that will freeze or silently do nothing.
    WARN   a probable defect that depends on intent - review it.
    INFO   a style or maintainability suggestion. Never auto-"fix" these.
"""

import argparse
import collections
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rpgmz  # noqa: E402

LEVELS = {"error": 0, "warn": 1, "info": 2}


class Report:
    def __init__(self):
        self.items = []

    def add(self, level, where, code, message):
        self.items.append((level, where, code, message))

    def error(self, w, c, m):
        self.add("ERROR", w, c, m)

    def warn(self, w, c, m):
        self.add("WARN", w, c, m)

    def info(self, w, c, m):
        self.add("INFO", w, c, m)

    def counts(self):
        return collections.Counter(i[0] for i in self.items)


# ---------------------------------------------------------------------------
# List-structure checks
# ---------------------------------------------------------------------------

def check_structure(rep, ref):
    """Terminators, block balance, indent sanity, 205/505 mirrors."""
    lst = ref.list
    where = ref.label()
    if not lst:
        rep.error(where, "empty-list", "Command list is completely empty; "
                                       "RPG Maker expects at least [{code:0,indent:0}].")
        return

    last = lst[-1]
    if last.get("code") != 0 or (last.get("indent") or 0) != 0:
        rep.error(where, "no-terminator",
                  "List does not end with {code:0, indent:0}. The editor may fail to "
                  "load or re-save this event.")

    # indent sanity
    prev = 0
    for i, cmd in enumerate(lst):
        ind = cmd.get("indent")
        if ind is None or not isinstance(ind, int) or ind < 0:
            rep.error(where, "bad-indent", "Command %d has indent %r." % (i, ind))
            continue
        if ind > prev + 1:
            rep.error(where, "indent-jump",
                      "Command %d jumps from indent %d to %d. Branch skipping "
                      "(skipBranch) relies on indent; control flow will be wrong." % (i, prev, ind))
        prev = ind

    # block balance
    stack = []
    for i, cmd in enumerate(lst):
        code, ind = cmd.get("code"), cmd.get("indent") or 0
        if code in rpgmz.BLOCK_STRUCTURE:
            stack.append((code, ind, i))
        elif code in rpgmz.CONTINUATIONS:
            if not stack:
                rep.error(where, "orphan-block",
                          "Command %d is %s with no matching opener."
                          % (i, rpgmz.COMMAND_NAMES.get(code, code)))
                continue
            opener, oind, oi = stack[-1]
            conts, term = rpgmz.BLOCK_STRUCTURE[opener]
            if code == term:
                if ind != oind:
                    rep.error(where, "block-indent",
                              "Terminator %s at command %d has indent %d but its opener "
                              "at %d has indent %d."
                              % (rpgmz.COMMAND_NAMES.get(code, code), i, ind, oi, oind))
                stack.pop()
            elif code in conts:
                if ind != oind:
                    rep.error(where, "block-indent",
                              "%s at command %d has indent %d but its opener at %d has "
                              "indent %d."
                              % (rpgmz.COMMAND_NAMES.get(code, code), i, ind, oi, oind))
            else:
                rep.error(where, "block-mismatch",
                          "%s at command %d does not belong to the open %s block."
                          % (rpgmz.COMMAND_NAMES.get(code, code), i,
                             rpgmz.COMMAND_NAMES.get(opener, opener)))
    for opener, oind, oi in stack:
        rep.error(where, "unclosed-block",
                  "%s opened at command %d is never closed (missing %s)."
                  % (rpgmz.COMMAND_NAMES.get(opener, opener), oi,
                     rpgmz.COMMAND_NAMES.get(rpgmz.BLOCK_STRUCTURE[opener][1])))

    # 205 -> 505 mirrors
    i = 0
    while i < len(lst):
        if lst[i].get("code") == 205:
            params = lst[i].get("parameters") or []
            route = params[1] if len(params) > 1 and isinstance(params[1], dict) else {}
            steps = [s for s in (route.get("list") or []) if s.get("code") != 0]
            mirrors = 0
            j = i + 1
            while j < len(lst) and lst[j].get("code") == 505:
                mirrors += 1
                j += 1
            if mirrors != len(steps):
                rep.error(where, "route-mirror",
                          "Set Movement Route at command %d has %d route step(s) but %d "
                          "mirror 505 line(s). The editor will show an empty/incorrect route "
                          "and will lose the route on the next save."
                          % (i, len(steps), mirrors))
            if route.get("repeat") and route.get("wait"):
                rep.error(where, "route-repeat-wait",
                          "Set Movement Route at command %d is both repeating and "
                          "'Wait for Completion'. A repeating route never ends, so the "
                          "event waits forever." % i)
            elif (route.get("wait") and not route.get("skippable")
                  and not rpgmz.route_enables_through(route)):
                movement = {1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14}
                if any(s.get("code") in movement for s in steps):
                    rep.warn(where, "route-stall-risk",
                             "Set Movement Route at command %d waits for completion but is "
                             "not skippable. If any step is blocked the index never advances "
                             "and the game softlocks. Use skippable, or Through ON, or clear "
                             "the path." % i)
            i = j
            continue
        i += 1

    # labels
    labels = {c["parameters"][0] for c in lst
              if c.get("code") == 118 and c.get("parameters")}
    for i, cmd in enumerate(lst):
        if cmd.get("code") == 119 and cmd.get("parameters"):
            if cmd["parameters"][0] not in labels:
                rep.error(where, "missing-label",
                          "Jump to Label \"%s\" at command %d has no matching Label."
                          % (cmd["parameters"][0], i))

    # loops without an escape
    for i, cmd in enumerate(lst):
        if cmd.get("code") != 112:
            continue
        depth, has_wait, has_break, j = 0, False, False, i + 1
        while j < len(lst):
            c = lst[j].get("code")
            if c == 112:
                depth += 1
            elif c == 413:
                if depth == 0:
                    break
                depth -= 1
            elif depth == 0:
                if rpgmz.is_yielding(lst[j]):
                    has_wait = True
                if c in (113, 115):
                    has_break = True
            j += 1
        if not has_wait and not has_break:
            rep.error(where, "loop-no-escape",
                      "Loop at command %d contains neither a Wait nor a Break Loop / Exit "
                      "Event Processing. It will execute 100000 commands per frame "
                      "(checkFreeze) and the game will appear frozen." % i)
        elif not has_wait:
            rep.warn(where, "loop-no-wait",
                     "Loop at command %d has no Wait. If the Break condition is not met "
                     "immediately it burns the whole frame budget." % i)


# ---------------------------------------------------------------------------
# Reference checks
# ---------------------------------------------------------------------------

def check_references(rep, project, ref, map_event_ids):
    where = ref.label()
    max_sw, max_va = project.switch_count(), project.variable_count()

    def bad_switch(i):
        return isinstance(i, int) and (i <= 0 or i >= max_sw) and max_sw > 1

    def bad_var(i):
        return isinstance(i, int) and (i <= 0 or i >= max_va) and max_va > 1

    for i, cmd in enumerate(ref.list):
        code, p = cmd.get("code"), cmd.get("parameters") or []
        try:
            if code == 121 and (bad_switch(p[0]) or bad_switch(p[1])):
                rep.error(where, "bad-switch-id",
                          "Control Switches at command %d targets %d..%d but only %d "
                          "switches are declared in System.json. setValue() ignores "
                          "out-of-range IDs SILENTLY - this command does nothing."
                          % (i, p[0], p[1], max_sw - 1))
            elif code == 122 and (bad_var(p[0]) or bad_var(p[1])):
                rep.error(where, "bad-variable-id",
                          "Control Variables at command %d targets %d..%d but only %d "
                          "variables are declared. The write is silently ignored."
                          % (i, p[0], p[1], max_va - 1))
            elif code == 111:
                if p[0] == 0 and bad_switch(p[1]):
                    rep.error(where, "bad-switch-id",
                              "Conditional Branch at command %d reads undeclared switch %d "
                              "(always reads as OFF)." % (i, p[1]))
                elif p[0] == 1 and bad_var(p[1]):
                    rep.error(where, "bad-variable-id",
                              "Conditional Branch at command %d reads undeclared variable %d "
                              "(always reads as 0)." % (i, p[1]))
                elif p[0] == 2 and ref.kind != "map":
                    rep.warn(where, "selfswitch-no-event",
                             "Conditional Branch at command %d tests a Self Switch, but this "
                             "list is a %s event. Self switch conditions require a caller "
                             "event ID and are always false when the interpreter has "
                             "eventId 0." % (i, ref.kind))
            elif code == 117:
                if not project.common_event(p[0]):
                    rep.error(where, "missing-common-event",
                              "Common Event %s called at command %d does not exist." % (p[0], i))
            elif code == 285 and bad_var(p[0]):
                rep.error(where, "bad-variable-id",
                          "Get Location Info at command %d stores into undeclared "
                          "variable %d." % (i, p[0]))
            elif code in (205, 203, 212, 213):
                char_id = p[0]
                if (ref.kind == "map" and isinstance(char_id, int) and char_id > 0
                        and char_id not in map_event_ids):
                    rep.error(where, "missing-event-ref",
                              "%s at command %d targets Event %d, which does not exist on "
                              "this map." % (rpgmz.COMMAND_NAMES.get(code), i, char_id))
                if code == 205:
                    route = p[1] if len(p) > 1 and isinstance(p[1], dict) else {}
                    for step in route.get("list") or []:
                        if step.get("code") in (27, 28):
                            sid = (step.get("parameters") or [0])[0]
                            if bad_switch(sid):
                                rep.error(where, "bad-switch-id",
                                          "Move route at command %d toggles undeclared "
                                          "switch %d." % (i, sid))
            elif code == 356 and project.engine == "MZ":
                rep.error(where, "mv-plugin-command",
                          "Command 356 (MV-style Plugin Command) at command %d. In MZ, "
                          "Game_Interpreter.pluginCommand is a no-op stub - this does "
                          "NOTHING, silently. Convert to a 357 command." % i)
            elif code == 123 and ref.kind != "map":
                rep.warn(where, "selfswitch-no-event",
                         "Control Self Switch at command %d in a %s event. It only works "
                         "when the interpreter has a caller event ID (i.e. called via "
                         "command 117 from a map event on the current map)."
                         % (i, ref.kind))
            elif code == 214 and ref.kind != "map":
                rep.warn(where, "erase-no-event",
                         "Erase Event at command %d in a %s event. It is a no-op unless "
                         "called via command 117 from a map event." % (i, ref.kind))
        except (IndexError, TypeError, KeyError):
            rep.error(where, "bad-parameters",
                      "Command %d (%s) has malformed parameters: %r"
                      % (i, rpgmz.COMMAND_NAMES.get(code, code), p))


# ---------------------------------------------------------------------------
# Page / trigger semantics
# ---------------------------------------------------------------------------

STATE_CHANGE_CODES = {121, 122, 123, 201, 214}


def _mentions_state_change(lst):
    """Does this list plausibly change its own page conditions?"""
    for cmd in lst:
        code = cmd.get("code")
        if code in STATE_CHANGE_CODES:
            return True
        if code in (355, 655):
            text = (cmd.get("parameters") or [""])[0] or ""
            if "setValue" in text or "reserveTransfer" in text or "erase" in text:
                return True
        if code == 357:
            return True  # a plugin command might do anything
    return False


def check_pages(rep, project, map_id, ev):
    ev_id, ev_name = ev.get("id"), ev.get("name", "")
    pages = ev.get("pages") or []
    base = "Map%03d ev%d(%s)" % (map_id, ev_id, ev_name)

    self_switches_set = set()
    self_switches_read = set()
    for page in pages:
        cond = page.get("conditions") or {}
        if cond.get("selfSwitchValid"):
            self_switches_read.add(cond.get("selfSwitchCh"))
        for cmd in page.get("list") or []:
            if cmd.get("code") == 123 and cmd.get("parameters"):
                self_switches_set.add(cmd["parameters"][0])

    for pi, page in enumerate(pages):
        where = "%s page%d" % (base, pi + 1)
        lst = page.get("list") or []
        trigger = page.get("trigger")
        cond = page.get("conditions") or {}
        substantive = len(lst) > 1

        # --- Autorun ---
        if trigger == 3:
            if not substantive:
                rep.error(where, "autorun-empty",
                          "Autorun page with an empty command list. Game_Event.start() "
                          "requires list length > 1, so this never runs - but the page still "
                          "overrides every lower page's graphic and trigger.")
            elif not _mentions_state_change(lst):
                rep.error(where, "autorun-no-exit",
                          "Autorun page contains no Control Switches / Control Variables / "
                          "Control Self Switch / Transfer Player / Erase Event. An Autorun "
                          "restarts every frame until its page stops matching, so this "
                          "freezes the game permanently.")
            else:
                # the exit must be reachable on every path: flag exits that sit indented
                exits = [c for c in lst if c.get("code") in STATE_CHANGE_CODES]
                if exits and all((c.get("indent") or 0) > 0 for c in exits):
                    rep.warn(where, "autorun-conditional-exit",
                             "Every state-changing command in this Autorun is inside an "
                             "indented block. If any path skips them the Autorun never "
                             "ends. Put the guaranteed exit at indent 0.")

        # --- Parallel ---
        if trigger == 4:
            if not substantive:
                rep.info(where, "parallel-empty",
                         "Parallel page with an empty list. Harmless, but an Action Button "
                         "trigger creates no interpreter at all and is strictly cheaper.")
            else:
                if not any(rpgmz.is_yielding(c) for c in lst):
                    rep.warn(where, "parallel-no-wait",
                             "Parallel page with no Wait. The whole list runs every frame "
                             "(60x/second). Add a Wait at indent 0 at the end unless this "
                             "genuinely needs per-frame precision.")
                else:
                    waits = [c for c in lst if rpgmz.is_yielding(c)]
                    if waits and all((c.get("indent") or 0) > 0 for c in waits):
                        rep.warn(where, "parallel-wait-indented",
                                 "Every Wait in this Parallel is inside a conditional block, "
                                 "so iterations taking other paths still run at full frame "
                                 "rate. Move a Wait to indent 0.")
                if not any(cond.get(k) for k in ("switch1Valid", "switch2Valid",
                                                 "variableValid", "selfSwitchValid",
                                                 "itemValid", "actorValid")):
                    rep.warn(where, "parallel-ungated",
                             "Parallel page has no page conditions, so it runs from the "
                             "moment the map loads until it leaves. Gate it with a switch or "
                             "self switch so it does not exist when it is not needed.")

        # --- empty pages that shadow ---
        if not substantive and pi > 0 and trigger not in (3, 4):
            img = page.get("image") or {}
            if img.get("characterName") or img.get("tileId"):
                rep.info(where, "empty-page-with-graphic",
                         "Page has a graphic but no commands. Fine for a decorative state; "
                         "note it cannot be triggered (list length <= 1).")
            else:
                rep.info(where, "empty-page",
                         "Page is empty and has no graphic. This is the idiomatic way to "
                         "hide an event - confirm that is the intent, because it also "
                         "overrides every lower page.")

        # --- trigger vs priority ---
        if substantive and trigger == 0 and page.get("priorityType") != 1:
            rep.warn(where, "action-button-priority",
                     "Action Button page with priority '%s'. The player can only interact "
                     "from the front with 'Same as Characters'; with this priority they must "
                     "stand ON the event."
                     % rpgmz.PRIORITY_NAMES.get(page.get("priorityType"), "?"))
        if substantive and trigger in (1, 2) and page.get("priorityType") == 1:
            rep.info(where, "touch-priority",
                     "Touch trigger with 'Same as Characters' priority fires when the player "
                     "walks INTO the event, not when standing on it. Use 'Below Characters' "
                     "for a floor trigger.")

        # --- size ---
        if len(lst) > 300:
            rep.info(where, "huge-page",
                     "Page has %d commands. Consider decomposing into Common Events for "
                     "readability." % len(lst))

    # --- self switch coherence ---
    for ch in sorted(self_switches_set - self_switches_read):
        rep.warn(base, "selfswitch-unused",
                 "Self Switch %s is set but no page of this event uses it as a condition. "
                 "Either a page condition is missing, or the write is dead." % ch)
    for ch in sorted(self_switches_read - self_switches_set):
        rep.info(base, "selfswitch-external",
                 "Self Switch %s is used as a page condition but never set by this event. "
                 "It must be set from elsewhere via a script call - confirm that exists." % ch)

    if not ev_name or ev_name.upper().startswith("EV0"):
        total = sum(len(p.get("list") or []) for p in pages)
        if total > 12:
            rep.info(base, "unnamed-event",
                     "Substantial event (%d commands) still has the default name '%s'. "
                     "Name it - the editor name is the only label a maintainer gets."
                     % (total, ev_name))


# ---------------------------------------------------------------------------
# Cross-cutting checks
# ---------------------------------------------------------------------------

def check_common_event_recursion(rep, project):
    graph = {}
    for ce in project.common_events or []:
        if not ce:
            continue
        graph[ce["id"]] = [c["parameters"][0] for c in (ce.get("list") or [])
                           if c.get("code") == 117 and c.get("parameters")]

    color, stack = {}, []

    def visit(node):
        color[node] = 1
        stack.append(node)
        for nxt in graph.get(node, []):
            if nxt not in graph:
                continue
            if color.get(nxt) == 1:
                cycle = stack[stack.index(nxt):] + [nxt]
                names = " -> ".join(
                    "%d(%s)" % (n, (project.common_event(n) or {}).get("name", "?"))
                    for n in cycle)
                rep.error("CommonEvents", "ce-recursion",
                          "Common Event call cycle: %s. Each nested call adds interpreter "
                          "depth; the engine throws 'Common event calls exceeded the limit' "
                          "at depth 100." % names)
            elif color.get(nxt, 0) == 0:
                visit(nxt)
        stack.pop()
        color[node] = 2

    for node in graph:
        if color.get(node, 0) == 0:
            visit(node)


def check_common_event_triggers(rep, project):
    for ce in project.common_events or []:
        if not ce:
            continue
        where = "CommonEvent %d (%s)" % (ce["id"], ce.get("name", ""))
        lst = ce.get("list") or []
        if ce.get("trigger") == 2:
            sid = ce.get("switchId")
            if not sid or sid <= 0:
                rep.error(where, "parallel-ce-no-switch",
                          "Parallel Common Event with no gate switch: it runs on every map, "
                          "every frame, forever.")
            if len(lst) > 1 and not any(rpgmz.is_yielding(c) for c in lst):
                rep.warn(where, "parallel-no-wait",
                         "Parallel Common Event with no Wait runs its whole list 60x per "
                         "second on every map.")
        if ce.get("trigger") == 1 and len(lst) > 1:
            if not _mentions_state_change(lst):
                rep.error(where, "autorun-no-exit",
                          "Autorun Common Event with no state change - it restarts forever "
                          "and blocks the player.")


def check_duplicates(rep, project, refs, threshold=25):
    seen = collections.defaultdict(list)
    for ref in refs:
        lst = ref.list
        if len(lst) < threshold:
            continue
        sig = tuple(c.get("code") for c in lst)
        seen[sig].append(ref.label())
    for sig, places in seen.items():
        if len(places) > 1:
            rep.info(places[0], "duplicate-logic",
                     "%d event lists share an identical %d-command structure (%s). "
                     "Consider extracting to a Common Event."
                     % (len(places), len(sig), ", ".join(places[1:4])))


def check_magic_ids(rep, project, refs):
    unnamed_sw, unnamed_va = collections.Counter(), collections.Counter()
    for ref in refs:
        for cmd in ref.list:
            code, p = cmd.get("code"), cmd.get("parameters") or []
            try:
                if code == 121 and not (project.switch_name(p[0]) or "").strip():
                    unnamed_sw[p[0]] += 1
                elif code == 122 and not (project.variable_name(p[0]) or "").strip():
                    unnamed_va[p[0]] += 1
            except (IndexError, TypeError):
                continue
    for sid, n in unnamed_sw.most_common(10):
        if n >= 2:
            rep.info("System.json", "unnamed-switch",
                     "Switch %d is written %d times but has no name in System.json. "
                     "Unnamed IDs are unmaintainable magic numbers." % (sid, n))
    for vid, n in unnamed_va.most_common(10):
        if n >= 2:
            rep.info("System.json", "unnamed-variable",
                     "Variable %d is written %d times but has no name in System.json."
                     % (vid, n))


def check_map_level(rep, project, map_id):
    data = project.load_map(map_id)
    if not data:
        return
    evs = [e for e in (data.get("events") or []) if e]
    autoruns, parallels = [], []
    for ev in evs:
        for pi, page in enumerate(ev.get("pages") or []):
            if len(page.get("list") or []) <= 1:
                continue
            if page.get("trigger") == 3:
                autoruns.append("ev%d p%d" % (ev["id"], pi + 1))
            elif page.get("trigger") == 4:
                parallels.append("ev%d p%d" % (ev["id"], pi + 1))
    where = "Map%03d (%s)" % (map_id, project.map_name(map_id))
    if len(autoruns) > 1:
        rep.warn(where, "multiple-autoruns",
                 "%d Autorun pages exist on this map (%s). Only the lowest Event ID runs; "
                 "the others wait for it to finish. If conditions overlap this reads as "
                 "'my second cutscene never plays'." % (len(autoruns), ", ".join(autoruns)))
    if len(parallels) > 2:
        rep.warn(where, "many-parallels",
                 "%d Parallel pages could be active on this map (%s). Each runs its command "
                 "list every frame. Gate them, merge them, or replace them with "
                 "event-driven state changes." % (len(parallels), ", ".join(parallels)))


# ---------------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("project")
    ap.add_argument("--map", type=int, action="append",
                    help="restrict to this map ID (repeatable)")
    ap.add_argument("--level", choices=("error", "warn", "info"), default="info",
                    help="minimum severity to print (default: info)")
    ap.add_argument("--quiet", action="store_true", help="suppress output; exit code only")
    args = ap.parse_args()

    project = rpgmz.Project(args.project)
    rep = Report()
    map_ids = args.map if args.map else project.map_ids()

    refs = list(rpgmz.iter_all_lists(project, map_ids))
    for ref in refs:
        check_structure(rep, ref)

    for mid in map_ids:
        data = project.load_map(mid)
        if not data:
            continue
        event_ids = {e["id"] for e in (data.get("events") or []) if e}
        for ev in (data.get("events") or []):
            if ev:
                check_pages(rep, project, mid, ev)
        check_map_level(rep, project, mid)

    for ref in refs:
        ids = set()
        if ref.kind == "map":
            data = project.load_map(ref.map_id)
            ids = {e["id"] for e in (data.get("events") or []) if e} if data else set()
        check_references(rep, project, ref, ids)

    check_common_event_recursion(rep, project)
    check_common_event_triggers(rep, project)
    check_duplicates(rep, project, refs)
    check_magic_ids(rep, project, refs)

    counts = rep.counts()
    if not args.quiet:
        threshold = LEVELS[args.level]
        order = {"ERROR": 0, "WARN": 1, "INFO": 2}
        shown = [i for i in rep.items if order[i[0]] <= threshold]
        shown.sort(key=lambda i: (order[i[0]], i[1]))
        current = None
        for level, where, code, message in shown:
            if where != current:
                print("\n%s" % where)
                current = where
            print("  [%-5s] %-24s %s" % (level, code, message))
        print("\n%s" % ("=" * 72))
        print("%d ERROR  %d WARN  %d INFO   (%d lists, %d maps checked)"
              % (counts["ERROR"], counts["WARN"], counts["INFO"], len(refs), len(map_ids)))
        if not rep.items:
            print("No issues found.")

    return 1 if counts["ERROR"] else 0


if __name__ == "__main__":
    sys.exit(main())
