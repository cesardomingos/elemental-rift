import { create } from 'zustand'
import {
  CAMPAIGN_PHASE_COUNT,
  DICE_TYPES,
  PLAYER_BASE_HP,
  PLAYER_HP_GROWTH_PER_BATTLE,
  SPECIALS,
  TOTAL_BATTLES,
  createRunEnemies,
  getSpecialById,
  startingCollectionForPhase,
} from '../game/constants'
import {
  poisonStacksGainedFromRolls,
  rollAllDice,
  splitDamageFromRolls,
  sumHealFromRolls,
  totalRoll,
} from '../game/dice'
import type {
  DieInstance,
  EnemyTemplate,
  LogEntry,
  RollResult,
  RunStats,
  Screen,
  UpgradeOption,
  RoundDamagePopup,
  RoundHealPopup,
} from '../game/types'
import { emptyRunStats } from '../game/types'
import {
  sfxEnemyDamaged,
  sfxPhaseLost,
  sfxPhaseWon,
  sfxPlayerDamaged,
} from '../audio/feedbackSfx'

let battleAbortController: AbortController | null = null

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

function upgradesEquivalent(a: UpgradeOption, b: UpgradeOption): boolean {
  if (a.type !== b.type) return false
  if (a.type === 'add_special' || a.type === 'replace_special')
    return a.special === b.special
  return true
}

function canApplyReplaceSpecial(collection: DieInstance[], specialId: string): boolean {
  return collection.some((d) => d.special.some((s) => s !== specialId))
}

/**
 * Próximo add_special vai ao dado com menos marcas; em empate, ao mais à direita
 * (catalisador principal / último da coleção) para favorecer acúmulo desde o início.
 */
function pickDieIndexForNewSpecial(col: DieInstance[]): number {
  if (col.length === 0) return 0
  let minLen = Infinity
  for (const d of col) minLen = Math.min(minLen, d.special.length)
  for (let i = col.length - 1; i >= 0; i--) {
    if (col[i].special.length === minLen) return i
  }
  return col.length - 1
}

type WeightedUpgrade = { opt: UpgradeOption; w: number }

/**
 * Candidatos aos slots 2 e 3 com pesos. Especiais podem acumular; add_special entra sempre.
 * replace_special aparece quando já existe marca para regravar.
 */
function buildWeightedRandomPool(
  collection: DieInstance[],
  fixed: UpgradeOption,
): WeightedUpgrade[] {
  const out: WeightedUpgrade[] = []

  const addDie: UpgradeOption = {
    type: 'add_die',
    icon: '🎲',
    label: 'Novo dado d4',
    desc: 'Adiciona 1d4 extra à coleção',
  }
  const addCount: UpgradeOption = {
    type: 'add_count',
    icon: '➕',
    label: 'Mais um dado (maior tipo)',
    desc: 'Adiciona +1 dado ao maior tipo',
  }

  out.push({ opt: addDie, w: 2.4 })
  out.push({ opt: addCount, w: 0.68 })

  for (const sp of SPECIALS) {
    out.push({
      w: 1.02,
      opt: {
        type: 'add_special',
        icon: sp.icon,
        label: sp.label,
        desc: sp.desc,
        special: sp.id,
      },
    })
  }

  const hasAnySpecial = collection.some((d) => d.special.length > 0)
  if (hasAnySpecial) {
    for (const sp of SPECIALS) {
      if (!canApplyReplaceSpecial(collection, sp.id)) continue
      out.push({
        w: 1.05,
        opt: {
          type: 'replace_special',
          icon: sp.icon,
          label: `Regravar: ${sp.label}`,
          desc: `Uma única marca já inscrita em algum catalisador passa a ser ${sp.label}; as outras marcas do mesmo dado permanecem.`,
          special: sp.id,
        },
      })
    }
  }

  return out.filter((x) => !upgradesEquivalent(x.opt, fixed))
}

function pickTwoWeightedUpgrades(
  collection: DieInstance[],
  fixed: UpgradeOption,
): UpgradeOption[] {
  const working = [...buildWeightedRandomPool(collection, fixed)]
  const picked: UpgradeOption[] = []

  for (let k = 0; k < 2 && working.length > 0; k++) {
    const total = working.reduce((s, x) => s + x.w, 0)
    if (total <= 0) break
    let r = Math.random() * total
    let chosenIdx = 0
    for (let i = 0; i < working.length; i++) {
      r -= working[i].w
      if (r <= 0) {
        chosenIdx = i
        break
      }
    }
    const chosen = working[chosenIdx]
    picked.push(chosen.opt)
    working.splice(chosenIdx, 1)
    for (let i = working.length - 1; i >= 0; i--) {
      if (upgradesEquivalent(working[i].opt, chosen.opt)) working.splice(i, 1)
    }
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

  const picked = pickTwoWeightedUpgrades(collection, fixed)
  const hasSpecialCard = picked.some((u) => u.type === 'add_special')
  if (!hasSpecialCard) {
    const sp = SPECIALS[Math.floor(Math.random() * SPECIALS.length)]
    picked[1] = {
      type: 'add_special',
      icon: sp.icon,
      label: sp.label,
      desc: sp.desc,
      special: sp.id,
    }
  }
  return [fixed, ...picked]
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
    const d0 = next.dice[0]
    d0.special = [...d0.special, u.special]
  }
}

