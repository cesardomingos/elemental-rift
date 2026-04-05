import { useEffect, useId, useRef } from 'react'
import {
  ACHIEVEMENTS,
  achievementProgressLabel,
} from '../game/achievements'
import { getPersistentSnapshot } from '../game/persistentStats'

type Props = {
  open: boolean
  onClose: () => void
}

export function AchievementsModal({ open, onClose }: Props) {
  const titleId = useId()
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    closeRef.current?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const snap = getPersistentSnapshot()
  const unlockedCount = ACHIEVEMENTS.filter((a) =>
    snap.unlockedIds.includes(a.id),
  ).length

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="modal-panel modal-panel--wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 id={titleId} className="modal-title">
            Conquistas
          </h2>
          <button
            ref={closeRef}
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label="Fechar"
          >
            ×
          </button>
        </div>
        <div className="modal-body">
          <p className="modal-lead">
            Progresso guardado neste dispositivo — <strong>não reseta</strong> entre runs.
          </p>
          <p className="modal-muted" style={{ marginTop: '-0.35rem' }}>
            {unlockedCount} / {ACHIEVEMENTS.length} desbloqueadas
          </p>
          <ul className="achievements-list">
            {ACHIEVEMENTS.map((a) => {
              const unlocked = snap.unlockedIds.includes(a.id)
              const progress = achievementProgressLabel(a.id)
              return (
                <li
                  key={a.id}
                  className={[
                    'achievements-list__item',
                    unlocked ? 'achievements-list__item--unlocked' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <span className="achievements-list__icon" aria-hidden>
                    {unlocked ? a.icon : '🔒'}
                  </span>
                  <div className="achievements-list__body">
                    <div className="achievements-list__title-row">
                      <strong className="achievements-list__title">{a.title}</strong>
                      {unlocked ? (
                        <span className="achievements-list__badge">Desbloqueada</span>
                      ) : null}
                    </div>
                    <p className="achievements-list__desc">{a.desc}</p>
                    {!unlocked && progress ? (
                      <p className="achievements-list__progress">{progress}</p>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </div>
  )
}
