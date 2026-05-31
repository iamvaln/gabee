// admin-data.jsx — Gabee admin sample content (single "default" curriculum, MVP)

const MOD = [
  { id: 'numbers', slug: 'numbers', name: { fr: 'Nombres', en: 'Numbers' },
    desc: { fr: 'Compter, additionner et soustraire jusqu’à 100.', en: 'Count, add and subtract up to 100.' },
    icon: 'numbers', inputs: ['mouse','touch'], voiceover: false, subModes: 0,
    events: ['number.answer','number.retry','number.hint'], status: 'active',
    confirmed: 138, target: 200, plansAccepted: 7 },
  { id: 'words', slug: 'words', name: { fr: 'Mots', en: 'Words' },
    desc: { fr: 'Lire, écrire et construire des phrases simples.', en: 'Read, write and build simple sentences.' },
    icon: 'words', inputs: ['mouse','touch','drag','keyboard'], voiceover: false, subModes: 4,
    events: ['word.answer','word.retry','word.build.drop'], status: 'active',
    confirmed: 96, target: 200, plansAccepted: 5 },
  { id: 'keyboard', slug: 'keyboard', name: { fr: 'Clavier', en: 'Keyboard' },
    desc: { fr: 'Apprendre à taper avec les dix doigts.', en: 'Learn to type with all ten fingers.' },
    icon: 'keyboard', inputs: ['keyboard'], voiceover: true, subModes: 0,
    events: ['key.press','key.target.done','key.error'], status: 'active',
    confirmed: 60, target: 200, plansAccepted: 3 },
  { id: 'code', slug: 'code', name: { fr: 'Code', en: 'Code' },
    desc: { fr: 'Programmer un robot avec des blocs et des boucles.', en: 'Program a robot with blocks and loops.' },
    icon: 'code', inputs: ['mouse','drag','touch'], voiceover: false, subModes: 0,
    events: ['code.run','code.block.place','code.solve'], status: 'active',
    confirmed: 80, target: 200, plansAccepted: 4 },
  { id: 'translation', slug: 'translation', name: { fr: 'Traduction', en: 'Translate' },
    desc: { fr: 'Traduire des mots et phrases français ↔ anglais.', en: 'Translate words and phrases French ↔ English.' },
    icon: 'translation', inputs: ['mouse','keyboard','touch'], voiceover: true, subModes: 0,
    events: ['tr.answer','tr.retry','tr.audio.play'], status: 'active',
    confirmed: 40, target: 200, plansAccepted: 2 },
];

const MODULE_ICONS = {
  numbers: <svg viewBox="0 0 32 32" fill="currentColor" aria-hidden><text x="16" y="22" textAnchor="middle" fontFamily="'Mulish',sans-serif" fontWeight="800" fontSize="22">7</text><circle cx="6" cy="6" r="2"/><circle cx="26" cy="6" r="2"/><circle cx="6" cy="26" r="2"/><circle cx="26" cy="26" r="2"/></svg>,
  words: <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden><path d="M6 8H26"/><path d="M6 16H22"/><path d="M6 24H18"/></svg>,
  keyboard: <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden><rect x="3" y="8" width="26" height="16" rx="3"/><circle cx="9" cy="14" r="1.2" fill="currentColor"/><circle cx="14" cy="14" r="1.2" fill="currentColor"/><circle cx="19" cy="14" r="1.2" fill="currentColor"/><circle cx="24" cy="14" r="1.2" fill="currentColor"/><rect x="10" y="18" width="12" height="2.5" rx="1.2" fill="currentColor"/></svg>,
  code: <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M11 10 5 16 11 22"/><path d="M21 10 27 16 21 22"/><path d="M19 8 13 24"/></svg>,
  translation: <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden><text x="9" y="14" textAnchor="middle" fontFamily="'Mulish'" fontWeight="800" fontSize="11" fill="currentColor" stroke="none">FR</text><text x="23" y="26" textAnchor="middle" fontFamily="'Mulish'" fontWeight="800" fontSize="11" fill="currentColor" stroke="none">EN</text><path d="M6 19 26 19" strokeLinecap="round"/><path d="M22 16 26 19 22 22" strokeLinecap="round" strokeLinejoin="round"/><path d="M10 22 6 19 10 16" strokeLinecap="round" strokeLinejoin="round"/></svg>,
};

