'use strict';
// ---------------------------------------------------------------------------
// The script of HOLLOW HOURS.
//   { ill, text, hold }        illustrated panel
//   { who, name, text, mood }  dialogue line
//   { title, sub, hold }       title card
// ---------------------------------------------------------------------------
const Story = {
  prologue: [
    { ill: 'dark', text: 'There is a sound before there is anything else. Water, close. Something ticking, closer.', hold: 3 },
    { ill: 'shoreWake', text: 'Cold stone under one cheek. Salt. A weight in the chest that does not belong to a body, turning, turning, like a thing wound too tight.' },
    { ill: 'hourglass', text: 'Where a heart should be there is glass, and in the glass, sand. It is running the wrong way.', hold: 4 },
  ],
  wake: [
    { who: 'you', name: '???', text: 'Where... No. Start smaller. Who.' , mood: 'sad' },
    { who: 'you', name: '???', text: 'Nothing. A name should be the first thing back and there is nothing where it was. Only this ticking.' },
    { who: 'you', name: '???', text: 'Then the second thing. Move. Find out what the ticking is for.', mood: 'stern' },
  ],

  screenEnter: {
    A2: [
      { who: 'you', name: '???', text: 'A door, shut. A plate on the far side of the room. Too far to run it before the door closes again.' },
      { who: 'you', name: '???', text: 'The glass in my chest pulls when I think about the door. As if it wants to mark the place. As if I could set a pin in the moment and come back to it.', mood: 'stern' },
      { title: 'ANCHOR', sub: 'F sets an anchor in time. F again returns you to it. Returning costs thread.', hold: 4 },
    ],
    A3: [{ title: 'STRIKE', sub: 'X strikes. Three strikes chain. Up + X cuts upward. Down + X in the air bounces off what you hit. Every hit earns thread.', hold: 4.5 }],
    R1: [{ who: 'you', name: 'Tam', text: 'Rust. The whole district is rusting, and it is rusting fast. Something here is running time forward and spending it on nothing.' }],
    H4: [{ who: 'you', name: 'Tam', text: 'Pendulum weights, falling through the shaft faster than I can climb. If time around them ran thick as tar...', mood: 'stern' }],
    T1: [{ who: 'you', name: 'Tam', text: 'The hall of the Regent. Every gear in the city turns from here. And there he is, not even standing to meet me.', mood: 'stern' }],
    D4: [{ who: 'you', name: 'Tam', text: 'The stair is broken. The stones are still here, scattered; they only fell. Falling is a thing that happens in time. Time can be asked to give it back.' }],
    M2: [{ who: 'you', name: 'Tam', text: 'A weighted gate. It will not stay open unless something stands on the plate while I pass. I have no one. Unless I count the last few seconds of myself.' }],
    U4: [{ who: 'you', name: 'Tam', text: 'Light. Real light, from above. And a voice I know, calling my name down the shaft.', mood: 'sad' }],
  },

  regionEnter: {
    rust: [{ who: 'you', name: 'Tam', text: 'The lower city. Sef said the Regent let it rot. She did not say it would still be rotting, visibly, while I watch.' }],
    hours: [{ who: 'you', name: 'Tam', text: 'The Cathedral of Hours. The gears here are the size of houses and none of them have stopped. Someone keeps the city\'s time very carefully for a tyrant.' }],
    tower: [{ who: 'you', name: 'Tam', text: 'The tower. The sand in my chest is running faster. It knows this place.', mood: 'stern' }],
    archive: [{ who: 'you', name: 'Tam', text: 'Dark. Wet. Paper, rotting in the water, miles of it. This is where the city keeps what it would rather not remember.', mood: 'sad' }],
    mills: [{ who: 'you', name: 'Tam', text: 'Bone dust. The mills ground something fine down here for a long time, and it was not grain.' }],
    root: [{ who: 'you', name: 'Tam', text: 'Roots, red as veins, going up. Everything that grows wants the light. So do I.' }],
  },

  sef: {
    jetty: [
      { who: 'sef', name: '???', text: 'Easy. Easy. You are shaking. The Warden had you by the chain and you cut through it like it was thread. Sit a moment.' },
      { who: 'you', name: '???', text: 'Who are you? Who am I? Why is there glass in my chest?' },
      { who: 'sef', name: 'Sef', text: 'Sef. We knew each other, before. As for you: your name is Tam, and the glass is what the Regent left you instead of a memory.', mood: 'sad' },
      { who: 'sef', name: 'Sef', text: 'He rules the city from the clocktower. He takes the hours of the people below and keeps the Great Clock locked so no one can take them back. He took yours. He took everything you were and left you on the shore to rot.' },
      { who: 'you', name: 'Tam', text: 'Then why am I not rotting? Why can I fold the moment and step back through it?' },
      { who: 'sef', name: 'Sef', text: 'Because he could not take all of you. What is left is enough to climb. Enough to reach him. I have been waiting a long time for someone who could.', mood: 'stern' },
      { who: 'sef', name: 'Sef', text: 'Take this. It is a seal I kept from the old guild: a skip in time, a step you can take faster than anything can follow. Go up through the rust. I will find you on the way.' },
    ],
    jettyAgain: [{ who: 'sef', name: 'Sef', text: 'Up through the Scrapyard, Tam. The seal is on the stone there. I will be behind you.' }],
    afterDash: [
      { who: 'you', name: 'Tam', text: 'Sef. Sef? ...Gone, between one tick and the next. She moves like she has somewhere to be.' },
    ],
    root: [
      { who: 'sef', name: 'Sef', text: 'Tam! Down here, all this time. I searched the whole city for you. I thought he had unmade you.' , mood: 'sad' },
      { who: 'you', name: 'Tam', text: 'He threw me into the dark. He did not even seem angry, Sef. He seemed confused. He asked what you had told me.' },
      { who: 'sef', name: 'Sef', text: 'He asks everyone that. He has had a century to learn which questions make people doubt their friends.' },
      { who: 'sef', name: 'Sef', text: 'Listen. I have kept one last thing for you. Sever. The cut that stops the thread entirely. He cannot move through a stopped moment; nothing can but you.' },
      { who: 'sef', name: 'Sef', text: 'Take it, go up, and end him. I will come to the Great Clock when the way is open. Then we can give the city its hours back together.', mood: 'stern' },
    ],
    rootAgain: [{ who: 'sef', name: 'Sef', text: 'The seal is on the altar. Take it, Tam. He is waiting, and so is everyone below.' }],
    afterSever: [
      { who: 'you', name: 'Tam', text: 'The Archivist said the one who asks for hours has a kind voice. The Miller said she waited by the Well for people who were desperate.', mood: 'sad' },
      { who: 'you', name: 'Tam', text: 'He said the Regent locked the Clock to keep someone out. He did not say whom. Up, then. The answer is up.', mood: 'stern' },
    ],
    confront: [
      { who: 'sef', name: 'Sef', text: 'You did it. You actually did it. Look at him, Tam. A hundred years of keeping the Clock from me and he is just a pile of robes.' },
      { who: 'you', name: 'Tam', text: 'From you.', mood: 'stern' },
      { who: 'sef', name: 'Sef', text: '...From us. From everyone. Step aside, I need to open it before the hands settle.' },
      { who: 'you', name: 'Tam', text: 'He said he did not bring me here. He said to ask you how my hours taste.' },
      { who: 'sef', name: 'Sef', text: 'He was dying. The dying say things.' },
      { who: 'you', name: 'Tam', text: 'I found the ledger pages in the Archive, Sef. The Debtors\' Well. Four hundred names. Yours at the bottom of every column.', mood: 'stern' },
      { who: 'sef', name: 'Sef', text: 'Then you know what you are. Good. It saves me explaining. You are my brother, Tam, and you are also four hundred people who owed me, and I am not going to let either of you keep me from that Clock.', mood: 'stern' },
      { who: 'sef', name: 'Sef', text: 'I scraped you clean so the wards would not smell what I poured into you. It worked. You walked straight through his door. Now be useful one last time and die where I can collect you.' },
    ],
  },

  archivist: {
    intro: [
      { who: 'archivist', name: 'The Archivist', text: 'Another one thrown down the oubliette. You are early. Most of them take a day to stop screaming.' },
      { who: 'you', name: 'Tam', text: 'The Regent did this. He will answer for it.' },
      { who: 'archivist', name: 'The Archivist', text: 'The Regent? The Regent has not been down here in sixty years. He sends food, when he remembers. No. The one who fills this place is the one who asks.' },
      { who: 'you', name: 'Tam', text: 'Asks for what?' },
      { who: 'archivist', name: 'The Archivist', text: 'An hour. Just one. From a mother at a sickbed, a man with a debt, a child who does not know what an hour is worth. Such a kind voice. The ledger is in the Reading Room, if the Index lets you near it. I never could.' },
    ],
    again: [{ who: 'archivist', name: 'The Archivist', text: 'East. The Index guards the ledger and the ledger guards the names. Mind the paper. It cuts.' }],
    afterIndex: [
      { who: 'archivist', name: 'The Archivist', text: 'You read it, then. Four hundred columns. I kept the Archive for the city, and the city used it to file people.' , mood: 'sad' },
      { who: 'archivist', name: 'The Archivist', text: 'The altar beyond holds a mending. Go up through the Mills. The Miller knew the kind voice better than I did. He married it.' },
    ],
    end: [{ who: 'archivist', name: 'The Archivist', text: 'The water is draining. I had forgotten the floor had a pattern.' }],
  },
  miller: {
    intro: [
      { who: 'miller', name: 'The Miller', text: 'Do not mind the dust. It is only people.' },
      { who: 'you', name: 'Tam', text: 'The Regent\'s doing?' },
      { who: 'miller', name: 'The Miller', text: 'You keep saying that name like it means something down here. The Regent sealed the Clock. That is all he ever did. Sealed it, and sat on it, so she could not get her hands on the rest of us at once.' },
      { who: 'you', name: 'Tam', text: 'She.' },
      { who: 'miller', name: 'The Miller', text: 'My wife. She ran the Well. She would sit with you by the water and ask so gently. One hour, to settle the account. The ones who gave went grey in a week. The ones who refused came down here.' },
      { who: 'miller', name: 'The Miller', text: 'She had a brother who tried to stop her. Burned her ledgers. Then he was gone, and a month later something hollow came out of the Well wearing his face and walked off toward the tower.', mood: 'sad' },
    ],
    again: [{ who: 'miller', name: 'The Miller', text: 'The Grinder is east. It was a dog once. She asked it for an hour too.' }],
    afterGrinder: [
      { who: 'miller', name: 'The Miller', text: 'Quiet, at last. You have her eyes, you know. I did not want to say.', mood: 'sad' },
      { who: 'miller', name: 'The Miller', text: 'The echo altar is beyond. Then the Root, all the way up. If she is waiting at the top for you, boy, do not let her sit you down by the water.' },
    ],
    end: [{ who: 'miller', name: 'The Miller', text: 'The wheel has stopped. I think I will go and see the sky.' }],
  },

  underground: [
    { who: 'you', name: 'Tam', text: 'Water. Dark. He did not kill me. He dropped me down a hole like a thing he did not have time for.', mood: 'sad' },
    { who: 'you', name: 'Tam', text: 'He said: "What has she told you?" He said it like he already knew. Up. Whatever this place is, up is where the answers are.', mood: 'stern' },
  ],
  loss: [
    { who: 'regent', name: 'The Regent', text: 'Stop. Stop, I said. Do you know how long it has been since anything got through my door?', mood: 'calm' },
    { who: 'you', name: 'Tam', text: 'You took my hours. You took my name.' },
    { who: 'regent', name: 'The Regent', text: 'I have never seen you before in my life. And yet you reek of the Well. Four hundred... no. More. What has she told you?' },
    { who: 'you', name: 'Tam', text: 'Enough.' },
    { who: 'regent', name: 'The Regent', text: 'Not nearly. I do not have the hours to spare on you, and I will not let her collect what is in your chest. Go down and think.', mood: 'stern' },
    { ill: 'fall', text: 'The hands of the Clock stopped. The floor opened like a mouth. There was a long time of nothing at all, and then water.', hold: 5 },
  ],

  bosses: {
    shallows: {
      intro: [{ title: 'WARDEN OF THE SHALLOWS', sub: 'It has drowned many. It is good at it.', hold: 2.4 }, { who: 'you', name: '???', text: 'Armour, kelp, a chain. It is between me and the only way out. Then it is in my way.', mood: 'stern' }],
      defeat: [{ who: 'you', name: '???', text: 'The sand in my chest ran faster while I fought. As if it liked it. I do not think I like that it liked it.', mood: 'sad' }],
    },
    ferrous: {
      intro: [{ title: 'THE FERROUS MOTHER', sub: 'She rusts, and she makes more of herself from the rust.', hold: 2.4 }, { who: 'you', name: 'Tam', text: 'Iron, oxidising while I watch. Someone aged her a thousand years and she did not have the decency to fall over.', mood: 'stern' }],
      defeat: [{ who: 'you', name: 'Tam', text: 'The rust came off her like a shed skin and went into the glass. I can feel it. Decay, held in the hand like a stone.' }],
    },
    escapement: {
      intro: [{ title: 'THE ESCAPEMENT', sub: 'The Regent\'s duelist. It does not miss a beat.', hold: 2.4 }, { who: 'you', name: 'Tam', text: 'It keeps time with its blade. Fine. I will set the tempo.', mood: 'stern' }],
      defeat: [{ who: 'you', name: 'Tam', text: 'It said one word before it stopped. "Her." I am tired of everything in this city knowing something I do not.', mood: 'sad' }],
    },
    regent1: {
      intro: [{ title: 'THE REGENT OF HOURS', sub: 'He has not stood up in sixty years. He stands up.', hold: 2.6 }, { who: 'regent', name: 'The Regent', text: 'Who let you up the stairs? Never mind. Hold still. This will go faster if you hold still.', mood: 'calm' }],
      defeat: [],
    },
    index: {
      intro: [{ title: 'THE INDEX', sub: 'Every name the city filed and forgot, in one body.', hold: 2.4 }, { who: 'you', name: 'Tam', text: 'Paper, and the paper is screaming. Four hundred columns of names. Let me read them.', mood: 'stern' }],
      defeat: [{ who: 'you', name: 'Tam', text: 'The ledger. The Debtors\' Well. Every column signed at the foot in the same hand. S. Not his hand. Hers.', mood: 'sad' }],
    },
    grinder: {
      intro: [{ title: 'THE GRINDER', sub: 'It was a dog once.', hold: 2.4 }, { who: 'you', name: 'Tam', text: 'Bone and millstone, running on an hour someone was asked for very kindly. I am sorry. I am going to stop you anyway.', mood: 'stern' }],
      defeat: [{ who: 'you', name: 'Tam', text: 'It lay down the way a dog lies down. The Miller is right about the dust.', mood: 'sad' }],
    },
    regent: {
      intro: [{ title: 'THE REGENT OF HOURS', sub: 'Keeper of the Great Clock', hold: 2.6 }, { who: 'regent', name: 'The Regent', text: 'You climbed out. Good. Then you have met the Archivist, and the Miller, and you still came up here with your blade out. So she has you after all.', mood: 'calm' }, { who: 'you', name: 'Tam', text: 'Open the Clock.' }, { who: 'regent', name: 'The Regent', text: 'If I open it she empties the city in a night. If I do not, you will take my head and she empties it anyway. I am very old, Tam. Let us see if I am still fast.', mood: 'stern' }],
      phase2: [{ who: 'regent', name: 'The Regent', text: 'There. There it is. Her Sever, in your hand. She gave you the one thing I could not stop. Clever woman. She was always clever.', mood: 'stern' }],
      defeat: [
        { who: 'regent', name: 'The Regent', text: 'Enough. Enough. I kept it shut for a hundred years. Let someone else.', mood: 'calm' },
        { who: 'you', name: 'Tam', text: 'You took everything from me.' },
        { who: 'regent', name: 'The Regent', text: 'I never laid a hand on you until this room. I did not bring you here. I would not know how to hollow a man and fill him with other men\'s hours. I only ever knew one person who could.', mood: 'sad' },
        { who: 'regent', name: 'The Regent', text: 'She is behind you, Tam. She has been behind you the whole way up. Ask her how your hours taste.' },
      ],
    },
    sef: {
      intro: [{ title: 'SEF, THE HOURWRIGHT', sub: 'She asks so kindly.', hold: 2.6 }],
      rewind: [{ who: 'sef', name: 'Sef', text: 'No. No, I do not think so. I have more hours than you can cut, little brother. I turn mine back.', mood: 'stern' }],
      defeat: [
        { who: 'sef', name: 'Sef', text: 'Tam. Tam, listen to me. They were debtors. They owed. I only ever took what was owed.', mood: 'sad' },
        { who: 'you', name: 'Tam', text: 'You took their lives an hour at a time and called it arithmetic. And when I tried to stop you, you took mine and made me carry theirs.' },
        { who: 'sef', name: 'Sef', text: 'I made you last. I made you the only thing in this city that will not run out. Is that not a kind of love?' },
        { who: 'you', name: 'Tam', text: 'No. But I know what to do with four hundred hours that are not mine.', mood: 'stern' },
      ],
    },
  },

  ending: [
    { ill: 'clock', text: 'He opened the Great Clock. The hands had been held at the same minute for a hundred years, and they were cold to the touch.', hold: 6 },
    { ill: 'giving', text: 'Then he gave the hours back. Four hundred of them, out of the glass and into the gears, each one a stranger\'s unspent afternoon returning to the city it was stolen from. There was nothing in him that was his. He had known that since the Archive.', hold: 8 },
    { ill: 'shoreEnd', text: 'The Regent found the hourglass on the shore where it had all begun, empty and still. He buried it above the tideline, and when the Miller asked what the stone should say, he thought for a long time and wrote only: HE GAVE THEM BACK.', hold: 8 },
    { title: 'HOLLOW HOURS', sub: '', hold: 4 },
    { title: 'Thank you for playing', sub: 'Memories found and hours gathered are shown on the map.', hold: 4 },
  ],

  shards: [
    { title: 'A kitchen', text: 'A kitchen with a low ceiling. A woman at the table, younger, laughing, counting coins into stacks. She calls you by a name that is not Tam, a child\'s name, and tells you to stop stealing the sugar.' },
    { title: 'The Well', text: 'A stone well in a courtyard, dry. People in a line. Your sister sits on the rim with a ledger on her knee and takes each of them by the hand, and when she lets go they walk away a little slower than they came.' },
    { title: 'An argument', text: '"They owe," she says. "Everyone owes someone." You say that no one owes her their years. She says you have always been soft, and that softness is a thing she can fix, if you keep pushing.' },
    { title: 'Smoke', text: 'Paper burning in a brazier. Columns of names curling black. Your hands, shaking, feeding them in. Footsteps on the stair behind you and her voice, very gentle: "Oh, Tam."' },
    { title: 'The chair', text: 'Straps. A chair bolted to the floor beside the Well. She is apologising while she does it, and she means it, which is worse. "I need something that can pass his wards. I need it to be empty. I am so sorry it has to be you."' },
    { title: 'Pouring', text: 'The hours going in. You feel every one. A fisherman\'s last winter. A girl\'s eleventh birthday. An old man\'s afternoon nap that he was saving for after the war. Four hundred lives, not one of them yours, poured into the space where you used to be.' },
    { title: 'The shore', text: 'Being carried. Salt. Her voice, close to your ear, rehearsing: "The Regent did this to you. The Regent took your name. Say it back to me." You cannot say anything. She lays you down and walks away without looking back.' },
    { title: 'The thread', text: 'You understand the bar you have been spending. Every recall, every withering, every stopped second: a stranger\'s hour, burned. You have been paying her debts with their lives since the moment you woke. You stop walking for a while.' },
  ],

  abilities: {
    dash:   { title: 'SKIP', color: '#8fb3ff', text: 'Sef\'s seal. C, L or Shift steps you forward faster than the moment can follow. Nothing can touch you mid-skip, and cracked walls shatter.' },
    wither: { title: 'WITHER', color: '#9fc59a', text: 'The Ferrous Mother\'s decay, held in the hand. Select it with Q / E and cast with V; hold Up to cast upward. Ages whatever it strikes: rust locks crumble, the withered take double harm and slow.' },
    stall:  { title: 'STALL', color: '#8fb3ff', text: 'The Escapement\'s stolen tempo. Cast it and everything but you moves as if through tar for a few seconds.' },
    mend:   { title: 'MEND', color: '#7af0d0', text: 'Turn a thing back toward what it was. Nearby ruins rebuild themselves, and wounds you took in the last few seconds close.' },
    echo:   { title: 'ECHO', color: '#e6d8ff', text: 'Leave the last three seconds of yourself behind. The echo walks where you walked, strikes where you struck, and weighs down what you stood on.' },
    sever:  { title: 'SEVER', color: '#ff3355', text: 'Sef\'s last gift. Cut the thread: for a breath, time stops for everything but you. It costs more than any other power. You will learn exactly what.' },
  },
};
