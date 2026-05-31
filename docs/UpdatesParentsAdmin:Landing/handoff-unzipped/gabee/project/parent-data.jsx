// parent-data.jsx — Gabee Parent sample data + bilingual copy.
// One family: Sandrine (primary) + Marc (co-parent), three kids at the 3-kid limit.

const MODULES = [
  { id: 'numbers', name: { fr: 'Nombres', en: 'Numbers' }, color: '#1F6FEB' },
  { id: 'words', name: { fr: 'Mots', en: 'Words' }, color: '#D6336C' },
  { id: 'keyboard', name: { fr: 'Clavier', en: 'Keyboard' }, color: '#C99A0E' },
  { id: 'code', name: { fr: 'Code', en: 'Code' }, color: '#7B2FF7' },
  { id: 'translation', name: { fr: 'Traduction', en: 'Translate' }, color: '#C75D28' },
];
const MOD = Object.fromEntries(MODULES.map(m => [m.id, m]));

const PARENT = { id: 'me', name: 'Sandrine Kouassi', first: 'Sandrine', last: 'Kouassi', email: 'sandrine.k@gmail.com', country: 'CI', role: 'primary', displayName: 'Maman' };
const COPARENT = { id: 'marc', name: 'Marc Dubois', first: 'Marc', last: 'Dubois', email: 'marc.dubois@gmail.com', role: 'coparent', joined: '12 mars 2026', displayName: 'Papa' };
const parentById = (id) => (id === 'marc' ? COPARENT : PARENT);

// Three kids (at limit). chips = current level per touched module.
const KIDS = [
  {
    id: 'ana', name: 'Ana', avatar: 'avatar_3', age: 8, school: 'CE2',
    lastActive: { fr: 'il y a 30 min', en: '30 min ago' }, playedToday: true,
    todaySessions: 3, todayMin: 28,
    pips: { numbers: true, words: true, keyboard: false, code: true, translation: false },
    levels: { numbers: 6, words: 4, code: 3, translation: 2 },
    weekMin: 142, lastWeekMin: 127, weekSessions: 11, sessionsSpark: [2, 1, 3, 0, 2, 1, 2],
    adherence: 0.78, streak: 6, longestStreak: 9, healthy: true,
    objectives: ['math_basics', 'logic_coding', 'reading'],
  },
  {
    id: 'leo', name: 'Léo', avatar: 'avatar_2', age: 6, school: 'CP',
    lastActive: { fr: 'aujourd\'hui, 18 h', en: 'today, 6pm' }, playedToday: true,
    todaySessions: 1, todayMin: 12,
    pips: { numbers: true, words: true, keyboard: false, code: false, translation: false },
    levels: { numbers: 3, words: 4 },
    weekMin: 70, lastWeekMin: 64, weekSessions: 6, sessionsSpark: [1, 0, 1, 1, 0, 1, 2],
    adherence: 0.64, streak: 2, longestStreak: 4, healthy: false,
    objectives: ['reading', 'writing'],
  },
  {
    id: 'rumi', name: 'Rumi', avatar: 'avatar_1', age: 7, school: 'CE1',
    lastActive: { fr: 'hier', en: 'yesterday' }, playedToday: false,
    todaySessions: 0, todayMin: 0,
    pips: { numbers: false, words: false, keyboard: false, code: false, translation: false },
    levels: { numbers: 4, words: 3, keyboard: 2 },
    weekMin: 95, lastWeekMin: 110, weekSessions: 8, sessionsSpark: [2, 1, 1, 2, 0, 1, 1],
    adherence: 0.71, streak: 0, longestStreak: 7, healthy: true,
    objectives: ['math_basics', 'english'],
  },
];
const kidById = (id) => KIDS.find(k => k.id === id);

// Classification queue (oldest first). language = kid's session language.
const QUEUE = [
  { id: 's1', kid: 'ana', module: 'numbers', level: 6, lesson: 2, date: { fr: '29 mai', en: 'May 29' }, time: '17 h 42', durationMin: 11, lang: 'fr' },
  { id: 's2', kid: 'leo', module: 'words', level: 4, lesson: 1, date: { fr: '29 mai', en: 'May 29' }, time: '18 h 03', durationMin: 9, lang: 'fr' },
  { id: 's3', kid: 'ana', module: 'code', level: 3, lesson: 3, date: { fr: '29 mai', en: 'May 29' }, time: '17 h 10', durationMin: 14, lang: 'en' },
  { id: 's4', kid: 'rumi', module: 'numbers', level: 4, lesson: 2, date: { fr: '28 mai', en: 'May 28' }, time: '16 h 25', durationMin: 8, lang: 'fr' },
];

