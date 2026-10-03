import { useCallback, useEffect, useRef, useState } from 'react'

const CONSTRAINTS = {
  audio: false,
  video: {
    facingMode: { ideal: 'environment' },
    width: { ideal: 1280 },
    height: { ideal: 720 },
  },
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
  const streamRef = useRef(null)

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
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
      streamRef.current = stream

      const video = videoRef.current
      video.srcObject = stream
      await new Promise((resolve) => {
        if (video.readyState >= 1) resolve()
        else video.onloadedmetadata = () => resolve()
      })
      await video.play()
      setStatus('ready')
    } catch (err) {
      stop()
      setStatus('error')
      setError(describeCameraError(err))
    }
  }, [stop, videoRef])

  useEffect(() => stop, [stop])

  return { status, error, start }
}
