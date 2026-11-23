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
- **Base de données** : SQLite par défaut, PostgreSQL en option
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

### Installation et lancement

```bash
npm install
npm run dev        # app web (3000) : landing + dashboard + API (3001)
```

L'application web (`apps/web`, port 3000) regroupe la landing (`/`), la page de connexion (`/connexion`) et le dashboard protégé (`/dashboard`). Elle relaie les appels `/api/*` vers l'API (port 3001) : le navigateur ne parle qu'à `http://localhost:3000`, et le cookie de session reste sur la même origine.

Copiez `apps/web/.env.example` en `apps/web/.env` pour changer l'URL de l'API utilisée par ce relais (`NUXT_API_BASE`).

### Sécurité / déploiement

- Switchyard est mono-tenant par conception : chaque route de données doit filtrer par `request.user.id`.
- Les inscriptions sont ouvertes par défaut. Une fois vos comptes créés, fermez-les avec `ALLOW_REGISTRATION=false` (l'API affiche un avertissement au démarrage en production si elles restent ouvertes).
- En production, définissez `ALLOWED_ORIGINS` (origine publique de l'application web) et `COOKIE_SECURE=true` (activé par défaut avec `NODE_ENV=production`, HTTPS requis).
- Derrière un reverse proxy de confiance placé devant l'app web, activez `NUXT_TRUST_FRONT_PROXY=true` ; si l'API tourne dans un conteneur séparé, ajoutez l'hôte Nitro à `TRUST_PROXY` côté API.

### Workspaces

| Workspace             | Rôle                                                                | Port |
| --------------------- | ------------------------------------------------------------------- | ---- |
| `apps/web`            | Landing, connexion et dashboard (Nuxt + Vue Flow)                   | 3000 |
| `apps/api`            | API (Fastify) : `/health`, `/api/auth/*`, `/api/integrations`       | 3001 |
| `packages/plugin-sdk` | Interface commune des intégrations (vérifications en lecture seule) | -    |

### Scripts principaux

| Commande               | Effet                                         |
| ---------------------- | --------------------------------------------- |
| `npm run dev`          | Lance l'API et l'application web              |
| `npm run lint`         | ESLint sur tout le dépôt                      |
| `npm run format:check` | Vérifie le formatage Prettier                 |
| `npm run typecheck`    | Vérification des types de tous les workspaces |
| `npm test`             | Tests Vitest                                  |
| `npm run build`        | Build de tous les workspaces                  |

Pour contribuer, voir [CONTRIBUTING.md](./CONTRIBUTING.md).
