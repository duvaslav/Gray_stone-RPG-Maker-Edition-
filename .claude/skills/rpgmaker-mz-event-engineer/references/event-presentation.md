# Event Presentation — timing, beats and choreography

Technically-correct events can still feel cheap. What separates a professional scene from an
amateur one is almost never the effects used — it is **timing** and **cause-and-effect order**.

---

## 1. The core principle: reaction before dialogue

Compare:

```
BAD                                  GOOD
◆Text: "Hey! Stop right there!"      ◆Wait: 15                        (beat — the world pauses)
                                     ◆Set Movement Route: This Event [Wait ON] — Turn toward Player
                                     ◆Play SE: Flash1
                                     ◆Show Balloon Icon: This Event, Exclamation [Wait ON]
                                     ◆Set Movement Route: This Event [Wait ON] — 1 Step Backward
                                     ◆Wait: 10
                                     ◆Text: "Hey! Stop right there!"
```

Same information, completely different feel. The player watches the NPC *notice*, *react*, and
*then* speak. Roughly 2 seconds of animation buys enormous perceived production value.

The general shape of any reaction beat:

> **pause → orient → signal → physical reaction → speak**

---

## 2. A timing vocabulary

Learn these durations; they are the units of scene rhythm.

| Frames | Feel | Use for |
|---|---|---|
| 5–10 | Barely perceptible | Between a turn and the next action |
| 15–20 | A clear beat | Before a reaction; between dialogue lines with a mood change |
| 30 | Half a second, a real pause | Dramatic hesitation; after a door opens |
| 45–60 | A weighty pause | Before a revelation; after a character dies |
| 90+ | Uncomfortable, deliberate | Only when the discomfort is the point |

Anything under 5 frames is invisible. Anything over 120 without visual change feels like a bug.

Reference durations you cannot change: screen fade 24 frames; balloon icon 76 frames;
one tile of walking at normal speed 16 frames.

---

## 3. The effects palette, and what each is actually *for*

Effects should be **motivated** — they must correspond to something happening in the fiction.

| Tool | Reads as | Good use | Overuse smell |
|---|---|---|---|
| **Balloon Icon** | An internal reaction | Noticing, confusion, realisation, sleep | Every NPC balloons on every line |
| **Screen Shake** | Physical impact | Explosion, earthquake, giant footstep | Shaking during ordinary dialogue |
| **Flash Screen** | A sudden event | Lightning, spell, a blow landing | Flashing on every scene transition |
| **Tint Screen** | A change of mood or time | Dusk, flashback, poison, dread | Tinting and never restoring |
| **Fadeout / Fadein** | A cut in time or place | Scene break, "some time later" | Fading between adjacent beats |
| **Weather** | Environment and mood | Storm during a tragedy | Rain that never stops |
| **Animation** | A discrete magical/physical event | Spell cast, item appearing, healing | Animation as decoration |
| **SE** | Punctuation | Doors, chests, footsteps, reactions | Silence — the most common failure |
| **BGM change** | A shift in scene meaning | Boss reveal, emotional turn | Changing music every room |
| **Scroll Map** | Directing attention | "Look over there" before a reveal | Scrolling with nothing to see |
| **Picture** | Something outside the world | Portraits, letters, title cards, flashes of memory | Pictures left on screen |
| **Change Image** | A change in a character's state | Sitting, sleeping, wounded, disguised | Swapping without a reason |
| **Opacity** | Presence and unreality | Ghosts, fading in/out, dreams | — |
| **Stepping Animation** | Ambient life | Cooks stirring, guards shifting | — |

**The most under-used tool is silence and stillness.** A `Wait: 45` with nothing happening,
right before a line, is more dramatic than any flash.

**The most under-used effect is sound.** Almost every interaction should have an SE: doors,
chests, levers, refusals, successes, discoveries. A game with no SE on interaction feels dead
regardless of how good the writing is.

---

## 4. Composite recipes

### The reveal

