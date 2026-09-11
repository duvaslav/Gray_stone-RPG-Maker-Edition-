#!/usr/bin/env python3
"""Survey an RPG Maker MZ/MV project before editing it.

Run this FIRST on any project you have not seen before. It reports the engine,
the switch/variable inventory (used and free), common events, plugins, and an
event census per map — everything you need to avoid guessing.

    python3 inspect_project.py <project-root>
    python3 inspect_project.py <project-root> --map 12
    python3 inspect_project.py <project-root> --map 12 --event 4
    python3 inspect_project.py <project-root> --free-ids
    python3 inspect_project.py <project-root> --grep "QUEST"
"""

import argparse
import collections
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rpgmz  # noqa: E402


def collect_usage(project):
    """Which switch / variable / common-event IDs are referenced anywhere."""
    used = {"switch": collections.Counter(), "variable": collections.Counter(),
            "common": collections.Counter(), "selfswitch": collections.Counter()}

    def note(kind, ident):
        if isinstance(ident, int) and ident > 0:
            used[kind][ident] += 1

    for ref in rpgmz.iter_all_lists(project):
        for cmd in ref.list:
            code, p = cmd.get("code"), cmd.get("parameters") or []
            try:
                if code == 121:
                    for i in range(p[0], p[1] + 1):
                        note("switch", i)
                elif code == 122:
                    for i in range(p[0], p[1] + 1):
                        note("variable", i)
                    if p[3] == 1:
                        note("variable", p[4])
                elif code == 111:
                    if p[0] == 0:
                        note("switch", p[1])
                    elif p[0] == 1:
                        note("variable", p[1])
                        if p[2] == 1:
                            note("variable", p[3])
                elif code == 117:
                    note("common", p[0])
                elif code == 285:
                    note("variable", p[0])
                elif code in (103, 104):
                    note("variable", p[0])
                elif code == 205:
                    route = p[1] if len(p) > 1 and isinstance(p[1], dict) else {}
                    for step in route.get("list") or []:
                        if step.get("code") in (27, 28):
                            note("switch", (step.get("parameters") or [0])[0])
            except (IndexError, TypeError):
                continue

    # page conditions and common-event gate switches
    for mid in project.map_ids():
        for ev, pi, page in rpgmz.iter_map_events(project, mid):
            c = page.get("conditions") or {}
            if c.get("switch1Valid"):
                note("switch", c.get("switch1Id"))
            if c.get("switch2Valid"):
                note("switch", c.get("switch2Id"))
            if c.get("variableValid"):
                note("variable", c.get("variableId"))
    for ce in project.common_events or []:
        if ce and ce.get("trigger") in (1, 2):
            note("switch", ce.get("switchId"))
    return used


def ranges(numbers):
    """Compress a sorted list of ints into '1-4, 7, 9-12'."""
    out, start, prev = [], None, None
    for n in numbers:
        if start is None:
            start = prev = n
        elif n == prev + 1:
            prev = n
        else:
            out.append(str(start) if start == prev else "%d-%d" % (start, prev))
            start = prev = n
    if start is not None:
        out.append(str(start) if start == prev else "%d-%d" % (start, prev))
    return ", ".join(out)


