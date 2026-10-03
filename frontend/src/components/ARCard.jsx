import { useLayoutEffect, useRef, useState } from 'react'
import { clamp } from '../lib/geometry.js'

const GAP = 14 // espace entre la carte et le cadre de l'objet
const MARGIN = 12 // marge minimale avec les bords de l'écran
const TAIL_INSET = 24

/**
 * Carte d'informations accrochée au cadre de l'objet (`anchor`, coordonnées écran).
 * Si l'objet sort du champ (`anchor` null), la carte se range en bas de l'écran.
 */
export default function ARCard({ data, anchor, viewport, onClose }) {
  const ref = useRef(null)
  const [size, setSize] = useState({ width: 320, height: 220 })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const observer = new ResizeObserver(() => {
      setSize({ width: el.offsetWidth, height: el.offsetHeight })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const { width: vw, height: vh, safeTop, safeBottom } = viewport
  const maxLeft = Math.max(MARGIN, vw - size.width - MARGIN)
  let left
  let top
  let placement
  let tailX = 0

  if (anchor) {
    const centerX = anchor.x + anchor.width / 2
    left = clamp(centerX - size.width / 2, MARGIN, maxLeft)
    const above = anchor.y - GAP - size.height
    const below = anchor.y + anchor.height + GAP
    if (above >= safeTop + MARGIN) {
      top = above
      placement = 'above'
    } else if (below + size.height <= vh - safeBottom - MARGIN) {
      top = below
      placement = 'below'
    } else {
      // Objet très grand : la carte se pose sur sa partie basse.
      top = clamp(anchor.y + anchor.height - size.height - GAP, safeTop + MARGIN, vh - safeBottom - size.height - MARGIN)
      placement = 'inside'
    }
    tailX = clamp(centerX - left, TAIL_INSET, size.width - TAIL_INSET)
  } else {
    left = (vw - size.width) / 2
    top = vh - safeBottom - size.height - MARGIN - 8
    placement = 'docked'
  }

  return (
    <div
      className={`ar-card-anchor ar-card-anchor--${placement}`}
      style={{ transform: `translate3d(${left}px, ${top}px, 0)` }}
      onClick={(e) => e.stopPropagation()}
    >
      <article ref={ref} className="ar-card" aria-live="polite">
        <header className="ar-card__header">
          <div>
            <span className="ar-card__category">{data.categorie}</span>
            <h2 className="ar-card__title">{data.nom}</h2>
          </div>
          <button type="button" className="ar-card__close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </header>
        <p className="ar-card__description">{data.description}</p>
        {data.faits?.length > 0 && (
          <ul className="ar-card__facts">
            {data.faits.map((fait, i) => (
              <li key={i} style={{ animationDelay: `${180 + i * 90}ms` }}>
                {fait}
              </li>
            ))}
          </ul>
        )}
        {placement === 'docked' && <p className="ar-card__lost">Objet hors champ</p>}
        {(placement === 'above' || placement === 'below') && (
          <span className={`ar-card__tail ar-card__tail--${placement}`} style={{ left: `${tailX}px` }} />
        )}
      </article>
    </div>
  )
}
