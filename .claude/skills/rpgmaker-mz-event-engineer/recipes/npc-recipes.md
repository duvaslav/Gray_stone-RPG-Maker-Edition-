# Recipes — NPCs

## 1. NPC with several states

```
VAR_QUEST_Smith:  0 unknown · 10 offered · 20 active · 30 ore found · 100 done

Page 1  [always]                    Action Button / Same as / Fixed / smith idle sprite
  ◆Text: "Forge's cold today. What do you want?"
  ◆Control Variables: [VAR_TMP_Arg0] = 10
  ◆Common Event: CE_QUEST_Smith_Set

Page 2  [Var VAR_QUEST_Smith >= 10] Action Button / Same as / same sprite
  ◆Common Event: CE_NPC_Smith_Talk

Page 3  [Var VAR_QUEST_Smith >= 100] Action Button / Same as / smith-with-finished-sword sprite
  ◆Text: "That blade's the best work I've done in years."
```

**Why:** pages are scanned bottom-up and the highest match wins, so page 3 covers `>= 100`,
page 2 covers `10..99`, page 1 covers `0..9`. Each page implicitly spans up to the next
threshold — this is the whole technique.

**Split into pages only when something visible changes** (sprite, movement, priority, trigger).
Stages 10/20/30 all look identical, so they share page 2 and branch inside
`CE_NPC_Smith_Talk`. Ten near-identical pages is worse than one page with a branch.

---

## 2. Conditional dialogue

Inside `CE_NPC_Smith_Talk` — **test the highest state first**:

```
◆Conditional Branch: Var VAR_QUEST_Smith >= 30
  ◆Text: "You found it! Hand it here."
  ◆Change Items: Iron Ore -1
  ◆Change Weapons: Iron Sword +1
  ◆Control Variables: [VAR_TMP_Arg0] = 100
  ◆Common Event: CE_QUEST_Smith_Set
◆Else
  ◆Conditional Branch: Var VAR_QUEST_Smith >= 20
    ◆Text: "Still no ore? The mine's east of here."
  ◆Else
    ◆Text: "Bring me iron ore and I'll make you a blade."
    ◆Show Choices: [I'll do it, Not now]
      ◆When I'll do it:
        ◆Control Variables: [VAR_TMP_Arg0] = 20
        ◆Common Event: CE_QUEST_Smith_Set
      ◆When Not now:
        ◆Text: "Suit yourself."
  ◆
◆
```

**Why highest-first:** every test is `>=`, so a lower test also matches a higher state. Testing
low-to-high would make stage 100 fall into the "bring me ore" branch.

---

## 3. NPC schedule (day parts)

**Do not move one NPC around the map.** Place a separate event at each location and gate
presence with threshold pages.

```
VAR_SYS_TimeOfDay:  0 morning · 1 day · 2 evening · 3 night

House map, event NPC_Miller_Home
  Page 1  [always]                       present, sprite, ◆Common Event: CE_NPC_Miller_Talk
  Page 2  [Var VAR_SYS_TimeOfDay >= 1]   blank, no commands

Shop map, event NPC_Miller_Shop
  Page 1  [always]                       blank
  Page 2  [Var VAR_SYS_TimeOfDay >= 1]   present, ◆Common Event: CE_NPC_Miller_Talk
  Page 3  [Var VAR_SYS_TimeOfDay >= 2]   blank

Tavern map, event NPC_Miller_Tavern
  Page 1  [always]                       blank
  Page 2  [Var VAR_SYS_TimeOfDay >= 2]   present, ◆Common Event: CE_NPC_Miller_Talk
  Page 3  [Var VAR_SYS_TimeOfDay >= 3]   blank

Plus, on every instance, a highest page:
  Page 4  [Switch SW_STORY_MillerGone]   blank
```

**Why this beats movement:** no pathfinding, no parallel, works while the player is on another
map (where a walking NPC would freeze — autonomous movement only runs when
`isNearTheScreen()`), and each instance keeps its own local state. The player perceives exactly
the intended thing: he is somewhere different at different times.

**Why "present at `>= N`, blank at `>= N+1`":** there is no `<` page condition. A higher blank
page is how you express an upper bound.