const SUBMODES_WORDS = [
  { id: 'picture', name: { fr: 'Image vers mot', en: 'Picture to word' } },
  { id: 'fill', name: { fr: 'Trouve le mot', en: 'Fill the blank' } },
  { id: 'build', name: { fr: 'Construis la phrase', en: 'Build the sentence' } },
  { id: 'read', name: { fr: 'Lis et réponds', en: 'Read and answer' } },
];

// Per-module per-level matrix: { plan: 'pending'|'ai_draft'|'accepted', pool: confirmed count } (target 20)
const POOL_TARGET = 20;
const MATRIX = {
  numbers:     [20,20,20,20,18,14, 0, 0, 0, 0].map((p,i)=>({ pool:p, plan: i<6?'accepted':(i===6?'ai_draft':'pending') })),
  words:       [20,20,20,12, 0, 0, 0, 0, 0, 0].map((p,i)=>({ pool:p, plan: i<4?'accepted':(i===4?'ai_draft':'pending') })),
  keyboard:    [20,20,16, 0, 0, 0, 0, 0, 0, 0].map((p,i)=>({ pool:p, plan: i<3?'accepted':(i===3?'ai_draft':'pending') })),
  code:        [20,20,20,18, 2, 0, 0, 0, 0, 0].map((p,i)=>({ pool:p, plan: i<4?'accepted':(i===4?'ai_draft':'pending') })),
  translation: [20,20, 8, 0, 0, 0, 0, 0, 0, 0].map((p,i)=>({ pool:p, plan: i<2?'accepted':(i===2?'ai_draft':'pending') })),
};

// Plan for Numbers · level 7 (the one being authored, ai_draft)
const PLAN_DRAFT = {
  module: 'numbers', level: 7, status: 'ai_draft',
  scope: {
    fr: "Additions et soustractions à deux chiffres avec retenue, dans la plage 20–99. L’enfant manipule les dizaines et les unités et apprend à reporter une retenue d’une colonne à l’autre.",
    en: "Two-digit addition and subtraction with carrying, in the 20–99 range. The child manipulates tens and units and learns to carry across columns.",
  },
  objectives: [
    { fr: "Additionner deux nombres à deux chiffres avec une retenue (ex. 27 + 18).", en: "Add two two-digit numbers with one carry (e.g. 27 + 18)." },
    { fr: "Soustraire avec un emprunt sur les dizaines (ex. 52 − 17).", en: "Subtract with a borrow across tens (e.g. 52 − 17)." },
    { fr: "Reconnaître quand une retenue est nécessaire avant de calculer.", en: "Recognise when a carry is needed before computing." },
    { fr: "Estimer un résultat à la dizaine la plus proche.", en: "Estimate a result to the nearest ten." },
  ],
  validation: {
    fr: "L’enfant réussit ≥ 80 % des additions et soustractions avec retenue sur 3 sessions, sans plus d’un indice par question.",
    en: "The child succeeds on ≥ 80% of carry add/subtract questions across 3 sessions, with no more than one hint per question.",
  },
  notes: "Pondérer le pool : ~60 % additions, 40 % soustractions. Éviter les nombres ronds (30, 40) qui masquent la retenue.",
};

// Streaming target text for the live-generation state (level 8, fresh)
const PLAN_STREAM = {
  scope_fr: "Multiplication par 2, 5 et 10 présentée comme des additions répétées et des groupes égaux. L’enfant relie le geste de regrouper à l’écriture multiplicative et mémorise les premières tables.",
  scope_en: "Multiplication by 2, 5 and 10 introduced as repeated addition and equal groups. The child connects the act of grouping to multiplicative notation and memorises the first tables.",
};

