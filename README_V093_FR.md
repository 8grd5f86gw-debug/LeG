# Météo & Vols v0.9.3 — fiche avion en haut

Cette version conserve la carte, le suivi ADS-B, le tracé, l'interpolation et le proxy existants.

## Modifications
- Fiche de l'avion déplacée **directement sous le titre Météo & Vols**, avant les onglets.
- Les réglages **Ciel / Vols** restent en dessous de la fiche.
- Quand un avion est sélectionné, le panneau s'ouvre et bascule sur Vols.
- La fiche dispose de son propre défilement si la hauteur de l'écran est limitée.
- Pas de popup blanche sur la carte.

## Installation dans GitHub
Remplacer `src/plugin.svelte` et `src/pluginConfig.ts` dans le dépôt LeG, puis faire Commit changes.
Ne rien changer au Worker Cloudflare.

URL du plugin : https://8grd5f86gw-debug.github.io/LeG/plugin.js
