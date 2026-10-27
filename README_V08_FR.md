# Météo & Vols v0.8

## Nouveautés
- Trajectoire réellement observée par le plugin pour l'avion sélectionné (trait continu).
- Recherche de la route uniquement au clic sur un avion.
- Aéroport d'arrivée affiché sur la carte avec son code IATA/ICAO.
- Liaison en pointillés entre la position actuelle et l'aéroport final.
- Popup persistante conservée pendant les rafraîchissements et enrichie avec départ/arrivée.
- Interpolation des mouvements conservée.

## Important : mise à jour du Worker Cloudflare
Cette version ajoute l'endpoint `/route`. Il faut donc remplacer le code de ton Worker Cloudflare par le contenu de `cloudflare-worker/worker.js`, puis cliquer sur Deploy.

## Mise à jour GitHub
Remplace les fichiers de `src/` et fais un commit. GitHub Actions republiera ensuite `plugin.js`.

## Limite de la trajectoire passée
La ligne continue correspond aux positions réellement vues depuis que le plugin suit cet avion pendant ta session. Elle ne reconstitue pas encore tout le vol depuis son décollage avant l'ouverture du plugin.
