# Windy Météo & Vols — v0.9.4

La fiche avion est maintenant un panneau indépendant en haut à gauche de Windy (hors du cadre de réglages). Elle est rattachée au `document.body` grâce à une action Svelte `portal`, ce qui évite d’être coupée par la fenêtre Windy. Elle reste visible même si le panneau principal est replié.

- Carte de l’avion indépendant : callsign, immatriculation, type, altitude, vitesse, cap, taux vertical, départ et arrivée.
- Aucune popup Leaflet ne couvre la carte.
- Le menu Météo & Vols retrouve son placement Windy habituel.
- Cliquer sur × dans la carte ferme uniquement la sélection de l’avion.

Installation : remplacez `src/plugin.svelte` et `src/pluginConfig.ts` dans le dépôt GitHub `LeG`, puis faites un commit.
