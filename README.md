# Khonshu — a live night sky for a projector

Khonshu turns a projector and a ceiling into the real sky above you. It shows the stars, planets,
Moon and Milky Way where they actually are right now for your location, turns with the Earth, and
plays slow ambient music to fall asleep to. It runs in a web browser with nothing to install.

Named after Khonshu, the Egyptian god of the Moon and the traveller of the night sky.

## Starting it

**With the phone remote (recommended).** Double-click `Start Khonshu.bat`. This needs
[Python 3](https://www.python.org/downloads/). The sky opens in your browser, and the window that
appears prints an address such as `http://192.168.1.20:8765/remote`. Open that address on a phone
on the same Wi-Fi to control the sky from bed. Windows may ask once whether to allow Python through
the firewall; allow it for private networks.

**Without Python.** Double-click `index.html`. Everything works except the phone remote.

Then drag the browser window onto the projector, click **Begin** (this starts the music and goes
fullscreen), and move the mouse whenever you want the controls.

## What you see

| | |
|---|---|
| **Stars** | The 5,044 stars visible to the naked eye, with true positions, brightness and colour, plus a generated background of fainter ones. Low stars dim and twinkle more than high ones. |
| **Milky Way** | NASA's all-sky photographic map, including both Magellanic Clouds and the dark dust lanes. |
| **Moon** | A real image of the near side, with the correct phase, position and tilt. Lunar eclipses happen on the right dates, with Earth's coppery shadow crossing the disc. |
| **Planets** | Mercury to Uranus, with true positions and brightness. They shine steadily while the stars twinkle. |
| **Deep sky** | Twenty objects you can pick out without a telescope: the Orion and Carina nebulae, Omega Centauri, the Pleiades, the Andromeda Galaxy and others. |
| **Satellites** | The International Space Station, Tiangong and Hubble on their real orbits, visible when a real pass happens. The control panel tells you when the next ISS pass is due. |
| **Meteors** | Random, and during real annual showers they streak from the shower's true radiant. |
| **Aurora** | Curtains of green and red toward the nearer pole. The Aurora slider sets how strong a display to show; it also responds to real geomagnetic storms. |
| **Daylight** | Sunset, dusk, night and dawn as they happen, with stars appearing one by one. Turn off "Follow daylight" for night at any hour. |
| **Weather and site** | Drifting cloud, and a "Sky darkness" slider from city to outback that hides the faint stars and Milky Way the way light pollution does. |

Constellation figures, names and compass points fade in while you move the mouse and fade out
again, so the sky is bare when you are just looking at it. Click any star, planet, satellite or
deep-sky object to see what it is.

## Keys

| Key | Action | Key | Action |
|---|---|---|---|
| F | Fullscreen | Space | Meteor |
| M | Mute | B | Fireball |
| C | Pin constellation figures | S | Meteor shower |
| N | Pin names | A | Aurora on or off |
| D | Follow daylight on or off | L | Back to live time |

## Setting it up on a ceiling

- **Direction.** By default you look straight up with north at the top of the picture. Move the
  mouse to show the N/E/S/W letters, then turn **Facing** until they match the room.
- **Scale.** For a life-size sky, set **Field of view** to the angle the picture covers from where
  you lie. A typical ceiling image is 30–50° on its short side. Wider shows more sky but makes
  everything smaller.
- **Moon size.** 1× is true size, which is only a few pixels. The default is 3×.
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
- Things that are artistic rather than measured: the faintest background stars, the cloud shapes,
  the exact form of the aurora, the meteor rate (far higher than a real night), and the Moon and
  Sun being drawn larger than life.

## Internet use

The sky itself works offline. With "Live data" ticked, the page fetches satellite orbits from
[celestrak.org](https://celestrak.org) about twice a day and the geomagnetic storm index from
[NOAA](https://www.swpc.noaa.gov) every 20 minutes. Nothing about you is sent beyond an ordinary
web request. Untick "Live data" to stop this; satellites then become anonymous random ones.

The phone remote only works on your own network. Anyone on that network who knows the address can
move the sliders, and nothing else in the folder is served.

## Files

| File | Purpose |
|---|---|
| `index.html` | The page and its control panel |
| `js/astro.js` | Astronomy: Sun, Moon, planets, satellites, sidereal time |
| `js/sky.js` | Drawing and controls |
| `js/audio.js` | The generated music |
| `data/sky-data.js` | Star catalogue and constellation figures |
| `data/sky-images.js` | Milky Way and Moon images (optional; both are drawn by code if it is missing) |
| `remote.html`, `khonshu_server.py`, `Start Khonshu.bat` | The phone remote |

## Credits

- Stars and constellation figures: [d3-celestial](https://github.com/ofrohn/d3-celestial) by Olaf
  Frohn, BSD 3-Clause licence, derived from the Hipparcos catalogue.
- Milky Way: NASA/Goddard Space Flight Center Scientific Visualization Studio,
  [Deep Star Maps 2020](https://svs.gsfc.nasa.gov/4851), using Gaia DR2 (ESA/Gaia/DPAC). Public domain.
- Moon: NASA Scientific Visualization Studio, [CGI Moon Kit](https://svs.gsfc.nasa.gov/4720), from
  Lunar Reconnaissance Orbiter data. Public domain.
- Planetary elements: JPL Solar System Dynamics. Lunar theory: Jean Meeus, *Astronomical Algorithms*.
- Satellite orbits: CelesTrak. Storm index: NOAA Space Weather Prediction Center.
