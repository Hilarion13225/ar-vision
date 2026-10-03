# AR Vision — reconnaissance d'objets en réalité augmentée

Pointez la caméra du téléphone vers un objet : il est détecté en temps réel dans le navigateur
(TensorFlow.js + COCO-SSD). Touchez son cadre : l'image recadrée est analysée par **Google Gemini**
et une carte d'informations translucide s'accroche à l'objet et le suit.

Fonctionne sur **Safari iOS** et **Chrome Android** (pas de WebXR). 100 % gratuit.

```
┌───────────── Navigateur (React + Vite) ──────────────┐        ┌──────── Flask ────────┐
│ getUserMedia ─► COCO-SSD ─► tracker ─► cadres animés │  tap   │ /api/analyze          │
│                                     └► recadrage JPEG├───────►│  cache (label+dHash)  │
│ carte AR accrochée au cadre ◄────────────────────────┤◄───────┤  Gemini (JSON strict) │
└──────────────────────────────────────────────────────┘  JSON  └───────────────────────┘
```

## Prérequis

- Node.js 20+ et Python 3.10+
- Une clé API Gemini gratuite : <https://aistudio.google.com/apikey>
- Le téléphone et l'ordinateur sur le même Wi-Fi (ou ngrok, voir plus bas)

## Installation

```bash
# Back-end
cd backend
python -m venv .venv
# Windows : .venv\Scripts\activate    —    macOS/Linux : source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # puis renseignez GEMINI_API_KEY dans backend/.env

# Front-end
cd ../frontend
npm install
```

## Lancement (2 terminaux)

```bash
# Terminal 1 — API Flask sur http://localhost:5000
cd backend && python app.py

# Terminal 2 — front en HTTPS (certificat auto-signé) sur https://<IP-locale>:5173
cd frontend && npm run dev
```

Vite affiche l'adresse réseau (`Network: https://192.168.x.x:5173`). Ouvrez-la **sur le téléphone**,
acceptez l'avertissement de certificat (« Afficher les détails › Visiter ce site » sur Safari,
« Paramètres avancés › Continuer » sur Chrome), puis touchez **Démarrer** et autorisez la caméra.

Le front appelle `/api` en relatif ; Vite relaie ces requêtes vers Flask (proxy). Le téléphone n'a
donc besoin d'accéder qu'au port 5173, en HTTPS, sans problème de contenu mixte ni de CORS.

> Windows : si le téléphone n'atteint pas le serveur, autorisez Node.js dans le pare-feu
> (réseau privé) au premier lancement.

### Alternative : tunnel ngrok (HTTPS valide, sans avertissement)

Nécessite un compte ngrok gratuit et `ngrok config add-authtoken <token>`.

**Option A — mode développement (rechargement à chaud)**

```bash
cd backend && python app.py           # terminal 1
cd frontend && npm run dev:tunnel     # terminal 2 : Vite en HTTP simple
ngrok http 5173                       # terminal 3 : ouvrez l'URL https://….ngrok-free.app
```

**Option B — un seul port (build de production servi par Flask)**

```bash
cd frontend && npm run build          # génère frontend/dist, servi automatiquement par Flask
cd ../backend && python app.py
ngrok http 5000
```

## Configuration (`backend/.env`)