// Question candidates for Numbers · level 7
function mkCand(id, type, qfr, qen, afr, aen, fr, en) {
  return { id, type, q: { fr: qfr, en: qen }, a: { fr: afr, en: aen }, obj: 1, rFr: fr, rEn: en, status: fr ? (fr>=4?'rated':'candidate') : 'candidate' };
}
const CANDIDATES = [
  mkCand('q1','choice','27 + 18','27 + 18','45','45',5,5),
  mkCand('q2','choice','46 − 19','46 − 19','27','27',5,4),
  mkCand('q3','choice','38 + 27','38 + 27','65','65',4,4),
  mkCand('q4','choice','52 − 17','52 − 17','35','35',4,5),
  mkCand('q5','choice','29 + 36','29 + 36','65','65',4,4),
  mkCand('q6','input','64 − 28','64 − 28','36','36',3,3),
  mkCand('q7','choice','45 + 29','45 + 29','74','74',5,4),
  mkCand('q8','choice','81 − 46','81 − 46','35','35',2,2),
];

// ---- Per-module authoring plans (the level currently being authored = MATRIX ai_draft) ----
const PLANS = {
  numbers: {
    module: 'numbers', level: 7, status: 'ai_draft',
    prevName: { fr: 'Nombres · N6', en: 'Numbers · L6' },
    scope: PLAN_DRAFT.scope, objectives: PLAN_DRAFT.objectives, validation: PLAN_DRAFT.validation, notes: PLAN_DRAFT.notes,
    prev: [
      { h: { fr: 'Niveau 6 — Additions/soustractions sans retenue', en: 'Level 6 — Add/subtract without carry' }, items: [{ fr: 'Additionner deux nombres ≤ 50 sans retenue', en: 'Add two numbers ≤ 50 with no carry' }, { fr: 'Soustraire dans la même dizaine', en: 'Subtract within the same ten' }] },
      { h: { fr: 'Niveau 5 — Compter par 2, 5 et 10', en: 'Level 5 — Counting by 2s, 5s, 10s' }, items: [{ fr: 'Compléter une suite jusqu’à 100', en: 'Complete a sequence to 100' }] },
    ],
  },
  words: {
    module: 'words', level: 5, status: 'ai_draft',
    prevName: { fr: 'Mots · N4', en: 'Words · L4' },
    scope: {
      fr: "Construire des phrases simples de 4 à 6 mots et accorder le déterminant avec le nom. L’enfant ordonne sujet–verbe–complément et complète des phrases à trou avec le mot juste.",
      en: "Build simple 4–6 word sentences and match the article with the noun. The child orders subject–verb–object and completes fill-in-the-blank sentences with the right word.",
    },
    objectives: [
      { fr: "Ordonner les mots d’une phrase (sujet–verbe–complément).", en: "Order the words of a sentence (subject–verb–object)." },
      { fr: "Accorder le déterminant et le nom en nombre.", en: "Match article and noun in number." },
      { fr: "Compléter une phrase à trou avec le mot correct.", en: "Complete a fill-in-the-blank with the correct word." },
      { fr: "Lire une phrase courte et répondre à une question.", en: "Read a short sentence and answer a question." },
    ],
    validation: {
      fr: "L’enfant construit correctement ≥ 80 % des phrases proposées sur 3 sessions, dans les deux langues.",
      en: "The child correctly builds ≥ 80% of proposed sentences across 3 sessions, in both languages.",
    },
    notes: "Répartir entre les quatre sous-modes (image→mot, trouve le mot, construis la phrase, lis et réponds). Vocabulaire concret et imageable.",
    prev: [
      { h: { fr: 'Niveau 4 — Mots-outils et petits noms', en: 'Level 4 — Sight words and small nouns' }, items: [{ fr: 'Reconnaître 30 mots-outils fréquents', en: 'Recognise 30 frequent sight words' }] },
      { h: { fr: 'Niveau 3 — Du son à la syllabe', en: 'Level 3 — From sound to syllable' }, items: [{ fr: 'Associer un son à sa lettre', en: 'Match a sound to its letter' }] },
    ],
  },
  keyboard: {
    module: 'keyboard', level: 4, status: 'ai_draft',
    prevName: { fr: 'Clavier · N3', en: 'Keyboard · L3' },
    scope: {
      fr: "Frappe de la rangée du haut (a z e r t y…) en gardant les doigts ancrés sur la rangée de repos. L’enfant enchaîne des mots mêlant les deux rangées sans regarder le clavier.",
      en: "Typing the top row (q w e r t y…) while keeping fingers anchored on the home row. The child chains words mixing both rows without looking at the keyboard.",
    },
    objectives: [
      { fr: "Atteindre chaque touche de la rangée du haut avec le bon doigt.", en: "Reach each top-row key with the correct finger." },
      { fr: "Revenir à la position de repos après chaque frappe.", en: "Return to the home position after each keystroke." },
      { fr: "Taper un mot de 5 à 7 lettres mêlant deux rangées.", en: "Type a 5–7 letter word mixing two rows." },
      { fr: "Maintenir une précision ≥ 90 % sur une ligne.", en: "Keep ≥ 90% accuracy across a line." },
    ],
    validation: {
      fr: "L’enfant tape les mots cibles avec ≥ 90 % de précision et < 2 erreurs par ligne sur 3 sessions.",
      en: "The child types the target words with ≥ 90% accuracy and < 2 errors per line across 3 sessions.",
    },
    notes: "Voix off activée. Introduire une seule nouvelle touche à la fois ; valoriser la régularité plutôt que la vitesse.",
    prev: [
      { h: { fr: 'Niveau 3 — Rangée de repos + premiers mots', en: 'Level 3 — Home row + first words' }, items: [{ fr: 'Taper q s d f j k l m sans regarder', en: 'Type a s d f j k l ; without looking' }] },
      { h: { fr: 'Niveau 2 — Index et majeurs', en: 'Level 2 — Index & middle fingers' }, items: [{ fr: 'Placer les doigts sur les touches de repère', en: 'Place fingers on the home keys' }] },
    ],
  },
  code: {
    module: 'code', level: 5, status: 'ai_draft',
    prevName: { fr: 'Code · N4', en: 'Code · L4' },
    scope: {
      fr: "Introduction des boucles « répète N fois » pour raccourcir une suite d’instructions. L’enfant identifie un motif répété et le remplace par une boucle pour guider le robot.",
      en: "Introducing ‘repeat N times’ loops to shorten a sequence of instructions. The child spots a repeated pattern and replaces it with a loop to guide the robot.",
    },
    objectives: [
      { fr: "Reconnaître un motif d’instructions répété.", en: "Recognise a repeated instruction pattern." },
      { fr: "Remplacer une suite par une boucle « répète N fois ».", en: "Replace a sequence with a ‘repeat N times’ loop." },
      { fr: "Prévoir la position finale du robot après une boucle.", en: "Predict the robot’s final position after a loop." },
      { fr: "Choisir le nombre de répétitions pour atteindre une cible.", en: "Choose the repeat count to reach a target." },
    ],
    validation: {
      fr: "L’enfant résout ≥ 80 % des défis avec boucle en ≤ 2 essais sur 3 sessions.",
      en: "The child solves ≥ 80% of loop challenges in ≤ 2 tries across 3 sessions.",
    },
    notes: "Blocs glisser-déposer. Commencer par des boucles de 2 à 4 répétitions ; éviter les boucles imbriquées (niveau ultérieur).",
    prev: [
      { h: { fr: 'Niveau 4 — Séquences ordonnées', en: 'Level 4 — Ordered sequences' }, items: [{ fr: 'Enchaîner 4 à 6 instructions dans l’ordre', en: 'Chain 4–6 instructions in order' }] },
      { h: { fr: 'Niveau 3 — Premiers déplacements', en: 'Level 3 — First moves' }, items: [{ fr: 'Avancer et tourner vers une cible', en: 'Move and turn toward a target' }] },
    ],
  },
  translation: {
    module: 'translation', level: 3, status: 'ai_draft',
    prevName: { fr: 'Traduction · N2', en: 'Translate · L2' },
    scope: {
      fr: "Traduire dans les deux sens des mots concrets et des salutations courantes (couleurs, animaux, politesse). L’enfant associe un mot français à son équivalent anglais et inversement.",
      en: "Translating concrete words and common greetings both ways (colours, animals, courtesy). The child matches a French word to its English equivalent and vice versa.",
    },
    objectives: [
      { fr: "Traduire un mot concret du français vers l’anglais.", en: "Translate a concrete word from French to English." },
      { fr: "Traduire un mot concret de l’anglais vers le français.", en: "Translate a concrete word from English to French." },
      { fr: "Reconnaître une salutation courante dans les deux langues.", en: "Recognise a common greeting in both languages." },
      { fr: "Choisir la bonne traduction parmi des distracteurs proches.", en: "Pick the correct translation among close distractors." },
    ],
    validation: {
      fr: "L’enfant traduit correctement ≥ 80 % des items dans les deux sens sur 3 sessions.",
      en: "The child correctly translates ≥ 80% of items both ways across 3 sessions.",
    },
    notes: "Voix off activée pour l’écoute. Paires imageables ; éviter les faux-amis à ce niveau.",
    prev: [
      { h: { fr: 'Niveau 2 — Couleurs et nombres', en: 'Level 2 — Colours & numbers' }, items: [{ fr: 'Traduire les couleurs et nombres ≤ 10', en: 'Translate colours and numbers ≤ 10' }] },
      { h: { fr: 'Niveau 1 — Premiers mots', en: 'Level 1 — First words' }, items: [{ fr: 'Associer 20 mots-images FR↔EN', en: 'Match 20 picture-words FR↔EN' }] },
    ],
  },
};

