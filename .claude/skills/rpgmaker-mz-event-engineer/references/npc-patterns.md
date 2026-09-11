# NPC Patterns

Concrete architectures for NPC behaviour. Ready-to-build versions of several of these are in
`recipes/npc-recipes.md`.

---

## 1. Static NPC

One page, Action Button, priority Same as Characters, movement Fixed. Set `image.direction` to
the facing you want at rest. Add **Stepping Animation** if the NPC should look alive.

If the NPC should not swivel to face the player when talked to, set **Direction Fix** — that
suppresses `Game_Event.lock()`'s `turnTowardPlayer`.

## 2. Random wanderer

Movement type **Random**, frequency 2–3 (lower is calmer), speed 3. Priority Same as
Characters so the player cannot walk through them.

Remember: autonomous movement only runs while the event `isNearTheScreen()`. Off-screen
villagers stand still — never build logic that assumes they wandered somewhere.

Confine wanderers with map geometry, not with logic. If they must not leave a plaza, put
impassable tiles or Same-priority events at the boundary.

## 3. Patrol (fixed route)

Movement type **Custom**, with a `moveRoute` that has `repeat: true` and `skippable: true`.

```
Move Left ×4, Turn Right, Wait 60, Move Right ×4, Turn Left, Wait 60
```

- `skippable: true` is essential. Without it, one blocked step stalls the patrol permanently
  (the index never advances) and the guard freezes mid-corridor for the rest of the game.
- `repeat: true` makes it loop; the route index wraps to 0 at the end.
- Add `Wait` steps at the turning points — a guard that pivots instantly looks mechanical.
- Frequency affects the *gap between* autonomous steps; for a smooth patrol use frequency 4–5
  and control pacing with explicit `Wait` steps inside the route instead.

Patrol interacts correctly with forced routes: `forceMoveRoute` memorises the patrol and
`processRouteEnd` restores it, so a guard interrupted for dialogue resumes patrolling from
where it was.

## 4. Approach / chaser

Movement type **Approach**. Understand what it actually does
(`Game_Event.moveTypeTowardPlayer`):

- Only homes in when the player is within **Manhattan distance 20**; beyond that it moves
  randomly.
- Even when homing, it is 4/6 toward the player, 1/6 random, 1/6 forward — deliberately
  imperfect.
- It is **not pathfinding**: it walks into walls and gets stuck in concave geometry.

For a chaser that must navigate, use a gated Parallel that runs
`this.character(0).moveTowardCharacter($gamePlayer)` (same primitive) or, for real pathing,
`findDirectionTo` + `moveStraight` — capped at 12 tiles by `searchLimit()`. Pathfinding is the
most expensive thing you can do per frame; only ever run it for the one event actively chasing,
and throttle it to every 5–10 frames.

Pair with trigger **Event Touch** so the chaser catching the player fires the event.

## 5. Multi-state NPC

Pages as states, conditions as guards. See `event-state-machines.md`.

```
Page 1  (no conditions)              stranger — generic line
Page 2  Var QUEST_X >= 10            offering the quest, different sprite/pose
Page 3  Var QUEST_X >= 20            in progress — reminder line
Page 4  Var QUEST_X >= 100           post-quest idle
Page 5  Switch SW_Story_NPCGone      blank graphic, empty list — gone for good
```

Split into pages only when the **graphic, movement, priority or trigger** differs. If only the
words differ, use one page with a Conditional Branch, or call a dialogue Common Event.

## 6. Scheduled NPC

**Do not move an NPC around the map on a schedule.** Place a separate event at each location
and control presence with page conditions on a time variable. It is cheaper, needs no
pathfinding, works while the player is elsewhere, and each copy can carry its own local state.

```
SYS_TimeOfDay:  0 morning · 1 day · 2 evening · 3 night

House event      Page 1 (none)                    present (morning)
                 Page 2 Var SYS_TimeOfDay >= 1    blank

Shop event       Page 1 (none)                    blank
                 Page 2 Var SYS_TimeOfDay >= 1    present
                 Page 3 Var SYS_TimeOfDay >= 2    blank

Tavern event     Page 1 (none)                    blank
                 Page 2 Var SYS_TimeOfDay >= 2    present
                 Page 3 Var SYS_TimeOfDay >= 3    blank
```

