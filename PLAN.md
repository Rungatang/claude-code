# HOLLOW HOURS: action plan for the next phase

Status: planning only. No game code was changed for this plan. Read `HANDOFF.md` first for how the
project is built and tested; this file says what to build next, in what order, and how to know each
step is done.

## What the player asked for

1. A longer story.
2. Exploration that is rewarded and encouraged. Many rooms are blocked after you leave them.
3. Time powers that are not "freeze time, used the same way every time". Powers should be designed for
   traversal and exploration first, with a combat use as a second face.
4. Lanterns that save, reset enemies, and have no enemy spawning close to them.
5. A currency and a shop.
6. A protagonist who is confused for most of the game. He learns only that the big bad wronged him,
   and works out who he really is very late. The story should be told by the world and other
   characters, not by Tam narrating it.

## Where the game stands (facts checked in the code)

- 39 screens in 13 zones, 7 regions, 7 bosses, about an hour of play. Optional rooms hold 8 shards,
  6 hours and 9 thread spools.
- Powers today: Anchor/Recall, Wither (locks), Stall (slow everything), Mend (rubble), Echo (plates,
  weight gates), Sever (stop time). Stall and Sever are both "everything else slows or stops", which
  is the repetition the player noticed. Recall, Echo, Wither and Mend each open only one or two kinds
  of obstacle.
- Lanterns (`SavePoint` in `js/entities.js`, `Game.saveAtLantern` in `js/game.js`) heal and save. They
  do not reset enemies. Enemies come back only because every zone load re-creates all of them, so
  killing is never remembered, and nothing stops an enemy from standing next to a lantern.
- No currency, no shop, no map purchase, no fast travel.
- Tam narrates a lot: many `who: 'you'` lines in `js/story.js`, including the Regent plot and his own
  identity in the first scenes.
- Four boss halls are sealed by relic counts (5, 8, 11, 15). That was a quick pacing fix and should
  be replaced by real ability gating once more content exists.

## Principles for everything below

- Systems before content. Powers, lanterns, currency and the map change what a room can contain, so
  they come first. Building new regions on top of the old powers would mean rebuilding them.
- Every power is a traversal tool first. A power is done when it has at least four different puzzle
  or traversal uses and one combat use that is not "it slows the enemy".
- Every route can be walked back. A room may be a one-way trip only if a shortcut opens a return
  path, and the audit (step 0) must prove it.
- The solver and validator stay the source of truth. Each system below lists what they must learn.
- Ask "is this close to Hollow Knight in terms of experience?" at every milestone.

## Step 0: audit what is actually blocking the player (half a day)

Do this before designing fixes. The player's report "many rooms are blocked after we leave them" has
several possible causes and each needs a different fix.

Suspects:

- One-way ledges added where a lower zone meets an upper one, and drop-only entries.
- Boss gates that stay shut, or that shut behind you after a fight starts.
- Timed doors and weight gates met from the wrong side, with no way to hold them.
- The relic seals before four boss halls.
- Zones you can only reach by falling (the scripted loss into the archive, shafts entered from above).
- Rooms whose only exit needs a power you do not own yet, with no marker saying so.

Tasks:

1. Extend `tools/solve.js` with a return check: from every room the player can reach, can they get
   back to the nearest lantern and to the start, with the abilities they hold at that point? Print
   every room that fails and the reason (one-way drop, gate, door).
2. Add a one-way edge report to `tools/validate.js` (every drop and one-way platform that has no way
   back up) and list them in the plan notes.
3. Record a short playtest log from the player: which room felt blocked, what they were holding.
4. Fix the confirmed causes. Typical fixes: shortcut levers and doors that open from the far side,
   boss halls that reopen after the fight, ledges that can be climbed as well as dropped.

Done when the return check passes for every room at every stage of the solver.

## Step 1: lanterns, saves and enemy persistence (1 to 2 days)

Goal: Hollow Knight benches. Resting heals, saves, respawns the enemies, and is always safe.

- Persistent kills: store `killed:<screen>:<index>` in the session while you are away from a lantern.
  Enemies you killed stay dead until you rest, not until you leave the room. Resting clears the set
  and restores every non-boss enemy in the zone and its neighbours. Bosses stay dead.
- Dying returns you to the last lantern with the kill set cleared, like resting.
- Safe radius: no enemy spawns, patrols into, or is aimed at the lantern. Enforce it in two places:
  a lint in `tools/validate.js` (no enemy marker within 12 tiles horizontally and 6 vertically of an
  `S` tile, except flyers that must also respect it) and a runtime clamp in `Enemy` so a wandering
  enemy stops at the edge of the radius.
- Rest ritual: a short animation, a toast naming what was restored, the screen briefly warms.
- Place a lantern before every boss and about every 4 to 6 screens. Add a lint for the maximum
  walking distance between lanterns (count screens along the path).
- Stretch: a "set anchor at lantern" shortcut so the Recall power can return to the last lantern for
  a thread cost (tie in with fast travel in step 4).

Files: `js/entities.js`, `js/game.js`, `js/world.js`, `tools/validate.js`, `tools/solve.js`.
Done when: killing then leaving and returning keeps enemies dead, resting brings them back, and the
lint fails if an enemy sits inside a lantern's radius.

