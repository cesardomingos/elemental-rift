/** Um emoji por câmara da masmorra (índice 0..9), alinhado a `DUNGEON_ENEMIES` em constants. */
const ENEMY_AVATAR_EMOJIS = [
  '🫧', // Lodo do poço
  '🪱', // Verme de fosso
  '🦴', // Esqueleto tombado
  '🕷️', // Aranha de alvéolo
  '🧟', // Carniçal tolhido
  '⚔️', // Cavaleiro espectral
  '🗿', // Golem de salão
  '🌀', // Elemental amalgamado
  '😈', // Fiel corrompido
  '👁️', // Senhor do Círculo
] as const

export function getEnemyAvatarEmoji(dungeonIndex: number): string {
  const i = Math.max(0, Math.min(ENEMY_AVATAR_EMOJIS.length - 1, dungeonIndex))
  return ENEMY_AVATAR_EMOJIS[i]
}
