import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { BuildSnapshot, RunRow } from '../game/runSubmission'
import type { RunStats } from '../game/types'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

export const supabase: SupabaseClient | null =
  url && key ? createClient(url, key) : null

// ── Types ──────────────────────────────────────────────────────

export type AuthUser = {
  id: string
  email: string
  displayName: string
}

// ── localStorage fallback (offline / no env vars) ──────────────

const LOCAL_RUNS_KEY = 'elemental-rift-runs-v1'
const LOCAL_USER_KEY = 'elemental-rift-local-uid'

function localUserId(): string {
  try {
    let uid = localStorage.getItem(LOCAL_USER_KEY)
    if (!uid) {
      uid = crypto.randomUUID()
      localStorage.setItem(LOCAL_USER_KEY, uid)
    }
    return uid
  } catch {
    return 'anonymous'
  }
}

function loadLocalRuns(): RunRow[] {
  try {
    const raw = localStorage.getItem(LOCAL_RUNS_KEY)
    if (!raw) return []
    return JSON.parse(raw) as RunRow[]
  } catch {
    return []
  }
}

function saveLocalRuns(runs: RunRow[]) {
  try {
    localStorage.setItem(LOCAL_RUNS_KEY, JSON.stringify(runs))
  } catch {
    /* quota */
  }
}

// ── Auth ───────────────────────────────────────────────────────

function userFromSession(session: {
  user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> }
}): AuthUser {
  return {
    id: session.user.id,
    email: session.user.email ?? '',
    displayName: (session.user.user_metadata?.display_name as string) ?? 'Alquimista',
  }
}

export async function getAuthUser(): Promise<AuthUser | null> {
  if (!supabase) return null
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) return null
  return userFromSession(session)
}

export async function signUp(
  email: string,
  password: string,
  displayName: string,
): Promise<{ user: AuthUser | null; error: string | null; needsConfirmation: boolean }> {
  if (!supabase)
    return { user: null, error: 'Supabase não configurado.', needsConfirmation: false }
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName } },
  })
  if (error) return { user: null, error: error.message, needsConfirmation: false }
  if (!data.session)
    return { user: null, error: null, needsConfirmation: true }
  return {
    user: {
      id: data.user!.id,
      email: data.user!.email ?? '',
      displayName,
    },
    error: null,
    needsConfirmation: false,
  }
}

export async function signIn(
  email: string,
  password: string,
): Promise<{ user: AuthUser | null; error: string | null }> {
  if (!supabase) return { user: null, error: 'Supabase não configurado.' }
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return { user: null, error: error.message }
  return { user: userFromSession(data), error: null }
}

export async function signOut(): Promise<void> {
  if (!supabase) return
  await supabase.auth.signOut()
}

export function onAuthChange(
  callback: (user: AuthUser | null) => void,
): () => void {
  if (!supabase) return () => {}
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session ? userFromSession(session) : null)
  })
  return () => subscription.unsubscribe()
}

// ── Data ───────────────────────────────────────────────────────

export async function submitRun(input: {
  playerName: string
  gameVersion: string
  score: number
  battlesWon: number
  deepestFloor: number
  campaignCompleted: boolean
  campaignPhase: number
  combatRounds: number
  damageDealt: number
  buildJson: BuildSnapshot
  runStatsJson: RunStats
}): Promise<boolean> {
  if (!supabase) {
    const row: RunRow = {
      id: crypto.randomUUID(),
      user_id: localUserId(),
      player_name: input.playerName,
      game_version: input.gameVersion,
      score: input.score,
      battles_won: input.battlesWon,
      deepest_floor: input.deepestFloor,
      campaign_completed: input.campaignCompleted,
      campaign_phase: input.campaignPhase,
      combat_rounds: input.combatRounds,
      damage_dealt: input.damageDealt,
      build_json: input.buildJson,
      run_stats_json: input.runStatsJson,
      finished_at: new Date().toISOString(),
    }
    const runs = loadLocalRuns()
    runs.push(row)
    saveLocalRuns(runs)
    return true
  }

  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) return false

  const { error } = await supabase.from('runs').insert({
    user_id: session.user.id,
    player_name: input.playerName,
    game_version: input.gameVersion,
    score: input.score,
    battles_won: input.battlesWon,
    deepest_floor: input.deepestFloor,
    campaign_completed: input.campaignCompleted,
    campaign_phase: input.campaignPhase,
    combat_rounds: input.combatRounds,
    damage_dealt: input.damageDealt,
    build_json: input.buildJson,
    run_stats_json: input.runStatsJson,
  })
  if (error) {
    console.error('Submit run error:', error)
    return false
  }
  return true
}

export async function fetchLeaderboard(limit = 50): Promise<RunRow[]> {
  if (!supabase) {
    return loadLocalRuns()
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
  }

  const { data, error } = await supabase
    .from('runs')
    .select('*')
    .order('score', { ascending: false })
    .limit(limit)
  if (error) {
    console.error('Leaderboard error:', error)
    return []
  }
  return (data ?? []) as RunRow[]
}
