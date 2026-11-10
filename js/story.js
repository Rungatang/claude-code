'use strict';
// ---------------------------------------------------------------------------
// The script of WOUND.
//   { ill, text, hold }        illustrated panel
//   { who, name, text, mood }  dialogue line
//   { title, sub, hold }       title card
// Pacing rules (docs/STORY_BIBLE.md, Voice): nothing here teaches a control (Game.stepPrompts does, at the
// need, once); nobody is named before the Jetty; a scene flagged `minor` is dropped rather than played
// within Game's quiet gap of the last one. Arrays the engine reads stay, emptied, as [].
// ---------------------------------------------------------------------------
const Story = {
  prologue: [
    { ill: 'dark', text: 'Water, close. Something ticking, closer.', hold: 3 },
    { ill: 'shoreWake', text: 'Cold stone under one cheek. Salt. A weight where the chest should be, turning.' },
  ],
  // not a dialogue box: the first step's text surfaces as a whispered line a moment after he stands (Game.newGame)
  wake: [
    { who: 'you', name: '???', text: 'Who.', mood: 'sad' },
  ],

  // no screen opens with a card: controls are taught by Game.stepPrompts, at the need
  screenEnter: {
    A2: [],
    A3: [],
    U4: [],
  },

  regionEnter: {
    tower: [],
  },

  sef: {
    // She knows he is blank because she made him so; nobody tells her. She uses the name as if nothing were wrong,
    // waits for an answer that does not come, covers, and goes back to something small. She gives nothing here.
    jetty: [
      { who: 'sef', name: '???', text: 'Tam. You\'re late. The tide\'s been out an hour.' },
      { who: 'sef', name: '???', text: '...Tam?', mood: 'sad' },
      { who: 'you', name: 'Tam', text: 'Tam.' },
      { who: 'sef', name: '???', text: '...The water does that. It comes back.', mood: 'sad' },
      { who: 'sef', name: '???', text: 'You\'ve its step already. So that took.' },
      { who: 'sef', name: '???', text: 'Those boots are soaked through. Stand by the lamp. I\'ve a net to finish.' },
    ],
    jettyAgain: [{ who: 'sef', name: '???', text: 'Mind the third board. I\'ve not got to it.' }],
    afterDash: [],
    root: [
      { who: 'sef', name: '???', text: 'Longer than I allowed for. Let me look.', mood: 'sad' },
      { who: 'sef', name: 'Sef', text: 'Don\'t flinch. It\'s only Sef.' },
      { who: 'sef', name: 'Sef', text: 'This one I kept back. Take it. It\'s lighter than it looks.' },
      { who: 'sef', name: 'Sef', text: 'It costs a little. Don\'t count.', mood: 'stern' },
    ],
    rootAgain: [{ who: 'sef', name: 'Sef', text: 'Take it, Tam.' }],
    afterSever: [],
    confront: [
      { who: 'sef', name: 'Sef', text: 'Look at him. A hundred years behind that door, and he\'s robes.' },
      { who: 'you', name: 'Tam', text: 'Sef.', mood: 'stern' },
      { who: 'sef', name: 'Sef', text: 'Don\'t. It never sounded like that.' },
      { who: 'sef', name: 'Sef', text: 'He\'ll have said glass. He always starts with the glass.' },
      { who: 'sef', name: 'Sef', text: 'The door never felt it. I measured twice for that.', mood: 'stern' },
      { who: 'sef', name: 'Sef', text: 'One more use, love. Die where I can reach.' },
    ],
  },

  archivist: {
    intro: [
      { who: 'archivist', name: 'The Archivist', text: 'Another one down the chute. Early. They usually take a day to stop shouting.' },
      { who: 'archivist', name: 'The Archivist', text: 'His chute, and he\'s not looked down it in sixty years. Sends bread, when he remembers.' },
      { who: 'archivist', name: 'The Archivist', text: 'It\'s the kind one fills this place. Just an hour, she says. Just the one.' },
      { who: 'archivist', name: 'The Archivist', text: 'The book\'s in the Reading Room. The Index won\'t let me by.' },
    ],
    again: [{ who: 'archivist', name: 'The Archivist', text: 'Mind the paper. It cuts.' }],
    afterIndex: [
      { who: 'archivist', name: 'The Archivist', text: 'That\'s its binding on the floor. I kept the Archive, and the city filed people in it.', mood: 'sad' },
      { who: 'archivist', name: 'The Archivist', text: 'The kind one married a miller. I filed that too.' },
    ],
    end: [{ who: 'archivist', name: 'The Archivist', text: 'Water\'s going. I\'d forgotten the floor had a pattern.' }],
  },
  miller: {
    intro: [
      { who: 'miller', name: 'The Miller', text: 'Don\'t mind the dust.' },
      { who: 'miller', name: 'The Miller', text: 'Sixty years the wheel\'s turned with nobody up top to stop it. He sealed the Clock and sat on it.' },
      { who: 'miller', name: 'The Miller', text: 'Sef ran the Well. My wife. Sat you down by the water. Spoke so softly.' },
      { who: 'miller', name: 'The Miller', text: 'That noise is the Grinder. It was a dog.' },
    ],
    again: [{ who: 'miller', name: 'The Miller', text: 'It was a dog once.' }],
    afterGrinder: [
      { who: 'miller', name: 'The Miller', text: 'Quiet, at last. ...You stand like someone.', mood: 'sad' },
      { who: 'miller', name: 'The Miller', text: 'She\'ll want to sit by the water. She always did. Stay standing, boy.' },
    ],
    end: [{ who: 'miller', name: 'The Miller', text: 'Wheel\'s stopped. I\'ll go and see the sky.' }],
  },

  underground: [],
  loss: [
    { who: 'regent', name: 'The Regent', text: 'Stop. Nothing has come through that door in sixty years.', mood: 'calm' },
    { who: 'regent', name: 'The Regent', text: 'I have never seen you. And you smell of the Well. What did she tell you?' },
    { who: 'regent', name: 'The Regent', text: 'Go down. Think.', mood: 'stern' },
    { ill: 'fall', text: 'The hands stopped. The floor opened. Then water.', hold: 5 },
  ],

  bosses: {
    shallows: {
      intro: [{ title: 'WARDEN OF THE SHALLOWS', sub: '', hold: 2.4 }],
      defeat: [],
    },
    ferrous: {
      intro: [{ title: 'THE FERROUS MOTHER', sub: '', hold: 2.4 }],
      defeat: [],
    },
    annealer: {
      intro: [{ title: 'THE ANNEALER', sub: '', hold: 2.6 }, { who: 'annealer', name: 'Brannoch', text: 'Hold still. Nearly cooled. You\'ll crack it, boy.', mood: 'calm' }],
      phase2: [{ who: 'annealer', name: 'Brannoch', text: 'Two bulbs. No neck. Holds more than it should.', mood: 'stern' }],
      defeat: [{ who: 'annealer', name: 'Brannoch', text: '...There. Cooled.', mood: 'sad' }],
    },
    escapement: {
      intro: [{ title: 'THE ESCAPEMENT', sub: '', hold: 2.4 }],
      defeat: [{ who: 'escapement', name: 'The Escapement', text: 'Her.' }],
    },
    regent1: {
      intro: [{ title: 'THE REGENT OF HOURS', sub: '', hold: 2.6 }, { who: 'regent', name: 'The Regent', text: 'Who let you up the stairs? Hold still. It goes faster.', mood: 'calm' }],
      defeat: [],
    },
    index: {
      intro: [{ title: 'THE INDEX', sub: '', hold: 2.4 }],
      defeat: [{ title: 'THE LEDGER', sub: 'Columns, each signed at the foot. S.', hold: 5 }],
    },
    grinder: {
      intro: [{ title: 'THE GRINDER', sub: '', hold: 2.4 }],
      defeat: [],
    },
    regent: {
      intro: [{ title: 'THE REGENT OF HOURS', sub: '', hold: 2.6 }, { who: 'regent', name: 'The Regent', text: 'You climbed out. And still the blade. So she has you.', mood: 'calm' }, { who: 'regent', name: 'The Regent', text: 'I am very old. Let us see if I am still quick.', mood: 'stern' }],
      phase2: [{ who: 'regent', name: 'The Regent', text: 'There. Her Sever. The one thing I couldn\'t stop.', mood: 'stern' }],
      defeat: [
        { who: 'regent', name: 'The Regent', text: 'Enough. A hundred years I kept it shut.', mood: 'calm' },
        { who: 'regent', name: 'The Regent', text: 'That is not clockmasters\' glass. We never blew one that size.', mood: 'sad' },
        { who: 'regent', name: 'The Regent', text: 'She is behind you. Ask her about the glass.' },
      ],
    },
    sef: {
      intro: [{ title: 'SEF', sub: '', hold: 2.6 }],
      rewind: [{ who: 'sef', name: 'Sef', text: 'No. I turn mine back, little brother.', mood: 'stern' }],
      defeat: [
        { who: 'sef', name: 'Sef', text: 'Tam. Every one of them owed. It is written down.', mood: 'sad' },
        { who: 'sef', name: 'Sef', text: 'I made you last. Nothing in you will run out.' },
        { who: 'you', name: 'Tam', text: 'No.', mood: 'stern' },
        { title: 'THE LEDGER, LAST PAGE', sub: 'S., one hour. Given.', hold: 5 },
      ],
    },
  },

  ending: [
    { ill: 'clock', text: 'The Great Clock opened. Its hands were cold.', hold: 6 },
    { ill: 'giving', text: 'The hours went out of the glass and into the gears. Afternoons, returning to the street they were taken from.', hold: 8 },
    { ill: 'shoreEnd', text: 'The Regent found the hourglass on the shore, empty. He buried it above the tideline. The Miller asked what the stone should say. HE GAVE THEM BACK.', hold: 8 },
    { title: 'WOUND', sub: '', hold: 4 },
    { title: 'Thank you for playing', sub: '', hold: 4 },
  ],

  // Fragments. Index = ROOMS `M` order (room id in the comment). `key` shards get the full ceremony.
  // They are not one life (docs/STORY_BIBLE.md, "How the memories work"): `hand` says whose hour a fragment came
  // out of (0 his own, always the left hand; 1 a fisherman, 2 a girl, 3 an old man, 4 a baker, 5 the one who signs).
  // Nothing on screen says so. A span in {braces} is an ink blot until the fragment mends: with `clear: n`, when n
  // memories are held; without, when another fragment of the same hand is held (Memory, below).
  shards: [
    { title: 'Bell', key: true, hand: 0, text: 'A bell over a door. A small left hand closes on a twist of paper. Sugar. Behind the counter, {a girl on a stool, counting}.' }, // A2
    { title: 'Fog', hand: 3, text: 'A cough that starts below the ribs. River fog on the pane, a stick by the door. From the kitchen: {"Hale? Hale, come and eat."}' }, // A3
    { title: 'Bottle', hand: 0, text: 'Sand through a funnel of folded paper into a green bottle. The left thumb presses the cork in. "Keep it, and the day is kept."' }, // A5
    { title: 'Kettle', hand: 1, text: 'Wet wool, tallow, a kettle just off the boil. The sea on the shutters. Someone calling from the next room: {"Dov. Dov, it\'s gone five."}' }, // A6
    { title: 'Latch', hand: 2, text: 'A latch set too high. On tiptoe the right hand just reaches. Forty-one steps down, counted aloud, to {the river, brown and loud}.' }, // R1
    { title: 'Pen', hand: 5, text: 'A pen scratching in a kitchen, late. Columns. The same initial at the foot of every one. {The wrist aches from making it.}' }, // R2
    { title: 'The Rim', key: true, hand: 4, text: 'Dry stone, cold to sit on. A line behind, hats in their hands. The right hand, ringed, held out as asked. "Only the one."' }, // R4
    { title: 'Bulbs', hand: 0, clear: 12, text: 'Two bulbs of glass, no neck, still warm. Weighed in the left palm. "It will do for one." {Wrapped in an apron, for her.}' }, // R5
    { title: 'Slower', hand: 3, text: 'Called by name, slow to rise; the stick goes first. A soft thumb at the wrist. Afterwards the bridge is longer, and the bread cold.' }, // R6
    { title: 'Yellow dog', hand: 4, clear: 13, text: 'Flour to the elbow, the ring on the sill. A yellow dog\'s ears under the thumb. From the yard: {"Maud! He\'s in the dough again."}' }, // H3
    { title: 'Owing', hand: 1, clear: 14, text: 'The boat is named for a daughter. The harbour clerk says the number twice. The right hand signs. Outside, {gulls, and the tide going out}.' }, // H4
    { title: 'Rice', hand: 2, clear: 16, text: 'Rice on the wheelhouse steps, gathered grain by grain into a pinafore pocket. Bells. From inside: {"Wenna! Leave it for the birds."}' }, // H6
    { title: 'Brazier', hand: 0, text: 'Paper in a brazier, edges lifting black. The left hand feeds it in. A name curls and goes. Feet on the stair. A soft "Oh."' }, // H7
    { title: 'Furnace', key: true, hand: 0, text: 'The same two bulbs, no neck, wide as a ribcage. Turned on the pipe by the left hand. Steady. That is the worst of it.' }, // T2
    { title: 'Nap', hand: 3, clear: 18, text: 'A nap saved for after the war. The bench by the weir, hat over the eyes. {Waking: not had, and the light gone.}' }, // D1
    { title: 'Candle', hand: 2, clear: 19, text: 'A small cake, one candle. At the ear: "Good girls count." Counting aloud to eleven, and then the room is {later than it was}.' }, // D5
    { title: 'From above', hand: 5, text: 'The brazier, seen from the stair. A man\'s shoulders shake as he feeds the pages in. A soft "Oh", and it comes from this mouth.' }, // D2
    { title: 'Ice', hand: 1, text: 'Ice in the nets. A quay in winter, sea like slate. A kind voice: "One hour, for the boat." A warm thumb on the wrist.' }, // D4
    { title: 'Ink', key: true, hand: 3, clear: 21, text: 'Across the table a pen writes a name: {Hale}. Then: one hour. Then one letter at the foot. Still wet when the bench is empty.' }, // M1
    { title: 'Salt', hand: 0, clear: 22, text: 'Sand under a cheek, the left hand closing on nothing. A voice close, rehearsing, patient. {The same words as the last time.} Footsteps, not turning.' }, // M2
    { title: 'Risen', hand: 4, clear: 23, text: 'The ring is back on. The dough has risen over the bowl. The yellow dog will not come to {the hand that was held}.' }, // M5
    { title: 'The Book', key: true, hand: 1, clear: 23, text: 'A book long as the table. A name, an hour, a letter, down every page. The right hand marks {under a baker\'s, above a child\'s}.' }, // U2
    { title: 'Beds', hand: 2, clear: 24, text: 'Beds in a row, a number chalked on each. A small right hand, held out without being asked. Afterwards the counting {starts again from one}.' }, // U5
    { title: 'Wrist', key: true, hand: 5, text: 'Night, the dry stone. No line. A thumb laid across this wrist, and it is the same thumb. "There. One that was given." Nobody hears.' }, // U7
  ],

  // Found text (tile 'i'), keyed by screen id, in reading order. Notices, ledgers, graffiti.
  tablets: {
    A1: [{ title: 'TIDELINE', text: 'Wreck, weed and the drowned to be cleared by first bell. Anything still breathing: leave it.' }],
    A2: [{ title: 'CHALK, ON A STAIR', text: 'A child drawn beside a nail. A door, shutting. The child at the nail again, and the door not yet shut.' }],
    A3: [{ title: 'NOTICE TO WORKERS', text: 'They pull back before they lunge. Eyes go green. Do not stand and wait.' }],
    G2: [{ title: 'FIRST VESSEL', text: 'A glassblower of this works drew a dying man\'s hour into a flask, for his widow. Kindly meant. Beneath, newer: THE FIRST ONE WAS GIVEN.' }],
    G4: [{ title: 'BED-LEDGER', text: 'Apprentices, by cot. Cot four: T., thirteen. Signed for: S. RETAIN is underlined twice, in two inks.' }],
    G6: [{ title: 'FURNACE RULE', text: 'Never leave a vessel past its hour; it takes the shape of what is in it. Scratched below: he has been in there a year. He says it is not finished.' }],
    A5: [{ title: 'JETTY', text: 'Boats nobody sailed. Scratched: SHE STILL COMES HERE. Older, lower: LOOK IN CORNERS.' }],
    R1: [{ title: 'THE DISTRICT', text: 'Everything here was aged by hand. The knights do not know. Their shields face forward; their backs do not.' }],
    R4: [{ title: 'CHALK', text: 'A raised hand. Under it a lock, crumbling. Then a woman, in the same strokes. The chalk is still on the floor.' }],
    H1: [{ title: 'CATHEDRAL', text: 'Every gear turns somebody\'s afternoon. Listen. The slab over the scrap-heap hangs by a rope a century old.' }],
    H3: [{ title: 'PENDULUM', text: 'The duelist stole its beat from the pendulum, and kept it under the breastplate. Scratched: I saw an arrow hang in the air like a bead.' }],
    H4: [{ title: 'WARNING', text: 'The chain draws taut before the weight falls. Count.' }],
    T1: [{ title: 'THE REGENT', text: 'Last clockmaster. Sealed the Clock with his own years and has not come down. Not kind. Not what you were told.' }],
    D1: [{ title: 'ARCHIVE', text: 'Who owed, who paid, who was paid with. The paper did not drown; it learned to move. When one blinks out, look behind you.' }],
    D4: [{ title: 'CUT IN STONE', text: 'A stair, and the rubble of the stair, joined by an arrow. Under it: nothing is undone. It is moved to another page. The Index knew which.' }],
    M1: [{ title: 'THE MILLS', text: 'Hounds charge straight and cannot turn. Heads go down first. The millers knew.' }],
    M4: [{ title: 'CHALK', text: 'A dog and its twin on one plate. A gate, rising. Above, a chimney with no rungs and a vine, once. Ask the seed.' }],
    U1: [{ title: 'THE ROOT', text: 'Where spent hours go: down. The city drinks them back and calls it spring. Climb.' }],
    U4: [{ title: 'SEVER', text: 'One stroke, close in. A strap, a rope, a guardian\'s thread. She gives this one last, and gladly.' }],
    U6: [{ title: 'A NEWER HAND', text: 'You climbed out, so she wanted you to. Ask her what the ledger at her waist is for. The east hoist still works, if you can cut what holds it.' }],
    A6: [{ title: 'SCRATCHED LOW', text: 'T. + S. Under it, older: if you keep it you keep the day. The rest is underwater.' }],
    R2: [{ title: 'GUILD RULE', text: '...take only what is OWED, by the HAND, never from a child under... A word has been chiselled out.' }],
    R5: [{ title: 'LEDGER PAGE', text: 'Column fourteen. Forty names: given, given, given. The last three: taken. In pencil beside them: he wouldn\'t have wanted this.' }],
    R6: [{ title: 'CRANE PLATE', text: 'CRANE DECK. CAPACITY 400 HOURS. THE CAB BRAKE HOLDS THE FOUNDRY DOORS. Scratched under: it never lifted anything. She liked the number.' }],
    H5: [{ title: 'NOTICE', text: 'BY ORDER: no hour shall be wound into the Clock or out of it until the one who asks is... Torn. Smaller: everybody knows he means her. Smaller: the vestry wants two stones, two feet.' }],
    H7: [{ title: 'THE BELL-RINGER', text: 'Rang it for the drowned, rang it for the given, stopped when I lost count. The rope unbars the duelist\'s hall. 400 is wrong. It is 401.' }],
    T2: [{ title: 'UNDER THE THRONE', text: 'Carved low, where only a man on his knees would see: I kept it shut from HER.' }],
    D2: [{ title: 'FILING', text: 'Debtors to the east shelves. Donors to the west. Sort by hour, not name. Archivist\'s note: there is no west shelf.' }],
    D5: [{ title: 'WATERLINE', text: 'Painted, dated, higher each year. The last mark is the year the Well went dry. Archivist\'s hand: the balcony chain draws the Reading Room bolts.' }],
    M2: [{ title: 'MILLER\'S TALLY', text: 'Flour: none. Bone: by the cartload. She said it was only what was left when the hours were out. Stop the stone on the plate and the gate stays up.' }],
    M5: [{ title: 'A STONE', text: 'A GOOD DOG. IT ASKED FOR NOTHING. Chalk: that is how you knew she had got to it. The kennel bar opens its vault.' }],
    U2: [{ title: 'ROOT-TALK', text: 'Carved into the root, which should not be possible: you are standing in receipts. Open the cistern\'s mouth and the floor is yours.' }],
    U3: [{ title: 'WARNING, MOST OF IT', text: 'The weights fall for a reason. Count four between. If the count is wrong it is because someone upstairs has been... Crushed flat.' }],
    U7: [{ title: 'THE VEIN', text: 'Shaking hand: there is one hour in him that was given freely. I know. I gave it. S. Beneath, another hand: let your shadow take the blow. The thread across the pocket holds until you tell it not to.' }],
  },

  // A name and one oblique line. No keys (the prompt gives the key when there is something to use it on) and
  // nothing the player cannot try where the card opens. The first five are taken out of a guardian's body, where
  // it fell (Shallows, Ferrous Mother, Escapement, Index, Grinder): the card says where it was, never what it does.
  abilities: {
    dash:    { title: 'SKIP', color: '#8fb3ff', text: 'Out of the Warden, still wet. A moment, stepped over.' },
    age:     { title: 'WITHER', color: '#9fc59a', text: 'Warm from her, and flaking. What it touches has already rusted.' },
    hold:    { title: 'HOLD', color: '#8fb3ff', text: 'It came loose still keeping time. One thing, stilled.' },
    restore: { title: 'MEND', color: '#7af0d0', text: 'Folded small among its pages. A thing turned back toward what it was.' },
    echo:    { title: 'ECHO', color: '#e6d8ff', text: 'The dog lay down. Something of it stayed standing.' },
    cut:     { title: 'SEVER', color: '#ff3355', text: 'One stroke, close in.' },
    cling:   { title: 'THE WALLS', color: '#c8bc9e', text: 'Bare stone holds, if leaned on.' },
    wings:   { title: 'SECOND WIND', color: '#e6d8ff', text: 'One more step, in the air.' },
  },
};
// Mid-fight remarks give way if another scene has only just played (Game.playCutscene drops a `minor` scene inside the quiet gap).
for (const b of ['annealer', 'regent']) Story.bosses[b].phase2.minor = true;

