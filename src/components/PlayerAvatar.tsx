import {
  getAvatarPlaceholderEmoji,
  getAvatarTier,
  IDLE_DOWN_FRAME_COUNT,
  IDLE_DOWN_FRAME_H,
  IDLE_DOWN_FRAME_W,
  IDLE_DOWN_URL,
} from '../game/avatar'
import { TOTAL_CAMPAIGN_CHAMBERS } from '../game/constants'

type Props = {
  battlesWon: number
  /** Destaque ao subir de tier (ex.: ecrã de upgrade após vitória). */
  emphasize?: boolean
  className?: string
  /** Sprite idle maior no menu (só tier 0). */
  featured?: boolean
}

/**
 * Tier 0: idle_down animado. Tiers ≥ 1: emoji placeholder até haver arte final.
 */
export function PlayerAvatar({ battlesWon, emphasize, className = '', featured }: Props) {
  const tier = getAvatarTier(battlesWon)
  const wrapClass = [
    'player-avatar-wrap',
    emphasize ? 'player-avatar-wrap--emphasize' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  const label = `Alquimista, vitórias: ${battlesWon} de ${TOTAL_CAMPAIGN_CHAMBERS}`

  if (tier === 0) {
    const scale = featured ? 1.05 : 0.75
    const displayW = IDLE_DOWN_FRAME_W * scale
    const displayH = IDLE_DOWN_FRAME_H * scale
    const sheetScaledW = IDLE_DOWN_FRAME_W * IDLE_DOWN_FRAME_COUNT * scale
    const strip = `player-avatar-idle-strip 0.85s steps(${IDLE_DOWN_FRAME_COUNT}) infinite`
    const spriteAnim = emphasize ? `${strip}, player-avatar-pop 0.55s ease-out` : strip
    return (
      <div className={wrapClass} key={tier}>
        <div
          className="player-avatar-idle-sprite"
          role="img"
          aria-label={label}
          style={{
            width: displayW,
            height: displayH,
            backgroundImage: `url("${IDLE_DOWN_URL}")`,
            backgroundSize: `${sheetScaledW}px ${displayH}px`,
            ['--idle-end-x' as string]: `${-sheetScaledW}px`,
            animation: spriteAnim,
          }}
        />
      </div>
    )
  }

  const emoji = getAvatarPlaceholderEmoji(tier)

  return (
    <div className={wrapClass} key={tier}>
      <span className="player-avatar-emoji" role="img" aria-label={label}>
        {emoji}
      </span>
    </div>
  )
}