// ---- Per-module candidate question pools ----
const POOLS = {
  numbers: CANDIDATES,
  words: [
    mkCand('w1','choice','Choisis le mot : « Le soleil est ___ ».','Pick the word: “The sun is ___.”','jaune','yellow',5,5),
    mkCand('w2','choice','Quel est le contraire de « grand » ?','What is the opposite of “big”?','petit','small',5,4),
    mkCand('w3','input','Écris le pluriel de « chat ».','Write the plural of “cat”.','chats','cats',4,4),
    mkCand('w4','choice','Quelle phrase est correcte ?','Which sentence is correct?','Je mange une pomme.','I eat an apple.',4,5),
    mkCand('w5','choice','Quel mot rime avec « chat » ?','Which word rhymes with “cat”?','rat','hat',4,4),
    mkCand('w6','input','Complète : « Il fait ___ aujourd’hui. »','Complete: “It is ___ today.”','beau','sunny',3,3),
    mkCand('w7','choice','Quel mot est un verbe ?','Which word is a verb?','courir','run',5,4),
    mkCand('w8','choice','Combien de mots dans « le petit chien » ?','How many words in “the small dog”?','3','3',2,2),
  ],
  keyboard: [
    mkCand('k1','input','Tape la lettre sous l’index gauche (rangée de repos).','Type the letter under your left index (home row).','f','f',5,5),
    mkCand('k2','choice','Quel doigt tape la touche « J » ?','Which finger types the “J” key?','Index droit','Right index',5,4),
    mkCand('k3','input','Tape le mot : « jardin ».','Type the word: “garden”.','jardin','garden',4,4),
    mkCand('k4','input','Tape la majuscule « A » (avec Maj).','Type the capital “A” (with Shift).','A','A',4,5),
    mkCand('k5','choice','Où repose le pouce ?','Where does the thumb rest?','Barre d’espace','Space bar',4,4),
    mkCand('k6','input','Tape : « école ».','Type: “school”.','école','school',3,3),
    mkCand('k7','input','Tape la rangée de repos (main gauche).','Type the home row (left hand).','qsdf','asdf',5,4),
    mkCand('k8','choice','Faut-il regarder le clavier ?','Should you look at the keyboard?','Non','No',2,3),
  ],
  code: [
    mkCand('c1','choice','Combien de pas pour atteindre l’étoile ? (3 cases)','How many steps to reach the star? (3 tiles)','3','3',5,5),
    mkCand('c2','choice','Quelle boucle dessine un carré ?','Which loop draws a square?','Répète 4 fois : avance, tourne','Repeat 4: move, turn',5,4),
    mkCand('c3','choice','Que fait « Répète 3 fois : avance » ?','What does “Repeat 3: move” do?','Avance de 3 cases','Moves 3 tiles',4,4),
    mkCand('c4','input','Combien de répétitions pour 6 pas avec « avance 2 » ?','How many repeats for 6 steps with “move 2”?','3','3',4,5),
    mkCand('c5','choice','Quel bloc placer en premier ?','Which block goes first?','Avance vers la clé','Move to the key',4,4),
    mkCand('c6','choice','L’ordre correct des blocs ?','The correct block order?','Avance, Tourne, Avance','Move, Turn, Move',3,3),
    mkCand('c7','choice','Une boucle sert à…','A loop is used to…','répéter des actions','repeat actions',5,4),
    mkCand('c8','input','Combien de « tourne » pour un demi-tour ?','How many “turn” for a half-turn?','2','2',2,2),
  ],
  translation: [
    mkCand('t1','choice','Traduis en anglais : « chien ».','Translate to French: “dog”.','dog','chien',5,5),
    mkCand('t2','choice','Traduis : « Bonjour ».','Translate: “Hello”.','Hello','Bonjour',5,4),
    mkCand('t3','input','Traduis en anglais : « merci ».','Translate to French: “thank you”.','thank you','merci',4,4),
    mkCand('t4','choice','« Je m’appelle… » en anglais ?','“My name is…” in French?','My name is…','Je m’appelle…',4,5),
    mkCand('t5','choice','Traduis : « rouge ».','Translate: “red”.','red','rouge',4,4),
    mkCand('t6','input','Traduis en anglais : « l’école ».','Translate to French: “school”.','school','école',3,3),
    mkCand('t7','choice','Traduis : « chat ».','Translate: “cat”.','cat','chat',5,4),
    mkCand('t8','choice','« Au revoir » en anglais ?','“Goodbye” in French?','Goodbye','Au revoir',2,2),
  ],
};