// Parent → Kid messages (newest first). status: unread | read | deleted_by_sender.
// `unread` count (by the kid) drives the (M) nav badge.
let MESSAGES = [
  { id: 'm1', kid: 'ana', from: 'me', text: 'Bravo pour ton niveau 6 en Nombres, ma puce ! On est très fiers de toi. 💛', status: 'unread', created: { fr: 'il y a 10 min', en: '10 min ago' } },
  { id: 'm2', kid: 'leo', from: 'me', text: 'Coucou Léo ! Encore une petite leçon de Mots avant le dîner ?', status: 'unread', created: { fr: 'il y a 1 h', en: '1h ago' } },
  { id: 'm3', kid: 'ana', from: 'marc', text: 'Tu peux essayer le module Code ce soir si tu veux, Papa regardera avec toi.', status: 'read', created: { fr: 'hier, 17 h', en: 'yesterday, 5pm' }, readAt: { fr: 'lu il y a 18 h', en: 'read 18h ago' } },
  { id: 'm4', kid: 'rumi', from: 'me', text: 'On se retrouve pour une session demain ? Bonne nuit mon grand. 💛', status: 'read', created: { fr: 'hier, 20 h', en: 'yesterday, 8pm' }, readAt: { fr: 'lu il y a 14 h', en: 'read 14h ago' } },
  { id: 'm5', kid: 'leo', from: 'me', text: 'Tu as super bien travaillé aujourd\'hui !', status: 'deleted_by_sender', created: { fr: 'il y a 2 j', en: '2 days ago' } },
];
const msgUnreadCount = () => MESSAGES.filter(m => m.status === 'unread').length;
const AGG = {
  weekMin: 307, lastWeekMin: 274,           // 5h07 vs 4h34, +12%
  weekSessions: 25, sessionsSpark: [5, 2, 5, 1, 4, 3, 5],
  adherence: 0.73, lastAdherence: 0.69,
  healthy: false,                            // Léo had a long session
};

// Narrative card (Phase 2) — top priority rule fired today
const NARRATIVE = {
  fr: ['**Ana**', ' a atteint le niveau 6 en Nombres aujourd\'hui 🎉'],
  en: ['**Ana**', ' reached level 6 in Numbers today 🎉'],
  kid: 'ana',
};

// Family activity feed (cross-kid + cross-parent)
const ACTIVITY = [
  { id: 'a1', type: 'parent', actor: 'me', kid: 'ana', action: 'classified', count: 3, time: { fr: 'aujourd\'hui, 8 h', en: 'today, 8am' } },
  { id: 'a2', type: 'kid', kid: 'ana', module: 'numbers', detail: { fr: 'a terminé Nombres niveau 5', en: 'finished Numbers level 5' }, time: { fr: 'il y a 2 h', en: '2h ago' } },
  { id: 'a3', type: 'kid', kid: 'leo', module: 'words', detail: { fr: 'a commencé une session de Mots', en: 'started a Words session' }, time: { fr: 'aujourd\'hui, 18 h', en: 'today, 6pm' } },
  { id: 'a4', type: 'parent', actor: 'marc', kid: 'ana', action: 'feedback', module: 'code', time: { fr: 'hier', en: 'yesterday' } },
  { id: 'a5', type: 'kid', kid: 'rumi', module: 'keyboard', detail: { fr: 'a atteint le niveau 2 au Clavier', en: 'reached Keyboard level 2' }, time: { fr: 'hier', en: 'yesterday' } },
  { id: 'a6', type: 'parent', actor: 'me', kid: 'rumi', action: 'device', time: { fr: 'il y a 2 j', en: '2 days ago' } },
];

