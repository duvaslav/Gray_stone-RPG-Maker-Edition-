# Event Linting

`scripts/validate_events.py` performs static analysis over every map event, common event and
troop event in a project. Use it before committing changes, and when auditing an unfamiliar
project.

```bash
python3 scripts/validate_events.py <project-root>
python3 scripts/validate_events.py <project-root> --map 12 --map 13
python3 scripts/validate_events.py <project-root> --level error
python3 scripts/validate_events.py <project-root> --quiet   # exit code only
```

Exit code 1 if any ERROR was found, else 0 — usable in a pre-commit hook.

---

## Severity model

| Level | Meaning | What to do |
|---|---|---|
| **ERROR** | A definite defect: corrupt structure, a dangling reference, or a construct that will freeze the game or silently do nothing. | Fix it. |
| **WARN** | A probable defect that depends on intent. | Read it, decide, and either fix or consciously accept. |
| **INFO** | Style and maintainability. | Never "fix" these automatically. Raise them, let the human decide. |

**Do not bulk-apply fixes.** A linter cannot know that a blank page is deliberate, or that a
parallel genuinely needs per-frame precision. Report findings with the reasoning and fix only
what is clearly wrong or what the user asked for.

---

## ERROR checks

### Structure
| Code | Detects |
|---|---|
| `empty-list` | A command list with zero entries. RPG Maker expects at least `[{code:0,indent:0}]` |
| `no-terminator` | The list does not end with `{code:0, indent:0}` — the editor may fail to load or re-save it |
| `bad-indent` | A missing, non-integer or negative `indent` |
| `indent-jump` | Indent increases by more than 1 between consecutive commands. `skipBranch()` walks indents, so control flow will be silently wrong |
| `unclosed-block` | A `111`/`102`/`112`/`301` opener with no matching `412`/`404`/`413`/`604` |
| `orphan-block` | A `411`/`412`/`402`/`404`/`413`/`60x` with no opener |
| `block-mismatch` | A continuation that does not belong to the innermost open block |
| `block-indent` | A continuation or terminator whose indent differs from its opener's |
| `route-mirror` | A `205` whose count of following `505` lines does not match its route steps. The route runs correctly but the **editor shows it as empty and destroys it on the next save** |
| `route-repeat-wait` | A move route that is both `repeat` and `wait` — the caller waits for a route that never ends |
| `loop-no-escape` | A `Loop` containing neither a wait-class command nor `Break Loop`/`Exit Event Processing`. Burns 100 000 commands per frame (`checkFreeze`); the game looks frozen |
| `missing-label` | `Jump to Label` naming a label that does not exist in this list |

### References
| Code | Detects |
|---|---|
| `bad-switch-id` / `bad-variable-id` | An ID outside `0 < id < $dataSystem.<array>.length`. `setValue` **silently ignores** these, so the command does nothing and reads always return OFF/0 |
| `missing-common-event` | `Common Event` calling an ID that does not exist |
| `missing-event-ref` | `Set Movement Route` / `Set Event Location` / `Show Animation` / `Show Balloon Icon` targeting an Event ID that is not on that map |
| `bad-parameters` | A command whose `parameters` array is the wrong shape for its code |
| `mv-plugin-command` | Command `356` in an MZ project. MZ's `pluginCommand` is a no-op stub, so it does **nothing**, silently — the most common MV→MZ porting failure |

### Semantics
| Code | Detects |
|---|---|
| `autorun-no-exit` | An Autorun page with no `Control Switches`, `Control Variables`, `Control Self Switch`, `Transfer Player`, `Erase Event`, script `setValue` or plugin command. Autorun restarts every frame until its page stops matching — this is a permanent freeze |
| `autorun-empty` | An Autorun page whose list has length ≤ 1. It can never start (`Game_Event.start()` requires length > 1) yet it still overrides every lower page |
| `parallel-ce-no-switch` | A Parallel Common Event with no gate switch — it runs on every map, every frame, forever |
| `ce-recursion` | A cycle in the Common Event call graph. Depth is capped at 100, then the engine throws `"Common event calls exceeded the limit"` |

---

## WARN checks

