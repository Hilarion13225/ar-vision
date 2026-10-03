import { useEffect, useState } from 'react'
import * as tf from '@tensorflow/tfjs'
import * as cocoSsd from '@tensorflow-models/coco-ssd'

// WebGL (GPU) en priorité, CPU en dernier recours. Le backend WebGPU de TensorFlow.js a été
// mesuré 3× plus lent que WebGL sur COCO-SSD : il n'est pas utilisé.
const BACKENDS = ['webgl', 'cpu']

async function selectBackend() {
  for (const name of BACKENDS) {
    try {
      // setBackend renvoie false (sans lever d'erreur) si le backend ne s'initialise pas.
      if (await tf.setBackend(name)) {
        await tf.ready()
        return name
      }
    } catch (err) {
      console.warn(`[AR] Backend ${name} indisponible`, err)
    }
  }
  throw new Error('Aucun backend TensorFlow.js disponible.')
}

// Chargé une seule fois, même si le composant est monté deux fois (StrictMode).
let modelPromise = null

function loadModel() {
  if (!modelPromise) {
    modelPromise = (async () => {
      const backend = await selectBackend()
      // lite_mobilenet_v2 : le plus rapide, prioritaire pour la fluidité sur mobile.
      const model = await cocoSsd.load({ base: 'lite_mobilenet_v2' })
      model.backend = backend
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
