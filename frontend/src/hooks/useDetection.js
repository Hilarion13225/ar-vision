import { useEffect, useRef, useState } from 'react'
import { createTracker } from '../lib/tracker.js'

const MAX_DETECTIONS = 8
const MIN_SCORE = 0.5
// COCO-SSD réduit de toute façon l'image à 300×300 : lui passer le flux 1080p complet ne fait
// que coûter du transfert vers le GPU. On détecte sur une copie réduite, l'affichage reste net.
const DETECT_WIDTH = 640

/**
 * Boucle de détection continue : COCO-SSD sur la frame courante, puis suivi des objets.
 * Renvoie les pistes en coordonnées natives de la vidéo, et la cadence mesurée (détections/s).
 * `pinnedIdRef` contient l'id de la piste qui porte une carte (survie prolongée).
 */
export function useDetection(model, videoRef, active, pinnedIdRef) {
  const [tracks, setTracks] = useState([])
  const [lastSeenAt, setLastSeenAt] = useState(() => performance.now())
  const [fps, setFps] = useState(0)
  const trackerRef = useRef(createTracker())

  useEffect(() => {
    if (!model || !active) return undefined
    let running = true
    let rafId = 0
    let lastTick = 0
    let avgInterval = 0
    const tracker = trackerRef.current
    tracker.reset()
    setLastSeenAt(performance.now())

    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')

    const loop = async () => {
      if (!running) return
      const video = videoRef.current
      if (video && video.readyState >= 2 && !document.hidden && video.videoWidth > 0) {
        try {
          const ratio = Math.min(1, DETECT_WIDTH / video.videoWidth)
          const w = Math.round(video.videoWidth * ratio)
          const h = Math.round(video.videoHeight * ratio)
          if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w
            canvas.height = h
          }
          ctx.drawImage(video, 0, 0, w, h)

          const raw = await model.detect(canvas, MAX_DETECTIONS, MIN_SCORE)
          if (!running) return
          const detections = raw.map((d) => ({ ...d, bbox: d.bbox.map((v) => v / ratio) }))

          const now = performance.now()
          if (lastTick) {
            const interval = now - lastTick
            avgInterval = avgInterval ? avgInterval * 0.85 + interval * 0.15 : interval
            setFps(1000 / avgInterval)
          }
          lastTick = now

          setTracks(tracker.update(detections, now, pinnedIdRef.current))
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

  return { tracks, lastSeenAt, fps }
}
