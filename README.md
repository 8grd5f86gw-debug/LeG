# Windy Day / Night plugin

Plugin Windy.com qui affiche :

- la zone de nuit avec une transparence réglable ;
- la ligne du terminateur solaire ;
- une synchronisation avec le `timestamp` de la timeline Windy.

## Développement local

Prérequis : Node.js récent.

```bash
npm install
npm start
```

Puis ouvrir :

`https://www.windy.com/developer-mode`

et charger :

`https://localhost:9999/plugin.js`

## Compilation

```bash
npm run build
```

Les fichiers sont produits dans `dist/`.

## GitHub Pages

Le workflow `.github/workflows/deploy-pages.yml` compile et publie automatiquement le plugin à chaque push sur `main`.

Dans GitHub, activer une seule fois :

**Settings → Pages → Build and deployment → Source → GitHub Actions**

URL attendue pour ce dépôt :

`https://8grd5f86gw-debug.github.io/LeG/plugin.js`

Version minifiée :

`https://8grd5f86gw-debug.github.io/LeG/plugin.min.js`

## Structure

```text
.
├── .github/workflows/deploy-pages.yml
├── src/
│   ├── plugin.svelte
│   ├── pluginConfig.ts
│   └── solar.ts
├── package.json
├── rollup.config.js
├── svelte.config.js
└── tsconfig.json
```
