const MAX_SIDE = 640
/**
 * Recadrage carré exactement centré sur le point touché (coordonnées vidéo) : les zones hors de
 * l'image sont laissées noires plutôt que de décaler le carré, pour que le doigt reste au centre.
 * Renvoie l'image et la région couverte (qui peut déborder de la frame).
 */
export function cropCenteredOn(video, vx, vy, side) {
  const region = [vx - side / 2, vy - side / 2, side, side]
  const out = Math.min(MAX_SIDE, Math.round(side))
  const ratio = out / side
  const canvas = document.createElement('canvas')
  canvas.width = out
  canvas.height = out
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, out, out)

  const sx = Math.max(0, region[0])
  const sy = Math.max(0, region[1])
  const sw = Math.min(video.videoWidth, region[0] + side) - sx
  const sh = Math.min(video.videoHeight, region[1] + side) - sy
  if (sw < 2 || sh < 2) throw new Error('Touchez à l’intérieur de l’image.')
  ctx.drawImage(video, sx, sy, sw, sh, (sx - region[0]) * ratio, (sy - region[1]) * ratio, sw * ratio, sh * ratio)
  return { image: canvas.toDataURL('image/jpeg', 0.85), region }
}

/** Convertit une boîte Gemini [ymin, xmin, ymax, xmax] (0-1000, relative à region) en bbox vidéo. */
export function geminiBoxToVideo([ymin, xmin, ymax, xmax], [rx, ry, rw, rh]) {
  return [rx + (xmin / 1000) * rw, ry + (ymin / 1000) * rh, ((xmax - xmin) / 1000) * rw, ((ymax - ymin) / 1000) * rh]
}
