'use strict';
// ---------------------------------------------------------------------------
// Narrative content: prologue, NPC dialogue, boss scenes, memory shards,
// ability messages and the ending.
//
// Cutscene steps:
//   { ill: 'illustrationName', text: '...', hold: seconds }  full-screen panel
//   { who: 'ilse', name: 'Ilse', text: '...' }               dialogue line
//   { title: 'BIG TEXT', sub: 'small text', hold: s }        title card
// ---------------------------------------------------------------------------
const Story = {
  prologue: [
    { ill: 'city', text: 'Verenth was a city that never knew night. The Sky-Furnace hung above it like a captured sun, and the Cartographers\' Guild kept every street mapped, named and lit.' },
    { ill: 'furnaceBreak', text: 'In the four-hundredth year the Furnace cracked. No one learned why. The engineers said it was simply tired of burning.' },
    { ill: 'ashfall', text: 'Ash fell for forty days. The guildhall burned, and every map with it. The people who could not find their way out of the dark... stayed.' },
    { ill: 'sealing', text: 'The Warden, built to guard the gates, decided that the safest city was a closed one. It sealed Verenth from the inside and swallowed the key.' },
    { ill: 'workshop', text: 'Beneath the Threshold, by candlelight, the last Cartographer worked on one final instrument. Not a map that could be carried. A map that could walk.' },
    { ill: 'awaken', text: 'He never finished her. He ran out of time. But he lit the lantern in her chest anyway, and hoped.', hold: 5 },
    { who: 'orin', name: 'Orin', text: 'Wake, Ilse. The city has forgotten its own streets. Draw them the way out.' },
  ],

  firstSteps: [
    { who: 'ilse', name: 'Ilse', text: 'Designation: wayfinder. Function: cartography. Status... incomplete.' },
    { who: 'ilse', name: 'Ilse', text: 'The workshop is cold. The maker is gone. The map in my chest is blank.' },
    { who: 'ilse', name: 'Ilse', text: 'Then I will begin where every map begins. Here.' },
  ],

  pell: {
    intro: [
      { who: 'pell', name: '???', text: 'A light! A living light... no. Not living. That lamp in your chest is Orin\'s work. He said he would send someone.' },
      { who: 'ilse', name: 'Ilse', text: 'I am Ilse. I am a wayfinder. I am supposed to draw the map.' },
      { who: 'pell', name: 'Pell', text: 'Pell. Lamplighter, once. The map burned, wayfinder. The Furnace district, the Cathedral, the Cisterns, all of it. And the Spire above us, where the Warden sits on the only gate out.' },
      { who: 'ilse', name: 'Ilse', text: 'Then I will draw it again.' },
      { who: 'pell', name: 'Pell', text: 'Hah. Then start east, at the Furnace. Something lives in its heart that eats the lost. Keep your little flame close.' },
    ],
    afterDash: [
      { who: 'pell', name: 'Pell', text: 'You walk out of the Furnace with the Hound\'s heat in your heels. Orin\'s old trick, stealing fire.' },
      { who: 'pell', name: 'Pell', text: 'The Cathedral of Soot is above the collapsed avenue, behind a cracked wall. The choir there never stopped singing. It should have.' },
    ],
    afterDjump: [
      { who: 'pell', name: 'Pell', text: 'Wings of ash. He built those for a bird once, and the bird flew into the Furnace. You will do better.' },
      { who: 'pell', name: 'Pell', text: 'The Cisterns lie beneath the Undermarket, past the old belfry. The Bellringer rings for the drowned down there. Don\'t answer it.' },
    ],
    afterCling: [
      { who: 'pell', name: 'Pell', text: 'You climbed out of the water. Good. Orin hid the true lantern in the Reliquary that hangs above the Cisterns\' last hall.' },
      { who: 'pell', name: 'Pell', text: 'With it you will see the roads the Warden\'s shadow hides. Including the one above my post.' },
    ],
    afterLantern: [
      { who: 'pell', name: 'Pell', text: 'You carry the whole city in your chest now, don\'t you? I can almost read it from here.' },
      { who: 'pell', name: 'Pell', text: 'The Spire\'s gate is above my post. Go on, wayfinder. When the doors open, the rest of us will follow your light.' },
    ],
    afterWarden: [
      { who: 'pell', name: 'Pell', text: 'It\'s quiet. The city has never once been quiet.' },
      { who: 'pell', name: 'Pell', text: 'I think... I think I can go now. Lead the way, Ilse.' },
    ],
  },

  regionEnter: {
    furnace: [{ who: 'ilse', name: 'Ilse', text: 'Heat. The Furnace district still breathes. Something in here is alive, or close enough.' }],
    cathedral: [{ who: 'ilse', name: 'Ilse', text: 'Soot on every window. And a hymn, somewhere above, that has not ended in a hundred years.' }],
    cistern: [{ who: 'ilse', name: 'Ilse', text: 'Water. Black and patient. The bells down here ring on their own.' }],
    reliquary: [{ who: 'ilse', name: 'Ilse', text: 'Cages, hung from chains. Orin kept his dearest things where only a climber could reach them.' }],
    spire: [{ who: 'ilse', name: 'Ilse', text: 'The Spire. Every street I have drawn leads here, to the gate that was closed to keep the dark out.' }],
  },

  bosses: {
    hound: {
      intro: [
        { title: 'THE CINDER HOUND', sub: 'Heart of the Furnace', hold: 2.2 },
        { who: 'ilse', name: 'Ilse', text: 'The Furnace\'s core, walking. It still runs. It still burns. So it can still be put out.' },
      ],
      defeat: [
        { who: 'ilse', name: 'Ilse', text: 'The heat is going into the floor. And into me. Orin built me to take what his other machines carried.' },
      ],
    },
    choir: {
      intro: [
        { title: 'THE CHOIRMASTER', sub: 'Keeper of the Unending Hymn', hold: 2.2 },
        { who: 'choir', name: 'Choirmaster', text: 'A new voice. Stay. Sing with us. No one leaves the choir, little lamp.' },
        { who: 'ilse', name: 'Ilse', text: 'The song is over. It has been over for a very long time. Let them rest.' },
      ],
      defeat: [
        { who: 'choir', name: 'Choirmaster', text: '...so quiet. I had forgotten what quiet was for.' },
        { who: 'ilse', name: 'Ilse', text: 'It was for sleeping. Go on.' },
      ],
    },
    bell: {
      intro: [
        { title: 'THE BELLRINGER', sub: 'Who Tolls for the Drowned', hold: 2.2 },
        { who: 'ilse', name: 'Ilse', text: 'It rings for everyone the water took. Then let it ring once more, and for the last time.' },
      ],
      defeat: [
        { who: 'ilse', name: 'Ilse', text: 'The water is still. Its hands were iron. Now mine are.' },
      ],
    },
    warden: {
      intro: [
        { title: 'THE WARDEN', sub: 'First Work of the Last Cartographer', hold: 2.5 },
        { who: 'warden', name: 'Warden', text: 'Wayfinder. Orin\'s final error. The gates stay closed. Beyond them is ash. Within them is order.' },
        { who: 'ilse', name: 'Ilse', text: 'Within them is nothing. Everyone here is dead, Warden. You guard a tomb.' },
        { who: 'warden', name: 'Warden', text: 'Then I guard it well.' },
      ],
      phase2: [
        { who: 'warden', name: 'Warden', text: 'Why do you keep standing? He did not build you for this.' },
        { who: 'ilse', name: 'Ilse', text: 'He built me a map. The map says: forward.' },
      ],
      defeat: [
        { who: 'warden', name: 'Warden', text: '...My instruction. Protect the city. I cannot see how. The city is... where is the city?' },
        { who: 'ilse', name: 'Ilse', text: 'The city was never the walls. It is the people, and they need to leave. Protect them. Walk them out.' },
        { who: 'warden', name: 'Warden', text: 'A new instruction. I... yes. I follow the map.' },
      ],
    },
  },

  ending: [
    { ill: 'ascension', text: 'The Warden opened the gates it had held shut for a hundred years. Pell\'s lantern went first. Then the others, a river of small lights, following the one that walked.', hold: 7 },
    { ill: 'map', text: 'Ilse finished the map on a hill outside Verenth, where the ash stops and the grass begins. Every street. Every door. Every name she had been told.', hold: 7 },
    { ill: 'epilogue', text: 'In the corner she drew a small house on the coast and wrote beside it "Ilse". Then she folded the map, and set out to see if it was there.', hold: 8 },
    { title: 'ASHFALL', sub: 'The Last Cartographer', hold: 4 },
    { title: 'Thank you for playing', sub: 'Shards found and hearts gathered are shown on the map.', hold: 4 },
  ],

  orin: [
    { who: 'orin', name: 'Orin', text: 'Ilse. You climbed. I hoped you would; I was never able to.' },
    { who: 'ilse', name: 'Ilse', text: 'You are not here. You are an echo in the lantern\'s glass.' },
    { who: 'orin', name: 'Orin', text: 'An echo is a kind of map. Take the true lantern. The Warden\'s shadow cannot cross it, and neither can its certainty.' },
    { who: 'orin', name: 'Orin', text: 'And when you face it, do not try to destroy it. It is obedient, not cruel. Give it something new to obey.' },
  ],

  shards: [
    { title: 'Log 1', text: 'The Guild asks me for a map that cannot burn. I have proposed a map that can walk, instead. They laughed. They will not laugh when the Furnace fails.' },
    { title: 'Log 2', text: 'The Warden was my first work. I gave it a single instruction: protect the city. I did not say from what. I was young, and thought the city was made of walls.' },
    { title: 'Log 3', text: 'The Furnace is failing. The engineers lie to the council and the council lies to the streets. I have begun the wayfinder tonight. I have very little iron and less time.' },
    { title: 'Log 4', text: 'I have named her Ilse, after my daughter, who left for the coast and did not write. A map should have somewhere it is trying to go.' },
    { title: 'Log 5', text: 'The Warden has closed the gates. It says the ash is the enemy and the walls are the cure. It will not hear me. I made it to be certain, and now it is.' },
    { title: 'Log 6', text: 'Her dash I took from the Hound\'s furnace core. Her wings from the Choirmaster\'s hymn engine. Her grip from the Bellringer\'s hands. I steal from my own creations to build the one that can undo them.' },
    { title: 'Log 7', text: 'The true lantern I have hung in the Reliquary, where only a climber can reach it. The Warden\'s shadow cannot cross true light. Neither, I am afraid, can I. The ash is in my lungs now.' },
    { title: 'Log 8', text: 'I will not finish her. I will light her anyway. Ilse, if you read this: the Warden is not evil. It is obedient. Show it the way out and it will follow. Everything I ever made follows the map.' },
  ],

  abilities: {
    dash:    { title: 'EMBER DASH', text: 'Press C, L or Shift to dash. Cracked walls shatter before you.' },
    djump:   { title: 'ASH WINGS', text: 'Press jump again while in the air to leap a second time.' },
    cling:   { title: 'IRON GRIP', text: 'Press against a wall to cling and slide. Jump from the wall to leap away.' },
    lantern: { title: 'TRUE LANTERN', text: 'Shadow walls dissolve before you. Press V or I to cast light as a ranged attack.' },
  },
};
