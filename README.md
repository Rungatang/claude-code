# Ashfall: The Last Cartographer

A story-driven metroidvania that runs in the browser with no dependencies and
no build step. Everything, from the tile art and character sprites to the
cutscene illustrations and the music, is generated procedurally in plain
JavaScript on an HTML5 canvas.

The look is hand-inked: outlines are "boiling" lines re-rolled a few times a
second, characters are articulated figures (a run cycle, squash and stretch,
a trailing sash, dash afterimages, slash trails), and every region is built
from stacked silhouette layers with fog, light shafts and drifting ash over
organically edged rock. Cutscenes play as framed scroll panels with large
expressive portraits and seal-stamped name plates.

## Play

Open `index.html` in any modern browser, or serve the folder:

```
python3 -m http.server 8000
# then visit http://localhost:8000/
```

| Action            | Keys                        |
|-------------------|-----------------------------|
| Move              | Arrow keys or A / D         |
| Jump              | Z, Space or K               |
| Lantern strike    | X or J                      |
| Ember dash        | C, L or Shift (once found)  |
| Cast light        | V or I (once found)         |
| Interact / talk   | Up or W                     |
| Map               | M or Tab                    |
| Pause             | Escape or P                 |
| Mute              | N                           |

Hold Escape to skip the prologue and ending cutscenes. Progress is saved to
the browser's local storage when you rest at a lantern.

## The story

Verenth was a city that never knew night, lit by a captured sun called the
Sky-Furnace. When the Furnace cracked, ash fell for forty days, the guild's
maps burned, and the Warden, an automaton built to guard the gates, sealed the
city shut to "protect" it. Beneath the ruins the last Cartographer, Orin, built
one final instrument before the ash took him: Ilse, a map that can walk.

You play Ilse. Redraw the city, take back the abilities Orin stole from his own
creations, read his final logs in the memory shards scattered through the
ruins, and give the Warden a new instruction.

## World

Six regions across 28 interconnected screens:

- **The Threshold**: Orin's workshop, where Ilse wakes.
- **Ashen Streets**: the hub. Pell the lamplighter's ghost keeps watch here.
- **The Sun-Engine**: guarded by the Cinder Hound. Grants the *Ember Dash*,
  which shatters cracked walls.
- **Cathedral of Soot**: guarded by the Choirmaster. Grants *Ash Wings*,
  a second jump.
- **Flooded Cisterns**: Kessa the tide-keeper lives here. Guarded by the
  Bellringer. Grants *Iron Grip*, wall-clinging and wall-jumping.
- **Hanging Reliquary**: reachable only by climbing. Holds the *True Lantern*,
  which dissolves shadow walls and casts light as a ranged attack.
- **The Warden's Spire**: the final gate, and the Warden itself.

There are eight memory shards (Orin's logs) and two heart embers to find.

## Project layout

```
index.html        page shell
style.css
js/util.js        constants, helpers, input
js/audio.js       procedural sound effects and region music (WebAudio)
js/art.js         palettes, auto-tiles, backgrounds, sprites, portraits, illustrations
js/story.js       all narrative text: prologue, dialogue, boss scenes, shards, ending
js/rooms.js       the world: 28 rooms as ASCII tile maps with links
js/world.js       room loading, tile collision, tile rendering
js/entities.js    player physics, enemies, the four bosses, projectiles, pickups
js/cutscene.js    illustrated panels, dialogue boxes and title cards
js/ui.js          HUD, title, pause, map screen, overlays
js/game.js        state machine, save system, room transitions, main loop
tools/validate.js structural checks for the room maps (node tools/validate.js)
tools/solve.js    reachability solver that plays the real physics headlessly
```

## Verification

```
node tools/validate.js   # every room is 40x23, every exit links and lines up
node tools/solve.js      # needs playwright + chromium; proves every ability,
                         # boss, shard, heart, lantern and the ending can be
                         # reached in the intended order
```

Add `?debug` to the URL for a debug build: `9` grants every ability, `0`
raises health, and `[` / `]` jump between rooms.
