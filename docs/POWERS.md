# POWERS: the traversal-first time powers (PLAN.md step 2)

Specification for the engine, art, level and tooling teams. Everything here is decided; where a value is a
guess it is still a number, and the playtest changes it. Read with `js/rooms.js` (legend) and `tools/solve.js`
(`prepZone`) open. Pixel values assume `TILE = 16`, `JUMP_V = 430` (a jump clears 3.4 tiles), `RUN_SPEED = 158`.

## 1. The rules every power follows

- **One input per power.** V (or I) casts the power selected with Q/E (U/O), the digits 1 to 5 select
  directly. Pad: RB casts the selected power, d-pad left/right selects, **LB is quick slot A = Age, LT is quick
  slot B = Hold** (`QUICK_POWERS = { castA: 'age', castB: 'hold' }`). Anchor/Recall stays on F (R, pad Y) and
  is not in the power list. Focus healing stays on hold H (G, pad B).
- **Aiming.** Every targeted power looks in a *cast box* in front of the chest point `(cx, y + 8)`:
  forward `RANGE` px, 24 px above and 24 px below the chest. Hold Up (d-pad up or stick up): the box is 32 px
  wide, centred on the player, and reaches `RANGE` px upward from the head. Hold Down while airborne: the same
  box below the feet. The box is the same shape for every power; only `RANGE` differs.
- **Targeting.** `Player.castTargets(id)` returns every valid target whose rect or tile overlaps the box,
  sorted by distance from the chest point; tiles count before entities at equal distance. The power acts on
  the **first** entry only (one thing per cast). Valid targets per power are listed in section 2.
- **Fizzle.** No target in the box: the cast does not fire, **costs nothing and starts no cooldown**; a dim
  arc of the power's colour is drawn at the edge of the box for 0.3 s and `sfx('fizzle')` plays. This is how
  range is taught without text. Echo is the exception: it always has a target (yourself).
- **Highlight.** While a power is selected, any valid target of that power inside the cast box is outlined
  in the power's colour (1 px, 40% alpha, pulsing). An object in range that this power cannot touch shows a
  small grey rune for 0.3 s when the cast hits it (`sfx('gate')`, the bonk sound), and the cast is refunded.
- **Costs, cooldowns, cast times** (`POWERS` in `js/entities.js`; `beginCast`/`firePower` keep their
  signatures). The cast locks movement for `windup + 0.2 s` as today.

| id | display | cost | cd | windup | RANGE | colour | icon |
|---|---|---|---|---|---|---|---|
| `age` | Age | 2 | 0.8 | 0.18 | 56 px | `#9fc59a` | the old `wither` branch icon |
| `hold` | Hold | 3 | 4.0 | 0.10 | 72 px | `#8fb3ff` | closed ring with a bar (new) |
| `restore` | Restore | 3 | 1.0 | 0.30 | 56 px | `#7af0d0` | the old `mend` cross |
| `echo` | Echo | 3 | 1.5 | 0.10 | self | `#e6d8ff` | unchanged |
| `cut` | Cut (Sever) | 2 | 1.2 | 0.14 | 40 px | `#ff3355` | the old `sever` scissors |
| (anchor) | Anchor / Recall | 0 / 2 | none | none | n/a | `#ffd27a` | unchanged |

