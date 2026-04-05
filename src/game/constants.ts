import type { DieInstance, EnemyTemplate, SpecialDef } from './types'

export const DICE_TYPES = [4, 6, 8, 10, 12, 20] as const

/** Trilha do menu (arquivo em `public/musics/`). */
export const MENU_MUSIC_URL = '/musics/amok4.mp3.mpeg'

/** Número de batalhas por fase da trilha (sem perder todas as vidas). */
export const TOTAL_BATTLES = 10

/** Trilha completa: 3 fases de 10 vitórias, dificuldade e dado inicial crescentes. */
export const CAMPAIGN_PHASE_COUNT = 3

/** Nome, ícone e classe CSS de fundo por fase (batalha / upgrade / fronteira). */
export const CAMPAIGN_PHASES = [
  {
    label: 'Penumbra',
    icon: '🌘',
    bgClass: 'campaign-phase-0',
  },
  {
    label: 'Vértice',
    icon: '⚡',
    bgClass: 'campaign-phase-1',
  },
  {
    label: 'Núcleo',
    icon: '💠',
    bgClass: 'campaign-phase-2',
  },
] as const

export function getCampaignPhaseTheme(phaseIndex: number) {
  const i = Math.min(
    Math.max(0, phaseIndex),
    CAMPAIGN_PHASES.length - 1,
  )
  return CAMPAIGN_PHASES[i]
}

/** Total de câmaras para vencer a campanha (todas as fases). */
export const TOTAL_CAMPAIGN_CHAMBERS = TOTAL_BATTLES * CAMPAIGN_PHASE_COUNT

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

/**
 * Coleção inicial do jogador na fase `phaseIndex` (0 = 1d4, 1 = 1d6, 2 = 1d8, …).
 */
export function startingCollectionForPhase(phaseIndex: number): DieInstance[] {
  const idx = Math.min(
    Math.max(0, phaseIndex),
    DICE_TYPES.length - 1,
  )
  return [{ sides: DICE_TYPES[idx], count: 1, special: [] }]
}

/**
 * Fila de inimigos da fase. Fases posteriores: mais PV e dados em patamares mais altos.
 */
export function createRunEnemies(phaseIndex = 0): EnemyTemplate[] {
  const p = Math.max(0, phaseIndex)
  const hpMult = 1 + p * 0.24
  const diceOffset = p
  return DUNGEON_ENEMIES.map((row, i) => {
    const tierIdx = Math.min(i + diceOffset, DICE_TYPES.length - 1)
    const sides = DICE_TYPES[tierIdx]
    return {
      name: row.name,
      hp: Math.max(1, Math.round(row.hp * hpMult)),
      dice: [{ sides, count: 1, special: [] }],
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
    desc: 'Remove a face mais baixa do dado e duplica a mais alta na mesa de rolagem. Cada cópia extra remove mais uma face baixa e soma outra face máxima',
    icon: '👥',
  },
  {
    id: 'poison',
    label: 'Veneno da fenda',
    desc: 'Rolar 6 aplica um acúmulo: no início de cada rodada seguinte, o oponente perde 1 PV por acúmulo (até o fim do combate)',
    icon: '☠️',
  },
]

export function getSpecialById(id: string | null | undefined) {
  if (!id) return null
  return SPECIALS.find((s) => s.id === id) ?? null
}
