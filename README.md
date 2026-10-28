# Hollow Hours

A dark, story-driven metroidvania that runs in the browser with no
dependencies and no build step. Everything, from the inked characters and
layered environments to the cutscene panels and the music, is generated
procedurally in plain JavaScript on an HTML5 canvas, with a camera that
follows you through scrolling zones.

Contains themes of coercion, exploitation and death. Not for children.

## Play

Open `index.html` in a modern browser, or serve the folder:

```
python3 -m http.server 8000
# then visit http://localhost:8000/
```

| Action                      | Keys                                  |
|-----------------------------|---------------------------------------|
| Move                        | Arrow keys or A / D                   |
| Jump                        | Z, Space or K                         |
| Strike (three-hit chain)    | X or J                                |
| Up-cut / pogo               | Up + X, or Down + X while airborne    |
| Skip (dash, once found)     | C, L or Shift                         |
| Anchor / return             | F (or R)                              |
| Choose a time power         | Q / E, or 1 to 5                      |
| Cast the chosen power       | V or I (hold Up to cast upward)       |
| Talk / rest                 | Up or W                               |
| Map                         | M or Tab                              |
| Pause                       | Escape or P                           |
| Mute                        | N                                     |

Hold Escape to skip the prologue and ending. Rest at a lantern to heal and
save. Progress is kept in the browser's local storage.

## The story

You wake on a shore with no memory and an hourglass fused into your chest,
and you find you can set an anchor in time and return to it. A woman named
Sef tells you who you are: Tam, hollowed out by the Regent of Hours, who rules
the city from a locked clocktower. You climb the city, taking back time powers
from its guardians: Wither ages locks and enemies, Stall thickens time, Mend
restores ruins and wounds, Echo leaves a double of your last seconds behind,
Sever stops time altogether. The Regent, confused and overwhelming, drops you
into the Undergrounds. On the long climb out, an archivist and a miller speak
of the one who "asks for just one hour", and you assume they mean the Regent.
Eight memory shards tell you otherwise, if you find them before the tower.

## Combat

- A three-strike chain, an upward cut and an airborne pogo. Every hit earns
  thread, the resource every time power spends.
- The skip has invulnerability frames; use it through attacks, not away from
  them.
- Deflect arrows, bolts and gears back at their senders with a strike.
- Bosses telegraph for a third of a second, chain their attacks, and carry a
  poise meter: hit them hard enough and they stagger, taking extra harm for a
  moment. Rust knights block frontal strikes until pogoed, withered, or
  struck from behind.

## World

Thirty-three screens stitched into thirteen scrolling zones:

- **The Hollow Shore**: waking, the anchor, the Warden of the Shallows, Sef.
- **Rust District**: the Ferrous Mother, Wither, rusted locks.
- **Cathedral of Hours**: the Escapement, Stall, the crusher shaft, the gate.
- **The Clocktower**: the Regent, and what waits behind him.
- **The Drowned Archive**: the Archivist, the Index, Mend.
- **The Bone Mills**: the Miller, the Grinder, Echo.
- **The Root**: the long climb back to the light, and Sever.

Puzzles use the powers: timed doors need an anchor set at the door before
you run for the plate; weighted gates stay open only while an echo stands on
the plate; rusted locks need a withering; broken stairs need mending;
pendulum weights fall too fast unless time is stalled.

## Project layout

```
index.html        page shell
style.css
js/util.js        constants, helpers, input
js/audio.js       procedural sound effects and region music (WebAudio)
js/art.js         palettes, inked tiles, layered backgrounds, sprites, portraits, illustrations
js/story.js       the script: prologue, dialogue, boss scenes, memories, ending
js/rooms.js       the world: 33 screens as ASCII tile maps, stitched into zones
js/world.js       zone loading, collision, doors, locks, rubble
js/entities.js    player combat and powers, echoes, puzzle objects, enemies, boss framework
js/cutscene.js    illustrated panels, dialogue boxes and title cards
js/ui.js          HUD, title, pause, map, overlays
js/game.js        state machine, camera, time scale, zone transitions, save system
tools/validate.js structural checks and a platform-chain lint for every screen
tools/solve.js    reachability solver that plays the real physics headlessly
```

## Verification

```
node tools/validate.js   # every screen is 40x23, every exit links and lines up,
                         # doors have plates, ledges are within a jump
node tools/solve.js      # needs playwright + chromium; proves every power,
                         # boss, memory, hour and lantern is reachable in order,
                         # including the scripted fall into the Undergrounds
```

Add `?debug` to the URL for a debug build: `9` grants every power, `0`
raises health, and `[` / `]` jump between zones.
