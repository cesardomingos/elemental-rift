import { create } from 'zustand'
import {
  DICE_TYPES,
  PLAYER_BASE_HP,
  PLAYER_HP_GROWTH_PER_BATTLE,
  SPECIALS,
  TOTAL_BATTLES,
  createRunEnemies,
  getSpecialById,
} from '../game/constants'
import { rollAllDice, sumHealFromRolls, totalRoll } from '../game/dice'
import type {
  DieInstance,
  EnemyTemplate,
  LogEntry,
  RollResult,
  RunStats,
  Screen,
  UpgradeOption,
} from '../game/types'
import { emptyRunStats } from '../game/types'
import {
  sfxEnemyDamaged,
  sfxPhaseLost,
  sfxPhaseWon,
  sfxPlayerDamaged,
} from '../audio/feedbackSfx'

let battleAbortController: AbortController | null = null

function initCollection(): DieInstance[] {
  return [{ sides: 4, count: 1, special: null }]
}

function logId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    const t = window.setTimeout(resolve, ms)
    const onAbort = () => {
      window.clearTimeout(t)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

/** Espera `ms` respeitando pausa: o tempo não corre enquanto `battlePaused`. */
async function delayBattle(
  ms: number,
  getState: () => { battlePaused: boolean; battleRunning: boolean },
  signal: AbortSignal,
  tickMs = 50,
): Promise<boolean> {
  let left = ms
  while (left > 0) {
    while (getState().battlePaused && getState().battleRunning && !signal.aborted) {
      try {
        await sleep(tickMs, signal)
      } catch {
        return false
      }
    }
    if (!getState().battleRunning || signal.aborted) return false
    const step = Math.min(tickMs, left)
    try {
      await sleep(step, signal)
    } catch {
      return false
    }
    left -= step
  }
  return true
}

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function upgradesEquivalent(a: UpgradeOption, b: UpgradeOption): boolean {
  if (a.type !== b.type) return false
  if (a.type === 'add_special') return a.special === b.special
  return true
}

/** Opções que podem aparecer nos slots 2 e 3 (sorteadas). */
function buildRandomUpgradePool(collection: DieInstance[]): UpgradeOption[] {
  const pool: UpgradeOption[] = [
    {
      type: 'add_die',
      icon: '🎲',
      label: 'Novo dado d4',
      desc: 'Adiciona 1d4 extra à coleção',
    },
    {
      type: 'add_count',
      icon: '➕',
      label: 'Mais um dado (maior tipo)',
      desc: 'Adiciona +1 dado ao maior tipo',
    },
  ]
  if (collection.some((di) => !di.special)) {
    for (const sp of SPECIALS) {
      pool.push({
        type: 'add_special',
        icon: sp.icon,
        label: sp.label,
        desc: sp.desc,
        special: sp.id,
      })
    }
  }
  return pool
}

function pickTwoRandomUpgrades(
  collection: DieInstance[],
  fixed: UpgradeOption,
): UpgradeOption[] {
  const pool = shuffleArray(
    buildRandomUpgradePool(collection).filter((p) => !upgradesEquivalent(p, fixed)),
  )
  const picked: UpgradeOption[] = []
  for (const p of pool) {
    if (picked.length >= 2) break
    if (!picked.some((x) => upgradesEquivalent(x, p))) picked.push(p)
  }
  const safeFallback: UpgradeOption = {
    type: 'add_die',
    icon: '🎲',
    label: 'Novo dado d4',
    desc: 'Adiciona 1d4 extra à coleção',
  }
  while (picked.length < 2) {
    picked.push({ ...safeFallback })
  }
  return picked
}

function generateUpgrades(collection: DieInstance[]): UpgradeOption[] {
  const d = collection[collection.length - 1]
  const dIdx = DICE_TYPES.indexOf(d.sides as (typeof DICE_TYPES)[number])

  const fixed: UpgradeOption =
    dIdx < DICE_TYPES.length - 1
      ? {
          type: 'upgrade_die',
          icon: '⬆️',
          label: `Evoluir para d${DICE_TYPES[dIdx + 1]}`,
          desc: `Seu melhor dado vira 1d${DICE_TYPES[dIdx + 1]}`,
        }
      : {
          type: 'add_count',
          icon: '➕',
          label: 'Mais um dado',
          desc: 'Adiciona +1 dado ao maior tipo',
        }

  return [fixed, ...pickTwoRandomUpgrades(collection, fixed)]
}

function generateEnemyUpgrade(enemy: EnemyTemplate): UpgradeOption {
  const roll = Math.random()
  if (roll < 0.4) {
    const d = enemy.dice[0]
    const dIdx = DICE_TYPES.indexOf(d.sides as (typeof DICE_TYPES)[number])
    if (dIdx < DICE_TYPES.length - 1) {
      return {
        type: 'upgrade_die',
        icon: '⬆️',
        label: 'Dado maior',
        desc: `Inimigo evolui para d${DICE_TYPES[dIdx + 1]}`,
      }
    }
  }
  if (roll < 0.7) {
    return {
      type: 'add_hp',
      icon: '❤️',
      label: '+8 de vida',
      desc: 'Próximo inimigo tem mais HP',
    }
  }
  const sp = SPECIALS[Math.floor(Math.random() * SPECIALS.length)]
  return {
    type: 'add_special',
    icon: sp.icon,
    label: sp.label,
    desc: sp.desc,
    special: sp.id,
  }
}

function applyEnemyUpgradeToNext(
  enemies: EnemyTemplate[],
  battleIndex: number,
  u: UpgradeOption,
) {
  const nextIdx = battleIndex + 1
  if (nextIdx >= enemies.length) return
  const next = enemies[nextIdx]
  if (u.type === 'upgrade_die') {
    const d = next.dice[0]
    const dIdx = DICE_TYPES.indexOf(d.sides as (typeof DICE_TYPES)[number])
    if (dIdx < DICE_TYPES.length - 1) d.sides = DICE_TYPES[dIdx + 1]
  } else if (u.type === 'add_hp') {
    next.hp += 8
  } else if (u.type === 'add_special' && u.special) {
    next.dice[0].special = u.special
  }
}

interface GameState {
  screen: Screen
  collection: DieInstance[]
  lives: number
  battleIndex: number
  enemies: EnemyTemplate[]
  playerHp: number
  playerHpMax: number
  enemyHp: number
  enemyHpMax: number
  battleLog: LogEntry[]
  playerRolls: RollResult[]
  enemyRolls: RollResult[]
  isRolling: boolean
  battleRunning: boolean
  battlePaused: boolean
  speed: number
  battleSessionId: number
  battleRound: number
  pendingUpgrades: UpgradeOption[]
  enemyUpgradePreview: string
  lastBattleWon: boolean
  endVictory: boolean
  lastBattleLog: LogEntry[]
  runStats: RunStats
  startRun: () => void
  goToStart: () => void
  startBattle: () => void
  toggleSpeed: () => void
  toggleBattlePause: () => void
  skipBattle: () => void
  applyUpgrade: (idx: number) => void
  runBattleAsync: (signal: AbortSignal) => Promise<void>
  processOneTurn: (signal: AbortSignal) => Promise<'continue' | 'end' | 'aborted'>
  endBattle: () => void
  showUpgradeAfterBattle: (won: boolean) => void
  showEndScreen: (victory: boolean) => void
}

export const useGameStore = create<GameState>((set, get) => ({
  screen: 'start',
  collection: initCollection(),
  lives: 3,
  battleIndex: 0,
  enemies: [],
  playerHp: PLAYER_BASE_HP,
  playerHpMax: PLAYER_BASE_HP,
  enemyHp: 14,
  enemyHpMax: 14,
  battleLog: [],
  playerRolls: [],
  enemyRolls: [],
  isRolling: false,
  battleRunning: false,
  battlePaused: false,
  speed: 1,
  battleSessionId: 0,
  battleRound: 0,
  pendingUpgrades: [],
  enemyUpgradePreview: '',
  lastBattleWon: false,
  endVictory: false,
  lastBattleLog: [],
  runStats: emptyRunStats(),
  goToStart: () => {
    battleAbortController?.abort()
    battleAbortController = null
    set({ screen: 'start', battleRunning: false, battlePaused: false, runStats: emptyRunStats() })
  },

  startRun: () => {
    battleAbortController?.abort()
    battleAbortController = null
    set({
      collection: initCollection(),
      lives: 3,
      battleIndex: 0,
      enemies: createRunEnemies(),
      playerHpMax: PLAYER_BASE_HP,
      playerHp: PLAYER_BASE_HP,
      lastBattleLog: [],
      runStats: emptyRunStats(),
      screen: 'battle',
    })
    get().startBattle()
  },

  startBattle: () => {
    const s = get()
    const enemy = s.enemies[s.battleIndex]
    battleAbortController?.abort()
    battleAbortController = new AbortController()
    const signal = battleAbortController.signal

    set({
      enemyHp: enemy.hp,
      enemyHpMax: enemy.hp,
      battleLog: [],
      playerRolls: [],
      enemyRolls: [],
      isRolling: false,
      battleRunning: true,
      battlePaused: false,
      speed: 1,
      battleSessionId: s.battleSessionId + 1,
      battleRound: 0,
    })

    void get().runBattleAsync(signal)
  },

  toggleSpeed: () => {
    set((state) => ({ speed: state.speed === 1 ? 3 : 1 }))
  },

  toggleBattlePause: () => {
    const s = get()
    if (!s.battleRunning) return
    set({ battlePaused: !s.battlePaused })
  },

  skipBattle: () => {
    const state = get()
    if (!state.battleRunning) return

    battleAbortController?.abort()
    battleAbortController = null
    set({ battleRunning: false, battlePaused: false })

    const enemy = state.enemies[state.battleIndex]
    let playerHp = state.playerHp
    let enemyHp = state.enemyHp
    const { playerHpMax, collection } = state
    let round = 0

    const enemyHpMax = enemy.hp

    const acc = {
      damageDealt: 0,
      damageTaken: 0,
      combatRounds: 0,
      playerDiceRolled: 0,
      enemyDiceRolled: 0,
      healFromSpecials: 0,
      enemyHealFromSpecials: 0,
      healFromDiceRegen: 0,
      enemyHealFromDiceRegen: 0,
    }

    while (playerHp > 0 && enemyHp > 0 && round < 200) {
      round++
      const playerRolls = rollAllDice(collection, {
        currentBattleRound: round - 1,
      })
      const enemyRolls = rollAllDice(enemy.dice, {
        currentBattleRound: round - 1,
      })
      const plSpec = sumHealFromRolls(playerRolls)
      const enSpec = sumHealFromRolls(enemyRolls)
      playerHp = Math.min(playerHpMax, playerHp + plSpec)
      enemyHp = Math.min(enemyHpMax, enemyHp + enSpec)
      const regP = playerRolls.length
      const regE = enemyRolls.length
      playerHp = Math.min(playerHpMax, playerHp + regP)
      enemyHp = Math.min(enemyHpMax, enemyHp + regE)
      const pTot = totalRoll(playerRolls)
      const eTot = totalRoll(enemyRolls)
      enemyHp -= pTot
      playerHp -= eTot

      acc.damageDealt += pTot
      acc.damageTaken += eTot
      acc.combatRounds += 1
      acc.playerDiceRolled += playerRolls.length
      acc.enemyDiceRolled += enemyRolls.length
      acc.healFromSpecials += plSpec
      acc.enemyHealFromSpecials += enSpec
      acc.healFromDiceRegen += regP
      acc.enemyHealFromDiceRegen += regE
    }

    set((s) => ({
      playerHp,
      enemyHp,
      playerRolls: [],
      enemyRolls: [],
      isRolling: false,
      battleLog: [
        {
          id: logId(),
          text: '⏭ Batalha pulada!',
          kind: 'info',
        },
        ...s.battleLog,
      ],
      runStats: {
        ...s.runStats,
        damageDealt: s.runStats.damageDealt + acc.damageDealt,
        damageTaken: s.runStats.damageTaken + acc.damageTaken,
        combatRounds: s.runStats.combatRounds + acc.combatRounds,
        playerDiceRolled: s.runStats.playerDiceRolled + acc.playerDiceRolled,
        enemyDiceRolled: s.runStats.enemyDiceRolled + acc.enemyDiceRolled,
        healFromSpecials: s.runStats.healFromSpecials + acc.healFromSpecials,
        enemyHealFromSpecials: s.runStats.enemyHealFromSpecials + acc.enemyHealFromSpecials,
        healFromDiceRegen: s.runStats.healFromDiceRegen + acc.healFromDiceRegen,
        enemyHealFromDiceRegen: s.runStats.enemyHealFromDiceRegen + acc.enemyHealFromDiceRegen,
      },
    }))

    if (acc.damageTaken > 0) sfxPlayerDamaged()
    if (acc.damageDealt > 0) sfxEnemyDamaged()

    window.setTimeout(() => get().endBattle(), 400)
  },

  processOneTurn: async (signal) => {
    const st = get()
    if (!st.battleRunning || signal.aborted) return 'aborted'

    const enemy = st.enemies[st.battleIndex]
    const playerRolls = rollAllDice(st.collection, {
      currentBattleRound: st.battleRound,
    })
    const enemyRolls = rollAllDice(enemy.dice, {
      currentBattleRound: st.battleRound,
    })
    const nextRound = st.battleRound + 1

    set({
      battleRound: nextRound,
      playerRolls,
      enemyRolls,
      isRolling: true,
    })

    if (!(await delayBattle(400, () => get(), signal))) return 'aborted'

    if (signal.aborted) return 'aborted'
    if (!get().battleRunning) return 'aborted'

    const cur = get()
    const pRolls = cur.playerRolls
    const eRolls = cur.enemyRolls

    let playerHp = cur.playerHp
    let enemyHp = cur.enemyHp
    const { playerHpMax, enemyHpMax } = cur

    pRolls.forEach((r) => {
      if (r.msg) {
        set((s) => ({
          battleLog: [
            { id: logId(), text: `🎲 ${r.msg}`, kind: 'special-msg' },
            ...s.battleLog,
          ],
        }))
      }
    })
    eRolls.forEach((r) => {
      if (r.msg) {
        set((s) => ({
          battleLog: [
            { id: logId(), text: `👹 ${r.msg}`, kind: 'special-msg' },
            ...s.battleLog,
          ],
        }))
      }
    })

    const plHealSpec = sumHealFromRolls(pRolls)
    const enHealSpec = sumHealFromRolls(eRolls)
    playerHp = Math.min(playerHpMax, playerHp + plHealSpec)
    enemyHp = Math.min(enemyHpMax, enemyHp + enHealSpec)

    const rollHealP = pRolls.length
    const rollHealE = eRolls.length
    playerHp = Math.min(playerHpMax, playerHp + rollHealP)
    enemyHp = Math.min(enemyHpMax, enemyHp + rollHealE)

    const pTotal = totalRoll(pRolls)
    const eTotal = totalRoll(eRolls)
    enemyHp -= pTotal
    playerHp -= eTotal

    const logKind =
      eTotal > pTotal ? 'damage-player' : 'damage-enemy'

    const regenLine =
      rollHealP > 0 || rollHealE > 0
        ? `💧 +${rollHealP} HP (dados) · inimigo +${rollHealE} HP`
        : null

    set((s) => ({
      isRolling: false,
      playerHp,
      enemyHp,
      battleLog: [
        {
          id: logId(),
          text: `Rodada ${nextRound}: Você causou ${pTotal} dano · Inimigo causou ${eTotal} dano`,
          kind: logKind,
        },
        ...(regenLine
          ? [{ id: logId(), text: regenLine, kind: 'info' as const }]
          : []),
        ...s.battleLog,
      ],
      runStats: {
        ...s.runStats,
        damageDealt: s.runStats.damageDealt + pTotal,
        damageTaken: s.runStats.damageTaken + eTotal,
        combatRounds: s.runStats.combatRounds + 1,
        playerDiceRolled: s.runStats.playerDiceRolled + pRolls.length,
        enemyDiceRolled: s.runStats.enemyDiceRolled + eRolls.length,
        healFromSpecials: s.runStats.healFromSpecials + plHealSpec,
        enemyHealFromSpecials: s.runStats.enemyHealFromSpecials + enHealSpec,
        healFromDiceRegen: s.runStats.healFromDiceRegen + rollHealP,
        enemyHealFromDiceRegen: s.runStats.enemyHealFromDiceRegen + rollHealE,
      },
    }))

    if (eTotal > 0) sfxPlayerDamaged()
    if (pTotal > 0) sfxEnemyDamaged()

    if (playerHp <= 0 || enemyHp <= 0) return 'end'
    return 'continue'
  },

  runBattleAsync: async (signal) => {
    if (!(await delayBattle(800, () => get(), signal))) return
    if (!get().battleRunning || signal.aborted) return

    set((s) => ({
      battleLog: [
        {
          id: logId(),
          text: '⚗️ A mesa reage: canalize os elementos da Fenda.',
          kind: 'info',
        },
        ...s.battleLog,
      ],
    }))

    while (get().battleRunning && !signal.aborted) {
      const pace = 1200 / get().speed
      if (!(await delayBattle(pace, () => get(), signal))) return
      if (!get().battleRunning || signal.aborted) return

      const result = await get().processOneTurn(signal)
      if (result === 'aborted') return
      if (result === 'end') {
        if (!(await delayBattle(600, () => get(), signal))) return
        if (get().battleRunning) get().endBattle()
        return
      }
    }
  },

  endBattle: () => {
    const state = get()
    const won = state.enemyHp <= 0
    let lives = state.lives
    let playerHp = state.playerHp
    const lastBattleLog = state.battleLog.map((e) => ({ ...e }))

    if (!won) {
      lives -= 1
      playerHp = state.playerHpMax
    }

    const floor = state.battleIndex + 1
    const mergeEndStats = (rs: RunStats): RunStats => ({
      ...rs,
      battlesWon: rs.battlesWon + (won ? 1 : 0),
      livesLost: rs.livesLost + (won ? 0 : 1),
      deepestFloor: Math.max(rs.deepestFloor, floor),
    })

    if (lives <= 0) {
      sfxPhaseLost()
      set((s) => ({
        lives,
        playerHp,
        battleRunning: false,
        battlePaused: false,
        lastBattleLog,
        runStats: mergeEndStats(s.runStats),
      }))
      get().showEndScreen(false)
      return
    }

    const isLast = state.battleIndex === TOTAL_BATTLES - 1
    if (isLast && won) {
      sfxPhaseWon()
      set((s) => ({
        lives,
        playerHp,
        battleRunning: false,
        battlePaused: false,
        lastBattleLog,
        runStats: mergeEndStats(s.runStats),
      }))
      get().showEndScreen(true)
      return
    }

    if (won) sfxPhaseWon()
    else sfxPhaseLost()

    set((s) => ({
      lives,
      playerHp,
      battleRunning: false,
      battlePaused: false,
      lastBattleLog,
      runStats: mergeEndStats(s.runStats),
    }))
    get().showUpgradeAfterBattle(won)
  },

  showUpgradeAfterBattle: (won) => {
    const state = get()
    const upgrades = generateUpgrades(state.collection)
    const enemyUp = generateEnemyUpgrade(state.enemies[state.battleIndex])
    const enemies = JSON.parse(JSON.stringify(state.enemies)) as EnemyTemplate[]
    applyEnemyUpgradeToNext(enemies, state.battleIndex, enemyUp)

    set({
      screen: 'upgrade',
      lastBattleWon: won,
      pendingUpgrades: upgrades,
      enemyUpgradePreview: `${enemyUp.icon} ${enemyUp.label}: ${enemyUp.desc}`,
      enemies,
    })
  },

  applyUpgrade: (idx) => {
    const state = get()
    const u = state.pendingUpgrades[idx]
    if (!u) return

    const col = JSON.parse(JSON.stringify(state.collection)) as DieInstance[]
    const newPlayerMax = state.playerHpMax + PLAYER_HP_GROWTH_PER_BATTLE

    if (u.type === 'upgrade_die') {
      const last = col[col.length - 1]
      const dIdx = DICE_TYPES.indexOf(last.sides as (typeof DICE_TYPES)[number])
      last.sides = DICE_TYPES[dIdx + 1]
    } else if (u.type === 'add_die') {
      col.push({ sides: 4, count: 1, special: null })
    } else if (u.type === 'add_count') {
      col[col.length - 1].count++
    } else if (u.type === 'add_special' && u.special) {
      const noSp = col.find((d) => !d.special)
      if (noSp) noSp.special = u.special
    }

    set({
      collection: col,
      battleIndex: state.battleIndex + 1,
      playerHpMax: newPlayerMax,
      playerHp: newPlayerMax,
      screen: 'battle',
      pendingUpgrades: [],
    })
    get().startBattle()
  },

  showEndScreen: (victory) => {
    set({
      screen: 'end',
      endVictory: victory,
      battleRunning: false,
      battlePaused: false,
    })
  },
}))

export { getSpecialById, initCollection }
