export function StartScreen({ modelStatus, cameraStarting, onStart, onRetryModel }) {
  const loading = modelStatus === 'loading'
  return (
    <div className="screen">
      <div className="screen__logo" aria-hidden="true">
        <span />
      </div>
      <h1 className="screen__title">AR Vision</h1>
      <p className="screen__text">
        Pointez la caméra vers un objet, puis touchez son cadre : l’IA l’identifie et affiche sa fiche
        en réalité augmentée.
      </p>
      {modelStatus === 'error' ? (
        <>
          <p className="screen__error">Le modèle de détection n’a pas pu être chargé. Vérifiez votre connexion.</p>
          <button type="button" className="btn" onClick={onRetryModel}>
            Réessayer
          </button>
        </>
      ) : (
        <button type="button" className="btn" onClick={onStart} disabled={cameraStarting}>
          {cameraStarting ? 'Ouverture de la caméra…' : 'Démarrer'}
        </button>
      )}
      <p className="screen__hint">{loading ? 'Chargement du modèle de détection…' : ' '}</p>
    </div>
  )
}

export function ErrorScreen({ title, message, onRetry }) {
  return (
    <div className="screen">
      <div className="screen__icon" aria-hidden="true">
        !
      </div>
      <h1 className="screen__title screen__title--small">{title}</h1>
      <p className="screen__text">{message}</p>
      <button type="button" className="btn" onClick={onRetry}>
        Réessayer
      </button>
    </div>
  )
}
