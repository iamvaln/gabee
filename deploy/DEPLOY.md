# Déploiement de Gabee sur un VPS Contabo (Docker, multi-projets)

Ce guide déploie Gabee sur un VPS **partagé** : un seul reverse-proxy (Traefik)
sert tous tes projets, chaque projet étant sa propre stack docker-compose.

## Architecture

```
                       Internet (80/443)
                              │
                    ┌─────────▼─────────┐
                    │  Traefik (proxy)  │  HTTPS auto (Let's Encrypt)
                    └─────────┬─────────┘   réseau Docker « web »
          ┌───────────────────┼───────────────────┐
          │                   │                    │
   gabee.app            kids.gabee.app       (autre-projet.com)
   www.gabee.app             │                    │
          │                  │                    │
   ┌──────▼──────┐    ┌──────▼──────┐      ┌──────▼──────┐
   │ web (Next)  │    │ kid (nginx) │      │   stack 2   │
   │  :3000      │    │  :80 statique│      │     ...     │
   └──────┬──────┘    └─────────────┘      └─────────────┘
          │ réseau « internal » (privé)
   ┌──────▼──────┐
   │  Postgres   │  volume gabee-db
   └─────────────┘
```

- `web` (Next.js 16) : landing + portail parent + admin + **toutes les routes `/api`**.
- `kid` (PWA Vite statique) : appelle l'API via `VITE_API_BASE_URL = https://gabee.app`.
- Postgres tourne en conteneur, isolé sur le réseau privé `internal`.

---

## 1. Commander et préparer le VPS

1. Sur Contabo, prends un VPS (un **VPS S** — 4 vCPU / 8 Go — est confortable pour
   plusieurs projets ; le minimum réaliste pour Gabee seul est 2 Go). Choisis
   **Ubuntu 24.04 LTS**.
2. Ajoute ta clé SSH au moment de la commande (sinon Contabo envoie un mot de passe
   root par email).
3. Connecte-toi : `ssh root@TON_IP`.

### Durcissement minimal (recommandé)

```bash
# Crée un utilisateur non-root avec sudo
adduser deploy
usermod -aG sudo deploy
rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy   # copie ta clé SSH

# Pare-feu : n'ouvre que SSH + HTTP + HTTPS
apt update && apt install -y ufw fail2ban
ufw allow OpenSSH
ufw allow 80
ufw allow 443
ufw --force enable
```

Reconnecte-toi ensuite en `ssh deploy@TON_IP` et travaille avec cet utilisateur.

---

## 2. Installer Docker + le plugin Compose

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
# Déconnecte/reconnecte la session SSH pour que le groupe docker prenne effet.
docker compose version   # vérifie : doit afficher v2.x
```

---

## 3. DNS — pointer les domaines vers le VPS

Chez ton registrar (zone DNS de `gabee.app`), crée des enregistrements **A** vers
l'IP publique du VPS — un par surface publique :

| Type | Nom       | Valeur   | Surface                  |
| ---- | --------- | -------- | ------------------------ |
| A    | `@`       | `TON_IP` | Landing apex             |
| A    | `www`     | `TON_IP` | Alias landing            |
| A    | `parents` | `TON_IP` | Parent dashboard         |
| A    | `admin`   | `TON_IP` | Admin back office        |
| A    | `api`     | `TON_IP` | API REST (kid PWA + …)   |
| A    | `kids`    | `TON_IP` | Kid PWA statique         |

Le middleware (`apps/web/src/proxy.ts`) reconnaît chaque sous-domaine et
bloque les chemins qui ne lui appartiennent pas (un `GET admin.gabee.app/parent`
renvoie 404 propre). Pour partager la session côté navigateur :

- Cookie parent scopé sur `.gabee.app` → vu par parents, kids et apex.
- Cookie admin scopé sur `admin.gabee.app` → vu par admin uniquement.

Les noms `parents`, `admin`, `api` sont donc requis : sans eux, le middleware
ne peut pas distinguer les surfaces (tout retombe en apex).

Attends que ça résolve (`dig +short gabee.app` doit renvoyer ton IP) **avant**
l'étape Traefik : Let's Encrypt vérifie le domaine via le port 443.

---

## 4. Le proxy partagé (une seule fois pour tout le VPS)

```bash
# Réseau Docker partagé entre tous les projets
docker network create web

