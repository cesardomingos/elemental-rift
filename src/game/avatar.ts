import { TOTAL_BATTLES } from './constants'

/** Sprite idle (tier 0): folha 1×8 em `public/avatar/idle_down.png`. */
export const IDLE_DOWN_URL = '/avatar/idle_down.png'
export const IDLE_DOWN_FRAME_W = 96
export const IDLE_DOWN_FRAME_H = 80
export const IDLE_DOWN_FRAME_COUNT = 8

/** Placeholder por vitória (tier 1..N); tier 0 = sprite idle_down. */
export const AVATAR_PLACEHOLDER_EMOJIS: readonly string[] = [
  '🔮',
  '🧪',
  '⚗️',
  '📿',
  '✨',
  '🔥',
  '💎',
  '🌊',
  '⚡',
  '🏆',
]

export function getAvatarPlaceholderEmoji(tier: number): string {
  if (tier < 1) return '❓'
  return AVATAR_PLACEHOLDER_EMOJIS[tier - 1] ?? '⭐'
}

/** Tier visual 0..TOTAL_BATTLES: uma vitória = um degrau (alinhado a runStats.battlesWon). */
export function getAvatarTier(battlesWon: number): number {
  const n = Math.floor(battlesWon)
  if (n <= 0) return 0
  if (n >= TOTAL_BATTLES) return TOTAL_BATTLES
  return n
}
