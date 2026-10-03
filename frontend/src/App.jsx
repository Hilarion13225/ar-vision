import { useCallback, useEffect, useRef, useState } from 'react'
import ARCard from './components/ARCard.jsx'
import DetectionBox from './components/DetectionBox.jsx'
import { ErrorScreen, StartScreen } from './components/Screens.jsx'
import { useCamera } from './hooks/useCamera.js'
import { useCocoModel } from './hooks/useCocoModel.js'
import { useDetection } from './hooks/useDetection.js'
import { useViewport } from './hooks/useViewport.js'
import { analyzeObject } from './lib/api.js'
import { cropVideoFrame } from './lib/crop.js'
import { clipRectToViewport, getCoverTransform, videoBoxToScreen } from './lib/geometry.js'

const NO_OBJECT_HINT_DELAY_MS = 2500
const TOAST_DURATION_MS = 4500

export default function App() {
  const videoRef = useRef(null)
  const pinnedIdRef = useRef(null)

  const viewport = useViewport()
  const coco = useCocoModel()
  const camera = useCamera(videoRef)
  const running = camera.status === 'ready' && coco.status === 'ready'
  const { tracks, lastSeenAt } = useDetection(coco.model, videoRef, running, pinnedIdRef)

  // selection : { trackId, label, status: 'loading' | 'done', data }
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

  const handleTap = useCallback(
    async (track) => {
      if (selection?.status === 'loading') return
      if (selection?.trackId === track.id && selection.status === 'done') return

      let image
      try {
        image = cropVideoFrame(videoRef.current, track.box)
      } catch (err) {
        setToast({ kind: 'error', text: err.message })
        return
      }

      const requestId = ++requestIdRef.current
      setSelection({ trackId: track.id, label: track.label, status: 'loading', data: null })
      try {
        const data = await analyzeObject({ label: track.label, image })
        if (requestId !== requestIdRef.current) return
        setSelection({ trackId: track.id, label: track.label, status: 'done', data })
      } catch (err) {
        if (requestId !== requestIdRef.current) return
        setSelection(null)
        setToast({ kind: err.code === 'rate_limited' ? 'warning' : 'error', text: err.message })
      }
    },
    [selection],
  )

  const closeCard = useCallback(() => {
    requestIdRef.current++
    setSelection(null)
  }, [])

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
  const selectedBox = selection ? boxes.find((b) => b.track.id === selection.trackId) : null

  const showNoObjectHint =
    running && boxes.length === 0 && !selection && performance.now() - lastSeenAt > NO_OBJECT_HINT_DELAY_MS
  const showTapHint = running && boxes.length > 0 && !selection

  return (
    <main className="app" onClick={() => selection?.status === 'done' && closeCard()}>
      <video ref={videoRef} className="camera" playsInline muted autoPlay />
      <div className="vignette" />

      {running && (
        <div className="overlay">
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
                onTap={() => handleTap(track)}
              />
            )
          })}

          {selection?.status === 'done' && (
            <ARCard
              key={selection.trackId}
              data={selection.data}
              anchor={selectedBox?.rect ?? null}
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
        </div>
      )}

      {(showNoObjectHint || showTapHint) && (
        <div className="hint" key={showTapHint ? 'tap' : 'none'}>
          {showTapHint ? 'Touchez un objet pour l’analyser' : 'Aucun objet détecté — visez un objet du quotidien'}
        </div>
      )}

      {toast && (
        <div className={`toast toast--${toast.kind}`} role="alert" onClick={() => setToast(null)}>
          {toast.text}
        </div>
      )}

      {screen}
    </main>
  )
}
