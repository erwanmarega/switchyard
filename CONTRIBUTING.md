# Contribuer à Switchyard

## Modèle de branches

- `main` : releases, toujours déployable.
- `develop` : intégration continue du travail.
- `feature/<nom-court>` et `fix/<nom-court>` : créées depuis `develop`, fusionnées par pull request vers `develop`.
- Release : pull request `develop` vers `main`.
- Correctif urgent : branche `fix/<nom-court>` créée depuis `main`, pull request vers `main`, puis fusion de `main` dans `develop` pour rester synchronisé.

## Commits : Conventional Commits

Format : `type(portée optionnelle): description à l'impératif`.

Types : `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `ci`.

```
feat(web): afficher le chemin du projet avec Vue Flow
fix(api): renvoyer 404 pour une intégration inconnue
docs: documenter le modèle de branches
chore: mettre à jour les dépendances
refactor(plugin-sdk): extraire la validation des chemins
test(web): couvrir toFlowElements
ci: ajouter le workflow de vérification
```

## Checklist de pull request

Avant de demander une relecture, vérifiez que tout est vert en local (la CI exécute les mêmes commandes) :

- [ ] `npm run lint`
- [ ] `npm run format:check`
- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] Des tests couvrent le nouveau comportement
- [ ] Les nouvelles tables vont dans le schéma privé `switchyard` (migration dans `supabase/migrations/`) ; toute table `public` active la RLS
- [ ] Aucun secret (clé d'API, token, `.env`) dans le code, les logs ou les commits

## Ajouter une intégration

Une intégration est décrite avec `defineIntegration` du paquet `@switchyard/plugin-sdk` (voir `packages/plugin-sdk/README.md`) :

1. Définissez un `id`, un `name`, le `credentialsSchema` (marquez les champs sensibles avec `secret: true`) et la liste des `checks`.
2. Chaque `check` expose un `id`, un `title` et une fonction `run(ctx)` qui renvoie un `CheckResult` (`ok`, `warning`, `error` ou `unknown`).
3. Enregistrez l'intégration dans le registre de l'API (`apps/api/src/integrations/registry.ts`).
4. Ajoutez des tests pour chaque vérification.

Principe fondamental : **lecture seule**. Une vérification observe un outil et rapporte un état, elle ne modifie jamais rien chez le fournisseur. Demandez uniquement des permissions en lecture (tokens en lecture seule, scopes minimaux) et ne journalisez jamais les champs `secret`.

## Commandes

```bash
npm install            # installe tous les workspaces
npm run db:start       # Supabase local (Docker + CLI Supabase), puis npm run db:env une fois
npm run dev            # app web (3000) : landing + dashboard, et API (3001)
npm run lint           # ESLint (lint:fix pour corriger)
npm run format         # Prettier (format:check pour vérifier)
npm run typecheck      # types de tous les workspaces
npm test               # Vitest (test:watch en continu)
SWITCHYARD_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npm test
                       # + tests Postgres (isolation RLS) sur la pile locale
npm run build          # build de tous les workspaces
```
