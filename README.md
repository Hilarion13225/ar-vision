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

> **« Cette page ne fonctionne pas — n'a envoyé aucune donnée »** : l'adresse a été ouverte en
> `http://`. Le serveur n'écoute qu'en HTTPS : tapez explicitement `https://` devant l'adresse.
>
> Windows : si le téléphone n'atteint pas le serveur (page qui charge longtemps puis expire),
> autorisez Node.js dans le pare-feu (réseau privé) au premier lancement.

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

**Caméra** (`frontend/src/hooks/useCamera.js`) : flux 1080p, autofocus continu si disponible.
Sur les téléphones à plusieurs capteurs, l'app bascule sur la caméra arrière principale plutôt
que sur l'ultra grand-angle ou la macro que le navigateur choisit parfois (`lib/cameraSelect.js`).

**Flash** : un bouton ⚡ apparaît en haut à droite quand le navigateur permet de piloter le flash
(Chrome Android notamment). La luminosité de l'image est mesurée en continu (`hooks/useLowLight.js`) :
dans le noir, le bouton pulse et une indication propose de l'allumer.

**Détection locale** (`frontend/src/hooks/useDetection.js`) : COCO-SSD (`lite_mobilenet_v2`, le plus
rapide) tourne en continu sur WebGL. Un tracker léger (`lib/tracker.js`) associe les détections
d'une frame à l'autre (IoU), lisse les positions et attribue un identifiant stable à chaque objet.
C'est grâce à lui que la carte peut suivre l'objet. La détection tourne sur une copie réduite de
l'image (640 px) ; les cadres glissent d'une détection à la suivante en un intervalle de détection
mesuré, ce qui garde un mouvement continu même quand l'appareil ne détecte que 10 fois par seconde.
Ajoutez `?debug` à l'adresse pour afficher la cadence de détection (FPS) et le backend utilisé.

**Analyse au tap — tous les objets réels** : COCO-SSD ne connaît que 80 catégories courantes.
Pour le reste (chaussure, plante, outil, monument…), **on peut toucher n'importe quel endroit de
l'image**. Un carré centré sur le doigt (la moitié du petit côté, 640 px max, JPEG) part à
`POST /api/analyze` en mode `point` ; Gemini identifie l'objet sous le doigt et renvoie sa boîte
englobante, que l'app dessine. Si cette boîte correspond à un cadre COCO-SSD, la carte s'y accroche
et suit l'objet ; sinon le cadre reste fixe à l'endroit où l'objet a été touché.

```json
// requête
{ "mode": "point", "image": "data:image/jpeg;base64,..." }
// réponse ("boite" : [ymin, xmin, ymax, xmax] normalisés 0-1000 dans l'image envoyée)
{ "nom": "...", "categorie": "...", "description": "...", "faits": ["...", "...", "..."], "boite": [336, 263, 693, 730], "cached": false }
```

Sans `mode`, l'API garde le comportement d'origine : l'image est un recadrage de l'objet, `label`
sert d'indice, et la réponse n'a pas de `boite`.

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
| Adresse tapée en `http://`        | Redirection automatique vers `https://` (`frontend/httpsRedirect.js`) |
| Page servie sans HTTPS            | Écran « Connexion sécurisée requise » avec explication         |
| Caméra refusée / absente / occupée | Écran dédié avec consigne (réglages iOS) et bouton Réessayer  |
| Modèle COCO-SSD non chargé        | Message et bouton Réessayer                                    |
| Aucun objet détecté pendant 2,5 s | « Aucun objet détecté — touchez n'importe quel objet pour l'analyser » |
| Scène trop sombre                 | Proposition d'allumer le flash, ou de se rapprocher de la lumière |
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
  src/hooks/                  useCamera, useCocoModel, useDetection, useLowLight, useViewport
  src/lib/                    tracker, géométrie (object-fit: cover), recadrage, choix de caméra, API, libellés FR
  src/components/             DetectionBox, ARCard, écrans d'accueil et d'erreur
  vite.config.js              HTTPS auto-signé + proxy /api
  httpsRedirect.js            redirige http:// vers https:// sur le même port
```

## Conseils pour la vidéo de démo

- Bonne lumière (ou le flash ⚡), objets bien séparés : tasse, bouteille, clavier, plante, livre…
- Montrez aussi un objet hors des 80 catégories (chaussure, outil, fruit exotique) en touchant
  directement l'objet : c'est ce qui montre que l'IA reconnaît vraiment tout.
- Tenez le téléphone stable une demi-seconde avant de toucher : le cadre se stabilise.
- Un premier tap « chauffe » le cache : refaire la prise avec le même objet donne une réponse instantanée.
- Testez d'abord l'interface avec `GEMINI_MOCK=1` pour ne pas consommer de quota.

## Feuille de route

- **Phase 1 (cette version)** : caméra, détection, tap, analyse Gemini, carte AR.
- **Phase 2** : PostgreSQL (`users`, `scans`, `objects` comme cache persistant) et écran d'historique.
