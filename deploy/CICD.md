# CI/CD de Gabee (GitHub Actions → GHCR → VPS)

## Vue d'ensemble

```
  PR / push main ─────────────▶  CI  (lint · typecheck · test)
                                          .github/workflows/ci.yml

  git tag vX.Y.Z + push ──────▶  Release
                                  ├─ build-web  ─┐
                                  ├─ build-kid  ─┤─▶ push images sur ghcr.io/iamvaln
                                  └─ deploy ─ SSH ▶ VPS : git checkout tag,
                                                    docker compose pull + up
                                          .github/workflows/release.yml
```

- **Images** : `ghcr.io/iamvaln/gabee-web` et `ghcr.io/iamvaln/gabee-kid`, taguées
  avec la version (`v1.0.0`) **et** `latest`.
- **Déploiement** : déclenché uniquement par un **tag git `v*`**. Un push sur `main`
  ne fait que la CI (pas de déploiement).
- Le VPS **ne build pas** : il tire les images pré-construites depuis GHCR.

---

## Mise en place (une seule fois)

### 1. Variables de build (publiques — onglet Settings ▸ Secrets and variables ▸ Actions ▸ Variables)

Ces URLs sont **inlinées dans les bundles au build**, donc elles vivent côté CI :

| Variable | Valeur (exemple) |
| --- | --- |
| `NEXT_PUBLIC_KID_APP_URL` | `https://kids.gabee.app` |
| `VITE_API_BASE_URL` | `https://gabee.app` |

```bash
gh variable set NEXT_PUBLIC_KID_APP_URL --body "https://kids.gabee.app"
gh variable set VITE_API_BASE_URL       --body "https://gabee.app"
```

### 2. Secrets de déploiement (Settings ▸ Secrets ▸ Actions, ou via gh)

| Secret | Contenu |
| --- | --- |
| `VPS_HOST` | IP ou hostname du VPS Contabo |
| `VPS_USER` | utilisateur SSH (ex. `deploy`) |
| `VPS_SSH_KEY` | **clé privée** SSH autorisée sur le VPS |
| `VPS_PORT` | *(optionnel)* port SSH, défaut 22 |
| `VPS_APP_DIR` | *(optionnel)* chemin du repo sur le VPS, défaut `~/gabee` |

```bash
# Génère une paire de clés dédiée au déploiement (sur ta machine) :
ssh-keygen -t ed25519 -f ~/.ssh/gabee_deploy -C "github-actions-deploy" -N ""
# Autorise la clé publique sur le VPS :
ssh-copy-id -i ~/.ssh/gabee_deploy.pub deploy@TON_IP
# Enregistre la clé PRIVÉE comme secret :
gh secret set VPS_SSH_KEY < ~/.ssh/gabee_deploy
gh secret set VPS_HOST --body "TON_IP"
gh secret set VPS_USER --body "deploy"
```

> Le pull des images depuis GHCR sur le VPS utilise le `GITHUB_TOKEN` du run
> (transmis le temps du déploiement) — pas besoin de PAT ni de rendre les images
> publiques.

### 3. (Optionnel) garde-fou de déploiement

Le job `deploy` utilise l'environnement GitHub `production`. Dans
**Settings ▸ Environments ▸ production**, tu peux exiger une **approbation manuelle**
avant chaque déploiement. Sans configuration, il déploie directement.

### 4. Prérequis côté VPS

Le VPS doit déjà être préparé selon [DEPLOY.md](DEPLOY.md) :

- Docker installé, réseau `web` créé, **proxy Traefik** lancé.
- Le repo cloné dans `~/gabee` (ou `VPS_APP_DIR`).
- Un `.env.production` rempli (secrets de prod) — **non versionné**, il reste sur
  le VPS et survit aux `git checkout`.

---

## Utilisation au quotidien

### Déployer une version

```bash
# Sur main, à jour et CI verte :
git tag v1.0.0
git push origin v1.0.0
```

Le workflow `Release` se lance : build des 2 images → push GHCR → SSH sur le VPS
qui fait `git checkout v1.0.0`, `docker compose pull`, `up -d`. Les migrations
Prisma sont appliquées automatiquement par le service `migrate` avant que `web`
ne redémarre.

Suis le déroulé dans l'onglet **Actions** de GitHub.

### Versions

Utilise du [SemVer](https://semver.org/lang/fr/) : `v1.0.0`, `v1.0.1`, `v1.1.0`…
Le tag git **est** le tag d'image déployé (traçabilité 1:1).

### Rollback

Re-tag d'un commit antérieur, ou redeploy d'un tag existant :

```bash
# Re-pointer le VPS sur une version précédente, manuellement :
ssh deploy@TON_IP 'cd ~/gabee && git checkout v0.9.0 && \
  IMAGE_TAG=v0.9.0 docker compose --env-file .env.production up -d'
```

Les images des anciennes versions restent dans GHCR, donc le rollback est instantané
(pas de rebuild).

---

## Ce qui est testé en CI

- `pnpm run lint` (ESLint)
- `pnpm run typecheck` (tsc, après `prisma generate`)
- `pnpm run test` (node:test sur `@gabee/types`)

> Le build des images Docker n'est pas refait à chaque PR (pour garder la CI rapide) ;
> il est validé au moment du tag. Pour tester le build d'image sans déployer, pousse
> un tag de pré-release sur une branche jetable, ou lance `docker compose build`
> en local.
