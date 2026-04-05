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
  isEnemyEliteChamber,
  mergePhaseStarterWithCarriedDie,
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
import {
  recordAfterBattle,
  recordCampaignComplete,
  recordPlayerRollSession,
  recordUpgradeChosen,
} from '../game/persistentStats'
import type { BuildSnapshot } from '../game/runSubmission'

const PLAYER_NAME_KEY = 'elemental-rift-player-name'

function loadPlayerName(): string {
  try {
    return localStorage.getItem(PLAYER_NAME_KEY) || 'Alquimista'
  } catch {
    return 'Alquimista'
  }
}

function savePlayerName(name: string) {
  try {
    localStorage.setItem(PLAYER_NAME_KEY, name)
  } catch {
    /* quota */
  }
}

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
  if (a.type === 'add_special') return a.special === b.special
  return true
}

function pickEnemyDieIndexForSpecial(dice: DieInstance[]): number {
  if (dice.length === 0) return 0
  let minLen = Infinity
  for (const d of dice) minLen = Math.min(minLen, d.special.length)
  for (let i = dice.length - 1; i >= 0; i--) {
    if (dice[i].special.length === minLen) return i
  }
  return dice.length - 1
}

function enemyAnyDieCanUpgrade(enemy: EnemyTemplate): boolean {
  return enemy.dice.some((d) => {
    const di = DICE_TYPES.indexOf(d.sides as (typeof DICE_TYPES)[number])
    return di >= 0 && di < DICE_TYPES.length - 1
  })
}

function randomEnemySpecialUpgrade(): UpgradeOption {
  const sp = SPECIALS[Math.floor(Math.random() * SPECIALS.length)]
  return {
    type: 'add_special',
    icon: sp.icon,
    label: sp.label,
    desc: sp.desc,
    special: sp.id,
  }
}

function enemyUpgradeDieOption(enemy: EnemyTemplate, elite: boolean): UpgradeOption {
  const d0 = enemy.dice.find((d) => {
    const di = DICE_TYPES.indexOf(d.sides as (typeof DICE_TYPES)[number])
    return di >= 0 && di < DICE_TYPES.length - 1
  })
  if (!d0) return randomEnemySpecialUpgrade()
  const dIdx = DICE_TYPES.indexOf(d0.sides as (typeof DICE_TYPES)[number])
  const nextS = DICE_TYPES[dIdx + 1]!
  return {
    type: 'upgrade_die',
    icon: '🎲',
    label: 'Dado maior',
    desc: elite
      ? `🎲 Próximo guardião: cada dado elegível sobe um tier de faces (ex.: até 1d${nextS} no dado principal).`
      : `🎲 Próximo guardião: 1 dado de ${nextS} faces (1d${nextS}).`,
  }
}

type WeightedUpgrade = { opt: UpgradeOption; w: number }

/**
 * Candidatos aos slots 2 e 3 com pesos. Especiais só somam (add_special); sem regravar marcas antigas.
 */
function buildWeightedRandomPool(fixed: UpgradeOption): WeightedUpgrade[] {
  const out: WeightedUpgrade[] = []

  const addDie: UpgradeOption = {
    type: 'add_die',
    icon: '🎲',
    label: 'Novo dado de 4 faces',
    desc: '🎲 +1 dado de 4 faces na mesa (notação 1d4: um dado, quatro faces, sorteia 1–4).',
  }
  const addCount: UpgradeOption = {
    type: 'add_count',
    icon: '➕',
    label: 'Mais uma rolagem (cada dado)',
    desc: '🎲 +1 cópia em cada catalisador da mesa: cada um rola mais uma vez por rodada.',
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

  return out.filter((x) => !upgradesEquivalent(x.opt, fixed))
}

function pickTwoWeightedUpgrades(fixed: UpgradeOption): UpgradeOption[] {
  const working = [...buildWeightedRandomPool(fixed)]
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
    label: 'Novo dado de 4 faces',
    desc: '🎲 +1 dado de 4 faces na mesa (notação 1d4).',
  }
  while (picked.length < 2) {
    picked.push({ ...safeFallback })
  }
  return picked
}

