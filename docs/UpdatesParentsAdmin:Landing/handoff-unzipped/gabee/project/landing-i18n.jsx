// landing-i18n.jsx — all landing copy, FR + EN. Source: gabee-landing-spec §3.
// Final wording is a copywriter decision; this is the spec's sample copy.

const L = {
  fr: {
    locale: 'fr',
    nav: { how: 'Comment ça marche', free: 'Gratuit', faq: 'FAQ', contact: 'Contact', signin: 'Se connecter', signup: 'Créer un compte', menu: 'Menu' },
    hero: {
      h: ['Garder l’esprit vif.', 'Construire les compétences qui comptent.'],
      sub: 'Gabee est un outil d’apprentissage pour les enfants de 6 à 10 ans : vocabulaire, calcul, logique du code, frappe au clavier — en français et en anglais.',
      cta: 'Créer un compte gratuit', cta2: 'Comment ça marche',
      reassure: 'Gratuit, jusqu’à 3 enfants.',
    },
    modules: {
      h: 'Cinq compétences. Une seule abeille.',
      below: 'Votre enfant renforce ses compétences dans les deux langues.',
      cards: [
        { kind: 'numbers', title: 'Les nombres', desc: 'Compter, additionner, soustraire.' },
        { kind: 'words', title: 'Les mots', desc: 'Vocabulaire, lecture, phrases.' },
        { kind: 'keyboard', title: 'Le clavier', desc: 'Apprendre à taper, doucement.' },
        { kind: 'code', title: 'Le code', desc: 'Premiers pas de programmation.' },
        { kind: 'translation', title: 'La traduction', desc: 'Passer du français à l’anglais et retour.' },
      ],
    },
    how: {
      h: 'En quatre étapes.',
      steps: [
        { exp: 'idle', title: 'Créez votre compte et ajoutez vos enfants', body: 'Créez votre compte. Ajoutez vos enfants — prénom, âge, ce que vous aimeriez qu’ils travaillent.' },
        { exp: 'encourage', title: 'Installez Gabee une fois sur l’appareil de la maison', body: 'Installez Gabee une fois sur l’ordinateur ou la tablette de la maison. Ensuite, vos enfants l’ouvrent, choisissent leur profil, et jouent. Pas de mot de passe pour eux.' },
        { exp: 'correct', title: 'Restez proche de leur journée', body: 'Chaque jour, un petit email vous dit ce que vos enfants ont fait. Vous restez proches de leur apprentissage, deux minutes à la fois.' },
        { exp: 'celebrate', title: 'Laissez-leur un petit mot', body: 'Un petit mot, à tout moment. À leur prochaine session, votre enfant verra : « Papa t’a laissé un mot. » Ils le lisent, et ça les motive.' },
      ],
    },
    values: {
      h: 'Quatre choses qui comptent.',
      props: [
        { icon: 'skills', title: 'Des compétences pour aujourd’hui et demain', body: 'Vocabulaire et calcul, mais aussi premières bases de codage et frappe au clavier. Votre enfant construit les compétences fondamentales qui lui seront utiles pour naviguer le monde moderne.' },
        { icon: 'bilingual', title: 'Bilingue, à leur rythme', body: 'À chaque session, votre enfant choisit sa langue. En français ou en anglais, il apprend réellement dans les deux.' },
        { icon: 'visibility', title: 'Vous voyez ce qui se passe', body: 'Quel module il préfère, où il progresse, où il bloque, combien de temps il joue — et dans quelle langue. Pas de badges qui le félicitent pour rien : de vraies informations pour vous.' },
        { icon: 'respect', title: 'Conçu avec respect', body: 'Sessions de durée raisonnable, aucune publicité, aucun achat dans l’app. Le temps que votre enfant passe ici sert son apprentissage.' },
      ],
    },
    pricing: {
      h: 'Gratuit pour les familles.',
      price: '0 FCFA', sub: 'jusqu’à 3 enfants',
      note: { text: 'Plus de 3 enfants à la maison ?', link: 'Écrivez-nous.' },
      cta: 'Créer un compte gratuit',
    },
    faq: {
      h: 'Questions courantes.',
      items: [
        { q: 'À quel âge ça s’adresse ?', a: '6-10 ans typiquement. La progression s’adapte au niveau de l’enfant.' },
        { q: 'Français ou anglais ?', a: 'Les deux. Votre enfant choisit sa langue au début de chaque session.' },
        { q: 'Ça marche hors-ligne ?', a: 'Oui, l’app enfant fonctionne entièrement hors-ligne. Les données se synchronisent quand la connexion revient.' },
        { q: 'Et le temps d’écran ?', a: 'Gabee a des limites de session intégrées et un suivi du temps dans le tableau de bord parent.' },
        { q: 'Comment je supprime mes données ?', a: 'Un bouton dans Réglages → Supprimer le compte. On supprime tout sous 30 jours.' },
        { q: 'Est-ce que ça restera gratuit ?', a: 'Aujourd’hui, Gabee est gratuit. On sera transparent si jamais quelque chose change.' },
        { q: 'Plusieurs parents pour les mêmes enfants ?', a: 'Oui : invitez l’autre parent par email depuis vos réglages.' },
        { q: 'Qui voit les données de mon enfant ?', a: 'Vous (et le co-parent si invité). Personne d’autre — pas de publicitaires, pas de tiers.' },
      ],
    },
    contact: {
      h: 'Une question ? Écrivez-nous.',
      iam: 'Je suis', iamOpts: ['parent', 'éducateur', 'journaliste', 'partenaire', 'autre'],
      name: 'Nom', email: 'Email', subject: 'Sujet', subjectOpt: '(facultatif)', message: 'Message',
      submit: 'Envoyer', sending: 'Envoi…',
      ackTitle: 'Merci !', ackBody: 'On revient vers vous d’ici quelques jours.',
      errMin: 'Votre message doit faire au moins 10 caractères.', errEmail: 'Entrez un email valide.',
      again: 'Envoyer un autre message',
    },
    footer: {
      product: 'Produit', legal: 'Légal', about: 'À propos', help: 'Aide', faqLink: 'FAQ', contactLink: 'Contact',
      productLinks: ['Comment ça marche', 'Créer un compte'],
      legalLinks: ['Conditions', 'Confidentialité'],
      aboutLine: 'Gabee est conçu par Proxia Labs.',
      tagline: 'Votre enfant apprend les compétences qui comptent, en s’amusant.',
      copy: '© Proxia Labs 2026',
    },
  },

  en: {
    locale: 'en',
    nav: { how: 'How it works', free: 'Free', faq: 'FAQ', contact: 'Contact', signin: 'Sign in', signup: 'Sign up free', menu: 'Menu' },
    hero: {
      h: ['A sharp mind.', 'The skills that matter.'],
      sub: 'Gabee is a learning tool for 6-10 year-olds: vocabulary, math, coding logic, keyboard typing — in French and English.',
      cta: 'Sign up free', cta2: 'How it works',
      reassure: 'Free, up to 3 children.',
    },
    modules: {
      h: 'Five skills. One bee.',
      below: 'Your child strengthens their skills in both languages.',
      cards: [
        { kind: 'numbers', title: 'Numbers', desc: 'Counting, adding, subtracting.' },
        { kind: 'words', title: 'Words', desc: 'Vocabulary, reading, sentences.' },
        { kind: 'keyboard', title: 'Keyboard', desc: 'Learning to type, gently.' },
        { kind: 'code', title: 'Code', desc: 'First steps in coding.' },
        { kind: 'translation', title: 'Translation', desc: 'Moving between French and English.' },
      ],
    },
    how: {
      h: 'Four steps.',
      steps: [
        { exp: 'idle', title: 'Sign up & add your kids', body: 'Create your account. Add your kids — first name, age, what you’d like them to focus on.' },
        { exp: 'encourage', title: 'Set up Gabee on the family device, once', body: 'Set up Gabee once on the home computer or tablet. After that, your kids open it, pick their profile, and play. No password for them.' },
        { exp: 'correct', title: 'Stay close to their day', body: 'Each day, a short email tells you what your kids have been doing. You stay close to their learning, two minutes at a time.' },
        { exp: 'celebrate', title: 'Leave them a word', body: 'A short message, anytime. At their next session, your child will see: “Papa left you a note.” They read it, and it makes their day.' },
      ],
    },
    values: {
      h: 'Four things that matter.',
      props: [
        { icon: 'skills', title: 'Skills for today and tomorrow', body: 'Vocabulary and math, but also first steps in coding and keyboard typing. Your child builds the foundational skills that will help them navigate the modern world.' },
        { icon: 'bilingual', title: 'Truly bilingual, at their own pace', body: 'At each session, your child picks their language. In French or English, they actually learn in both.' },
        { icon: 'visibility', title: 'You see what’s happening', body: 'Which module they prefer, where they progress, where they get stuck, how long they play — and in which language. No badges cheering them for nothing: real information for you.' },
        { icon: 'respect', title: 'Designed with respect', body: 'Sensible session lengths, no ads, no in-app purchases. The time your child spends here serves their learning.' },
      ],
    },
    pricing: {
      h: 'Free for families.',
      price: '0 FCFA', sub: 'up to 3 children',
      note: { text: 'More than 3 kids at home?', link: 'Get in touch.' },
      cta: 'Sign up free',
    },
    faq: {
      h: 'Common questions.',
      items: [
        { q: 'What ages is it for?', a: 'Typically 6-10 years old. The progression adapts to the child’s level.' },
        { q: 'French or English?', a: 'Both. Your child picks the language at the start of each session.' },
        { q: 'Does it work offline?', a: 'Yes, the kid app works entirely offline. Data syncs when the connection comes back.' },
        { q: 'What about screen time?', a: 'Gabee has built-in session caps and time tracking in the parent dashboard.' },
        { q: 'How do I delete my data?', a: 'One button in Settings → Delete account. Everything is wiped within 30 days.' },
        { q: 'Will it stay free?', a: 'Today, Gabee is free. We’ll be transparent if anything ever changes.' },
        { q: 'Two parents sharing kids?', a: 'Yes — invite the other parent by email from your settings.' },
        { q: 'Who sees my child’s data?', a: 'You (and your co-parent if invited). Nobody else — no advertisers, no third parties.' },
      ],
    },
    contact: {
      h: 'A question? Write to us.',
      iam: 'I am', iamOpts: ['parent', 'educator', 'journalist', 'partner', 'other'],
      name: 'Name', email: 'Email', subject: 'Subject', subjectOpt: '(optional)', message: 'Message',
      submit: 'Send', sending: 'Sending…',
      ackTitle: 'Thanks!', ackBody: 'We’ll get back to you within a few days.',
      errMin: 'Your message must be at least 10 characters.', errEmail: 'Enter a valid email.',
      again: 'Send another message',
    },
    footer: {
      product: 'Product', legal: 'Legal', about: 'About', help: 'Help', faqLink: 'FAQ', contactLink: 'Contact',
      productLinks: ['How it works', 'Sign up'],
      legalLinks: ['Terms', 'Privacy'],
      aboutLine: 'Gabee is crafted by Proxia Labs.',
      tagline: 'Your child learns the skills that matter — while having fun.',
      copy: '© Proxia Labs 2026',
    },
  },
};

const MODULE_COLORS = {
  numbers: '#1F6FEB', words: '#D6336C', keyboard: '#C99A0E', code: '#7B2FF7', translation: '#C75D28',
};

Object.assign(window, { LANDING_COPY: L, MODULE_COLORS });
