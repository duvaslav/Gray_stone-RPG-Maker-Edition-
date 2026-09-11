# Interactive Environment Patterns

Reusable shapes for the objects that fill a map. Buildable versions are in
`recipes/interactive-objects.md`.

The two questions that determine every one of these:
1. **Is the state local or global?** (Self Switch vs Switch — see `event-architecture.md`)
2. **Should it block the player?** (priority Same as Characters vs Below Characters)

---

## Doors and gates

| Kind | Structure |
|---|---|
| **Simple map transition** | 1 page, Player Touch on the doorway tile, Below Characters, `Play SE` + `Transfer Player`. No state at all. |
| **Door that opens then transitions** | Action Button, Same as Characters: SE → Change Image (open) via route → Wait 10 → Transfer |
| **Locked door + key item** | Page 1: locked message. Page 2 (condition: Item = key): unlock scene, Self Switch A. Page 3 (Self Switch A): open graphic, Through ON, transition |
| **Locked door + switch** | Page 2 conditioned on the switch instead of the item |
| **One-way door** | The far side has no matching event; use map passability for the return block |
| **Gate opened elsewhere** | Page 2 conditioned on a global Switch, since the opener is a different event on a different map |

Key detail: whether the door is **passable when open**. Either give the open page priority
Below Characters (walk over it) or Same as Characters with **Through ON** (walk through it).
A door that stays solid after opening is the most common bug in this family.

For a locked door, **consume the key or not?** Decide deliberately — a key item consumed on use
means the door cannot be re-locked; a key kept means the player carries clutter. For doors that
stay open, checking the item on page 2 and *not* consuming it works well, because the self
switch records the unlock and the item can later be removed by the quest cleanup.

## Chests

The canonical two-page event. Do not over-build it.

```
Page 1  (none)              Action Button, Same as Characters, closed graphic
        ◆Play SE: Chest1
        ◆Set Movement Route: This Event [Wait ON] — Change Image (!Chest open frame)
        ◆Wait: 10
        ◆Change Items: Potion +1
        ◆Play ME: Item
        ◆Text: \}Potion obtained!\{
        ◆Control Self Switch: A = ON
Page 2  Self Switch A       Action Button, open graphic, empty list (or "It's empty.")
```

Variants:
- **Gold**: `Change Gold` instead of `Change Items`.
- **Locked chest**: page 2 conditioned on the key item, exactly like a door.
- **Trapped chest**: branch on a random roll before the reward.
- **Mimic**: `Battle Processing` before the reward; use the Lose branch deliberately.

Use the `!` prefix on the chest sprite sheet name so it draws without the tile offset, and
Direction Fix so it never swivels.

## Levers, buttons and switches

**Lever (toggleable):** two pages, each flipping its own Self Switch and calling a checker
Common Event — see `puzzle-patterns.md` §2.

**Button (one-shot):** one page, Action Button, sets a Switch or Self Switch and never returns.

**Floor button (weight-activated):** Below Characters, Player Touch — see pressure plates in
`puzzle-patterns.md` §5.

Always: distinct SE for on and off, and a visible graphic change. A lever with no feedback is
indistinguishable from a broken one.

## Examinable scenery — bookshelves, cupboards, signs

The most common event in any game, and the place where flavour lives.

```
Page 1  Action Button, Same as Characters (so it can be examined from the front)
        ◆Text: "Rows of dusty ledgers. Nothing of interest."
```

Upgrades, in order of effort:
- **Searchable once**: add a reward and `Control Self Switch: A = ON`; page 2 gives the
  "already searched" line.
- **Randomised flavour**: `Control Variables → Random 0..2` then branch — three lines from one
  event.
- **Context-aware**: branch on a quest variable so the bookshelf mentions the thing the player
  is looking for.
- **Shared boilerplate**: a `CE_Examine` Common Event that plays the SE and shows a message
  from a variable, so every scenery event is two lines.

For a wall of bookshelves, one event per tile is tedious; a single event with a wide graphic
does not exist in vanilla. Place one examinable event per *interesting* tile and leave the rest
as plain tiles — the player will find the one that responds if you telegraph it.

## Save points and rest points

```
Save point:
  ◆Text: "A shrine hums quietly."
  ◆Show Choices: [Save, Rest, Leave]
    ◆When Save:  ◆Change Save Access: Enable   ◆Open Save Screen
    ◆When Rest:  ◆Screen Fadeout ◆Recover All: entire party ◆Play ME: Victory
                 ◆Wait 30 ◆Screen Fadein
    ◆When Leave: (nothing)
```

If the project disables saving generally (`Change Save Access: Disable`), the save point must
re-enable it, open the screen, and disable it again afterwards.

Rest points should heal the whole party (`Recover All` with actor 0 = all) and, if there is a
clock, advance time.

## Teleports and map transitions

