# Gray Stone — RPG Maker MZ Edition

A chamber detective story set in an English manor in 1896. Leonard Greystone
returns home after ten years; one of six maids is guilty, chosen at random once
per playthrough, and the player has ten days and five meaningful actions a day
to work out which.

No combat, no levels, no equipment, no random encounters. The loop is moving
through the house, watching people, reading documents, finding physical traces,
presenting evidence, spending time, and deciding what to do on the final night.

## Status

This is a **real RPG Maker MZ project data layer**, not a mock-up — but it is
not yet a playable build, and the reason is specific and documented.

| Layer | State |
|---|---|
| Database, registries, Common Events | generated and statically validated |
| MAP_005 Prologue (32×24) | generated, validated, cutscene logic executed |
| MAP_020 Manor Ground Floor (44×34) | generated, validated, fully reachable |
| Project plugins | written, syntax-checked |
| Evidence, time/AP, day cycle, endings | implemented and exercised |
| **RPG Maker MZ runtime + Company Assets** | **absent — see below** |
| Editor verification, play-test | **blocked on the above** |

**The single blocker:** the RPG Maker MZ core scripts (`js/rmmz_*.js`) and the
Company Assets (`img/`, `audio/`) are licensed to the holder of an RPG Maker MZ
licence and cannot live in a public repository. They are not in this repo and
were not available in the environment that built it. Everything that can be
authored without them has been. To get a runnable project:

```bash
tools/hydrate_assets.sh /path/to/RPGMZ/NewData   # from YOUR licensed install
node tools/build/index.js                        # regenerate data/ from spec/
node tools/validate/validate.js                  # static checks
node tools/verify_assets.js                      # confirm every reference resolves
# then open the folder in RPG Maker MZ
```

See [docs/ASSET_SETUP.md](docs/ASSET_SETUP.md) for the full procedure.

## How this project is built

The design workbook (`Gray Stone — RPG Maker MZ Edition.xlsx`, 69 sheets) is the
**source specification**. It is not a runtime database: nothing in the shipped
game reads a spreadsheet. It is extracted once into `spec/*.json`, and build-time
generators turn that into ordinary RPG Maker JSON.

```
workbook.xlsx ──extract──► spec/*.json ──generate──► data/*.json   (the game)
                                        └──────────► js/plugins/   (hand-written)
```

Nothing in `data/` is edited by hand. A wrong tile, a wrong portrait or a wrong
audio file is corrected in a **bindings file** and the maps are regenerated:

| File | Holds |
|---|---|
| `tools/data/tile-bindings.json` | every tile slot, with a confidence flag |
| `tools/data/face-bindings.json` | `speaker_id` + `emotion_id` → face + index |
| `tools/data/audio-bindings.json` | the 39 semantic audio slots → filenames |
| `tools/data/registry-extensions.json` | IDs the workbook references but never allocates |

## Commands

```bash
node tools/build/index.js          # spec/ -> data/
node tools/validate/validate.js    # static project validation
node tools/sim/regression.js       # 173 checks, 25 scenarios
node tools/sim/vertical-slice.js   # Day 1 end-to-end route
node tools/verify_assets.js        # asset references vs disk
python3 tools/extract_workbook.py <xlsx>   # refresh spec/ from the workbook
```

## Verifying without the engine

The proprietary runtime is absent, so the game cannot be played here. That does
not make the logic unverified: `tools/sim/` is a headless re-implementation of
the parts of MZ that Gray Stone's event logic depends on — branch, loop, label
and skip semantics mirroring `Game_Interpreter`, plus page selection and self
switches. The regression scenarios **execute the real generated command lists**.

It proves control flow, state, call graphs and termination. It does **not**
prove rendering, audio playback, plugin behaviour or runtime collision. Those
remain blocked on the editor, and are labelled as such throughout.

Definitions of done used in this repo: `SPECIFIED`, `GENERATED`,
`STATIC_VALIDATED`, `EDITOR_VERIFIED`, `RUNTIME_VERIFIED`, `BLOCKED`. See
[docs/QA.md](docs/QA.md) for what each object has actually reached, and for the
defect log.

## Documentation

| Document | Contents |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | systems, build pipeline, save schema |
| [docs/MAP_DESIGN_RULES.md](docs/MAP_DESIGN_RULES.md) | level design rules and how they are enforced |
| [docs/EVENT_ARCHITECTURE.md](docs/EVENT_ARCHITECTURE.md) | the event patterns and the Autorun/Parallel rules |
| [docs/PLUGIN_DECISIONS.md](docs/PLUGIN_DECISIONS.md) | every plugin taken and every one refused, with reasons |
| [docs/ASSET_SETUP.md](docs/ASSET_SETUP.md) | hydrating assets from a licensed install |
| [docs/FACE_BINDINGS.md](docs/FACE_BINDINGS.md) | the portrait/emotion layer |
| [docs/QA.md](docs/QA.md) | test results, status per object, defect log |
| [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) | third-party material and licences |

## Licence

Project source (everything in `data/`, `js/plugins/`, `tools/`, `docs/`, `spec/`)
is the project author's. RPG Maker MZ runtime and Company Assets are **not**
included and are governed by the RPG Maker MZ licence — see
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