| Variable         | Rôle                                                                      | Défaut                |
|------------------|---------------------------------------------------------------------------|-----------------------|
| `GEMINI_API_KEY` | Clé de l'API Gemini (offre gratuite)                                      | —                     |
| `GEMINI_MODEL`   | Modèle multimodal (~1,3 s par analyse). L'alias suit le Flash-Lite le plus récent | `gemini-flash-lite-latest` |
| `GEMINI_FALLBACK_MODEL` | Modèle de repli si le principal est saturé (503), à court de quota (429) ou trop lent | `gemini-flash-latest` |
| `GEMINI_TIMEOUT_S` | Délai accordé au modèle principal avant le repli (10 s minimum imposé par l'API) | `10` |
| `GEMINI_MOCK`    | `1` : réponses simulées sans appel API · `ratelimit` : simule un quota épuisé | `0`               |
| `PORT`           | Port de l'API Flask                                                       | `5000`                |

`gemini-flash-latest` est un peu plus précis (ex. « Beagle-Harrier » plutôt que « Beagle ») mais nettement
plus lent (4 à 15 s, souvent saturé) : Flash-Lite est le meilleur choix pour une démo fluide.

## Fonctionnement

**Détection locale** (`frontend/src/hooks/useDetection.js`) : COCO-SSD (`lite_mobilenet_v2`, le plus
rapide) tourne en continu sur WebGL. Un tracker léger (`lib/tracker.js`) associe les détections
d'une frame à l'autre (IoU), lisse les positions et attribue un identifiant stable à chaque objet.
C'est grâce à lui que la carte peut suivre l'objet. Les cadres sont positionnés en CSS
(`transform`) avec une courte transition : ils glissent au lieu de sauter.

**Analyse au tap** : l'objet est recadré dans la frame vidéo native (avec marge, 640 px max, JPEG),
encodé en base64 et envoyé à `POST /api/analyze` :

```json
// requête
{ "label": "cup", "image": "data:image/jpeg;base64,..." }
// réponse
{ "nom": "...", "categorie": "...", "description": "...", "faits": ["...", "...", "..."], "cached": false }
```

Gemini est appelé avec `response_mime_type: application/json` et un schéma JSON, ce qui garantit
une réponse exploitable.

**Cache** (`backend/cache.py`) : clé = label COCO + **empreinte perceptuelle** (dHash 64 bits) de
l'image. La recherche tolère une distance de Hamming de 6 bits : un nouveau tap sur le même objet,
même légèrement décadré, retrouve l'analyse instantanément sans consommer de quota. Cache mémoire LRU (500 entrées, 24 h), il sera rendu
persistant en phase 2.

**Carte AR** (`components/ARCard.jsx`) : placée au-dessus du cadre, sinon en dessous, sinon sur sa
partie basse si l'objet remplit l'écran. Sa flèche pointe vers l'objet. Si l'objet sort du champ,
la piste survit 1,5 s puis la carte se range en bas de l'écran (« Objet hors champ »).

## Gestion des erreurs

| Situation                         | Comportement                                                   |
|-----------------------------------|----------------------------------------------------------------|
| Page ouverte en HTTP              | Écran « Connexion sécurisée requise » avec explication         |
| Caméra refusée / absente / occupée | Écran dédié avec consigne (réglages iOS) et bouton Réessayer  |
| Modèle COCO-SSD non chargé        | Message et bouton Réessayer                                    |
| Aucun objet détecté pendant 2,5 s | Indication « Aucun objet détecté — visez un objet du quotidien » |
| Quota Gemini atteint (429)        | « Limite de requêtes gratuites atteinte. Patientez une minute… » |
| Clé absente                       | Erreur 503 explicite                                           |
| Flask arrêté / Gemini en panne    | Message « Serveur d'analyse injoignable » / « momentanément indisponible » |
| Analyse trop longue (> 25 s)      | Requête annulée, message « Réessayez »                         |

## Structure

```
backend/
  app.py              routes Flask, validation, gestion des erreurs, service du build
  gemini_client.py    appel Gemini (SDK google-genai), prompt, validation JSON, mock
  cache.py            cache LRU + empreinte perceptuelle dHash
  requirements.txt
  .env.example
frontend/
  src/App.jsx                 orchestration : caméra, détection, tap, carte
  src/hooks/                  useCamera, useCocoModel, useDetection, useViewport
  src/lib/                    tracker, géométrie (object-fit: cover), recadrage, API, libellés FR
  src/components/             DetectionBox, ARCard, écrans d'accueil et d'erreur
  vite.config.js              HTTPS auto-signé + proxy /api
```

## Conseils pour la vidéo de démo

- Bonne lumière, objets bien séparés : tasse, bouteille, clavier, plante, livre, téléphone…
- Tenez le téléphone stable une demi-seconde avant de toucher : le cadre se stabilise.
- Un premier tap « chauffe » le cache : refaire la prise avec le même objet donne une réponse instantanée.
- Testez d'abord l'interface avec `GEMINI_MOCK=1` pour ne pas consommer de quota.

## Feuille de route

- **Phase 1 (cette version)** : caméra, détection, tap, analyse Gemini, carte AR.
- **Phase 2** : PostgreSQL (`users`, `scans`, `objects` comme cache persistant) et écran d'historique.
