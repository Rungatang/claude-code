# HOLLOW HOURS: handoff for a new session

Paste the block below as the first message of a new Claude Code chat opened in a clone of this
branch. It tells the next session what the game is, how it is built and tested, what is in flight
and what the player (you) has asked for.

---

I am continuing HOLLOW HOURS, a dark browser metroidvania in this repo (branch
`claude/eager-wright-e73jp5`, GitHub Rungatang/claude-code). Read `HANDOFF.md` and `README.md`
first, then `tools/check.sh quick` to confirm the game runs.

**What it is.** Vanilla HTML5 canvas + WebAudio, no dependencies, no image or sound assets:
everything is drawn and synthesized in code. Open `index.html` (or serve the folder with
`python3 -m http.server 8000` and open http://localhost:8000/). The published build is the
Claude artifact https://claude.ai/artifact/LBDHpB9yPkjfHEB2qhZVJa (republish it from a verified
snapshot whenever a milestone is reached).

**Vision.** Hollow Knight in experience and environments, Nine Sols in inked art and storytelling.
Not a kids' game. Story: an amnesiac man with an hourglass fused into his chest (Tam) has time
powers: Anchor/Recall (F), then Wither, Stall, Mend, Echo, Sever (Q/E select, V cast). Sef, the
"friend" met after the first boss, is the real villain: she built him from four hundred people's
stolen hours and erased his memory. The Regent of Hours defeats him once (scripted loss) and
drops him into the underground; the long climb out ends with the twist. Full script in
`js/story.js`.

**Layout of the code.**
- `js/util.js` constants, input bindings, `ZOOM = 2` (the camera shows a 320x184 window of a
  640x368 canvas so characters read large), helpers.
- `js/rooms.js` legend; `js/rooms/<region>.js` screens (40x23 tile strings) and zone lists;
  `js/zones.js` stitches screens into scrolling zones. Legend: `#` rock, `=` one-way, `^` spikes,
  `C` cracked (dash), `L` lock (wither), `R` rubble (mend), `X` crusher (stall), `p/d/e` plate,
  timed door, weight gate, `G/D` gates, `P/Q/S/N/A/B/M/H/T` start, arrival, lantern, npc, altar,
  boss, shard, heart, spool, `a w t k r h` enemies.
- `js/world.js` zone loading and collision; `js/entities.js` Player, Echo, Enemy, Projectile,
  Pickup, Boss (BOSS_DEFS move framework: combo, dash, leap, volley, rain, hook, spin, summon,
  teleport, timestop, guard; poise/stagger; phase 2); `js/game.js` state machine, camera,
  pickups, bosses, save (`localStorage`); `js/ui.js` HUD, title, map, dialogue box;
  `js/cutscene.js`; `js/audio.js` procedural music and sfx (`AudioSys.playTheme(name)` per
  region plus `boss` and `ending`); `js/art/*.js` inked art (core palettes and `Ink` helper,
  env backdrops, tiles, player, props and NPCs, enemies, bosses, portraits, illustrations).
- Animation contract between gameplay and art: entities expose `anim, runPhase, airT, landT,
  landImpact, idleT, turnT, sqX, sqY, lean` (player), `walkPhase, sqX, sqY, lean, hitKick`
  (enemies), `sqX, sqY, lean, hitKick, stateT` (bosses); art reads them with fallbacks.

**Verification (run before every commit).**
- `tools/check.sh quick`: syntax, layout validator (`tools/validate.js`: sizes, links, matching
  edge openings, ledge chain lint), smoke test.
- `tools/check.sh`: also `tools/solve.js` (reachability solver: every zone, altar, boss, plate,
  shard, heart and spool reachable in story order, tower bosses not before Sever; must end
  SOLVER OK), `tools/tests/mech.js` (mechanics and all seven boss fights; must end
  "errors: none"), `tools/tests/flow2.js` (story flow), `tools/render.js all` (art contact
  sheets and in-game shots), `tools/rooms-sheet.js` (whole-zone maps), `tools/music-check.js`
  if present.
- Needs Node 18+ and Playwright with Chromium (`npm i playwright && npx playwright install chromium`).

**Player requests so far, all still binding.** Camera zoomed on the character (done, ZOOM 2);
good animations; movement of the hero and enemies must not feel mechanical; music like Undertale
and Hollow Knight, bright songs and dark uncomfortable ones; deep combat (3-hit chain, up-cut,
pogo, dash i-frames, deflection, boss poise/stagger, no waiting games); graphics "way better";
keep asking "is this close to Hollow Knight in terms of experience?".

**In flight when this handoff was written (check `git log` for what landed).** Parallel
rewrites of every `js/art/*.js` module, of movement/combat feel in `js/entities.js` and
`js/game.js`, of the soundtrack in `js/audio.js`, and a level redesign of every region
(sculpted terrain, optional screens, secrets with hearts `H` and spools `T`). If some of that is
missing, redo it in that order.

**Backlog.** Spool pickup on the game side (`Game.onPickup` kind `spool`: `maxThread++`, flag
`spool:<screen>:<x>:<y>`, `Game.spoolCount()`, save `maxThread`, art in `drawPickup`); a Hollow
Knight style death mechanic (a hostile echo of the lost hour waits where you died and holds part
of your max thread until struck down); per-speaker text blip voices (`AudioSys.sfx('text', who)`
is already called); more enemy types; README refresh; republish the artifact from a snapshot.

**Conventions.** Commit small, descriptive, and push to the same branch; never put model names
in commits; do not create a pull request unless asked.
