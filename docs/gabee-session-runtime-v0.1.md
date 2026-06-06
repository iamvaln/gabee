# Gabee — Runtime session & progression (v0.1)

> But : figer le **comportement runtime côté kid** — comment un niveau se découpe en leçons, comment les questions sont sélectionnées, et comment on évite les répétitions. Source de vérité pour les sessions ; complète [`gabee-curriculum-v0.1.md`](gabee-curriculum-v0.1.md) (échelle de niveaux) et [`gabee-seed-schema-v1.md`](gabee-seed-schema-v1.md) (structure des questions).

**Principe directeur :** les données portent **un pool par `(module, sub_mode, level)`** (chaque question `lesson: 1`) ; toute la structure de jeu (3 leçons + révision) est **synthétisée côté app** en échantillonnant ce pool. Le contenu reste plat ; l'app fabrique la profondeur.

---

## Changelog (lié aux tags de déploiement)

| Tag | Date | Ajustement |
| --- | --- | --- |
| **v2.0.0** | 2026-06-05 | Reset curriculum v0.1 : 5 modules, **4025 questions**, 5 niveaux × ≥50/sous-mode, chaque question age-taguée. Reseed prod destructif (wipe `questions` + republish ; comptes/historique préservés). |
| **v2.0.1** | 2026-06-05 | (1) Keyboard : tape `config.target`, pas le `prompt`. (2) **3 leçons + révision synthétisées** par niveau. (3) **Sélection niveau-d'abord** (l'âge ordonne, n'exclut pas). (4) **Dédup « déjà vu »** câblé. |
| **v2.0.2** | 2026-06-05 | **Entrée = bouton « Suivant »** quand le feedback est affiché (sessions à avance manuelle). |

---

## 1. Niveaux → leçons (synthèse côté app)

- Un **niveau** a un seul pool (`lesson: 1` pour tout ; cf. seed-schema §4).
- L'app présente chaque niveau comme **3 leçons + 1 révision = 4 sessions**. Une session = **7 questions** (`TOTAL`), piochées dans le pool du niveau.
- Un **niveau est terminé** quand ses **4 unités** sont réussies (≥ 1 étoile chacune) → débloque le niveau suivant (déblocage séquentiel ; cf. [level-visibility-and-unlocking](#)).
- Implémentation : `lessonsForLevel(pool, level)` renvoie `[1,2,3]` dès qu'un niveau a un pool ; `unitsForLevel` ajoute la révision (`REVISION_LESSON = 4`). Constante `LESSONS_PER_LEVEL = 3` (à rendre BE-driven plus tard). Fichier : `apps/kid/src/lib/progression.ts`.
- Les 9 sessions échantillonnent le **pool du niveau** (filtre `sub_mode` + `level` uniquement ; **pas** de filtre `q.lesson`).

> **Conséquence migration :** un niveau « terminé » sous l'ancien modèle (1 leçon) réapparaît incomplet (4 unités requises). Accepté (prod = comptes de test au moment du changement).

## 2. Sélection des questions — « niveau d'abord, l'âge ordonne »

Le **pool du niveau est l'univers** ; l'âge et le « déjà vu » ne font que **classer**, jamais exclure. `selectSession(pool, age, total, seen)` remplit `total` en parcourant des paliers (mélangés) :

1. non-vu ∩ dans-mon-âge
2. non-vu ∩ hors-âge
3. vu ∩ dans-mon-âge
4. vu ∩ hors-âge

Garanties :
- Un enfant de **10 ans à un niveau bas** voit quand même les questions (plus jeunes) du niveau ; un enfant de **6 ans à un niveau haut** voit les questions (plus âgées). L'âge **ne bloque jamais**.
- On commence par les questions de son âge, puis on sert **le reste** une fois épuisé.
- On ne **répète** (paliers 3-4) qu'une fois **tout le pool vu**.

Fichier : `apps/kid/src/lib/selectSession.ts`. (Rend caduque toute « correction » de bandes d'âge trouées : un trou n'exclut plus rien.)

## 3. Dédup « déjà vu »

- Store local par `(profil, "<module>:<sous-mode>", niveau)` : `apps/kid/src/lib/seen.ts` (`getSeen` / `markSeen`, localStorage).
- **Lu à la sélection** (palier non-vu prioritaire), **marqué à la complétion** d'une session, dans les **9 sessions**.
- Effet : revenir sur un niveau **déjà terminé** sert des **questions neuves** jusqu'à épuisement du pool, puis autorise les répétitions. Rend aussi les 3 leçons d'une même visite distinctes (sous-ensembles différents).
- Le `progress.seen_question_ids` synchronisé (serveur) reste pour l'analytique ; le store local est la **source de vérité pour la sélection**.
- Ordre de grandeur : pool ~50, 4 unités × 7 = **28 questions** pour terminer un niveau → ~1 parcours de rab en contenu frais avant répétition. Plus de marge = générer plus de questions/niveau.

## 4. Keyboard — cible vs instruction

- Le `prompt` (« Type what you see. ») est l'**instruction** ; la **cible à taper** vit dans `config.target` (cf. `question.ts`). Les deux sessions keyboard tapaient le `prompt` → corrigé pour lire `config.target`.
- Échelle du contenu (inchangée) : L1 lettre (`a`), L2 chiffre (`0`), L3 ponctuation (`.`), L4 mot, L5 phrase ; `config.target` = string ou `{fr,en}` (géré par `displayValue`).
- Indice par touche reformulé : « Tape la lettre en surbrillance » / « Type the highlighted letter ».

## 5. Entrée = « Suivant »

- Quand le feedback (succès/erreur) est affiché, **Entrée** déclenche la même chose que le bouton **« Suivant »** → l'enfant reste au clavier entre les questions. Le bouton reste pour souris/tactile.
- Appliqué aux **7 sessions à avance manuelle** : keyboard static, numbers, translation, words (picture/fill/build/read). Keyboard **scrolling** et **code** auto-avancent déjà (pas concernés).

---

## Fichiers de référence

- `apps/kid/src/lib/progression.ts` — synthèse leçons + complétion niveau.
- `apps/kid/src/lib/selectSession.ts` — sélection par paliers.
- `apps/kid/src/lib/seen.ts` — dédup local.
- `apps/kid/src/screens/*Session.tsx` — pools (filtre niveau), dédup, Entrée→Suivant.
- Mémoire liée : `project_level_progression`, `project_vps_infra`.
