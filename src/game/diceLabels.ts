import type { DieInstance } from './types'

/** Notação clássica de mesa, ex.: 1d6, 2d8. */
export function diceNotation(d: DieInstance): string {
  return `${d.count}d${d.sides}`
}

/** Linha principal com emoji de dado — ex.: «🎲 1 dado de 6 faces». */
export function diceFriendlyPrimary(d: DieInstance): string {
  const { count: n, sides: s } = d
  if (n === 1) return `🎲 1 dado de ${s} faces`
  return `🎲 ${n} dados de ${s} faces`
}

/** Explicação curta para tooltip / aria. */
export function diceNotationExplainer(d: DieInstance): string {
  return `Notação de jogo: ${diceNotation(d)}. Cada dado sorteia de 1 a ${d.sides}; os valores somam no dano.`
}

export function diceFriendlyOneDieOf(sides: number): string {
  return `🎲 1 dado de ${sides} faces`
}

export function diceNotationOne(sides: number): string {
  return `1d${sides}`
}

/** Texto para mapa de fases / resumos. */
export function dicePhaseStartLine(sides: number): string {
  return `Início: ${diceFriendlyOneDieOf(sides)} · ${diceNotationOne(sides)}`
}
