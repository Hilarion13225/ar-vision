# Projet : Assistant AR de reconnaissance d'objets par IA

## Objectif
Application web mobile : l'utilisateur pointe la caméra de son téléphone sur un objet,
l'application le détecte en temps réel, et quand il tape dessus, une IA de vision
l'analyse et affiche une carte d'informations superposée à l'objet (effet réalité augmentée).
Le but premier est une démo vidéo convaincante pour LinkedIn : fluidité et rendu visuel avant tout.

## Stack imposée
- Front-end : React (Vite), TensorFlow.js + modèle COCO-SSD, overlay en CSS positionné (Three.js optionnel)
- Back-end : Flask (Python)
- IA de vision : API Google Gemini (offre gratuite), via le SDK Python officiel de Google,
  clé lue depuis une variable d'environnement `GEMINI_API_KEY`. Utiliser un modèle Gemini
  multimodal rapide disponible dans l'offre gratuite. Le projet doit rester 100 % gratuit.
- Base de données : PostgreSQL (phase 2 uniquement)

## Architecture
1. **Détection locale (front)** : flux caméra via `getUserMedia` (caméra arrière, plein écran).
   COCO-SSD détecte les objets en continu et dessine des cadres animés autour d'eux.
2. **Analyse au tap (back)** : au tap sur un cadre, le front recadre l'image de l'objet,
   l'encode en base64 et l'envoie à `POST /api/analyze`.
3. **Flask** envoie l'image au modèle de vision Gemini avec une consigne demandant
   UNIQUEMENT un JSON : `{ "nom", "categorie", "description" (2 phrases max), "faits": [3 faits courts] }`.
   Mettre en cache les résultats (par label + hash d'image) pour économiser le quota gratuit,
   et afficher un message clair si la limite de requêtes est atteinte.
4. **Affichage AR** : une carte élégante (fond translucide, apparition animée) s'accroche
   au cadre de l'objet et le suit tant qu'il est détecté.

## Phases
- **Phase 1 (démo)** : caméra + détection + tap + analyse + carte AR. Pas de base de données.
- **Phase 2** : PostgreSQL avec tables `users`, `scans` (historique), `objects` (cache persistant),
  et un écran d'historique des scans.

## Contraintes
- Doit fonctionner sur Safari iOS et Chrome Android (ne pas dépendre de WebXR).
- HTTPS requis pour la caméra sur mobile : prévoir une solution pour tester en local
  depuis le téléphone (ex. `vite --host` avec certificat, ou tunnel type ngrok).
- Gestion propre des erreurs : caméra refusée, API indisponible, aucun objet détecté.
- Code lisible, structuré, avec un README expliquant installation et lancement.

## Livrables
- Dossiers `frontend/` et `backend/`, `requirements.txt`, `package.json`, `.env.example`, `README.md`.
- Commencer par la phase 1 de bout en bout, la tester, puis proposer la phase 2.