- **Names.** Engine ids are the new ones above. Display names come from `POWERS[id].name`, so the player's
  decision 4 in PLAN.md is a one-line change: *Wither* may stay for Age (it still reads for rust and thorns);
  *Mend* may stay for Restore; *Stall* must go (it named the whole-screen slow that no longer exists); *Sever*
  is the recommended display name for `cut` because the script already gives it weight (tablet U4, the
  Regent's "her Sever, in your hand"). Echo stays.
- **Persistence.** Every permanent change to the world is a flag in `Game.save.flags` keyed by screen and
  local tile (`kind:<screen>:<x>:<y>`), written with `Game.writeSave()` the moment it happens, and applied in
  `World.load` exactly as `lock:`/`mend:`/`crack:` are today. Temporary states (Hold, cut bridges) are never
  saved.

## 2. The powers

### Anchor / Recall (keep)

- **Input** F / R / pad Y. First press sets the anchor at the feet (free). Second press returns to it for
  `RECALL_COST = 2` thread and clears it. The anchor dies on a zone change (toast "The anchor is lost
  behind you", already the behaviour of `loadZone`). Only one anchor exists.
- **New: anchors ride.** If the anchor is set while standing on a moving object (tracked platform `m`, lift,
  held crusher), the anchor stores `{ ride: entity, dx, dy }` and is drawn where the entity now is. Recall
  lands on the entity at that offset, wherever it has gone.
- **New: the streak.** Recall sweeps a 12x22 box along the straight line from the player to the anchor in
  8 px steps. Every Enemy or Boss touched once takes 1 damage (`from: 'recall'`), gains the player 1 thread,
  and enemies are stunned 0.3 s (bosses take poise +1 instead). The 0.5 s arrival invulnerability stays, so a
  recall through a boss is a dodge that costs 2 thread. **This is Recall's one combat use.**
- **Limits felt:** 2 thread, one anchor, same zone only, no anchor while airborne over spikes (sets
  `lastSafe` rules unchanged).
- **Failure feedback:** recall with < 2 thread: thread bar flashes, toast as today. Recall with no anchor
  sets one instead (no failure state).
- **Traversal uses** (sketch legend: `P` = where you stand, `>` `<` = the way on, everything else the legend):

```
1. closing door (A2, R2, D2 today)   2. the return ticket: a drop-only pocket
############                         #..S..P.....#   set F beside the lantern,
#..p.......#   set F at the door,    #######.#####   drop through the gap,
#..........d   run to the plate,     #######.#####   take the spool,
#....####..d   recall before it      ######...####   recall out: the walls are
#P.........d>  shuts (2 s hold)      #####..T..###   six high, the only way back
############                         #############   up is the anchor
3. before a long run                 4. anchor on a moving platform (m, section 3)
#..........M#  the ledge chain up    #...#..M....#   set F while riding, jump to the
#.........==#  is easy; the drop     #...#..=....#   alcove shard; the platform has
#.......==..#  back lands in spikes  #...........#   gone on; recall lands you on it
#.....==....#  unless you set F at   #mm.........#   wherever it is now, so you never
#...==......#  the foot first        #...........#   wait for it and never miss it
#P..^^^^^^^^#                        #^^^^^^^^^^^#
```

- **Tutorial:** A2 Sunken Stair as built (plate, door, tablet). **Late combination:** U5 Daylight, Anchor +
  lift: set the anchor on the parked lift (Cut use 1), ride up, explore the shelf, recall down onto the
  lift at the top. **VFX:** the anchor pin plus a gold afterimage trail along the streak that lingers 0.4 s.
  **SFX:** `save` on set, `shadow` on recall (unchanged). **HUD:** the existing anchor line; when the anchor
  rides, the line reads "anchor riding". **Solver:** unchanged (`d` doors are already modelled as open).

### Age (replaces Wither)

- **What it is:** a hundred years poured into one thing. Targeted, cone RANGE 56 px (3.5 tiles), so it
  reaches a little past the sword. The old wither bolt (projectile) is removed.
- **Targets and effects, in priority order of what the box finds nearest:**
  - `L` rust lock or hinge door: `World.dissolveLock` on the run (flag `lock:`), **run capped at 12 tiles**;
    the rest of a bigger run stays ("too much time to pour") so a 13+ wall is an un-ageable wall by design.
  - `f` weak floor: the connected run crumbles after 0.25 s of shaking (flag `crumble:` = true per tile).
  - `u` hanging platform: the rope rots 0.4 s, then the platform falls (section 3). Flag `rope:`.
  - `y` thorn wall: the run wilts to stubble, passable (flag `wilt:`), cap 12 tiles.
  - `q` sluice: rots open (flag `sluice:<screen> = 'open'`); the screen's `~` body drains top row first,
    one row per 0.2 s.
  - `C` cracked wall: crumbles (same as a dash; `breakCrack`).
  - Enemy or Boss: `withered = 5` s: damage taken x2, **shields and guards do not block** (knight front
    block, Escapement guard, Sef's guard), no speed change (the slow is gone; slowing is Hold's job).
    **This is Age's one combat use: armour rots.**
  - Immune, with the grey rune: thread (`b`), bronze (`x` blade), stone (`O` boulder), doors `d e G D`,
    rubble `R`, a lever.
- **Limits felt:** 12-tile cap, 3.5-tile reach, one target per cast, 2 thread.
- **Traversal uses:**

```
1. hinge door and overhead hatch      2. weak floor over a cellar
#...LLLL....#  hatch: stand under,    #P....fff...#  the floor shivers when stood on;
#...........#  hold Up + V            ######...####  age it from the edge, drop in,
#...====....#                         ######...#.##  take the spool; a one-way step
#....L......#  door: a 1-wide         ######.T.=.##  on the right gets you out
#P...L..l...#  vertical L run with    #############
############   a lever on the far side (section 3)
3. hanging platform becomes a bridge  4. drain a flooded hall
#..uuu......#  too high to reach;     #.P..q~~~~~~#  the water bears you (it is solid):
#...........#  age the rope and it    ######~~~~~~#  the high route runs over its skin.
#...........#  lands on the pillar    ######~~~~~~#  age the sluice from the ledge: it
#P..........#  tops and spans the     ######~~~T~~#  drains and the floor with the
####.....####  spike pit              ######~~~~~.>  spool and the low tunnel appears
####.^^^.####                         #############
```

- **Tutorial (no text):** R5 Locked Stair as built: the altar room R4 exits up into R5 whose first
  obstacle is the `LL` hinge door at (27..28, 13..15), in view, the only valid target in range, highlighted
  as soon as the player is within 56 px. The overhead `LLLL` hatch under the exit teaches Up + V.
- **Late combination:** U2 Taproot, Age + Restore: a root cistern (section 3, sluice) that must be drained to
  reach the spool on its floor and re-flooded (Restore the sluice) to walk its skin up to the shard shelf.
- **VFX:** green-grey dust that falls, the target desaturates over the windup. **SFX:** `rust` (new, a dry
  crackle) for tiles, `crack` for the fall. **HUD:** seal as today; the highlight colour is `#9fc59a`.
- **Solver** (`prepZone`, with `age` held): `L` -> `.`, `f` -> `.` (so routes may not *need* a weak floor
  to stand on once Age is held: designers put a `=` where a floor must remain), `y` -> `.`, `C` -> `.`,
  `q` -> `.` and every `~` of that screen -> `.` (see the variant rule in section 4), `u` -> `=` at its
  landing row (computed by dropping the run until a cell has `#`, `=` or the zone bottom beneath; a run that
  reaches the bottom is removed). Without `age`: `f` and `y` are `#`, `~` in a sluice screen is `#`, `u` is
  `=` where it hangs.

### Restore (replaces Mend)

- **What it is:** a thing is asked what it was. Targeted, RANGE 56 px. Restore only works on things that
  *remember another state*: that is the limit the player feels. One target per cast; if the box holds no
  world target and no enemy, the cast falls back to self (below).
- **Targets and effects:**
  - `R` rubble: the connected run becomes `#` (`mendRubble`, flag `mend:` unchanged). Stairs and holes.
  - crumbled `f`: rebuilt, flag cleared. A dropped `u`: rises back to its rope in 0.6 s, flag cleared.
    Wilted `y`: regrows solid, flag cleared. Rotted `q`: resealed, the hall refloods bottom row first.
  - `s` vine seed: grows. Every `.` straight above the seed, up to the first non-air tile or 12 rows,
    becomes `=` (a vine rung, drawn by the art as vine because `World.decor` records `v` there).
    Flag `vine:<screen>:<x>:<y>`. A grown vine never wilts.
  - broken lever `l` (section 3): fixed, flag `fixed:`. Then it can be struck.
  - Enemy: **rewound two seconds**: it is put back where it stood 120 frames ago (each Enemy keeps a
    ring buffer of its last 120 positions), its state becomes `idle`, `tele = 0`, `cool = 0.9`, and the
    move it was making is cancelled. Boss: same, plus poise +2, unless staggering. **This is Restore's one
    combat use: undo their lunge.** A boss can be rewound once per 6 s (`rewindCd` on the boss).
  - Self (fallback only): close wounds taken in the last 5 s, at most 2 hours (`recentDamage` as today,
    cap lowered from 3 to 2 so focus healing keeps a role).
  - Immune: `L`, `C`, intact `f`/`y`/`q`, thread, blades, boulders, doors.
- **Traversal uses:**

```
1. rebuild the stair (D4 today)       2. close a hole
#........##.#  the landing fell;      #P....RRR..M#  the shard is across a hole over
#.......RRRR#  cast from the step     ######...####  spikes; restore the three fallen
#...==......#  below and the flights  ######^^^####  slabs from the edge and walk
#.==........#  above are climbable    #############
#P..........#
3. regrow a vine ladder               4. unbreak a lever
#.........M.#  a shaft with a seed    #...........#  the lever to the gate is snapped
#.#.......=.#  at its foot; restore   #P....l..G.M#  (it clanks and sparks when struck);
#.#.........#  it and the column      #########G###  restore it, then strike it: the
#.#.........#  fills with rungs,      #############  gate (gateFlag 'lever:<screen>')
#.#..s......#  hop up rung by rung                   opens for good
```

- **Tutorial:** D4 Mend Altar as built: the fallen landing `RRRR` at (31..34, 9) is the first thing on the
  stair out; nothing else in the room answers Restore.
- **Late combination:** U7 The Vein, Restore + Echo: the lever that opens the shard shelf is broken and sits
  under a crusher; restore it, then step away and let the echo strike it (echoes are not crushed).
- **VFX:** jade motes flow *into* the target, the tiles redraw from the edges in. **SFX:** `weave` (new, a
  reversed `crack`), `save` on self-heal. **Solver** (with `restore`): `R` -> `#`, `s` -> `=` in the column
  above (same growth rule), a broken lever becomes usable; `f`/`y`/`q` are already `#` without Age, so no
  change; `u` dropped by Age also keeps a `=` where it hung (both positions).

### Hold (replaces Stall)

- **What it is:** one object is held out of time for `HOLD_DUR = 4.0` s. Targeted, RANGE 72 px (4.5 tiles,
  a reach). **One held thing at a time:** a new Hold releases the previous one. Casting Hold on the thing you
  are holding releases it early and is free. Nothing else in the world slows down.
- **A held thing is a platform.** `Game.held = { obj, t }`. Each frame `Game` builds `World.platforms`
  (section 3, dynamic platforms) and a held object pushes its rect there with `vx = vy = 0`, so the player
  can stand on it, and its hitboxes are inert. The held thing does not advance its own state (a blade keeps
  its angle, a crusher its height, a projectile its position, an echo its frame index).
- **Targets:** `x` swinging blade (4 s), `X` crusher (4 s; `Crusher.update` returns early while held), `O`
  boulder (4 s; a held boulder is solid on all sides: hounds and arrows stop at it), `m` tracked platform
  (4 s, stops in place), hostile Projectile (4 s; frozen in the air, standable 16x6; on release it continues
  its flight), Echo (4 s; it stays on its plate), Enemy (**pinned 2.5 s**: no movement, no contact damage,
  its top is a one-way platform; pogo still bounces and still damages; the knight's shield counts as down
  while pinned), Boss (pinned 0.8 s, once per 10 s per boss, `holdCd`). **The one combat use: pin, then pogo:
  a pinned enemy is a step and a free hit from any side.**
- **Limits felt:** one thing, 4 s, 4 s cooldown (the next Hold is ready as the first expires), 3 thread,
  bosses barely.
- **Failure feedback:** Hold on a tile that is not an object (rock, lock, water): grey rune, refund.
- **Traversal uses:**

```
1. the blade is a step                2. the crusher is a lift
####x#######   the pendulum (arm 4)   #....XXXX...#  two ledges, five tiles apart and
#..........#   swings under the       #...........#  three high: too far. the crusher
#.........M#   pivot; hold it at the  #...........#  falls between them. hold it when
#........###   right apex and it is   #=..........#  it is level with the low ledge,
#..........#   a platform under the   #..........=#  step on, jump to the high one
#P.........#   shard shelf            #P..........#
3. the boulder is a weight            4. the arrow is a step (secret routes only)
#..........e#  a boulder rolls the    #.........T.#  an archer looses across a drop;
#P.O...p...e>  corridor; hold it      #.........#.#  hold the arrow under the shelf
#############  while it is on the     #...t.......#  and climb it to the spool. never
               plate: the weight      #..##.......#  on the critical path: the solver
               gate opens, cross it   #P..........#  cannot see it
```

- **Tutorial:** H4 Crusher Shaft, level pass required: the first bank (16..19, 5) gets a `=` ledge each side
  so that holding the bank level with the lower ledge is the obvious step up. Hold also still lets you pass
  beneath a held crusher, which is what a first-timer will do.
- **Late combination:** H6 The Gallery (reached from U6 after Cut), Hold + Cut: hold the blade at its apex
  and cut its rope while it is held; a cut blade falls straight down from where it is, so the player chooses
  where the stuck blade (a two-tall solid step) lands.
- **VFX:** the held object turns blue-white with a thin clock ring that empties over 4 s; a soft bloom at
  the pivot. **SFX:** `hold` (new, a struck glass that sustains), `release` (the reverse) when it ends.
  **HUD:** while something is held, the Hold seal draws a small ring timer beside it. **Solver** (with
  `hold`): a crusher column is passable (`.` instead of `^`) and the crusher's rect at its top and at its
  bottom rest position becomes `=`; a blade's arc is `.` and its two apexes `=`; a boulder's lane is `.`
  and `=` at both lane ends (held against a wall); `m` keeps its track rule (section 3). Without `hold`: a
  crusher column is `^` (as today), a blade's arc (every tile within `len` px of the pivot and below it)
  is `^`, a boulder's lane (the floor row it patrols, one tile high) is `^`.

### Echo (keep, widen)

- **What it is:** the last **five seconds** of yourself (history buffer 300 frames, was 180), replayed
  twice. One echo at a time: casting again replaces it. The echo walks, strikes, presses plates and now:
  **strikes levers** (its attack box is tested against levers), **weighs on weak floors without breaking
  them**, and **is never hurt** (crushers, spikes, blades pass through it).
- **Decoy:** while an echo lives, every Enemy and Boss within 160 px of it targets the echo instead of the
  player: implement by making `pcx, pcy` in `Enemy.update`/`Boss` read `Game.decoyTarget()` which returns
  the nearest live Echo within 160 px, else the player. Archers aim at it, bosses leap at it, `near`/`far`
  distances are measured to it. **This is Echo's one combat use: they fight your past.**
- **Two plates:** a `d` or `e` door on a screen with N plates needs **all N** pressed at once (new rule in
  `World.updateDoors`: `pressed = every plate on the screen pressed`; screens with one plate are unchanged).
- **Limits felt:** 5 s memory, two loops, one echo, 3 thread, the echo cannot climb a vine that was not
  there when it was recorded.
- **Traversal uses:**

```
1. plate behind the gate (M2, U1)     2. two plates, one door (new rule)
#.....=.....#  drop in from above;    #P.p....p..d>  stand on the left plate, run to
#...........#  stand on the plate,    #############  the right one, cast: the echo holds
#..e........#  step off, cast: the                   the left while you hold the right,
#<.e...p....#  echo weighs it while                  the door opens (2 s hold), run
#############  you walk out left                     through; it latches behind you
3. record the climb                   4. the plate under the crusher
#....p......#  climb, press, drop,    #....XX.....#  a plate the crusher slams every
#...=.......#  cast at the door: the  #...........#  1.5 s; cross it once between
#..=........#  echo climbs again and  #...........#  slams, step off, cast: the echo
#.=.........#  presses while you      #P...p.....d>  repeats and takes the slams while
#P.........d>  wait below             #############  you stand at the door
```

- **Tutorial:** U1 Root Cellar as built (plate at (8, 20), gate at (15, 9..11)); the gate is visible from the
  plate and the walk from plate to gate is 4 s, under the echo's 10 s.
- **Late combination:** M2 Grindstones attic, Echo + Hold: the gate is 12 s from the plate; hold your echo
  while it stands on the plate (its frame index freezes, so the plate stays pressed 4 s longer).
- **VFX/SFX:** unchanged (`ability`), plus a violet thread drawn from the echo to the enemies it is
  decoying. **HUD:** seal unchanged. **Solver:** `e` -> `.` with `echo` (as today); a `d`/`e` on a screen
  with 2+ plates is `#` without `echo`; levers are reachable by the echo exactly where the player can reach,
  so no extra model.

### Cut (replaces Sever)

- **What it is:** the thread is cut. Targeted, RANGE 40 px (2.5 tiles): it is a stroke, not a reach. Cut
  works only on things that hang on thread or rope; everything else shows the grey rune.
- **Targets:** `u` hanging platform (drops at once, flag `rope:`); hanging `O` boulder (thread cut: it falls,
  then rolls; the paired lift `m` rises and parks, flag `lift:`); `b` bridge (the run vanishes for 4 s, then
  reweaves; no flag); `b` curtain (falls for good, flag `thread:`); `x` blade (the rope is cut: the blade
  falls straight down from its current position to the first solid and sticks there as a 1-wide, 2-tall
  `#`, flag `blade:<screen>:<x>:<y> = 'lx,ly'`). Enemy: a knight's shield strap, the Escapement's guard or any
  `guarding` state is cut: no blocking for 6 s (`shieldCut = 6`). Boss with `def.thread = true` (the pass in
  PLAN step 6 decides which; proposal: grinder, regent, sef phase 1): such a boss takes half damage until an
  armour thread is cut, which opens a **6 s full-damage window** with a visible thread snapping; the thread
  reknits after. **This is Cut's one combat use: open the armour.**
- **Limits felt:** 2.5-tile reach, thread and rope only, bridges come back in 4 s, 2 thread.
- **Traversal uses:**

```
1. the counterweight lift             2. drop through a thread bridge
#......#..M.#  the lift (mm) is       #P...bbbb...#  a thread bridge cannot be dropped
#......#....#  parked at the foot of  #...........#  through; the pocket under it has no
#......#....#  its shaft; a boulder   #...........#  door. cut it under your feet, fall,
#..O...#....#  hangs on thread beside #......M....#  take the shard; it reweaves in 4 s
#......#....#  it. stand on the lift, #############  and you jump back up through it
#P.....#mm..#  cut the thread: the                   (bridges are passable from below)
############   boulder drops, the lift rises to the shaft top and stays
3. the thread curtain                 4. release the boulder
#....b......#  a vertical run of      #..O........#  cut the thread: the boulder lands,
#....b......#  thread is a wall that  #P..........#  rolls right, crosses the weak floor
#P...b....M.#  also stops arrows.     #####fff.####  and breaks it, falls into the pocket
#############  cut it once: it falls  #####...####   and lies there; the pocket (spool)
               for good               #####.T.####   is open and two deep: jump out
                                      #############
```

- **Tutorial:** U5 Daylight, level pass: a thread curtain across the chimney at the top of U4's climb, in
  view of the altar, with a lone husk below it for the thread floor to be unnecessary (see section 6).
- **Late combination:** U7 The Vein, Age + Cut: age a hanging platform so it falls as a bridge across the
  lower cave, then cut the counterweight beside the far wall to raise the lift to the heart.
- **VFX:** a single red stroke, the cut thread curls away as two particles streams. **SFX:** `cut` (new, a
  short snap with a low after-ring). **HUD:** seal unchanged. **Solver** (with `cut`): `b` bridge -> `=`,
  `b` curtain -> `.`, `u` -> `=` at the landing row, hanging `O` -> `#` at its landing tile and its paired
  `m` -> `=` at the top parking spot, `x` -> arc `.` and a 2-tall `#` under the pivot. Without `cut`: `b` is
  `#` (so routes may not rely on jumping through a bridge from below), `u` hangs, `m` is `=` where parked,
  hanging `O` is `#` where it hangs.

### The one scripted stop

The whole-screen time stop (`Game.sever(d)`, `timeScale = 0`) survives in one place. In the Sef fight, when
her rewind triggers (`Boss.hurt`, `def.rewind`, she heals to 72%) and `Story.bosses.sef.rewind` has played,
the glass in Tam's chest answers: `Game.sever(3.0)` fires automatically, Sef is frozen mid-sentence, the
screen goes to the red `drawTimeFx`, and for three seconds every hit on her counts as withered (x2). It never
happens again, it costs nothing, and the toast reads "Everything stops. Everything but you." `Game.stall()`
is deleted. The bosses' own `timestop` move (they freeze the player) stays as it is.

### Optional movement upgrades

- **Wall cling** (`cling`): airborne, falling, holding toward a solid wall: slide at 60 px/s with a scrape
  of dust; jump: `vx = 220` away, `vy = -JUMP_V * 0.9`, facing flips. No cling on `=`, `b`, `~`, `y` (thorns)
  or a held object. **Altar:** D5 Flooded Vault, on the drained floor (needs Age, which the player has from
  R4). **Payoff:** the H7 Bell Loft spool, the R6 crane cab, the U7 upper shelf, each re-walled so a cling
  is the only way up. **Solver:** macro `wallkick±` from any state where `World.touchingWall(p, dir)`.
- **Second jump** (`wings`): one extra jump in the air, `vy = -JUMP_V * 0.85`, reset on landing, on a cling
  and on a pogo bounce. **Altar:** M5 Ossuary, the perch at (1, 17) (the spool moves to H6). **Payoff:** the
  H6 upper gallery to H7, the U5 shard shelf at (36, 12), the D2 pier top. **Solver:** macros `djump±@10/20/30`
  (second press at that frame). The chain lint's 3-row rule becomes 5 rows for screens tagged `needs: 'wings'`.

## 3. New interactable tiles

Ten letters. Legend addition for `js/rooms.js`; the validator's known-tile string gains `fuysqlxOmb`.

| letter | name | solid by default | state machine | changed by | persistence flag | validator |
|---|---|---|---|---|---|---|
| `f` | weak floor | yes | `whole` -> (Age or a boulder on it 0.3 s) `crumbled` (air) -> (Restore) `whole`. Standing on it 1.5 s shakes it, never breaks it. | Age, Restore, boulder | `crumble:<s>:<x>:<y>` | needs air above; chain lint: standable |
| `u` | hanging platform | one-way top | `hung` -> (Age 0.4 s, Cut at once) `falling` (gravity, lands on the first `#`/`=`/platform under any cell) -> `down` -> (Restore) `hung`. Held while falling: hangs in the air. | Age, Cut, Restore, Hold | `rope:<s>:<x>:<y> = dy` | run 1..4 wide; a `#` somewhere above its centre (the rope); at least 1 air row below; chain lint: standable |
| `y` | thorn wall | yes | `grown` -> (Age) `stubble` (air) -> (Restore) `grown`. No contact damage. | Age, Restore | `wilt:<s>:<x>:<y>` | run <= 12 if on the critical path |
| `s` | vine seed | no | `seed` -> (Restore) `grown`: the air column above becomes `=` rungs (decor `v`), max 12. | Restore | `vine:<s>:<x>:<y>` | at least 3 air rows above |
| `q` | sluice | yes | `sealed` -> (Age) `open` (the screen's `~` drains, top row first, 0.2 s per row) -> (Restore, on the empty socket) `sealed` (refloods bottom first). | Age, Restore | `sluice:<s> = 'open'` | a screen with `q` must hold a `~` body of 2+ rows, and vice versa; one `q` per screen |
| `~` (existing) | flood water, only on a screen with `q` | yes while flooded | `flooded` <-> `drained` with its sluice. Elsewhere `~` stays a decor row as today. | (via `q`) | (via `q`) | every `~` on a sluice screen must be edge-connected to the others |
| `l` | lever | no (16x16 entity) | `off` -> (melee strike, echo strike, deflected projectile) `on`, latched. `broken` (listed in the screen def `broken: ['x,y']`) -> (Restore) `off`. **On opens everything on its screen:** `d`/`e` latch (`door:<s>`), every `L` run dissolves, every `G` with `gateFlag: 'lever:<s>'` anywhere opens. | strike, Echo, Restore | `lever:<s>`, `fixed:<s>:<x>:<y>` | a `d`, `e`, `L` on the screen or a `G` with its flag somewhere; a `l` on a wall needs a standable cell beside it |
| `x` | swinging blade pivot | no (pivot in a ceiling) | arm `len` = air rows below the pivot - 1, clamped 3..7 tiles; swings +-60 deg, period 2.4 s, head 14x14, 1 damage and knockback. `swinging` -> (Hold) `held` (platform, inert) -> `swinging`; (Cut) `fallen`: drops from its current position, sticks in the first solid as a 1x2 `#`. | Hold, Cut | `blade:<s>:<x>:<y> = 'lx,ly'` | at least 4 air rows below; the arc must not cross a `S`, `A`, `N` or `i` cell |
| `O` | boulder | yes (16x16 entity) | spawned on a floor: `rolling` at 90 px/s, starts leftward, reverses at walls and ledges, 1 damage + knockback, presses plates, breaks `f`. Spawned over air: `hanging` on thread, static -> (Cut) falls, then `rolling`; the first hanging `O` on a screen is the counterweight of the first `m` (reading order). (Hold) `held` 4 s: solid, a shield. | Hold, Cut | `lift:<s>:<x>:<y>` (on its `m`) | a rolling boulder needs a lane of 3+ air tiles at floor level |
| `m` | tracked platform | one-way top | run 1..3 wide. Track: horizontal if the run has air left or right, else vertical; travels at 48 px/s until the next tile is solid, pauses 0.5 s, reverses. **Lift mode** when paired with a hanging `O`: parked at its start until the thread is cut, then travels to the far end and parks for good. (Hold) stops 4 s. Carries riders (dynamic platform). | Hold, Cut (via `O`), Anchor rides | `lift:<s>:<x>:<y>` | track of 3+ air tiles in exactly one axis |
| `b` | thread | yes | horizontal run (any length 1+ with a horizontal `b` neighbour, or a lone `b`) = **bridge**: standable, passable from below (like `=`), **not drop-through**; (Cut) gone 4 s, reweaves. Vertical run of 2+ = **curtain**: solid both ways, blocks projectiles; (Cut) falls for good. | Cut | `thread:<s>:<x>:<y>` (curtains only) | a bridge needs air above and below; a curtain needs floor under its lowest cell |

- **Hinge doors** are not a new letter: a 1-wide vertical run of 2+ `L` is drawn by the art as a door on
  rusted hinges (it falls forward in dust); its behaviour is the lock's. The rust lock keeps the letter.
- **Dynamic platforms** (new engine piece, needed by `u`, `m`, held things, pinned enemies): `World.platforms`
  is rebuilt each frame from entities that expose `platformRect()`. `World.moveBody`, after tile resolution and
  when `b.vy >= 0`, lands the body on a platform whose top the old bottom was above (`oldBottom <= p.y + 0.5
  + max(0, p.vy * dt)`) and the new bottom is below, with horizontal overlap; sets `res.ground`, `res.platform`,
  `b.riding = p`. At the start of `Player.update`, a rider still overlapping its platform horizontally moves
  by `p.vx * dt, p.vy * dt`. Down + jump drops through dynamic platforms exactly like `=`. Enemies ride too.
- **Tiles that become entities at load** (`World.load` emits specs like `crusher`): `u` (`HangingPlatform`),
  `x` (`Blade`), `O` (`Boulder`), `m` (`TrackPlatform`), `l` (`Lever`), `q` keeps a `SluiceSite` entity at its
  tile so Restore can target the empty socket. `f y s b ~` stay tiles; `isSolid` gains `f y q b` and `~`
  (flooded, per screen), and `moveBody` treats `b` like `=` with `dropThrough` ignored.
- **Not built** (budget of ten): the flame to snuff, the leaking pipe and the waterfall from the PLAN table.
  Their roles are covered by thorn (Age), lever (Restore) and sluice (Age/Restore).

## 4. What `tools/solve.js` must learn

- `prepZone(zoneId, abilities, variant)`: the per-power tile rules above, in this order: lever flags, Age,
  Restore, Hold, Echo, Cut, then the crusher rule as today. Ability ids change (`age hold restore echo cut`,
  plus `cling wings` when built). The final check `last.abilities.length === 6` becomes a check against the
  list of altars in `ROOMS` (every `ability` found).
- **Variants.** A screen whose state the player can flip both ways with the powers held (today only the
  sluice: Age and Restore both held) is explored once per state and the results are unioned; `variant` is a
  bitmask over the zone's sluices (at most 2 per zone, so at most 4 explorations). Every other change is
  one-way and takes the "both positions" approximation written under each power.
- **Specials.** `l` joins the touchable set with the strike rect `{ x: gx*16 - 14, y: gy*16 - 8, w: 44,
  h: 32 }`; touching a working lever sets `lever:<screen>` and, like relics today, triggers another pass. A
  broken lever is touchable only with `restore`.
- **Dynamic things** are approximated statically: a tracked platform's whole track is `=` (you can always
  ride it); a lift is `=` at its parked end only (bottom before Cut, top after); a held or frozen object is
  `=` at its rest extremes as listed; projectile platforms are never modelled, so they gate secrets only.
- **Return check** (PLAN step 0) runs with the same model, so a `u` dropped as a bridge must either leave a
  jumpable route back or the designer adds a lever/`=`.
- **Validator** (`tools/validate.js`): the rules in the table; the plate/door pairing rule extends to levers
  (a `d`/`e` screen needs a plate *or* a lever); chain lint treats `f u b m` as standable and `y q ~ O` as
  solid; a new lint lists every screen that uses a power's tile before the power's altar in story order
  (altar order below) unless the screen is marked `optional: true`.

## 5. Where the powers are found, and in what order

Altars stay where they are. The order and the story reason each belongs there:

| # | ability | altar | why here | what it opens |
|---|---|---|---|---|
| 1 | dash | A5 The Jetty | Sef's seal, unchanged | `C` walls |
| 2 | age | R4 Rust Altar | the Ferrous Mother's rust, "decay held like a stone" | R5 hinge door and hatch, R6 weak floor to the crane spool, D5 sluice, H1 hanging platform |
| 3 | hold | H3 Stall Altar | the Escapement's stolen tempo, now held in one hand instead of poured over a room | H4 and U3 crushers, H5 blade, M2 boulder plate |
| 4 | restore | D4 Mend Altar | the Archive files what was; it can be asked back | D4 stair, U2 hole and cistern, M4 chimney seed, M5 broken lever (the Grinder's seal) |
| 5 | echo | M4 Echo Altar | the mills ground hours into dust; what is ground echoes | U1 gate, M2 attic, H5 two plates, U7 crusher plate |
| 6 | cut | U4 The Mouth | Sef's last gift, given gladly: the one that spends the most strangers | U5 curtain, U6 lift, U7 bridge, H6/H7 blades, T1 approach |
| 7 | cling (opt.) | D5 Flooded Vault | the drowned learned the walls | H7, R6, U7 shelves |
| 8 | wings (opt.) | M5 Ossuary | the bones of those who leapt the Well | H6 to H7, U5 shelf, D2 pier |

**Existing gated spots, re-keyed:**

| spot | today | after step 2 |
|---|---|---|
| A2 `d`, R2 `d`, D2 `d` | anchor | anchor; the latch (done) keeps them open; R2 and D2 gain a lever `l` on the far side so the way back never needs the plate |
| R1 / A3 / R4 / M1 / U7 / H4 / D2 `C` | dash | dash (Age also crumbles them) |
| R5 `LLLL` hatch, `LL` door | wither | Age; the `LL` run is drawn as a hinge door |
| H4 `X` x3, U3 `X` x2 | stall | Hold, one bank at a time; ledges added so a held bank is a step |
| D4 `RRRR`, U2 `RRRR` | mend | Restore |
| M2 `e`, U1 `e` | echo | Echo; the `e` latches once crossed (done) |
| R3 `G` (gateNeeds 5) | relics | `gateFlag: 'lever:R6'`: the lever is in the crane cab of the optional R6 |
| H2 `G` (gateNeeds 8) | relics | `gateFlag: 'lever:H7'`: the lever is in the Bell Loft, past a blade (Hold, owned) |
| D3 `G` (gateNeeds 11) | relics | `gateFlag: 'lever:D5'`: the lever is on the vault balcony, reached over the water skin (no power needed; the drained floor below needs Age) |
| M3 `G` (gateNeeds 15) | relics | `gateFlag: 'lever:M5'`: the lever in the Ossuary is broken (Restore, owned) |
| T1 `G` `gateFlag: 'sever'` | sever | `gateFlag: 'cut'`; the Regent's phase 2 line stays |

`Game.relicCount()`, `gatePrompt` and `openNeedGates` stay for the shard-gated memory doors of step 4 but
no boss hall uses `gateNeeds` after this step. Every lever room above is optional today and becomes the
region's "look around before the boss" beat; each lever is 2 to 4 screens from the hall it opens and sits
beside a lantern or a spool so the detour pays twice.

## 6. Thread economy

Income today: +1 per melee hit, +1 per deflected projectile, +1 per kill. Start 3 of 9, spools to 15. Focus
healing spends `HEAL_COST = 3` per hour.

| spend | cost | typical puzzle | why |
|---|---|---|---|
| Recall | 2 | one per door or drop | cheap because it is the only undo |
| Age | 2 | one per gate, two in a sluice room | the most common key |
| Cut | 2 | one per thread | a stroke, not a ritual; Sef's "five hours" line moves to the scripted stop |
| Restore | 3 | one per stair, two with the sluice | expensive because it also heals |
| Hold | 3 | one per hazard, chained in gauntlets | strong in combat |
| Echo | 3 | one per gate | unchanged |

Two rules make puzzle rooms solvable without enemies and keep fights the richer source:

1. **The floor.** Outside boss fights, thread below 3 regrows at 1 grain per 2.5 s up to 3 ("three grains
   always run back"). Every single cast is therefore always possible after a short wait; two casts in a row
   need a hit or a kill. Tutorial rooms place one husk anyway so the wait is never felt.
2. **Lanterns refill thread** to max when resting (today they do not; add to `saveAtLantern`).

Budget check: a full puzzle room costs 4 to 6 thread; a first-time player with 9 max arrives with 3 to 6 and
leaves one fight with 9. HEAL_COST 3 means a player who heals twice cannot cast Hold until the floor refills,
which is the intended trade.

## 7. Migration of old saves

- `SAVE_KEY` becomes `hollow-hours-save-v4` (step 4b may bump again for the title; do not wait for it).
- `Game.readSave` migrates a v3 object found under the old key once, then writes v4: `abilities.wither ->
  age`, `stall -> hold`, `mend -> restore`, `sever -> cut`, `echo`/`dash` unchanged; flag `sever -> cut`
  (the T1 gate); flags `lock:`, `mend:`, `crack:`, `door:`, `boss:`, `shard:`, `heart:`, `spool:`,
  `tablet:`, `scene:`, `seen:` unchanged. Relic-seal progress needs nothing: the seals are gone. A migrated
  save that sits past a boss whose seal is now a lever gets the lever flag set (`lever:R6` if `boss:ferrous`,
  and so on) so no door closes on an old player.
- `POWER_ORDER = ['age', 'hold', 'restore', 'echo', 'cut']`; `powerIndex` is clamped as today. `debugKeys`
  and `tools/tests/mech.js` tests 7 to 11 are rewritten against the new ids (lock via Age, rubble via Restore,
  crusher via Hold, gate via Echo, curtain via Cut); test 11 becomes the scripted stop in the Sef fight.
- `Story.abilities` keys and the tablets R4, H3, D4, M4, U4 are reworded by the story pass; until then the
  overlay card falls back to `POWERS[id].hint`.

## 8. Engine checklist (names the other agents will look for)

`POWERS`, `POWER_ORDER`, `QUICK_POWERS`, `HOLD_DUR`; `Player.castTargets(id)`, `Player.beginCast(id)`,
`Player.firePower(id)` (same signatures), `Player.anchorKey()` with the ride and the streak; `World.ageTile(tx,
ty)`, `World.restoreTile(tx, ty)`, `World.cutTile(tx, ty)` (each dispatches on the tile letter and writes the
flag), `World.dissolveLock`, `mendRubble`, `breakCrack`, `updateDoors` kept; `World.platforms`,
`platformRect()` on `HangingPlatform`, `TrackPlatform`, `Blade`, `Boulder`, `Crusher`, `Echo`, `Enemy`,
`Projectile` while held; `Game.held`, `Game.hold(obj, dur)`, `Game.release()`, `Game.decoyTarget()`,
`Game.sever(d)` kept for the scripted stop, `Game.stall` removed; `Lever`, `SluiceSite` entities;
`Art.drawPowerIcon` ids `age hold restore echo cut`; `AudioSys.sfx` ids `fizzle rust weave hold release cut`.