interface GameState {
  screen: Screen
  /** Índice 0..CAMPAIGN_PHASE_COUNT-1 da trilha atual. */
  campaignPhase: number
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
  /** Acúmulos de veneno no inimigo (1 PV no início de cada rodada por acúmulo). */
  enemyPoisonStacks: number
  /** Acúmulos de veneno no jogador. */
  playerPoisonStacks: number
  /** Dano que você causou ao inimigo na última rodada (UI). */
  enemyDamagePopup: RoundDamagePopup | null
  /** Dano que o inimigo causou em você na última rodada (UI). */
  playerDamagePopup: RoundDamagePopup | null
  playerHealPopup: RoundHealPopup | null
  enemyHealPopup: RoundHealPopup | null
  pendingUpgrades: UpgradeOption[]
  enemyUpgradePreview: string
  lastBattleWon: boolean
  endVictory: boolean
  lastBattleLog: LogEntry[]
  runStats: RunStats
  startCampaign: () => void
  goToStart: () => void
  beginNextCampaignPhase: () => void
  startBattle: () => void
  toggleSpeed: () => void
  toggleBattlePause: () => void
  applyUpgrade: (idx: number) => void
  runBattleAsync: (signal: AbortSignal) => Promise<void>
  processOneTurn: (signal: AbortSignal) => Promise<'continue' | 'end' | 'aborted'>
  endBattle: () => void
  showUpgradeAfterBattle: (won: boolean) => void
  showPhaseBridge: () => void
  showEndScreen: (victory: boolean) => void
}

