'use strict';
// ---------------------------------------------------------------------------
// The script of WOUND.
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
    { who: 'you', name: '???', text: 'Where... No. Smaller. Who.', mood: 'sad' },
  ],

  screenEnter: {
    A2: [
      { title: 'ANCHOR', sub: 'F sets an anchor in time. F again returns you to it. Returning costs thread.', hold: 4 },
    ],
    A3: [{ title: 'STRIKE', sub: 'X strikes. Three strikes chain. Up + X cuts upward. Down + X in the air bounces off what you hit. Every hit earns thread.', hold: 4.5 }],
    U4: [{ who: 'you', name: 'Tam', text: '...Light.', mood: 'sad' }],
  },

  regionEnter: {
    tower: [{ who: 'you', name: 'Tam', text: 'It is running faster.', mood: 'stern' }],
  },

  sef: {
    jetty: [
      { who: 'sef', name: '???', text: 'Easy. Easy. You are shaking. The Warden had you by the chain and you cut through it like it was thread. Sit a moment.' },
      { who: 'you', name: '???', text: 'Who.' },
      { who: 'sef', name: 'Sef', text: 'Sef. Your name is Tam. That much I can give you. The rest is not mine to say yet. Walk a while, and let the city show you.', mood: 'sad' },
      { who: 'you', name: 'Tam', text: '...Tam.' },
      { who: 'sef', name: 'Sef', text: 'Take this. A seal I kept from the old guild: a skip in time. Go up through the rust. I will find you on the way.' },
    ],
    jettyAgain: [{ who: 'sef', name: 'Sef', text: 'Up through the Scrapyard, Tam. The seal is on the stone there. I will be behind you.' }],
    afterDash: [
      { who: 'you', name: 'Tam', text: 'Gone.' },
    ],
    root: [
      { who: 'sef', name: 'Sef', text: 'Tam! Down here, all this time. I searched the whole city for you. I thought he had unmade you.' , mood: 'sad' },
      { who: 'you', name: 'Tam', text: 'He asked what you told me.' },
      { who: 'sef', name: 'Sef', text: 'He asks everyone that. He has had a century to learn which questions make people doubt their friends.' },
      { who: 'sef', name: 'Sef', text: 'Listen. I have kept one last thing for you. Sever. The cut that stops the thread entirely. He cannot move through a stopped moment; nothing can but you.' },
      { who: 'you', name: 'Tam', text: 'What does it cost.' },
      { who: 'sef', name: 'Sef', text: 'Hours.' },
      { who: 'you', name: 'Tam', text: '...Whose.' },
      { who: 'sef', name: 'Sef', text: 'Go up, Tam. I will be at the Clock.', mood: 'stern' },
    ],
    rootAgain: [{ who: 'sef', name: 'Sef', text: 'The seal is on the altar. Take it, Tam. He is waiting, and so is everyone below.' }],
    afterSever: [
      { who: 'you', name: 'Tam', text: '...Whose.', mood: 'stern' },
    ],
    confront: [
      { who: 'sef', name: 'Sef', text: 'You did it. You actually did it. Look at him, Tam. A hundred years of keeping the Clock from me and he is just a pile of robes.' },
      { who: 'you', name: 'Tam', text: 'From you.', mood: 'stern' },
      { who: 'sef', name: 'Sef', text: '...From us. From everyone. Step aside, I need to open it before the hands settle.' },
      { who: 'sef', name: 'Sef', text: 'He told you. Of course he told you. The dying say things.' },
      { who: 'sef', name: 'Sef', text: 'You read the columns. I saw your face in the Archive; I was in the water.', mood: 'stern' },
      { who: 'sef', name: 'Sef', text: 'Then you know what you are. Good. It saves me explaining. You are my brother, Tam, and you are also four hundred people who owed me, and I am not going to let either of you keep me from that Clock.', mood: 'stern' },
      { who: 'sef', name: 'Sef', text: 'I scraped you clean so the wards would not smell what I poured into you. It worked. You walked straight through his door. Now be useful one last time and die where I can collect you.' },
    ],
  },

  archivist: {
    intro: [
      { who: 'archivist', name: 'The Archivist', text: 'Another one thrown down the oubliette. You are early. Most of them take a day to stop screaming.' },
      { who: 'you', name: 'Tam', text: 'The Regent.' },
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
      { who: 'you', name: 'Tam', text: 'The Regent.' },
      { who: 'miller', name: 'The Miller', text: 'You keep saying that name like it means something down here. He sealed the Clock. That is all he ever did. Sealed it and sat on it.' },
      { who: 'you', name: 'Tam', text: 'Then who.' },
      { who: 'miller', name: 'The Miller', text: '...My wife ran the Well. She would sit with you by the water and ask so gently. One hour, to settle the account. The ones who gave went grey in a week. The ones who refused came down here.' },
      { who: 'miller', name: 'The Miller', text: 'The Grinder is east. It was a dog once.' },
    ],
    again: [{ who: 'miller', name: 'The Miller', text: 'The Grinder is east. It was a dog once. She asked it for an hour too.' }],
    afterGrinder: [
      { who: 'miller', name: 'The Miller', text: 'Quiet, at last. ...You have someone\'s eyes. I did not want to say whose.', mood: 'sad' },
      { who: 'miller', name: 'The Miller', text: 'The echo altar is beyond. Then the Root, all the way up. If she is waiting at the top for you, boy, do not let her sit you down by the water.' },
    ],
    end: [{ who: 'miller', name: 'The Miller', text: 'The wheel has stopped. I think I will go and see the sky.' }],
  },

  underground: [
    { who: 'you', name: 'Tam', text: '...Water.', mood: 'sad' },
  ],
  loss: [
    { who: 'regent', name: 'The Regent', text: 'Stop. Stop, I said. Do you know how long it has been since anything got through my door?', mood: 'calm' },
    { who: 'you', name: 'Tam', text: 'You did this.' },
    { who: 'regent', name: 'The Regent', text: 'I have never seen you before in my life. And yet you reek of the Well. Four hundred... no. More. What has she told you?' },
    { who: 'you', name: 'Tam', text: 'Enough.' },
    { who: 'regent', name: 'The Regent', text: 'Not nearly. I do not have the hours to spare on you, and I will not let her collect what is in your chest. Go down and think.', mood: 'stern' },
    { ill: 'fall', text: 'The hands of the Clock stopped. The floor opened like a mouth. There was a long time of nothing at all, and then water.', hold: 5 },
  ],

  bosses: {
    shallows: {
      intro: [{ title: 'WARDEN OF THE SHALLOWS', sub: 'It has drowned many. It is good at it.', hold: 2.4 }],
      defeat: [{ who: 'you', name: '???', text: '...It liked that.', mood: 'sad' }],
    },
    ferrous: {
      intro: [{ title: 'THE FERROUS MOTHER', sub: 'She rusts, and she makes more of herself from the rust.', hold: 2.4 }],
      defeat: [{ who: 'you', name: 'Tam', text: 'Decay. In the hand.' }],
    },
    escapement: {
      intro: [{ title: 'THE ESCAPEMENT', sub: 'The Regent\'s duelist. It does not miss a beat.', hold: 2.4 }],
      defeat: [{ who: 'escapement', name: 'The Escapement', text: 'Her.' }, { who: 'you', name: 'Tam', text: '...Who.', mood: 'sad' }],
    },
    regent1: {
      intro: [{ title: 'THE REGENT OF HOURS', sub: 'He has not stood up in sixty years. He stands up.', hold: 2.6 }, { who: 'regent', name: 'The Regent', text: 'Who let you up the stairs? Never mind. Hold still. This will go faster if you hold still.', mood: 'calm' }],
      defeat: [],
    },
    index: {
      intro: [{ title: 'THE INDEX', sub: 'Every name the city filed and forgot, in one body.', hold: 2.4 }],
      defeat: [{ title: 'THE LEDGER OF THE WELL', sub: 'Four hundred columns. Every one signed at the foot in the same hand: S.', hold: 5 }, { who: 'you', name: 'Tam', text: '...Four hundred.', mood: 'sad' }],
    },
    grinder: {
      intro: [{ title: 'THE GRINDER', sub: 'It was a dog once.', hold: 2.4 }],
      defeat: [{ who: 'you', name: 'Tam', text: '...Good dog.', mood: 'sad' }],
    },
    regent: {
      intro: [{ title: 'THE REGENT OF HOURS', sub: 'Keeper of the Great Clock', hold: 2.6 }, { who: 'regent', name: 'The Regent', text: 'You climbed out. Good. Then you have met the Archivist, and the Miller, and you still came up here with your blade out. So she has you after all.', mood: 'calm' }, { who: 'regent', name: 'The Regent', text: 'If I open it she empties the city in a night. If I do not, you will take my head and she empties it anyway. I am very old, Tam. Let us see if I am still fast.', mood: 'stern' }],
      phase2: [{ who: 'regent', name: 'The Regent', text: 'There. There it is. Her Sever, in your hand. She gave you the one thing I could not stop. Clever woman. She was always clever.', mood: 'stern' }],
      defeat: [
        { who: 'regent', name: 'The Regent', text: 'Enough. Enough. I kept it shut for a hundred years. Let someone else.', mood: 'calm' },
        { who: 'you', name: 'Tam', text: 'Then who.' },
        { who: 'regent', name: 'The Regent', text: 'I never laid a hand on you until this room. I did not bring you here. I would not know how to hollow a man and fill him with other men\'s hours. I only ever knew one person who could.', mood: 'sad' },
        { who: 'regent', name: 'The Regent', text: 'She is behind you, Tam. She has been behind you the whole way up. Ask her how your hours taste.' },
      ],
    },
    sef: {
      intro: [{ title: 'SEF, THE HOURWRIGHT', sub: 'She asks so kindly.', hold: 2.6 }],
      rewind: [{ who: 'sef', name: 'Sef', text: 'No. No, I do not think so. I have more hours than you can cut, little brother. I turn mine back.', mood: 'stern' }],
      defeat: [
        { who: 'sef', name: 'Sef', text: 'Tam. Tam, listen to me. They were debtors. They owed. I only ever took what was owed.', mood: 'sad' },
        { who: 'you', name: 'Tam', text: 'You called it arithmetic.' },
        { who: 'sef', name: 'Sef', text: 'I made you last. I made you the only thing in this city that will not run out. Is that not a kind of love?' },
        { who: 'you', name: 'Tam', text: 'No.', mood: 'stern' },
      ],
    },
  },

  ending: [
    { ill: 'clock', text: 'He opened the Great Clock. The hands had been held at the same minute for a hundred years, and they were cold to the touch.', hold: 6 },
    { ill: 'giving', text: 'Then he gave the hours back. Four hundred of them, out of the glass and into the gears, each one a stranger\'s unspent afternoon returning to the city it was stolen from. There was nothing in him that was his.', hold: 8 },
    { ill: 'shoreEnd', text: 'The Regent found the hourglass on the shore where it had all begun, empty and still. He buried it above the tideline, and when the Miller asked what the stone should say, he thought for a long time and wrote only: HE GAVE THEM BACK.', hold: 8 },
    { title: 'WOUND', sub: '', hold: 4 },
    { title: 'Thank you for playing', sub: 'Memories found and hours gathered are shown on the map.', hold: 4 },
  ],

  shards: [
    { title: 'The stair', text: 'A narrow stair, your sister\'s hand on your collar, hauling you up past a door with a bell over it. "Do not look at them." Below, a line of people with their hats off. You look.' }, // A2
    { title: 'A kitchen', text: 'A kitchen with a low ceiling. A woman at the table, younger, laughing, counting coins into stacks. She calls you by a name that is not Tam, a child\'s name, and tells you to stop stealing the sugar.' }, // A3
    { title: 'Sugar', text: 'A paper twist of sugar. You did not steal it. She bought it with something that was not money, and the grocer\'s hands shook for a week afterward.' }, // A5
    { title: 'Sand', text: 'A beach, the two of you small, her filling a bottle with sand. "If you keep it, you keep the day." You believe her. You still do.' }, // A6
    { title: 'Fever', text: 'You in a bed, grey light. Her sitting with your hand in both of hers, promising to fix it. In the morning you are well and she is a little older.' }, // R1
    { title: 'Glass', text: 'The Glassworks door. You are thirteen. She is at the gate. "Make me something that does not run out."' }, // R2
    { title: 'The Well', text: 'A stone well in a courtyard, dry. People in a line. Your sister sits on the rim with a ledger on her knee and takes each of them by the hand, and when she lets go they walk away a little slower than they came.' }, // R4
    { title: 'The vessel', text: 'Your bench. A glass with two bulbs and no neck, your best work. You hand it to her. She weighs it in her palm and says "It will do for one."' }, // R5
    { title: 'Given', text: 'You on the rim, not her. The ledger reads "T., one hour, given." You wanted to know what it felt like. It felt like nothing, and that was the worst of it.' }, // R6
    { title: 'The dog', text: 'A yellow dog at the Mills, you scratching its ears, the Miller laughing, your sister watching the dog and doing arithmetic.' }, // H3
    { title: 'An argument', text: '"They owe," she says. "Everyone owes someone." You say that no one owes her their years. She says you have always been soft, and that softness is a thing she can fix, if you keep pushing.' }, // H4
    { title: 'The ring', text: 'Forty years in one breath. A wedding at the Wheelhouse. A woman who asks you for nothing, which is how you know what she is. You give her one anyway.' }, // H6
    { title: 'Smoke', text: 'Paper burning in a brazier. Columns of names curling black. Your hands, shaking, feeding them in. Footsteps on the stair behind you and her voice, very gentle: "Oh, Tam."' }, // H7
    { title: 'The last vessel', text: 'The furnace. You, old, making one more glass, two bulbs, large enough for a chest. You know what it is for. You make it well anyway.' }, // T2
    { title: 'The chair', text: 'Straps. A chair bolted to the floor beside the Well. She is apologising while she does it, and she means it, which is worse. "I need something that can pass his wards. I need it to be empty. I am so sorry it has to be you."' }, // D1
    { title: 'An eleventh birthday', text: 'A cake with one candle. You are the girl. Your mother says the Lady needs an hour and good children count. You count.' }, // D5
    { title: 'Smoke, from the stair', text: 'The brazier, seen from above. A man feeding pages into the fire, weeping. You are the one on the stair. You are not gentle; you are terrified; your voice comes out gentle anyway.' }, // D2
    { title: 'A fisherman\'s winter', text: 'Ice in the nets. A last season you were saving. A kind woman on the quay asks for one hour to settle what you owe the boat, and you think, it is only one.' }, // D4
    { title: 'Pouring', text: 'The hours going in. You feel every one. A fisherman\'s last winter. A girl\'s eleventh birthday. An old man\'s afternoon nap that he was saving for after the war. Four hundred lives, not one of them yours, poured into the space where you used to be.' }, // M1
    { title: 'The shore', text: 'Being carried. Salt. Her voice, close to your ear, rehearsing: "The Regent did this to you. The Regent took your name. Say it back to me." You cannot say anything. She lays you down and walks away without looking back.' }, // M2
    { title: 'The thread', text: 'You understand the bar you have been spending. Every recall, every withering, every stopped second: a stranger\'s hour, burned. You have been paying her debts with their lives since the moment you woke. You stop walking for a while.' }, // M5
    { title: 'The count', text: 'Her at the Well at night, alone, the great vessel in her lap. She opens her own wrist and pours in one more. "So there is something in there that was given." She never tells anyone.' }, // U2
    { title: 'The first morning', text: 'Waking on the shore. A woman\'s footprints leaving. You follow them up into the rust and forget why halfway. Hands under your arms, carrying you back down. Salt. Her voice, rehearsing.' }, // U5
    { title: 'The charter', text: 'A table, four Hourwrights, a young clockmaster signing. You are across from him with your hat in your hands and a debt you cannot pay. He does not look up.' }, // U7
  ],

  // Inscribed tablets found in the world (tile 'i'). Keyed by screen id, in reading order within the
  // screen. Each is a fragment of the City's own voice: lore, warnings, and hints about the powers.
  tablets: {
    A1: [{ title: 'ON THE TIDELINE', text: 'Whoever reads this woke on the shore, as we all did. The sea brings only two things to this city: the drowned, and those the Hourwright is finished with. Learn which you are. Walk right. Strike with X; the first blow makes room for a second and a third.' }],
    A2: [{ title: 'THE FIRST LESSON', text: 'A door that closes behind you is not a wall. Fix a point in time where you stand (F) and the stair will remember you there. Press what must be pressed, then return. The city teaches this to every child. Few remember being taught.' }],
    A3: [{ title: 'ON THE DROWNED', text: 'The husks were people who paid everything and kept walking. They pull back before they lunge: the whole body coils and the eyes go green. That pause is a courtesy. Use it. Step back or strike first; do not stand and wait.' }],
    A5: [{ title: 'ON THE JETTY', text: 'Here the Hourwrights kept their boats. They did not sail them. They stood at the end of the planks and gave the sea the ones who could not pay. Someone has scratched beneath this, in a newer hand: SHE STILL COMES HERE. And below that, older: THE GUARDIANS KEEP SEALS. A SEAL OPENS FOR THE CITY\'S REMEMBERED THINGS: MEMORIES, UNSPENT HOURS, WOUND THREAD. LOOK IN THE CORNERS.' }],
    R1: [{ title: 'ON THE DISTRICT', text: 'Iron rusts because time is poured into it faster than it can bear. Everything in this district was aged by hand. The knights do not know they are a hundred years dead. Their shields face forward: go over, go behind, or wait for the hammer to fall and the arms to tire.' }],
    R4: [{ title: 'ON WITHERING', text: 'To wither is to give a thing its own future all at once. A lock becomes the dust it was always going to be. A living thing slows, and breaks sooner. The Mother in the foundry learned this and it ate her from the inside. Point it upward (Up and V) at what hangs above you.' }],
    H1: [{ title: 'ON THE CATHEDRAL', text: 'The Great Clock was not built to tell the hour. It was built to hold them. Every gear in these walls is turning somebody\'s afternoon. Listen: that ticking is four hundred heartbeats, kept.' }],
    H3: [{ title: 'ON STALLING', text: 'The Regent\'s duelist stole its tempo from the pendulum. Hold it in your hand and the world thickens for a few breaths while you stay quick. Crushers fall slow enough to pass beneath. So do blades.' }],
    H4: [{ title: 'WARNING', text: 'The weights in this shaft do not care who you are. Watch the chain: it draws taut before the fall. Stall them, or count.' }],
    T1: [{ title: 'ON THE REGENT', text: 'He was the last clockmaster. When the Hourwrights came for the city\'s hours he climbed the tower and sealed the Clock with his own remaining years. He has not come down since. He is not kind. He is not what you were told.' }],
    D1: [{ title: 'ON THE ARCHIVE', text: 'Below the city they kept the ledgers: who owed, who paid, who was paid with. The water came later. The paper did not drown; it learned to move. The wraiths here blink out before they cut. When one vanishes, it is behind you.' }],
    D4: [{ title: 'ON MENDING', text: 'Mend is the gentlest and the most expensive. It asks a thing what it was and pays the difference. Rubble becomes a bridge. A wound you took a moment ago never happened. Nothing is truly undone; the cost is simply moved onto someone else\'s page.' }],
    M1: [{ title: 'ON THE MILLS', text: 'The hounds charge in straight lines and cannot turn. They lower their heads and dig in before they run. Be anywhere but in front of them when they finish. The millers knew this. The millers are gone.' }],
    M4: [{ title: 'ON ECHOES', text: 'Three seconds of you, left behind. It will walk, strike and weigh what you weighed. The gates in the grindstones open for a weight that stays. A person is a weight that stays, for a while.' }],
    U1: [{ title: 'ON THE ROOT', text: 'This is where the hours go when they are spent. Down. Into the roots. The city drinks them back up and calls it a season. Climb. It is a long way and nothing here wants you to leave.' }],
    U4: [{ title: 'ON SEVERING', text: 'To cut the thread is to stop every clock but your own. It costs five hours and it is never your own five. There is a reason the Hourwright gives this one last, and gives it gladly. Think about who it is you are spending.' }],
    U6: [{ title: 'A NEWER HAND', text: 'If you are reading this you climbed out, which means she wanted you to. Whoever she is to you now: a friend, a sister, a voice on the shore. Ask her who poured you. Ask her what the ledger at her waist is for.' }],
    A6: [{ title: 'A CHILD\'S SCRATCHING', text: 'Scratched low on the cistern wall, at a child\'s height: TAM + S. Below it, in the same hand but older: she said if you keep it you keep the day. Then nothing. The rest is under the waterline.' }],
    R2: [{ title: 'A GUILD RULE, HALF LEGIBLE', text: '...the Hourwright shall take only what is OWED, and only by the HAND, and never from a child under... The next line has been chiselled out. Someone went to real trouble to remove one word.' }],
    R5: [{ title: 'A LEDGER PAGE, NAILED UP', text: 'Column fourteen. Forty names. Each one: given, given, given. The last three: taken. Someone has written beside them in pencil: he would not have wanted this.' }],
    R6: [{ title: 'THE CRANE\'S PLATE', text: 'CRANE DECK. CAPACITY: FOUR HUNDRED HOURS. Scratched under the plate: it never lifted anything. She just liked the number.' }],
    H5: [{ title: 'THE REGENT\'S NOTICE', text: 'BY ORDER OF THE CLOCKMASTER: the Clock is sealed. No hour shall be wound into it or out of it until the one who asks is... The notice is torn here. Below, newer, smaller: he means her. everybody knows he means her.' }],
    H7: [{ title: 'THE BELL-RINGER\'S COUNT', text: 'Rang it for the drowned, rang it for the given, stopped ringing it when I could not keep count. If you are up here you came the hard way. There is nothing up here but the count. 400 is wrong. It is 401.' }],
    T2: [{ title: 'UNDER THE THRONE', text: 'Carved where only a man on his knees would see it: I kept it shut for a hundred years. I kept it shut from HER. If you are reading this she is already behind you.' }],
    D2: [{ title: 'A FILING INSTRUCTION', text: 'Debtors to the east shelves. Donors to the west. Sort by hour, not by name; the names change, the hours do not. Archivist\'s note beneath: there is no west shelf. There never was.' }],
    D5: [{ title: 'THE DROWNED LINE', text: 'Waterline, marked in paint, dated. Each year a little higher. The last mark: the year the Well went dry. The water had to go somewhere.' }],
    M2: [{ title: 'THE MILLER\'S TALLY', text: 'Flour: none. Bone: by the cartload. She said it was only what was left when the hours were out. She said it the way you say a kettle has boiled.' }],
    M5: [{ title: 'A STONE WITH NO NAME', text: 'A GOOD DOG. IT ASKED FOR NOTHING. Someone has added, in chalk: that is how you could tell she had got to it.' }],
    U2: [{ title: 'ROOT-TALK', text: 'Carved into the root itself, which should not be possible: the roots drink what the city spends. you are standing in the city\'s receipts.' }],
    U3: [{ title: 'A WARNING, MOST OF IT', text: 'The weights fall for a reason. Count four between. If the count is wrong it is because someone upstairs has been... The rest is crushed flat under a weight.' }],
    U7: [{ title: 'THE VEIN', text: 'Written in a hand that shakes: there is one hour in him that was given freely. I know, because I gave it. If he ever reads this, it was never arithmetic. Not that one. S.' }],
  },

  abilities: {
    dash:   { title: 'SKIP', color: '#8fb3ff', text: 'Sef\'s seal. C, L or Shift steps you forward faster than the moment can follow. Nothing can touch you mid-skip, and cracked walls shatter.' },
    wither: { title: 'WITHER', color: '#9fc59a', text: 'The Ferrous Mother\'s decay, held in the hand. Select it with Q / E and cast with V; hold Up to cast upward. Ages whatever it strikes: rust locks crumble, the withered take double harm and slow.' },
    stall:  { title: 'STALL', color: '#8fb3ff', text: 'The Escapement\'s stolen tempo. Cast it and everything but you moves as if through tar for a few seconds.' },
    mend:   { title: 'MEND', color: '#7af0d0', text: 'Turn a thing back toward what it was. Nearby ruins rebuild themselves, and wounds you took in the last few seconds close.' },
    echo:   { title: 'ECHO', color: '#e6d8ff', text: 'Leave the last three seconds of yourself behind. The echo walks where you walked, strikes where you struck, and weighs down what you stood on.' },
    sever:  { title: 'SEVER', color: '#ff3355', text: 'Sef\'s last gift. Cut the thread: for a breath, time stops for everything but you. It costs more than any other power. You will learn exactly what.' },
  },
};
