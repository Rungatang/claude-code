'use strict';
// ---------------------------------------------------------------------------
// World layout. Every screen is 40x23 tiles; screens are stitched into
// scrolling zones at the bottom of this file.
//
// Legend:
//   #  solid      .  air       =  one-way platform   ^  spikes
//   C  cracked wall (dash)     L  rust lock (wither)  R  rubble (mend restores to solid)
//   d  timed door (open 2s after its plate is released)   e  weight gate (open only while held)
//   p  pressure plate          X  crusher (slow it with stall)
//   D  boss gate (shuts during a fight)   G  sealed gate (opens when the screen's gateFlag is set)
//   |  pillar   ~  water   :  rubble   (decor)
//   P  player start   Q  underground arrival   S  lantern   N  npc   A  power altar   B  boss
//   M  memory shard   H  hour (max health)   T  spool (max thread)
//   a  husk   w  hourfly   t  archer   k  rust knight   r  wraith   h  mill hound
// ---------------------------------------------------------------------------
//
// The screens themselves live in js/rooms/<region>.js (loaded after this file); each region file
// adds its screens to ROOMS and its zones to ZONE_DEFS. js/zones.js stitches them.
// ---------------------------------------------------------------------------
const ROOMS = {};
const ZONE_DEFS = [];
