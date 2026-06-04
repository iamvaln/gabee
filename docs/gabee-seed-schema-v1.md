# Gabee — Contrat de seed v1 (structure exacte des questions)

> But : figer **la structure exacte** que doit produire le générateur de questions, pour que l'import soit direct et que les renderers kid s'alignent dessus. Les renderers seront **adaptés à ce contrat** (source de vérité = ce doc).

**Constat sur le seed actuel (1638 Q) :** le **non-code est déjà conforme** à 95 % (clés, thèmes, `config` structuré). Tu n'as quasi rien à régénérer côté non-code — il faut surtout (1) **restreindre les clés d'image au vocabulaire ci-dessous**, (2) **régénérer le module `code`** sur le modèle recommandé. Le reste, j'adapte les renderers.

---

## 0. Principes (valables pour tous les types)

1. **`prompt` = la consigne** (ce que l'enfant doit faire), JAMAIS le contenu. Ex : « Combien y a-t-il de chats ? », « Traduis ce mot en anglais. »
2. **Tout le contenu vit dans `config`** (image, phrase, passage, tokens, grille, cible…). Le renderer lit `config`, pas le prompt.
3. **Bilingue :**
   - `lang: "both"` → `prompt`, `hint`, et toute valeur textuelle = objet `{ "fr": …, "en": … }`.
   - `lang: null` → valeurs **nues** (chaîne/nombre), contenu **agnostique de langue** (ex : frappe d'une lettre, d'un chiffre).
   - ⚠️ contrainte stricte (validée à l'insert) : `lang:"both"` ⇒ prompt bilingue ; `lang:null` ⇒ prompt nu.
4. **Pool = `(module, sub_mode, level)`**, **≥ 20 questions** (DoS : session de 7 piochée dans le pool). Garde **`lesson: 1`** pour tout (les leçons 1-3 et la révision échantillonnent le pool du niveau — géré côté app).
5. **Statut** `"candidate"` ; `created_by` `"ai"` ; `ratings: []` ; `avg_rating: null`.

---

## 1. Colonnes communes (toutes les questions)

| Colonne | Type | Notes |
|---|---|---|
| `id` | string | slug stable unique, ex : `numbers-counting-l1-l1-001` |
| `curriculum_id` | uuid | constante du dataset |
| `module` | enum | `numbers \| words \| keyboard \| code \| translation` |
| `sub_mode` | string | une des **15 clés** (voir registre) |
| `level` | int 1-5 | |
| `lesson` | int | **1** (cf. principe 4) |
| `theme` | string | tag de sous-catégorie (cf. liste par module) |
| `type` | enum | `mcq-number \| mcq-image \| mcq-word \| build-sentence \| read-answer \| translation \| typing \| code-grid` |
| `objective_ref` | string | réf. objectif du doc curriculum (ex : `"1"`) |
| `prompt` | `{fr,en}` ou nu | **consigne** (cf. principe 1 & 3) |
| `answer` | voir type | réponse correcte |
| `distractors` | array | `[{ "value": …, "error_type"?: string }]` |
| `hint` | `{fr,en}` ou nu | ≤ 80 car./langue, n'éventre pas la réponse |
| `difficulty` | int 1-4 | |
| `concept_tags` | string[] | ex : `["counting","cardinality","to-5"]` |
| `lang` | `"both"` ou `null` | cf. principe 3 |
| `config` | objet | **contenu** spécifique au type (sections 3-4) |
| `status` | `"candidate"` | |

Les 15 clés `sub_mode` : voir [gabee-curriculum-v0.1.md](gabee-curriculum-v0.1.md). Rappel : numbers `counting/operations/comparison/word-problems` · words `picture/fill-blank/build-sentence/read-answer` · keyboard `copy/speed` · code `maze/draw/actions` · translation `fr-en/en-fr`.

---

## 2. Vocabulaire d'assets (clés image → rendu)

**Règle :** toute `config.image` / `config.object` doit être une clé de cette table (sinon ça ne s'affiche pas). Pour ajouter un mot : préviens-moi, j'ajoute la clé + l'emoji dans la map du code.

| clé | emoji | clé | emoji | clé | emoji |
|---|---|---|---|---|---|
| apple | 🍎 | ball | ⚽ | banana | 🍌 |
| bed | 🛏️ | bee | 🐝 | bird | 🐦 |
| book | 📖 | bread | 🍞 | butterfly | 🦋 |
| car | 🚗 | carrot | 🥕 | cat | 🐱 |
| chair | 🪑 | crab | 🦀 | dog | 🐶 |
| door | 🚪 | elephant | 🐘 | fish | 🐟 |
| flower | 🌸 | foot | 🦶 | friend | 🧒 |
| frog | 🐸 | giraffe | 🦒 | grapes | 🍇 |
| hand | ✋ | house | 🏠 | lemon | 🍋 |
| lion | 🦁 | milk | 🥛 | monkey | 🐵 |
| moon | 🌙 | onion | 🧅 | owl | 🦉 |
| parrot | 🦜 | pineapple | 🍍 | school | 🏫 |
| snake | 🐍 | star | ⭐ | strawberry | 🍓 |
| sun | ☀️ | table | 🍽️ | tomato | 🍅 |
| tree | 🌳 | turtle | 🐢 | water | 💧 |
| watermelon | 🍉 | red | 🟥 *(pastille couleur)* | | |

> Couleurs (`red`, etc.) : rendues comme **pastille de couleur**, pas emoji-mot. Si tu introduis des couleurs en option/réponse (adjectifs), utilise les clés `red/blue/green/yellow/black/white/orange/pink` — je les mappe en pastilles.

---

## 3. Schémas par type — NON-CODE *(déjà conforme, à ratifier)*

### 3.1 `mcq-number` — réponse = un nombre
*(numbers : counting / operations / comparison / word-problems quand la réponse est chiffrée)*
- `answer`: **int**
- `distractors`: `[{ "value": int, "error_type"?: string }]`
- `config` (optionnel, pour le visuel) — une de ces formes :
  - collection à compter : `{ "object": <clé asset>, "count": int, "layout": "scatter" | "row" }`
  - opération illustrée : `{ "a": int, "b": int, "op": "+" | "-" | "×", "object"?: <clé asset> }`
  - comparaison : `{ "left": int, "right": int }`
  - aucune → texte seul (le prompt suffit)
```json
{ "type":"mcq-number","sub_mode":"counting","theme":"objects","lang":"both",
  "prompt":{"fr":"Combien y a-t-il de chats ?","en":"How many cats are there?"},
  "answer":4,"distractors":[{"value":3,"error_type":"off_by_one"},{"value":5,"error_type":"off_by_one"}],
  "config":{"object":"cat","count":4,"layout":"scatter"} }
```

### 3.2 `mcq-image` — voit une image, choisit le mot
*(words : picture)*
- `config`: `{ "image": <clé asset> }`
- `answer`: `{fr,en}` (le bon mot) · `distractors`: `[{ "value": {fr,en} }]`
```json
{ "type":"mcq-image","sub_mode":"picture","theme":"familiar","lang":"both",
  "prompt":{"fr":"Quel est ce mot ?","en":"What is this word?"},
  "answer":{"fr":"la maison","en":"the house"},
  "distractors":[{"value":{"fr":"la fleur","en":"the flower"}},{"value":{"fr":"le poisson","en":"the fish"}}],
  "config":{"image":"house"} }
```

### 3.3 `mcq-word` — choisit un mot (phrase à trou, parité…)
*(words : fill-blank · numbers : parité/patterns à réponse-mot)*
- `config` — une de :
  - phrase à trou : `{ "sentence": {fr,en} }` avec **`___`** à l'emplacement du trou
  - nombre (parité…) : `{ "number": int }`
- `answer`: `{fr,en}` · `distractors`: `[{ "value": {fr,en}, "error_type"?: string }]`
```json
{ "type":"mcq-word","sub_mode":"fill-blank","theme":"nouns","lang":"both",
  "prompt":{"fr":"Choisis le mot qui manque.","en":"Choose the missing word."},
  "answer":{"fr":"chien","en":"dog"},
  "distractors":[{"value":{"fr":"chat","en":"cat"}},{"value":{"fr":"livre","en":"book"}}],
  "config":{"sentence":{"fr":"Le ___ aboie.","en":"The ___ barks."}} }
```

### 3.4 `build-sentence` — remet les mots dans l'ordre
*(words : build-sentence)*
- `config`: `{ "tokens": { "fr": [...], "en": [...] } }` (banque de mots mélangés)
- `answer`: `{ "fr": [...], "en": [...] }` (ordre correct ; **inclut la majuscule (L4) et le point final (L5)** comme tokens/casse)
- `distractors`: `[]`
```json
{ "type":"build-sentence","sub_mode":"build-sentence","theme":"three-words","lang":"both",
  "prompt":{"fr":"Remets les mots dans le bon ordre.","en":"Put the words in the right order."},
  "answer":{"fr":["Maman","lit","."],"en":["Mum","reads","."]},
  "config":{"tokens":{"fr":[".","lit","Maman"],"en":["reads",".","Mum"]}} }
```

### 3.5 `read-answer` — lit un passage, répond
*(words : read-answer)*
- `config`: `{ "passage": {fr,en} }` · `prompt`: **la question** `{fr,en}`
- `answer`: `{fr,en}` · `distractors`: `[{ "value": {fr,en} }]`
```json
{ "type":"read-answer","sub_mode":"read-answer","theme":"one-sentence","lang":"both",
  "prompt":{"fr":"De quelle couleur est le lapin ?","en":"What colour is the rabbit?"},
  "answer":{"fr":"jaune","en":"yellow"},
  "distractors":[{"value":{"fr":"noir","en":"black"}},{"value":{"fr":"vert","en":"green"}}],
  "config":{"passage":{"fr":"Sara a un lapin jaune.","en":"Sara has a yellow rabbit."}} }
```

### 3.6 `translation` — traduit dans la direction donnée
*(translation : fr-en / en-fr)*
- `config`: `{ "direction": "fr-en" | "en-fr", "image"?: <clé asset>, "source"?: string }`
  - L1 : `image` (l'objet source montré en image, pas de texte).
  - L2-L5 : `source` = le mot/groupe/phrase **dans la langue source**.
- `answer`: **string** dans la langue **cible** · `distractors`: `[{ "value": string }]` (langue cible)
```json
{ "type":"translation","sub_mode":"fr-en","theme":"words","lang":"both",
  "prompt":{"fr":"Traduis ce mot en anglais.","en":"Translate this word into English."},
  "answer":"house","distractors":[{"value":"book"},{"value":"school"}],
  "config":{"direction":"fr-en","source":"maison"} }
```
> `lang:"both"` car le prompt (consigne) est bilingue ; `answer`/`source` restent mono-langue (c'est la nature d'une traduction).

### 3.7 `typing` — recopie / vitesse
*(keyboard : copy / speed)*
- `config`: `{ "target": <cible>, "tolerance": { "case": bool, "accents": bool }, "scroll_speed"?: "slow"|"medium"|"fast" }`
  - `scroll_speed` **uniquement** pour `speed`.
  - **cible** = string si `lang:null` (lettre/chiffre/ponctuation, agnostique) ; `{fr,en}` si `lang:"both"` (mot/phrase).
- `answer`: identique à `config.target`.
- `lang`: `null` pour lettres/chiffres/ponctuation ; `"both"` pour mots/phrases.
- `distractors`: `[]`.
```json
{ "type":"typing","sub_mode":"copy","theme":"letters","lang":null,
  "prompt":"Type what you see.","answer":"e",
  "config":{"target":"e","tolerance":{"case":false,"accents":false}} }
```
> ⚠️ `lang:null` ⇒ `prompt` **nu** (string). La consigne localisée est fournie par l'app ; ce prompt nu peut rester une string neutre (l'app affiche son propre label).

---

## 4. Module `code` — MODÈLE RECOMMANDÉ + schéma à régénérer

### 4.0 Recommandation (mes recos)
**Unifier les 3 mondes sur UN seul modèle « tortue sur grille ».** Pourquoi :
- Le doc dit « tout droit → **virage** » → le déplacement a une **orientation** (avance + tourne), pas des flèches absolues.
- C'est déjà ce que fait ton seed `maze`/`draw`, et le renderer `draw` que tu as validé est déjà en tortue.
- **Un seul modèle mental** (avance / tourne gauche / tourne droite + cap) pour les 3 mondes → l'enfant n'apprend qu'une fois.

Conséquence côté code : je **repasse `maze` (actuellement flèches absolues) et `actions` (actuellement 2D absolu) en tortue**, `draw` l'est déjà. Tu régénères les `config` `code` selon 4.2-4.4.

### 4.1 Conventions communes `code-grid`
- Grille : `grid: { "w": int, "h": int }` (colonnes × lignes).
- Coordonnées : `[x, y]`, origine **en haut à gauche**, `x` → droite, `y` → bas.
- Cap initial : `facing: "N" | "E" | "S" | "W"`.
- `blocks`: palette disponible au niveau (cf. rampe 4.5).
- `concept`: = `theme` (`sequence | condition | loop | loop-condition | debug`).
- `answer` = **programme de référence** (sert à calculer le nb de blocs optimal ; je recalcule aussi par recherche). Vocabulaire d'ops :
  - `{"op":"forward"}` · `{"op":"turn","dir":"left"|"right"}`
  - `{"op":"pick"}` · `{"op":"drop"}` *(actions)* · `{"op":"pen","state":"up"|"down"}` *(draw L2+)*
  - `{"op":"repeat","n":int,"body":[...]}` *(loop)*
  - `{"op":"if","cond":"wall_ahead"|"cell_occupied"|"can_pick","then":[...],"else"?:[...]}` *(condition)*
- **Règles de succès (exactes) :**
  - `maze` : finir **pile sur** l'étoile (traverser = échec).
  - `draw` : le tracé recouvre **exactement** la forme cible, une seule fois (pas de dépassement ni de re-tracé).
  - `actions` : chaque objet livré dans sa cible, mains vides, **aucun bloc gaspillé**.

### 4.2 `maze` — atteindre l'étoile
```json
"config": {
  "grid": { "w": 5, "h": 5 },
  "start": [0, 2], "facing": "E",
  "goal": [1, 4],
  "walls": [[2,2],[2,3]],
  "concept": "sequence",
  "blocks": ["forward","turn_left","turn_right"]
}
```
- `goal`: **une seule** étoile `[x,y]`. `walls`: liste de `[x,y]`.

### 4.3 `draw` — tracer la forme (⚠️ à régénérer : cible explicite)
Remplace `{segments,corners}` par des **sommets explicites** :
```json
"config": {
  "grid": { "w": 5, "h": 5 },
  "start": [1, 3], "facing": "N",
  "target": { "vertices": [[1,3],[1,1],[3,1],[3,3],[1,3]] },
  "concept": "sequence",
  "blocks": ["forward","turn_left","turn_right"]
}
```
- `target.vertices`: polyligne de sommets sur la grille (le trait = segments unitaires entre sommets consécutifs).
- L2 (crayon levé/baissé) : ajoute `pen_up`/`pen_down` aux `blocks` et, si le tracé a des interruptions, fournis `target.paths: [[...],[...]]` (plusieurs traits) au lieu de `vertices`.

### 4.4 `actions` — ramasser / déplacer / poser (⚠️ à régénérer : grille 2D tortue)
Remplace le monde 1D par une **grille 2D** :
```json
"config": {
  "grid": { "w": 5, "h": 1 },
  "start": [0, 0], "facing": "E",
  "items": [[1, 0]],
  "targets": [[4, 0]],
  "obstacles": [],
  "concept": "sequence",
  "blocks": ["forward","turn_left","turn_right","pick","drop"]
}
```
- L1 peut rester un **couloir** (`h:1`) ; le moteur reste 2D tortue (cohérent avec maze/draw).
- `items[i]` doit être livré sur `targets[i]` (appariés par index). `obstacles` (L2 « si case occupée → saute ») + bloc `jump`.

### 4.5 Rampe par niveau (palette `blocks` + `concept`)
| Niv | concept | blocks ajoutés | answer peut contenir |
|---|---|---|---|
| L1 | sequence | base (+ pick/drop ou pen selon monde) | forward / turn / pick / drop |
| L2 | condition | `+ if` (+ `jump` pour actions) | `if` |
| L3 | loop | `+ repeat` | `repeat` |
| L4 | loop-condition | `repeat` + `if` | `repeat` + `if` |
| L5 | debug | — | fournir `config.given_program` (programme buggé à corriger) |

- **L5 (debug)** : `config.given_program` = array d'ops (le programme cassé pré-rempli) que l'enfant doit corriger pour réussir la tâche du monde.

---

## 5. Récap : ce qu'il y a à (re)générer

| Module | Action |
|---|---|
| numbers | ✅ garder. Vérifier que toute `config.object` ∈ vocabulaire §2. |
| words | ✅ garder. Vérifier `config.image` ∈ vocabulaire §2. build-sentence : majuscule/point en tokens (L4/L5). |
| keyboard | ✅ garder. |
| translation | ✅ garder. |
| **code** | ♻️ **régénérer les 330 `config`** selon §4 (tortue ; draw = sommets explicites ; actions = grille 2D ; L5 = `given_program`). |

Une fois régénéré, on importe et j'adapte les renderers (lecture `config`, map d'assets, modèle tortue unifié pour code).
