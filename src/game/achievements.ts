import { loadPersistentStats } from './persistentStats'

export type AchievementDef = {
  id: string
  title: string
  desc: string
  icon: string
}

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'first_win',
    title: 'Primeira marca',
    desc: 'Vença qualquer batalha (acumulado entre runs).',
    icon: '🥇',
  },
  {
    id: 'wins_25',
    title: 'Veterano da Fenda',
    desc: 'Vença 25 batalhas no total.',
    icon: '⚔️',
  },
  {
    id: 'damage_2k_battle',
    title: 'Avalanche',
    desc: 'Cause mais de 2.000 de dano ao inimigo em uma única batalha.',
    icon: '💥',
  },
  {
    id: 'damage_100k_life',
    title: 'Rachadura profunda',
    desc: 'Cause 100.000 de dano no total (todas as runs).',
    icon: '🌋',
  },
  {
    id: 'triple_one',
    title: 'Três azarados',
    desc: 'Tire 1 natural em três rolagens seguidas suas na mesma batalha.',
    icon: '🎲',
  },
  {
    id: 'nat1_fifty',
    title: 'Ímã do 1',
    desc: 'Acumule 50 rolagens com face 1 nos seus dados.',
    icon: '🧲',
  },
  {
    id: 'flawless_one',
    title: 'Sem arranhões',
    desc: 'Vença uma batalha sem perder PV.',
    icon: '✨',
  },
  {
    id: 'natural_20',
    title: 'Face do núcleo',
    desc: 'Tire 20 natural num d20.',
    icon: '⭐',
  },
  {
    id: 'upgrades_30',
    title: 'Grimório espesso',
    desc: 'Escolha 30 melhorias no grimório (todas as runs).',
    icon: '📖',
  },
  {
    id: 'campaign_complete',
    title: 'Núcleo silenciado',
    desc: 'Complete a campanha inteira com vitória.',
    icon: '💠',
  },
  {
    id: 'chamber_10',
    title: 'Fundo da trilha',
    desc: 'Vença a 10ª câmara de uma fase em alguma run.',
    icon: '🕳️',
  },
  {
    id: 'clutch_1hp',
    title: 'Último fôlego',
    desc: 'Vença uma batalha com exatamente 1 PV restante.',
    icon: '💓',
  },
  {
    id: 'round_damage_150',
    title: 'Rajada concentrada',
    desc: 'Cause mais de 150 de dano ao inimigo em uma única rodada.',
    icon: '🔥',
  },
  {
    id: 'poison_10_battle',
    title: 'Rio tóxico',
    desc: 'Aplique pelo menos 10 acúmulos de veneno ao inimigo em uma batalha.',
    icon: '☠️',
  },
]

export function getAchievementById(id: string): AchievementDef | undefined {
  return ACHIEVEMENTS.find((a) => a.id === id)
}

export function achievementProgressLabel(id: string): string | null {
  const s = loadPersistentStats()
  switch (id) {
    case 'wins_25':
      return `${Math.min(s.lifetimeBattlesWon, 25)} / 25 vitórias`
    case 'damage_100k_life':
      return `${Math.min(s.lifetimeDamageDealt, 100_000).toLocaleString('pt-BR')} / 100.000 dano`
    case 'nat1_fifty':
      return `${Math.min(s.playerNat1Total, 50)} / 50 faces 1`
    case 'upgrades_30':
      return `${Math.min(s.upgradesChosenTotal, 30)} / 30 melhorias`
    default:
      return null
  }
}
