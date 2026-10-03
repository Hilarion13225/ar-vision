import { labelFr } from '../lib/labels.js'

/** Cadre animé autour d'un objet détecté. `rect` est en coordonnées écran. */
export default function DetectionBox({ rect, label, score, mode, stale, onTap }) {
  const style = {
    transform: `translate3d(${rect.x}px, ${rect.y}px, 0)`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  }

  return (
    <button
      type="button"
      className={`det-box det-box--${mode}${stale ? ' det-box--stale' : ''}`}
      style={style}
      onClick={(e) => {
        e.stopPropagation()
        onTap(e)
      }}
      aria-label={`Analyser : ${labelFr(label)}`}
    >
      <span className="det-box__corner det-box__corner--tl" />
      <span className="det-box__corner det-box__corner--tr" />
      <span className="det-box__corner det-box__corner--bl" />
      <span className="det-box__corner det-box__corner--br" />
      {mode === 'scanning' && <span className="det-box__scan" />}
      <span className="det-box__label">
        {mode === 'scanning' ? 'Analyse…' : labelFr(label)}
        {mode !== 'scanning' && score != null && (
          <span className="det-box__score">{Math.round(score * 100)}%</span>
        )}
      </span>
    </button>
  )
}
