import type { DieInstance, RunStats } from './types'

export const GAME_VERSION = '0.1.0'

export interface BuildSnapshot {
  collection: DieInstance[]
  playerHpMax: number
  campaignPhase: number
}

export interface RunRow {
  id: string
  user_id: string | null
  player_name: string
  game_version: string
  score: number
  battles_won: number
  deepest_floor: number
  campaign_completed: boolean
  campaign_phase: number
  combat_rounds: number
  damage_dealt: number
  build_json: BuildSnapshot
  run_stats_json: RunStats
  finished_at: string
}

/**
 * Player build at a specific battle moment.
 * For future offline-PvP: another player's `player_state` becomes your opponent.
 */
export interface BattlePlayerState {
  collection: DieInstance[]
  playerHpMax: number
  lives: number
}

export interface BattleEnemyState {
  name: string
  hp: number
  dice: DieInstance[]
}

export type BattleMode = 'pve' | 'pvp'

export interface BattleRecord {
  id: string
  user_id: string | null
  player_name: string
  game_version: string
  mode: BattleMode
  arena_points: number
  campaign_phase: number
  chamber_index: number
  won: boolean
  player_state: BattlePlayerState
  enemy_state: BattleEnemyState
  damage_dealt: number
  damage_taken: number
  combat_rounds: number
  player_hp_end: number
  enemy_hp_end: number
  created_at: string
}

/**
 * Single ranking number — higher is better.
 * Primary axis: each battle won is worth 10 000 pts (0-30 wins → 0-300 000).
 * Tiebreaker: fewer combat rounds = higher efficiency bonus (0-9 999).
 */
export function computeScore(stats: RunStats): number {
  return stats.battlesWon * 10_000 + Math.max(0, 9_999 - stats.combatRounds)
}

// ── Arena ranking ──────────────────────────────────────────────

export const ARENA_START_POINTS = 1000

export type ArenaRank = 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond'

export type ArenaRankInfo = {
  rank: ArenaRank
  label: string
  icon: string
  minPoints: number
}

const RANK_TIERS: ArenaRankInfo[] = [
  { rank: 'diamond', label: 'Diamante', icon: '💎', minPoints: 2500 },
  { rank: 'platinum', label: 'Platina', icon: '🏅', minPoints: 2000 },
  { rank: 'gold', label: 'Ouro', icon: '🥇', minPoints: 1500 },
  { rank: 'silver', label: 'Prata', icon: '🥈', minPoints: 1000 },
  { rank: 'bronze', label: 'Bronze', icon: '🥉', minPoints: 0 },
]

export function getArenaRankInfo(points: number): ArenaRankInfo {
  return RANK_TIERS.find((t) => points >= t.minPoints) ?? RANK_TIERS[RANK_TIERS.length - 1]!
}

/**
 * Arena point delta after a run.
 * Breakeven at 15 chambers (half the 30-chamber arena).
 * Full clear (+120), early loss at 0 (-120).
 */
export function computeArenaPointsDelta(chambersWon: number): number {
  return (chambersWon - 15) * 8
}