**One Common Event for the dialogue** so his words live in one place across three maps. It
inherits each caller's event ID, so it can still set that instance's self switches.

The clock is one gated Parallel Common Event with `Wait: 60` — see
`triggers-and-sensors.md#4`.

---

## 4. Patrol

```
Page 1  [always]   Action Button / Same as Characters / Custom movement
        Speed 3, Frequency 5
        Move Route:  repeat = ON,  skippable = ON
          Move Left ×4, Turn Right, Wait 60, Move Right ×4, Turn Left, Wait 60
  ◆Text: "Move along."
```

**`skippable = ON` is mandatory.** Without it, one blocked step stalls the route permanently
(`advanceMoveRouteIndex` does not advance on a failed move) and the guard freezes mid-corridor
for the rest of the game.

**Pace with `Wait` steps inside the route, not with move frequency.** Frequency controls the
gap between autonomous steps; set it to 5 (no gap) and put explicit waits at the turning
points, which reads far more deliberately.

The patrol survives interruption: `forceMoveRoute` memorises the autonomous route and
`processRouteEnd` restores it, so a guard pulled into a cutscene resumes patrolling afterwards.

---

## 5. Guard — patrol, chase, return, friendly

The full system. Four pages, one gated sensor, hysteresis on the radii.

```
Page 1  [always]                          PATROL
        Custom route (repeat + skippable), Speed 3, Same as Characters, Action Button
  ◆Text: "Keep your distance."

Page 2  [Switch SW_SYS_StealthOn]         SENSOR  (Parallel)
        Same graphic, Custom route (as page 1)
  ◆Comment: Detect at <=5; sets Self Switch A (CHASE) and thereby kills this page.
  ◆Common Event: CE_UTIL_PlayerDistance      → VAR_TMP_Dist, VAR_TMP_DX, VAR_TMP_DY
  ◆Conditional Branch: Var VAR_TMP_Dist <= 5              ← cheap early-out first
    ◆Get Location Info: [VAR_TMP_RegE], Region ID, at This Event
    ◆Get Location Info: [VAR_TMP_RegP], Region ID, at Player
    ◆Conditional Branch: Var VAR_TMP_RegE == VAR_TMP_RegP  ← same room = line of sight
      ◆Conditional Branch: Script: <facing-cone test, below>
        ◆Play SE: Flash1
        ◆Set Movement Route: This Event [Wait ON] — Turn toward Player
        ◆Show Balloon Icon: This Event, Exclamation [Wait ON]
        ◆Set Movement Route: This Event [Wait ON] — 1 Step Backward
        ◆Control Self Switch: A = ON
      ◆
    ◆
  ◆
  ◆Wait: 10                                                ← indent 0, always runs

Page 3  [Self Switch A]                   CHASE
        Approach movement, Speed 4, Frequency 5, Event Touch
  ◆Text: "Got you!"
  ◆Transfer Player: (jail / scene start)
  ◆Control Self Switch: A = OFF

Page 4  [Self Switch A] + [Self Switch B]  — see note
Page 4  [Switch SW_STORY_GuardsFriendly]  FRIENDLY
        Fixed, Action Button, normal sprite
  ◆Text: "Good to see a friendly face."
```

The escape watcher belongs on the chase page as a second parallel — but a page has one
trigger, so use a **separate companion event** placed on the same tile, or run the escape check
from the map's single controller:

```
SYS_GuardController  Page 1 [Self Switch A of guard is irrelevant here — gate on SW_SYS_Chase]
  Parallel:
  ◆Common Event: CE_UTIL_PlayerDistance (for the guard)
  ◆Conditional Branch: Var VAR_TMP_Dist >= 9              ← give up radius > detect radius
    ◆Script: $gameSelfSwitches.setValue([$gameMap.mapId(), 7, "A"], false)
    ◆Show Balloon Icon: Event 7, Question [Wait OFF]
  ◆Wait: 15
```

**The three things that make this feel good:**

1. **Hysteresis** — detect at ≤5, give up at ≥9. Equal radii make the guard flicker between
   chase and patrol at the boundary. This single detail is the difference between chase
   behaviour that feels alive and one that feels broken.
