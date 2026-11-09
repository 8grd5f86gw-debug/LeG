# Météo & Vols v0.9.7 — Recherche de vol

## Nouveauté
Dans l’onglet **Vols**, saisir un numéro de vol (`AF898`) ou un indicatif ADS-B (`AFR898`), puis appuyer sur la loupe ou Entrée.
Le Worker interroge l’API publique adsb.lol par callsign sans limitation géographique. Si un appareil avec coordonnées est disponible, Windy se centre sur sa position et la fiche indépendante s’ouvre.

## Installation obligatoire — 2 étapes
1. **Cloudflare Worker** : remplacer entièrement le code du Worker actuellement utilisé par `cloudflare-worker/worker.js` et cliquer **Deploy**. Cela ajoute l'endpoint `/search?flight=AF898` tout en conservant `/aircraft` et `/route`.
   Tester dans Safari : `https://windy-adsb-proxy.4smmhrd2kk.workers.dev/search?flight=AF898`. La réponse doit être JSON contenant la propriété `ac`. Si l'avion n'est pas repéré, `ac: []` est normal.
2. **GitHub LeG** : remplacer `src/plugin.svelte`, `src/airTraffic.ts`, `src/pluginConfig.ts` depuis ce ZIP, faire Commit changes, vérifier Actions puis recharger Windy.

L'URL Windy reste `https://8grd5f86gw-debug.github.io/LeG/plugin.js`.

## Limites
- Les numéros IATA ne correspondent pas toujours aux callsigns ADS-B ; les principales compagnies sont converties (ex. AF → AFR). Pas de garantie pour tous les vols.
- Un avion au sol, non détecté, avec un transpondeur éteint ou un callsign différent ne sera pas trouvé.
- Le suivi et les positions dépendent de la couverture ADS-B communautaire. Le nom d’un vol ne suffit pas à reconstruire une position absente.
- Le nouveau Worker remplace l'ancien : aucun nouveau domaine Cloudflare à créer.
