# Style Guide — naming, documentation, conventions

**Rule zero: adopt the project's existing conventions.** Run
`python3 scripts/inspect_project.py <root>` and read the existing switch, variable, common
event and map event names first. A consistent project using a different scheme is better than
a project half-converted to this one. Everything below is a default for new projects or for
areas with no established convention.

---

## 1. Prefixes

### Switches
```
SW_STORY_       main plot flags               SW_STORY_Act2Begun
SW_QUEST_       quest-level booleans          SW_QUEST_SmithAccepted
SW_CUT_         cutscene arming flags         SW_CUT_ThroneArrival
SW_SYS_         system gates for parallels    SW_SYS_ClockRunning
SW_MAP_         map-local world state         SW_MAP_CryptDoorOpen
SW_DEBUG_       test-only                     SW_DEBUG_SkipIntro
```

### Variables
```
VAR_QUEST_      quest state machines          VAR_QUEST_Blacksmith
VAR_SYS_        global systems                VAR_SYS_TimeOfDay
VAR_PZ_         puzzle state                  VAR_PZ_LeverSequence
VAR_NPC_        per-NPC counters/memory       VAR_NPC_BakerLine
VAR_CNT_        counters                      VAR_CNT_HerbsCollected
VAR_TMP_        scratch — never read across a yield
VAR_ARG_ / VAR_RET_   Common Event arguments and returns
```

### Common Events
```
CE_             general                       CE_Give_Reward
CE_QUEST_       quest dispatchers             CE_QUEST_Blacksmith_Set
CE_CUT_         cutscene sections             CE_CUT_Throne_02_Confrontation
CE_SYS_         global systems (parallel)     CE_SYS_Clock
CE_UTIL_        pure helper functions         CE_UTIL_PlayerDistance
```

### Map events (the editor `name` field)
```
NPC_            people                        NPC_Innkeeper
EV_             interactive objects           EV_Chest_Cave_01
CUT_            cutscene controllers          CUT_ThroneArrival
TRG_            invisible triggers            TRG_CryptEntrance
SYS_            map-local controllers         SYS_PuzzleController
PZ_             puzzle elements               PZ_Lever_A
```

`EV001` tells a maintainer nothing. The editor name is free and is the only label anyone gets
when reading a map. Always name events that do anything.

Prefixes are a **convention, not a requirement**. Their value is that sorting the switch list
groups related flags and that `--grep QUEST` finds everything at once.

---

## 2. ID banding

Reserve ranges so IDs are self-describing and so systems do not collide:

```
Switches      1- 99   story
            100-199   quests
            200-299   cutscenes
            300-399   system gates
            400-499   map-local
            900-999   debug

Variables     1- 49   system (time, weather, difficulty)
             50-149   quest state machines
            150-199   puzzle state
            200-249   counters
            900-949   temp / arguments / returns

Pictures      1- 19   gameplay HUD
             20- 49   cutscenes
             50- 99   plugins (check what is installed)
```

Picture ID collisions between a cutscene and a plugin HUD are a real and hard-to-diagnose bug —
band them deliberately.

Leave gaps. Renumbering later is expensive because IDs live in saves and in plugin parameters.

---

## 3. Comment headers

Any event that is not obvious gets a header. This is the single highest-value habit in the
whole discipline; `Comment` (code 108/408) costs nothing at runtime.

```
◆Comment: NPC_Blacksmith — quest giver, Ironvale forge
◆Comment: TRIGGER : Action Button
◆Comment: ENTRY   : VAR_QUEST_Blacksmith (0/10/20/30/100)
◆Comment: CHANGES : VAR_QUEST_Blacksmith via CE_QUEST_Blacksmith_Set; items
◆Comment: CALLS   : CE_QUEST_Blacksmith_Set, CE_Give_Reward
◆Comment: EXIT    : state advanced one step, or unchanged on refusal
```

For a Common Event used as a function, document the signature:

```
◆Comment: CE_UTIL_PlayerDistance
◆Comment: IN  : (none — reads This Event and the player)
◆Comment: OUT : VAR_TMP_DX, VAR_TMP_DY, VAR_TMP_DIST (Manhattan)
◆Comment: SAFE: yes — no yields, safe to call from a parallel
```

For a state machine, put the value table at the top of the owning event:

```
◆Comment: VAR_QUEST_Blacksmith
◆Comment:   0 unknown · 10 offered · 20 accepted · 30 ore found · 100 done · 900 failed
```

Also comment **section breaks** in long events (`◆Comment: --- TEARDOWN ---`) and **every
script call** with what it does and why a command would not do.

---

## 4. Layout conventions

- **The Autorun exit goes last, at indent 0.** Visible in one glance, unreachable by a skipped
  branch.
- **The Parallel `Wait` goes last, at indent 0**, outside every conditional.
- **Set state after doing the work**, so a crash mid-scene leaves a truthful record.
- **Test the highest state first** in a Conditional Branch ladder, because `>=` comparisons
  overlap downward.
- **One blank Comment line** between logical sections of a long event.
- **Guard clauses early**: check preconditions and `Exit Event Processing` at the top rather
  than nesting the whole body.

---

## 5. Ownership rules

- **One writer per state variable.** Route every change through a dispatcher Common Event. This
  is what makes a five-stage, three-map quest debuggable.
- **One owner per subsystem.** The clock is owned by `CE_SYS_Clock` and nothing else writes
  `VAR_SYS_TimeOfDay`.
- **Local by default.** Reach for a Self Switch before a Switch, every time.
- **Shared words live in one Common Event**, not copy-pasted across map instances.

---

## 6. Temp variable discipline

```
VAR_TMP_*        scratch for map events and command-117 calls
VAR_PAR_TMP_*    scratch for parallel processes — a SEPARATE band
```

- Never read a temp variable across a yield (`Wait`, `Show Text`, a waiting move route). A
  parallel can run in between and clobber it.
- Snapshot arguments into locals at the top of any Common Event that yields.
- Give parallels their own band so map-event calls and parallel calls can never collide.

---

## 7. Editor hygiene

- Put invisible controller events in one corner of the map so they are easy to find.
- Give controllers a distinctive editor name and a Comment describing what they own.
- Delete dead events rather than blanking them — but never renumber the survivors.
- Keep one map's systems on that map; use Common Events for anything cross-map.
- Set `image.direction` and `pattern` deliberately on every visible event; the defaults look
  like an oversight.

---

## 8. Definition of done

An event is finished when:

- [ ] It has a Comment header (unless genuinely trivial).
- [ ] Its editor name describes it.
- [ ] Every switch and variable it touches has a name in `System.json`.
- [ ] Every state it can be in has a page or a branch, including the terminal state.
- [ ] Re-triggering it three times in a row is safe.
- [ ] Leaving the map and returning leaves it in the right state.
- [ ] Any Autorun has a guaranteed exit at indent 0.
- [ ] Any Parallel is gated and has a `Wait` at indent 0.
- [ ] Any waiting move route is skippable or provably unblockable.
- [ ] Anything a cutscene changed is restored.
- [ ] `python3 scripts/validate_events.py <root>` reports no new ERROR or WARN.
