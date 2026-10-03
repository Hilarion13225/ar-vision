import { useCallback, useEffect, useRef, useState } from 'react'
import ARCard from './components/ARCard.jsx'
import DetectionBox from './components/DetectionBox.jsx'
import { ErrorScreen, StartScreen } from './components/Screens.jsx'
import { useCamera } from './hooks/useCamera.js'
import { useCocoModel } from './hooks/useCocoModel.js'
import { useDetection } from './hooks/useDetection.js'
import { useLowLight } from './hooks/useLowLight.js'
import { useViewport } from './hooks/useViewport.js'
import { analyzeObject } from './lib/api.js'
import { cropCenteredOn, geminiBoxToVideo } from './lib/crop.js'
import {
  clipRectToViewport,
  getCoverTransform,
  intersectBoxes,
  iou,
  screenPointToVideo,
  videoBoxToScreen,
} from './lib/geometry.js'

const NO_OBJECT_HINT_DELAY_MS = 2500
const TOAST_DURATION_MS = 4500
// ?debug dans l'adresse affiche la cadence de détection.
const DEBUG = new URLSearchParams(window.location.search).has('debug')
const POINT_CROP = 0.5 // côté du recadrage envoyé, en fraction du petit côté de la vidéo
const TRACK_MATCH_IOU = 0.5 // boîte Gemini ≈ cadre COCO : la carte suit alors l'objet détecté

