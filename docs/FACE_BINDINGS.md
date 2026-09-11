# Face bindings

## The contract

Dialogue **never names a face file.** It names a speaker and an emotion:

```
speaker_id + emotion_id  ──►  faceName + faceIndex
```

The resolution lives in `tools/data/face-bindings.json`. When the real portraits
are drawn, that file changes and nothing else does — no Show Text command is
touched, and **`speaker_id` never changes**, ever, for any reason.

This is the whole point of the layer: without it, replacing placeholder art means
hand-editing every dialogue command in the game.

## Format

A standard MZ faceset is **576 × 288 px** — 4 columns × 2 rows of 144 × 144 faces,
so `faceIndex` is 0..7. Do not invent other sheet sizes; the validator rejects a
face index outside 0..7.

## Current state: placeholders

All 15 speakers, 61 speaker/emotion pairs, every entry marked
`"placeholder": true`. Every emotion of a given speaker currently resolves to the
same stock face.

That is deliberate. A placeholder pretending to have eight distinct expressions
would be a lie the dialogue writer would then design against.

## Emotion vocabulary

The shared vocabulary is: `neutral`, `serious`, `concerned`, `suspicious`,
`irritated`, `sad`, `frightened`, `relieved`.

**No character declares all eight.** Each one declares the emotions their actual
scenes call for:

| Speaker | Emotions | Why |
|---|---|---|
| Leonard | 6 | the player character; the widest range |
| Linda, Vera, Beatrice, Agnes | 5 | suspects with real arcs |
| Marlena, Sybilla, Celeste, Nika, Evelyn | 4 | significant but narrower |
| Roland, Bartolomeo, Iona, Edrian, Caleb | 3 | supporting roles |

Roland does not get `frightened` because Roland is never frightened on screen.
Adding it "for completeness" would invite a scene that should not exist.

## Choosing an emotion

Emotion is determined by the **context of the scene**, never at random and never
mechanically cycled. Where the emotional colour is genuinely ambiguous, use
`neutral` or `serious`.

Canonical lines are never rewritten to match a portrait. The portrait follows the
line.

## Replacing the placeholders

1. Draw the faceset (576 × 288, 8 slots).
2. Put it in `img/faces/`.
3. Edit `tools/data/face-bindings.json`: set `faceName` and the correct
   `faceIndex` per emotion, and drop `"placeholder": true`.
4. `node tools/build/index.js`
5. `node tools/verify_assets.js`

Do not change `speaker_id`. Do not edit `data/` by hand.