// Session detail (H2) — question-by-question, in the kid's session language
const SESSION_DETAIL = {
  kid: 'ana', module: 'numbers', level: 6, lesson: 2, date: { fr: '29 mai 2026', en: 'May 29, 2026' },
  time: '17 h 42', durationMin: 11, device: { fr: 'Ordi familial', en: 'Home computer' }, lang: 'fr',
  correct: 6, total: 7,
  questions: [
    { q: '27 + 18', a: '45', ok: true, sec: 9, hint: false },
    { q: '46 − 19', a: '27', ok: true, sec: 14, hint: true },
    { q: '38 + 27', a: '65', ok: true, sec: 11, hint: false },
    { q: '52 − 17', a: '34', ok: false, sec: 22, hint: true },
    { q: '29 + 36', a: '65', ok: true, sec: 8, hint: false },
    { q: '64 − 28', a: '36', ok: true, sec: 16, hint: false },
    { q: '45 + 29', a: '74', ok: true, sec: 10, hint: false },
  ],
};

// Per-kid activity sessions (Activity tab)
const KID_SESSIONS = [
  { id: 'ks1', module: 'numbers', level: 6, lesson: 2, time: { fr: 'auj. 17 h 42', en: 'today 5:42pm' }, durationMin: 11, correct: 86, status: 'self', lang: 'fr' },
  { id: 'ks2', module: 'code', level: 3, lesson: 3, time: { fr: 'auj. 17 h 10', en: 'today 5:10pm' }, durationMin: 14, correct: 73, status: 'unclassified', lang: 'en' },
  { id: 'ks3', module: 'words', level: 4, lesson: 4, time: { fr: 'hier 19 h 05', en: 'yest. 7:05pm' }, durationMin: 10, correct: 90, status: 'self', lang: 'fr' },
  { id: 'ks4', module: 'numbers', level: 5, lesson: 4, time: { fr: 'hier 16 h 30', en: 'yest. 4:30pm' }, durationMin: 13, correct: 95, status: 'prompted', lang: 'fr' },
  { id: 'ks5', module: 'translation', level: 2, lesson: 1, time: { fr: '27 mai 18 h', en: 'May 27 6pm' }, durationMin: 7, correct: 64, status: 'self', lang: 'en' },
];

// Per-module performance (Phase 2) — keyed by module, shown for touched modules
const PERFORMANCE = {
  numbers: { sessions: 24, totalMin: 268, level: 6, metrics: [
    { label: { fr: 'Précision', en: 'Accuracy' }, value: '88%' },
    { label: { fr: 'Temps / question', en: 'Time / question' }, value: '11s' },
    { label: { fr: 'Indices utilisés', en: 'Hint usage' }, value: '14%' },
    { label: { fr: 'Add. vs soustr.', en: 'Add vs subtract' }, value: '92 / 81%' },
  ]},
  words: { sessions: 16, totalMin: 154, level: 4, metrics: [
    { label: { fr: 'Compréhension', en: 'Comprehension' }, value: '79%' },
    { label: { fr: 'Vocabulaire maîtrisé', en: 'Vocab mastered' }, value: '64 mots' },
    { label: { fr: 'Image → mot', en: 'Picture → word' }, value: '91%' },
    { label: { fr: 'Construis la phrase', en: 'Build sentence' }, value: '72%' },
  ]},
  code: { sessions: 9, totalMin: 112, level: 3, metrics: [
    { label: { fr: 'Exécutions réussies', en: 'Successful runs' }, value: '41 / 58' },
    { label: { fr: 'Longueur de séquence', en: 'Avg sequence' }, value: '6 blocs' },
    { label: { fr: '1ère réussite / niveau', en: 'Time to 1st run' }, value: '2 min' },
    { label: { fr: 'Blocs complexes', en: 'Complex blocks' }, value: '28%' },
  ]},
  translation: { sessions: 4, totalMin: 38, level: 2, metrics: [
    { label: { fr: 'FR → EN', en: 'FR → EN' }, value: '74%' },
    { label: { fr: 'EN → FR', en: 'EN → FR' }, value: '61%' },
    { label: { fr: 'Audio écouté', en: 'Audio played' }, value: '82%' },
    { label: { fr: 'Niveau atteint', en: 'Level reached' }, value: 'N2' },
  ]},
};

