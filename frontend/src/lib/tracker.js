import { iou } from './geometry.js'

// Suivi léger multi-objets : associe chaque détection d'une frame à la piste de la frame
// précédente (meilleur IoU), lisse la position (moyenne exponentielle) et donne à chaque
// objet un identifiant stable. C'est ce qui permet à la carte AR de "s'accrocher" à l'objet.

const DEFAULTS = {
  matchIou: 0.25, // IoU minimal pour associer une détection à une piste
  crossClassIou: 0.6, // tolère un changement de classe si le recouvrement est fort
  smoothing: 0.55, // poids de la nouvelle mesure (1 = aucun lissage)
  minHits: 2, // détections consécutives requises avant affichage (anti-scintillement)
  maxMissedMs: 500, // durée de survie d'une piste non revue
  pinnedMissedMs: 1500, // survie prolongée pour la piste qui porte une carte
}

export function createTracker(options = {}) {
  const cfg = { ...DEFAULTS, ...options }
  let tracks = []
  let nextId = 1

  function update(detections, now, pinnedId = null) {
    const unmatched = new Set(tracks.map((_, i) => i))
    const matchedTracks = new Set()

    // Paires (piste, détection) triées par IoU décroissant : appariement glouton.
    const pairs = []
    tracks.forEach((track, ti) => {
      detections.forEach((det, di) => {
        const overlap = iou(track.box, det.bbox)
        const sameClass = track.label === det.class
        if (overlap >= (sameClass ? cfg.matchIou : cfg.crossClassIou)) {
          pairs.push({ ti, di, overlap })
        }
      })
    })
    pairs.sort((a, b) => b.overlap - a.overlap)

    const usedDetections = new Set()
    for (const { ti, di } of pairs) {
      if (matchedTracks.has(ti) || usedDetections.has(di)) continue
      matchedTracks.add(ti)
      usedDetections.add(di)
      unmatched.delete(ti)

      const track = tracks[ti]
      const det = detections[di]
      const a = cfg.smoothing
      track.box = track.box.map((v, k) => v + (det.bbox[k] - v) * a)
      track.score = det.score
      track.lastSeen = now
      track.hits += 1
    }

    detections.forEach((det, di) => {
      if (usedDetections.has(di)) return
      tracks.push({
        id: nextId++,
        label: det.class,
        score: det.score,
        box: [...det.bbox],
        lastSeen: now,
        hits: 1,
      })
    })

    tracks = tracks.filter((track) => {
      const ttl = track.id === pinnedId ? cfg.pinnedMissedMs : cfg.maxMissedMs
      return now - track.lastSeen <= ttl
    })

    return tracks
      .filter((t) => t.hits >= cfg.minHits || t.id === pinnedId)
      .map((t) => ({ ...t, box: [...t.box], stale: now - t.lastSeen > 0 }))
  }

  function reset() {
    tracks = []
  }

  return { update, reset }
}