```
◆Fadeout BGM: 2 seconds
◆Wait: 30
◆Scroll Map: Up, 3, Speed 3, Wait ON          — camera moves off the player…
◆Wait: 20                                       …and holds
◆Play SE: Thunder
◆Flash Screen: (255,255,255,170), 20 frames, Wait ON
◆Set Movement Route: Event 8 [Wait ON] — Transparent OFF
◆Wait: 25
◆Play BGM: Boss1
◆Scroll Map: Down, 3, Speed 4, Wait ON
◆Show Balloon Icon: Player, Exclamation [Wait ON]
◆Text: "It can't be..."
```

Order matters: music out → camera → flash → the thing appears → hold → music in → the player
reacts → dialogue.

### The door opening

```
◆Play SE: Open1
◆Set Movement Route: This Event [Wait ON] — Change Image (door_open), Wait 6
◆Wait: 10
◆Control Self Switch: A = ON          (page 2 = open, passable)
```

Ten frames of pause after the sound is what makes it feel like a door rather than a teleport.

### Receiving an item

```
◆Play ME: Item                              ← an ME, not an SE: it interrupts the music, which
◆Show Animation: Player, "Recovery"           is exactly the punctuation a reward wants
◆Text: \}\C[6]Iron Sword\C[0] obtained!\{
◆Change Weapons: Iron Sword +1
```

### A character leaving in anger

```
◆Set Movement Route: Event 4 [Wait ON] — Turn away from Player
◆Wait: 30                                  ← the pause carries the emotion
◆Text: "...Forget it."
◆Wait: 20
◆Set Movement Route: Event 4 [Wait OFF] — Change Speed 5, Through ON, Move Left ×8, Transparent ON
◆Wait: 60
◆Erase Event
```

### Poison / dread ambience

```
◆Tint Screen: (-34, -68, -34, 68), 90 frames, Wait ON
◆Play BGS: Wind, volume 60
```
…and remember to restore `(0,0,0,0)` on exit.

---

## 5. Dialogue presentation

- **One idea per window.** Four short lines beat one dense paragraph.
- **`\.` (¼ s) and `\|` (1 s)** inside text create pauses *within* a line — the cheapest and
  most under-used tool in the whole engine. `"I... \.\.\. I don't know."`
- **`\!`** waits for input mid-window: use it to reveal a punchline after a beat.
- **Speaker names** (MZ's 5th parameter of `Show Text`) are better than typing `Bob: ` into the
  text — they render in a separate box and are easy to restyle later.
- **Face graphics** should change when the emotion changes. A single neutral portrait through a
  furious speech undercuts it.
- **Position** matters: set the window to Top when the speaker is at the bottom of the screen,
  so the text does not cover them.
- Use `\C[n]` sparingly and consistently — colour for proper nouns and key items only.

---

## 6. Environmental life (cheap, high impact)

These cost nothing and make a map feel inhabited:

- **Stepping Animation ON** on shopkeepers, cooks, blacksmiths — they move while idle.
- **Random autonomous movement, frequency 2–3** on villagers, so they drift slowly.
- **Direction Fix + a facing** on guards, so they hold a pose.
- **A parallel-free ambient sound** — set the map's BGS in the map properties, not an event.
- **A few Below-Characters events** with `Wait`-padded looping routes: a swaying banner (Change
  Image loop), a flickering torch (Change Opacity loop), a dripping pipe (Play SE loop with a
  long wait).
- **Balloon icons on autonomous NPCs** occasionally, from a low-frequency parallel — but gate
  it, and prefer one map-wide controller over one parallel per NPC.

---

## 7. Restraint

The failure mode of everything above is *more*. Guidelines:

- **One dominant effect per beat.** Shake **or** flash **or** tint — not all three.
- **Every effect must be caused by something the player can point at.**
- **Escalate.** If the first door creaks and shakes the screen, the boss door has nothing left.
- **Reserve the biggest tools** (fade to black, screen shake at high power, BGM change) for the
  few moments that deserve them.
- **Ordinary interactions should be quick.** A chest is: SE → open → text → done, in under a
  second. Do not choreograph a chest.

The test: remove every effect from the scene and read it as a script. If it still works, the
effects are enhancing it. If it becomes incomprehensible, the effects were carrying it.