## Step 2: redesign the time powers around traversal (3 to 5 days)

The theme stays: Tam folds time. The change is that each power acts on things in the world, not on
the whole screen. Two powers that freeze the world are reduced to one, which becomes a targeted tool.

Design rules: one input per power, a thread cost, a short cooldown, a visible range, and at least
four traversal uses in different rooms plus one combat use.

| Power | Traversal uses (at least four) | Combat use |
|---|---|---|
| Anchor and Recall (keep) | Return through a closing door, undo a bad fall, set a point before a long run, drop an anchor on a moving platform and ride back | Recall carries an afterimage that damages what it passes through, so it is also a dodge |
| Age (replaces Wither) | Rust locks and hinges, crumble weak floors and walls, collapse hanging platforms, wilt thorn walls, snuff a flame, drain a flooded chamber by rotting a sluice | Armour and shields rot: the target takes extra damage for a few seconds |
| Restore (replaces Mend) | Rebuild bridges and stairs, close a hole, regrow a vine ladder, reseal a leaking pipe, unbreak a lever | Restores your own wounds slowly while you stand still, and un-breaks a shield you broke so it can be broken again for a bonus |
| Hold (replaces Stall) | Freeze one object for a few seconds: a swinging blade, a crusher, a waterfall, a rolling boulder, an enemy projectile that you then stand on as a platform | Pins one enemy in place, and a pinned enemy is a platform you can pogo off or jump from |
| Echo (keep, widen) | Hold a plate, then replay a route: record a run and the echo performs the jumps to trigger a distant switch, or act as a second weight on two plates | Decoy: enemies target the echo for a few seconds, and it strikes with your last swing |
| Cut (replaces Sever) | Cut ropes and chains to drop a platform or raise a counterweight, cut a thread bridge you no longer need, cut a barrier held by a thread | Cuts the guard of a shielded enemy, or an armour thread on a boss, opening a damage window |

Notes:

- The old "stop all time" effect survives only as a one-time story moment in the final fight, so it
  keeps its weight.
- The "forward and reverse time for other objects" idea from the original brief is the Age and
  Restore pair. Give each a limit the player can feel (only small objects, range, cost, cooldown)
  so they do not solve every puzzle by default.
- Each power gets a short tutorial room that teaches it with no text, plus one late room that
  combines it with another power.
- Optionally add two traversal-only movement upgrades in the Hollow Knight style so the powers do not
  carry the whole kit: a wall cling and a second jump, each with its own altar and sealed-route
  payoff.

Work items:

1. Write a one-page design for each power (range, cost, cooldown, what it targets, what it cannot).
2. Add tile and object types in `js/world.js` and `js/rooms.js` for new interactables (hinge, vine
   seed, rope, sluice, moving platform, thread bridge). Update the legend and `tools/validate.js`.
3. Rework `POWERS` and the cast code in `js/entities.js`; art for each power in `js/art/*.js`; HUD in
   `js/ui.js`; sounds in `js/audio.js`.
4. Teach `tools/solve.js` the new gates and the new movement model (it models gates by ability today;
   see the `prepZone` function).
5. Re-gate the existing rooms so each ability opens a real branch, and place the altars in an order
   that supports backtracking (see step 4).

Done when each power has four traversal rooms and one combat use, the solver passes, and a fresh
player can finish each tutorial room without reading text.

## Step 3: currency, shop and charms (2 to 3 days)

Story fit: the city runs on borrowed hours, so the money is "grains" of sand.

- Currency: grains drop from enemies and come from breakables and hidden caches. On death you drop a
  share at the spot (guarded by a hostile echo of Tam) and recover it by striking the echo down.
  This is also the death mechanic from the earlier backlog.
- Shopkeeper: the Pawnbroker, a quiet NPC who buys and sells hours. Appears in a lantern hub in each
  act. Stock rotates by act and by story flags.
- Stock: a map of the region (the map is blank until bought or found), a spool of thread, an hour
  fragment (four give one hour), charms, a lantern fast-travel key, and one expensive story item.
- Charms: six to ten small modifiers with a limited number of slots. Examples: longer telegraph
  window, more thread per hit, a recall that does not cost thread once per rest, a wider pickup range.
  Slots come from hour fragments and shops.
- UI: a shop screen and an inventory screen in `js/ui.js`, grain counter in the HUD, a charm menu on
  the pause screen. Save format gains `grains`, `charms`, `owned`, `killed`; bump the save key.
- Balance: target prices so a full clear of a region buys roughly one major item.

Done when you can earn grains, lose and recover them, buy and equip a charm, and the save survives a
reload.

## Step 4: exploration rewards and navigation (2 to 3 days)

- Visible locked doors: every gate that needs a future power shows a marker on the map once seen
  (a faint symbol of the missing power), so backtracking has a destination.
- Map: reveals as you explore, pin markers, shop and lantern icons, a stamp for each unread tablet.
  The map is sold by the cartographer (step 3).
- Fast travel: lantern to lantern, unlocked by a key item or by resting at both ends. Costs a few
  thread so it is not free.
