import { useEffect, useState } from 'react'

function readSafeArea(name) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name)
  return parseFloat(value) || 0
}

function measure() {
  return {
    width: window.innerWidth,
    height: window.innerHeight,
    safeTop: readSafeArea('--safe-top'),
    safeBottom: readSafeArea('--safe-bottom'),
  }
}

export function useViewport() {
  const [viewport, setViewport] = useState(measure)

  useEffect(() => {
    const update = () => setViewport(measure())
    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
    }
  }, [])

  return viewport
}
