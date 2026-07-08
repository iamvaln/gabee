# Kid app — URL path routing (plan v0.1)

**But** : donner à la SPA kid de vraies **URLs par path** (aujourd'hui : état de route en mémoire, une seule URL `/`).
**Gains** : refresh/back gardent la place · liens partageables · breadcrumbs Sentry + analytics par écran · monitoring · fix partiel du bug « refresh → re-boot ».

## Non-buts (v0.1)
- Pas de réécriture vers react-router (trop invasif). On garde l'union `Route` + `setRoute`.
- Les **résumés (summary)** ne sont pas adressables (score/total éphémères) → un refresh sur un résumé retombe sur la lessonmap.
- Pas de changement infra : le nginx kid a déjà `try_files … /index.html` ✓, et le SW `navigateFallback: index.html` ✓.

## Pourquoi cette approche (alternatives pesées)
- **A. Codec History API (retenu)** — garde l'union `Route` (déjà exhaustive, testée) comme source de vérité ; on ajoute une fonction pure Route↔URL. Blast radius = ~2 fichiers neufs + quelques lignes de câblage. Aucun écran touché.
- **B. react-router / TanStack Router** — idiomatique, back-button/params/deep-link « gratuits ». Mais il faudrait **re-plomber toute la logique impérative existante** (gating token/pair/profil, tabs, overlays healthy-use, `sessionBack`, validation progression) dans son paradigme (layout routes, loaders) → gros refactor, gros risque, pour une nav **finie et simple**.
- **Verdict** : A est mieux appropriée **maintenant**. Ses forces (nav finie, union déjà en place) matchent le besoin ; les forces d'un routeur (layouts imbriqués, loaders, code-splitting par route, typage des params) ne sont pas nécessaires ici. **Caveat honnête** : le codec est du custom (on maintient la table + les cas limites de `popstate`) ; si un jour on veut du **code-splitting par écran** (alléger le bundle kid ~850 Ko) ou une nav bien plus riche, migrer vers react-router deviendra rentable — et l'union `Route` + codec est un **intermédiaire propre** qui n'y ferme pas la porte. La complexité *réelle* (valider un deep-link contre la progression) est du code applicatif **identique quel que soit le routeur** — ce n'est pas un argument pour B.

## Approche : codec Route↔URL + sync History API (mini, non invasif)
On garde tout le rendu/écrans existants. On ajoute :
1. `lib/router.ts` — deux fonctions pures + les tables de slugs :
   - `routeToPath(route, tab): string`
   - `parsePath(pathname): { tab, route } | null` (tolérant : renvoie `null` → fallback hub)
2. `useUrlSync(...)` — un hook qui :
   - au **changement** de `route`/`tab` → `history.pushState(path)` (remplace si même path)
   - sur **`popstate`** (back/forward) → `parsePath` → `setRoute`/`setTab`
   - au **mount** → lit `location.pathname` comme *intention* à appliquer après les gardes

## Schéma d'URL — **anglais** (lisible, partageable, aligné sur les clés internes)
Slugs stables dans **une seule table** (`SLUG` : tab/module/sous-mode/monde). Les slugs anglais **coïncident avec les clés déjà utilisées en base** (`picture`, `fill-blank`, `build-sentence`, `read-answer`, `maze`, `draw`, `actions`…) → mapping quasi nul.

| Écran | Path |
|---|---|
| Hub / Learn | `/learn` (et `/` → `/learn`) |
| Map | `/map` · road module : `/map/words` |
| Chest | `/chest` |
| Sous-hub | `/learn/words` · `/learn/code` |
| Level map | `/learn/words/picture/levels` |
| Lesson map | `/learn/words/picture/level-3` |
| Session | `/learn/words/picture/level-3/lesson-2` |
| Code (monde) | `/learn/code/maze/level-3/lesson-2` |
| Settings | `/settings` |

Tabs : `apprendre→learn`, `carte→map`, `coffre→chest`. Modules : `numbers/words/keyboard/code/translation`. Sous-modes/mondes : clés internes telles quelles.

- **Éphémère, hors URL** : `score`/`total` (summary), `trigger` (`new`/`replay` → défaut `new` au deep-link, ou `?replay=1`), `isRevision` (**recalculé** depuis le bundle, pas dans le path — la révision = leçon 4).
- Summary : l'URL reste sur la session/lessonmap ; refresh → lessonmap.

## Gardes + deep-link (le point délicat)
Le boot-gating (`!token`→Login, `needsDeviceLink`→LinkDeviceCode, `!profile`→ProfileSelect) est **orthogonal** à la route.
- On mémorise l'**intention** (`location.pathname`) au mount ; on ne l'applique **qu'après** que les gardes passent (profil choisi).
- À l'application, on **valide contre la progression** : niveau débloqué ? leçon existe ? bundle présent ? → sinon **clamp / fallback** vers la lessonmap/level-map/hub (un enfant ne doit pas deep-linker dans un niveau verrouillé).
- `?pair=<jwt>` : inchangé (consommé au boot, strip la query) ; on garde le pathname pour la nav post-auth.

## Back-button (UX)
- `popstate` mappe vers `setRoute(parsed)`.
- En pleine **session**, back = comportement `sessionBack` (sortie vers la lessonmap / road), pas un écran cassé.
- Overlays (look-away, daily-lock, gift, message) restent au-dessus, non adressables.

## Découpage en phases
- **Phase 1 — Codec + sync (aucun changement de comportement écran)** : `router.ts` (slugs + routeToPath + parsePath), `useUrlSync`, route initiale depuis l'URL (post-gating), pushState sur setRoute. → *les URLs reflètent la navigation, refresh garde la place sur les écrans « browse »*.
- **Phase 2 — Deep-link + validation** : résolution de l'intention post-profil, validation progression, summary non-adressable (redirige lessonmap).
- **Phase 3 — Polish** : back-button/session, vérif SW/nginx en prod, analytics/Sentry par path (gratuit une fois les URLs en place), i18n des slugs si besoin.

## Risques
- Back en pleine leçon → bien mapper sur `sessionBack`.
- Deep-link niveau verrouillé → valider + clamp.
- État summary perdu au refresh → accepté (redirige lessonmap).
- Union à ~45 variantes → codec verbeux mais mécanique (table).
- **Coordination** : App.tsx est touché par d'autres travaux — caler avant de démarrer.

## Effort estimé
- Phase 1 : ~1–2 j · Phase 2 : ~1 j · Phase 3 / tests (tous types de route, back, refresh, deep-link, niveaux verrouillés) : ~1 j. **Total ~3–4 j**, shippable phase par phase (Phase 1 seule apporte déjà refresh-garde-la-place + URLs analytics).
