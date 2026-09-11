# Plugins and Eventing

A plugin extends the engine. It does not substitute for event design, and it is not free — it
adds a dependency, a compatibility surface, an update burden and a load-order constraint.

---

## The escalation ladder

Work down this list. Stop at the first rung that gives a clean solution.

1. **Vanilla Event Commands.** Portable, visible in the editor, searchable, lintable.
2. **Common Events / Variables / Self Switches / Event Pages.** Still vanilla; this is where
   most "impossible" requirements are actually solved.
3. **A small, verified Script Call.** One line, commented, checked against
   `script-calls-mz.md`.
4. **A plugin already installed in the project.** Zero new dependency.
5. **A new plugin** — only when the event-only implementation would be unreasonably complex,
   fragile, or expensive, and you can say concretely why.

Never recommend a plugin merely because it exists or because it is popular.

---

## When a plugin is genuinely the right answer

- **Rendering and UI**: HUDs, minimaps, custom menus, gauge overlays. Events cannot draw.
- **Per-frame systems at scale**: pixel movement, ABS combat, real-time weather simulation.
- **Message window features**: word wrap, more than six choices, choice columns, typewriter
  text, name boxes beyond MZ's built-in speaker field.
- **Save-persistent self variables** across many events (self switches give you four booleans;
  emulating numeric self state for 200 events by hand is not reasonable).
- **Event spawning / dynamic event creation** — no vanilla equivalent exists.
- **Real pathfinding companions** across maps.
- **Battle system changes** — vanilla troop events cannot restructure combat.
- **Anything requiring data the engine does not track** (playtime per map, achievement systems).

## When a plugin is the wrong answer

- Proximity detection, line of sight, vision cones — see `spatial-eventing.md`.
- Day/night NPC schedules — threshold pages on duplicated events.
- Quest journals for a small game — variables plus a Common Event.
- Setting another event's self switch — one script call.
- Cutscene choreography — non-waiting move routes plus a switch handshake.
- Pressure plates, pushable blocks, lever puzzles — all vanilla.
- "It would be faster to install a plugin than to think about the architecture."

---

## Working with an already-installed plugin

### 1. Find out what is installed

```bash
python3 scripts/inspect_project.py <project-root>     # lists enabled plugins
```

`js/plugins.js` is a JS file containing a JSON array of
`{name, status, description, parameters}`. `status: false` means installed but **disabled** —
its commands will silently do nothing. Load order in that array matters: later plugins
override earlier ones.

### 2. Read the plugin before using it

Open `js/plugins/<Name>.js` and read the annotation block at the top:

```
 * @command turnOnLight
 * @text Turn On Light
 * @desc Lights the given lamp event.
 *
 * @arg eventId
 * @type number
 * @default 1
```

and the registration:

```js
PluginManager.registerCommand("LightSystem", "turnOnLight", args => { ... });
```

The **first argument to `registerCommand` must match the plugin's file name**, and the second
is the exact command name you must write into `parameters[1]` of a `357` command.

### 3. Write the plugin command correctly

```json
{"code":357,"indent":0,
 "parameters":["LightSystem","turnOnLight","Turn On Light",{"eventId":"5"}]},
{"code":657,"indent":0,"parameters":["eventId = 5"]}
```

- `parameters[0]` = plugin file name (no `.js`).
- `parameters[1]` = registered command name.
- `parameters[2]` = the display name shown in the editor — cosmetic, but write something.
- `parameters[3]` = an object whose **values are strings**, because they come from the editor's
  parameter widgets. `{"eventId": "5"}`, not `{"eventId": 5}`.
- Follow with `657` lines mirroring the arguments, or the editor shows a blank argument list.

`scripts/build_event.py`'s `plugin_command()` emits all of this correctly.

**Never invent a plugin command name.** If you cannot read the plugin file, say so and ask —
an invented command is a silent no-op that is very hard to diagnose.

### 4. Notetags

Many plugins read notetags from the `note` field of events, maps and database entries (MZ
only for events and maps). Read the plugin's help block for the exact syntax before adding
one, and never delete an existing `note` string you do not recognise.

---

## Known plugin families

Names differ between engines and versions; always verify against the installed file.

| Family | Engine | Notes |
|---|---|---|
| **VisuStella MZ** | MZ | Large, interdependent suite. `VisuMZ_1_EventsMoveCore` is nearly always present in projects using it and changes movement, self switches (adding self variables), and event behaviour substantially. **Load order is strict** and documented per plugin. If installed, check its features before building a workaround |
| **Yanfly YEP** | MV | The MV-era equivalent. Does **not** work in MZ |
| **Casper Gaming (CGMZ)** | MZ | Modular; `CGMZ_Core` is a prerequisite for the rest |
| **HimeWorks** | MV & MZ | Small focused plugins, often the minimal way to add one feature |
| **Hakuen Studio (Eli)** | MV & MZ | `Eli_Book` is a common prerequisite |
| **Galv** | MV & MZ | Event detectors, move route extras, puzzle helpers |

If `VisuMZ_1_EventsMoveCore` is installed, several things in this skill's references have
richer built-in equivalents (self variables, advanced move-route commands, region-based
restrictions, event labels). Check it before hand-rolling.

---

## Compatibility rules

- **MV plugins do not run in MZ, and vice versa.** The plugin command system, the `_params`
  convention, the animation system and the renderer all changed. Assume zero carry-over.
- **An MV-style `356` plugin command in an MZ project does nothing, silently** — MZ's
  `pluginCommand` is a no-op stub. `validate_events.py` reports these as errors.
- **Plugins that patch the same method conflict.** If two plugins both alias
  `Game_Event.prototype.setupPageSettings`, the later one in `plugins.js` wins unless they
  alias properly.
- **Disabling a plugin does not remove its commands from your events.** Those `357` commands
  become silent no-ops.

---

## If you decide a plugin is needed

Say so explicitly, and say:

1. **What exactly cannot be done with events**, concretely.
2. **What the event-only version would cost** (complexity, performance, fragility).
3. **What class of plugin** solves it — not necessarily a specific product, unless the project
   already uses that family.
4. **What it would depend on** (prerequisites, load order, engine version).

Then let the user decide. Do not install or download plugins on your own initiative; adding a
third-party script to someone's project is their call.

---

## Building events that survive plugins

- Prefer standard commands to script calls: plugins alias engine methods, and a vanilla command
  is more likely to keep working.
- Do not depend on exact vanilla behaviour of anything a movement plugin might change
  (page refresh timing, self switch semantics, move route processing) without checking.
- Band your picture IDs away from the range a HUD plugin uses.
- Keep plugin commands in Common Events where practical, so swapping or removing a plugin
  touches one place instead of forty map events.
