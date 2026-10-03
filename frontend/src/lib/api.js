const API_BASE = import.meta.env.VITE_API_BASE ?? ''
const TIMEOUT_MS = 25000

export class ApiError extends Error {
  constructor(message, code) {
    super(message)
    this.code = code
  }
}

export async function analyzeObject({ label, image }) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  let response
  try {
    response = await fetch(`${API_BASE}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label, image }),
      signal: controller.signal,
    })
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new ApiError('L’analyse a pris trop de temps. Réessayez.', 'timeout')
    }
    throw new ApiError('Serveur injoignable. Vérifiez que le back-end Flask est lancé.', 'network')
  } finally {
    clearTimeout(timer)
  }

  const data = await response.json().catch(() => null)
  if (!response.ok) {
    // Sans corps JSON, c'est le proxy (ou un intermédiaire) qui répond : Flask est injoignable.
    if (!data && response.status >= 500) {
      throw new ApiError('Serveur d’analyse injoignable. Vérifiez que le back-end Flask est lancé.', 'network')
    }
    throw new ApiError(
      data?.error ?? `Erreur serveur (${response.status}).`,
      data?.code ?? (response.status >= 500 ? 'upstream' : 'unknown'),
    )
  }
  if (!data?.nom) throw new ApiError('Réponse d’analyse inattendue.', 'bad_response')
  return data
}