| Code | Detects | Why it might be fine |
|---|---|---|
| `autorun-conditional-exit` | Every state-changing command in an Autorun sits inside an indented block | The branches may be exhaustive — but check every path |
| `route-stall-risk` | A move route with `wait` and without `skippable` that contains movement steps. **Suppressed** when the route turns Through ON before its first movement step, since such a route cannot be blocked | The path may otherwise be provably clear |
| `loop-no-wait` | A `Loop` with a `Break Loop` but no yielding command | The break may be hit on the first iteration |
| `parallel-no-wait` | A Parallel page/CE with no yielding command | Genuine per-frame needs exist (input polling, custom movement) |
| `parallel-wait-indented` | Every yielding command in a Parallel is inside a conditional | Rarely intentional |

"Yielding" is evaluated per command, not by code alone: `Wait`, `Show Text` and the other
always-blocking commands, plus `Set Movement Route` whose route carries `wait: true`, plus
`Scroll Map` / `Show Animation` / `Show Balloon Icon` / `Tint` / `Flash` / `Shake` / `Weather`
when their "wait for completion" parameter is set. A parallel that ends in a waiting move route
is correctly throttled and is not reported.
| `parallel-ungated` | A Parallel page with no page conditions | A map-lifetime system may be intended — but a gate is nearly always better |
| `multiple-autoruns` | More than one Autorun page on a map | Their conditions may be mutually exclusive. If not, only the lowest Event ID ever runs |
| `many-parallels` | More than two Parallel pages on one map | **Counts pages, not simultaneously-active parallels.** A behaviour state machine (guard: sensor / chase / return) has several Parallel pages that are mutually exclusive by page selection — that is the intended shape. Genuine wherever the pages *can* be active together |
| `action-button-priority` | An Action Button page whose priority is not "Same as Characters" | Deliberate for floor events the player stands on |
| `selfswitch-unused` | A Self Switch is set but no page of that event uses it as a condition | Another event may read it by script — but usually a missing page condition |
| `selfswitch-no-event` / `erase-no-event` | `Control Self Switch`, a Self Switch condition, or `Erase Event` inside a Common Event or Troop event | Fine **if** always invoked via command 117 from a map event on the current map; a no-op otherwise |

---

## INFO checks

`empty-page`, `empty-page-with-graphic` (confirm the hide is intentional and note that the page
overrides lower pages) · `touch-priority` (touch trigger with Same-as-Characters priority fires
on bump, not on standing) · `huge-page` (>300 commands — consider decomposing) ·
`duplicate-logic` (identical command-code structures across events — extract a Common Event) ·
`unnamed-event` (a substantial event still called `EV0xx`) · `unnamed-switch` /
`unnamed-variable` (repeatedly-written IDs with no name in `System.json` — magic numbers) ·
`selfswitch-external` (a self switch used as a page condition but never set by that event —
verify the external script call exists) · `parallel-empty`.

---

## What the linter cannot see

Be explicit about the blind spots when reporting results:

- **Whether an Autorun's exit is actually reachable.** It checks that a state change exists,
  not that every path reaches it. Trace branches by hand.
- **Whether page conditions overlap** in a way that makes a page unreachable. `>=` thresholds
  and bottom-up selection need human reading.
- **Whether a Switch ID is the *right* one.** A near-miss ID is valid and silently wrong.
- **Semantics of script calls and plugin commands.** Their contents are opaque.
- **Map geometry.** Whether an event sits on a passable tile, whether a move route's path is
  clear, whether a blocker actually blocks.
- **Cross-map references** in script calls with hard-coded `[mapId, eventId]` keys.
- **Whether a design is good.** It finds defects, not architecture problems.

---

## Recommended review workflow for an unfamiliar project

```bash
python3 scripts/inspect_project.py <root> --free-ids     # engine, IDs, plugins, census
python3 scripts/validate_events.py <root>                # everything
python3 scripts/validate_events.py <root> --level error  # triage
python3 scripts/inspect_project.py <root> --map <n>      # read the suspect map as pseudo-code
```

Then report in this order:
1. **Errors**, grouped by cause, with the concrete consequence of each.
2. **Warnings that are probably real**, with the reasoning that makes them probable.
3. **Architectural observations** the linter cannot make: switch farms that should be state
   variables, duplicated logic, ungated systems, missing cutscene teardown.
4. **A recommended fix order**, cheapest-and-most-dangerous first.

Do not present the raw output as the answer. Interpret it.
