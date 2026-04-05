import type { DieInstance, RollResult, SpecialId } from './types'

function pushMsg(current: string | null, add: string): string | null {
  if (!add) return current
  return current ? `${current} · ${add}` : add
}

/**
 * Distribuição em que o valor máximo aparece duas vezes (ex.: d4 → faces 1,2,3,4,4).
 * Probabilidade do máximo = 2/(sides+1).
 */
export function rollFaceWithDuplicatedMax(sides: number): number {
  if (sides < 1) return 1
  const idx = Math.floor(Math.random() * (sides + 1))
  if (idx < sides - 1) return idx + 1
  return sides
}

function rollUniform(sides: number): number {
  return Math.floor(Math.random() * sides) + 1
}

export type RollDieOptions = {
  /** 0 = primeira rodada da câmara atual. */
  currentBattleRound?: number
}

export function rollDie(
  sides: number,
  special: SpecialId | null,
  options?: RollDieOptions,
): Omit<RollResult, 'sides' | 'special'> {
  const round = options?.currentBattleRound ?? 0
  const openingRound = round === 0

  const openingFromSpecial = special === 'opening_crit' && openingRound

  let val: number
  let forcedOpen = false

  if (openingFromSpecial) {
    val = sides
    forcedOpen = true
  } else if (special === 'twinned_max') {
    val = rollFaceWithDuplicatedMax(sides)
  } else {
    val = rollUniform(sides)
  }

  let bonus = 0
  let isCrit = false
  let msg: string | null = null
  let healAmount = 0

  if (special === 'reroll' && val === 1 && !forcedOpen) {
    val = rollUniform(sides)
    msg = pushMsg(msg, 're-rolou 1')
  }

  if (special === 'double_max' && val === sides) {
    bonus += sides
    isCrit = true
    msg = pushMsg(msg, `dobro! (${val}×2=${val * 2})`)
  }

  if (special === 'explode' && val === sides) {
    bonus += 3
    isCrit = true
    msg = pushMsg(msg, 'explosão! +3')
  }

  if (special === 'glass' && val === sides) {
    bonus += 5
    isCrit = true
    msg = pushMsg(msg, 'vidro! +5')
  }

  if (special === 'heal' && val === 1) {
    healAmount += 2
    msg = pushMsg(msg, 'cura +2 HP')
  }

  if (special === 'fonte_vital' && val === 1) {
    healAmount += 4
    msg = pushMsg(msg, 'fonte +4 HP')
  }

  if (special === 'wound_salve' && val === 1) {
    healAmount += 3
    msg = pushMsg(msg, 'bálsamo +3 HP')
  }

  if (special === 'desperate' && val === 1) {
    bonus += 3
    msg = pushMsg(msg, 'desespero +3')
  }

  if (special === 'tempest' && (val === 1 || val === sides)) {
    bonus += 2
    msg = pushMsg(msg, 'tempestade +2')
  }

  if (
    special === 'brink' &&
    sides > 2 &&
    (val === 2 || val === sides - 1)
  ) {
    bonus += 2
    msg = pushMsg(msg, 'limiar +2')
  }

  const pulseGate = Math.ceil((2 * sides) / 3)
  if (special === 'pulse' && val >= pulseGate) {
    bonus += 2
    msg = pushMsg(msg, 'pulso +2')
  }

  const halfOrMore = val >= Math.ceil(sides / 2)
  if (special === 'high_half' && halfOrMore) {
    bonus += 2
    msg = pushMsg(msg, 'valor alto +2')
  }

  if (special === 'even_strike' && val % 2 === 0) {
    bonus += 1
    msg = pushMsg(msg, 'par +1')
  }

  if (special === 'odd_strike' && val % 2 === 1) {
    bonus += 1
    msg = pushMsg(msg, 'ímpar +1')
  }

  if (special === 'steady') {
    bonus += 1
  }

  if (forcedOpen) {
    isCrit = true
    msg = pushMsg(msg, 'abertura crítica!')
  }

  return {
    val,
    bonus,
    total: val + bonus,
    isCrit,
    isHeal: healAmount > 0,
    healAmount,
    msg,
  }
}

export type RollAllDiceOptions = {
  /** Rodada atual da câmara (0 = primeira). */
  currentBattleRound?: number
}

export function rollAllDice(diceArr: DieInstance[], options?: RollAllDiceOptions): RollResult[] {
  const br = options?.currentBattleRound ?? 0
  const results: RollResult[] = []
  for (const d of diceArr) {
    for (let i = 0; i < d.count; i++) {
      const r = rollDie(d.sides, d.special, { currentBattleRound: br })
      results.push({ ...r, sides: d.sides, special: d.special })
    }
  }
  return results
}

export function totalRoll(rolls: RollResult[]) {
  return rolls.reduce((s, r) => s + r.total, 0)
}

export function sumHealFromRolls(rolls: RollResult[]) {
  return rolls.reduce((s, r) => s + r.healAmount, 0)
}
