"""Cache mémoire des analyses, indexé par label COCO + empreinte perceptuelle de l'image.

On utilise un "difference hash" (dHash) plutôt qu'un hash cryptographique : deux recadrages
quasi identiques du même objet (léger tremblement de la main) produisent la même empreinte,
ce qui évite de consommer le quota Gemini à chaque tap.
"""

import io
import threading
import time
from collections import OrderedDict

from PIL import Image


def image_fingerprint(image_bytes: bytes, hash_size: int = 8) -> str:
    """Retourne un dHash hexadécimal de 64 bits de l'image."""
    with Image.open(io.BytesIO(image_bytes)) as img:
        small = img.convert("L").resize((hash_size + 1, hash_size), Image.Resampling.LANCZOS)
        pixels = list(small.getdata())

    bits = 0
    for row in range(hash_size):
        for col in range(hash_size):
            left = pixels[row * (hash_size + 1) + col]
            right = pixels[row * (hash_size + 1) + col + 1]
            bits = (bits << 1) | (left > right)
    return f"{bits:016x}"


class AnalysisCache:
    """Cache LRU thread-safe avec expiration.

    La recherche tolère de petites différences d'empreinte (distance de Hamming) pour un même
    label : un cadre décalé de quelques pixels retrouve l'analyse déjà faite.
    """

    def __init__(self, max_entries: int = 500, ttl_seconds: int = 24 * 3600, max_distance: int = 6):
        self._data: OrderedDict[tuple[str, str], tuple[float, dict]] = OrderedDict()
        self._max_entries = max_entries
        self._ttl = ttl_seconds
        self._max_distance = max_distance
        self._lock = threading.Lock()

    @staticmethod
    def _normalize(label: str) -> str:
        return label.strip().lower()

    def get(self, label: str, fingerprint: str) -> dict | None:
        label = self._normalize(label)
        target = int(fingerprint, 16)
        now = time.time()
        with self._lock:
            best_key, best_distance = None, self._max_distance + 1
            for key, (stored_at, _) in list(self._data.items()):
                if now - stored_at > self._ttl:
                    del self._data[key]
                    continue
                if key[0] != label:
                    continue
                distance = (int(key[1], 16) ^ target).bit_count()
                if distance < best_distance:
                    best_key, best_distance = key, distance
            if best_key is None:
                return None
            self._data.move_to_end(best_key)
            return self._data[best_key][1]

    def set(self, label: str, fingerprint: str, value: dict) -> None:
        with self._lock:
            key = (self._normalize(label), fingerprint)
            self._data[key] = (time.time(), value)
            self._data.move_to_end(key)
            while len(self._data) > self._max_entries:
                self._data.popitem(last=False)

    def __len__(self) -> int:
        return len(self._data)
