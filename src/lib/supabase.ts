import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type {
  BuildSnapshot,
  RunRow,
  BattleRecord,
  BattleMode,
  BattlePlayerState,
  BattleEnemyState,
} from '../game/runSubmission'
import type { EnemyTemplate, RunStats } from '../game/types'
import { GAME_VERSION } from '../game/runSubmission'

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

export type ArenaLeaderboardEntry = {
  id: string
  display_name: string
  arena_points: number
}

export async function fetchArenaLeaderboard(limit = 50): Promise<ArenaLeaderboardEntry[]> {
  if (!supabase) {
    const pts = loadLocalArenaPoints()
    return [{ id: localUserId(), display_name: 'Você', arena_points: pts }]
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, arena_points')
    .order('arena_points', { ascending: false })
    .limit(limit)
  if (error) {
    console.error('Arena leaderboard error:', error)
    return []
  }
  return (data ?? []) as ArenaLeaderboardEntry[]
}

// ── Battle history ─────────────────────────────────────────────

const LOCAL_BATTLES_KEY = 'elemental-rift-battles-v1'

function loadLocalBattles(): BattleRecord[] {
  try {
    const raw = localStorage.getItem(LOCAL_BATTLES_KEY)
    if (!raw) return []
    return JSON.parse(raw) as BattleRecord[]
  } catch {
    return []
  }
}

function saveLocalBattles(records: BattleRecord[]) {
  try {
    localStorage.setItem(LOCAL_BATTLES_KEY, JSON.stringify(records))
  } catch {
    /* quota */
  }
}

export async function recordBattle(input: {
  playerName: string
  gameVersion: string
  mode: BattleMode
  arenaPoints: number
  campaignPhase: number
  chamberIndex: number
  won: boolean
  playerState: BattlePlayerState
  enemyState: BattleEnemyState
  damageDealt: number
  damageTaken: number
  combatRounds: number
  playerHpEnd: number
  enemyHpEnd: number
}): Promise<void> {
  if (!supabase) {
    const rec: BattleRecord = {
      id: crypto.randomUUID(),
      user_id: localUserId(),
      player_name: input.playerName,
      game_version: input.gameVersion,
      mode: input.mode,
      arena_points: input.arenaPoints,
      campaign_phase: input.campaignPhase,
      chamber_index: input.chamberIndex,
      won: input.won,
      player_state: input.playerState,
      enemy_state: input.enemyState,
      damage_dealt: input.damageDealt,
      damage_taken: input.damageTaken,
      combat_rounds: input.combatRounds,
      player_hp_end: input.playerHpEnd,
      enemy_hp_end: input.enemyHpEnd,
      created_at: new Date().toISOString(),
    }
    const all = loadLocalBattles()
    all.push(rec)
    saveLocalBattles(all)
    return
  }

  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) return

  const { error } = await supabase.from('battle_history').insert({
    user_id: session.user.id,
    player_name: input.playerName,
    game_version: input.gameVersion,
    mode: input.mode,
    arena_points: input.arenaPoints,
    campaign_phase: input.campaignPhase,
    chamber_index: input.chamberIndex,
    won: input.won,
    player_state: input.playerState,
    enemy_state: input.enemyState,
    damage_dealt: input.damageDealt,
    damage_taken: input.damageTaken,
    combat_rounds: input.combatRounds,
    player_hp_end: input.playerHpEnd,
    enemy_hp_end: input.enemyHpEnd,
  })
  if (error) console.error('Record battle error:', error)
}

// ── PvP matchmaking ────────────────────────────────────────────

export type PvpCandidate = {
  playerName: string
  lives: number
  arenaPoints: number
  template: EnemyTemplate
}

/** Pool of PvP candidates indexed by chamber_index. */
export type PvpPool = PvpCandidate[][]

function shuffleArray<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j]!, arr[i]!]
  }
  return arr
}

function rowToCandidate(rec: {
  player_name: string
  player_state: BattlePlayerState
  arena_points?: number
}): PvpCandidate {
  return {
    playerName: rec.player_name,
    lives: rec.player_state.lives,
    arenaPoints: rec.arena_points ?? 1000,
    template: {
      name: rec.player_name,
      hp: rec.player_state.playerHpMax,
      dice: rec.player_state.collection.map((d) => ({
        sides: d.sides,
        count: d.count,
        special: [...d.special],
      })),
    },
  }
}

/**
 * Fetch the full pool of PvP candidates from battle_history.
 * Prioritises PvP builds; falls back to PvE builds per chamber when needed.
 * Returns `PvpPool` — an array (indexed by chamber) of candidate arrays.
 */