export const useGameStore = create<GameState>((set, get) => ({
  screen: 'start',
  campaignPhase: 0,
  collection: startingCollectionForPhase(0),
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
  enemyPoisonStacks: 0,
  playerPoisonStacks: 0,
  enemyDamagePopup: null,
  playerDamagePopup: null,
  playerHealPopup: null,
  enemyHealPopup: null,
  pendingUpgrades: [],
  enemyUpgradePreview: '',
  lastBattleWon: false,
  endVictory: false,
  lastBattleLog: [],
  runStats: emptyRunStats(),
  goToStart: () => {
    battleAbortController?.abort()
    battleAbortController = null
    set({
      screen: 'start',
      battleRunning: false,
      battlePaused: false,
      runStats: emptyRunStats(),
      campaignPhase: 0,
      collection: startingCollectionForPhase(0),
    })
  },

  startCampaign: () => {
    battleAbortController?.abort()
    battleAbortController = null
    set({
      collection: startingCollectionForPhase(0),
      lives: 3,
      battleIndex: 0,
      campaignPhase: 0,
      enemies: createRunEnemies(0),
      playerHpMax: PLAYER_BASE_HP,
      playerHp: PLAYER_BASE_HP,
      lastBattleLog: [],
      runStats: emptyRunStats(),
      screen: 'battle',
    })
    get().startBattle()
  },

  beginNextCampaignPhase: () => {
    const s = get()
    if (s.campaignPhase >= CAMPAIGN_PHASE_COUNT - 1) return
    battleAbortController?.abort()
    battleAbortController = null
    const next = s.campaignPhase + 1
    set({
      campaignPhase: next,
      collection: startingCollectionForPhase(next),
      battleIndex: 0,
      enemies: createRunEnemies(next),
      screen: 'battle',
      pendingUpgrades: [],
      lastBattleWon: false,
      enemyUpgradePreview: '',
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
      enemyPoisonStacks: 0,
      playerPoisonStacks: 0,
      enemyDamagePopup: null,
      playerDamagePopup: null,
      playerHealPopup: null,
      enemyHealPopup: null,
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

    const poisonTickToEnemy = cur.enemyPoisonStacks
    const poisonTickToPlayer = cur.playerPoisonStacks
    enemyHp -= poisonTickToEnemy
    playerHp -= poisonTickToPlayer

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

    const poisonGainOnEnemy = poisonStacksGainedFromRolls(pRolls)
    const poisonGainOnPlayer = poisonStacksGainedFromRolls(eRolls)

    const { base: dmgBaseToEnemy, bonus: dmgBonusToEnemy } = splitDamageFromRolls(pRolls)
    const { base: dmgBaseFromEnemy, bonus: dmgBonusFromEnemy } = splitDamageFromRolls(eRolls)
    const popupSeq = cur.battleSessionId * 100000 + nextRound * 10
    const playerHealTotal = rollHealP + plHealSpec
    const enemyHealTotal = rollHealE + enHealSpec

    const logKind =
      eTotal > pTotal ? 'damage-player' : 'damage-enemy'

    const regenLine =
      rollHealP > 0 || rollHealE > 0
        ? `💧 +${rollHealP} HP (dados) · inimigo +${rollHealE} HP`
        : null

    const poisonLine =
      poisonTickToEnemy > 0 || poisonTickToPlayer > 0
        ? `☠️ Veneno: inimigo −${poisonTickToEnemy} PV · você −${poisonTickToPlayer} PV`
        : null

    set((s) => ({
      isRolling: false,
      playerHp,
      enemyHp,
      enemyPoisonStacks: s.enemyPoisonStacks + poisonGainOnEnemy,
      playerPoisonStacks: s.playerPoisonStacks + poisonGainOnPlayer,
      enemyDamagePopup:
        pTotal > 0 || poisonTickToEnemy > 0
          ? {
              base: dmgBaseToEnemy,
              bonus: dmgBonusToEnemy,
              ...(poisonTickToEnemy > 0 ? { poison: poisonTickToEnemy } : {}),
              seq: popupSeq + 1,
            }
          : null,
      playerDamagePopup:
        eTotal > 0 || poisonTickToPlayer > 0
          ? {
              base: dmgBaseFromEnemy,
              bonus: dmgBonusFromEnemy,
              ...(poisonTickToPlayer > 0 ? { poison: poisonTickToPlayer } : {}),
              seq: popupSeq + 2,
            }
          : null,
      playerHealPopup:
        playerHealTotal > 0
          ? {
              fromDice: rollHealP,
              fromSpecials: plHealSpec,
              seq: popupSeq + 3,
            }
          : null,
      enemyHealPopup:
        enemyHealTotal > 0
          ? {
              fromDice: rollHealE,
              fromSpecials: enHealSpec,
              seq: popupSeq + 4,
            }
          : null,
      battleLog: [
        {
          id: logId(),
          text: `Rodada ${nextRound}: Você causou ${pTotal} dano · Inimigo causou ${eTotal} dano`,
          kind: logKind,
        },
        ...(poisonLine
          ? [{ id: logId(), text: poisonLine, kind: 'info' as const }]
          : []),
        ...(regenLine
          ? [{ id: logId(), text: regenLine, kind: 'info' as const }]
          : []),
        ...s.battleLog,
      ],
      runStats: {
        ...s.runStats,
        damageDealt: s.runStats.damageDealt + pTotal + poisonTickToEnemy,
        damageTaken: s.runStats.damageTaken + eTotal + poisonTickToPlayer,
        combatRounds: s.runStats.combatRounds + 1,
        playerDiceRolled: s.runStats.playerDiceRolled + pRolls.length,
        enemyDiceRolled: s.runStats.enemyDiceRolled + eRolls.length,
        healFromSpecials: s.runStats.healFromSpecials + plHealSpec,
        enemyHealFromSpecials: s.runStats.enemyHealFromSpecials + enHealSpec,
        healFromDiceRegen: s.runStats.healFromDiceRegen + rollHealP,
        enemyHealFromDiceRegen: s.runStats.enemyHealFromDiceRegen + rollHealE,
      },
    }))

    if (eTotal > 0 || poisonTickToPlayer > 0) sfxPlayerDamaged()
    if (pTotal > 0 || poisonTickToEnemy > 0) sfxEnemyDamaged()

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
      if (state.campaignPhase < CAMPAIGN_PHASE_COUNT - 1) {
        get().showPhaseBridge()
      } else {
        get().showEndScreen(true)
      }
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
    const won = state.lastBattleWon
    const newPlayerMax = won ? state.playerHpMax + PLAYER_HP_GROWTH_PER_BATTLE : state.playerHpMax
    const nextBattleIndex = won
      ? Math.min(state.battleIndex + 1, TOTAL_BATTLES - 1)
      : state.battleIndex

    if (u.type === 'upgrade_die') {
      const last = col[col.length - 1]
      const dIdx = DICE_TYPES.indexOf(last.sides as (typeof DICE_TYPES)[number])
      last.sides = DICE_TYPES[dIdx + 1]
    } else if (u.type === 'add_die') {
      col.push({ sides: 4, count: 1, special: [] })
    } else if (u.type === 'add_count') {
      col[col.length - 1].count++
    } else if (u.type === 'add_special' && u.special) {
      const i = pickDieIndexForNewSpecial(col)
      col[i].special = [...col[i].special, u.special]
    } else if (u.type === 'replace_special' && u.special) {
      const target = col.find((d) => d.special.some((s) => s !== u.special))
      if (target) {
        const j = target.special.findIndex((s) => s !== u.special)
        if (j >= 0) {
          target.special = [
            ...target.special.slice(0, j),
            u.special,
            ...target.special.slice(j + 1),
          ]
        }
      }
    }

    set({
      collection: col,
      battleIndex: nextBattleIndex,
      playerHpMax: newPlayerMax,
      playerHp: won ? newPlayerMax : Math.min(state.playerHp, newPlayerMax),
      screen: 'battle',
      pendingUpgrades: [],
    })
    get().startBattle()
  },

  showPhaseBridge: () => {
    set({
      screen: 'phase_bridge',
      battleRunning: false,
      battlePaused: false,
    })
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

export { getSpecialById, startingCollectionForPhase }
