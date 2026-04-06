export type SpecialId =
  | 'double_max'
  | 'explode'
  | 'heal'
  | 'reroll'
  | 'steady'
  | 'high_half'
  | 'even_strike'
  | 'odd_strike'
  | 'desperate'
  | 'glass'
  | 'fonte_vital'
  | 'wound_salve'
  | 'tempest'
  | 'brink'
  | 'pulse'
  | 'opening_crit'
  | 'twinned_max'
  | 'poison'

export interface DieInstance {
  sides: number
  count: number
  /** Efeitos especiais acumulados neste dado (ordem não importa na rolagem). */
  special: SpecialId[]
}

export interface RollResult {
  val: number
  bonus: number
  /** Dano extra de efeitos que exigem face máxima (dobro, explosão, vidro). */
  bonusCrit: number
  /** Dano extra dos demais efeitos dos dados na rolagem. */
  bonusSpecial: number
  total: number
  isCrit: boolean
  isHeal: boolean
  /** PV recuperados por efeitos de especial nesta face (após rolagem final). */
  healAmount: number
  msg: string | null
  sides: number
  /** Cópia dos especiais do dado que gerou esta rolagem. */
  special: SpecialId[]
}

export interface EnemyTemplate {
  name: string
  hp: number
  dice: DieInstance[]
}

/** Feedback visual de dano numa rodada (faces vs bônus de efeitos vs veneno). */
export type RoundDamagePopup = {
  base: number
  bonusCrit: number
  bonusSpecial: number
  /** Dano de veneno aplicado no início desta rodada (1 por acúmulo). */
  poison?: number
  seq: number
}

/** Cura na rodada: 1 PV por dado rolado vs cura de efeitos especiais. */
export type RoundHealPopup = {
  fromDice: number
  fromSpecials: number
  seq: number
}

export type Screen =
  | 'start'
  | 'battle'
  | 'post_battle'
  | 'upgrade'
  | 'phase_bridge'
  | 'end'

export interface SpecialDef {
  id: SpecialId
  label: string
  desc: string
  icon: string
}

export type UpgradeOptionType =
  | 'upgrade_die'
  | 'add_die'
  | 'add_count'
  | 'add_special'
  | 'add_hp'
  /** Só no eco da masmorra: +1 dado ao próximo guardião. */
  | 'enemy_add_die'

export interface UpgradeOption {
  type: UpgradeOptionType
  icon: string
  label: string
  desc: string
  special?: SpecialId
}

export type LogKind = '' | 'damage-player' | 'damage-enemy' | 'special-msg' | 'info'

export interface LogEntry {
  id: string
  text: string
  kind: LogKind
}

export interface RunStats {
  damageDealt: number
  damageTaken: number
  combatRounds: number
  playerDiceRolled: number
  enemyDiceRolled: number
  healFromSpecials: number
  healFromDiceRegen: number
  enemyHealFromSpecials: number
  enemyHealFromDiceRegen: number
  battlesWon: number
  livesLost: number
  deepestFloor: number
}

export function emptyRunStats(): RunStats {
  return {
    damageDealt: 0,
    damageTaken: 0,
    combatRounds: 0,
    playerDiceRolled: 0,
    enemyDiceRolled: 0,
    healFromSpecials: 0,
    healFromDiceRegen: 0,
    enemyHealFromSpecials: 0,
    enemyHealFromDiceRegen: 0,
    battlesWon: 0,
    livesLost: 0,
    deepestFloor: 0,
  }
}
