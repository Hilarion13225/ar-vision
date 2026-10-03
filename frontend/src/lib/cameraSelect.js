// Choix de la caméra arrière principale sur les téléphones à plusieurs capteurs.
// `facingMode: 'environment'` laisse le navigateur choisir, et il prend parfois un capteur
// secondaire (ultra grand-angle, macro…) de moindre qualité.

const BACK = /back|rear|environment|arrière|traseira|trasera/i
const SECONDARY = /ultra|tele|macro|depth|infra|ir camera|profondeur/i

function maxPixels(device) {
  try {
    const caps = device.getCapabilities?.()
    return (caps?.width?.max ?? 0) * (caps?.height?.max ?? 0)
  } catch {
    return 0
  }
}

function cameraIndex(device) {
  const match = device.label.match(/camera\s*2?\s+(\d+)/i)
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER
}

/** Renvoie le deviceId de la caméra arrière principale, ou null si aucune préférence claire. */
export function pickMainBackCamera(devices) {
  const back = devices.filter((d) => d.kind === 'videoinput' && BACK.test(d.label))
  if (back.length === 0) return null

  const candidates = back.filter((d) => !SECONDARY.test(d.label))
  const pool = candidates.length > 0 ? candidates : back

  // Sur Android, la caméra principale a la plus haute résolution et le plus petit numéro
  // (« camera2 0, facing back ») : on trie par résolution, puis par numéro, puis par ordre listé.
  const ranked = pool
    .map((device, order) => ({ device, order, pixels: maxPixels(device), index: cameraIndex(device) }))
    .sort((x, y) => y.pixels - x.pixels || x.index - y.index || x.order - y.order)
  return ranked[0].device.deviceId || null
}
