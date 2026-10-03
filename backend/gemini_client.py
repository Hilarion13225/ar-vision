"""Appel au modèle de vision Gemini via le SDK officiel `google-genai`."""

import json
import logging
import random
import time

from google import genai
from google.genai import errors, types

log = logging.getLogger("ar-vision")

PROMPT = """Tu es un assistant de reconnaissance d'objets pour une application de réalité augmentée.
Le détecteur local pense que l'image montre : « {label} » (indice possiblement imprécis).
Identifie précisément l'objet principal de l'image (marque ou modèle si clairement visible).

Réponds UNIQUEMENT avec un objet JSON valide, en français, de la forme :
{{"nom": "...", "categorie": "...", "description": "...", "faits": ["...", "...", "..."]}}

Règles :
- "nom" : nom court et précis de l'objet (5 mots max).
- "categorie" : catégorie générale en un ou deux mots.
- "description" : 2 phrases maximum.
- "faits" : exactement 3 faits courts, intéressants et exacts (15 mots max chacun).
"""

RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "nom": {"type": "string"},
        "categorie": {"type": "string"},
        "description": {"type": "string"},
        "faits": {"type": "array", "items": {"type": "string"}, "minItems": 3, "maxItems": 3},
    },
    "required": ["nom", "categorie", "description", "faits"],
}


class RateLimitError(Exception):
    """Quota de l'offre gratuite atteint (HTTP 429)."""


class VisionServiceError(Exception):
    """Le service Gemini est indisponible ou a renvoyé une réponse inexploitable."""


# Erreurs passagères pour lesquelles on bascule sur le modèle de repli.
FALLBACK_CODES = {429, 500, 503, 504}
# Délai du dernier modèle tenté : la somme reste sous le timeout du front (25 s).
LAST_ATTEMPT_TIMEOUT_MS = 13000
# Délai minimal accepté par l'API Gemini.
MIN_TIMEOUT_MS = 10000


class GeminiVision:
    """Interroge le modèle principal, puis le modèle de repli s'il est saturé ou trop lent."""

    def __init__(self, api_key: str, model: str, fallback_model: str | None = None, timeout_s: float = 10):
        self._client = genai.Client(api_key=api_key)
        self.models = [model] + ([fallback_model] if fallback_model and fallback_model != model else [])
        self.model = " → ".join(self.models)
        self._timeout_ms = max(MIN_TIMEOUT_MS, int(timeout_s * 1000))

    def analyze(self, image_bytes: bytes, mime_type: str, label: str) -> dict:
        contents = [types.Part.from_bytes(data=image_bytes, mime_type=mime_type), PROMPT.format(label=label)]
        last_error = None
        last_code = None

        for index, model in enumerate(self.models):
            is_last = index == len(self.models) - 1
            try:
                response = self._client.models.generate_content(
                    model=model,
                    contents=contents,
                    config=types.GenerateContentConfig(
                        response_mime_type="application/json",
                        response_json_schema=RESPONSE_SCHEMA,
                        temperature=0.4,
                        automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
                        http_options=types.HttpOptions(
                            timeout=LAST_ATTEMPT_TIMEOUT_MS if is_last else self._timeout_ms
                        ),
                    ),
                )
                result = normalize_result(response.text)
                log.info("Réponse de %s", response.model_version or model)
                return result
            except errors.APIError as exc:
                last_code = exc.code
                last_error = VisionServiceError(f"Erreur Gemini {exc.code} ({model}) : {exc.message}")
                if exc.code not in FALLBACK_CODES:
                    raise last_error from exc
            except VisionServiceError as exc:
                last_error, last_code = exc, None
            except Exception as exc:  # réseau, timeout…
                last_error, last_code = VisionServiceError(f"Gemini injoignable ({model}) : {exc}"), None
            if not is_last:
                log.warning("%s — bascule sur %s", last_error, self.models[index + 1])

        if last_code == 429:
            raise RateLimitError(str(last_error))
        raise last_error


def normalize_result(raw_text: str | None) -> dict:
    """Parse et valide la réponse JSON du modèle."""
    if not raw_text:
        raise VisionServiceError("Réponse vide du modèle.")

    text = raw_text.strip()
    # Filet de sécurité si le modèle entoure malgré tout le JSON de ```json … ```
    if text.startswith("```"):
        text = text.strip("`").removeprefix("json").strip()

    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        raise VisionServiceError("Réponse du modèle non JSON.") from exc

    faits = [str(f).strip() for f in data.get("faits", []) if str(f).strip()][:3]
    result = {
        "nom": str(data.get("nom", "")).strip(),
        "categorie": str(data.get("categorie", "")).strip(),
        "description": str(data.get("description", "")).strip(),
        "faits": faits,
    }
    if not result["nom"]:
        raise VisionServiceError("Le modèle n'a pas identifié l'objet.")
    return result


class MockVision:
    """Réponses simulées pour développer sans clé ni quota (GEMINI_MOCK=1).

    GEMINI_MOCK=ratelimit simule un quota épuisé, pour tester l'affichage de l'erreur.
    """

    def __init__(self, simulate_rate_limit: bool = False):
        self.simulate_rate_limit = simulate_rate_limit
        self.model = "mock-ratelimit" if simulate_rate_limit else "mock"

    def analyze(self, image_bytes: bytes, mime_type: str, label: str) -> dict:
        time.sleep(random.uniform(0.6, 1.2))  # simule la latence réseau
        if self.simulate_rate_limit:
            raise RateLimitError("Quota simulé atteint.")
        return {
            "nom": label.capitalize(),
            "categorie": "Objet du quotidien",
            "description": f"Ceci est une réponse simulée pour « {label} ». "
            "Ajoutez votre clé GEMINI_API_KEY pour une vraie analyse.",
            "faits": [
                "Le mode mock n'appelle aucune API.",
                "Il permet de tester l'interface hors quota.",
                f"Image reçue : {len(image_bytes) // 1024} Ko.",
            ],
        }
