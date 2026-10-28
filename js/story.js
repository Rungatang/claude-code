'use strict';
// ---------------------------------------------------------------------------
// The script. Verenth is a city of lacquer, brass and jade that once ran on
// a captured sun. Lines carry an optional mood for the portrait.
//
//   { ill: 'name', text, hold }        illustrated panel
//   { who, name, text, mood }          dialogue line
//   { title, sub, hold }               title card
// ---------------------------------------------------------------------------
const Story = {
  prologue: [
    { ill: 'city', text: 'Verenth never knew night. The Sun-Engine turned above its roofs, a star the old masters had caught and chained, and the Surveyors of the Nine Roads kept every street named, measured and lit.' },
    { ill: 'furnaceBreak', text: 'In the four-hundredth year the Engine cracked. The council called it a tremor. The engineers called it fatigue. The streets, who had no word for it, only looked up.' },
    { ill: 'ashfall', text: 'Ash fell for forty days. The hall of the Surveyors burned, and every map with it. Those who could not find the way out of the dark did what people do. They waited for someone who could.' },
    { ill: 'sealing', text: 'The Warden, first of the guardian engines, had one instruction: protect the city. It closed the nine gates from the inside, swallowed the key, and called the silence that followed peace.' },
    { ill: 'workshop', text: 'Beneath the Threshold the last Surveyor worked by one candle. Not a map that could be carried, he wrote. A map that could walk. He set a jade core in her chest and gave it a direction instead of a name.' },
    { ill: 'awaken', text: 'He did not finish her. There was not enough iron, or enough time, or enough of him. He lit the core anyway, and sat down beside the bench to wait.', hold: 5 },
    { who: 'orin', name: 'Orin', text: 'Wake, Ilse. The streets have forgotten themselves. Draw them the way out.', mood: 'sad' },
  ],

  firstSteps: [
    { who: 'ilse', name: 'Ilse', text: 'Designation: wayfinder. Function: survey, record, lead. Status...' },
    { who: 'ilse', name: 'Ilse', text: 'Incomplete. The core is lit, but the map in it is blank. The bench is cold. The maker is a shape of ash in the chair.', mood: 'sad' },
    { who: 'ilse', name: 'Ilse', text: 'Then I will begin the way every map begins. With the first step, and the word "here".', mood: 'stern' },
  ],

  pell: {
    intro: [
      { who: 'pell', name: '???', text: 'A light. A walking light, down the Threshold road. Nothing has walked that road in a hundred years, and nothing living has walked it in longer.' },
      { who: 'ilse', name: 'Ilse', text: 'I am Ilse. I am a wayfinder. I was made to draw the map.' },
      { who: 'pell', name: 'Pell', text: 'Pell. I lit the lamps on this street for forty years, and I have stood under this one for a hundred more. Old habits.' },
      { who: 'pell', name: 'Pell', text: 'Orin said he would send someone. I thought he meant a person. The map burned, wayfinder. The Engine district, the Cathedral, the Cisterns. All of it.' },
      { who: 'ilse', name: 'Ilse', text: 'Then I will draw it again. Where does the road go?', mood: 'stern' },
      { who: 'pell', name: 'Pell', text: 'East, to the Sun-Engine. It still breathes. Something lives in its heart that eats the lost, and it has had a long time to get hungry.' },
      { who: 'pell', name: 'Pell', text: 'Above my post there is a door you cannot see yet. When you can see it, you will be nearly done. Go on. I will keep the lamp.' },
    ],
    afterDash: [
      { who: 'pell', name: 'Pell', text: 'You came out of the Engine with its fire in your heels. Orin stole from his own machines to build you. He never did like waste.' },
      { who: 'pell', name: 'Pell', text: 'The Cathedral of Soot is above the collapsed avenue, behind a wall the ash cracked. The choir up there never stopped singing. It should have.' },
      { who: 'ilse', name: 'Ilse', text: 'Why do you stay under the lamp, Pell?' },
      { who: 'pell', name: 'Pell', text: 'Because someone has to be where the map says they are. Otherwise what is a map for?' },
    ],
    afterDjump: [
      { who: 'pell', name: 'Pell', text: 'Wings of ash. He made those once for a bird, and the bird flew into the Engine. You will do better. You have somewhere to go.' },
      { who: 'pell', name: 'Pell', text: 'The Cisterns lie under the Undermarket, past the old belfry. The Bellringer tolls for the drowned down there. Do not answer it. Kessa might. Kessa answers everything.' },
    ],
    afterCling: [
      { who: 'pell', name: 'Pell', text: 'You climbed out of the water. Good. Orin hung the true lantern in the Reliquary above the Cisterns\' last hall, where only a climber could reach it.' },
      { who: 'pell', name: 'Pell', text: 'With it you will see the roads the Warden\'s shadow hides. Including the one above my post. Including, I think, a few things you would rather not.' },
    ],
    afterLantern: [
      { who: 'pell', name: 'Pell', text: 'You carry the whole city in your chest now. I can almost read it from here. Every lamp I ever lit.' },
      { who: 'ilse', name: 'Ilse', text: 'Every one. I marked them.' },
      { who: 'pell', name: 'Pell', text: 'Then the door is above me, and the Warden is behind it. It is not cruel, wayfinder. It is only certain. Go. When the gates open, the rest of us will follow your light.' },
    ],
    afterWarden: [
      { who: 'pell', name: 'Pell', text: 'It\'s quiet. This city has never once been quiet.' },
      { who: 'pell', name: 'Pell', text: 'I think I can put the lamp down now. Lead the way, Ilse. I would like to see where it goes.' },
    ],
  },

  kessa: {
    intro: [
      { who: 'kessa', name: 'Kessa', text: 'Mind the water. It is not deep, but it is patient, and it remembers everyone who came down these stairs.' },
      { who: 'ilse', name: 'Ilse', text: 'You are alive.' },
      { who: 'kessa', name: 'Kessa', text: 'Mostly. I kept the tide-gates. When the ash came I shut them, and the water stayed, and so did I. The bell rings every hour for those who did not.' },
      { who: 'kessa', name: 'Kessa', text: 'A wayfinder, then. Orin talked about you, down here, when he could not sleep. He said a map is a promise that the way exists. He was not sure he believed it.' },
      { who: 'ilse', name: 'Ilse', text: 'I was not built to believe. I was built to measure. The way will exist when I have drawn it.', mood: 'stern' },
      { who: 'kessa', name: 'Kessa', text: 'Then draw quickly. The Bellringer is east of here, and it has learned to tell your footsteps from the water\'s.' },
    ],
    again: [
      { who: 'kessa', name: 'Kessa', text: 'Still here. The water keeps the time; I keep the water. Go east when you are ready. The bell will know you.' },
    ],
    afterBell: [
      { who: 'kessa', name: 'Kessa', text: 'The bell has stopped. I have counted the hours by it for so long that the silence is heavier than the sound was.' },
      { who: 'kessa', name: 'Kessa', text: 'Its hands were iron. Orin said it was his best work before you. He said that about everything until you.' },
      { who: 'kessa', name: 'Kessa', text: 'The Reliquary hangs above the last hall. He kept his dearest thing there. Climb, wayfinder. I will open the tide-gates when the city empties. I would like to see the sea again.' },
    ],
    afterWarden: [
      { who: 'kessa', name: 'Kessa', text: 'The water is moving. I did not open the gates. It just... went, the way water does when it finally remembers the sea.' },
      { who: 'kessa', name: 'Kessa', text: 'Go up, Ilse. I will be the last one out. Someone should be.' },
    ],
  },

  regionEnter: {
    furnace: [{ who: 'ilse', name: 'Ilse', text: 'Heat. The Engine district still breathes. Something in here is alive, or has decided to be.' }],
    cathedral: [{ who: 'ilse', name: 'Ilse', text: 'Soot on every pane of glass. And a hymn above, that has not stopped in a hundred years because no one told it the service was over.' }],
    cistern: [{ who: 'ilse', name: 'Ilse', text: 'Water. Black, still, patient. Somewhere below, a bell keeps a time no one asked it to keep.' }],
    reliquary: [{ who: 'ilse', name: 'Ilse', text: 'Cages on chains, hung where only a climber could reach. He kept his dearest things out of everyone\'s hands. Including, I think, his own.', mood: 'sad' }],
    spire: [{ who: 'ilse', name: 'Ilse', text: 'The Spire. Every street I have drawn ends here, at a gate that was closed to keep the dark out, and kept everything else in.', mood: 'stern' }],
  },

  bosses: {
    hound: {
      intro: [
        { title: 'THE CINDER HOUND', sub: 'Heart of the Sun-Engine', hold: 2.4 },
        { who: 'ilse', name: 'Ilse', text: 'The Engine\'s core, on four legs. It still runs. It still burns. So it can still be put out.', mood: 'stern' },
      ],
      defeat: [
        { who: 'ilse', name: 'Ilse', text: 'The heat is going into the floor. And into me. He built me to take what his other machines carried. I am not sure he asked them.', mood: 'sad' },
      ],
    },
    choir: {
      intro: [
        { title: 'THE CHOIRMASTER', sub: 'Keeper of the Unending Hymn', hold: 2.4 },
        { who: 'choir', name: 'Choirmaster', text: 'A new voice. Stay. Sing with us. No one leaves the choir, little lamp, and no one has wanted to.' },
        { who: 'ilse', name: 'Ilse', text: 'The song is over. It has been over for a very long time. Let them rest.', mood: 'stern' },
      ],
      defeat: [
        { who: 'choir', name: 'Choirmaster', text: '...so quiet. I had forgotten what the quiet was for.', mood: 'sad' },
        { who: 'ilse', name: 'Ilse', text: 'For sleeping. Go on. I will mark where you were.' },
      ],
    },
    bell: {
      intro: [
        { title: 'THE BELLRINGER', sub: 'Who Tolls for the Drowned', hold: 2.4 },
        { who: 'ilse', name: 'Ilse', text: 'It rings for everyone the water took. Then let it ring once more, loudly, and for the last time.', mood: 'stern' },
      ],
      defeat: [
        { who: 'ilse', name: 'Ilse', text: 'Still water. Its hands were iron. Now mine are, and I am not certain that is a gift.' },
      ],
    },
    warden: {
      intro: [
        { title: 'THE WARDEN', sub: 'First Work of the Last Surveyor', hold: 2.6 },
        { who: 'warden', name: 'Warden', text: 'Wayfinder. Orin\'s last mistake, come to correct his first. The gates stay closed. Outside them is ash. Inside them is order.' },
        { who: 'ilse', name: 'Ilse', text: 'Inside them is nothing. Everyone here is dead, Warden. You are guarding a tomb and calling it a city.', mood: 'stern' },
        { who: 'warden', name: 'Warden', text: 'Then I guard it well.' },
      ],
      phase2: [
        { who: 'warden', name: 'Warden', text: 'Why do you keep standing? He did not build you for this. He built you to draw.' },
        { who: 'ilse', name: 'Ilse', text: 'He built me a map. The map says: forward.', mood: 'stern' },
      ],
      defeat: [
        { who: 'warden', name: 'Warden', text: '...my instruction. Protect the city. I cannot see how. Where is the city? Show me the city.', mood: 'calm' },
        { who: 'ilse', name: 'Ilse', text: 'It was never the walls. It is the people, and they need to leave. Protect them. Walk them out.' },
        { who: 'warden', name: 'Warden', text: 'A new instruction. I... yes. I follow the map.', mood: 'calm' },
      ],
    },
  },

  ending: [
    { ill: 'ascension', text: 'The Warden opened the gates it had held shut for a hundred years. Pell\'s lamp went first. Then Kessa, walking backwards so she could watch the water follow. Then the rest, a river of small lights, behind the one that walked.', hold: 7 },
    { ill: 'map', text: 'Ilse finished the map on a hill outside Verenth, where the ash stops and the grass begins. Every street. Every door. Every name she had been given, and the one she had been given to carry.', hold: 7 },
    { ill: 'epilogue', text: 'In the corner she drew a small house on the coast and wrote beside it "Ilse". Then she folded the map, put on her hat, and set out to see if the way existed.', hold: 8 },
    { title: 'ASHFALL', sub: 'The Last Cartographer', hold: 4 },
    { title: 'Thank you for playing', sub: 'Shards found and hearts gathered are shown on the map.', hold: 4 },
  ],

  orin: [
    { who: 'orin', name: 'Orin', text: 'Ilse. You climbed. I hoped you would. I never could; my hands shook by the end.' },
    { who: 'ilse', name: 'Ilse', text: 'You are not here. You are an echo caught in the lantern\'s glass.', mood: 'sad' },
    { who: 'orin', name: 'Orin', text: 'An echo is a kind of map. Take the true lantern. The Warden\'s shadow cannot cross it, and neither can its certainty.' },
    { who: 'orin', name: 'Orin', text: 'And when you face it, do not try to destroy it. It is obedient, not cruel. I made it that way, and then I made you to argue with it. Give it something new to obey.', mood: 'sad' },
    { who: 'ilse', name: 'Ilse', text: 'Was I finished, Orin?' },
    { who: 'orin', name: 'Orin', text: 'No. Nothing that walks is. That is rather the point of walking.' },
  ],

  shards: [
    { title: 'Log 1', text: 'The council asks for a map that cannot burn. I have proposed a map that can walk, instead. They laughed. They will stop laughing when the Engine fails, and I would rather they did not have the chance.' },
    { title: 'Log 2', text: 'The Warden was my first work. I gave it a single instruction: protect the city. I did not say from what. I was young, and I thought the city was made of walls.' },
    { title: 'Log 3', text: 'The Engine is failing. The engineers lie to the council and the council lies to the streets. I have begun the wayfinder tonight. I have very little iron and less time.' },
    { title: 'Log 4', text: 'I have named her Ilse, after my daughter, who left for the coast and did not write. A map should have somewhere it is trying to go.' },
    { title: 'Log 5', text: 'The Warden has closed the gates. It says the ash is the enemy and the walls are the cure. It will not hear me. I made it to be certain, and now it is.' },
    { title: 'Log 6', text: 'Her dash I took from the Hound\'s furnace core. Her wings from the Choirmaster\'s hymn engine. Her grip from the Bellringer\'s hands. I steal from my own creations to build the one that can undo them. Kessa says this is a kind of prayer. Kessa is kinder than I deserve.' },
    { title: 'Log 7', text: 'The true lantern I have hung in the Reliquary, where only a climber can reach it. The Warden\'s shadow cannot cross true light. Neither, I am afraid, can I. The ash is in my lungs now, and in the ink.' },
    { title: 'Log 8', text: 'I will not finish her. I will light her anyway. Ilse, if you are reading this: the Warden is not evil. It is obedient. Show it the way out and it will follow. Everything I ever made follows the map. I am sorry it had to be you who drew it.' },
  ],

  abilities: {
    dash:    { title: 'EMBER DASH', text: 'The Hound\'s fire, bound to a way-seal. Press C, L or Shift to dash. Cracked walls shatter before you.' },
    djump:   { title: 'ASH WINGS', text: 'The hymn engine\'s breath. Press jump again while in the air to leap a second time.' },
    cling:   { title: 'IRON GRIP', text: 'The Bellringer\'s hands. Press against a wall to cling and slide. Jump from the wall to leap away.' },
    lantern: { title: 'TRUE LANTERN', text: 'Orin\'s last light. Shadow walls dissolve before you. Press V or I to cast light as a ranged strike.' },
  },
};
