# Plugin decisions

The rule this project follows: **a plugin solves a demonstrated problem.** It is
not installed because it exists, because it is popular, or because a feature
would be nice. Every row below records the problem first.

Two framework plugins that patch the same `Window_*` or movement classes are
never installed together without proof they coexist.

---

## Installed

### GrayStone_Core.js

| | |
|---|---|
| **Problem** | RPG Maker MZ has no "on map enter" trigger. The game must refresh ambience, lighting and NPC schedules whenever the player arrives on a map — including after a **load**, where no event fires at all. |
| **Vanilla alternative** | a Parallel Process on every map, polling for arrival. Rejected: it burns a parallel interpreter permanently on every map to detect an event that happens once, and the brief forbids Parallel for work that can be event-driven. |
| **Benefit** | `Game_Map.setup` runs on transfer, New Game **and** load. Arming a switch there is the one hook that covers all three identically. A guarded Autorun consumes it once and turns it off — zero per-frame cost. |
| **Also does** | removes Skill / Equip / Status / Formation from the menu (one character, no combat, so they carry no information); refuses an autosave while the save-lock switch is set, so a mid-scene autosave cannot capture half-applied atomic state. |
| **Risks** | aliases `Game_Map.setup`, `Window_MenuCommand.addMainCommands`, `Window_ItemCategory.makeCommandList`, `Scene_Base.requestAutosave`. Any future plugin touching the menu must be checked against it. |
| **Compatibility** | no dependencies. Must load **first** so later plugins see the shaped menu. |
| **Licence** | project source. |
| **Tests** | regression: *"Load: entering the manor restores ambience without touching AP"*, *"Autosave: locked scenes are never autosaved into"*; vertical slice steps 3, 9. |

### GrayStone_MessageUI.js

| | |
|---|---|
| **Problem** | the dialogue needs a late-Victorian look — graphite, restrained bronze, readable Russian text — with the name box attached to the message window rather than floating above it. |
| **Vanilla alternative** | a custom windowskin alone. Partly sufficient, but cannot change the name box's placement or the padding and font metrics. |
| **Explicitly NOT the problem** | showing a speaker's name. MZ already has native `speakerName` on Show Text. **No plugin was installed for that.** |
| **Benefit** | restyles the two windows MZ already has. Every line stays an ordinary Show Text command; removing this plugin loses the styling, not the script. |
| **Risks** | overrides `updatePadding`, `updatePlacement`, `refresh` and `_refreshBack` on `Window_Message` / `Window_NameBox`. A second message plugin would conflict — that is why no third-party message framework is installed. |
| **Compatibility** | face graphics untouched; the name box measures the message window instead of assuming a width, so it reflows around faces. |
| **Licence** | project source. |
| **Tests** | vertical slice step 2 confirms named speakers and bound faces reach the message pipeline. Visual appearance is **EDITOR_VERIFIED-pending** — it cannot be judged without the runtime. |

### GrayStone_8DirMovement.js — installed but **DISABLED**

| | |
|---|---|
| **Problem** | four-direction movement feels stiff for free exploration. |
| **Decision** | written, shipped with `"status": false` in `js/plugins.js`. The brief is explicit: validate plain grid movement first, enable diagonals after the vertical slice passes. It has passed, so this is the next thing to switch on and test in the editor. |
| **Why grid, not pixel** | Gray Stone is built on tile-exact triggers — search points, doorway cells, NPC coordinates, cutscene staging, scripted routes. Pixel movement replaces MZ's collision model and puts all of it at risk. This uses MZ's own `moveDiagonally`, so every coordinate stays an integer tile. |
| **Scope** | **player only.** Event and NPC coordinates, autonomous movement and scripted Move Routes are untouched, which is what keeps cutscene choreography exactly as authored. |
| **Safeguards** | diagonal speed normalised by √2, so diagonal travel is not faster; corner cutting blocked — a diagonal step requires **both** component directions to be individually passable, so the player cannot slip between two wall corners. |
| **Still to test in the editor** | event activation on the diagonal, doorway cells, narrow corridors, transfers. |
| **Licence** | project source. |

---

## Considered and refused

### Shora Lighting & Shadow System — NOT installed

- **Problem it would solve:** dynamic light sources and cast shadows; warm candle and fire pools against a cold ambient.
- **Why not now:** the current lighting brief — cold ambient dusk, deep but readable rooms, weather felt through windows — is met by native `Tint Screen`, `Set Weather Effect` and map shadows, which the time system already drives per block.
- **Gate it must pass before adoption:** (1) licence confirmed, including commercial use; (2) performance test against the actual light-source count; (3) proof it **reads** `Current_Day` / `Time_Block` from Gray Stone's clock rather than keeping its own — it must never own time; (4) candle and fire lights switch on by time block automatically.
- **If it fails any gate:** keep the native implementation. That is an acceptable outcome, not a fallback.

### Tyruswoo Camera Control MZ — NOT installed

- **Problem it would solve:** cinematic camera moves beyond `Scroll Map`.
- **Why not:** the prologue has a specific, already-designed camera plan (six shots), and native `Scroll Map` executes it. Adding a camera plugin would mean rewriting a working plan for no gain.
- **Revisit if:** a later scene genuinely needs a move `Scroll Map` cannot express. Camera must never end a cutscene stuck, attached to a temporary event instance, or showing the map edge.

### Tyruswoo Altimit Movement MZ — NOT baseline

- **Why not:** true pixel movement. See the grid-versus-pixel reasoning above. If pixel movement is ever genuinely wanted, it goes through a separate compatibility gate covering triggers, transfers, event touch and every scripted route — not adopted merely to obtain diagonals, which `GrayStone_8DirMovement` already provides safely.

### Any calendar / time-system plugin — NOT installed

- **Why not:** `Current_Day`, hour, minute, `Time_Block`, AP and the story switches are the source of truth. Lighting, weather, audio and NPC schedules **read** them. A plugin keeping its own parallel clock would desynchronise every one of those systems. This is a structural rule, not a preference.

### Message backlog / history — DEFERRED (P1, not a blocker)

- **Worth having:** Gray Stone is text-centred and players will want to re-read.
- **Conditions:** native Show Text keeps working; speaker names and face bindings keep working; save compatibility preserved; licence and commercial use confirmed; **no** heavy visual-novel framework pulled in merely to obtain a backlog.
- **Preference:** if a small project-authored implementation is safer than a third-party one, write it. It would be `GrayStone_Backlog.js` and would hook `Window_Message.startMessage` to record what was shown.

---

## Load order

```
1. GrayStone_Core          (shapes the menu; must precede anything reading it)
2. GrayStone_MessageUI     (window styling)
3. GrayStone_8DirMovement  (disabled; player movement only)
```

No plugin depends on another. `GrayStone_Core` is first because the menu shape
it establishes should be what any later plugin observes.