// ---- Users ----
const PARENTS = [
  { id:'p1', name:'Sandrine Kouassi', email:'sandrine.k@gmail.com', created:'2026-01-12', children:2, status:'active' },
  { id:'p2', name:'Marc Dubois', email:'marc.dubois@orange.fr', created:'2026-02-03', children:1, status:'active' },
  { id:'p3', name:'Aïcha Diallo', email:'aicha.diallo@yahoo.fr', created:'2026-02-20', children:3, status:'active' },
  { id:'p4', name:'Thomas Bernard', email:'t.bernard@proton.me', created:'2026-03-01', children:1, status:'suspended' },
  { id:'p5', name:'Lucie Moreau', email:'lucie.moreau@gmail.com', created:'2026-03-14', children:2, status:'active' },
  { id:'p6', name:'Kwame Mensah', email:'kwame.m@gmail.com', created:'2026-03-28', children:1, status:'active' },
  { id:'p7', name:'Élise Petit', email:'elise.petit@free.fr', created:'2026-04-09', children:2, status:'active' },
];
const CHILDREN = [
  { id:'c1', name:'Rumi', parent:'Sandrine Kouassi', age:7, last:'il y a 2 h', week:'2 h 40' },
  { id:'c2', name:'Léo', parent:'Marc Dubois', age:6, last:'hier', week:'1 h 10' },
  { id:'c3', name:'Awa', parent:'Aïcha Diallo', age:8, last:'il y a 30 min', week:'3 h 25' },
  { id:'c4', name:'Djino', parent:'Aïcha Diallo', age:6, last:'il y a 4 h', week:'1 h 55' },
  { id:'c5', name:'Chloé', parent:'Lucie Moreau', age:7, last:'il y a 1 j', week:'2 h 05' },
  { id:'c6', name:'Kofi', parent:'Kwame Mensah', age:9, last:'il y a 3 h', week:'4 h 10' },
];
const ADMINS = [
  { id:'a1', name:'Amélie Mbarga', email:'amelie@gabee.app', role:'super_admin', status:'active', by:'—', last:'à l’instant' },
  { id:'a2', name:'Julien Roy', email:'julien@gabee.app', role:'admin', status:'active', by:'Amélie Mbarga', last:'il y a 1 h' },
  { id:'a3', name:'Fatou Ndiaye', email:'fatou@gabee.app', role:'admin', status:'active', by:'Amélie Mbarga', last:'hier' },
  { id:'a4', name:'Pierre Lambert', email:'pierre@gabee.app', role:'admin', status:'invited', by:'Amélie Mbarga', last:'—' },
];

