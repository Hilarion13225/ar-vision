import { useEffect, useRef, useState } from 'react'
import { createTracker } from '../lib/tracker.js'

const MAX_DETECTIONS = 8
const MIN_SCORE = 0.5

/**
 * Boucle de détection continue : COCO-SSD sur la frame courante, puis suivi des objets.
 * Renvoie les pistes en coordonnées natives de la vidéo.
 * `pinnedIdRef` contient l'id de la piste qui porte une carte (survie prolongée).
 */
export function useDetection(model, videoRef, active, pinnedIdRef) {
  const [tracks, setTracks] = useState([])
  const [lastSeenAt, setLastSeenAt] = useState(() => performance.now())
  const trackerRef = useRef(createTracker())

  useEffect(() => {
    if (!model || !active) return undefined
    let running = true
    let rafId = 0
    const tracker = trackerRef.current
    tracker.reset()
    setLastSeenAt(performance.now())

    const loop = async () => {
      if (!running) return
      const video = videoRef.current
      if (video && video.readyState >= 2 && !document.hidden && video.videoWidth > 0) {
        try {
          const detections = await model.detect(video, MAX_DETECTIONS, MIN_SCORE)
          if (!running) return
          const now = performance.now()
          const next = tracker.update(detections, now, pinnedIdRef.current)
          setTracks(next)
          if (detections.length > 0) setLastSeenAt(now)
        } catch (err) {
          console.warn('[AR] Détection ignorée sur cette frame', err)
        }
      }
      rafId = requestAnimationFrame(loop)
    }
    rafId = requestAnimationFrame(loop)

    return () => {
      running = false
      cancelAnimationFrame(rafId)
    }
  }, [model, active, videoRef, pinnedIdRef])

  return { tracks, lastSeenAt }
}
