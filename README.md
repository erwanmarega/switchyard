# Switchyard

**Suivez tout le chemin de votre projet, de votre nom de domaine jusqu'à vos paiements, et repérez ce qui bloque avant vos utilisateurs.**

> Statut : projet en phase de conception. Rien n'est encore utilisable, ce README décrit la vision et la feuille de route.

---

## Le problème

Un projet web ou un SaaS moderne repose sur une chaîne d'outils : un registrar pour le domaine, Cloudflare pour le DNS, Vercel pour l'hébergement, Stripe pour les paiements, AWS ou Supabase pour les données, Resend pour les emails...

Quand quelque chose casse, le réflexe est d'aller voir les pages de statut des fournisseurs. Mais elles restent souvent au vert alors que **votre** projet est en panne :

- le dernier déploiement a échoué et personne ne l'a vu ;
- les webhooks Stripe renvoient des erreurs depuis plusieurs heures ;
- un enregistrement DNS a été modifié et ne pointe plus au bon endroit ;
- une variable d'environnement existe en preview mais pas en production ;
- le certificat SSL ou le nom de domaine expire dans quelques jours ;
- un quota ou une limite de facturation est presque atteint.

Ces problèmes ne sont pas des incidents chez le fournisseur : ils viennent de **votre configuration**, et ils sont éparpillés entre une dizaine de dashboards différents.

## La solution

Switchyard connecte vos outils (en lecture seule) et les relie entre eux sous la forme d'un **chemin** : un graphe qui représente le parcours réel d'une requête ou d'un paiement dans votre projet.

```
Domaine ──> Cloudflare (DNS) ──> Vercel (front + API) ──> Base de données
                                       ^
                                       |
                              Stripe (webhooks)
```

Chaque nœud du chemin est vérifié régulièrement. Quand un maillon casse, Switchyard vous montre **où** et **pourquoi**, en tenant compte des liens entre les outils. Par exemple :

> Le paiement est cassé : Stripe envoie ses webhooks vers `/api/stripe`, qui renvoie une erreur 500 depuis le déploiement de 14h02 sur Vercel.

## Fonctionnalités prévues

- **Graphe visuel** de votre stack, avec l'état de chaque outil et de chaque lien.
- **Vérifications concrètes** sur votre propre configuration, pas seulement sur le statut des fournisseurs.
- **Corrélation** des erreurs le long du chemin pour remonter à la cause.
- **Alertes** par webhook (Discord, Slack) et par email.
- **Historique** des vérifications et des incidents.
- **Plusieurs projets** dans une même instance.

## Intégrations prévues

Première version :

| Outil      | Vérifications envisagées                                                           |
| ---------- | ---------------------------------------------------------------------------------- |
| Vercel     | Statut des déploiements, variables d'environnement manquantes entre environnements |
| Stripe     | Webhooks en échec, endpoints désactivés                                            |
| Cloudflare | Enregistrements DNS, expiration des certificats                                    |

Ensuite, selon les besoins et les contributions : AWS, Supabase, Railway, Netlify, GitHub Actions, Resend, registrars de domaines...

## Principes

- **Open source et auto-hébergeable.** Vos tokens ne quittent jamais votre serveur.
- **Lecture seule.** Switchyard ne demande que les permissions nécessaires pour lire, jamais pour modifier votre infrastructure.
- **Secrets chiffrés** au repos.
- **Installation simple** : l'objectif est un lancement en une commande avec Docker.
- **Extensible** : chaque intégration est un plugin indépendant, avec une interface commune, pour que chacun puisse ajouter ses propres outils.

## Stack technique envisagée

- **Front** : Vue / Nuxt, avec Vue Flow pour le graphe
- **Back** : Node.js / TypeScript, avec un planificateur pour lancer les vérifications
- **Base de données et authentification** : Supabase (PostgreSQL + Supabase Auth), en local via la CLI Supabase
- **Déploiement** : Docker / Docker Compose

## Identité visuelle

### Le nom

Un _switchyard_, c'est une gare de triage : l'endroit où toutes les voies se croisent et où l'on organise le trafic. C'est exactement le rôle du graphe de Switchyard pour votre projet.

### Direction artistique

