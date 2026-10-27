# Windy Météo & Vols — v0.7

Cette version conserve les popups ouvertes pendant les rafraîchissements ADS-B et interpole les positions des avions entre deux relevés.

## Changements
- popup avion persistante pendant les refresh
- mise à jour du contenu de la popup sans la fermer
- interpolation fluide des positions et du cap
- suppression de la ligne « Palier couleur » dans la popup
- conservation des couleurs d'altitude sur les icônes
- tolérance aux avions absents d'un seul refresh avant suppression

Le proxy Cloudflare configuré reste : `https://windy-adsb-proxy.4smmhrd2kk.workers.dev`
