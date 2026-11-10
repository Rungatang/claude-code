'use strict';
// ---------------------------------------------------------------------------
// World layout. Every screen is 40x23 tiles; screens are stitched into
// scrolling zones at the bottom of this file.
//
// Legend:
//   #  solid      .  air       =  one-way platform   ^  spikes
//   C  cracked wall (dash, or age)   L  rust lock (age)   R  rubble (restore makes it solid)
//   d  timed door (open 2s after its plate is released)   e  weight gate (open only while held)
//   p  pressure plate          X  crusher (hold stops one, and it bears you)
//   D  boss gate (shuts during a fight)   G  sealed gate (opens when the screen's gateFlag is set)
//   |  pillar   ~  water   :  rubble   (decor; ~ on a screen with a q is flood water: solid while flooded)
//   Interactable tiles (docs/POWERS.md section 3):
//   f  weak floor (age crumbles the run after a shake; a boulder breaks it; restore rebuilds it)
//   u  hanging platform, run 1..4 (age rots the rope, cut drops it; it lands as a bridge; restore lifts it back)
//   y  thorn wall (age wilts the run, restore regrows it)   s  vine seed (restore grows = rungs up the air above)
//   q  sluice (age opens it: the screen's ~ drains top row first; restore the empty socket to reflood)
//   l  lever (a strike, an echo or a deflected shot throws it: the screen's door latches, its L runs dissolve, and
//      every G with gateFlag 'lever:<screen>' opens; `broken: ['x,y']` on the screen def lists levers restore must fix)
//   x  blade pivot in a ceiling (swings; hold freezes it as a step, cut drops it to stick as a two-tall rock)
//   O  boulder (on a floor it rolls, hurts, presses plates and breaks f; over air it hangs on thread until cut; hold
//      makes it a solid shield). The first hanging O on a screen is the counterweight of the screen's first m.
//   m  tracked platform, run 1..3 (travels along its air track; with a counterweight it is a lift that rises once)
//   b  thread: a horizontal run is a bridge (standable, passable from below, never dropped through; cut: gone 4 s),
//      a vertical run of 2+ is a curtain (a wall that stops arrows; cut: falls for good)
//   Screen def tags: optional: true (lint may use a power's tile before its altar), needs: 'cut' or a list (a gate guarantees
//   those powers: the story-order lint counts them as held, and 'wings' allows 5-row jumps in the chain lint), uses: 'cling' /
//   'wings' (an optional pocket on the screen relies on them: the chain lint allows wall kicks / 5-row jumps, the story lint
//   does not count them as held), broken: ['x,y'] (levers Restore must fix), gateFlag: 'lever:<screen>' (a G opened by that lever)
//   P  player start   Q  underground arrival   S  lantern   N  npc   A  power altar   B  boss
//   M  memory shard   H  hour (max health)   T  spool (max thread)   i  inscribed tablet (Story.tablets)
//   a  husk   w  hourfly   t  archer   k  rust knight   r  wraith   h  mill hound
// ---------------------------------------------------------------------------
//
// The screens themselves live in js/rooms/<region>.js (loaded after this file); each region file
// adds its screens to ROOMS and its zones to ZONE_DEFS. js/zones.js stitches them.
// ---------------------------------------------------------------------------
const ROOMS = {};
const ZONE_DEFS = [];
// A guardian carries a power and the player takes it from the body where it falls (Game.bossDefeated):
// boss id -> power id. Boss.def.power (js/entities.js) is read from this table; tools/validate.js and
// tools/solve.js read it for the story order.
const BOSS_POWERS = { shallows: 'dash', ferrous: 'age', escapement: 'hold', index: 'restore', grinder: 'echo' };
