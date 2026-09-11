# Event architecture

## Patterns

Named in the workbook, implemented in `tools/build/`. The point of a pattern is
that the guard conditions are the same every time and can be checked mechanically.

| Pattern | Shape |
|---|---|
| `PAT_MAP_ENTER` | one guarded Autorun per map; consumes its guard switch, calls `CE_024`, exits |
| `PAT_SEARCH` | two pages: page 1 searches and charges, page 2 is the already-searched state and charges nothing |
| `PAT_DOOR` | transfer or gate; a route that is not built yet says so in character rather than dead-ending |
| `PAT_SECRET_PANEL` | closed until its switch; never a silent dead end |
| `PAT_NPC_INSTANCE` | one instance per NPC per day and block; inactive instances have no graphic, no collision, no movement |
| `PAT_SCENE_AUTORUN` | cutscene controller; page 2 blank, guarded by self switch **and** a global switch |
| `PAT_CLUE_PRESENT` | zero AP, zero minutes by design |

A pattern is not a framework. A door stays a door — it is not turned into a
universal system because a system sounded tidier.

## Autorun — the hard rule

**Every Autorun must have a provable exit.** An Autorun that can stay active is a
softlock, and a softlock in a cutscene is unrecoverable without a reload.

`tools/validate/validate.js` proves it statically. A page qualifies as
terminating when it:

1. turns on a self switch or global switch that a **later page** is conditioned
   on; or
2. turns **off** a switch its own page condition requires; or
3. erases itself.

`Exit Event Processing` alone does **not** count — the page re-qualifies next
frame and runs again forever. The validator rejects it, and rejected it during
development until the pattern was corrected.

Current state: both Autoruns in the project pass, by mechanisms 1 and 2
respectively.

## Parallel Process — effectively banned

A Parallel is allowed only when continuous observation is genuinely required,
the work cannot be event-driven, there is an explicit switch guard, and the
per-frame cost is trivial.

**Gray Stone currently contains zero Parallel Process events.** The one thing
that looked like it needed one — noticing that the player arrived on a map —
is handled by a single hook in `GrayStone_Core` that arms a switch in
`Game_Map.setup`. That covers transfer, New Game and load identically, at no
per-frame cost.

Ambient animation, candles, fires and idle NPC behaviour do not need Parallel.
The validator warns on any unguarded Parallel page.

## Atomicity and repeat safety

Two failure modes matter more than any other in an investigation game: charging
the player twice, and giving the same evidence twice.

- **AP and time move together.** `CE_007` mutates AP, calls the clock and clears
  its inputs with no yielding command between them. Every exit path clears
  `Action_Minutes` and `Action_AP_Cost`, including the refusal path.
- **A search point charges once.** Page 1 does the work and sets self switch A;
  page 2 wins from then on and costs nothing. Self switches persist in the save,
  so a reload cannot re-charge it.
- **A clue is granted once.** Each clue has its own switch inside `CE_012`. A
  clue reachable from two different sources, or from a scene replayed after a
  load, still yields one key item and one counter increment.
- **A gated point charges nothing while shut.** The condition is checked *before*
  any AP is spent, and the self switch is not set, so the point stays searchable.
- **The day cannot double-advance.** `CE_005` is guarded by the day's own
  completion switch, and branches on an immutable snapshot of the day rather than
  on the variable it increments (defect D-08).

## Page order

MZ takes the **last** page whose conditions are all satisfied. So the "off" state
is page 1 and the "on" state is a later page. A high fallback page with weak
conditions can permanently shadow every page below it — the validator surfaces
Autorun pages, and page selection is exercised directly by the regression suite.

## Native conditions vs runtime branches

Native page conditions understand only: a switch, a variable ≥ constant, a self
switch, an item, an actor. A workbook condition such as `day >= 2` or
`flag_archive_access = true` is translated into a **runtime Conditional Branch**
inside the page, which native branches do support, rather than being forced into
a page condition that cannot express it.

## Generated, not copy-pasted

Repeated structures — 49 clue branches, 10 search points, the ending matrix — are
emitted by generators in `tools/build/`. They are not hand-copied, and they are
not read from a spreadsheet at runtime. Between those two extremes sits the rule:
generate at build time, ship plain MZ JSON.
