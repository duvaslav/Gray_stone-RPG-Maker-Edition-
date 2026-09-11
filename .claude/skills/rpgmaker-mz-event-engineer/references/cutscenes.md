# Cutscene Eventing

A cutscene is a bounded sequence in which the game takes control, changes the world, and hands
control back **in a clean state**. Most cutscene bugs are teardown bugs.

---

## 1. Anatomy

```
1. GUARD      does this scene fire, and only once?
2. LOCK       take control; hide/park what should not be visible
3. SETUP      position actors, set facings, prime the camera
4. BEATS      the scene itself, in stages
5. TEARDOWN   restore every setting the scene changed
6. RELEASE    give control back; advance state; disarm the guard
```

Write these as six labelled sections with Comments even in a short scene. In a long one,
each stage becomes a Common Event.

---

## 2. Guard — fire once and only once

```
Event: CUT_Throne (invisible, priority Below Characters)
Page 1  Condition: Switch [CUT_ThroneReady] ON        Trigger: Autorun
        ◆Comment: Throne arrival. Entry SW CUT_ThroneReady. Exit SW OFF + Var STORY >= 30.
        ◆(scene)
        ◆Control Variables: [STORY] = 30
        ◆Control Switches: [CUT_ThroneReady] = OFF     ← last line, indent 0
Page 2  Condition: Variable [STORY] >= 30              Trigger: Action Button, empty list
```

Page 2 exists so that after the scene the event is inert and cannot re-arm even if the switch
is set again by accident.

Alternatives to an Autorun guard:
- **Player Touch** on the doorway tile + Self Switch A at the end — for positional scenes the
  player must walk into. No global switch needed.
- **Variable threshold Autorun** — for scenes gated purely by story progress.

Never gate a cutscene on *only* an item or party condition that the player can lose.

---

## 3. Lock — take control properly

```
◆Control Switches: [SYS_ClockPaused] = ON        ← pause your own global parallels
◆Change Menu Access: Disable
◆Change Save Access: Disable                     (optional; for scenes with no safe save point)
◆Change Encounter: Disable
◆Change Player Followers: OFF                    ← or Gather Followers if they should be seen
```

Notes:
- Autorun already blocks player input. You do **not** need a "player can't move" hack.
- Followers are the most common visual bug: they stand in a conga line behind the hero during a
  dramatic scene, and they physically block move routes. Either `Change Player Followers: OFF`
  or `Gather Followers` before positioning. `Gather Followers` waits indefinitely if a follower
  cannot reach the player — gather *before* you move the player somewhere awkward.
- Pause your own parallel systems (clock, weather ticks, HUD) with their gate switch.
- Save/resume the music around the scene with `Save BGM` … `Resume BGM`.

---

## 4. Setup — deterministic positioning

Never assume where anyone is standing.

```
◆Set Event Location: Event 3 (Guard A), (12, 4), Direction Down
◆Set Event Location: Event 4 (Guard B), (14, 4), Direction Down
◆Set Movement Route: Player [Wait ON] — Turn Left
```

`Set Event Location` teleports instantly and ignores passability, so it always succeeds. Use it
for everyone who must start at a known spot — including actors who will then walk in from
off-screen (park them off the visible area first).

Getting the player somewhere specific is trickier, because you cannot teleport the player
within a map with `Set Event Location`. Options: `Transfer Player` to the same map at the
target coordinates with `fadeType: none`; or fade out, transfer, fade in; or design the trigger
tile so the player is already where you need them.

---

## 5. Beats — pacing

The difference between an amateur and a professional scene is entirely in the pauses.
See `event-presentation.md` for the full treatment. The core rule:

> **Show intent before showing text.** A character reacts, *then* speaks.

```
◆Wait: 20                                   beat
◆Set Movement Route: Event 3 [Wait ON] — Turn toward Player
◆Play SE: Surprise
◆Show Balloon Icon: Event 3, Exclamation [Wait ON]
◆Wait: 10
◆Text: "You... you came back."
```

Structure long scenes in stages with Comments or Common Event calls, and put a `Wait` between
stages rather than between every line.

---

## 6. Multi-actor choreography

Use non-waiting routes for everyone but the last, or a switch handshake for exact
synchronisation. Full patterns in `movement-routes.md` §5.