L'univers visuel de Switchyard s'inspire du **chemin de fer**. Un réseau ferroviaire fonctionne comme une stack technique : des gares reliées par des voies, des aiguillages, et des signaux qui indiquent si la voie est libre.

| Ferroviaire        | Switchyard                               |
| ------------------ | ---------------------------------------- |
| Gare               | Un outil (Vercel, Stripe, Cloudflare...) |
| Voie               | Le lien entre deux outils                |
| Aiguillage         | Une intégration                          |
| Signal / sémaphore | Le statut d'une vérification             |
| Gare de triage     | Le graphe complet du projet              |

Pistes d'illustrations :

- **Hero** : une locomotive à vapeur qui file vers l'horizon sur des rails qui se ramifient.
- **Sections** : un poste d'aiguillage et ses leviers, un sémaphore, une gare de triage vue du dessus.

### Style graphique

- **Illustrations en halftone / dithering** : images composées de trames de points, au rendu de gravure ancienne.
- **Duotone** : une couleur principale et un fond clair, sans dégradés.
- **Typographie** : une police pixel / bitmap pour les titres et une police monospace pour les boutons et les éléments d'interface, pour le côté terminal.
- **Sobriété** : le style halftone est réservé au hero et aux visuels ; les captures et l'interface du produit restent claires et lisibles.

Les illustrations sont créées à partir de gravures et photographies anciennes du **domaine public** (Wikimedia Commons, Library of Congress, Gallica), auxquelles on applique un effet de trame. Elles sont exportées en WebP ou AVIF pour limiter leur poids.

### Couleurs

La palette s'inspire des **cyanotypes**, les « blueprints » utilisés par les ingénieurs ferroviaires au XIXe siècle : un bleu de Prusse profond avec des tracés clairs.

| Rôle       | Couleur                                                      | Valeur    |
| ---------- | ------------------------------------------------------------ | --------- |
| Principale | Bleu de Prusse (bleu cyanotype)                              | `#1B3A8C` |
| Fond       | Blanc cassé, papier ancien                                   | `#F4F1E8` |
| Accent     | Ambre / rouge de signal ferroviaire, utilisé avec parcimonie | à définir |

Le bleu a aussi un rôle fonctionnel : neutre, il ne se confond pas avec les **couleurs de statut** (vert, orange, rouge), qui sont réservées exclusivement à l'interface du produit pour indiquer l'état des vérifications.

## Feuille de route

- [ ] Cœur de l'application : système de plugins, stockage chiffré des tokens
- [ ] Affichage du graphe du projet
- [ ] Intégration Vercel
- [ ] Intégration Stripe
- [ ] Intégration Cloudflare
- [ ] Alertes (webhook Discord/Slack, email)
- [ ] Historique des vérifications
- [ ] Image Docker et documentation d'installation
- [ ] Guide pour écrire une nouvelle intégration

## Contribuer

Le projet n'en est qu'au début : les idées, retours et propositions d'intégrations sont les bienvenus. Ouvrez une issue pour en discuter.

## Licence

À définir (MIT envisagée).

---

## Développement

### Prérequis

