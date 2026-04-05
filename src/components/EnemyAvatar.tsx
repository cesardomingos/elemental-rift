import { getEnemyAvatarEmoji } from '../game/enemyAvatars'

type Props = {
  /** Índice da câmara na fase (0..N-1). */
  battleIndex: number
  enemyName: string
  className?: string
}

/**
 * Retrato do guardião atual (emoji por profundidade) para deixar explícito o duelo contra um adversário.
 */
export function EnemyAvatar({ battleIndex, enemyName, className = '' }: Props) {
  const emoji = getEnemyAvatarEmoji(battleIndex)
  const wrapClass = ['enemy-avatar-wrap', className].filter(Boolean).join(' ')

  return (
    <div className={wrapClass}>
      <div className="enemy-avatar-ring" role="img" aria-label={`Inimigo: ${enemyName}`}>
        <span className="enemy-avatar-emoji" aria-hidden>
          {emoji}
        </span>
      </div>
    </div>
  )
}
