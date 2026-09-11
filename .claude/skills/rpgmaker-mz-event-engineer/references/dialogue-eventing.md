# Dialogue Eventing

Dialogue is where quest logic and writing collide. Keep them separated or both become
unmaintainable.

**Governing rule: an NPC event should decide *which* conversation happens; a Common Event
should contain the conversation.** Business logic in the map event, words in one place.

---

## 1. The basic shapes

### Simple

```
◆Text: <face> "Welcome to Havenbrook."
```

One page, Action Button. Do not add machinery it does not need.

### Conditional on quest state

```
◆Conditional Branch: Var QUEST_Relic >= 100
  ◆Text: "The relic sits safe in the vault. We owe you."
◆Else
  ◆Conditional Branch: Var QUEST_Relic >= 20
    ◆Text: "Any sign of the shards?"
  ◆Else
    ◆Text: "Strange times, traveller."
  ◆
◆
```

**Test the highest state first and fall through downward.** With `>=` comparisons that ordering
is required, and it also reads as a priority list.

For more than three states, prefer the state-page approach (`event-state-machines.md`) or a
dispatcher Common Event with one branch per state.

### Repeat visits — first time vs afterwards

```
Page 1  (none)                 ◆Text: "You must be the one they sent. Please, sit."
                               ◆Control Self Switch: A = ON
Page 2  Self Switch A          ◆Text: "Make yourself at home."
```

This is the single highest-value dialogue upgrade in any project: NPCs who do not repeat their
introduction. Self Switch, two pages, done.

### Cycling lines

```
◆Control Variables: [TMP_LINE] = Var NPC_Baker_Line
◆Control Variables: [NPC_Baker_Line] += 1
◆Conditional Branch: Var NPC_Baker_Line >= 3
  ◆Control Variables: [NPC_Baker_Line] = 0
◆
◆Conditional Branch: TMP_LINE == 0
  ◆Text: "Fresh bread!"
◆Conditional Branch: TMP_LINE == 1
  ◆Text: "The mill's been slow this season."
◆Conditional Branch: TMP_LINE == 2
  ◆Text: "Mind the step on your way out."
```

Deterministic cycling beats randomness for flavour, because the player is guaranteed to see
every line rather than hitting the same one four times.

### Random lines

```
◆Control Variables: [TMP_LINE] = Random 0..2
◆(branch as above)
```

Use random for crowd chatter where repetition is invisible; use cycling for anything worth
reading.

### Post-action dialogue

Reacting to something that just happened is the cheapest characterisation available:

```
◆Conditional Branch: Switch [SW_Story_BridgeFell] is ON
  ◆Text: "You were there when the bridge went, weren't you."
◆Else
  ◆Text: "Safe travels."
```

---

## 2. Show Choices

`Show Choices` (102) with `402` per option, optional `403` cancel branch, `404` to close.

```
◆Text: "Will you take the contract?"
◆Show Choices: [Accept, Refuse, Ask about the pay]  (cancel → branch)
  ◆When Accept:  ...
  ◆When Refuse:  ...
  ◆When Ask:     ◆Text: "Fifty gold."
                 ◆Jump to Label: ask_again          ← re-offer without duplicating the menu
  ◆When Cancel:  ...
```

Rules:
- **Maximum 6 choices** in the default window; more requires a plugin.
- `cancelType`: `-1` disallow · `-2` run the `403` branch · `0..n-1` cancel picks that option.
  For a menu the player must answer, use `-1`; for anything else give them an out.
- A `Show Choices` **immediately after** a `Show Text` is absorbed into that text window
  (`command101` consumes a following 102), so the question stays visible behind the menu. That
  is almost always what you want. Put any other command between them to break the coupling.
- To re-show a menu after an informational branch, wrap it in `Label` / `Jump to Label` at the
  same indent — see the `ask_again` label above. Never jump *into* a branch.

### Dynamic choices

The engine's choice list is static. To vary it:
- **Branch to different `Show Choices` commands** for each situation. Verbose but transparent,
  and the only vanilla-safe method.
- **Include a placeholder option and reject it** ("You don't know enough about that yet.") —
  simpler, and it telegraphs future content.
- **Script**: `$gameMessage.setChoices()` before a bare choice block is fragile and interacts
  badly with the interpreter's branch bookkeeping. Do not.

Choice text can use `\V[n]` so an option can display a live number.

---

## 3. Text codes worth using