/** Câmaras vencidas na campanha inteira, 1-based (1..TOTAL_CAMPAIGN_CHAMBERS). */
function globalChamberNumber(campaignPhase: number, battleIndexJustWon: number): number {
  return campaignPhase * TOTAL_BATTLES + (battleIndexJustWon + 1)
}

/** +1 d4 automático a cada 5 câmaras vencidas (5.ª, 10.ª, …). */
function maybeGrantMilestoneD4(
  collection: DieInstance[],
  won: boolean,
  campaignPhase: number,
  battleIndex: number,
) {
  if (!won) return
  if (globalChamberNumber(campaignPhase, battleIndex) % 5 !== 0) return
  collection.push({ sides: 4, count: 1, special: [] })
}

function collectionHasDieBelowMaxSides(collection: DieInstance[]): boolean {
  for (const d of collection) {
    const di = DICE_TYPES.indexOf(d.sides as (typeof DICE_TYPES)[number])
    if (di >= 0 && di < DICE_TYPES.length - 1) return true
  }
  return false
}

function generateUpgrades(collection: DieInstance[]): UpgradeOption[] {
  const anyBelowMax = collectionHasDieBelowMaxSides(collection)

  const fixed: UpgradeOption = anyBelowMax
    ? {
        type: 'upgrade_die',
        icon: '🎲',
        label: 'Evoluir faces (todos os dados)',
        desc: `🎲 Cada catalisador que ainda não for o dado de ${DICE_TYPES[DICE_TYPES.length - 1]} faces sobe um passo na cadeia (${DICE_TYPES.join(' → ')}).`,
      }
    : {
        type: 'add_count',
        icon: '➕',
        label: 'Mais uma rolagem (todos)',
        desc: '🎲 +1 cópia em cada catalisador na mesa (mais uma rolagem por dado por rodada).',
      }

  const picked = pickTwoWeightedUpgrades(fixed)
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

function generateEnemyUpgrade(enemy: EnemyTemplate, nextChamberIndex: number): UpgradeOption {
  const elite = isEnemyEliteChamber(nextChamberIndex)

  if (elite && enemy.dice.length < 3 && Math.random() < 0.27) {
    return {
      type: 'enemy_add_die',
      icon: '🎲',
      label: 'Mesa do guardião',
      desc: '🎲 O próximo inimigo recebe +1 dado na mesa (eco profundo da Fenda).',
    }
  }

  const roll = Math.random()
  if (elite) {
    if (roll < 0.42) return randomEnemySpecialUpgrade()
    if (roll < 0.7) {
      if (enemyAnyDieCanUpgrade(enemy)) return enemyUpgradeDieOption(enemy, true)
      return randomEnemySpecialUpgrade()
    }
    return {
      type: 'add_hp',
      icon: '❤️',
      label: '+8 de vida',
      desc: 'Próximo inimigo tem mais HP',
    }
  }

  if (roll < 0.4 && enemyAnyDieCanUpgrade(enemy)) {
    return enemyUpgradeDieOption(enemy, false)
  }
  if (roll < 0.7) {
    return {
      type: 'add_hp',
      icon: '❤️',
      label: '+8 de vida',
      desc: 'Próximo inimigo tem mais HP',
    }
  }
  return randomEnemySpecialUpgrade()
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
    for (const d of next.dice) {
      const dIdx = DICE_TYPES.indexOf(d.sides as (typeof DICE_TYPES)[number])
      if (dIdx >= 0 && dIdx < DICE_TYPES.length - 1) d.sides = DICE_TYPES[dIdx + 1]!
    }
  } else if (u.type === 'add_hp') {
    next.hp += 8
  } else if (u.type === 'add_special' && u.special) {
    const i = pickEnemyDieIndexForSpecial(next.dice)
    const d = next.dice[i]
    if (d) d.special = [...d.special, u.special]
  } else if (u.type === 'enemy_add_die') {
    const primary = next.dice[0]
    if (!primary) return
    const t = DICE_TYPES.indexOf(primary.sides as (typeof DICE_TYPES)[number])
    const side = t > 0 ? DICE_TYPES[t - 1]! : primary.sides
    next.dice.push({ sides: side, count: 1, special: [] })
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
  /** Acumulados só desta batalha (conquistas / stats persistentes). */
  sessionDamageToEnemy: number
  sessionDamageToPlayer: number
  sessionPlayerOneStreak: number
  sessionMaxRoundDamage: number
  sessionPoisonStacksGained: number
  playerName: string
  setPlayerName: (name: string) => void
  startCampaign: () => void
  startCampaignFromBuild: (snapshot: BuildSnapshot) => void
  goToStart: () => void
  beginNextCampaignPhase: (carryDiceIndex: number) => void
  startBattle: () => void
  toggleSpeed: () => void
  toggleBattlePause: () => void
  applyUpgrade: (idx: number) => void
  runBattleAsync: (signal: AbortSignal) => Promise<void>
  processOneTurn: (signal: AbortSignal) => Promise<'continue' | 'end' | 'aborted'>
  endBattle: () => void
  continueFromPostBattle: () => void
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
  sessionDamageToEnemy: 0,
  sessionDamageToPlayer: 0,
  sessionPlayerOneStreak: 0,
  sessionMaxRoundDamage: 0,
  sessionPoisonStacksGained: 0,
  playerName: loadPlayerName(),
  setPlayerName: (name) => {
    savePlayerName(name)
    set({ playerName: name })
  },
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

  startCampaignFromBuild: (snapshot: BuildSnapshot) => {
    battleAbortController?.abort()
    battleAbortController = null
    const col = JSON.parse(JSON.stringify(snapshot.collection)) as DieInstance[]
    set({
      collection: col,
      lives: 3,
      battleIndex: 0,
      campaignPhase: 0,
      enemies: createRunEnemies(0),
      playerHpMax: snapshot.playerHpMax,
      playerHp: snapshot.playerHpMax,
      lastBattleLog: [],
      runStats: emptyRunStats(),
      screen: 'battle',
    })
    get().startBattle()
  },

  beginNextCampaignPhase: (carryDiceIndex: number) => {
    const s = get()
    if (s.campaignPhase >= CAMPAIGN_PHASE_COUNT - 1) return
    battleAbortController?.abort()
    battleAbortController = null
    const next = s.campaignPhase + 1
    const idx = Number.isFinite(carryDiceIndex) ? Math.floor(carryDiceIndex) : 0
    const collection = mergePhaseStarterWithCarriedDie(next, s.collection, idx)
    set({
      campaignPhase: next,
      collection,
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
      sessionDamageToEnemy: 0,
      sessionDamageToPlayer: 0,
      sessionPlayerOneStreak: 0,
      sessionMaxRoundDamage: 0,
      sessionPoisonStacksGained: 0,
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

    const rollMeta = recordPlayerRollSession(
      pRolls.map((r) => ({ val: r.val, sides: r.sides })),
      cur.sessionPlayerOneStreak,
    )
    const roundDmgToEnemy = pTotal + poisonTickToEnemy
    const roundDmgToPlayer = eTotal + poisonTickToPlayer

    const {
      base: dmgBaseToEnemy,
      bonusCrit: dmgCritToEnemy,
      bonusSpecial: dmgSpecToEnemy,
    } = splitDamageFromRolls(pRolls)
    const {
      base: dmgBaseFromEnemy,
      bonusCrit: dmgCritFromEnemy,
      bonusSpecial: dmgSpecFromEnemy,
    } = splitDamageFromRolls(eRolls)
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
      sessionPlayerOneStreak: rollMeta.nextStreak,
      sessionDamageToEnemy: s.sessionDamageToEnemy + roundDmgToEnemy,
      sessionDamageToPlayer: s.sessionDamageToPlayer + roundDmgToPlayer,
      sessionMaxRoundDamage: Math.max(s.sessionMaxRoundDamage, roundDmgToEnemy),
      sessionPoisonStacksGained: s.sessionPoisonStacksGained + poisonGainOnEnemy,
      enemyPoisonStacks: s.enemyPoisonStacks + poisonGainOnEnemy,
      playerPoisonStacks: s.playerPoisonStacks + poisonGainOnPlayer,
      enemyDamagePopup:
        pTotal > 0 || poisonTickToEnemy > 0
          ? {
              base: dmgBaseToEnemy,
              bonusCrit: dmgCritToEnemy,
              bonusSpecial: dmgSpecToEnemy,
              ...(poisonTickToEnemy > 0 ? { poison: poisonTickToEnemy } : {}),
              seq: popupSeq + 1,
            }
          : null,
      playerDamagePopup:
        eTotal > 0 || poisonTickToPlayer > 0
          ? {
              base: dmgBaseFromEnemy,
              bonusCrit: dmgCritFromEnemy,
              bonusSpecial: dmgSpecFromEnemy,
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
    const playerHpEnd = state.playerHp
    recordAfterBattle({
      won,
      sessionDamageToEnemy: state.sessionDamageToEnemy,
      sessionDamageToPlayer: state.sessionDamageToPlayer,
      playerHpEnd,
      chamberNumber: state.battleIndex + 1,
      sessionMaxRoundDamage: state.sessionMaxRoundDamage,
      sessionPoisonStacksGained: state.sessionPoisonStacksGained,
    })
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

    if (won) sfxPhaseWon()
    else sfxPhaseLost()

    set((s) => ({
      lives,
      playerHp,
      battleRunning: false,
      battlePaused: false,
      lastBattleLog,
      runStats: mergeEndStats(s.runStats),
      lastBattleWon: won,
      screen: 'post_battle',
    }))
  },

  continueFromPostBattle: () => {
    const s = get()
    const won = s.lastBattleWon
    const isLast = s.battleIndex === TOTAL_BATTLES - 1
    if (isLast && won) {
      const col = JSON.parse(JSON.stringify(s.collection)) as DieInstance[]
      maybeGrantMilestoneD4(col, true, s.campaignPhase, s.battleIndex)
      set({ collection: col })
      if (s.campaignPhase < CAMPAIGN_PHASE_COUNT - 1) {
        get().showPhaseBridge()
      } else {
        get().showEndScreen(true)
      }
      return
    }
    get().showUpgradeAfterBattle(won)
  },

  showUpgradeAfterBattle: (won) => {
    const state = get()
    const collection = JSON.parse(JSON.stringify(state.collection)) as DieInstance[]
    maybeGrantMilestoneD4(collection, won, state.campaignPhase, state.battleIndex)
    const upgrades = generateUpgrades(collection)
    const nextIdx = state.battleIndex + 1
    const enemies = JSON.parse(JSON.stringify(state.enemies)) as EnemyTemplate[]

    let enemyUpgradePreview: string
    if (nextIdx < enemies.length) {
      let u = generateEnemyUpgrade(enemies[nextIdx]!, nextIdx)
      applyEnemyUpgradeToNext(enemies, state.battleIndex, u)
      enemyUpgradePreview = `${u.icon} ${u.label}: ${u.desc}`
      if (isEnemyEliteChamber(nextIdx)) {
        u = generateEnemyUpgrade(enemies[nextIdx]!, nextIdx)
        applyEnemyUpgradeToNext(enemies, state.battleIndex, u)
        enemyUpgradePreview += ` · ${u.icon} ${u.label}: ${u.desc}`
      }
    } else {
      enemyUpgradePreview = 'Fim deste trecho: não há próximo guardião.'
    }

    set({
      screen: 'upgrade',
      lastBattleWon: won,
      collection,
      pendingUpgrades: upgrades,
      enemyUpgradePreview,
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
      for (const d of col) {
        const dIdx = DICE_TYPES.indexOf(d.sides as (typeof DICE_TYPES)[number])
        if (dIdx >= 0 && dIdx < DICE_TYPES.length - 1) d.sides = DICE_TYPES[dIdx + 1]!
      }
    } else if (u.type === 'add_die') {
      col.push({ sides: 4, count: 1, special: [] })
    } else if (u.type === 'add_count') {
      for (const d of col) d.count++
    } else if (u.type === 'add_special' && u.special) {
      for (const d of col) {
        d.special = [...d.special, u.special]
      }
    }

    recordUpgradeChosen()

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
    if (victory) recordCampaignComplete()
    set({
      screen: 'end',
      endVictory: victory,
      battleRunning: false,
      battlePaused: false,
    })
  },
}))

export { getSpecialById, startingCollectionForPhase }
