// Conversion entre les coordonnées du flux vidéo (pixels natifs de la caméra) et celles
// de l'écran, la vidéo étant affichée en `object-fit: cover` (recadrée pour remplir l'écran).

export function getCoverTransform(videoWidth, videoHeight, viewWidth, viewHeight) {
  const scale = Math.max(viewWidth / videoWidth, viewHeight / videoHeight)
  return {
    scale,
    offsetX: (viewWidth - videoWidth * scale) / 2,
    offsetY: (viewHeight - videoHeight * scale) / 2,
  }
}

/** point écran -> coordonnées vidéo natives */
export function screenPointToVideo(sx, sy, { scale, offsetX, offsetY }) {
  return { x: (sx - offsetX) / scale, y: (sy - offsetY) / scale }
}

/** bbox vidéo [x, y, w, h] -> rectangle écran { x, y, width, height } */
export function videoBoxToScreen([x, y, w, h], { scale, offsetX, offsetY }) {
  return {
    x: x * scale + offsetX,
    y: y * scale + offsetY,
    width: w * scale,
    height: h * scale,
  }
}

export function iou(a, b) {
  const [ax, ay, aw, ah] = a
  const [bx, by, bw, bh] = b
  const ix = Math.max(0, Math.min(ax + aw, bx + bw) - Math.max(ax, bx))
  const iy = Math.max(0, Math.min(ay + ah, by + bh) - Math.max(ay, by))
  const inter = ix * iy
  const union = aw * ah + bw * bh - inter
  return union > 0 ? inter / union : 0
}

/** Intersection de deux bbox [x, y, w, h] ; null si elles ne se recouvrent pas. */
export function intersectBoxes([ax, ay, aw, ah], [bx, by, bw, bh]) {
  const x = Math.max(ax, bx)
  const y = Math.max(ay, by)
  const w = Math.min(ax + aw, bx + bw) - x
  const h = Math.min(ay + ah, by + bh) - y
  return w > 0 && h > 0 ? [x, y, w, h] : null
}

export const clamp = (value, min, max) => Math.min(Math.max(value, min), max)

const TOP_RESERVED = 56 // bande sous le badge « AR Vision »

/** Restreint un rectangle écran à la zone visible pour que coins et étiquette restent affichés. */
export function clipRectToViewport(rect, { width, height, safeTop, safeBottom }, inset = 6) {
  const left = Math.max(rect.x, inset)
  const top = Math.max(rect.y, safeTop + TOP_RESERVED)
  const right = Math.min(rect.x + rect.width, width - inset)
  const bottom = Math.min(rect.y + rect.height, height - safeBottom - inset)
  if (right - left < 24 || bottom - top < 24) return null // quasiment hors champ
  return { x: left, y: top, width: right - left, height: bottom - top }
}
