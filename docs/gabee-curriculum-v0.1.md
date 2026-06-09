# Gabee — Curriculum v0.1

**Ancrage difficulté :** SIL → CE2 (plancher = enfant qui lit déjà ; plafond = CE2).
**Progression :** chaque sous-module rampe du trivial vers le coriace sur 10 niveaux. Ci-dessous, les **5 premiers** (≈ SIL → CP/CE1).
**Definition of success (DoS) :** réussite sur une session de 7 questions piochées dans un pool ≥ 20, sauf mention contraire.
**Runtime (leçons, sélection, dédup) :** voir [`gabee-session-runtime-v0.1.md`](gabee-session-runtime-v0.1.md) — chaque niveau est joué en 3 leçons + 1 révision synthétisées côté app à partir du pool du niveau.

---

## Registre des sous-modules — clés `sub_mode` (source de vérité doc → DB)

*La colonne DB `sub_mode` prend une **clé courte**. Le doc fige ces clés ; l'implémentation s'aligne dessus. `default` est réservé à un module sans sous-module nommé (aucun aujourd'hui).*

| Module | Sous-module (doc) | Clé `sub_mode` | `type` par défaut |
|--------|-------------------|----------------|-------------------|
| numbers | Nombres & comptage | `counting` | mcq-number |
| numbers | Opérations | `operations` | mcq-number |
| numbers | Comparer & ordonner | `comparison` | mcq-number |
| numbers | Problèmes du quotidien | `word-problems` | mcq-number |
| words | Image → mot | `picture` | mcq-image |
| words | Texte à trou | `fill-blank` | mcq-word |
| words | Construis la phrase | `build-sentence` | build-sentence |
| words | Lis & réponds | `read-answer` | read-answer |
| keyboard | Recopie | `copy` | typing |
| keyboard | Vitesse | `speed` | typing |
| code | Parcours | `maze` | code-grid |
| code | Tracé | `draw` | code-grid |
| code | Actions | `actions` | code-grid |
| translation | FR → EN | `fr-en` | translation |
| translation | EN → FR | `en-fr` | translation |

---

## Module 1 — Numbers (fondations maths)

*4 sous-modules (strands parallèles : un enfant peut attaquer Opérations sans avoir fini Comptage).*

### 1.1 Nombres & comptage
**Objectif du sous-module :** reconnaître, dénombrer et ordonner les quantités ; construire le sens du nombre et la valeur de position.

| Niv. | Objectif pédagogique | Definition of success |
|------|----------------------|------------------------|
| L1 | Associer un chiffre à une quantité jusqu'à 5 | Compte une collection ≤ 5 objets et choisit le bon chiffre → 6/7 |
| L2 | Dénombrer et lire les nombres jusqu'à 10 | Associe quantité ↔ chiffre dans les deux sens, 1–10 → 6/7 |
| L3 | Compter jusqu'à 20, notion de dizaine | Compte ≤ 20 et identifie « 1 dizaine et n unités » → 6/7 |
| L4 | Compter jusqu'à 100 par 1 et par 10 | Complète une suite de 10 en 10, lit un nombre à 2 chiffres → 6/7 |
| L5 | Pairs/impairs, compter par 2 et par 5 | Identifie pair/impair ≤ 20, complète une suite +2 / +5 → 6/7 |

### 1.2 Opérations
**Objectif du sous-module :** additionner et soustraire, d'abord avec appui visuel puis mentalement ; comprendre + et − comme opérations inverses (multiplication simple en haut des niveaux).

| Niv. | Objectif pédagogique | Definition of success |
|------|----------------------|------------------------|
| L1 | Additionner deux petits nombres, sommes ≤ 5 | Résout a + b ≤ 5 avec support d'objets → 6/7 |
| L2 | Additionner jusqu'à 10, sans support visuel | Résout a + b ≤ 10 sans objets affichés → 6/7 |
| L3 | Soustraire, minuende ≤ 10 | Résout a − b (a ≤ 10) ; relie un retrait à sa soustraction → 6/7 |
| L4 | Additionner ≤ 20 sans franchir la dizaine | Résout a + b ≤ 20 sans retenue → 6/7 |
| L5 | Soustraire ≤ 20 ; familles de nombres | Résout a − b (a ≤ 20) et complète « 7 + _ = 10 » → 6/7 |

### 1.3 Comparer & ordonner
**Objectif du sous-module :** comparer des quantités, utiliser <, >, =, ranger et encadrer des nombres, repérer des suites et motifs.

| Niv. | Objectif pédagogique | Definition of success |
|------|----------------------|------------------------|
| L1 | Plus / moins / autant, quantités ≤ 5 | Désigne la collection « plus grande / plus petite / égale » → 6/7 |
| L2 | Symboles <, >, = avec nombres ≤ 10 | Place le bon symbole entre deux nombres ≤ 10 → 6/7 |
| L3 | Ranger 3–4 nombres ≤ 20 du plus petit au plus grand | Ordonne correctement une suite de 3–4 nombres → 6/7 |
| L4 | Compléter une suite croissante / décroissante ≤ 50 | Trouve le terme manquant d'une suite +1 / +2 → 6/7 |
| L5 | Encadrer un nombre à la dizaine, ≤ 100 | « 47 est entre 40 et 50 » → choisit le bon encadrement → 6/7 |

### 1.4 Problèmes du quotidien
**Objectif du sous-module :** appliquer le calcul à des situations concrètes (objets, monnaie FCFA, temps) ; traduire un énoncé en opération.

| Niv. | Objectif pédagogique | Definition of success |
|------|----------------------|------------------------|
| L1 | Traduire un ajout en addition, ≤ 10 | Résout un mini-problème additif illustré ≤ 10 → 6/7 |
| L2 | Traduire un retrait en soustraction, ≤ 10 | Résout un mini-problème soustractif illustré ≤ 10 → 6/7 |
| L3 | La monnaie : composer une somme (pièces FCFA, ≤ 100) | Compose une somme demandée avec des pièces → 6/7 |
| L4 | Le temps : heures pleines et moments de la journée | Lit une horloge à heure pleine, range matin / midi / soir → 6/7 |
| L5 | Problèmes à deux étapes, ≤ 20 | Résout un énoncé « ajoute puis retire » ≤ 20 → 6/7 |

---

## Module 2 — Words (fondations langue)

*4 sous-modes (mécaniques distinctes, ne se mélangent pas dans une même session). Suivi **par langue** : FR et EN sont deux tracks séparés.*

### 2.1 Image → mot
**Objectif du sous-module :** associer une image au mot qui la nomme ; enrichir le vocabulaire.

| Niv. | Objectif pédagogique | Definition of success |
|------|----------------------|------------------------|
| L1 | Nommer un objet familier (image → mot) | Choisit le bon nom parmi 3–4 options → 6/7 |
| L2 | Nommer des objets de catégories variées (animaux, aliments…) | Reconnaît des mots moins courants → 6/7 |
| L3 | Choisir l'adjectif qui décrit (couleur, taille) | Associe une qualité à l'image → 6/7 |
| L4 | Choisir le verbe d'action illustré (courir, manger) | Associe une action à l'image → 6/7 |
| L5 | Lire un groupe de 2 mots (« chat noir ») | Associe l'image au groupe nominal correct → 6/7 |

### 2.2 Texte à trou
**Objectif du sous-module :** compléter une phrase avec le mot juste ; usage du mot en contexte.

| Niv. | Objectif pédagogique | Definition of success |
|------|----------------------|------------------------|
| L1 | Compléter par le **nom** manquant (appui image) | Choisit le bon nom dans la phrase → 6/7 |
| L2 | Compléter par le **verbe** manquant | Choisit le bon verbe → 6/7 |
| L3 | Compléter par le **complément** manquant | Choisit le bon complément → 6/7 |
| L4 | Compléter par l'**adjectif** manquant | Choisit le bon adjectif → 6/7 |
| L5 | Compléter par un **mot-outil** (article, préposition) | Choisit le bon petit mot → 6/7 |

### 2.3 Construis la phrase
**Objectif du sous-module :** ordonner des mots mélangés ; syntaxe et structure de la phrase.

| Niv. | Objectif pédagogique | Definition of success |
|------|----------------------|------------------------|
| L1 | Ordonner **3 mots** en phrase correcte | Reconstitue la phrase → 6/7 |
| L2 | Ordonner **4 mots** | Reconstitue la phrase → 6/7 |
| L3 | Ordonner **5 mots** | Reconstitue la phrase → 6/7 |
| L4 | Ordonner + **majuscule** en tête | Phrase ordonnée avec capitale correcte → 6/7 |
| L5 | Ordonner + **point final** | Phrase ordonnée et ponctuée → 6/7 |

### 2.4 Lis & réponds
**Objectif du sous-module :** lire un court passage et répondre ; compréhension littérale puis inférentielle.

| Niv. | Objectif pédagogique | Definition of success |
|------|----------------------|------------------------|
| L1 | 1 phrase + question littérale (qui / quoi) | Répond correctement → 6/7 |
| L2 | 2 phrases + question littérale | Répond correctement → 6/7 |
| L3 | 2–3 phrases + question littérale (où / quand) | Répond correctement → 6/7 |
| L4 | 3 phrases + question inférentielle simple (pourquoi) | Déduit la bonne réponse → 6/7 |
| L5 | Court paragraphe + inférence | Déduit la bonne réponse → 6/7 |

---

## Module 3 — Keyboard (frappe)

*2 sous-modules = les deux **modes de jeu** (axe orthogonal : précision vs fluidité). Les familles de touches et l'assemblage (lettres → chiffres → ponctuation → mots → phrases) deviennent l'**échelle de niveaux à l'intérieur de chaque mode**. Plancher SIL = recopier ce qu'on voit.*

### 3.1 Recopie (auto-rythmé — on vise le zéro faute)
**Objectif du sous-module :** localiser les touches et saisir sans erreur, sans pression de temps. DoS orientée **précision**.

| Niv. | Objectif pédagogique | Definition of success |
|------|----------------------|------------------------|
| L1 | Frapper une **lettre** affichée | Bonne touche → 6/7 |
| L2 | Frapper un **chiffre** affiché | Bonne touche → 6/7 |
| L3 | Frapper un **signe de ponctuation** (. , ? !) | Bon signe → 6/7 |
| L4 | Recopier un **mot court** (capitale + espace) | Mot sans erreur → 6/7 |
| L5 | Recopier une **petite phrase** ponctuée | ≥ 90 % de touches justes |

### 3.2 Vitesse (chronométré — le mot défile)
**Objectif du sous-module :** saisir l'élément avant qu'il ne sorte de l'écran ; fluidité et automatisation. DoS = **réussite avant la fin du défilement** (la vitesse de défilement monte avec le niveau).

| Niv. | Objectif pédagogique | Definition of success |
|------|----------------------|------------------------|
| L1 | Saisir une **lettre** qui défile (vitesse lente) | Saisie avant la fin → 6/7 |
| L2 | Saisir une **suite de lettres** qui défile | 6/7 avant la fin |
| L3 | Saisir un **mot court** qui défile | 6/7 avant la fin |
| L4 | Saisir un **mot**, défilement plus rapide | 6/7 avant la fin |
| L5 | Saisir une **petite phrase** qui défile | 6/7 avant la fin |

> **Mécanique « séquence surlignée » (zone niveaux 6–10, les deux modes) :** au lieu de saisir tout l'élément affiché, l'enfant ne tape que la portion **surlignée** et ignore le reste — ajoute de l'attention sélective sans nouveau contenu (quasi gratuit : on tague des spans dans le pool existant). Mini-échelle propre : surligné = **1 lettre** → **groupe de lettres** (bigramme / syllabe) → **un mot dans une phrase** (ciblage en contexte).

---

## Module 4 — Code (premiers pas en programmation)

*3 sous-modules = 3 **mondes** (axe orthogonal). Chaque monde rejoue la même rampe de concepts — séquences → conditions → boucles → combo → débogage — dans son univers. Blocs visuels.*

### 4.1 Parcours (atteindre l'étoile dans un labyrinthe) — `maze`
| Niv. | Objectif pédagogique | Definition of success |
|------|----------------------|------------------------|
| L1 | **Séquences** : tout droit → virage → un obstacle → plusieurs | Atteint l'étoile en ordonnant les blocs → 6/7 |
| L2 | **Conditions** : « si mur devant, alors tourne » | Résout en réagissant à l'environnement → 6/7 |
| L3 | **Boucles** : « répète N fois » un motif de déplacement | Atteint l'étoile via une boucle → 6/7 |
| L4 | **Boucles + conditions** : répéter jusqu'à une condition | Résout le parcours → 6/7 |
| L5 | **Débogage** : corriger un parcours qui rate l'étoile | Corrige le programme → 6/7 |

### 4.2 Tracé (faire dessiner Gabee) — `draw`
| Niv. | Objectif pédagogique | Definition of success |
|------|----------------------|------------------------|
| L1 | **Séquences** : enchaîner avance + tourne pour tracer une forme simple | Trace la forme cible → 6/7 |
| L2 | **Conditions** : lever / baisser le crayon selon une condition | Trace correct selon la condition → 6/7 |
| L3 | **Boucles** : « répète [avance, tourne] » pour un carré, un triangle | Trace via une boucle → 6/7 |
| L4 | **Boucles + variation** : motif répété en tournant (fleur, étoile) | Trace le motif → 6/7 |
| L5 | **Débogage** : corriger une forme ratée (angle / répétition) | Corrige le tracé → 6/7 |

### 4.3 Actions (ramasser / poser / sauter) — `actions`
| Niv. | Objectif pédagogique | Definition of success |
|------|----------------------|------------------------|
| L1 | **Séquences** : enchaîner ramasser → déplacer → poser dans l'ordre | Tâche réussie → 6/7 |
| L2 | **Conditions** : « si case occupée, alors saute » | Réagit correctement → 6/7 |
| L3 | **Boucles** : répéter une action N fois | Résout via une boucle → 6/7 |
| L4 | **Boucles + conditions** : « ramasse tant qu'il reste des objets » | Résout la tâche → 6/7 |
| L5 | **Débogage** : corriger une suite d'actions qui échoue | Corrige le programme → 6/7 |

> *Ordre conditions → boucles : c'est le tien. L'alternative classique (boucles avant conditions) tient surtout pour le monde **Tracé**, où la boucle est l'usage-vedette (carré = répète 4 fois). Si tu veux flipper l'ordre par monde, dis-le.*

---

## Module 5 — Translation (pont FR ↔ EN)

*2 sous-modules = les deux **directions**, suivies séparément. **Même progression** des deux côtés : mots / reconnaissance d'objets → groupes de mots → phrases. Le voiceover (audio) pourra se greffer sur les items à partir des niveaux où on lit une phrase.*

### 5.1 FR → EN  &  5.2 EN → FR *(progression miroir)*

| Niv. | Objectif pédagogique | Definition of success |
|------|----------------------|------------------------|
| L1 | Reconnaître un **objet courant** et choisir sa traduction (image → mot) | Choisit la bonne traduction → 6/7 |
| L2 | Traduire un **mot familier** sans image | Traduit correctement → 6/7 |
| L3 | Traduire une **petite expression** (salutation, formule) | Traduit « bonjour » → « hello », etc. → 6/7 |
| L4 | Traduire un **groupe de mots** (« un chat noir » → « a black cat ») | Traduit le groupe entier → 6/7 |
| L5 | Traduire une **phrase courte** complète | Traduit la phrase → 6/7 |

---

*Niveaux 6 → 10 de chaque sous-module : à dérouler ensuite (zone coriace — multiplication/division, 2 propositions, idiomes, frappe à l'aveugle chronométrée, boucles imbriquées…).*
