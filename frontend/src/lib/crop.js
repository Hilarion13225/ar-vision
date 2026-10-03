const MAX_SIDE = 640
const PADDING = 0.12 // marge autour du cadre pour donner du contexte au modèle

/**
 * Recadre l'objet dans la frame vidéo courante et renvoie une data URL JPEG.
 * `box` est en coordonnées natives de la vidéo : [x, y, w, h].
 */
export function cropVideoFrame(video, [x, y, w, h]) {
  const vw = video.videoWidth
  const vh = video.videoHeight
  const padX = w * PADDING
  const padY = h * PADDING

  const sx = Math.max(0, x - padX)
  const sy = Math.max(0, y - padY)
  const sw = Math.min(vw, x + w + padX) - sx
  const sh = Math.min(vh, y + h + padY) - sy
  if (sw < 2 || sh < 2) throw new Error('Zone de recadrage trop petite.')

  const ratio = Math.min(1, MAX_SIDE / Math.max(sw, sh))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(sw * ratio)
  canvas.height = Math.round(sh * ratio)
  const ctx = canvas.getContext('2d')
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.85)
}