export default function App() {
  const videoRef = useRef(null)
  const pinnedIdRef = useRef(null)

  const viewport = useViewport()
  const coco = useCocoModel()
  const camera = useCamera(videoRef)
  const running = camera.status === 'ready' && coco.status === 'ready'
  const { tracks, lastSeenAt, fps } = useDetection(coco.model, videoRef, running, pinnedIdRef)
  const lowLight = useLowLight(videoRef, running)

  // selection :
  //  - objet suivi par COCO-SSD : { kind: 'track', trackId, status: 'loading' | 'done', data }
  //  - autre objet réel        : { kind: 'point', trackId: null, region (bbox vidéo), status, data }
  const [selection, setSelection] = useState(null)
  const [toast, setToast] = useState(null)
  const requestIdRef = useRef(0)

  useEffect(() => {
    pinnedIdRef.current = selection?.trackId ?? null
  }, [selection])

  useEffect(() => {
    if (!toast) return undefined
    const timer = setTimeout(() => setToast(null), TOAST_DURATION_MS)
    return () => clearTimeout(timer)
  }, [toast])

  const closeCard = useCallback(() => {
    requestIdRef.current++
    setSelection(null)
  }, [])

  /** Envoie l'image à l'API ; `toSelection` transforme la réponse en sélection finale. */
  const runAnalysis = useCallback(async (pending, request, toSelection) => {
    const requestId = ++requestIdRef.current
    setSelection({ ...pending, status: 'loading', data: null })
    try {
      const data = await analyzeObject(request)
      if (requestId !== requestIdRef.current) return
      setSelection({ ...toSelection(data), status: 'done', data })
    } catch (err) {
      if (requestId !== requestIdRef.current) return
      setSelection(null)
      setToast({ kind: err.code === 'rate_limited' ? 'warning' : 'error', text: err.message })
    }
  }, [])

  /**
   * Tap n'importe où : l'image centrée sur le doigt part à Gemini, qui identifie l'objet touché
   * (quel qu'il soit, pas seulement les 80 catégories de COCO-SSD) et renvoie sa boîte.
   * Si cette boîte correspond au cadre COCO touché, la carte s'accroche à lui et suit l'objet.
   */
  const analyzeAt = useCallback(
    (sx, sy) => {
      if (selection?.status === 'loading') return
      const video = videoRef.current
      if (!video?.videoWidth) return
      const transform = getCoverTransform(video.videoWidth, video.videoHeight, viewport.width, viewport.height)
      const { x: vx, y: vy } = screenPointToVideo(sx, sy, transform)

      // Plus petit cadre COCO contenant le doigt : candidat au suivi si Gemini désigne bien cet objet.
      const track = tracks
        .filter(({ box: [x, y, w, h] }) => vx >= x && vx <= x + w && vy >= y && vy <= y + h)
        .sort((a, b) => a.box[2] * a.box[3] - b.box[2] * b.box[3])[0]
      if (track && selection?.status === 'done' && selection.trackId === track.id) return

      // Recadrage de taille fixe centré sur le doigt. On n'envoie pas le label COCO en indice :
      // il pousse le modèle vers le grand objet détecté au lieu de l'objet réellement touché.
      const shortSide = Math.min(video.videoWidth, video.videoHeight)
      const side = shortSide * POINT_CROP

      let crop
      try {
        crop = cropCenteredOn(video, vx, vy, side)
      } catch (err) {
        setToast({ kind: 'error', text: err.message })
        return
      }

      const marker = shortSide * 0.18
      const pending = track
        ? { kind: 'track', trackId: track.id }
        : { kind: 'point', trackId: null, region: [vx - marker / 2, vy - marker / 2, marker, marker] }

      runAnalysis(pending, { image: crop.image, mode: 'point' }, (data) => {
        const box = data.boite ? geminiBoxToVideo(data.boite, crop.region) : null
        if (track) {
          const visiblePart = intersectBoxes(track.box, crop.region) ?? track.box
          if (!box || iou(box, visiblePart) >= TRACK_MATCH_IOU) return { kind: 'track', trackId: track.id }
        }
        return { kind: 'point', trackId: null, region: box ?? pending.region ?? track.box }
      })
    },
    [selection, runAnalysis, viewport, tracks],
  )

  // Tap sur le fond : ferme la carte ouverte, sinon analyse ce qui est sous le doigt.
  const handleBackgroundTap = useCallback(
    (e) => {
      if (selection?.status === 'done') closeCard()
      else analyzeAt(e.clientX, e.clientY)
    },
    [selection, closeCard, analyzeAt],
  )

  // Tap sur un cadre (ou activation au clavier : on vise alors son centre).
  const handleBoxTap = useCallback(
    (e, rect) => {
      if (e.detail === 0) analyzeAt(rect.x + rect.width / 2, rect.y + rect.height / 2)
      else analyzeAt(e.clientX, e.clientY)
    },
    [analyzeAt],
  )

  const toggleTorch = useCallback(
    async (e) => {
      e.stopPropagation()
      const ok = await camera.setTorchOn(!camera.torch.on)
      if (!ok) setToast({ kind: 'error', text: 'Le flash n’a pas pu être activé sur cet appareil.' })
    },
    [camera],
  )

  // --- Écrans hors caméra -------------------------------------------------------------
  let screen = null
  if (camera.status === 'error') {
    screen = <ErrorScreen title={camera.error.title} message={camera.error.message} onRetry={camera.start} />
  } else if (camera.status !== 'ready' || coco.status !== 'ready') {
    screen = (
      <StartScreen
        modelStatus={coco.status}
        cameraStarting={camera.status === 'starting' || (camera.status === 'ready' && coco.status === 'loading')}
        onStart={camera.start}
        onRetryModel={coco.retry}
      />
    )
  }

  // --- Projection des pistes vidéo vers l'écran ----------------------------------------
  const video = videoRef.current
  const transform =
    video && video.videoWidth
      ? getCoverTransform(video.videoWidth, video.videoHeight, viewport.width, viewport.height)
      : null

  const boxes = transform
    ? tracks
        .map((track) => ({ track, rect: clipRectToViewport(videoBoxToScreen(track.box, transform), viewport) }))
        .filter((b) => b.rect)
    : []
  const pointRect =
    transform && selection?.kind === 'point'
      ? clipRectToViewport(videoBoxToScreen(selection.region, transform), viewport)
      : null
  const anchorRect =
    selection?.kind === 'point' ? pointRect : (boxes.find((b) => b.track.id === selection?.trackId)?.rect ?? null)

  // Une seule indication à la fois, par ordre de priorité.
  let hint = null
  if (running && !selection) {
    if (lowLight && !camera.torch.on) {
      hint = camera.torch.supported
        ? { key: 'dark-torch', text: 'Peu de lumière — touchez ⚡ pour allumer le flash' }
        : { key: 'dark', text: 'Peu de lumière — rapprochez-vous d’une source lumineuse' }
    } else if (boxes.length === 0 && performance.now() - lastSeenAt > NO_OBJECT_HINT_DELAY_MS) {
      hint = { key: 'none', text: 'Aucun objet détecté — touchez n’importe quel objet pour l’analyser' }
    } else if (boxes.length > 0) {
      hint = { key: 'tap', text: 'Touchez un cadre ou n’importe quel objet' }
    }
  }
  const torchNeeded = lowLight && camera.torch.supported && !camera.torch.on

  return (
    <main className="app" onClick={(e) => running && handleBackgroundTap(e)}>
      <video ref={videoRef} className="camera" playsInline muted autoPlay />
      <div className="vignette" />

      {running && (
        // Les cadres glissent d'une détection à la suivante en un intervalle de détection :
        // mouvement continu, sans à-coups, quelle que soit la cadence de l'appareil.
        <div className="overlay" style={{ '--det-ms': `${Math.round(Math.min(250, Math.max(50, fps ? 1000 / fps : 120)))}ms` }}>
          {boxes.map(({ track, rect }) => {
            let mode = 'idle'
            if (selection?.trackId === track.id) mode = selection.status === 'loading' ? 'scanning' : 'selected'
            else if (selection) mode = 'dimmed'
            return (
              <DetectionBox
                key={track.id}
                rect={rect}
                label={track.label}
                score={track.score}
                stale={track.stale}
                mode={mode}
                onTap={(e) => handleBoxTap(e, rect)}
              />
            )
          })}

          {pointRect && (
            <DetectionBox
              key="point"
              rect={pointRect}
              label={selection.data?.nom ?? ''}
              score={null}
              stale={false}
              mode={selection.status === 'loading' ? 'scanning' : 'selected'}
              onTap={() => {}}
            />
          )}

          {selection?.status === 'done' && (
            <ARCard
              key={selection.kind === 'point' ? `point-${requestIdRef.current}` : selection.trackId}
              data={selection.data}
              anchor={anchorRect}
              viewport={viewport}
              onClose={closeCard}
            />
          )}
        </div>
      )}

      {running && (
        <div className="hud">
          <span className="hud__dot" />
          AR Vision
          {DEBUG && (
            <span className="hud__fps">
              {fps.toFixed(0)} FPS · {coco.model?.backend}
            </span>
          )}
        </div>
      )}

      {running && camera.torch.supported && (
        <button
          type="button"
          className={`torch${camera.torch.on ? ' torch--on' : ''}${torchNeeded ? ' torch--suggested' : ''}`}
          onClick={toggleTorch}
          aria-pressed={camera.torch.on}
          aria-label={camera.torch.on ? 'Éteindre le flash' : 'Allumer le flash'}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12L13 2Z" />
          </svg>
        </button>
      )}

      {hint && (
        <div className="hint" key={hint.key}>
          {hint.text}
        </div>
      )}

      {toast && (
        <div
          className={`toast toast--${toast.kind}`}
          role="alert"
          onClick={(e) => {
            e.stopPropagation()
            setToast(null)
          }}
        >
          {toast.text}
        </div>
      )}

      {screen}
    </main>
  )
}