export async function fetchPvpPool(
  campaignPhase: number,
  totalChambers: number,
  excludeUserId?: string,
): Promise<PvpPool> {
  type Row = { player_name: string; player_state: BattlePlayerState; chamber_index: number; mode: string; arena_points?: number }

  let rows: Row[] = []

  if (supabase) {
    let query = supabase
      .from('battle_history')
      .select('player_name, player_state, chamber_index, mode, arena_points')
      .eq('game_version', GAME_VERSION)
      .eq('campaign_phase', campaignPhase)
      .in('mode', ['pvp', 'pve'])
      .eq('won', true)
      .limit(500)

    if (excludeUserId) query = query.neq('user_id', excludeUserId)

    const { data, error } = await query
    if (error) console.error('PvP fetch error:', error)
    rows = (data ?? []) as Row[]
  } else {
    const all = loadLocalBattles()
    const uid = localUserId()
    rows = all.filter(
      (r) =>
        r.game_version === GAME_VERSION &&
        r.campaign_phase === campaignPhase &&
        r.won &&
        r.user_id !== uid,
    ) as Row[]
  }

  const pvpByChamber = new Map<number, Row[]>()
  const pveByChamber = new Map<number, Row[]>()

  for (const row of rows) {
    if (row.chamber_index < 0 || row.chamber_index >= totalChambers) continue
    const bucket = (row.mode ?? 'pve') === 'pvp' ? pvpByChamber : pveByChamber
    const arr = bucket.get(row.chamber_index) ?? []
    arr.push(row)
    bucket.set(row.chamber_index, arr)
  }

  const pool: PvpPool = Array.from({ length: totalChambers }, () => [])
  for (let i = 0; i < totalChambers; i++) {
    const pvpRows = pvpByChamber.get(i)
    const source = pvpRows && pvpRows.length > 0 ? pvpRows : (pveByChamber.get(i) ?? [])
    pool[i] = source.map(rowToCandidate)
  }
  return pool
}

/**
 * Pick the best opponent from the pool for a given chamber + current lives + arena rank.
 *
 * Strategy:
 *  1. Filter by lives (exact match first, then closest).
 *  2. Among lives-matched candidates, sort by closest arena points.
 *  3. Pick randomly from the top tier (within 150 AP tolerance).
 *  4. No candidates → null (caller uses fallback mob).
 */
export function pickFromPool(
  pool: PvpPool,
  chamberIndex: number,
  playerLives: number,
  playerArenaPoints: number,
): EnemyTemplate | null {
  const candidates = pool[chamberIndex]
  if (!candidates || candidates.length === 0) return null

  let livesFiltered = candidates.filter((c) => c.lives === playerLives)
  if (livesFiltered.length === 0) {
    const sorted = [...candidates].sort(
      (a, b) => Math.abs(a.lives - playerLives) - Math.abs(b.lives - playerLives),
    )
    const closestDist = Math.abs(sorted[0]!.lives - playerLives)
    livesFiltered = sorted.filter((c) => Math.abs(c.lives - playerLives) === closestDist)
  }

  const AP_TOLERANCE = 150
  livesFiltered.sort(
    (a, b) => Math.abs(a.arenaPoints - playerArenaPoints) - Math.abs(b.arenaPoints - playerArenaPoints),
  )
  const bestDist = Math.abs(livesFiltered[0]!.arenaPoints - playerArenaPoints)
  const tier = livesFiltered.filter(
    (c) => Math.abs(c.arenaPoints - playerArenaPoints) <= bestDist + AP_TOLERANCE,
  )

  return shuffleArray(tier)[0]!.template
}

// ── Arena points ───────────────────────────────────────────────

const LOCAL_ARENA_POINTS_KEY = 'elemental-rift-arena-points'

function loadLocalArenaPoints(): number {
  try {
    const v = localStorage.getItem(LOCAL_ARENA_POINTS_KEY)
    return v ? Number(v) : 1000
  } catch {
    return 1000
  }
}

function saveLocalArenaPoints(pts: number) {
  try {
    localStorage.setItem(LOCAL_ARENA_POINTS_KEY, String(pts))
  } catch { /* quota */ }
}

export async function fetchArenaPoints(): Promise<number> {
  if (!supabase) return loadLocalArenaPoints()

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return loadLocalArenaPoints()

  const { data, error } = await supabase
    .from('profiles')
    .select('arena_points')
    .eq('id', session.user.id)
    .single()
  if (error || !data) return loadLocalArenaPoints()
  return (data as { arena_points: number }).arena_points
}

export async function updateArenaPoints(delta: number): Promise<number> {
  const current = await fetchArenaPoints()
  const next = Math.max(0, current + delta)

  if (!supabase) {
    saveLocalArenaPoints(next)
    return next
  }

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    saveLocalArenaPoints(next)
    return next
  }

  const { error } = await supabase
    .from('profiles')
    .update({ arena_points: next })
    .eq('id', session.user.id)
  if (error) console.error('Update arena points error:', error)

  saveLocalArenaPoints(next)
  return next
}