def overview(project, args):
    print("=" * 72)
    print("PROJECT: %s" % project.root)
    print("  engine     : %s" % project.engine)
    print("  data dir   : %s" % project.data_dir)
    print("  game title : %s" % project.system.get("gameTitle", "?"))
    print("  maps       : %d" % len(project.map_ids()))
    print("  switches   : %d declared" % max(project.switch_count() - 1, 0))
    print("  variables  : %d declared" % max(project.variable_count() - 1, 0))

    plugins = project.plugins()
    if plugins:
        on = [p for p in plugins if p.get("status")]
        print("  plugins    : %d installed, %d enabled" % (len(plugins), len(on)))
        for p in on:
            print("      + %s" % p.get("name"))
    else:
        print("  plugins    : (js/plugins.js not readable)")

    used = collect_usage(project)

    print("\n--- COMMON EVENTS ---")
    for ce in project.common_events or []:
        if not ce:
            continue
        trig = rpgmz.CE_TRIGGER_NAMES.get(ce.get("trigger"), "?")
        gate = ""
        if ce.get("trigger") in (1, 2):
            n = project.switch_name(ce.get("switchId"))
            gate = "  gate=SW %d%s" % (ce.get("switchId"), ":%s" % n if n else "")
        calls = used["common"][ce["id"]]
        print("  %3d  %-32s %-8s len=%-4d calls=%d%s" % (
            ce["id"], ce.get("name", ""), trig, len(ce.get("list") or []), calls, gate))

    print("\n--- SWITCHES IN USE ---")
    named = {i for i in range(1, project.switch_count()) if (project.switch_name(i) or "").strip()}
    for sid in sorted(set(used["switch"]) | named):
        print("  %4d  %-36s refs=%d" % (sid, project.switch_name(sid) or "(unnamed)",
                                        used["switch"][sid]))
    print("\n--- VARIABLES IN USE ---")
    named = {i for i in range(1, project.variable_count()) if (project.variable_name(i) or "").strip()}
    for vid in sorted(set(used["variable"]) | named):
        print("  %4d  %-36s refs=%d" % (vid, project.variable_name(vid) or "(unnamed)",
                                        used["variable"][vid]))

    if args.free_ids:
        free_sw = [i for i in range(1, project.switch_count())
                   if i not in used["switch"] and not (project.switch_name(i) or "").strip()]
        free_va = [i for i in range(1, project.variable_count())
                   if i not in used["variable"] and not (project.variable_name(i) or "").strip()]
        print("\n--- FREE IDS ---")
        print("  switches : %s" % (ranges(free_sw) or "(none)"))
        print("  variables: %s" % (ranges(free_va) or "(none)"))

    print("\n--- MAP EVENT CENSUS ---")
    print("  %-6s %-24s %6s %6s %8s %9s" % ("map", "name", "events", "pages",
                                            "autorun", "parallel"))
    for mid in project.map_ids():
        data = project.load_map(mid)
        if not data:
            continue
        evs = [e for e in (data.get("events") or []) if e]
        pages = sum(len(e.get("pages") or []) for e in evs)
        auto = para = 0
        for e in evs:
            for pg in e.get("pages") or []:
                if pg.get("trigger") == 3:
                    auto += 1
                elif pg.get("trigger") == 4:
                    para += 1
        if evs or args.all_maps:
            print("  %-6d %-24s %6d %6d %8d %9s" % (
                mid, (project.map_name(mid) or "")[:24], len(evs), pages, auto,
                "%d %s" % (para, "<-- check" if para > 2 else "")))


def dump_map(project, map_id, event_id=None):
    data = project.load_map(map_id)
    if not data:
        raise SystemExit("Map%03d.json not found" % map_id)
    print("=" * 72)
    print("Map%03d  %s   (%dx%d, tileset %s)" % (
        map_id, project.map_name(map_id), data.get("width"), data.get("height"),
        data.get("tilesetId")))
    if data.get("note"):
        print("note: %s" % data["note"])
    for ev in (data.get("events") or []):
        if not ev or (event_id is not None and ev.get("id") != event_id):
            continue
        print("\n" + "-" * 72)
        print("EVENT %d  '%s'  at (%d,%d)%s" % (
            ev["id"], ev.get("name", ""), ev.get("x", 0), ev.get("y", 0),
            "   note=%s" % ev["note"] if ev.get("note") else ""))
        for pi, page in enumerate(ev.get("pages") or []):
            img = page.get("image") or {}
            print("\n  PAGE %d  [%s]" % (pi + 1,
                                         rpgmz.describe_conditions(page.get("conditions") or {},
                                                                   project)))
            print("     trigger=%-14s priority=%-18s move=%s spd=%s frq=%s" % (
                rpgmz.TRIGGER_NAMES.get(page.get("trigger"), "?"),
                rpgmz.PRIORITY_NAMES.get(page.get("priorityType"), "?"),
                rpgmz.MOVETYPE_NAMES.get(page.get("moveType"), "?"),
                page.get("moveSpeed"), page.get("moveFrequency")))
            flags = [k for k in ("walkAnime", "stepAnime", "directionFix", "through")
                     if page.get(k)]
            print("     graphic=%s[%s] dir=%s   %s" % (
                img.get("characterName") or "(none)", img.get("characterIndex"),
                img.get("direction"), " ".join(flags)))
            for line in rpgmz.format_list(page.get("list"), project):
                print("     " + line)


def grep(project, needle):
    needle = needle.lower()
    for ref in rpgmz.iter_all_lists(project):
        for i, cmd in enumerate(ref.list):
            text = rpgmz.describe_command(cmd, project)
            if needle in text.lower():
                print("%-42s %4d | %s" % (ref.label(), i, text))


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("project")
    ap.add_argument("--map", type=int, help="dump one map's events as pseudo-code")
    ap.add_argument("--event", type=int, help="with --map, dump only this event")
    ap.add_argument("--grep", help="search every command list for text")
    ap.add_argument("--free-ids", action="store_true", help="list unused switch/variable IDs")
    ap.add_argument("--all-maps", action="store_true", help="include maps with no events")
    args = ap.parse_args()

    project = rpgmz.Project(args.project)
    if args.grep:
        grep(project, args.grep)
    elif args.map is not None:
        dump_map(project, args.map, args.event)
    else:
        overview(project, args)


if __name__ == "__main__":
    main()