- Secret rate: at least one secret per region that is not an obvious dead end, and one hint for each
  (tablet, odd wall, a draught of particles). Rewards: hours, spools, charms, grains, lore.
- Shortcuts: each long branch ends in a door or lever that opens a loop back to a lantern.
- Replace the four relic seals with real ability gates, and keep a few shard-gated "memory doors"
  that unlock extra story scenes rather than boss access.

Done when the solver can list every locked door with the power it needs and the map shows it.

## Step 5: the story, longer and quieter (ongoing, starts in parallel with step 1)

### The shape of the reveal

Tam knows almost nothing for most of the game. Everything that is revealed comes from someone else,
from a tablet, from the environment, or from a memory shard whose source is unreliable.

| When | What Tam knows | What the player learns |
|---|---|---|
| Start | Nothing. A ticking in his chest | The shore, a kind stranger |
| After boss 1 | His name is Tam. He is told to go up | Sef is a friend, but gives almost no explanation |
| Early middle | Someone took his memory and sent him here | The Regent is blamed by everyone he meets |
| Middle | The Regent is called the villain by the lower city | Cracks: why does the Regent ask what Sef told him |
| Late middle | The thread is stolen hours, and every power spends a stranger | The player realises before Tam does |
| Late | Sef built him, he is her brother | The confrontation and the twist |
| End | What he is: four hundred people who owed Sef | The ending choice |

Rules for the script:

- Cut Tam's inner monologue to short reactions. Remove or rewrite most `who: 'you'` lines in
  `js/story.js` (the region entrances, the screen entrances, the Archive and Mills lines).
- Memory shards should be partial and sometimes wrong: show the same moment from two points of view
  and let the player work out which one lies.
- Sef never lies outright in the first half. She leaves things out. That keeps the twist fair.
- Use the tablets (already in `Story.tablets`) as the main carrier of world lore, and add NPCs who
  contradict each other.

### The length

Target 4 to 6 hours for a first playthrough, up from about one.

- New regions: a market town with the Pawnbroker and a cartographer (a hub, no combat), a
  glassworks, an orphan ward, a debtors' court, and a garden of unspent hours. Each is five to eight
  screens, one lantern hub, two optional rooms, one boss or mini-boss.
- New bosses: three to four, plus two optional hard bosses with a reward.
- Questlines: the Archivist (the ledgers), the Miller (what the mills ground), the Pawnbroker (what
  she buys), a rival who wants Tam's thread, and one that ties to each power.
- Memory shards rise from 8 to about 24, grouped into four sets, each set unlocking a short scene.
- The scripted loss to the Regent stays, but it happens later, after the player has met the city.

### Process

1. Write a story bible (`STORY_BIBLE.md`): cast, secrets, who knows what and when, timeline of the
   backstory, and the reveal ladder above, one line per screen.
2. Review it with the player before writing dialogue.
3. Draft the script from the ladder, then trim every line Tam says that is not a reaction.
4. Add the new regions only after steps 1 to 4 land, so they use the final powers and lanterns.

## Step 6: carry-over items from earlier

- The tower arenas scored 5 out of 10 in review and were left as the original boxes: redo them.
- Level critics asked for more rhythm in several rooms (empty central voids in D2, D4, M1, M2, A3).
- Portraits: no talking animation, moods barely read. Add a talk state tied to the text typewriter.
- Per-speaker text blips (`AudioSys.sfx('text', who)` is already called).
- Boss pacing: a pass on each boss's move set so they use the new powers (for example, a boss that
  only takes full damage while its thread is cut).
- Remaining feel items: boss combo lunges and hit-stop length, stop kick on the player.
- README and `HANDOFF.md` refresh after each step.

## Suggested order and checkpoints

| Milestone | Contents | Checkpoint |
|---|---|---|
| M0 | Step 0 audit and fixes | Return check passes; the player can walk back everywhere |
| M1 | Step 1 lanterns and persistence | Rest, kill memory and safe radius verified |
| M2 | Step 2 powers, first three | Age, Hold, Cut in with tutorial rooms and solver support |
| M3 | Step 2 rest of the powers, Step 3 currency, shop, charms | A full economy loop plays through |
| M4 | Step 4 map and fast travel; step 5 story bible agreed | Player signs off the bible |
| M5 | Rewrite existing script plus first new region | New region playable end to end |
| M6 | Remaining new regions and bosses | Playtest, balance, publish |

At every milestone: run `tools/check.sh`, update `HANDOFF.md`, republish the artifact from a verified
snapshot, and ask the player to play it before starting the next one.

## Decisions needed from the player

1. Target length: 4 to 6 hours, or something else?
2. Death: lose grains and fight your echo to recover them (the Hollow Knight way), or a gentler loss?
3. Fast travel: allowed from the start of each act, or only late?
4. Do any of the current power names need to stay (Wither, Stall, Mend, Echo, Sever)? The plan renames
   three of them.
5. Endings: one ending, or a choice at the end tied to what Tam learns about Sef?
6. Should extra movement upgrades (wall cling, second jump) be added alongside the time powers?
