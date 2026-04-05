import { useState, type ReactNode } from 'react'
import { useGameStore } from './store/gameStore'
import { useMenuMusic } from './hooks/useMenuMusic'
import { EvolutionsGuideModal } from './components/EvolutionsGuideModal'
import { PlayerAvatar } from './components/PlayerAvatar'
import {
  CAMPAIGN_PHASES,
  CAMPAIGN_PHASE_COUNT,
  DICE_TYPES,
  PLAYER_BASE_HP,
  PLAYER_HP_GROWTH_PER_BATTLE,
  TOTAL_BATTLES,
  TOTAL_CAMPAIGN_CHAMBERS,
  getCampaignPhaseTheme,
  getSpecialById,
} from './game/constants'
import { totalRoll } from './game/dice'
import type {
  DieInstance,
  LogEntry,
  RoundDamagePopup,
  RoundHealPopup,
  RunStats,
} from './game/types'

/** Posição pseudoaleatória estável por rodada/chave (evita “pilha” vertical). */
function scatterOffset(seq: number, chipKey: string): { x: number; y: number } {
  let h = seq | 0
  for (let i = 0; i < chipKey.length; i++) {
    h = Math.imul(h, 31) + chipKey.charCodeAt(i)
  }
  const r1 = ((h >>> 0) % 1001) / 1000
  h = Math.imul(h, 1664525) + 1013904223
  const r2 = ((h >>> 0) % 1001) / 1000
  return {
    x: Math.round(-46 + r1 * 92),
    y: Math.round(0 + r2 * 22),
  }
}

function ScatteredPopupAnchor({
  seq,
  chipKey,
  children,
}: {
  seq: number
  chipKey: string
  children: ReactNode
}) {
  const { x, y } = scatterOffset(seq, chipKey)
  return (
    <div
      className="hp-popup-float-anchor"
      style={{
        transform: `translateX(calc(-50% + ${x}px))`,
        bottom: y,
      }}
    >
      {children}
    </div>
  )
}

