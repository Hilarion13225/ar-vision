import { useEffect, useState } from 'react'
import * as tf from '@tensorflow/tfjs'
import * as cocoSsd from '@tensorflow-models/coco-ssd'

// Chargé une seule fois, même si le composant est monté deux fois (StrictMode).
let modelPromise = null

function loadModel() {
  if (!modelPromise) {
    modelPromise = (async () => {
      try {
        await tf.setBackend('webgl')
      } catch {
        await tf.setBackend('cpu')
      }
      await tf.ready()
      // lite_mobilenet_v2 : le plus rapide, prioritaire pour la fluidité sur mobile.
      const model = await cocoSsd.load({ base: 'lite_mobilenet_v2' })
      return model
    })().catch((err) => {
      modelPromise = null
      throw err
    })
  }
  return modelPromise
}

export function useCocoModel() {
  const [state, setState] = useState({ model: null, status: 'loading', error: null })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setState({ model: null, status: 'loading', error: null })
    loadModel()
      .then((model) => !cancelled && setState({ model, status: 'ready', error: null }))
      .catch((err) => {
        console.error('[AR] Échec du chargement de COCO-SSD', err)
        if (!cancelled) setState({ model: null, status: 'error', error: err })
      })
    return () => {
      cancelled = true
    }
  }, [attempt])

  return { ...state, retry: () => setAttempt((n) => n + 1) }
}
