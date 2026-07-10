# Genre du profil enfant + visage féminin de l'avatar — Design

**Date** : 2026-07-10
**Statut** : validé (brainstorm + preview visuelle avec Valentine)
**Preview** : https://claude.ai/code/artifact/e603f957-5630-43e1-9e6b-9a4656135b1d (v3)

## Problème

L'avatar recolorable est composé de : teint de peau, couleur de cheveux, coiffure,
couleur d'habit. Le visage est unique et neutre — mais sa lecture réelle est
masculine. Le seul signal « féminin » possible est la coiffure (longue, couettes,
chignon). Résultat : impossible de configurer un avatar féminin aux cheveux
courts. Constat confirmé en production : les 17 profils existants ont tous gardé
`style_short`, filles comprises.

## Décisions (issues du brainstorm + itérations visuelles)

1. **Le genre est un attribut du profil enfant**, pas une simple option visuelle
   du picker. Il pilote le visage de l'avatar aujourd'hui et sera exploitable
   plus tard (accords français : « prête », « championne », stats admin).
2. **Valeurs : `girl` / `boy`, nullable.** `null` = non précisé → rendu
   identique à `boy` (le visage actuel). Le champ reste optionnel à la création.
3. **Différenciation par le contour du visage uniquement.**
   - `boy` / `null` = le visage actuel, strictement inchangé.
   - `girl` = contour « cœur » : joues pleines à hauteur des yeux, menton qui
     s'affine doucement. Yeux, nez, sourire, oreilles : identiques au garçon.
   - **Pas de cils, pas de sourcils, pas de joues rosées** (itérations v1/v2
     rejetées). Pas de coiffure féminisée : les 6 coiffures gardent leurs
     formes actuelles pour les deux genres.

## Modèle de données

- Prisma : `enum Gender { girl, boy }` + `gender Gender? @map("gender")` sur
  `ChildProfile`. Migration additive.
- `@gabee/types` (`packages/types/src/enums.ts`) :
  `GenderSchema = z.enum(['girl', 'boy'])`, type `Gender`, nullable partout où
  le look circule.

## Rendu SVG

- Dans `enums.ts`, un map `FACE_PATHS: Record<Gender, string>` (source unique,
  comme `HAIR_STYLE_PATHS`) :
  - `boy` : path actuel
    `M 32 46 Q 32 34 50 34 Q 68 34 68 46 Q 68 62 60 70 Q 50 77 40 70 Q 32 62 32 46 Z`
  - `girl` : contour « cœur » validé en preview
    `M 31 46 Q 31 34 50 34 Q 69 34 69 46 Q 69 57 60 65 Q 50 76 40 65 Q 31 57 31 46 Z`
- `KidAvatar` (`apps/web/src/app/parent/_components/kid-avatar.tsx`) et
  `ProfileAvatar` (`apps/kid/src/components/Chrome.tsx`) prennent une prop
  `gender?: Gender | null` et choisissent le path du visage :
  `FACE_PATHS[gender ?? 'boy']`. Tout le reste du SVG est inchangé.

## UI parent

- Dans `AvatarPicker` (`avatar-picker.tsx`), une **première rangée « Genre »**
  avec deux boutons mini-avatar (même patron que la rangée coiffure) : visage
  garçon / visage fille, rendus avec les couleurs déjà choisies.
- Le contour seul se lit peu à 40 px : chaque bouton porte un **libellé texte**
  en dessous — Garçon / Fille (fr), Boy / Girl (en).
- Le choix met à jour l'aperçu en live. Rangée partagée automatiquement par les
  formulaires d'ajout (`add-kid-modal.tsx`) et d'édition (`edit-kid-form.tsx`).
- Aucune valeur pré-sélectionnée à la création ; tant que rien n'est choisi,
  l'aperçu montre le visage actuel (= garçon). Un état « aucun des deux
  sélectionné » est donc valide dans la rangée.

## Plomberie

Le champ suit exactement le chemin de `hairStyle` :

`add-kid-modal` / `edit-kid-form` → API profiles (payload `gender`) →
`services/profiles.ts` → `mappers.ts` (`gender` dans la forme snake_case
renvoyée au kid app) → sync kid (`profile.gender` côté kid app).

L'admin affiche les avatars via les mêmes mappers → aucun travail spécifique.

## Backfill production (one-off)

Genre deviné par prénom sur les 17 profils prod existants (2026-07-10), à
appliquer via un fichier SQL one-off (`packages/db/prisma/backfill-gender.sql`,
passé manuellement à `psql` via `docker exec` sur le VPS après la migration —
le VPS n'a pas de Node hors conteneurs, donc pas de script `.mts`) :

- `girl` : Léna, Ana, Eunice, Ana Gabrielle, Mya, Manoela
- `boy` : Gilles Perry, Ezekiel, Michel, Ibrahim, Thibaut, Israel, Aaron,
  Ralf Matthis, Ily Mael (Maël = masculin, confiance moyenne)
- laissés à `null` : kahi (indéterminé), Test (compte de test)

Le SQL matche par nom exact, ne touche que les lignes encore à `NULL`, et se
termine par un SELECT de contrôle ; tout profil créé entre-temps est ignoré. Anomalie relevée au passage (hors périmètre) :
« Ralf Matthis » a une date de naissance future (2026-09-23).

## Hors périmètre

- Accords français dans la copy (« prête », « championne ») : le champ existe
  et sera exploitable, mais aucune copy ne change dans cette itération.
- Cils, sourcils, joues, coiffures genrées : explorés en preview, rejetés.
- Pas de valeur « neutre » explicite dans le picker — l'absence de choix suffit.
- Correction de la date de naissance de « Ralf Matthis ».

## Tests

- `packages/types` : tests node:test via tsx (pas Vitest — contrainte rolldown)
  couvrant le schéma `GenderSchema` et `FACE_PATHS` (une entrée par genre,
  paths non vides, `boy` = path historique).
- Vérification manuelle du rendu : picker à 40 px et avatar plein format,
  côté parent et côté kid app.