| Code | Effect |
|---|---|
| `\V[n]` | Variable value |
| `\N[n]` / `\P[n]` | Actor name by ID / by party position |
| `\G` | Currency unit |
| `\C[n]` | Colour (0 normal, 1 blue, 2 red, 3 green, 6 yellow, 17 clear) |
| `\I[n]` | Icon |
| `\{` `\}` | Bigger / smaller text |
| `\.` `\|` | Wait ¼ s / 1 s **mid-sentence** |
| `\!` | Wait for button press mid-window |
| `\>` `\<` | Print the rest of the line instantly / normally |
| `\^` | Skip the closing input — the window closes automatically |
| `\\` | A literal backslash |

`\.` and `\|` are the most under-used tools in the engine. `"I... \|I don't know."` is a
performance; `"I... I don't know."` is a line of text.

`\^` is how you make a message that flashes past without requiring a keypress — useful for
sequences of short exclamations during action.

---

## 4. Structuring an NPC's dialogue

### Small NPC (one to three lines)
Inline in the map event. Adding a Common Event for this is over-engineering.

### Quest NPC (many states, one location)
One page, one Conditional Branch chain on the quest variable, tested high-to-low. Add pages
only when the sprite or behaviour changes too.

### NPC that appears on several maps
One Common Event holds the entire conversation; every instance is:

```
◆Common Event: CE_NPC_Sage_Talk
```

The Common Event inherits the calling event's ID, so it can still set that instance's self
switches and use "This Event" in move routes.

### Large branching conversation
Sections as Common Events, one per topic, dispatched from a hub:

```
CE_Sage_Hub
  ◆Label: hub
  ◆Show Choices: [The relic, The crypt, Yourself, Goodbye]
    ◆When The relic: ◆Common Event: CE_Sage_Topic_Relic  ◆Jump to Label: hub
    ◆When The crypt: ◆Common Event: CE_Sage_Topic_Crypt  ◆Jump to Label: hub
    ◆When Yourself:  ◆Common Event: CE_Sage_Topic_Self   ◆Jump to Label: hub
    ◆When Goodbye:   ◆(fall through, ending the event)
```

The hub label pattern gives a proper conversation menu with no plugin. Each topic Common Event
can mark itself as heard with a variable so the hub can gray it out (by branching to a
different choice set) or so the NPC can reference it later.

**Do not put quest state changes inside topic Common Events** unless the topic *is* the
transition — route them through the quest dispatcher so state ownership stays in one place.

---

## 5. Party- and inventory-aware dialogue

| Condition | Test |
|---|---|
| Actor is in the party | `Conditional Branch → Actor → In the Party`, or page condition `actorValid` |
| Party leader is X | `Conditional Branch → Script: $gameParty.leader().actorId() === 3` |
| Party size | `Control Variables → Game Data → Other → Party Members` then compare |
| Has an item | `Conditional Branch → Item` |
| Has N of an item | `Control Variables → Game Data → Item → X` then compare |
| Wearing something | `Conditional Branch → Actor → Weapon / Armor` |
| Has a state (poisoned) | `Conditional Branch → Actor → State` |
| Gold | `Conditional Branch → Gold` |

A single extra branch — "if Mira is in the party, she interjects" — is disproportionately
effective and costs three lines.

---

## 6. Presentation

- **Speaker name** (MZ `Show Text` parameter 5) rather than typing the name into the text.
- **Change the face** when the emotion changes, even within one conversation.
- **Window position** Top when the speaker is low on screen, so the portrait is not covered.
- **One idea per window.** Break long speeches; each window is a beat.
- Give the *listener* reactions too — a balloon on the player, a turn, a step back. A
  conversation where only the speaker moves feels like a wall of text.
- End conversations with a small physical action (the NPC turns back to their work) rather than
  the window simply closing.

---

## 7. Anti-patterns

| Anti-pattern | Fix |
|---|---|
| 300 `Show Text` commands and the quest logic interleaved in one event | Dialogue → Common Event; logic → dispatcher |
| The same greeting every single time forever | Self Switch + second page |
| A 12-deep Conditional Branch ladder | State variable + pages, or a dispatcher with a flat branch per state |
| Copy-pasted dialogue in five map copies of one NPC | One Common Event, five one-line callers |
| Quest state advanced inside a dialogue branch, in several different events | One dispatcher Common Event owns the variable |
| Choices with no cancel option in a non-critical conversation | `cancelType: -2` and a graceful exit |
| `Jump to Label` into the middle of a conditional block | Only jump to labels at the same indent |
