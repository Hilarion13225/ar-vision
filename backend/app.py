"""API Flask : reçoit le recadrage d'un objet et renvoie sa fiche analysée par Gemini."""

import base64
import binascii
import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from PIL import UnidentifiedImageError

from cache import AnalysisCache, image_fingerprint
from gemini_client import GeminiVision, MockVision, RateLimitError, VisionServiceError

load_dotenv(Path(__file__).parent / ".env")

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("ar-vision")

MAX_IMAGE_BYTES = 4 * 1024 * 1024
ALLOWED_MIME = {"image/jpeg", "image/png", "image/webp"}
FRONTEND_DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"


def create_vision():
    mock_mode = os.getenv("GEMINI_MOCK", "").strip().lower()
    if mock_mode in {"1", "true", "yes", "ratelimit"}:
        log.info("Mode MOCK activé (%s) : aucune requête Gemini ne sera envoyée.", mock_mode)
        return MockVision(simulate_rate_limit=mock_mode == "ratelimit")
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        log.warning("GEMINI_API_KEY absente : /api/analyze renverra une erreur 503.")
        return None
    vision = GeminiVision(
        api_key=api_key,
        model=os.getenv("GEMINI_MODEL", "gemini-flash-lite-latest").strip(),
        fallback_model=os.getenv("GEMINI_FALLBACK_MODEL", "gemini-flash-latest").strip() or None,
        timeout_s=float(os.getenv("GEMINI_TIMEOUT_S", "10")),
    )
    log.info("Modèles Gemini : %s", vision.model)
    return vision


def error(message: str, status: int, code: str):
    return jsonify({"error": message, "code": code}), status


def decode_image(data_url: str) -> tuple[bytes, str]:
    """Accepte une data URL (`data:image/jpeg;base64,...`) ou du base64 brut."""
    mime_type = "image/jpeg"
    payload = data_url
    if data_url.startswith("data:"):
        header, _, payload = data_url.partition(",")
        mime_type = header[5:].split(";")[0] or mime_type
    if mime_type not in ALLOWED_MIME:
        raise ValueError(f"Format d'image non supporté : {mime_type}")
    image_bytes = base64.b64decode(payload, validate=True)
    if not image_bytes:
        raise ValueError("Image vide.")
    if len(image_bytes) > MAX_IMAGE_BYTES:
        raise ValueError("Image trop volumineuse (4 Mo max).")
    return image_bytes, mime_type


def create_app() -> Flask:
    app = Flask(__name__, static_folder=None)
    CORS(app, resources={r"/api/*": {"origins": "*"}})
    app.config["MAX_CONTENT_LENGTH"] = 8 * 1024 * 1024

    vision = create_vision()
    cache = AnalysisCache()

    @app.get("/api/health")
    def health():
        return jsonify(
            {
                "status": "ok",
                "vision": "disabled" if vision is None else vision.model,
                "cache_entries": len(cache),
            }
        )

    @app.post("/api/analyze")
    def analyze():
        body = request.get_json(silent=True) or {}
        label = str(body.get("label", "")).strip()[:50]
        # mode "box" (défaut) : l'image est un recadrage de l'objet.
        # mode "point" : l'image est centrée sur le doigt ; le modèle identifie l'objet touché
        # (n'importe quel objet réel) et renvoie sa boîte englobante.
        locate = body.get("mode") == "point"
        image_field = body.get("image")
        if not isinstance(image_field, str) or not image_field:
            return error("Champ 'image' manquant (base64 attendu).", 400, "bad_request")

        try:
            image_bytes, mime_type = decode_image(image_field)
            fingerprint = image_fingerprint(image_bytes)
        except (ValueError, binascii.Error, UnidentifiedImageError) as exc:
            return error(f"Image invalide : {exc}", 400, "bad_image")

        # Les deux modes ne renvoient pas la même chose (boîte ou non) : caches séparés.
        cache_label = f"point:{label}" if locate else (label or "objet")
        key = f"{cache_label}:{fingerprint}"
        cached = cache.get(cache_label, fingerprint)
        if cached is not None:
            log.info("Cache HIT %s", key)
            return jsonify({**cached, "cached": True})

        if vision is None:
            return error(
                "Analyse IA indisponible : la clé GEMINI_API_KEY n'est pas configurée sur le serveur.",
                503,
                "not_configured",
            )

        try:
            result = vision.analyze(image_bytes, mime_type, label if locate else (label or "objet"), locate=locate)
        except RateLimitError:
            log.warning("Quota Gemini atteint")
            return error(
                "Limite de requêtes gratuites atteinte. Patientez une minute avant de réessayer.",
                429,
                "rate_limited",
            )
        except VisionServiceError as exc:
            log.error("%s", exc)
            return error("Le service d'analyse IA est momentanément indisponible.", 502, "upstream")

        log.info("Analyse %s -> %s", key, result["nom"])
        cache.set(cache_label, fingerprint, result)
        return jsonify({**result, "cached": False})

    @app.errorhandler(413)
    def too_large(_):
        return error("Requête trop volumineuse.", 413, "too_large")

    # Sert le build du front (npm run build) : pratique pour exposer un seul port via ngrok.
    if FRONTEND_DIST.is_dir():

        @app.get("/", defaults={"path": ""})
        @app.get("/<path:path>")
        def frontend(path: str):
            if path and (FRONTEND_DIST / path).is_file():
                return send_from_directory(FRONTEND_DIST, path)
            return send_from_directory(FRONTEND_DIST, "index.html")

    return app


app = create_app()

if __name__ == "__main__":
    port = int(os.getenv("PORT", "5000"))
    app.run(host="0.0.0.0", port=port, debug=os.getenv("FLASK_DEBUG") == "1")