2. **The sensor destroys its own page.** Setting Self Switch A makes page 3 the active page, so
   the parallel stops instantly. Zero cost while chasing.
3. **The reaction beat** — pause, turn, SE, balloon, step back, *then* act. See
   `../references/event-presentation.md`.

**Page 4 is highest**, so the story flag overrides every behaviour state with no extra logic.

**A note on the linter:** `validate_events.py` will report `many-parallels` for this event,
because it counts three Parallel *pages*. Only one can ever be active — page selection takes
the highest matching page, and the sensor/chase/return pages are mutually exclusive by
construction. This is the intended shape; acknowledge the warning and move on. It is a genuine
warning wherever the parallel pages are *not* mutually exclusive, which the linter cannot
distinguish.

**Patrolling four points** rather than two is the same page with a longer route:
`Move Right ×4, Turn Down, Wait 45, Move Down ×4, Turn Left, Wait 45, Move Left ×4, Turn Up,
Wait 45, Move Up ×4, Turn Right, Wait 45` with `repeat = ON, skippable = ON`. The route returns
the guard to its start tile, so `repeat` closes the circuit cleanly.

Facing-cone test as a Conditional Branch → Script (`this` is the interpreter):

```js
(function(){
  const e = this.character(0), p = $gamePlayer;
  const dx = p.x - e.x, dy = p.y - e.y;
  switch (e.direction()) {
    case 2: return dx === 0 && dy > 0;    // facing down
    case 8: return dx === 0 && dy < 0;    // facing up
    case 4: return dy === 0 && dx < 0;    // facing left
    case 6: return dy === 0 && dx > 0;    // facing right
  }
  return false;
}).call(this)
```

Widen the cone by allowing `Math.abs(dx) <= 1` instead of `dx === 0`.

---

## 6. Quest NPC

Dialogue in a Common Event, state changes through the dispatcher, never both in the map event.

```
Map event NPC_Sage (on each map where he appears)
  Page 1  [always]                        ◆Common Event: CE_NPC_Sage_Talk
  Page 2  [Var VAR_QUEST_Relic >= 100]    different sprite, ◆Common Event: CE_NPC_Sage_Talk
  Page 3  [Switch SW_STORY_SageGone]      blank
```

**Why the map event is nearly empty:** it decides *which* conversation applies (via pages) and
delegates the words. Editing his dialogue is then one file, not three map files.

See `quests-and-flow.md#2` for the dispatcher.

---

## 7. Blocker

```
Page 1  [always]                     Action Button / Same as Characters / guard sprite
  ◆Set Movement Route: This Event [Wait ON] — Turn toward Player
  ◆Text: "Nobody enters without the seal."

Page 2  [Switch SW_QUEST_HasSeal]    Action Button / Same as Characters / guard sprite
  ◆Text: "The seal. Go on through."
  ◆Set Movement Route: This Event [Wait ON] — Move Left, Turn Right
  ◆Control Self Switch: A = ON

Page 3  [Self Switch A]              Action Button / Same as Characters / stood-aside position
  ◆Text: "Mind yourself in there."
```

**Why priority, not map data:** the guard blocks because `priorityType == 1` and Through is OFF
(`isCollidedWithEvents` only counts normal-priority, non-Through events). Editing tile
passability would not persist and could not be toggled.

**Placement matters:** a one-tile NPC in a three-tile corridor blocks nothing. Either narrow the
corridor or use several blocker events.

Page 3 exists because the guard physically moved on page 2 — the new page records the
"stood aside" state so re-entering the map does not reset him to the doorway.

---

## 8. Day/night reaction

The cheapest characterisation in the game — one branch:

```
◆Conditional Branch: Var VAR_SYS_TimeOfDay >= 3
  ◆Text: "You're up late. Something on your mind?"
◆Else
  ◆Conditional Branch: Var VAR_SYS_TimeOfDay >= 2
    ◆Text: "Evening. Long day."
  ◆Else
    ◆Text: "Morning to you."
  ◆
◆
```

Add this to five NPCs and a town feels twice as alive for fifteen commands total. Again:
highest state first, because every test is `>=`.