// child detail progress per module
const CHILD_PROGRESS = {
  numbers: { level: 5, lessons: 13, mastery: 0.82 },
  words: { level: 3, lessons: 8, mastery: 0.71 },
  keyboard: { level: 2, lessons: 5, mastery: 0.64 },
  code: { level: 4, lessons: 11, mastery: 0.78 },
  translation: { level: 2, lessons: 4, mastery: 0.55 },
};

// ---- Metrics ----
const METRICS = {
  northStar: 3.8, northStarDelta: +0.4,
  distribution: [2,5,9,14,22,26,18,11,7,4], // histogram of weekly active days
  adherence: 0.72, adherenceSpark: [0.58,0.61,0.6,0.65,0.67,0.69,0.72],
  engagement: 0.81, engagementSpark: [0.74,0.77,0.76,0.79,0.8,0.79,0.81],
  learning: 0.68, learningSpark: [0.55,0.58,0.6,0.62,0.64,0.66,0.68],
  registrations7: 84, registrations30: 312, activeChildren7: 296, recentSessions: 1840,
};

// ai usage daily (tokens in thousands), cost
const AI_USAGE = {
  planTokens: [42,38,55,61,49,72,68],
  poolTokens: [180,210,160,240,205,260,248],
  days: ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'],
  monthCost: 184.30, projectedCost: 268.00, callsToday: 47,
  byModel: [
    { provider:'Anthropic', model:'claude-sonnet-4', purpose:'Pool generation', calls:1280, tokens:'18.4M', cost:142.10 },
    { provider:'Anthropic', model:'claude-haiku-4', purpose:'Plan drafting', calls:540, tokens:'3.1M', cost:18.40 },
    { provider:'OpenAI', model:'gpt-4o-mini', purpose:'Parity check', calls:910, tokens:'2.0M', cost:23.80 },
  ],
};

