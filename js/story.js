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
    jetty: [
      { who: 'sef', name: '???', text: 'Easy. You\'re shaking. Sit a minute; there\'s no one on the planks.' },
      { who: 'sef', name: '???', text: 'Cut a chain like it was thread. The Warden won\'t be pleased.' },
      { who: 'sef', name: '???', text: 'Tam. That\'s you. Say it.', mood: 'sad' },
      { who: 'you', name: 'Tam', text: 'Tam.' },
      { who: 'sef', name: '???', text: 'There. I\'ll be along.' },
    ],
    jettyAgain: [{ who: 'sef', name: '???', text: 'Go on. I\'m not far.' }],
    afterDash: [],
    root: [
      { who: 'sef', name: '???', text: 'There you are. I looked everywhere.', mood: 'sad' },
      { who: 'sef', name: 'Sef', text: 'Sef. You had it once. Say that too.' },
      { who: 'sef', name: 'Sef', text: 'Take it. He can\'t follow a stopped second.' },
      { who: 'sef', name: 'Sef', text: 'It costs a little. Everything does. I\'ll be at the Clock.', mood: 'stern' },
    ],
    rootAgain: [{ who: 'sef', name: 'Sef', text: 'Take it, Tam. Hurry.' }],
    afterSever: [],
    confront: [
      { who: 'sef', name: 'Sef', text: 'Look at him. A hundred years behind that door, and he\'s robes.' },
      { who: 'you', name: 'Tam', text: 'Sef.', mood: 'stern' },
      { who: 'sef', name: 'Sef', text: 'He talked. The dying do.' },
      { who: 'sef', name: 'Sef', text: 'You counted the columns. Good. Then I needn\'t.', mood: 'stern' },
      { who: 'sef', name: 'Sef', text: 'You walked through his wards like a draught. That was the point of you.', mood: 'stern' },
      { who: 'sef', name: 'Sef', text: 'One more use, love. Die where I can reach you.' },
    ],
  },

  archivist: {
    intro: [
      { who: 'archivist', name: 'The Archivist', text: 'Another one down the chute. Early. They usually take a day to stop shouting.' },
      { who: 'archivist', name: 'The Archivist', text: 'The Regent? Not down here in sixty years. Sends bread, when he remembers.' },
      { who: 'archivist', name: 'The Archivist', text: 'No. It\'s the kind one who fills this place. Just an hour, she says. Just the one.' },
      { who: 'archivist', name: 'The Archivist', text: 'The book\'s in the Reading Room. The Index won\'t let me by.' },
    ],
    again: [{ who: 'archivist', name: 'The Archivist', text: 'Mind the paper. It cuts.' }],
    afterIndex: [
      { who: 'archivist', name: 'The Archivist', text: 'You read it, then. I kept the Archive, and the city filed people in it.', mood: 'sad' },
      { who: 'archivist', name: 'The Archivist', text: 'Ask the Miller who the kind one married.' },
    ],
    end: [{ who: 'archivist', name: 'The Archivist', text: 'Water\'s going. I\'d forgotten the floor had a pattern.' }],
  },
  miller: {
    intro: [
      { who: 'miller', name: 'The Miller', text: 'Don\'t mind the dust.' },
      { who: 'miller', name: 'The Miller', text: 'He sealed the Clock and sat on it. That is all the Regent ever did.' },
      { who: 'miller', name: 'The Miller', text: 'Sef ran the Well. My wife. Sat you down by the water. Spoke so softly.' },
      { who: 'miller', name: 'The Miller', text: 'That noise is the Grinder. It was a dog.' },
    ],
    again: [{ who: 'miller', name: 'The Miller', text: 'It was a dog once.' }],
    afterGrinder: [
      { who: 'miller', name: 'The Miller', text: 'Quiet, at last. You\'ve someone\'s eyes. I won\'t say whose.', mood: 'sad' },
      { who: 'miller', name: 'The Miller', text: 'If she\'s waiting at the top, boy, don\'t let her sit you by the water.' },
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
      intro: [{ title: 'THE REGENT OF HOURS', sub: '', hold: 2.6 }, { who: 'regent', name: 'The Regent', text: 'You climbed out. Archivist, Miller, and still the blade. So she has you.', mood: 'calm' }, { who: 'regent', name: 'The Regent', text: 'I am very old. Let us see if I am still quick.', mood: 'stern' }],
      phase2: [{ who: 'regent', name: 'The Regent', text: 'There. Her Sever. The one thing I couldn\'t stop.', mood: 'stern' }],
      defeat: [
        { who: 'regent', name: 'The Regent', text: 'Enough. A hundred years I kept it shut.', mood: 'calm' },
        { who: 'regent', name: 'The Regent', text: 'I never laid a hand on you before this room. I would not know how to hollow a man.', mood: 'sad' },
        { who: 'regent', name: 'The Regent', text: 'She is behind you. Ask her about the glass.' },
      ],
    },
    sef: {
      intro: [{ title: 'SEF', sub: '', hold: 2.6 }],
      rewind: [{ who: 'sef', name: 'Sef', text: 'No. I turn mine back, little brother.', mood: 'stern' }],
      defeat: [
        { who: 'sef', name: 'Sef', text: 'Tam. They owed. I only took what was owed.', mood: 'sad' },
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
  shards: [
    { title: 'Bell', key: true, text: 'A bell over a door, ringing as it opens. A small hand closes on a twist of paper. Sugar, damp from a pocket.' }, // A2
    { title: 'Sugar', text: 'Two grains on a windowsill. "Don\'t tell her." Then a chair scraping, and someone counting coins into stacks.' }, // A3
    { title: 'Bottle', text: 'Sand poured through a funnel of folded paper into a green bottle. A cork pressed in. "Keep it and you keep the day."' }, // A5
    { title: 'Kettle', text: 'Wet wool, tallow, a kettle just off the boil. Someone humming in the next room, one verse, off key.' }, // A6
    { title: 'Stair', text: 'Forty-one steps. Paint worn through to wood where a hand goes. The bell again, once, from below.' }, // R1
    { title: 'Pen', text: 'A pen scratching in a kitchen, late. Columns. Every line ends in the same initial.' }, // R2
    { title: 'The Well', key: true, text: 'Dry stone. A line of people, hats in their hands. The rim is cold to sit on. "Only the one. Give me your hand."' }, // R4
    { title: 'Bulbs', text: 'Two bulbs of glass, no neck, warm from the oven. Weighed in a palm. "It will do for one."' }, // R5
    { title: 'Slower', text: 'A man in grey, called by name, does not rise at once. Afterwards he walks slower than he came. The pen waits.' }, // R6
    { title: 'Yellow dog', text: 'Warm ears under a thumb. Flour to the elbow, laughter. Someone watches the dog as one watches a scale.' }, // H3
    { title: 'Owing', text: '"Everyone owes someone." "Not you. Not them." The pen stops. "Soft. It can be mended."' }, // H4
    { title: 'Rice', text: 'Rice on the wheelhouse steps. A hand pressed into another, and a whole life going slack. Bells, and no one counting.' }, // H6
    { title: 'Brazier', text: 'Paper in an iron brazier, edges lifting black. A name curls before it goes. Feet on the stair. A soft "Oh."' }, // H7
    { title: 'Furnace', key: true, text: 'Old hands at the oven. The same two bulbs, no neck, wide as a ribcage. Steady hands. That is the worst of it.' }, // T2
    { title: 'Straps', text: 'New leather, still stiff. A chair bolted down beside the well. "I\'m sorry. I am. Hold still."' }, // D1
    { title: 'Candle', text: 'A small cake, one candle. A whisper at the ear: "Good girls count." Counting aloud, up to eleven.' }, // D5
    { title: 'From above', text: 'The brazier from the stair. A man\'s shoulders shaking as he feeds the pages in. A voice, gentle only from outside.' }, // D2
    { title: 'Ice', text: 'Ice in the nets. A quay in winter, a kind woman. "One hour, for the boat." It is only one.' }, // D4
    { title: 'Pouring', key: true, text: 'A jug filling. Ice on nets; a candle; an old man\'s nap, saved for after the war. Crowded. None of it his.' }, // M1
    { title: 'Salt', text: 'Sand under a cheek. A voice close, rehearsing: "The Regent did this. Say it back." Footsteps leaving, not turning.' }, // M2
    { title: 'Matches', text: 'A box of matches, and a name for each. Fewer, now. Whoever strikes them does not look at the box.' }, // M5
    { title: 'Charter', key: true, text: 'Four in black round a table. A young man in a clockmaster\'s grey signs where shown. He does not look at the hat held in two hands.' }, // U2
    { title: 'Again', text: 'Footprints in wet sand, leading up toward the rust. Arms under his arms, hauling back. The same voice. The same words.' }, // U5
    { title: 'Wrist', key: true, text: 'The Well at night. A thumb across a wrist, held over the glass. "There. One that was given." Nobody to hear.' }, // U7
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
    R4: [{ title: 'CHALK', text: 'A raised hand. Under it a lock, crumbling. The Mother learned this, and it ate her.' }],
    H1: [{ title: 'CATHEDRAL', text: 'Every gear turns somebody\'s afternoon. Listen. The slab over the scrap-heap hangs by a rope a century old.' }],
    H3: [{ title: 'PENDULUM', text: 'The duelist stole its beat from the pendulum. Scratched: I saw an arrow hang in the air like a bead.' }],
    H4: [{ title: 'WARNING', text: 'The chain draws taut before the weight falls. Count.' }],
    T1: [{ title: 'THE REGENT', text: 'Last clockmaster. Sealed the Clock with his own years and has not come down. Not kind. Not what you were told.' }],
    D1: [{ title: 'ARCHIVE', text: 'Who owed, who paid, who was paid with. The paper did not drown; it learned to move. When one blinks out, look behind you.' }],
    D4: [{ title: 'CUT IN STONE', text: 'A stair, and the rubble of the stair, joined by an arrow. Under it: nothing is undone. It is moved to someone else\'s page.' }],
    M1: [{ title: 'THE MILLS', text: 'Hounds charge straight and cannot turn. Heads go down first. The millers knew.' }],
    M4: [{ title: 'CHALK', text: 'A figure and its twin on one plate. A gate, rising. Above, a chimney with no rungs and a vine, once. Ask the seed.' }],
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
  // nothing the player cannot try where the card opens.
  abilities: {
    dash:    { title: 'SKIP', color: '#8fb3ff', text: 'A moment, stepped over.' },
    age:     { title: 'WITHER', color: '#9fc59a', text: 'Whatever it touches has already rusted.' },
    hold:    { title: 'HOLD', color: '#8fb3ff', text: 'One thing, stilled. Only one.' },
    restore: { title: 'MEND', color: '#7af0d0', text: 'A thing turned back toward what it was.' },
    echo:    { title: 'ECHO', color: '#e6d8ff', text: 'The last few seconds of you, left standing.' },
    cut:     { title: 'SEVER', color: '#ff3355', text: 'One stroke, close in.' },
    cling:   { title: 'THE WALLS', color: '#c8bc9e', text: 'Bare stone holds, if leaned on.' },
    wings:   { title: 'SECOND WIND', color: '#e6d8ff', text: 'One more step, in the air.' },
  },
};
// Mid-fight remarks give way if another scene has only just played (Game.playCutscene drops a `minor` scene inside the quiet gap).
for (const b of ['annealer', 'regent']) Story.bosses[b].phase2.minor = true;
