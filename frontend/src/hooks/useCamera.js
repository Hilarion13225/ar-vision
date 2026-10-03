import { useCallback, useEffect, useRef, useState } from 'react'
import { pickMainBackCamera } from '../lib/cameraSelect.js'

// 1080p : image nette à l'écran et recadrages de meilleure qualité pour Gemini.
const RESOLUTION = { width: { ideal: 1920 }, height: { ideal: 1080 } }
const CONSTRAINTS = {
  audio: false,
  video: { facingMode: { ideal: 'environment' }, ...RESOLUTION },
}

/**
 * Les noms des caméras ne sont lisibles qu'une fois l'autorisation accordée : on ouvre d'abord
 * la caméra arrière par défaut, puis on bascule sur la principale si le navigateur en a pris une autre.
 */
async function switchToMainBackCamera(stream) {
  try {
    const currentId = stream.getVideoTracks()[0]?.getSettings().deviceId
    const mainId = pickMainBackCamera(await navigator.mediaDevices.enumerateDevices())
    if (!mainId || mainId === currentId) return stream

    stream.getTracks().forEach((t) => t.stop())
    return await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { deviceId: { exact: mainId }, ...RESOLUTION },
    })
  } catch (err) {
    console.warn('[AR] Bascule vers la caméra principale impossible', err)
    return stream.active ? stream : navigator.mediaDevices.getUserMedia(CONSTRAINTS)
  }
}

function supportsTorch(stream) {
  try {
    return Boolean(stream.getVideoTracks()[0]?.getCapabilities?.().torch)
  } catch {
    return false
  }
}

async function enableContinuousFocus(stream) {
  const track = stream.getVideoTracks()[0]
  const modes = track?.getCapabilities?.().focusMode ?? []
  if (modes.includes('continuous')) {
    await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {})
  }
}

function describeCameraError(err) {
  switch (err?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return {
        title: 'Accès à la caméra refusé',
        message:
          'Autorisez la caméra pour ce site dans les réglages du navigateur, puis réessayez. ' +
          'Sur iPhone : Réglages › Safari › Caméra.',
      }
    case 'NotFoundError':
    case 'OverconstrainedError':
      return { title: 'Aucune caméra trouvée', message: 'Cet appareil ne semble pas disposer de caméra utilisable.' }
    case 'NotReadableError':
    case 'AbortError':
      return {
        title: 'Caméra indisponible',
        message: 'La caméra est peut-être utilisée par une autre application. Fermez-la puis réessayez.',
      }
    default:
      return { title: 'Impossible de démarrer la caméra', message: err?.message ?? 'Erreur inconnue.' }
  }
}

export function useCamera(videoRef) {
  const [status, setStatus] = useState('idle') // idle | starting | ready | error
  const [error, setError] = useState(null)
  const [torch, setTorch] = useState({ supported: false, on: false })
  const streamRef = useRef(null)

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setTorch({ supported: false, on: false })
  }, [])

  const setTorchOn = useCallback(async (on) => {
    const track = streamRef.current?.getVideoTracks()[0]
    if (!track) return false
    try {
      await track.applyConstraints({ advanced: [{ torch: on }] })
      setTorch({ supported: true, on })
      return true
    } catch (err) {
      console.warn('[AR] Impossible de piloter le flash', err)
      return false
    }
  }, [])

  const start = useCallback(async () => {
    setError(null)
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setStatus('error')
      setError({
        title: 'Connexion sécurisée requise',
        message:
          'Le navigateur n’autorise la caméra qu’en HTTPS. Ouvrez l’application via son adresse https:// ' +
          '(certificat local ou tunnel ngrok, voir le README).',
      })
      return
    }

    setStatus('starting')
    stop()
    try {
      let stream
      try {
        stream = await navigator.mediaDevices.getUserMedia(CONSTRAINTS)
      } catch (err) {
        // Certains appareils rejettent les contraintes de résolution : on retente au plus simple.
        if (err.name !== 'OverconstrainedError') throw err
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
      }
      stream = await switchToMainBackCamera(stream)
      await enableContinuousFocus(stream)
      streamRef.current = stream

      const video = videoRef.current
      video.srcObject = stream
      await new Promise((resolve) => {
        if (video.readyState >= 1) resolve()
        else video.onloadedmetadata = () => resolve()
      })
      await video.play()
      // Le flash (« torch ») n'est exposé qu'une fois le flux démarré, et pas par tous les navigateurs.
      setTorch({ supported: supportsTorch(stream), on: false })
      setStatus('ready')
    } catch (err) {
      stop()
      setStatus('error')
      setError(describeCameraError(err))
    }
  }, [stop, videoRef])

  useEffect(() => stop, [stop])

  return { status, error, start, torch, setTorchOn }
}