### Four NPCs entering from four sides, simultaneously

```
◆Comment: --- SETUP: park actors off-screen ---
◆Set Event Location: Event 3, (10, 0)      north, above the visible area
◆Set Event Location: Event 4, (10, 14)     south
◆Set Event Location: Event 5, (2, 7)       west
◆Set Event Location: Event 6, (18, 7)      east

◆Comment: --- ENTRANCE: all four move at once; Through ON so nothing can block ---
◆Set Movement Route: Event 3 [Wait OFF] — Through ON, Move Down ×5, Through OFF, Turn Down
◆Set Movement Route: Event 4 [Wait OFF] — Through ON, Move Up   ×5, Through OFF, Turn Up
◆Set Movement Route: Event 5 [Wait OFF] — Through ON, Move Right×6, Through OFF, Turn Right
◆Set Movement Route: Event 6 [Wait ON ] — Through ON, Move Left ×6, Through OFF, Turn Left
```

Event 6's route is the longest (6 steps), so it is the one that waits. If they were of unequal
length you would use the switch handshake instead.

**Through ON during the walk is what makes this reliable** — the player, followers and each
other cannot block the entrance.

### Camera

```
◆Scroll Map: Right, 4 tiles, Speed 4, Wait ON
```

Scroll Map moves the view away from the player and **does not automatically return**. The view
snaps back the next time the player moves. To restore it deliberately, scroll back by the same
amount before releasing control. `Scroll Map` returns false and waits if a scroll is already in
progress, so consecutive scrolls are safe.

---

## 7. Teardown — the checklist people skip

Restore everything the scene changed. A missed line here is a bug that shows up three hours
later in an unrelated place.

- [ ] Actor **positions** — `Set Event Location` back, or let page changes handle it.
- [ ] Actor **graphics** (`Change Image` in a route) restored.
- [ ] **Through** turned back OFF on every actor that had it ON.
- [ ] **Opacity / blend mode / speed / frequency / direction fix / walk & step anime** restored.
- [ ] **Transparency** of the player (`Change Transparency`) restored.
- [ ] **Followers** shown again (`Change Player Followers: ON`).
- [ ] **Screen tint** back to `(0,0,0,0)` — or deliberately left, if the story says so.
- [ ] **Weather** cleared.
- [ ] **Pictures** erased — every picture ID the scene used.
- [ ] **Camera** scrolled back.
- [ ] **BGM** resumed (`Resume BGM`) or a new one started deliberately.
- [ ] **Menu / Save / Encounter access** re-enabled.
- [ ] **Your paused parallels** re-enabled.
- [ ] **State advanced** (variable/switch) so the scene is now historically "done".
- [ ] **Guard disarmed** so it cannot replay.

Because this list is long and identical for every scene, make two Common Events:
`CE_CUT_Begin` and `CE_CUT_End`, and call them at the top and bottom of every cutscene. Then
the checklist is enforced by construction and you fix it once for the whole game.

---

## 8. Robustness

- **Interruption:** the player can save immediately after the scene. Ensure the world state at
  that moment is coherent — no actor left with Through ON in the middle of a wall.
- **Re-entry:** if the player leaves the map mid-scene (they cannot, during Autorun — but they
  can if you used Parallel by mistake), the scene must not resume half-done. Use Autorun for
  anything with a state change.
- **Order:** advance the story variable *before* the final switch-off, so a crash between them
  leaves the scene "done" rather than replayable.
- **Cutscene actors that must not be interacted with afterwards** — `Erase Event` them, or give
  them a higher blank page conditioned on the story variable. Prefer the page: `Erase Event` is
  forgotten when the map reloads.
- **Skip support:** if the project offers scene skipping, every skip path must run the same
  teardown. Another argument for `CE_CUT_End`.

---

## 9. Reading an existing cutscene

When asked to modify one:
1. Identify the guard (which switch/variable/self switch arms it) and its exit.
2. Map the actors: every Event ID referenced by `Set Movement Route` / `Set Event Location` /
   `Show Balloon Icon` / `Show Animation`.
3. List every setting the scene changes, and check each is restored.
4. Only then edit — and re-verify the teardown list, because inserting a beat that changes a
   setting adds a new teardown obligation.
