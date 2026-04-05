import type { DieInstance, RollResult, SpecialId } from './types'

function pushMsg(current: string | null, add: string): string | null {
  if (!add) return current
  return current ? `${current} · ${add}` : add
}

function countSpecial(specials: SpecialId[], id: SpecialId): number {
  let n = 0
  for (const s of specials) {
    if (s === id) n++
  }
  return n
}

function rollUniform(sides: number): number {
  return Math.floor(Math.random() * sides) + 1
}

/**
 * Face gêmea: remove as k faces mais baixas (1..k) e adiciona (k+1) cópias do máximo.
 * k=1: faces 2..sides-1 uma vez cada + sides duas vezes (equivalente a tirar o 1 e duplicar o máximo).
 */
export function rollTwinnedAccumulated(sides: number, k: number): number {
  if (sides < 2 || k <= 0) return rollUniform(sides)
  const kk = Math.min(k, sides - 1)
  const pool: number[] = []
  for (let v = kk + 1; v < sides; v++) pool.push(v)
  for (let i = 0; i < kk + 1; i++) pool.push(sides)
  return pool[Math.floor(Math.random() * pool.length)]
}

export type RollDieOptions = {
  /** 0 = primeira rodada da câmara atual. */
  currentBattleRound?: number
}

export function rollDie(
  sides: number,
  specials: SpecialId[],
  options?: RollDieOptions,
): Omit<RollResult, 'sides' | 'special'> {
  const round = options?.currentBattleRound ?? 0
  const openingRound = round === 0
  const forcedOpen = specials.includes('opening_crit') && openingRound

  let val: number
  if (forcedOpen) {
    val = sides
  } else {
    const tw = countSpecial(specials, 'twinned_max')
    if (tw > 0) val = rollTwinnedAccumulated(sides, tw)
    else val = rollUniform(sides)
  }

  let rerollsLeft = countSpecial(specials, 'reroll')
  let didReroll = false
  while (rerollsLeft > 0 && val === 1 && !forcedOpen) {
    const tw = countSpecial(specials, 'twinned_max')
    if (tw > 0) val = rollTwinnedAccumulated(sides, tw)
    else val = rollUniform(sides)
    didReroll = true
    rerollsLeft--
  }

  let bonus = 0
  let isCrit = false
  let msg: string | null = null
  let healAmount = 0

  if (didReroll) {
    msg = pushMsg(msg, 're-rolou 1')
  }

  const nSteady = countSpecial(specials, 'steady')
  if (nSteady > 0) {
    bonus += nSteady
  }

  const nDoubleMax = countSpecial(specials, 'double_max')
  if (nDoubleMax > 0 && val === sides) {
    bonus += sides * nDoubleMax
    isCrit = true
    msg = pushMsg(
      msg,
      nDoubleMax > 1
        ? `dobro ×${nDoubleMax}! (+${sides * nDoubleMax})`
        : `dobro! (${val}×2=${val * 2})`,
    )
  }

  const nExplode = countSpecial(specials, 'explode')
  if (nExplode > 0 && val === sides) {
    bonus += 3 * nExplode
    isCrit = true
    msg = pushMsg(msg, nExplode > 1 ? `explosão ×${nExplode}! +${3 * nExplode}` : 'explosão! +3')
  }

  const nGlass = countSpecial(specials, 'glass')
  if (nGlass > 0 && val === sides) {
    bonus += 5 * nGlass
    isCrit = true
    msg = pushMsg(msg, nGlass > 1 ? `vidro ×${nGlass}! +${5 * nGlass}` : 'vidro! +5')
  }

  const nHeal = countSpecial(specials, 'heal')
  if (nHeal > 0 && val === 1) {
    healAmount += 2 * nHeal
    msg = pushMsg(msg, nHeal > 1 ? `cura +${2 * nHeal} HP` : 'cura +2 HP')
  }

  const nFonte = countSpecial(specials, 'fonte_vital')
  if (nFonte > 0 && val === 1) {
    healAmount += 4 * nFonte
    msg = pushMsg(msg, nFonte > 1 ? `fonte +${4 * nFonte} HP` : 'fonte +4 HP')
  }

  const nBalsamo = countSpecial(specials, 'wound_salve')
  if (nBalsamo > 0 && val === 1) {
    healAmount += 3 * nBalsamo
    msg = pushMsg(msg, nBalsamo > 1 ? `bálsamo +${3 * nBalsamo} HP` : 'bálsamo +3 HP')
  }

  const nDesperate = countSpecial(specials, 'desperate')
  if (nDesperate > 0 && val === 1) {
    bonus += 3 * nDesperate
    msg = pushMsg(msg, nDesperate > 1 ? `desespero +${3 * nDesperate}` : 'desespero +3')
  }

  const nTempest = countSpecial(specials, 'tempest')
  if (nTempest > 0 && (val === 1 || val === sides)) {
    bonus += 2 * nTempest
    msg = pushMsg(msg, nTempest > 1 ? `tempestade +${2 * nTempest}` : 'tempestade +2')
  }

  const nBrink = countSpecial(specials, 'brink')
  if (nBrink > 0 && sides > 2 && (val === 2 || val === sides - 1)) {
    bonus += 2 * nBrink
    msg = pushMsg(msg, nBrink > 1 ? `limiar +${2 * nBrink}` : 'limiar +2')
  }

  const pulseGate = Math.ceil((2 * sides) / 3)
  const nPulse = countSpecial(specials, 'pulse')
  if (nPulse > 0 && val >= pulseGate) {
    bonus += 2 * nPulse
    msg = pushMsg(msg, nPulse > 1 ? `pulso +${2 * nPulse}` : 'pulso +2')
  }

  const halfOrMore = val >= Math.ceil(sides / 2)
  const nHighHalf = countSpecial(specials, 'high_half')
  if (nHighHalf > 0 && halfOrMore) {
    bonus += 2 * nHighHalf
    msg = pushMsg(msg, nHighHalf > 1 ? `valor alto +${2 * nHighHalf}` : 'valor alto +2')
  }

  const nEven = countSpecial(specials, 'even_strike')
  if (nEven > 0 && val % 2 === 0) {
    bonus += nEven
    msg = pushMsg(msg, nEven > 1 ? `par +${nEven}` : 'par +1')
  }

  const nOdd = countSpecial(specials, 'odd_strike')
  if (nOdd > 0 && val % 2 === 1) {
    bonus += nOdd
    msg = pushMsg(msg, nOdd > 1 ? `ímpar +${nOdd}` : 'ímpar +1')
  }

  const nPoison = countSpecial(specials, 'poison')
  if (nPoison > 0 && val === 6) {
    msg = pushMsg(
      msg,
      nPoison > 1 ? `veneno ×${nPoison}! (acúmulo na fenda)` : 'veneno! (acúmulo na fenda)',
    )
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
      results.push({ ...r, sides: d.sides, special: [...d.special] })
    }
  }
  return results
}

export function totalRoll(rolls: RollResult[]) {
  return rolls.reduce((s, r) => s + r.total, 0)
}

/** Soma das faces (valor base) vs bônus de efeitos especiais por rolagem. */
export function splitDamageFromRolls(rolls: RollResult[]): {
  base: number
  bonus: number
} {
  let base = 0
  let bonus = 0
  for (const r of rolls) {
    base += r.val
    bonus += r.bonus
  }
  return { base, bonus }
}

export function sumHealFromRolls(rolls: RollResult[]) {
  return rolls.reduce((s, r) => s + r.healAmount, 0)
}

/** Cada face 6 em dado com Veneno adiciona um acúmulo (1 de dano por rodada ao alvo envenenado). */
export function poisonStacksGainedFromRolls(rolls: RollResult[]): number {
  let n = 0
  for (const r of rolls) {
    if (r.val !== 6) continue
    for (const s of r.special) {
      if (s === 'poison') n++
    }
  }
  return n
}
