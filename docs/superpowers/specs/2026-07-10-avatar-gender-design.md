# Genre du profil enfant + visage féminin de l'avatar — Design

**Date** : 2026-07-10
**Statut** : validé (brainstorm avec Valentine)

## Problème

L'avatar recolorable est composé de : teint de peau, couleur de cheveux, coiffure,
couleur d'habit. Le visage est unique et neutre, donc le seul signal « féminin »
possible est la coiffure (longue, couettes, chignon). Résultat : impossible de
configurer un avatar féminin aux cheveux courts.

## Décisions (issues du brainstorm)

1. **Le genre est un attribut du profil enfant**, pas une simple option visuelle
   du picker. Il pilote le visage de l'avatar aujourd'hui et sera exploitable
   plus tard (accords français : « prête », « championne », stats admin).
2. **Valeurs : `girl` / `boy`, nullable.** `null` = non précisé → visage neutre
   actuel. Aucun backfill : les profils existants ne changent pas d'apparence
   tant que le parent ne choisit pas. Le champ reste optionnel à la création.
3. **Différenciation visuelle : cils seulement.** `girl` ajoute des cils aux
   yeux. `boy` et `null` = visage actuel inchangé. Subtil, lisible à 40 px,
   une seule forme SVG à maintenir.

## Modèle de données

- Prisma : `enum Gender { girl, boy }` + `gender Gender? @map("gender")` sur
  `ChildProfile`. Migration additive, pas de backfill.
- `@gabee/types` (`packages/types/src/enums.ts`) :
  `GenderSchema = z.enum(['girl', 'boy'])`, type `Gender`, nullable partout où
  le look circule.

## Rendu SVG

- Nouveau path `EYELASHES` dans `enums.ts` : trois petits traits au-dessus de
  chaque œil (yeux en cx 43 / 57, cy 50, viewBox 100×100). Source unique
  partagée par les deux apps, comme `HAIR_STYLE_PATHS`.
- `KidAvatar` (`apps/web/src/app/parent/_components/kid-avatar.tsx`) et
  `ProfileAvatar` (`apps/kid/src/components/Chrome.tsx`) prennent une prop
  `gender?: Gender | null` et dessinent les cils uniquement si
  `gender === 'girl'`.

## UI parent

- Dans `AvatarPicker` (`avatar-picker.tsx`), une **première rangée « Genre »**
  avec deux boutons mini-avatar (même patron que la rangée coiffure) : visage
  sans cils / visage avec cils. Libellés : Garçon / Fille (fr), Boy / Girl (en).
- Le choix met à jour l'aperçu en live. Rangée partagée automatiquement par les
  formulaires d'ajout (`add-kid-modal.tsx`) et d'édition (`edit-kid-form.tsx`).
- Aucune valeur pré-sélectionnée à la création ; tant que rien n'est choisi,
  l'aperçu montre le visage neutre. Un état « aucun des deux sélectionné »
  est donc valide dans la rangée.

## Plomberie

Le champ suit exactement le chemin de `hairStyle` :

`add-kid-modal` / `edit-kid-form` → API profiles (payload `gender`) →
`services/profiles.ts` → `mappers.ts` (`gender` dans la forme snake_case
renvoyée au kid app) → sync kid (`profile.gender` côté kid app).

L'admin affiche les avatars via les mêmes mappers → aucun travail spécifique.

## Hors périmètre

- Accords français dans la copy (« prête », « championne ») : le champ existe
  et sera exploitable, mais aucune copy ne change dans cette itération.
- Pas de visage « garçon » différencié (sourcils, etc.).
- Pas de valeur « neutre » explicite dans le picker — l'absence de choix suffit.

## Tests

- `packages/types` : tests node:test via tsx (pas Vitest — contrainte rolldown)
  couvrant le schéma `GenderSchema` et la présence/forme du path `EYELASHES`.
- Vérification manuelle du rendu : picker à 40 px et avatar plein format,
  côté parent et côté kid app.
