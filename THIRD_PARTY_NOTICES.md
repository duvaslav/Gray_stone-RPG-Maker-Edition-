# Third-party notices

## Summary

Gray Stone ships **no third-party plugin code**. Every plugin in `js/plugins/`
was written for this project. The only third-party material involved is the RPG
Maker MZ engine itself, which is not contained in this repository, and the
build-time skill toolkits, which are not part of the game.

---

## RPG Maker MZ — engine, runtime and Company Assets

| | |
|---|---|
| **Author / publisher** | Gotcha Gotcha Games / KADOKAWA |
| **Used for** | the engine the game runs on; core scripts; stock tilesets, character sheets, facesets and audio |
| **Version** | determined by the user's installation — record it here after hydrating |
| **Licence** | RPG Maker MZ End User Licence Agreement |
| **Commercial use** | permitted for games made with a valid licence, subject to the EULA |
| **In this repository** | **NO.** Excluded by `.gitignore`. |
| **Credit required** | the EULA requires the engine to be credited in the finished game |

The core scripts and Company Assets are licensed to the licence holder, not
redistributable in a public repository. See [docs/ASSET_SETUP.md](docs/ASSET_SETUP.md).

**Before release**, confirm the EULA version in force for your installation and
add the required engine credit to the title or credits screen.

---

## Project plugins — first-party

| Plugin | Purpose | Author | Licence |
|---|---|---|---|
| `GrayStone_Core.js` | map-entry guard, menu shaping, autosave safety | this project | project source |
| `GrayStone_MessageUI.js` | styles the native message and name windows | this project | project source |
| `GrayStone_8DirMovement.js` | diagonal grid movement (ships disabled) | this project | project source |

No dependencies. No load-order constraints between them beyond
`GrayStone_Core` first, which `js/plugins.js` already reflects.

---

## Third-party plugins considered and NOT installed

Recorded so the decision is not silently revisited. Full reasoning in
[docs/PLUGIN_DECISIONS.md](docs/PLUGIN_DECISIONS.md).

| Candidate | Author | Status | Reason |
|---|---|---|---|
| Shora Lighting & Shadow System | Shora | **not installed** | native `Tint Screen` meets the current lighting brief; adding it requires a licence check, a performance test against the light-source count, and proof it reads the Gray Stone clock rather than keeping its own |
| Tyruswoo Camera Control MZ | Tyruswoo | **not installed** | the prologue's camera plan is satisfied by native `Scroll Map`; no scene yet needs more |
| Tyruswoo Altimit Movement MZ | Tyruswoo | **not installed** | true pixel movement replaces MZ's collision model and would put tile-exact triggers, transfers and cutscene staging at risk |
| any calendar / time-system plugin | — | **not installed** | Gray Stone's clock is the source of truth; a plugin keeping its own time in parallel would desynchronise schedules and lighting |
| any message-backlog plugin | — | **deferred (P1)** | worth having in a text-centred game, but only after the core dialogue system is stable, and only if native Show Text, speaker names, face bindings and save compatibility all survive |

If any of these is adopted later, record here: author, source URL, exact version
or commit, licence, commercial-use status, required credit, load order,
dependencies — and the test that showed it was needed.

---

## Build-time toolkits (not shipped in the game)

Vendored under `.claude/skills/` for reproducibility. These are development
aids; no part of them is included in a deployed build.

| Toolkit | Source | Commit |
|---|---|---|
| `rpgmaker-map-design` | https://github.com/duvaslav/rpgmaker_map_creator | `1b1e781511f41600e81645323227ed480eab1974` |
| `rpgmaker-mz-event-engineer` | https://github.com/duvaslav/rpgmaker-mz-event-engineer | `e0d43b23c83545429aba84ffff40b98ee76567f4` |
| `rpgmaker-core`, `-dialog`, `-database`, `-events`, `-consistency` | https://github.com/nightquill/rpgmaker-agent-skills | `4766c4959a747115f295f74f7ef969af584a128f` |

Consult each upstream repository for its own licence terms before redistributing
this repository's `.claude/` directory.
