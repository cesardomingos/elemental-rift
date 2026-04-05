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
 * Single ranking number — higher is better.
 * Primary axis: each battle won is worth 10 000 pts (0-30 wins → 0-300 000).
 * Tiebreaker: fewer combat rounds = higher efficiency bonus (0-9 999).
 */
export function computeScore(stats: RunStats): number {
  return stats.battlesWon * 10_000 + Math.max(0, 9_999 - stats.combatRounds)
}
