import { useEffect, useRef, useState } from 'react'

const SAMPLE_W = 32
const SAMPLE_H = 18
const CHECK_INTERVAL_MS = 700
const DARK_LUMA = 55 // luminance moyenne (0-255) en dessous de laquelle la scène est sombre
const BRIGHT_LUMA = 75 // hystérésis : évite que l'indication clignote autour du seuil
const CONFIRM_CHECKS = 2

/** Indique si la scène filmée manque de lumière (luminance moyenne d'une vignette de la frame). */
export function useLowLight(videoRef, active) {
  const [lowLight, setLowLight] = useState(false)
  const lowLightRef = useRef(false)
  const streakRef = useRef(0)

  useEffect(() => {
    lowLightRef.current = false
    streakRef.current = 0
    setLowLight(false)
    if (!active) return undefined

    const canvas = document.createElement('canvas')
    canvas.width = SAMPLE_W
    canvas.height = SAMPLE_H
    const ctx = canvas.getContext('2d', { willReadFrequently: true })

    const timer = setInterval(() => {
      const video = videoRef.current
      if (!video || video.readyState < 2 || document.hidden) return
      ctx.drawImage(video, 0, 0, SAMPLE_W, SAMPLE_H)
      const { data } = ctx.getImageData(0, 0, SAMPLE_W, SAMPLE_H)
      let sum = 0
      for (let i = 0; i < data.length; i += 4) {
        sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]
      }
      const luma = sum / (SAMPLE_W * SAMPLE_H)

      const current = lowLightRef.current
      const wantsChange = current ? luma > BRIGHT_LUMA : luma < DARK_LUMA
      streakRef.current = wantsChange ? streakRef.current + 1 : 0
      if (streakRef.current >= CONFIRM_CHECKS) {
        streakRef.current = 0
        lowLightRef.current = !current
        setLowLight(!current)
      }
    }, CHECK_INTERVAL_MS)

    return () => clearInterval(timer)
  }, [videoRef, active])

  return lowLight
}