// Strengths & weaknesses (Phase 2)
const STRENGTHS = [
  { module: 'numbers', pct: 88, strong: { fr: 'Additions avec retenue', en: 'Addition with carry' }, weak: { fr: 'Soustractions avec emprunt', en: 'Subtraction with borrow' } },
  { module: 'words', pct: 79, strong: { fr: 'Image vers mot', en: 'Picture to word' }, weak: { fr: 'Construire la phrase', en: 'Building sentences' } },
  { module: 'code', pct: 73, strong: { fr: 'Séquences simples', en: 'Simple sequences' }, weak: { fr: 'Boucles', en: 'Loops' } },
];

// When-they-play heatmap (Phase 2): 7 rows × 12 two-hour buckets, 0..3 intensity
const HEATMAP = [
  [0,0,0,0,0,0,0,1,0,2,1,0],
  [0,0,0,0,0,0,1,2,1,3,2,0],
  [0,0,0,0,0,0,0,1,0,2,1,0],
  [0,0,0,0,0,0,1,1,0,2,2,0],
  [0,0,0,0,0,0,0,2,1,3,2,1],
  [0,0,0,0,0,1,2,3,3,2,1,0],
  [0,0,0,0,0,1,1,2,2,1,1,0],
];

// Feedback history
const FEEDBACK = [
  { id: 'f1', kid: 'ana', target: { fr: 'Nombres · N5', en: 'Numbers · L5' }, scope: 'level', rating: 5, comment: { fr: 'Ana adore les additions maintenant !', en: 'Ana loves addition now!' }, status: 'replied', date: { fr: '28 mai', en: 'May 28' }, actor: 'me' },
  { id: 'f2', kid: 'leo', target: { fr: 'Mots · N2 · construis', en: 'Words · L2 · build' }, scope: 'lesson', rating: 2, comment: { fr: 'Un peu difficile pour lui.', en: 'A bit hard for him.' }, status: 'triaged', date: { fr: '27 mai', en: 'May 27' }, actor: 'me' },
  { id: 'f3', kid: 'ana', target: { fr: 'Code · N2', en: 'Code · L2' }, scope: 'level', rating: 4, comment: { fr: 'Très bien mais les boucles arrivent vite.', en: 'Great but loops come fast.' }, status: 'new', date: { fr: '26 mai', en: 'May 26' }, actor: 'marc' },
];

// Paired devices
const DEVICES = [
  { id: 'd1', label: { fr: 'Ordi familial', en: 'Home computer' }, ua: 'Chrome · macOS', paired: { fr: '12 mars 2026', en: 'Mar 12, 2026' }, last: { fr: 'il y a 30 min', en: '30 min ago' }, icon: 'laptop', by: 'me' },
  { id: 'd2', label: { fr: 'Tablette du salon', en: 'Living-room tablet' }, ua: 'Safari · iPadOS', paired: { fr: '2 avr. 2026', en: 'Apr 2, 2026' }, last: { fr: 'hier', en: 'yesterday' }, icon: 'tablet', by: 'marc' },
];

// Pending co-parent invites
const PENDING_INVITES = [
  { id: 'inv1', email: 'mamie.kouassi@gmail.com', sent: { fr: 'il y a 2 j', en: '2 days ago' }, status: 'pending' },
];

const OBJECTIVES = [
  { id: 'math_basics', label: { fr: 'Bases en maths', en: 'Math basics' } },
  { id: 'reading', label: { fr: 'Lecture', en: 'Reading' } },
  { id: 'writing', label: { fr: 'Écriture', en: 'Writing' } },
  { id: 'english', label: { fr: 'Anglais', en: 'English' } },
  { id: 'logic_coding', label: { fr: 'Logique / code', en: 'Logic / coding' } },
];

