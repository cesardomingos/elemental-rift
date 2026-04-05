import type { EnemyTemplate, SpecialDef } from './types'

export const DICE_TYPES = [4, 6, 8, 10, 12, 20] as const

/** Trilha do menu (arquivo em `public/musics/`). */
export const MENU_MUSIC_URL = '/musics/amok4.mp3.mpeg'

/** Número de batalhas para vencer a run (sem perder todas as vidas). */
export const TOTAL_BATTLES = 10

/** Vida inicial do alquimista e quanto o limite sobe após cada batalha (estudo no abismo). */
export const PLAYER_BASE_HP = 20
export const PLAYER_HP_GROWTH_PER_BATTLE = 3

/**
 * Inimigos em ordem de profundidade na dungeon (do superficial ao núcleo).
 * HP reduzido em relação à curva anterior para manter o ritmo com o crescimento do jogador.
 */
const DUNGEON_ENEMIES: { name: string; hp: number }[] = [
  { name: 'Lodo do poço', hp: 11 },
  { name: 'Verme de fosso', hp: 16 },
  { name: 'Esqueleto tombado', hp: 23 },
  { name: 'Aranha de alvéolo', hp: 28 },
  { name: 'Carniçal tolhido', hp: 34 },
  { name: 'Cavaleiro espectral', hp: 40 },
  { name: 'Golem de salão', hp: 46 },
  { name: 'Elemental amalgamado', hp: 52 },
  { name: 'Fiel corrompido', hp: 58 },
  { name: 'Senhor do Círculo', hp: 64 },
]

/** Cria a fila de inimigos da run (uma entrada por batalha). */
export function createRunEnemies(): EnemyTemplate[] {
  return DUNGEON_ENEMIES.map((row, i) => {
    const sides = DICE_TYPES[Math.min(i, DICE_TYPES.length - 1)]
    return {
      name: row.name,
      hp: row.hp,
      dice: [{ sides, count: 1, special: null }],
    }
  })
}

export const SPECIALS: SpecialDef[] = [
  {
    id: 'double_max',
    label: 'Dobro no máximo',
    desc: 'Rolar o valor máximo conta em dobro',
    icon: '✨',
  },
  {
    id: 'explode',
    label: 'Dado explosivo',
    desc: 'Rolar máximo adiciona +3 bônus',
    icon: '💥',
  },
  {
    id: 'heal',
    label: 'Cura no mínimo',
    desc: 'Rolar 1 recupera 2 HP',
    icon: '💚',
  },
  {
    id: 'reroll',
    label: 'Re-rola 1s',
    desc: 'Rolar 1 faz re-rolar automaticamente',
    icon: '🔄',
  },
  {
    id: 'steady',
    label: 'Golpe firme',
    desc: '+1 de dano em toda rolagem',
    icon: '🎯',
  },
  {
    id: 'high_half',
    label: 'Valor alto',
    desc: 'Rolagem ≥ metade do dado: +2 de dano',
    icon: '📈',
  },
  {
    id: 'even_strike',
    label: 'Par perfeito',
    desc: 'Rolagens pares ganham +1 de dano',
    icon: '⚖️',
  },
  {
    id: 'odd_strike',
    label: 'Ímpeto ímpar',
    desc: 'Rolagens ímpares ganham +1 de dano',
    icon: '🔷',
  },
  {
    id: 'desperate',
    label: 'Desespero',
    desc: 'Rolar 1 causa +3 de dano extra',
    icon: '😤',
  },
  {
    id: 'glass',
    label: 'Vidro temperado',
    desc: 'Rolar o máximo: +5 de dano extra',
    icon: '🔮',
  },
  {
    id: 'fonte_vital',
    label: 'Fonte vital',
    desc: 'Rolar 1 recupera 4 HP',
    icon: '💧',
  },
  {
    id: 'wound_salve',
    label: 'Bálsamo de ferida',
    desc: 'Rolar 1 recupera 3 HP',
    icon: '🧴',
  },
  {
    id: 'tempest',
    label: 'Tempestade',
    desc: 'Rolar 1 ou o máximo: +2 de dano',
    icon: '🌩️',
  },
  {
    id: 'brink',
    label: 'No limiar',
    desc: 'Rolar 2 ou (máximo−1): +2 de dano',
    icon: '⚡',
  },
  {
    id: 'pulse',
    label: 'Pulso elementar',
    desc: 'Rolar no terço superior do dado: +2 de dano',
    icon: '✴️',
  },
  {
    id: 'opening_crit',
    label: 'Rito de abertura',
    desc: 'Na 1ª rodada da câmara, este dado sempre revela a face máxima (crítico)',
    icon: '☀️',
  },
  {
    id: 'twinned_max',
    label: 'Face gêmea',
    desc: 'O maior valor do dado conta duas vezes na mesa (o máximo tem o dobro da chance)',
    icon: '👥',
  },
]

export function getSpecialById(id: string | null | undefined) {
  if (!id) return null
  return SPECIALS.find((s) => s.id === id) ?? null
}