// ---------------------------------------------------------------------------
// Memory: what is held, in what order, and which fragments are still holed. The one place braces are read.
//   save.flags['shard:i']  held          save.shardOrder  the order found (old saves: index order, healed on read)
//   save.flags['read:i']   read in the journal (dropped again when the entry mends)
//   save.flags['chg:i']    the entry mended since it was last read: a small pale mark in the journal, no announcement
// ---------------------------------------------------------------------------
const Memory = {
  held(save, i) { return !!save.flags['shard:' + i]; },
  count(save) { let n = 0; for (let i = 0; i < Story.shards.length; i++) if (save.flags['shard:' + i]) n++; return n; },
  // found order; a save from before the order was kept (or a flag set by hand) falls in behind, by index
  order(save) {
    const o = Array.isArray(save.shardOrder) ? save.shardOrder : (save.shardOrder = []);
    for (let i = 0; i < Story.shards.length; i++) if (save.flags['shard:' + i] && !o.includes(i)) o.push(i);
    return o.filter((i) => save.flags['shard:' + i] && Story.shards[i]);
  },
  hasBlots(i) { const sh = Story.shards[i]; return !!sh && sh.text.indexOf('{') >= 0; },
  // is fragment i still holed? `clear: n` lifts at n memories held; otherwise another fragment of the same hand lifts it
  blotted(save, i) {
    const sh = Story.shards[i]; if (!this.hasBlots(i)) return false;
    if (typeof sh.clear === 'number') return this.count(save) < sh.clear;
    for (let j = 0; j < Story.shards.length; j++) if (j !== i && save.flags['shard:' + j] && Story.shards[j].hand === sh.hand) return false;
    return true;
  },
  // the text to show: braces kept while the fragment is holed (the drawing code blots them), gone once it has mended
  text(save, i) { const sh = Story.shards[i]; if (!sh) return '...'; return this.blotted(save, i) ? sh.text : sh.text.replace(/[{}]/g, ''); },
  // a title is only shown once nothing is blotted
  title(save, i) { const sh = Story.shards[i]; return sh && !this.blotted(save, i) ? sh.title : '—'; },
  // "a {b c} d" -> [{ w: 'a' }, { w: 'b', blot: true }, { w: 'c', blot: true }, { w: 'd' }]; the whisper, the card and the journal all draw from this
  words(text) {
    const out = []; let blot = false, w = '', wb = false;
    const push = () => { if (w) out.push(wb ? { w, blot: true } : { w }); w = ''; wb = false; };
    for (const ch of text) {
      if (ch === '{') { blot = true; continue; }
      if (ch === '}') { blot = false; continue; }
      if (ch === ' ') { push(); continue; }
      w += ch; if (blot) wb = true;
    }
    push(); return out;
  },
  // take fragment i: mark it held, keep the order, and quietly re-flag any older entry it has just mended. Returns those entries.
  take(save, i) {
    const was = this.order(save).filter((j) => j !== i && this.blotted(save, j));
    save.flags['shard:' + i] = true;
    if (!Array.isArray(save.shardOrder)) save.shardOrder = [];
    if (!save.shardOrder.includes(i)) save.shardOrder.push(i);
    const mended = was.filter((j) => !this.blotted(save, j));
    for (const j of mended) { delete save.flags['read:' + j]; save.flags['chg:' + j] = true; }
    return mended;
  },
};