- Node 26 (version fixée dans `.nvmrc` : `nvm use`)
- npm 11 (fourni avec Node 26)
- Docker (ou OrbStack) et la [CLI Supabase](https://supabase.com/docs/guides/cli) : la base PostgreSQL et l'authentification tournent en local via `supabase start`

### Installation et lancement

```bash
npm install
npm run db:start   # démarre Supabase en local (Docker), la première fois télécharge les images
npm run db:env     # écrit apps/api/.env et apps/web/.env à partir de la pile locale
npm run dev        # app web (3000) : landing + dashboard, et API (3001)
```

- Studio (base de données, utilisateurs) : http://127.0.0.1:54323
- Mailpit (e-mails envoyés par Supabase Auth) : http://127.0.0.1:54324
- `npm run db:stop` arrête la pile, `npm run db:reset` recrée la base locale et rejoue les migrations de `supabase/migrations/`.

L'application web (`apps/web`, port 3000) regroupe la landing (`/`), la page de connexion (`/connexion`) et le dashboard protégé (`/dashboard`). L'inscription et la connexion passent par les routes serveur `/auth/*` de l'application web (`login`, `signup`, `logout`, `session`), qui appellent Supabase Auth ; la session vit dans des cookies `HttpOnly` que le navigateur ne peut pas lire, et il ne parle jamais à Supabase. Le navigateur ne parle qu'à `http://localhost:3000` pour l'API : l'application relaie les appels `/api/*` vers l'API (port 3001) en y ajoutant le jeton d'accès Supabase (`Authorization: Bearer`), que l'API vérifie localement grâce aux clés publiques (JWKS) de Supabase. Les cookies de session ne sont jamais transmis à l'API.

Les fichiers `.env` (ignorés par Git) sont générés par `npm run db:env` ; voir `apps/api/.env.example` et `apps/web/.env.example` pour la liste des variables (`SUPABASE_URL`, `SUPABASE_KEY` côté web, lues par le serveur uniquement et, en production, `NUXT_SUPABASE_URL` / `NUXT_SUPABASE_KEY` ; `DATABASE_URL`, `SUPABASE_URL` côté API). La clé `SUPABASE_KEY` est la clé publiable (publique par conception).

### Sécurité / déploiement

- Switchyard est mono-tenant par conception : chaque route de données doit filtrer par `request.user.id`.
- Les tables applicatives vivent dans le schéma privé `switchyard`, non exposé par l'API de données de Supabase (PostgREST) : seule l'API Switchyard y accède. **Toute table créée un jour dans le schéma `public` doit activer la RLS** (`enable row level security`) et définir ses politiques dans la même migration.
- La clé `service_role` / clé secrète de Supabase ne doit jamais se trouver dans l'application web, ni dans le navigateur. L'application web n'utilise que la clé publiable ; l'API n'a besoin d'aucune clé secrète pour vérifier les jetons.
- `supabase/config.toml` ne s'applique qu'à la pile locale (CLI). Sur un projet Supabase hébergé, réglez dans le tableau de bord : confirmation des e-mails activée, `site_url` réel et liste de redirections minimale (sans joker), SMTP personnalisé, CAPTCHA et limites de débit (les inscriptions sont ouvertes), protection contre les mots de passe compromis si disponible, expiration du JWT d'environ 15 min (`jwt_expiry = 900`).
- `SUPABASE_URL` doit être en `https` et `DATABASE_SSL=require` (par défaut en production ; `disable` n'est accepté qu'avec une base en loopback). L'API refuse de démarrer sinon.
- Le cookie de session est `HttpOnly`, `SameSite=Lax` et `Secure` (hors `nuxt dev`) : une faille XSS ne peut pas voler le jeton de rafraîchissement. Le navigateur ne reçoit ni l'URL ni la clé Supabase. L'app web applique une CSP stricte avec nonce par requête (`nuxt-security`) : `default-src 'self'; script-src 'self' 'nonce-…' 'strict-dynamic'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'; form-action 'self'; upgrade-insecure-requests` (en développement, `connect-src` autorise aussi `ws:`/`wss:` pour le HMR et l'upgrade HTTPS est retiré), ainsi que `nosniff`, `X-Frame-Options`, `Referrer-Policy` et `Permissions-Policy`.
- Toutes les requêtes vers Supabase Auth proviennent de l'IP du serveur Nitro : les limites de débit par IP du projet Supabase ne distinguent plus les visiteurs (relevez-les dans le tableau de bord). Les routes `/auth/login` et `/auth/signup` ont leur propre limiteur en mémoire, par processus (avec plusieurs instances, les compteurs ne sont pas partagés) : 10 tentatives par minute et par IP cliente, 5 échecs de connexion par couple e-mail + IP sur 15 minutes (un tiers ne peut donc pas verrouiller le compte de quelqu'un d'autre depuis son IP) et 50 échecs par e-mail sur 1 heure contre les attaques distribuées. Un e-mail non confirmé n'est pas compté comme un échec.
- IP cliente et reverse proxy : `NUXT_TRUSTED_PROXY_HOPS` (entier ≥ 0, défaut 0) indique le nombre de reverse proxies de confiance devant Nitro. À 0, `X-Forwarded-For` est ignoré. À N, l'IP cliente est la N-ième entrée en partant de la DROITE (celle ajoutée par votre proxy le plus externe) : les entrées de gauche sont fournies par le client et ne sont jamais utilisées. Si l'en-tête a moins d'entrées que de sauts, l'IP du socket est utilisée. L'ancienne variable `NUXT_TRUST_FRONT_PROXY` n'existe plus. Si l'API tourne dans un conteneur séparé, ajoutez l'hôte Nitro à `TRUST_PROXY` côté API.
- Origine publique : derrière un proxy qui termine le TLS sans transmettre l'hôte et le protocole d'origine, la vérification « même origine » (`Origin`) des routes `/auth/*` et `/api` échouerait. Définissez `NUXT_PUBLIC_ORIGIN` (ex. `https://switchyard.example.com`) : elle sert de référence à cette vérification et au lien de confirmation e-mail. Sinon l'URL de la requête est utilisée.
- Taille des requêtes : les `POST` de `/auth/*` exigent un `Content-Length` (411 sinon) d'au plus 4 Ko (413) ; le proxy `/api` refuse les corps de plus de 1 Mo (413) ou sans longueur déclarée (`Transfer-Encoding: chunked`, 411). Limitez aussi la taille des corps sur votre reverse proxy.
- Cache : toutes les pages HTML sont servies avec `Cache-Control: private, no-store` (le payload SSR peut contenir l'utilisateur) ; seuls les assets statiques (`/_nuxt/`, `/img/`, polices) restent cachables.
- Durée de session : le `Max-Age` du cookie (8 h) est glissant, réarmé à chaque rafraîchissement : ce n'est pas une durée de vie absolue. Pour borner la session, activez côté Supabase le time-box (`[auth.sessions] timebox`) et l'inactivité (`inactivity_timeout`).
- Rafraîchissement concurrent : plusieurs requêtes simultanées peuvent rafraîchir le même jeton. `refresh_token_reuse_interval` (10 s dans `supabase/config.toml`) doit rester > 0, sinon la perdante invaliderait la session. De plus, une requête dont le rafraîchissement échoue est traitée comme anonyme sans supprimer les cookies : seul `/auth/logout` les supprime.
- Confirmation d'e-mail : gardez-la TOUJOURS activée en production. Sans elle, l'inscription révèle l'existence d'un compte (« Un compte existe déjà ») et connecte immédiatement. Le lien de confirmation arrive sur `/auth/callback` (échange du code puis redirection) : ajoutez `<origine>/auth/callback` aux URL de redirection autorisées (déjà fait en local dans `supabase/config.toml`).
- Avant la première table métier : créez un rôle de base de données dédié à l'API, à moindres privilèges, avec accès uniquement au schéma `switchyard`, activez la RLS avec une politique sur `user_id`, et filtrez chaque requête par `request.user.id`.
- Gardez le port de l'API (y compris `/health`) interne : seul l'app web doit pouvoir l'atteindre.
- Définissez `ALLOWED_ORIGINS` sur l'origine publique de l'application web, ainsi que `SUPABASE_URL` et `DATABASE_URL` vers votre projet. L'API affiche des avertissements au démarrage en production si la configuration reste celle du développement.

### Workspaces

| Workspace             | Rôle                                                                | Port |
| --------------------- | ------------------------------------------------------------------- | ---- |
| `apps/web`            | Landing, connexion et dashboard (Nuxt + Vue Flow)                   | 3000 |
| `apps/api`            | API (Fastify) : `/health`, `/api/me`, `/api/integrations`           | 3001 |
| `packages/plugin-sdk` | Interface commune des intégrations (vérifications en lecture seule) | -    |

### Scripts principaux

| Commande               | Effet                                          |
| ---------------------- | ---------------------------------------------- |
| `npm run dev`          | Lance l'API et l'application web               |
| `npm run db:start`     | Démarre Supabase en local (Docker)             |
| `npm run db:stop`      | Arrête Supabase                                |
| `npm run db:reset`     | Recrée la base locale et rejoue les migrations |
| `npm run db:env`       | Génère les `.env` depuis la pile Supabase      |
| `npm run lint`         | ESLint sur tout le dépôt                       |
| `npm run format:check` | Vérifie le formatage Prettier                  |
| `npm run typecheck`    | Vérification des types de tous les workspaces  |
| `npm test`             | Tests Vitest                                   |
| `npm run build`        | Build de tous les workspaces                   |

Pour contribuer, voir [CONTRIBUTING.md](./CONTRIBUTING.md).
