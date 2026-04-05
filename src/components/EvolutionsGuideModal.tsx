import { useEffect, useId, useRef } from 'react'
import {
  DICE_TYPES,
  PLAYER_BASE_HP,
  PLAYER_HP_GROWTH_PER_BATTLE,
  SPECIALS,
  TOTAL_BATTLES,
} from '../game/constants'

type Props = {
  open: boolean
  onClose: () => void
}

export function EvolutionsGuideModal({ open, onClose }: Props) {
  const titleId = useId()
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    closeRef.current?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const diceChain = DICE_TYPES.join(' → ')

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 id={titleId} className="modal-title">
            Grimório: evoluções possíveis
          </h2>
          <button
            ref={closeRef}
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label="Fechar"
          >
            ×
          </button>
        </div>
        <div className="modal-body">
          <p className="modal-lead">
            Depois de cada câmara você recebe <strong>3 opções</strong> e escolhe uma. A{' '}
            <strong>primeira carta</strong> é sempre a mesma lógica de progressão; as{' '}
            <strong>outras duas</strong> são sorteadas de um conjunto de melhorias a cada tela.
          </p>

          <section className="modal-section">
            <h3>Seus dados (catalisadores)</h3>
            <ul className="modal-list">
              <li>
                <strong>1ª opção (fixa)</strong>: enquanto seu melhor dado não for d
                {DICE_TYPES[DICE_TYPES.length - 1]}: <strong>evoluir faces</strong> (sobe um passo na
                cadeia <code>{diceChain}</code>). Já no dado máximo: <strong>+1 dado</strong> ao maior tipo.
              </li>
              <li>
                <strong>2ª e 3ª opções (aleatórias)</strong>: a cada tela podem ser, por exemplo:{' '}
                <strong>novo 1d4</strong>, <strong>+1 ao maior tipo</strong> (se não for igual à fixa), e/ou
                um <strong>efeito especial</strong> aleatório da lista abaixo (só se ainda houver dado sem
                especial).
              </li>
            </ul>
          </section>

          <section className="modal-section">
            <h3>Efeitos especiais (dados)</h3>
            <p className="modal-muted">
              Cada dado leva no máximo um especial. Os inimigos também podem receber estes efeitos pelo
              “eco na masmorra”.
            </p>
            <ul className="modal-special-grid">
              {SPECIALS.map((s) => (
                <li key={s.id} className="modal-special-card">
                  <span className="modal-special-icon" aria-hidden>
                    {s.icon}
                  </span>
                  <div>
                    <strong>{s.label}</strong>
                    <span className="modal-special-desc">{s.desc}</span>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="modal-section">
            <h3>Progressão do alquimista</h3>
            <ul className="modal-list">
              <li>
                Ao avançar para a próxima câmara (depois de escolher o upgrade):{' '}
                <strong>+{PLAYER_HP_GROWTH_PER_BATTLE} PV máximos</strong> e vida cheia (base:{' '}
                {PLAYER_BASE_HP}).
              </li>
              <li>
                Objetivo da run: vencer <strong>{TOTAL_BATTLES} câmaras</strong> sem perder todas as
                vidas.
              </li>
            </ul>
          </section>

          <section className="modal-section">
            <h3>Eco na masmorra (inimigo)</h3>
            <p className="modal-muted">
              Automático após cada confronto: o próximo guardião fica mais perigoso.
            </p>
            <ul className="modal-list">
              <li>
                <strong>Dado maior</strong>: próximo inimigo sobe um passo em faces (mesma cadeia d4→
                …→d20), quando ainda for possível.
              </li>
              <li>
                <strong>+8 de vida</strong>: o PV máximo do próximo adversário aumenta.
              </li>
              <li>
                <strong>Especial em um dado</strong>: um dos efeitos da lista acima é aplicado ao dado do
                inimigo (inclui curas e efeitos que o fortalecem).
              </li>
            </ul>
          </section>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn-primary" onClick={onClose}>
            Entendi
          </button>
        </div>
      </div>
    </div>
  )
}