const LOGS = [
  { t:'14:32:08', lvl:'error', msg:'POST /api/pool/confirm — 500', trace:'PoolThresholdError: only 17 of 20 candidates rated ≥ 4 (numbers/L8)' },
  { t:'14:18:55', lvl:'warn', msg:'Slow request 3.2s — GET /api/analytics/learning', trace:'aggregate over 4 modules × 10 levels exceeded 3s budget' },
  { t:'13:50:21', lvl:'error', msg:'Mailgun delivery failed — bounce', trace:'recipient t.bernard@proton.me — mailbox full (552)' },
  { t:'13:41:09', lvl:'info', msg:'AI batch complete — code/L5 (30 candidates)', trace:'provider=anthropic model=claude-sonnet-4 tokens=212k' },
  { t:'12:27:44', lvl:'warn', msg:'Rate limit near — Anthropic 82% of RPM', trace:'window 60s · 412/500 requests' },
  { t:'11:58:30', lvl:'info', msg:'Plan accepted — numbers/L6 by amelie@gabee.app', trace:'—' },
];
const DELIVER = { sent: 4210, opened: 3180, bounced: 42, failed: 11 };

const AUDIT = [
  { t:'2026-05-29 11:58', actor:'Amélie Mbarga', role:'super_admin', kind:'plan.accept', target:'numbers / L6', diff:true },
  { t:'2026-05-29 10:14', actor:'Julien Roy', role:'admin', kind:'pool.confirm', target:'code / L4 (20 questions)', diff:false },
  { t:'2026-05-28 17:02', actor:'Amélie Mbarga', role:'super_admin', kind:'user.role_change', target:'fatou@gabee.app → admin', diff:true },
  { t:'2026-05-28 15:39', actor:'Fatou Ndiaye', role:'admin', kind:'question.demote', target:'words / L3 · q14', diff:true },
  { t:'2026-05-28 09:21', actor:'Amélie Mbarga', role:'super_admin', kind:'gdpr.execute', target:'erase · child c9', diff:false },
  { t:'2026-05-27 16:45', actor:'Julien Roy', role:'admin', kind:'parent.suspend', target:'t.bernard@proton.me', diff:true },
];

