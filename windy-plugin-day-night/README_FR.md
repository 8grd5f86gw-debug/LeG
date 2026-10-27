# Plugin Windy — Jour / Nuit

Ce dossier contient le code source d'un plugin Windy qui affiche :

- la moitié de la Terre actuellement dans la nuit ;
- le terminateur solaire (frontière jour/nuit) ;
- une opacité réglable ;
- une synchronisation avec la date et l'heure sélectionnées dans la timeline Windy.

Le calcul est local : aucune API externe ni clé API n'est nécessaire.

## Installation sur macOS

Le système de plugins Windy actuel utilise le template officiel TypeScript + Svelte.

### 1. Installer Node.js

Si `node -v` fonctionne déjà dans Terminal, passe à l'étape suivante.

Sinon, installe une version récente de Node.js depuis nodejs.org.

### 2. Récupérer le template officiel Windy

Dans Terminal :

```bash
git clone https://github.com/windycom/windy-plugin-template.git
cd windy-plugin-template
npm install
```

### 3. Remplacer les fichiers source

Copie les deux fichiers de `src/` de ce dossier dans le dossier `src/` du template Windy :

- `plugin.svelte`
- `pluginConfig.ts`
- `solar.ts`

Donc le template doit contenir :

```text
windy-plugin-template/
└── src/
    ├── plugin.svelte
    ├── pluginConfig.ts
    └── solar.ts
```

### 4. Lancer le plugin

Dans le dossier `windy-plugin-template` :

```bash
npm start
```

Windy sert alors le plugin localement sur :

```text
https://localhost:9999/plugin.js
```

### 5. Ouvrir le mode développeur Windy

Dans Safari ou Chrome, ouvre :

```text
https://www.windy.com/developer-mode
```

Puis charge :

```text
https://localhost:9999/plugin.js
```

Le navigateur peut afficher un avertissement de certificat HTTPS local : autorise le certificat pour le test local.

## Fonctionnement

Le plugin lit directement `store.get('timestamp')` dans Windy. Lorsque tu déplaces la timeline météo, il recalcule la position du Soleil et redessine automatiquement la moitié nocturne de la Terre.

La zone noire utilise une opacité de 42 % par défaut. Le réglage peut être changé dans le petit panneau du plugin.

## Limites de cette v0.1

Cette première version affiche le jour/nuit et le terminateur. Elle n'affiche pas encore séparément :

- le crépuscule civil (-6°) ;
- le crépuscule nautique (-12°) ;
- le crépuscule astronomique (-18°).

Ces trois bandes peuvent être ajoutées dans une v0.2.