- **Doorway**: Player Touch, Below Characters, `Transfer Player`, `fadeType: black`.
- **Stairs**: same, usually with `fadeType: black` and a footstep SE.
- **Instant/seamless** (two halves of one area): `fadeType: none`.
- **Teleport pad**: Action Button with a confirmation choice, plus an animation and SE.
- **Network of teleports**: one Common Event that reads a destination variable and performs the
  transfer, called by every pad with a different variable value. One place to edit the map list.

Always set the **arrival direction** in the Transfer command, and place the arrival tile so the
player is not standing on the return trigger — otherwise the player immediately bounces back.
That is the classic "infinite doorway loop" bug: put the destination one tile *past* the
matching doorway event.

## Elevators and lifts

A choice menu that transfers to a fixed set of coordinates on the same or another map:

```
◆Show Choices: [1F, 2F, 3F, Cancel]
  ◆When 1F: ◆Transfer Player: this map, (10, 20), fade Black
  ...
```

For a lift that visibly moves, transfer with `fadeType: none` between near-identical maps, or
fake it: fade out, `Set Event Location` the surrounding scenery, fade in.

## Traps

```
Page 1  Player Touch, Below Characters, invisible or a subtle graphic
        ◆Play SE: Damage
        ◆Show Animation: Player, "Hit Physical"
        ◆Change HP: entire party, -20, allow knockout OFF
        ◆Control Self Switch: A = ON            ← if it should fire only once
```

Decisions to make explicitly: does it fire once or every time? Is it visible after triggering?
Can it kill (`allowDeath`)? A trap that can kill the party outright without warning is a design
choice, not an accident — usually set `allowDeath` off and leave the party at 1 HP.

Damage floors are a tileset property, not an event — use those for continuous hazards.

## Destructible objects

```
Page 1  (none)               Same as Characters, Action Button, intact graphic
        ◆Conditional Branch: Party has Pickaxe
          ◆Play SE: Earth1
          ◆Screen Shake: 3, 5, 20, Wait ON
          ◆Control Self Switch: A = ON
        ◆Else
          ◆Text: "The rubble is too heavy to move by hand."
Page 2  Self Switch A        Below Characters (or blank), rubble-cleared graphic
```

If the passage must stay open after leaving the map, the state must be a **Switch**, not a Self
Switch — self switches do persist across map visits, so a self switch is fine here; use a
Switch only when something on *another* map needs to know.

## Resource / gathering nodes

```
Page 1  (none)                Action Button
        ◆Play SE: Sheep? (or a gather SE)
        ◆Change Items: Herb +1
        ◆Text: \}Herb obtained!\{
        ◆Control Self Switch: A = ON
Page 2  Self Switch A         depleted graphic, "Nothing left here."
```

**Respawning node** — the honest vanilla approach is a global "harvest generation" counter that
increments on some world event (sleeping, a day change, entering the region), with each node
storing the generation at which it was picked:

```
Node:
  Page 1 (none)            available
     ◆Control Variables: [TMP_ARG0] = <node's own variable id>   ← or use a per-node variable
     ◆Change Items: Herb +1
     ◆Control Variables: [NODE_Herb_A_Gen] = Var SYS_HarvestGen
     ◆Control Self Switch: A = ON
  Page 2 Self Switch A     depleted, Parallel gated by nothing — no. Instead:
```

Because a self switch cannot be cleared from elsewhere without a script call, the cleanest
respawn is: **a single Common Event, called on the world event, that clears the nodes' self
switches by script**:

```js
[[12,3],[12,4],[12,5],[13,7]].forEach(([m,e]) => $gameSelfSwitches.setValue([m,e,"A"], false))
```

One list, one place, no per-node polling. Document the ID list in a Comment next to it, and
remember it must be updated if a node event is renumbered.

Simpler alternative when precision is not needed: condition page 2 on a Variable
(`SYS_Day >= NODE_pickedDay + 3` is not expressible as a page condition, so branch inside page 1
on the day instead of using a self switch at all).

## Shops and crafting

- **Shop**: `Shop Processing` (302 + 605 rows). Vary stock by branching on a story variable and
  running a different Shop Processing per branch — the goods list is static per command.
- **Purchase-only** flag on the shop command prevents selling.
- **Crafting**: check ingredients with Conditional Branches on item counts, consume them, grant
  the product. Factor the check-consume-grant shape into a Common Event taking recipe
  parameters in temp variables.
- **Currency alternatives**: use an item as currency; `Change Items` with a negative amount.

## Beds and inns

```
◆Show Choices: [Rest (10G), Leave]
  ◆When Rest:
    ◆Conditional Branch: Gold >= 10
      ◆Change Gold: -10
      ◆Screen Fadeout
      ◆Play ME: Inn (or BGM change)
      ◆Recover All: entire party
      ◆Wait: 60
      ◆(advance the clock if there is one)
      ◆Screen Fadein
      ◆Text: "You feel rested."
    ◆Else
      ◆Text: "You can't afford a room."
```

The fade → wait → fade is what sells the passage of time; without it the heal feels like a
button press.
