# Plan: visions and the voyage

Status: **planned, not started.** Written 13 October 2026.

## The idea

Two things sit on top of the real sky:

- **Visions**: single events that appear over the real sky for a few minutes, then fade.
- **Voyage**: a scripted journey that leaves Earth, travels through a wormhole to other places, and
  comes home.

A **Visions** setting (off / rare / often) controls the random ones. Every vision and the voyage
also get a key and a phone-remote button. The status line always says whether what is on screen is
real or imagined.

## Stage 1: visions over the real sky

- **Black hole**: drifts across over about four minutes. The Milky Way photo and every star behind
  it are bent with the real lensing formula, giving the dark disc, the bright ring and doubled
  stars, plus a glowing accretion disc.
- **Supernova**: a bright star that is currently up (Betelgeuse or Antares if visible) swells to
  outshine everything, then fades over a few minutes.
- **Great comet**: an invented comet that behaves like a real one. It moves a little each night and
  its tail always points away from the Sun.
- **Zodiacal light** (real): the faint cone of dust glow after dusk and before dawn.
- **Eclipse replay** (real): one button finds the next lunar eclipse visible from the chosen place,
  plays it sped up, then returns to now.

## Stage 2: telescope zoom

Click a planet or the Moon and a round eyepiece view fades in:

- **Saturn** with its rings at their true tilt for the date.
- **Jupiter** with cloud bands and its four large moons.
- **Venus and Mars** with their true phase.
- **Moon** close-up.

Jupiter's moon positions need checking against a published ephemeris. If they cannot be confirmed,
label them approximate.

## Stage 3: the voyage

A slow 10–15 minute journey, built to be watched half asleep:

1. **Lift-off**: clouds fall away; the stars stop twinkling and sharpen above the atmosphere.
2. **Wormhole**: the stars stretch into a tunnel of light.
3. **Destinations**, a few minutes each, with a wormhole between them:
   - Saturn up close, rings across the whole ceiling
   - Inside a nebula of coloured gas
   - The Milky Way seen from outside, as a spiral
   - Orbiting the black hole
4. **Return**: back through the wormhole to tonight's real sky.

The music gets a deeper travelling drone during the voyage and a soft swell for each vision, with
no sudden sounds.

## How to build it

- New files `js/visions.js` and `js/voyage.js`, so the real-sky code in `js/sky.js` stays separate.
- A director that runs one vision at a time: each has a duration, a fade envelope, an update step,
  and hooks to draw before the stars (shader) and after them (2D).
- A **Quality** setting (low / medium / high) that scales shader resolution, because this adds
  several more shaders and the projector PC's speed is unknown.
- A test switch in the address bar that freezes any vision at a chosen moment, since the test
  browser only yields still frames.
- Work on a `visions` branch, one commit per stage, merged to `main` when approved.

### Notes for the black hole

- Point-mass lens with Einstein radius θE. A pixel at angle θ from the hole shows the source at
  β = θ − θE²/θ, on the line through the hole. Apply this in the Milky Way shader by rotating the
  pixel's direction about the axis (hole × direction).
- Stars are drawn as sprites, so they need the inverse: a source at β appears at
  θ± = (β ± √(β² + 4θE²)) / 2. Draw the outer image for every star and the inner one for bright
  stars, with brightness scaled by the magnification.
- Everything inside the shadow radius is black.

## Left out

Distant lightning: with a ceiling view the horizon is off-screen, so it would barely show.

## Decisions still open

1. **Voyage start**: only on a key or remote button (proposed default), or automatically on a loop?
2. **Destinations**: the four above, or others too, such as an alien planet with moons or a double
   sunset?
3. **Pace**: all three stages in one go, or stop after stage 1 for a look (proposed default)?