function CollectionGrid({ dice }: { dice: DieInstance[] }) {
  return (
    <div className="collection-grid">
      {dice.map((d, i) => {
        const hasSp = d.special.length > 0
        return (
          <div
            key={`${d.sides}-${d.count}-${i}`}
            className={`collection-die${hasSp ? ' has-special' : ''}`}
          >
            {d.count}d{d.sides}
            {hasSp ? (
              <>
                <br />
                <span className="collection-die-icons" aria-hidden>
                  {d.special.map((id, si) => {
                    const sp = getSpecialById(id)
                    return sp ? <span key={`${i}-${si}-${id}`}>{sp.icon}</span> : null
                  })}
                </span>
                <span style={{ fontSize: 10, display: 'block', marginTop: 4 }}>
                  {d.special
                    .map((id) => getSpecialById(id)?.label)
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

function DiceTags({
  dice,
  specialTooltips = false,
}: {
  dice: DieInstance[]
  /** Na batalha: passar o mouse no ícone mostra a descrição do efeito. */
  specialTooltips?: boolean
}) {
  return (
    <div className="dice-tags">
      {dice.map((d, i) => (
        <span key={i} className="dice-tag">
          {d.count}d{d.sides}
          {d.special.map((id, si) => {
            const sp = getSpecialById(id)
            if (!sp) return null
            if (specialTooltips) {
              return (
                <span
                  key={`${i}-${si}-${id}`}
                  className="battle-special-tip"
                  tabIndex={0}
                  data-tip={sp.desc}
                  aria-label={`${sp.label}: ${sp.desc}`}
                >
                  {' '}
                  {sp.icon}
                </span>
              )
            }
            return (
              <span key={`${i}-${si}-${id}`}>
                {' '}
                {sp.icon}
              </span>
            )
          })}
        </span>
      ))}
    </div>
  )
}

function RoundDamagePopups({
  popup,
  variant,
}: {
  popup: RoundDamagePopup | null
  /** dealt = dano que você causa; taken = dano que você recebe */
  variant: 'dealt' | 'taken'
}) {
  if (!popup) return null
  const showBase = popup.base > 0
  const showBonus = popup.bonus > 0
  const showPoison = (popup.poison ?? 0) > 0
  if (!showBase && !showBonus && !showPoison) return null
  const baseCls =
    variant === 'dealt' ? 'damage-popup--base' : 'damage-popup--base-taken'
  const bonusCls =
    variant === 'dealt' ? 'damage-popup--bonus' : 'damage-popup--bonus-taken'
  let delayIdx = 0
  const nextDelay = () => ({ animationDelay: `${(delayIdx++ * 0.07).toFixed(2)}s` })
  return (
    <div className="hp-popup-scatter" key={popup.seq} aria-live="polite">
      {showBase ? (
        <ScatteredPopupAnchor seq={popup.seq} chipKey={`dmg-base-${variant}`}>
          <span
            className={`damage-popup ${baseCls} hp-popup-chip-motion`}
            style={nextDelay()}
            title={
              variant === 'dealt'
                ? 'Dano direto das faces que saíram na mesa, antes de catalisadores e veneno'
                : 'Dano bruto das faces do inimigo, antes dos reforços elementais'
            }
          >
            <span className="damage-popup-kind">
              {variant === 'dealt' ? 'Impacto bruto' : 'Golpes crus'}
            </span>
            <span className="damage-popup-num">−{popup.base}</span>
          </span>
        </ScatteredPopupAnchor>
      ) : null}
      {showBonus ? (
        <ScatteredPopupAnchor seq={popup.seq} chipKey={`dmg-bonus-${variant}`}>
          <span
            className={`damage-popup ${bonusCls} hp-popup-chip-motion`}
            style={nextDelay()}
            title={
              variant === 'dealt'
                ? 'Dano extra vindo dos seus efeitos especiais nesta rolagem'
                : 'Dano extra dos efeitos especiais do inimigo nesta rolagem'
            }
          >
            <span className="damage-popup-kind">
              {variant === 'dealt' ? 'Catalisadores' : 'Pressão elemental'}
            </span>
            <span className="damage-popup-num">−{popup.bonus}</span>
          </span>
        </ScatteredPopupAnchor>
      ) : null}
      {showPoison ? (
        <ScatteredPopupAnchor seq={popup.seq} chipKey={`dmg-poison-${variant}`}>
          <span
            className="damage-popup damage-popup--poison hp-popup-chip-motion"
            style={nextDelay()}
            title={
              variant === 'dealt'
                ? 'Dano do veneno da fenda no inimigo (1 PV por acúmulo, no começo da rodada)'
                : 'Dano do veneno da fenda em você (1 PV por acúmulo, no começo da rodada)'
            }
          >
            <span className="damage-popup-kind">Névoa tóxica</span>
            <span className="damage-popup-num">−{popup.poison}</span>
          </span>
        </ScatteredPopupAnchor>
      ) : null}
    </div>
  )
}

function RoundHealPopups({
  popup,
  who,
}: {
  popup: RoundHealPopup | null
  who: 'player' | 'enemy'
}) {
  if (!popup) return null
  const showDice = popup.fromDice > 0
  const showSpec = popup.fromSpecials > 0
  if (!showDice && !showSpec) return null
  const diceTitle =
    who === 'player'
      ? 'Vitalidade que volta ao rolar cada dado seu (1 PV por dado nesta rodada)'
      : 'Vitalidade que o inimigo recupera por dado rolado (1 PV por dado)'
  const specTitle =
    who === 'player'
      ? 'Cura vinda dos seus efeitos especiais nesta mesma rolagem'
      : 'Cura vinda dos efeitos especiais do inimigo nesta rolagem'
  let delayIdx = 0
  const nextDelay = () => ({ animationDelay: `${(delayIdx++ * 0.07).toFixed(2)}s` })
  return (
    <div className="hp-popup-scatter" key={popup.seq} aria-live="polite">
      {showDice ? (
        <ScatteredPopupAnchor seq={popup.seq} chipKey={`heal-dice-${who}`}>
          <span
            className="damage-popup heal-popup heal-popup--dice hp-popup-chip-motion"
            style={nextDelay()}
            title={diceTitle}
          >
            <span className="damage-popup-kind">Fluxo dos dados</span>
            <span className="damage-popup-num">+{popup.fromDice}</span>
          </span>
        </ScatteredPopupAnchor>
      ) : null}
      {showSpec ? (
        <ScatteredPopupAnchor seq={popup.seq} chipKey={`heal-spec-${who}`}>
          <span
            className="damage-popup heal-popup heal-popup--special hp-popup-chip-motion"
            style={nextDelay()}
            title={specTitle}
          >
            <span className="damage-popup-kind">Essência restaurada</span>
            <span className="damage-popup-num">+{popup.fromSpecials}</span>
          </span>
        </ScatteredPopupAnchor>
      ) : null}
    </div>
  )
}

function BattleLogHistory({ entries, title }: { entries: LogEntry[]; title: string }) {
  if (entries.length === 0) return null
  return (
    <div className="card">
      <h3 style={{ marginBottom: 8, fontSize: 14, color: 'var(--color-text-primary)' }}>{title}</h3>
      <div className="log-box log-history">
        {entries.map((e) => (
          <div key={e.id} className={`log-entry ${e.kind}`.trim()}>
            {e.text}
          </div>
        ))}
      </div>
    </div>
  )
}

function RunStatsSummary({ stats }: { stats: RunStats }) {
  const curaTotalJogador = stats.healFromSpecials + stats.healFromDiceRegen
  const curaTotalInimigo = stats.enemyHealFromSpecials + stats.enemyHealFromDiceRegen

  return (
    <div className="card">
      <h3 style={{ marginBottom: 4 }}>Estatísticas da run</h3>
      <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 4 }}>
        Resumo de todo o percurso na trilha ({CAMPAIGN_PHASE_COUNT} fases, {TOTAL_CAMPAIGN_CHAMBERS}{' '}
        câmaras se você completar tudo).
      </p>
      <dl className="run-stats-dl">
        <dt>Dano total causado</dt>
        <dd>{stats.damageDealt}</dd>
        <dt>Dano total recebido</dt>
        <dd>{stats.damageTaken}</dd>
        <dt>Rodadas de combate</dt>
        <dd>{stats.combatRounds}</dd>
        <dt>Dados que você rolou</dt>
        <dd>{stats.playerDiceRolled}</dd>
        <dt>Dados do inimigo</dt>
        <dd>{stats.enemyDiceRolled}</dd>
        <dt>Cura seus (especiais)</dt>
        <dd>{stats.healFromSpecials}</dd>
        <dt>Cura seus (1 PV por dado)</dt>
        <dd>{stats.healFromDiceRegen}</dd>
        <dt>Cura total (você)</dt>
        <dd>{curaTotalJogador}</dd>
        <dt>Cura total (inimigo)</dt>
        <dd>{curaTotalInimigo}</dd>
        <dt>Batalhas vencidas</dt>
        <dd>{stats.battlesWon}</dd>
        <dt>Derrotas (vidas perdidas)</dt>
        <dd>{stats.livesLost}</dd>
        <dt>Maior profundidade (na fase em que parou)</dt>
        <dd>
          Câmara {stats.deepestFloor} / {TOTAL_BATTLES}
        </dd>
      </dl>
    </div>
  )
}

function CampaignTrailMap({
  doneThrough,
  pulsePhase,
}: {
  /** Índices de fase já concluídos: 0..doneThrough */
  doneThrough: number
  /** Fase destacada (próxima ou atual) */
  pulsePhase: number
}) {
  return (
    <div className="campaign-map" aria-label="Trilha em três fases">
      {CAMPAIGN_PHASES.map((phase, i) => {
        const done = i <= doneThrough
        const pulse = i === pulsePhase
        const startDie = DICE_TYPES[Math.min(i, DICE_TYPES.length - 1)]
        return (
          <div key={phase.label} className="campaign-map__segment">
            {i > 0 ? <div className="campaign-map__edge" aria-hidden /> : null}
            <div
              className={[
                'campaign-map__node',
                done ? 'campaign-map__node--done' : '',
                pulse ? 'campaign-map__node--pulse' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {done ? (
                <span className="campaign-map__check" aria-hidden>
                  ✓
                </span>
              ) : null}
              <span className="campaign-map__icon" aria-hidden>
                {phase.icon}
              </span>
              <span className="campaign-map__phase">Fase {i + 1}</span>
              <span className="campaign-map__name">{phase.label}</span>
              <span className="campaign-map__meta">
                Início 1d{startDie}
                <br />
                Inimigos mais fortes a cada fase
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function DieFace({
  value,
  isCrit,
  isRolling,
}: {
  value: number
  isCrit: boolean
  isRolling: boolean
}) {
  const cls = ['die', isRolling ? 'rolling' : '', isCrit && !isRolling ? 'crit' : '']
    .filter(Boolean)
    .join(' ')
  return <div className={cls}>{value}</div>
}

function StartScreen() {
  const collection = useGameStore((s) => s.collection)
  const startCampaign = useGameStore((s) => s.startCampaign)
  const [guideOpen, setGuideOpen] = useState(false)

  return (
    <div className="app-screen active">
      <EvolutionsGuideModal open={guideOpen} onClose={() => setGuideOpen(false)} />
      <div className="card" style={{ textAlign: 'center', padding: '2rem 1.5rem' }}>
        <h1 className="start-screen-logo-heading">
          <img
            src="/elemental-rift-logo.png"
            alt="Elemental Rift"
            className="start-screen-logo"
            width={280}
            height={280}
            decoding="async"
          />
        </h1>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
          <PlayerAvatar battlesWon={0} featured />
        </div>
        <p style={{ marginBottom: '1rem' }}>
          Você é um alquimista que desce à <strong>Fenda Elemental</strong>: uma dungeon onde reações
          perigosas tomam forma. A trilha tem <strong>{CAMPAIGN_PHASE_COUNT} fases</strong> de{' '}
          <strong>{TOTAL_BATTLES} câmaras</strong> cada. Entre uma fase e outra seus aprimoramentos de
          dados zeram, mas você mantém <strong>PV máximo, PV atual e vidas</strong>; a cada fase você
          recomeça com um <strong>dado inicial um tier acima</strong> (1d4 → 1d6 → 1d8) e inimigos mais
          duros.
        </p>
        <CampaignTrailMap doneThrough={-1} pulsePhase={0} />
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 10,
            justifyContent: 'center',
            marginBottom: '1rem',
          }}
        >
          <button
            type="button"
            className="btn-primary"
            onClick={startCampaign}
            style={{ padding: '10px 32px', fontSize: 15 }}
          >
            Iniciar trilha
          </button>
          <button
            type="button"
            onClick={() => setGuideOpen(true)}
            style={{ padding: '10px 20px', fontSize: 14 }}
          >
            📖 Ver evoluções possíveis
          </button>
        </div>
      </div>
      <div className="card">
        <h3 style={{ marginBottom: 8 }}>Seus catalisadores (dados)</h3>
        <CollectionGrid dice={collection} />
      </div>
      <div className="card">
        <h3 style={{ marginBottom: 6 }}>Como funciona</h3>
        <p>
          Os duelos se resolvem sozinhos, rodada a rodada. Em cada fase você desce {TOTAL_BATTLES}{' '}
          câmaras; ao limpar a décima, a trilha avança (sem escolher upgrade na fronteira: catalisadores
          resetam para o dado inicial da próxima fase). Você pode gravar <strong>efeitos especiais</strong>{' '}
          nos dados. Cada dado rolado devolve 1 PV a quem o lançou (até o máximo). Ao{' '}
          <strong>vencer</strong> uma câmara e escolher upgrade, seu limite sobe{' '}
          <strong>+{PLAYER_HP_GROWTH_PER_BATTLE} PV máximos</strong> (início: {PLAYER_BASE_HP}). Você tem 3
          vidas para toda a campanha.
        </p>
      </div>
    </div>
  )
}

function BattleScreen() {
  const campaignPhase = useGameStore((s) => s.campaignPhase)
  const battleIndex = useGameStore((s) => s.battleIndex)
  const enemies = useGameStore((s) => s.enemies)
  const lives = useGameStore((s) => s.lives)
  const playerHp = useGameStore((s) => s.playerHp)
  const playerHpMax = useGameStore((s) => s.playerHpMax)
  const enemyHp = useGameStore((s) => s.enemyHp)
  const enemyHpMax = useGameStore((s) => s.enemyHpMax)
  const collection = useGameStore((s) => s.collection)
  const battleLog = useGameStore((s) => s.battleLog)
  const playerRolls = useGameStore((s) => s.playerRolls)
  const enemyRolls = useGameStore((s) => s.enemyRolls)
  const isRolling = useGameStore((s) => s.isRolling)
  const battleRunning = useGameStore((s) => s.battleRunning)
  const battlePaused = useGameStore((s) => s.battlePaused)
  const speed = useGameStore((s) => s.speed)
  const toggleSpeed = useGameStore((s) => s.toggleSpeed)
  const toggleBattlePause = useGameStore((s) => s.toggleBattlePause)
  const runStats = useGameStore((s) => s.runStats)
  const enemyDamagePopup = useGameStore((s) => s.enemyDamagePopup)
  const playerDamagePopup = useGameStore((s) => s.playerDamagePopup)
  const playerHealPopup = useGameStore((s) => s.playerHealPopup)
  const enemyHealPopup = useGameStore((s) => s.enemyHealPopup)

  const enemy = enemies[battleIndex]
  const pPct = Math.max(0, (playerHp / playerHpMax) * 100)
  const ePct = Math.max(0, (enemyHp / enemyHpMax) * 100)
  const phaseTheme = getCampaignPhaseTheme(campaignPhase)

  return (
    <div className={`app-screen active campaign-phase-bg ${phaseTheme.bgClass}`}>
      <div className="card" style={{ padding: '0.75rem 1.25rem' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <PlayerAvatar battlesWon={runStats.battlesWon} />
            <div>
            <span
              style={{
                fontSize: 13,
                fontWeight: 500,
                color: 'var(--color-text-primary)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                flexWrap: 'wrap',
              }}
            >
              <span style={{ fontSize: 22, lineHeight: 1 }} aria-hidden>
                {phaseTheme.icon}
              </span>
              <span>
                Fase {campaignPhase + 1} de {CAMPAIGN_PHASE_COUNT} · Câmara {battleIndex + 1} de{' '}
                {TOTAL_BATTLES}
              </span>
            </span>
            <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
              {phaseTheme.label}
            </span>
            {battlePaused && battleRunning ? (
              <span
                className="pause-badge"
                style={{
                  display: 'inline-block',
                  marginTop: 6,
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: '0.04em',
                  color: '#854f0b',
                  background: 'var(--color-background-warning)',
                  padding: '2px 8px',
                  borderRadius: 4,
                }}
              >
                PAUSADO
              </span>
            ) : null}
            </div>
          </div>
          <div className="hearts">
            {[1, 2, 3].map((i) => (
              <span key={i} className="heart">
                {i <= lives ? '❤️' : '🖤'}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="fighter-row">
        <div className="fighter fighter--player">
          <div className="name">Alquimista</div>
          <div className="player-hp-block">
            <div className="hp-bar-stack">
              <div className="hp-popup-stack">
                <RoundDamagePopups popup={playerDamagePopup} variant="taken" />
                <RoundHealPopups popup={playerHealPopup} who="player" />
              </div>
              <div className="hp-bar-wrap">
                <div className="hp-bar player" style={{ width: `${pPct}%` }} />
              </div>
            </div>
            <div className="hp-text">
              {Math.max(0, playerHp)} / {playerHpMax}
            </div>
          </div>
          <div className="dice-display">
            {playerRolls.map((r, i) => (
              <DieFace
                key={i}
                value={r.val}
                isCrit={r.isCrit}
                isRolling={isRolling}
              />
            ))}
          </div>
          <DiceTags dice={collection} specialTooltips />
          <div className="total-sub">
            {playerRolls.length > 0 ? `Total: ${totalRoll(playerRolls)}` : ''}
          </div>
        </div>
        <div className="vs-label">VS</div>
        <div className="fighter fighter--enemy">
          <div className="name">{enemy?.name ?? '…'}</div>
          <div className="enemy-hp-block">
            <div className="hp-bar-stack">
              <div className="hp-popup-stack">
                <RoundDamagePopups popup={enemyDamagePopup} variant="dealt" />
                <RoundHealPopups popup={enemyHealPopup} who="enemy" />
              </div>
              <div className="hp-bar-wrap">
                <div className="hp-bar enemy" style={{ width: `${ePct}%` }} />
              </div>
            </div>
            <div className="hp-text">
              {Math.max(0, enemyHp)} / {enemyHpMax}
            </div>
          </div>
          <div className="dice-display">
            {enemyRolls.map((r, i) => (
              <DieFace
                key={i}
                value={r.val}
                isCrit={r.isCrit}
                isRolling={isRolling}
              />
            ))}
          </div>
          <DiceTags dice={enemy?.dice ?? []} specialTooltips />
          <div className="total-sub">
            {enemyRolls.length > 0 ? `Total: ${totalRoll(enemyRolls)}` : ''}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="log-box">
          {battleLog.map((e) => (
            <div key={e.id} className={`log-entry ${e.kind}`.trim()}>
              {e.text}
            </div>
          ))}
        </div>
      </div>

      <div style={{ textAlign: 'center' }}>
        <button
          type="button"
          onClick={toggleBattlePause}
          disabled={!battleRunning}
          style={{ marginRight: 8 }}
        >
          {battlePaused ? '▶ Continuar' : '⏸ Pausar'}
        </button>
        <button type="button" onClick={toggleSpeed}>
          {speed === 1 ? '⚡ Acelerar' : '🐢 Normal'}
        </button>
      </div>
    </div>
  )
}

function UpgradeScreen() {
  const campaignPhase = useGameStore((s) => s.campaignPhase)
  const lastBattleWon = useGameStore((s) => s.lastBattleWon)
  const lives = useGameStore((s) => s.lives)
  const pendingUpgrades = useGameStore((s) => s.pendingUpgrades)
  const enemyUpgradePreview = useGameStore((s) => s.enemyUpgradePreview)
  const applyUpgrade = useGameStore((s) => s.applyUpgrade)
  const lastBattleLog = useGameStore((s) => s.lastBattleLog)
  const runStats = useGameStore((s) => s.runStats)
  const phaseTheme = getCampaignPhaseTheme(campaignPhase)

  return (
    <div className={`app-screen active campaign-phase-bg ${phaseTheme.bgClass}`}>
      <div className="card" style={{ textAlign: 'center' }}>
        <PlayerAvatar battlesWon={runStats.battlesWon} emphasize={lastBattleWon} />
        <div className="result-icon" aria-hidden>
          {lastBattleWon ? '📜' : '💀'}
        </div>
        <p
          style={{
            fontSize: 12,
            color: 'var(--color-text-tertiary)',
            marginTop: 4,
            marginBottom: 0,
          }}
        >
          <span aria-hidden>{phaseTheme.icon}</span> {phaseTheme.label} · estudo na Fenda
        </p>
        <h2 style={{ marginTop: 8 }}>
          {lastBattleWon ? 'Experimento dominado' : 'Reação fora de controle'}
        </h2>
        <p>
          {lastBattleWon
            ? 'Anote um novo traço no grimório: escolha um aprimoramento para seus catalisadores.'
            : `${lives} tentativa(s) restante(s). A Fenda não perdoa; adapte sua mesa mesmo assim.`}
        </p>
      </div>

      <BattleLogHistory entries={lastBattleLog} title="Histórico da última câmara" />

      <div className="card">
        <h3 style={{ marginBottom: 4, fontSize: 13, color: 'var(--color-text-secondary)' }}>
          Estudo: escolha um aprimoramento
        </h3>
        <div className="upgrade-grid" style={{ marginTop: 10 }}>
          {pendingUpgrades.map((u, i) => (
            <button
              type="button"
              key={i}
              className="upgrade-card"
              onClick={() => applyUpgrade(i)}
            >
              <div className="icon">{u.icon}</div>
              <div className="title">{u.label}</div>
              <div className="desc">{u.desc}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="card" style={{ opacity: 0.85 }}>
        <h3 style={{ marginBottom: 4, fontSize: 13, color: 'var(--color-text-secondary)' }}>
          Eco na masmorra (o próximo guardião evolui)
        </h3>
        <div className="enemy-evolve-note">{enemyUpgradePreview}</div>
      </div>
    </div>
  )
}

function PhaseBridgeScreen() {
  const campaignPhase = useGameStore((s) => s.campaignPhase)
  const beginNextCampaignPhase = useGameStore((s) => s.beginNextCampaignPhase)
  const playerHp = useGameStore((s) => s.playerHp)
  const playerHpMax = useGameStore((s) => s.playerHpMax)
  const lives = useGameStore((s) => s.lives)
  const runStats = useGameStore((s) => s.runStats)

  const nextPhase = campaignPhase + 1
  const nextDie = DICE_TYPES[Math.min(nextPhase, DICE_TYPES.length - 1)]
  const doneTheme = getCampaignPhaseTheme(campaignPhase)
  const nextTheme = getCampaignPhaseTheme(nextPhase)

  return (
    <div className={`app-screen active campaign-phase-bg ${doneTheme.bgClass}`}>
      <div className="card" style={{ textAlign: 'center', padding: '1.5rem' }}>
        <div style={{ fontSize: 40, marginBottom: 8 }} aria-hidden>
          🗺️
        </div>
        <h2 style={{ marginBottom: 8 }}>Fronteira da Fenda</h2>
        <p style={{ marginBottom: 12, color: 'var(--color-text-secondary)' }}>
          A fase{' '}
          <strong>
            <span aria-hidden>{doneTheme.icon}</span> {doneTheme.label}
          </strong>{' '}
          foi selada ({TOTAL_BATTLES} câmaras). Seus
          catalisadores perdem as marcas deste trecho: na próxima etapa você começa só com{' '}
          <strong>1d{nextDie}</strong>. O que permanece é seu corpo adaptado:{' '}
          <strong>
            {playerHp} / {playerHpMax} PV
          </strong>{' '}
          e <strong>{lives}</strong> vida(s).
        </p>
        <CampaignTrailMap doneThrough={campaignPhase} pulsePhase={nextPhase} />
        <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)', marginTop: 12 }}>
          Vitórias na campanha: {runStats.battlesWon} / {TOTAL_CAMPAIGN_CHAMBERS}
        </p>
        <button
          type="button"
          className="btn-primary"
          style={{ marginTop: 16, padding: '10px 28px' }}
          onClick={() => beginNextCampaignPhase()}
        >
          Continuar para {nextTheme.icon} {nextTheme.label}
        </button>
      </div>
    </div>
  )
}

function EndScreen() {
  const endVictory = useGameStore((s) => s.endVictory)
  const collection = useGameStore((s) => s.collection)
  const goToStart = useGameStore((s) => s.goToStart)
  const startCampaign = useGameStore((s) => s.startCampaign)
  const lastBattleLog = useGameStore((s) => s.lastBattleLog)
  const runStats = useGameStore((s) => s.runStats)

  return (
    <div className="app-screen active">
      <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>{endVictory ? '⚗️' : '💀'}</div>
        <h2>
          {endVictory
            ? 'Maestria elementar'
            : 'A Fenda consumiu sua última chance'}
        </h2>
        <p style={{ marginTop: 8 }}>
          {endVictory
            ? `Você atravessou as ${CAMPAIGN_PHASE_COUNT} fases (${TOTAL_CAMPAIGN_CHAMBERS} câmaras) e estabilizou o núcleo da Fenda. Seu grimório está completo, por ora.`
            : 'O conhecimento que buscava escapou entre os dedos. Volte ao laboratório, ou tente outra descida.'}
        </p>
      </div>

      <BattleLogHistory entries={lastBattleLog} title="Histórico da última câmara" />

      <RunStatsSummary stats={runStats} />

      <div className="card">
        <h3 style={{ marginBottom: 8 }}>Catalisadores ao fim da run</h3>
        <CollectionGrid dice={collection} />
      </div>
      <div
        style={{
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          alignItems: 'center',
        }}
      >
        <button
          type="button"
          className="btn-primary"
          onClick={startCampaign}
          style={{ padding: '10px 32px' }}
        >
          Nova trilha
        </button>
        <button type="button" onClick={goToStart} style={{ padding: '8px 24px' }}>
          Laboratório (menu)
        </button>
      </div>
    </div>
  )
}

export default function App() {
  const screen = useGameStore((s) => s.screen)
  useMenuMusic(screen === 'start')

  return (
    <>
      {screen === 'start' ? <StartScreen /> : null}
      {screen === 'battle' ? <BattleScreen /> : null}
      {screen === 'upgrade' ? <UpgradeScreen /> : null}
      {screen === 'phase_bridge' ? <PhaseBridgeScreen /> : null}
      {screen === 'end' ? <EndScreen /> : null}
    </>
  )
}
