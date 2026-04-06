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
    desc: 'Vença qualquer batalha (PVE ou Arena, acumulado entre runs).',
    icon: '🥇',
  },
  {
    id: 'wins_25',
    title: 'Veterano da Fenda',
    desc: 'Vença 25 batalhas no total (PVE e Arena).',
    icon: '⚔️',
  },
  {
    id: 'wins_50',
    title: 'Colecionador de vitórias',
    desc: 'Vença 50 batalhas no total.',
    icon: '🛡️',
  },
  {
    id: 'wins_100',
    title: 'Muralha viva',
    desc: 'Vença 100 batalhas no total.',
    icon: '🏰',
  },
  {
    id: 'wins_500',
    title: 'Devorador de câmaras',
    desc: 'Vença 500 batalhas no total.',
    icon: '⚡',
  },
  {
    id: 'wins_1000',
    title: 'Lenda da Fenda',
    desc: 'Vença 1.000 batalhas no total.',
    icon: '👑',
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
    desc: 'Complete a campanha PVE inteira com vitória.',
    icon: '💠',
  },
  {
    id: 'chamber_10',
    title: 'Fundo da trilha',
    desc: 'Vença a 10.ª câmara de uma fase em alguma run.',
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
  /* ── Arena PvP ── */
  {
    id: 'arena_first_win',
    title: 'Primeiro sangue na Arena',
    desc: 'Vença sua primeira batalha na Arena PvP.',
    icon: '⚔️',
  },
  {
    id: 'arena_wins_10',
    title: 'Gladiador em ascensão',
    desc: 'Vença 10 batalhas na Arena PvP no total.',
    icon: '🏟️',
  },
  {
    id: 'arena_wins_50',
    title: 'Campeão de plateia',
    desc: 'Vença 50 batalhas na Arena PvP no total.',
    icon: '🎖️',
  },
  {
    id: 'arena_wins_100',
    title: 'Ícone da Arena',
    desc: 'Vença 100 batalhas na Arena PvP no total.',
    icon: '🏆',
  },
  {
    id: 'arena_bouts_25',
    title: 'Sob o refletor',
    desc: 'Dispute 25 batalhas na Arena PvP (vitória ou derrota).',
    icon: '🔦',
  },
  {
    id: 'arena_bouts_100',
    title: 'Veterano das lajes',
    desc: 'Dispute 100 batalhas na Arena PvP.',
    icon: '🧱',
  },
  {
    id: 'arena_season_1',
    title: 'Circuito fechado',
    desc: 'Vença uma temporada completa da Arena (todas as câmaras).',
    icon: '🌀',
  },
  {
    id: 'arena_season_5',
    title: 'Dominador serial',
    desc: 'Vença 5 temporadas completas da Arena.',
    icon: '💫',
  },
  {
    id: 'arena_season_15',
    title: 'Monarca da Arena',
    desc: 'Vença 15 temporadas completas da Arena.',
    icon: '👑',
  },
  {
    id: 'arena_ap_1500',
    title: 'Ascensão dourada',
    desc: 'Atinga 1.500 pontos de arena (AP).',
    icon: '🥇',
  },
  {
    id: 'arena_ap_2000',
    title: 'Brilho platino',
    desc: 'Atinga 2.000 pontos de arena (AP).',
    icon: '🏅',
  },
  {
    id: 'arena_ap_2500',
    title: 'Coroa de diamante',
    desc: 'Atinga 2.500 pontos de arena (AP).',
    icon: '💎',
  },
]

export function getAchievementById(id: string): AchievementDef | undefined {
  return ACHIEVEMENTS.find((a) => a.id === id)
}

export function achievementProgressLabel(id: string): string | null {
  const s = loadPersistentStats()

  if (id === 'arena_first_win') {
    return `${Math.min(s.lifetimeArenaBattlesWon, 1)} / 1 vitória na Arena`
  }

  const winsTotal = id.match(/^wins_(\d+)$/)
  if (winsTotal) {
    const t = Number(winsTotal[1])
    return `${Math.min(s.lifetimeBattlesWon, t)} / ${t} vitórias`
  }

  const arenaW = id.match(/^arena_wins_(\d+)$/)
  if (arenaW) {
    const t = Number(arenaW[1])
    return `${Math.min(s.lifetimeArenaBattlesWon, t)} / ${t} vitórias na Arena`
  }

  const arenaB = id.match(/^arena_bouts_(\d+)$/)
  if (arenaB) {
    const t = Number(arenaB[1])
    return `${Math.min(s.lifetimeArenaBattlesPlayed, t)} / ${t} batalhas na Arena`
  }

  const arenaS = id.match(/^arena_season_(\d+)$/)
  if (arenaS) {
    const t = Number(arenaS[1])
    return `${Math.min(s.arenaCampaignsWon, t)} / ${t} temporadas completas`
  }

  const arenaAp = id.match(/^arena_ap_(\d+)$/)
  if (arenaAp) {
    const t = Number(arenaAp[1])
    return `${Math.min(s.peakArenaPoints, t).toLocaleString('pt-BR')} / ${t.toLocaleString('pt-BR')} AP (pico)`
  }

  switch (id) {
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