Because pages are `>=` thresholds scanned bottom-up, "present only during period N" is always
"present at `>= N`, blank at `>= N+1`". Share the dialogue between all copies via one Common
Event so there is one place to edit.

If the player must *see* the NPC walk between locations, that is a scripted scene at a specific
time and place — build it as a cutscene, not as a general schedule system.

## 7. NPC that notices the player

The layered sensor, in order of cost:

1. **Event Touch trigger** — free. The NPC notices only on contact. Adequate for most cases.
2. **Approach movement + Event Touch** — free, and reads as pursuit.
3. **Gated proximity parallel** — for a detection radius. See `spatial-eventing.md` §7.
4. **Vision cone** — direction + axis + region test. Only for stealth sections.

Whatever the sensor, the *reaction* should be the choreographed beat from
`event-presentation.md`: pause → turn → balloon + SE → step → act.

## 8. Guard with chase and return

Four pages, one gated sensor, hysteresis on the radii.

```
Page 1  (none)                       PATROL   — Custom repeat+skippable route
                                                + Parallel sensor gated by SW_SYS_Stealth
Page 2  Self Switch A                CHASE    — Approach movement, Event Touch → caught
                                                + Parallel that watches for escape
Page 3  Self Switch B                RETURN   — forced route home, then clear A and B
Page 4  Switch SW_Story_Friendly     FRIENDLY — normal NPC, Action Button
```

Key details:
- Detect at distance ≤ 5, give up at distance ≥ 9. Equal radii cause flicker at the boundary.
- The sensor sets Self Switch A and thereby **destroys its own page**, so it stops immediately.
  That is the cleanest possible one-shot.
- The RETURN page's route needs `skippable: true` and should end by clearing both self
  switches, returning the guard to page 1 and its patrol.
- Page 4 is highest, so the story flag overrides every behaviour state.
- Give up-time as well as distance: a `Control Timer` or a counter variable so a guard that
  cannot reach the player eventually resets.

## 9. Blocker

An NPC that refuses passage until a condition is met.

```
Page 1  (none)             priority Same as Characters, Action Button
                           "You can't go in there."
Page 2  Switch SW_Permit   priority Same as Characters, moved aside via Set Event Location,
                           or blank graphic + Through ON
```

Do **not** implement a blocker by making the corridor impassable and swapping tiles — that is
map data and it will not persist. Use the event's priority. Remember an event with no matching
page automatically gets Through ON, so a blank page 2 is enough to open the way.

Place blockers so the player cannot walk around them: a one-tile NPC in a three-tile corridor
blocks nothing.

## 10. Companion / follower NPC

Vanilla RPG Maker has no "NPC follows me" feature. Honest options:

- **Add the character to the party** (`Change Party Member`) and let the follower system do it.
  Almost always the right answer. Combine with `Change Player Followers` for cutscene control.
- **A gated Parallel** that runs `Set Movement Route: Event n → Move toward Player` every ~10
  frames. Cheap, but it clips corners and gets stuck; acceptable for a short escort in an open
  area.
- **A scripted escort**: the "companion" is a series of separate events, one per map segment,
  each running a fixed choreographed route. More work but perfectly reliable and much better
  looking. Use this for story escorts.

A plugin is genuinely justified when you need a persistent, path-finding, multi-map companion.

## 11. NPC with memory

- **"Have we met?"** → Self Switch A on that event.
- **"Have you told me this today?"** → Self Switch B, cleared by the day-change system (needs a
  script call to clear another event's self switch, or a "day" variable compared against a
  per-NPC variable).
- **"How many times have I talked to you?"** → a counter variable, with dialogue branches at
  thresholds and a cap so it stops growing.
- **"Do you know about X?"** → a global switch, because several NPCs share the fact.

Prefer local memory. Global switches for "has spoken to the innkeeper" is how projects end up
with 400 switches.

## 12. Crowd hygiene

- Do not give twenty villagers twenty Parallel events. One map controller, or none at all.
- Give ambient NPCs low move frequency; a village of frequency-5 wanderers looks frantic.
- Reuse one dialogue Common Event with a `Control Variables → Random` roll for flavour lines
  instead of authoring twenty unique events.
- Name events meaningfully in the editor (`NPC_Innkeeper`, not `EV023`). It costs nothing and
  it is the only label a future maintainer gets.
