const STORAGE_KEY = 'elemental-rift-persistent-v1'

export type PersistentSnapshot = {
  v: 1
  unlockedIds: string[]
  lifetimeDamageDealt: number
  bestSingleBattleDamage: number
  lifetimeBattlesWon: number
  playerNat1Total: number
  bestConsecutiveOnes: number
  flawlessBattleWins: number
  natural20OnD20: number
  upgradesChosenTotal: number
  campaignsCompleted: number
  bestChamberCleared: number
  clutchWins: number
  bestSingleRoundDamage: number
  bestPoisonStacksGainedBattle: number
}

function defaultSnapshot(): PersistentSnapshot {
  return {
    v: 1,
    unlockedIds: [],
    lifetimeDamageDealt: 0,
    bestSingleBattleDamage: 0,
    lifetimeBattlesWon: 0,
    playerNat1Total: 0,
    bestConsecutiveOnes: 0,
    flawlessBattleWins: 0,
    natural20OnD20: 0,
    upgradesChosenTotal: 0,
    campaignsCompleted: 0,
    bestChamberCleared: 0,
    clutchWins: 0,
    bestSingleRoundDamage: 0,
    bestPoisonStacksGainedBattle: 0,
  }
}

let cache: PersistentSnapshot | null = null

export function loadPersistentStats(): PersistentSnapshot {
  if (cache) return cache
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      cache = defaultSnapshot()
      return cache
    }
    const p = JSON.parse(raw) as Partial<PersistentSnapshot>
    if (p.v !== 1 || !Array.isArray(p.unlockedIds)) {
      cache = defaultSnapshot()
      return cache
    }
    const d = defaultSnapshot()
    cache = { ...d, ...p, unlockedIds: [...p.unlockedIds] }
    return cache
  } catch {
    cache = defaultSnapshot()
    return cache
  }
}

function save() {
  if (!cache) return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache))
  } catch {
    /* ignore quota */
  }
}

export function getPersistentSnapshot(): PersistentSnapshot {
  const s = loadPersistentStats()
  return { ...s, unlockedIds: [...s.unlockedIds] }
}

export function isAchievementUnlocked(id: string): boolean {
  return loadPersistentStats().unlockedIds.includes(id)
}

function unlockInPlace(s: PersistentSnapshot, ids: string[]): string[] {
  const newly: string[] = []
  for (const id of ids) {
    if (!s.unlockedIds.includes(id)) {
      s.unlockedIds.push(id)
      newly.push(id)
    }
  }
  return newly
}

export function patchPersistentStats(mutator: (s: PersistentSnapshot) => string[]): string[] {
  const s = loadPersistentStats()
  const newly = mutator(s)
  save()
  return newly
}

/** Após processar rolagens do jogador na rodada. */
export function recordPlayerRollSession(
  rolls: { val: number; sides: number }[],
  sessionOneStreak: number,
): { nextStreak: number; newUnlocks: string[] } {
  let streak = sessionOneStreak
  let nat1ThisBatch = 0
  let saw20 = false
  for (const r of rolls) {
    if (r.val === 1) {
      streak++
      nat1ThisBatch++
    } else {
      streak = 0
    }
    if (r.sides === 20 && r.val === 20) saw20 = true
  }

  const newUnlocks = patchPersistentStats((s) => {
    s.playerNat1Total += nat1ThisBatch
    if (streak > s.bestConsecutiveOnes) s.bestConsecutiveOnes = streak
    if (saw20) s.natural20OnD20++

    const candidates: string[] = []
    if (s.bestConsecutiveOnes >= 3) candidates.push('triple_one')
    if (s.playerNat1Total >= 50) candidates.push('nat1_fifty')
    if (s.natural20OnD20 >= 1) candidates.push('natural_20')
    return unlockInPlace(s, candidates)
  })

  return { nextStreak: streak, newUnlocks }
}

export function recordAfterBattle(input: {
  won: boolean
  sessionDamageToEnemy: number
  sessionDamageToPlayer: number
  playerHpEnd: number
  chamberNumber: number
  sessionMaxRoundDamage: number
  sessionPoisonStacksGained: number
}): string[] {
  return patchPersistentStats((s) => {
    s.lifetimeDamageDealt += input.sessionDamageToEnemy
    if (input.sessionDamageToEnemy > s.bestSingleBattleDamage) {
      s.bestSingleBattleDamage = input.sessionDamageToEnemy
    }
    if (input.sessionMaxRoundDamage > s.bestSingleRoundDamage) {
      s.bestSingleRoundDamage = input.sessionMaxRoundDamage
    }
    if (input.sessionPoisonStacksGained > s.bestPoisonStacksGainedBattle) {
      s.bestPoisonStacksGainedBattle = input.sessionPoisonStacksGained
    }

    if (input.won) {
      s.lifetimeBattlesWon++
      if (input.sessionDamageToPlayer <= 0) s.flawlessBattleWins++
      if (input.playerHpEnd === 1) s.clutchWins++
      if (input.chamberNumber > s.bestChamberCleared) {
        s.bestChamberCleared = input.chamberNumber
      }
    }

    const candidates: string[] = []
    if (s.bestSingleBattleDamage > 2000) candidates.push('damage_2k_battle')
    if (s.lifetimeDamageDealt >= 100_000) candidates.push('damage_100k_life')
    if (s.lifetimeBattlesWon >= 1) candidates.push('first_win')
    if (s.lifetimeBattlesWon >= 25) candidates.push('wins_25')
    if (s.flawlessBattleWins >= 1) candidates.push('flawless_one')
    if (s.bestChamberCleared >= 10) candidates.push('chamber_10')
    if (s.clutchWins >= 1) candidates.push('clutch_1hp')
    if (s.bestSingleRoundDamage > 150) candidates.push('round_damage_150')
    if (s.bestPoisonStacksGainedBattle >= 10) candidates.push('poison_10_battle')
    return unlockInPlace(s, candidates)
  })
}

export function recordUpgradeChosen(): string[] {
  return patchPersistentStats((s) => {
    s.upgradesChosenTotal++
    const candidates: string[] = []
    if (s.upgradesChosenTotal >= 30) candidates.push('upgrades_30')
    return unlockInPlace(s, candidates)
  })
}

export function recordCampaignComplete(): string[] {
  return patchPersistentStats((s) => {
    s.campaignsCompleted++
    const candidates: string[] = []
    if (s.campaignsCompleted >= 1) candidates.push('campaign_complete')
    return unlockInPlace(s, candidates)
  })
}