// Bilingual UI copy
const C = {
  greeting: { fr: 'Bonjour', en: 'Hello' },
  classifyNow: { fr: 'Classer maintenant', en: 'Classify now' },
  // home
  needInput: (n) => ({ fr: `${n} sessions ont besoin de vous`, en: `${n} sessions need your input` }),
  needSub: { fr: 'Dites-nous si votre enfant a demandé à jouer ou si vous l\'avez proposé.', en: 'Tell us if your kid asked to play or if you suggested it.' },
  allCaught: { fr: 'Tout est à jour 👍', en: 'All caught up 👍' },
  allCaughtSub: { fr: 'Nous vous écrirons dès qu\'il y aura du nouveau.', en: 'We\'ll email you when there\'s something new.' },
  // empty queue — curious, not celebratory (could mean no play OR no sync)
  noNewEyebrow: { fr: 'Rien à classer', en: 'Nothing to classify' },
  noNewTitle: { fr: 'Pas de nouvelle activité', en: 'No new activity' },
  noNewSub: { fr: 'Tout ce qui a été joué est déjà classé. Si vos enfants ont joué depuis, l\'appareil familial ne s\'est peut-être pas synchronisé.', en: 'Everything played is already classified. If your kids have played since, the family device may not have synced.' },
  lastSync: (t) => ({ fr: `Dernière synchro ${t}`, en: `Last synced ${t}` }),
  checkDevice: { fr: 'Vérifier l\'appareil familial', en: 'Check the family device' },
  howSync: { fr: 'Comment fonctionne la synchro ?', en: 'How syncing works' },
  offlineClassify: (n) => ({ fr: `Synchronisation impossible. ${n} sessions vues à classer.`, en: `Can't sync right now. Last seen ${n} sessions to classify.` }),
  kidsPulse: { fr: 'Vos enfants aujourd\'hui', en: 'Your kids today' },
  thisWeek: { fr: 'Cette semaine', en: 'This week' },
  didntPlay: { fr: 'n\'a pas joué aujourd\'hui', en: 'didn\'t play today' },
  sessionsMin: (s, m) => ({ fr: `${s} sessions · ${m} min`, en: `${s} sessions · ${m} min` }),
  weekTime: { fr: 'Temps cette semaine', en: 'Time this week' },
  weekSessions: { fr: 'Sessions cette semaine', en: 'Sessions this week' },
  adherence: { fr: 'Auto-initiées', en: 'Self-initiated' },
  healthyUse: { fr: 'Usage sain', en: 'Healthy use' },
  healthyOk: { fr: 'Toutes les sessions sont dans les bonnes durées', en: 'All sessions within healthy bands' },
  healthyWarn: { fr: 'Quelques sessions longues cette semaine', en: 'Some long sessions this week' },
  vsLastWeek: { fr: 'vs semaine dernière', en: 'vs last week' },
  // classify
  classifyTitle: { fr: 'Classement des sessions', en: 'Classify sessions' },
  classifyQ: (name) => ({ fr: [`Est-ce que `, name, ` a demandé à jouer, ou est-ce vous qui l'avez proposé ?`], en: [`Did `, name, ` ask to play, or did you suggest it?`] }),
  theyAsked: { fr: 'Il/elle a demandé', en: 'They asked' },
  theyAskedSub: { fr: 'Auto-initié', en: 'Self-initiated' },
  iSuggested: { fr: 'Je l\'ai proposé', en: 'I suggested' },
  iSuggestedSub: { fr: 'Proposé par le parent', en: 'Parent-prompted' },
  notSure: { fr: 'Pas sûr·e', en: 'Not sure' },
  notSureSub: { fr: 'Retiré de la file', en: 'Removed from queue' },
  skipForNow: { fr: 'Passer pour l\'instant', en: 'Skip for now' },
  whyAsk: { fr: 'Pourquoi on demande', en: 'Why we ask' },
  sessionOn: (d, t, mod, lv, ls, min) => ({ fr: `Session du ${d} à ${t} · ${mod} N${lv} leçon ${ls} · ${min} min`, en: `${d} at ${t} · ${mod} L${lv} lesson ${ls} · ${min} min` }),
  // classify — reframed (§2): parent-centric "stay close", not "single signal"
  classifyDone: { fr: 'Tout est classé !', en: 'All classified!' },
  classifyDoneSub: { fr: 'Merci d\'avoir pris ce moment avec eux aujourd\'hui.', en: 'Thanks for taking this moment with them today.' },
  backHome: { fr: 'Retour à l\'accueil', en: 'Back to home' },
  // messages (§1)
  msg: {
    nav: { fr: 'Messages', en: 'Messages' },
    title: { fr: 'Messages', en: 'Messages' },
    sub: { fr: 'Un petit mot à vos enfants, lu entre deux leçons.', en: 'A quick word to your kids, read between two lessons.' },
    newMsg: { fr: 'Nouveau message', en: 'New message' },
    all: { fr: 'Tous', en: 'All' },
    empty: { fr: 'Aucun message pour l\'instant. Écris-leur un mot !', en: 'No messages yet. Write them a word!' },
    emptyKid: (n) => ({ fr: `Aucun message pour ${n} pour l'instant.`, en: `No messages for ${n} yet.` }),
    unread: { fr: 'Non lu', en: 'Unread' },
    read: { fr: 'Lu', en: 'Read' },
    readAt: (t) => ({ fr: t, en: t }),
    deleted: { fr: 'Retiré', en: 'Withdrawn' },
    to: { fr: 'À', en: 'To' },
    from: { fr: 'De', en: 'From' },
    sent: { fr: 'Envoyé', en: 'Sent' },
    compose: { fr: 'Écrire un message', en: 'Write a message' },
    pickKid: { fr: 'À qui ?', en: 'To whom?' },
    placeholder: (n) => ({ fr: `Écris un mot à ${n}…`, en: `Write a word to ${n}…` }),
    signed: (who) => ({ fr: `Signé ${who}`, en: `Signed ${who}` }),
    changeSign: { fr: 'Changer ?', en: 'Change?' },
    send: { fr: 'Envoyer', en: 'Send' },
    sentToast: { fr: 'Envoyé', en: 'Sent' },
    deleteMsg: { fr: 'Retirer le message', en: 'Withdraw message' },
    deleteQ: (n) => ({ fr: `Le message n'a pas encore été lu par ${n}. Le retirer ?`, en: `${n} hasn't read this yet. Withdraw it?` }),
    keep: { fr: 'Garder', en: 'Keep' },
    confirmDelete: { fr: 'Retirer', en: 'Withdraw' },
    leaveWordTitle: { fr: 'Et si tu lui laissais un mot ?', en: 'Want to leave them a word?' },
    leaveWordSub: { fr: 'Ils le verront à leur prochaine session.', en: 'They\'ll see it at their next session.' },
    yes: { fr: 'Oui', en: 'Yes' },
    later: { fr: 'Plus tard', en: 'Later' },
    leaveMessage: { fr: 'Laisser un message', en: 'Leave a message' },
  },
  // kids
  yourKids: { fr: 'Vos enfants', en: 'Your kids' },
  addKid: { fr: 'Ajouter un enfant', en: 'Add a kid' },
  kidLimit: { fr: 'Limite de 3 enfants atteinte', en: '3-kid limit reached' },
  recentActivity: { fr: 'Activité récente de la famille', en: 'Recent family activity' },
  lastActive: { fr: 'Actif', en: 'Active' },
  // tabs
  tabs: { overview: { fr: 'Aperçu', en: 'Overview' }, activity: { fr: 'Activité', en: 'Activity' }, performance: { fr: 'Performance', en: 'Performance' }, strengths: { fr: 'Forces & faiblesses', en: 'Strengths & weaknesses' }, feedback: { fr: 'Retours', en: 'Feedback' } },
  // settings
  settings: { fr: 'Réglages', en: 'Settings' },
  profile: { fr: 'Profil', en: 'Profile' },
  password: { fr: 'Mot de passe', en: 'Password' },
  family: { fr: 'Famille', en: 'Family' },
  devices: { fr: 'Appareils', en: 'Paired devices' },
  notifications: { fr: 'Notifications', en: 'Notifications' },
  myFeedback: { fr: 'Mes retours', en: 'My feedback' },
  deleteAccount: { fr: 'Supprimer le compte', en: 'Delete account' },
  save: { fr: 'Enregistrer', en: 'Save' },
  cancel: { fr: 'Annuler', en: 'Cancel' },
  // generic
  rateThis: { fr: 'Noter', en: 'Rate this' },
};

Object.assign(window, {
  MODULES, MOD, PARENT, COPARENT, parentById, KIDS, kidById, QUEUE, MESSAGES, msgUnreadCount, AGG, NARRATIVE, ACTIVITY,
  SESSION_DETAIL, KID_SESSIONS, PERFORMANCE, STRENGTHS, HEATMAP, FEEDBACK, DEVICES,
  PENDING_INVITES, OBJECTIVES, C,
});