# Récupère le code (le proxy vit dans le repo Gabee, mais sert tout le monde)
git clone <URL_DU_REPO_GABEE> ~/gabee
cd ~/gabee/deploy/proxy
cp .env.example .env
nano .env            # ACME_EMAIL=ton.email@...  (notifs d'expiration de certif)
docker compose up -d
docker compose logs -f traefik   # Ctrl-C pour quitter
```

Traefik écoute désormais sur 80/443 et délivrera un certificat HTTPS à chaque
projet qui rejoint le réseau `web` avec les bons labels.

---

## 5. Configurer Gabee

```bash
cd ~/gabee
cp .env.production.example .env.production
nano .env.production
```

À renseigner impérativement :

- `POSTGRES_PASSWORD` — un mot de passe fort, **et** reporte-le dans `DATABASE_URL`
  et `DIRECT_URL` (même valeur, host = `db`).
- `AUTH_JWT_SECRET` et `COPARENT_INVITE_SECRET` — génère chacun avec
  `openssl rand -hex 32`.
- `ANTHROPIC_API_KEY` — ta clé.
- Vérifie les domaines (`WEB_DOMAIN`, `KID_DOMAIN`) et les URLs publiques
  (`VITE_API_BASE_URL`, `NEXT_PUBLIC_KID_APP_URL`, `KID_APP_ORIGIN`).
- Mailgun : laisse vide si tu n'envoies pas encore d'emails.

> ⚠️ Les variables `NEXT_PUBLIC_*` et `VITE_*` sont **figées au moment du build**
> (inlinées dans le bundle). Si tu changes un domaine plus tard, il faut
> **rebuild** les images, pas seulement redémarrer.

---

## 6. Build + démarrage

```bash
cd ~/gabee
docker compose --env-file .env.production up -d --build
```

Ce que fait la stack, dans l'ordre :

1. `db` démarre et devient *healthy*.
2. `migrate` applique les migrations Prisma (`prisma migrate deploy`) puis sort.
3. `web` (Next.js) et `kid` (nginx) démarrent et s'enregistrent auprès de Traefik.

Suis le tout :

```bash
docker compose logs -f
docker compose ps
```

> Si `next build` échoue en réclamant `DATABASE_URL` : ce n'est normalement pas le
> cas (Prisma se connecte au runtime, pas au build). Si ça arrive sur une route
> évaluée statiquement, passe une URL factice via un `ARG`/`ENV DATABASE_URL` dans
> `apps/web/Dockerfile`.

---

## 7. Données : seed + compte admin

Le seed et la promotion admin se lancent dans un conteneur jetable basé sur
l'image web (qui contient le CLI Prisma + `tsx`) :

```bash
# Seed initial (contenu de base) — optionnel selon ton besoin
docker compose run --rm migrate pnpm --filter @gabee/db run db:seed

# Crée ton compte : inscris-toi d'abord sur https://gabee.app (parcours signup),
# puis promeus-le en admin :
docker compose run --rm migrate \
  pnpm --filter @gabee/db exec tsx prisma/make-admin.ts ton.email@exemple.com
```

`/admin` est alors accessible avec ce compte.

---

## 8. Vérifications

- `https://gabee.app` → landing / portail parent (cadenas HTTPS valide).
- `https://gabee.app/admin` → panneau admin (après login admin).
- `https://kids.gabee.app` → PWA enfant, installable, fonctionne hors-ligne.
- Le pairage enfant doit joindre l'API : la PWA appelle `https://gabee.app/api/...`
  et le CORS est autorisé via `KID_APP_ORIGIN`.

```bash
docker compose logs web | tail -50
docker compose logs kid | tail -50
```

---

## 9. Mises à jour (redéploiement)

```bash
cd ~/gabee
git pull
docker compose --env-file .env.production up -d --build
# migrate ré-applique automatiquement les nouvelles migrations avant que web ne reparte
```

Pour ne rebuild qu'un service : `docker compose ... up -d --build web`.

> ⚠️ **Synchronise `.env.production` avec `.env.production.example`.**
> `git pull` ne touche pas `.env.production` (le fichier est gitignoré, c'est
> tes vrais secrets). Si l'update a introduit de nouvelles variables, elles
> figureront dans `.env.production.example` mais pas dans le fichier réel sur
> le VPS — les services qui les attendent partiront avec une valeur par
> défaut ou un warning.
>
> Réflexe à chaque `git pull` :
>
> ```bash
> # Diff entre l'exemple et le vrai fichier (vars ajoutées / renommées / supprimées)
> diff <(grep -v '^\s*#' .env.production.example | grep '=' | cut -d= -f1 | sort) \
>      <(grep -v '^\s*#' .env.production         | grep '=' | cut -d= -f1 | sort)
> ```
>
> Tout ce qui apparaît à gauche (« < ») est manquant dans `.env.production` →
> à ajouter à la main avant le `up -d --build`.

---

## 10. Sauvegardes Postgres

Dump quotidien simple (à mettre en cron) :

```bash
# Sauvegarde
docker compose exec -T db pg_dump -U gabee gabee | gzip > ~/backups/gabee-$(date +%F).sql.gz

# Restauration
gunzip -c ~/backups/gabee-AAAA-MM-JJ.sql.gz | docker compose exec -T db psql -U gabee -d gabee
```

Exemple de cron (`crontab -e`), tous les jours à 3 h :

```
0 3 * * * cd /home/deploy/gabee && docker compose exec -T db pg_dump -U gabee gabee | gzip > /home/deploy/backups/gabee-$(date +\%F).sql.gz
```

Le volume `gabee-db` persiste les données entre redéploiements ; `docker compose
down` les garde, `docker compose down -v` les **supprime** (attention).

---

## 11. Ajouter d'autres projets sur le même VPS

C'est le but du proxy partagé. Pour chaque nouveau projet :

1. Son `docker-compose.yml` rejoint le réseau externe `web` :
   ```yaml
   networks:
     web:
       external: true
   ```
2. Le service exposé porte des labels Traefik (adapte le nom de routeur, l'hôte et
   le port) :
   ```yaml
   labels:
     - traefik.enable=true
     - traefik.docker.network=web
     - traefik.http.routers.monprojet.rule=Host(`monprojet.com`)
     - traefik.http.routers.monprojet.entrypoints=websecure
     - traefik.http.routers.monprojet.tls.certresolver=le
     - traefik.http.services.monprojet.loadbalancer.server.port=8080
   ```
3. Pointe le DNS du nouveau domaine vers la même IP, puis
   `docker compose up -d --build`.

Traefik détecte automatiquement le nouveau conteneur et émet son certificat.
Chaque projet garde sa propre base/volumes sur son réseau privé ; ils ne se
partagent que le proxy et le port 443.

> Astuce : si plusieurs projets ont des `compose` distincts, garde des **noms de
> routeurs Traefik uniques** (`gabee-web`, `monprojet`, …) pour éviter les
> collisions de configuration.