const INBOX = [
  { id:'i1', name:'Camille Faure', email:'camille.f@gmail.com', subject:'Problème de connexion sur tablette', status:'new', date:'29 mai' },
  { id:'i2', name:'David Nguyen', email:'d.nguyen@gmail.com', subject:'Suggestion : mode hors-ligne plus long', status:'new', date:'29 mai' },
  { id:'i3', name:'Sophie Martin', email:'sophie@free.fr', subject:'Question sur la facturation', status:'read', date:'28 mai' },
  { id:'i4', name:'Ahmed Benali', email:'ahmed.b@yahoo.fr', subject:'Félicitations pour l’app !', status:'replied', date:'27 mai' },
];

const GDPR_REQUESTS = [
  { id:'g1', kind:'erase', email:'thomas.b@proton.me', requester:'Thomas Bernard', status:'verifying', owner:'Amélie', date:'29 mai' },
  { id:'g2', kind:'export', email:'lucie.moreau@gmail.com', requester:'Lucie Moreau', status:'new', owner:'—', date:'28 mai' },
  { id:'g3', kind:'access', email:'kwame.m@gmail.com', requester:'Kwame Mensah', status:'done', owner:'Julien', date:'24 mai' },
];

const FEEDBACK = [
  { id:'f1', parent:'Aïcha Diallo', age:8, scope:'level', target:'numbers · L5', rating:5, comment:'Awa adore les additions maintenant !', status:'new', date:'29 mai' },
  { id:'f2', parent:'Marc Dubois', age:6, scope:'lesson', target:'words · L2 · build', rating:2, comment:'Trop difficile, mon fils abandonne.', status:'new', date:'29 mai' },
  { id:'f3', parent:'Lucie Moreau', age:7, scope:'module', target:'code', rating:4, comment:'Très bien mais les boucles arrivent vite.', status:'triaged', date:'28 mai' },
  { id:'f4', parent:'Kwame Mensah', age:9, scope:'level', target:'translation · L2', rating:3, comment:'La voix off est parfois peu claire.', status:'closed', date:'26 mai' },
];

const T = {
  generate: { fr: 'Générer le plan', en: 'Generate plan' },
  regenerate: { fr: 'Régénérer', en: 'Regenerate' },
  accept: { fr: 'Accepter le plan', en: 'Accept plan' },
  cancel: { fr: 'Annuler', en: 'Cancel' },
  confirmPool: { fr: 'Confirmer le pool', en: 'Confirm pool' },
  genQuestions: { fr: 'Générer les questions', en: 'Generate questions' },
};

Object.assign(window, {
  MOD, MODULE_ICONS, SUBMODES_WORDS, MATRIX, POOL_TARGET, PLAN_DRAFT, PLAN_STREAM, CANDIDATES, PLANS, POOLS,
  PARENTS, CHILDREN, ADMINS, CHILD_PROGRESS, METRICS, AI_USAGE, LOGS, DELIVER, AUDIT,
  INBOX, GDPR_REQUESTS, FEEDBACK, T,
});
