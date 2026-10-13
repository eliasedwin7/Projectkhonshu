# Khonshu — a live night sky for a projector

Khonshu turns a projector and a ceiling into the real sky above you. It shows the stars, planets,
Moon and Milky Way where they actually are right now for your location, turns with the Earth, and
plays slow ambient music to fall asleep to. It runs in a web browser with nothing to install.

**Website:** [Open Khonshu](https://projectkhonshu.eliasedwin7.workers.dev/)

Named after Khonshu, the Egyptian god of the Moon and the traveller of the night sky.

## Starting it

**With the phone remote (recommended).** Double-click `Start Khonshu.bat`. This needs
[Python 3](https://www.python.org/downloads/). The sky opens in your browser, and the window that
appears prints an address such as `http://192.168.1.20:8765/remote`. Open that address on a phone
on the same Wi-Fi to control the sky from bed. Windows may ask once whether to allow Python through
the firewall; allow it for private networks.

**One click at bedtime.** Double-click `Khonshu Bedtime.bat`. It does the same, but opens the sky
fullscreen in Edge or Chrome with the music already playing, so there is no Begin button and no
window to drag. Press Alt+F4 on the sky to close it. It keeps its own settings, separate from your
normal browser. It opens on the main display, so make the projector the main display first.

**Without Python.** Double-click `index.html`. Everything works except the phone remote.

Then drag the browser window onto the projector, click **Begin** (this starts the music and goes
fullscreen). **Auto menu** is on by default: move the pointer over the menu area near the bottom
to reveal the controls. Moving it away hides the menu after a short fade, even if a slider still
has focus. Untick **Auto menu** to keep the controls visible. The phone remote has the same setting.
For keyboard access, **H** opens and focuses the menu; **Esc** hides it in Auto mode.

The compact bedtime menu puts **Start night**, **Sound on**, **Volume**, **Brightness** and
**Sleep timer** first. **Advanced** holds astronomy, animations and projector alignment.
**Tonight’s sky** opens the detailed live readout. The footer identifies the running release.

**Sky style** offers three presets on the projector and phone remote:

- **Real sky** is the default: a faint, mostly grey Milky Way, gentle twinkle, a true-size Moon,
  daylight following the real clock, and aurora only when the live storm model permits it. Meteors
  follow **Real meteor rate**: about eight stray ones an hour for a whole dark sky, more during an
  annual shower, and fewer through a narrow field of view or under city lights. Untick it to set
  your own rate with the Meteors slider.
- **Dreamy** enhances twinkle, adds aurora and a larger Moon, and shows night at any hour.
- **Sleep** dims the picture, lowers the music volume, and removes automatic meteors and added aurora.

Cloud wisps form, stretch and dissolve as two noise fields evolve through each other. They obscure
the stars and are lit by the Moon, daylight and city glow. These are generated clouds, not local
weather observations, unless you tick **Real clouds**: the amount of cloud then follows the real
sky at the chosen place (the shapes are still generated). **Sky motion** adjusts twinkle and wind
speed without changing the clock.
Devices requesting reduced motion start each preset at natural. Adjusting a preset shows **Custom**;
your changes are saved. Upgrading adopts Real sky once, while retaining your location and projector alignment.

**Watch sky turn** runs time at one minute per second, making Earth's rotation visible over a few
seconds. This is simulated time, shown in the controls; **Live time** (or **L**) returns to the
current sky. Real-time rotation is naturally too slow to notice at a glance.

## What you see

| | |
|---|---|
| **Stars** | The 5,044 stars visible to the naked eye, with true positions, brightness and colour, plus a generated background of fainter ones. Low stars dim and twinkle more than high ones. |
| **Milky Way** | NASA's all-sky map, with muted colour and compressed highlights for a faint visual-sky appearance, including both Magellanic Clouds and the dark dust lanes. |
| **Moon** | A real image of the near side, with the correct phase, position and tilt. Lunar eclipses happen on the right dates, with Earth's coppery shadow crossing the disc. |
| **Planets** | Mercury to Uranus, with true positions and brightness. They shine steadily while the stars twinkle. |
| **Deep sky** | Twenty objects you can pick out without a telescope: the Orion and Carina nebulae, Omega Centauri, the Pleiades, the Andromeda Galaxy and others. |
| **Satellites** | The International Space Station, Tiangong and Hubble on their real orbits, visible when a real pass happens. The control panel tells you when the next ISS pass is due. |
| **Meteors** | Random, and during real annual showers they streak from the shower's true radiant. |
| **Aurora** | Finite, folded curtains with uneven rays: green below, faint red above, and a trace of violet at the foot. Weak displays stay toward the pole; strong displays can extend overhead. The Aurora slider adds a display; at zero it responds only to the live storm model. |
| **Daylight** | Sunset, dusk, night and dawn as they happen, with stars appearing one by one. Turn off "Follow daylight" for night at any hour. |
| **Weather and site** | Drifting cloud, and a "Sky darkness" slider from city to outback that hides the faint stars and Milky Way the way light pollution does. |

Constellation figures, names and compass points are off by default. Enable **Show constellations**
or **Show names** (shortcuts **C** and **N**) when you want them. Moving the pointer over the menu
reveals the controls. Click any star, planet, satellite or deep-sky object to see what it is.

**Sound on** toggles all music and meteor audio, keeping your volume setting. The toggle is on
the sky and phone remote; **M** does the same thing. Your sound preference is saved for next time.

**Sound collection** includes four generated soundscapes: **Khonshu ambient**, **Deep space**,
**Weightless** and **Quiet hush**. Mix **Drone**, **Pads** and **Air** independently. These work
offline and share the main volume, mute and sleep timer.

**Add your tracks** imports audio files into this browser's private device storage. Tracks loop
inside Khonshu and use the same audio controls and fade-out. Files are never uploaded; the phone
remote receives only track names and can select or pause them on the projector. Removing a track
removes the browser's copy and leaves your original file alone. If browser storage is unavailable,
imports work for the current session only. Your browser must support the file's audio format.

The collection retains [myNoise Black Hole](https://mynoise.net/NoiseMachines/intergalacticSoundscapeGenerator.php),
[SomaFM Drone Zone](https://somafm.com/dronezone/) and [Deep Space One](https://somafm.com/deepspaceone/)
as external-player links. Opening one mutes Khonshu's audio to avoid overlap. External players
need internet and use their own volume and timer; the integrated timer applies to generated sounds
and imported files.

## Sleeping and waking

- **Start night** starts a quiet session with Sleep lock and your chosen timer, or one hour if
  none was selected. It keeps your chosen sound, reduces volume to at most 30% and brightness to
  at most 60%, and never raises either if you had already lowered it further.
- **Sleep lock** silences ISS alerts, stops tours, visions and voyages, and hides sky overlays.
  Mouse movement cannot reopen the menu or cancel a fade. **H** or a deliberate click over the
  menu area reveals the controls; **Wake** or **W** unlocks and cancels the timer. Scheduled dawn
  also releases the lock. Your previous alert and overlay preferences are retained.
  Once fully asleep, the app suspends audio processing and checks the clock at one redraw per
  second, avoiding heavy sky rendering while keeping scheduled dawn available.
- **Sleep timer** fades generated music or imported tracks, and the picture, to black over its
  last three minutes. Without Sleep lock, moving the mouse brings the sky back.
- **Wake-up dawn** takes a time of day. Over the 25 minutes before it, the sky runs through dawn
  with a Sun rising in the east, whatever the real Sun is doing, and the music rises with it. It
  repeats every day until you clear the time. The computer must stay on overnight.
- **Night sounds** mixes crickets, frogs, leaves and a distant boobook owl in with the music. They
  are synthesised, like the music, and need no internet.
- **ISS alert** plays a soft chime and shows a note about five minutes before the space station
  appears. A phone with the remote open buzzes too, if it supports vibration.

## Learning the sky

- **Tour** (or **T**) walks through what is in view right now: the Moon, planets, bright stars and
  deep-sky objects, one at a time, each ringed with its card for about 40 seconds. Press it again
  to stop.
- **Sky culture** switches the figures and names between the Western constellations and an
  Aboriginal sky: the Emu in the Sky along the dark lane of the Milky Way, the Yolŋu canoe Djulpan
  in Orion, and Boorong names for the bright stars. This is a small, simplified selection drawn
  from published accounts, not a complete or authoritative record; every nation has its own sky.
  The Emu's outline is a sketch. Turn on **Show constellations** and **Show names** to see it.

## Visions and the voyage

These go beyond the real sky. The status line always says **Imagined** while one is on screen, and
with **Visions** set to Off (the Real sky default) none of them appears unless you ask for it.

- **Black hole** (**K**): drifts across over about four minutes. The Milky Way and every star
  behind it are bent with the real lensing formula, so stars slide outward, brighten and double as
  it passes, around a dark disc with a glowing ring of gas.
- **Supernova** (**U**): a bright star in view, Betelgeuse or Antares if either is up, swells to
  outshine everything and fades over four minutes.
- **Comet** (**O**): an invented great comet in the evening sky. It moves a little each night and
  its two tails point away from the Sun. With Visions on it comes by itself for about three weeks
  at a time.
- **Voyage** (**V**): about fourteen minutes. The view lifts off the ground, the stars stop
  twinkling, and a wormhole leads to Saturn, a nebula, a point outside the Milky Way and a black
  hole, then home. Press **V** again to head home early. The music gains a deeper drone on the way.

**Visions** set to Rare or Often lets a black hole or supernova arrive unprompted at night, every
20–40 or 5–10 minutes. Dreamy uses Rare.

Two more things in this group are real:

- **Next eclipse** (**E**) finds the next lunar eclipse visible from your place, jumps to just
  before it and plays it at a minute a second, then returns to now.
- **Zodiacal light**: under a dark sky ("country" or darker) a faint cone of light leans up from
  where the Sun set or will rise.

## Telescope

Click a planet or the Moon and a round eyepiece view opens, with north up: Saturn with its rings
at their true tilt for the date, Jupiter with its four large moons where they really are (their
spacing is squeezed to fit the view), Venus, Mercury and Mars with their true phase, and the Moon
close up. Click elsewhere to close it.

## Picture quality

**Quality** (low, medium, high) trades sharpness for speed. If the picture stutters for several
seconds, Khonshu lowers it by itself and says so in the status line.
**Animation speed** defaults to a quieter 30 fps; choose 60 fps for more frequent redraws.
The Advanced drawer reports measured frame rate and selected quality. Brightness changes ease
into place, background stars use more independent shimmer groups, and cloud textures do less
work per update while keeping their motion smooth. Actual frame rate depends on the computer.

## Install and use offline

The built, hosted site can be installed through **Install app** when the browser offers it, or
through the browser's install/Add to Home Screen menu. After the footer says **Saved for offline
use**, the sky, built-in sounds and imported tracks can reopen without internet. Live astronomy
feeds, weather and external radio need a connection. The local Python phone remote still requires
the server and the same Wi-Fi.

New releases download in the background. **Update ready** applies a complete saved release after
you explicitly choose it; it cannot interrupt Sleep lock. Closing the app or browser ends playback
and its session timer, so keep it open for overnight sessions.

Cloudflare's connected GitHub Builds publishes main; GitHub Actions validates changes.
Build settings and version information are described in
[DEPLOYMENT.md](DEPLOYMENT.md).

## Keys

| Key | Action | Key | Action |
|---|---|---|---|
| T | Tour of tonight's sky | H | Open the menu |
| W | Wake from Sleep lock | | |
| V | Voyage | K | Black hole |
| U | Supernova | O | Comet |
| E | Replay the next lunar eclipse | | |
| F | Fullscreen | Space | Meteor |
| M | Mute | B | Fireball |
| C | Toggle constellation figures | S | Meteor shower |
| N | Toggle names | A | Aurora on or off |
| D | Follow daylight on or off | L | Back to live time |

## Setting it up on a ceiling

The quick way is **Ceiling setup** in the menu. It asks three questions, each answered by looking
at a mark it draws on the ceiling: whether a letter R reads correctly (mirroring), which way an
arrow points (direction), and how many fists at arm's length fit between two crosses (life-size
scale). You can also set each one by hand:

- **Direction.** By default you look straight up with north at the top of the picture. Enable
  **Show names** to see the N/E/S/W letters, then turn **Facing** until they match the room.
- **Scale.** For a life-size sky, set **Field of view** to the angle the picture covers from where
  you lie. A typical ceiling image is 30–50° on its short side. Wider shows more sky but makes
  everything smaller.
- **Moon size.** 1× is true size, which is only a few pixels and is the Real sky default. Dreamy uses 3×.
- **Flipped image.** Use the projector's own ceiling or flip setting; "Mirror image" covers
  left-right reversal.
- **Sound.** Projector speakers are thin. The music is mostly low and slow, so an external speaker
  makes a large difference.
- **Wall instead of ceiling.** Lower **Tilt** to get a window view with a horizon.

The default place is Canberra. Change it with the Place list, the latitude and longitude boxes, or
"Locate me". "Jump to a date" shows the sky at any time between 1800 and 2100, and "Time speed"
runs it at up to an hour per second.

## How accurate it is

- Star positions come from a catalogue and are precessed to the current date.
- Planet positions use JPL's approximate orbital elements; they are good to about an arcminute and
  reproduce known oppositions and conjunctions to the day.
- The Moon uses the leading terms of Meeus's lunar theory, good to a few thousandths of a degree.
  Recent lunar eclipses come out within half a minute of their published times.
- Satellites use a simplified orbit model that stays within about 15 km of the standard one for a
  week, so passes happen at the right time and place to within a couple of seconds.
- Jupiter's moons follow Meeus's low-accuracy method, which reproduces his worked example exactly.
  Saturn's ring tilt comes from the direction of its pole.
- The black hole bends starlight with the standard point-mass lens formula, and its disc is drawn
  by following light rays round a non-spinning hole. The hole itself, of course, is not there.
- Things that are artistic rather than measured: the faintest background stars, the cloud shapes,
  the exact form of the aurora, the meteor rate, and the Sun being drawn larger than life.
  Dreamy also enlarges the Moon and strengthens star twinkle.

## Internet use

The sky itself works offline. With "Live data" ticked, the page fetches satellite orbits from
[celestrak.org](https://celestrak.org) about twice a day and the geomagnetic storm index from
[NOAA](https://www.swpc.noaa.gov) every 20 minutes. Nothing about you is sent beyond an ordinary
web request. Untick "Live data" to stop this. Without real orbit data, only Dreamy adds anonymous
simulated satellites; Real sky does not invent passes.

**Real clouds** is off unless you tick it. When on, the page asks [Open-Meteo](https://open-meteo.com)
for the cloud cover every half hour, sending the chosen latitude and longitude rounded to a tenth
of a degree (about 10 km).

The phone remote only works on your own network. Anyone on that network who knows the address can
move the sliders, and nothing else in the folder is served.

## Files

| File | Purpose |
|---|---|
| `index.html` | The page and its control panel |
| `js/astro.js` | Astronomy: Sun, Moon, planets, satellites, sidereal time |
| `js/sky.js` | Drawing and controls |
| `js/audio.js` | The generated music |
| `js/sound-collection.js` | Shared sound collection and official-player links |
| `js/bedtime.js`, `css/bedtime.css` | Compact bedtime menu and advanced controls |
| `js/app.js`, `sw.js`, `manifest.webmanifest` | Installation, versioned offline assets and update handling |
| `scripts/`, `tests/`, `wrangler.jsonc` | Deployment build, checks and Cloudflare configuration |
| `data/sky-data.js` | Star catalogue and constellation figures |
| `data/sky-images.js` | Milky Way and Moon images (optional; both are drawn by code if it is missing) |
| `js/skylore.js` | The Aboriginal sky: names, places and figures |
| `js/visions.js` | Black hole, supernova, comet, zodiacal light, eclipse replay and the telescope view |
| `js/voyage.js` | The voyage: wormhole, Saturn, nebula, galaxy and black-hole scenes |
| `remote.html`, `khonshu_server.py`, `Start Khonshu.bat` | The phone remote |
| `Khonshu Bedtime.bat` | One-click fullscreen start |
| `PLAN.md` | The plan the visions and voyage were built from, with notes on what was done |

## Credits

- Stars and constellation figures: [d3-celestial](https://github.com/ofrohn/d3-celestial) by Olaf
  Frohn, BSD 3-Clause licence, derived from the Hipparcos catalogue.
- Milky Way: NASA/Goddard Space Flight Center Scientific Visualization Studio,
  [Deep Star Maps 2020](https://svs.gsfc.nasa.gov/4851), using Gaia DR2 (ESA/Gaia/DPAC). Public domain.
- Moon: NASA Scientific Visualization Studio, [CGI Moon Kit](https://svs.gsfc.nasa.gov/4720), from
  Lunar Reconnaissance Orbiter data. Public domain.
- Planetary elements: JPL Solar System Dynamics. Lunar theory: Jean Meeus, *Astronomical Algorithms*.
- Aurora form and emission colours: NASA's [Auroras](https://science.nasa.gov/sun/auroras/) and
  [The Polar Aurora](https://pwg.gsfc.nasa.gov/Education/waurora1.html). The animated curtain geometry is illustrative.
- Satellite orbits: CelesTrak. Storm index: NOAA Space Weather Prediction Center. Cloud cover:
  Open-Meteo.
- Aboriginal sky: Boorong star names as recorded by William Stanbridge (1857) and discussed by
  Hamacher and Frew (2010); the Emu in the Sky and Djulpan as described by Ray and Cilla Norris in
  *Emu Dreaming* (2009). Any errors in this simplified selection are this project's.
