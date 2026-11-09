# Météo & Vols v0.9.5 — deux fenêtres séparées

- **Fiche avion** : fenêtre flottante en haut à gauche, indépendante du conteneur du plugin, avec informations et trajet.
- **Menu Météo & Vols** : fenêtre de réglage sur la droite.
- **Petits écrans** : menu réduit automatiquement à la sélection d’un avion pour rendre la fiche lisible ; il peut être rouvert avec la flèche.
- Aucun changement au Cloudflare Worker ni aux fonctions ADS-B.

## Mise à jour GitHub
Remplacer uniquement `src/plugin.svelte` et `src/pluginConfig.ts`, puis faire *Commit changes* sur `main`. Vérifier **Actions > Build and deploy Windy plugin** avant de recharger Windy.
