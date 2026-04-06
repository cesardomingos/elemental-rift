import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useGameStore } from './store/gameStore'
import { useMenuMusic } from './hooks/useMenuMusic'
import { AchievementsModal } from './components/AchievementsModal'
import { EvolutionsGuideModal } from './components/EvolutionsGuideModal'
import { LeaderboardModal } from './components/LeaderboardModal'
import { AuthModal } from './components/AuthModal'
import { PlayerAvatar } from './components/PlayerAvatar'
import { EnemyAvatar } from './components/EnemyAvatar'
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
  defaultPhaseCarryDiceIndex,
} from './game/constants'
import { totalRoll } from './game/dice'
import {
  diceFriendlyPrimary,
  diceNotation,
  diceNotationExplainer,
  diceFriendlyOneDieOf,
  diceNotationOne,
  dicePhaseStartLine,
} from './game/diceLabels'
import type {
  DieInstance,
  LogEntry,
  RoundDamagePopup,
  RoundHealPopup,
  RunStats,
} from './game/types'
import { computeScore, GAME_VERSION, getArenaRankInfo, type BuildSnapshot } from './game/runSubmission'
import { submitRun, getAuthUser, onAuthChange, signOut, supabase } from './lib/supabase'
import { syncFromCloud } from './game/persistentStats'

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
            <div className="collection-die-primary">{diceFriendlyPrimary(d)}</div>
            <div className="collection-die-notation" aria-hidden>
              {diceNotation(d)} · de 1 a {d.sides}
            </div>
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
        <span key={i} className="dice-tag" title={diceNotationExplainer(d)}>
          <span className="dice-tag__text">
            <span className="dice-tag__main">{diceFriendlyPrimary(d)}</span>
            <span className="dice-tag__abbr" aria-hidden>
              {diceNotation(d)}
            </span>
          </span>
          <span className="dice-tag__icons">
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
                    {sp.icon}
                  </span>
                )
              }
              return (
                <span key={`${i}-${si}-${id}`} className="dice-tag__icon-plain">
                  {sp.icon}
                </span>
              )
            })}
          </span>
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
  const showCrit = popup.bonusCrit > 0
  const showSpecial = popup.bonusSpecial > 0
  const showPoison = (popup.poison ?? 0) > 0
  if (!showBase && !showCrit && !showSpecial && !showPoison) return null
  const baseCls =
    variant === 'dealt' ? 'damage-popup--base' : 'damage-popup--base-taken'
  const critCls =
    variant === 'dealt' ? 'damage-popup--bonus' : 'damage-popup--bonus-taken'
  const specialCls =
    variant === 'dealt' ? 'damage-popup--special' : 'damage-popup--special-taken'
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
                ? 'Dano das faces sorteadas nos dados (ataque básico da rolagem)'
                : 'Dano das faces dos dados do inimigo'
            }
          >
            <span className="damage-popup-kind">Dano</span>
            <span className="damage-popup-num">−{popup.base}</span>
          </span>
        </ScatteredPopupAnchor>
      ) : null}
      {showCrit ? (
        <ScatteredPopupAnchor seq={popup.seq} chipKey={`dmg-crit-${variant}`}>
          <span
            className={`damage-popup ${critCls} hp-popup-chip-motion`}
            style={nextDelay()}
            title={
              variant === 'dealt'
                ? 'Dano extra dos seus dados quando a face máxima dispara o efeito'
                : 'Dano extra do inimigo ao tirar a face máxima'
            }
          >
            <span className="damage-popup-kind">Crítico</span>
            <span className="damage-popup-num">−{popup.bonusCrit}</span>
          </span>
        </ScatteredPopupAnchor>
      ) : null}
      {showSpecial ? (
        <ScatteredPopupAnchor seq={popup.seq} chipKey={`dmg-special-${variant}`}>
          <span
            className={`damage-popup ${specialCls} hp-popup-chip-motion`}
            style={nextDelay()}
            title={
              variant === 'dealt'
                ? 'Dano extra de outros efeitos dos seus dados nesta rolagem'
                : 'Dano extra de outros efeitos do inimigo nesta rolagem'
            }
          >
            <span className="damage-popup-kind">Especial</span>
            <span className="damage-popup-num">−{popup.bonusSpecial}</span>
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
                ? 'Dano do veneno no inimigo (1 PV por acúmulo, no começo da rodada)'
                : 'Dano do veneno em você (1 PV por acúmulo, no começo da rodada)'
            }
          >
            <span className="damage-popup-kind">Veneno</span>
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
      ? 'Cura ao rolar cada um dos seus dados (1 PV por dado nesta rodada)'
      : 'Cura do inimigo ao rolar cada dado (1 PV por dado)'
  const specTitle =
    who === 'player'
      ? 'Cura dos seus dados nesta rolagem'
      : 'Cura dos dados do inimigo nesta rolagem'
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
            <span className="damage-popup-kind">Cura</span>
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
            <span className="damage-popup-kind">Cura</span>
            <span className="damage-popup-num">+{popup.fromSpecials}</span>
          </span>
        </ScatteredPopupAnchor>
      ) : null}
    </div>
  )
}

function BattleLogHistory({
  entries,
  title,
  className,
}: {
  entries: LogEntry[]
  title: string
  className?: string
}) {
  if (entries.length === 0) return null
  return (
    <div className={['card', className].filter(Boolean).join(' ')}>
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
                <span className="campaign-map__dice-line">{dicePhaseStartLine(startDie)}</span>
                <span className="campaign-map__meta-sub">Inimigos mais fortes a cada fase</span>
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

function ArenaRankBadge({ points, className = '' }: { points: number; className?: string }) {
  const info = getArenaRankInfo(points)
  return (
    <span className={`arena-rank-badge arena-rank-badge--${info.rank} ${className}`}>
      {info.icon} {info.label} <span className="arena-rank-badge__pts">{points} AP</span>
    </span>
  )
}

function StartScreen() {
  const collection = useGameStore((s) => s.collection)
  const startCampaign = useGameStore((s) => s.startCampaign)
  const startCampaignFromBuild = useGameStore((s) => s.startCampaignFromBuild)
  const startPvpCampaign = useGameStore((s) => s.startPvpCampaign)
  const authUser = useGameStore((s) => s.authUser)
  const setAuthUser = useGameStore((s) => s.setAuthUser)
  const arenaPoints = useGameStore((s) => s.arenaPoints)
  const [guideOpen, setGuideOpen] = useState(false)
  const [achievementsOpen, setAchievementsOpen] = useState(false)
  const [leaderboardOpen, setLeaderboardOpen] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)
  const [arenaLoading, setArenaLoading] = useState(false)

  const handleLoadBuild = useCallback(
    (snapshot: BuildSnapshot) => startCampaignFromBuild(snapshot),
    [startCampaignFromBuild],
  )

  const handleSignOut = async () => {
    await signOut()
    setAuthUser(null)
  }

  const handleStartArena = async () => {
    setArenaLoading(true)
    try {
      await startPvpCampaign()
    } finally {
      setArenaLoading(false)
    }
  }

  const showAuthCorner = Boolean(authUser || supabase)

  return (
    <div className="app-screen active">
      <AchievementsModal open={achievementsOpen} onClose={() => setAchievementsOpen(false)} />
      <EvolutionsGuideModal open={guideOpen} onClose={() => setGuideOpen(false)} />
      <LeaderboardModal
        open={leaderboardOpen}
        onClose={() => setLeaderboardOpen(false)}
        onLoadBuild={handleLoadBuild}
      />
      <AuthModal
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        onAuth={(user) => setAuthUser(user)}
      />
      <div
        className={[
          'card',
          'start-screen-hero-card',
          showAuthCorner ? 'start-screen-hero-card--auth' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        style={{ textAlign: 'center', padding: '2rem 1.5rem' }}
      >
        <div className="start-screen-hero-top">
          {authUser ? (
            <button type="button" className="btn-start-signout" onClick={handleSignOut}>
              Sair ({authUser.displayName})
            </button>
          ) : supabase ? (
            <button type="button" className="btn-start-signout" onClick={() => setAuthOpen(true)}>
              Entrar / Criar conta
            </button>
          ) : null}
        </div>
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
          <strong>{TOTAL_BATTLES} câmaras</strong> cada. Ao cruzar a fronteira você mantém{' '}
          <strong>PV máximo, PV atual e vidas</strong>, recebe o <strong>🎲 dado inicial maior</strong> da
          próxima fase e escolhe <strong>um dado</strong> da mesa para levar; o restante fica para
          trás (
          {diceFriendlyOneDieOf(4)} → {diceFriendlyOneDieOf(6)} → {diceFriendlyOneDieOf(8)} como base por
          fase) e os inimigos ficam mais duros.
        </p>
        <div className="card dice-onboarding-hint">
          <h3 className="dice-onboarding-hint__title">🎲 O que significa 1d4, 1d6…?</h3>
          <p className="dice-onboarding-hint__p">
            Aqui <strong>dado</strong> é o que você rola para causar dano. O número depois do “d” indica
            quantas faces o dado tem — é o jeito que jogos de mesa costumam escrever.
          </p>
          <ul className="dice-onboarding-hint__list">
            <li>
              <strong>1d4</strong> = 🎲 <strong>um dado de 4 faces</strong> (sorteia 1, 2, 3 ou 4)
            </li>
            <li>
              <strong>2d6</strong> = 🎲 <strong>dois dados de 6 faces</strong>; cada um tira de 1 a 6 e os
              resultados <strong>somam</strong> no dano
            </li>
          </ul>
        </div>
        <CampaignTrailMap doneThrough={-1} pulsePhase={0} />
        <div className="start-screen-actions">
          <div className="start-screen-actions-row start-screen-actions-row--primary">
            <button type="button" className="btn-start-pve" onClick={startCampaign}>
              🧟 Iniciar trilha PVE
            </button>
            <div className="start-screen-arena-col">
              <button
                type="button"
                className="btn-start-arena"
                disabled={arenaLoading}
                onClick={handleStartArena}
              >
                {arenaLoading ? 'Buscando oponentes…' : '⚔️ Arena PvP'}
              </button>
              {authUser ? (
                <div className="start-screen-arena-rank">
                  <ArenaRankBadge points={arenaPoints} />
                </div>
              ) : null}
            </div>
          </div>
          <div className="start-screen-actions-row start-screen-actions-row--secondary">
            <button type="button" className="btn-start-secondary" onClick={() => setGuideOpen(true)}>
              📖 Ver evoluções possíveis
            </button>
            <button
              type="button"
              className="btn-start-secondary"
              onClick={() => setAchievementsOpen(true)}
            >
              🏆 Conquistas
            </button>
            <button type="button" className="btn-start-secondary" onClick={() => setLeaderboardOpen(true)}>
              📊 Ranking
            </button>
          </div>
        </div>
      </div>
      <div className="card">
        <h3 style={{ marginBottom: 8 }}>Seus dados na mesa</h3>
        <CollectionGrid dice={collection} />
      </div>
      <div className="card">
        <h3 style={{ marginBottom: 6 }}>Como funciona</h3>
        <p>
          Os duelos se resolvem sozinhos, rodada a rodada. Em cada fase você desce {TOTAL_BATTLES}{' '}
          câmaras; ao limpar a décima, a trilha avança. Na fronteira você escolhe{' '}
          <strong>1 dado</strong> para manter além do 🎲 dado novo da fase. Você pode gravar{' '}
          <strong>efeitos especiais</strong>{' '}
          nos dados. Cada <strong>dado</strong> que aparece na tela (🎲) devolve 1 PV a quem o lançou (até o
          máximo). Ao{' '}
          <strong>vencer</strong> uma câmara e escolher upgrade, seu limite sobe{' '}
          <strong>+{PLAYER_HP_GROWTH_PER_BATTLE} PV máximos</strong> (início: {PLAYER_BASE_HP}). A cada{' '}
          <strong>5 câmaras vencidas</strong> na campanha (5.ª, 10.ª, 15.ª…) você ganha automaticamente um{' '}
          <strong>1d4</strong> extra na mesa. As cartas do grimório aplicam o efeito a{' '}
          <strong>todos os seus dados</strong> nas cartas de evoluir dados e de especial; a carta de mais
          rolagens adiciona <strong>+1 cópia só em um dos dados mais altos</strong> (mais faces).
          Você tem 3 vidas para toda a campanha.
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
  const isPvpMode = useGameStore((s) => s.isPvpMode)
  const arenaPoints = useGameStore((s) => s.arenaPoints)

  const enemy = enemies[battleIndex]
  const pPct = Math.max(0, (playerHp / playerHpMax) * 100)
  const ePct = Math.max(0, (enemyHp / enemyHpMax) * 100)
  const phaseTheme = getCampaignPhaseTheme(campaignPhase)

  return (
    <div className={`app-screen active campaign-phase-bg ${phaseTheme.bgClass}`}>
      <div className="card battle-hud-card">
        <div className="battle-hud-row">
          <div className="battle-hud-main">
            <PlayerAvatar battlesWon={runStats.battlesWon} className="battle-hud-avatar" />
            <div className="battle-hud-text">
              <span className="battle-hud-title">
                <span className="battle-hud-phase-icon" aria-hidden>
                  {isPvpMode ? '⚔️' : phaseTheme.icon}
                </span>
                <span>
                  {isPvpMode
                    ? `Arena ${phaseTheme.label} · Duelo ${battleIndex + 1}/${TOTAL_BATTLES}`
                    : `Fase ${campaignPhase + 1}/${CAMPAIGN_PHASE_COUNT} · Câmara ${battleIndex + 1}/${TOTAL_BATTLES}`}
                </span>
              </span>
              <span className="battle-hud-sub">
                {isPvpMode ? (
                  <>⚔️ PvP — {phaseTheme.label} · <ArenaRankBadge points={arenaPoints} className="battle-hud-rank" /></>
                ) : phaseTheme.label}
              </span>
              {battlePaused && battleRunning ? (
                <span className="pause-badge battle-hud-pause">PAUSADO</span>
              ) : null}
            </div>
          </div>
          <div className="hearts battle-hud-hearts" aria-label={`Vidas: ${lives} de 3`}>
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
          <div className="fighter-identity fighter-identity--player">
            <PlayerAvatar battlesWon={runStats.battlesWon} className="fighter-panel-avatar" />
            <div className="fighter-identity-text">
              <div className="name">Alquimista</div>
              <span className="fighter-role">Você</span>
            </div>
          </div>
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
        <div className="vs-label" aria-hidden>
          VS
        </div>
        <div className={`fighter fighter--enemy${isPvpMode ? ' fighter--pvp' : ''}`}>
          <div className="fighter-identity fighter-identity--enemy">
            {isPvpMode ? (
              <PlayerAvatar battlesWon={battleIndex} className="fighter-panel-avatar" />
            ) : (
              <EnemyAvatar
                battleIndex={battleIndex}
                enemyName={enemy?.name ?? 'Guardião da Fenda'}
              />
            )}
            <div className="fighter-identity-text">
              <div className="name">{enemy?.name ?? '…'}</div>
              <span className="fighter-role">{isPvpMode ? 'Oponente' : 'Inimigo'}</span>
            </div>
          </div>
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

      <div className="battle-actions">
        <button
          type="button"
          className="battle-action-btn"
          onClick={toggleBattlePause}
          disabled={!battleRunning}
        >
          {battlePaused ? '▶ Continuar' : '⏸ Pausar'}
        </button>
        <button type="button" className="battle-action-btn" onClick={toggleSpeed}>
          {speed === 1 ? '⚡ Acelerar' : '🐢 Normal'}
        </button>
      </div>
    </div>
  )
}

function PostBattleScreen() {
  const campaignPhase = useGameStore((s) => s.campaignPhase)
  const battleIndex = useGameStore((s) => s.battleIndex)
  const enemies = useGameStore((s) => s.enemies)
  const lastBattleWon = useGameStore((s) => s.lastBattleWon)
  const lives = useGameStore((s) => s.lives)
  const runStats = useGameStore((s) => s.runStats)
  const continueFromPostBattle = useGameStore((s) => s.continueFromPostBattle)
  const isPvpMode = useGameStore((s) => s.isPvpMode)

  const enemy = enemies[battleIndex]
  const phaseTheme = getCampaignPhaseTheme(campaignPhase)
  const phaseComplete = lastBattleWon && battleIndex === TOTAL_BATTLES - 1
  const campaignComplete = phaseComplete && campaignPhase === CAMPAIGN_PHASE_COUNT - 1
  const globalChamberWon = campaignPhase * TOTAL_BATTLES + (battleIndex + 1)
  const milestoneD4Pending =
    lastBattleWon && globalChamberWon % 5 === 0

  let nextHint: string
  if (isPvpMode) {
    if (!lastBattleWon) {
      nextHint = 'Em seguida: o grimório oferece um aprimoramento antes de enfrentar o mesmo oponente.'
    } else if (phaseComplete) {
      nextHint = 'Em seguida: o desfecho da Arena!'
    } else {
      nextHint = 'Em seguida: escolha um aprimoramento no grimório antes do próximo duelo.'
    }
  } else if (!lastBattleWon) {
    nextHint = 'Em seguida: o grimório oferece um aprimoramento antes de repetir esta câmara.'
  } else if (campaignComplete) {
    nextHint = 'Em seguida: o desfecho da sua trilha na Fenda.'
  } else if (phaseComplete) {
    nextHint = 'Em seguida: fronteira da fase — escolha um dado para carregar.'
  } else {
    nextHint = 'Em seguida: escolha um aprimoramento no grimório.'
  }

  return (
    <div className={`app-screen active campaign-phase-bg ${phaseTheme.bgClass}`}>
      <div
        className={`card post-battle-card${lastBattleWon ? ' post-battle-card--win' : ' post-battle-card--loss'}`}
      >
        <div className="post-battle-hero" aria-hidden>
          {lastBattleWon ? (
            <span className="post-battle-trophy">🏆</span>
          ) : (
            <span className="post-battle-mark">⚗️</span>
          )}
        </div>
        <div className="post-battle-avatar-row">
          <PlayerAvatar battlesWon={runStats.battlesWon} emphasize={lastBattleWon} />
        </div>
        <h2 className="post-battle-title">
          {isPvpMode
            ? lastBattleWon ? 'Duelo vencido!' : 'Duelo perdido'
            : lastBattleWon ? 'Parabéns!' : 'Confronto encerrado'}
        </h2>
        {isPvpMode && enemy ? (
          <p className="post-battle-pvp-opponent">
            vs <span className="pvp-opponent-name">{enemy.name}</span>
          </p>
        ) : null}
        {lastBattleWon ? (
          <p className="post-battle-lead">
            {isPvpMode ? (
              phaseComplete ? (
                <>
                  Você <strong>dominou a Arena</strong>! Todos os{' '}
                  <strong>{TOTAL_BATTLES} oponentes</strong> foram derrotados.
                </>
              ) : (
                <>
                  A build de <strong className="pvp-opponent-name">{enemy?.name ?? 'o oponente'}</strong>{' '}
                  não resistiu. Duelo{' '}
                  <strong>
                    {battleIndex + 1}/{TOTAL_BATTLES}
                  </strong>{' '}
                  vencido.
                </>
              )
            ) : phaseComplete ? (
              <>
                Você <strong>encerrou esta fase</strong> da Fenda
                {campaignComplete ? ' e toda a campanha' : ''}. Vitória sobre{' '}
                <strong>{enemy?.name ?? 'o guardião'}</strong>.
              </>
            ) : (
              <>
                <strong>{enemy?.name ?? 'O guardião'}</strong> cedeu à sua mesa. Câmara{' '}
                <strong>
                  {battleIndex + 1} / {TOTAL_BATTLES}
                </strong>{' '}
                dominada nesta etapa.
              </>
            )}
          </p>
        ) : (
          <p className="post-battle-lead">
            {isPvpMode ? (
              <>
                A build de <strong className="pvp-opponent-name">{enemy?.name ?? 'o oponente'}</strong>{' '}
                prevaleceu. Restam <strong>{lives}</strong> {lives === 1 ? 'vida' : 'vidas'}.
              </>
            ) : (
              <>
                <strong>{enemy?.name ?? 'O guardião'}</strong> prevaleceu desta vez. Restam{' '}
                <strong>{lives}</strong> {lives === 1 ? 'vida' : 'vidas'}.
              </>
            )}
          </p>
        )}
        {milestoneD4Pending ? (
          <p className="post-battle-milestone" role="status">
            Marco a cada 5 câmaras na campanha: ao continuar, você recebe{' '}
            <strong>+1 dado de 4 faces (1d4)</strong> na mesa.
          </p>
        ) : null}
        <p className="post-battle-next-hint">{nextHint}</p>
        <button
          type="button"
          className="btn-primary post-battle-continue"
          onClick={() => continueFromPostBattle()}
        >
          Continuar
        </button>
      </div>
    </div>
  )
}

function UpgradeScreen() {
  const campaignPhase = useGameStore((s) => s.campaignPhase)
  const lastBattleWon = useGameStore((s) => s.lastBattleWon)
  const lives = useGameStore((s) => s.lives)
  const milestoneD4Message = useGameStore((s) => s.milestoneD4Message)
  const pendingUpgrades = useGameStore((s) => s.pendingUpgrades)
  const enemyUpgradePreview = useGameStore((s) => s.enemyUpgradePreview)
  const applyUpgrade = useGameStore((s) => s.applyUpgrade)
  const lastBattleLog = useGameStore((s) => s.lastBattleLog)
  const runStats = useGameStore((s) => s.runStats)
  const phaseTheme = getCampaignPhaseTheme(campaignPhase)

  const modalTitleId = 'upgrade-choice-modal-title'

  return (
    <div className={`app-screen active campaign-phase-bg ${phaseTheme.bgClass}`}>
      <div className="card upgrade-screen-summary" style={{ textAlign: 'center' }}>
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
            ? 'Anote um novo traço no grimório: a escolha de aprimoramento abre em destaque.'
            : `${lives} tentativa(s) restante(s). A Fenda não perdoa; adapte sua mesa mesmo assim.`}
        </p>
        {milestoneD4Message ? (
          <p className="milestone-d4-banner" role="status">
            {milestoneD4Message}
          </p>
        ) : null}
      </div>

      <div className="upgrade-choice-modal-backdrop" role="presentation">
        <div
          className="upgrade-choice-modal-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby={modalTitleId}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="upgrade-choice-modal-header">
            <p className="upgrade-choice-modal-kicker" aria-hidden>
              ✦ Grimório
            </p>
            <h2 id={modalTitleId} className="upgrade-choice-modal-title">
              Escolha um aprimoramento
            </h2>
            <p className="upgrade-choice-modal-lead">
              {lastBattleWon
                ? 'Toque em uma das três cartas para gravar o efeito na sua mesa. A 1ª opção é sempre o caminho fixo de progressão.'
                : 'Mesmo após uma falha, a Fenda oferece um aprimoramento — escolha com cuidado.'}
            </p>
          </div>

          <div className="upgrade-choice-modal-body">
            <div className="upgrade-grid upgrade-grid--modal">
              {pendingUpgrades.map((u, i) => (
                <button
                  type="button"
                  key={i}
                  className={`upgrade-card upgrade-card--slot-${i}`}
                  onClick={() => applyUpgrade(i)}
                >
                  <span className="upgrade-card-slot-label">
                    {i === 0 ? 'Opção 1 · Progressão' : `Opção ${i + 1} · Sorteio`}
                  </span>
                  <div className="icon">{u.icon}</div>
                  <div className="title">{u.label}</div>
                  <div className="desc">{u.desc}</div>
                </button>
              ))}
            </div>

            <div className="upgrade-choice-modal-meta">
              <h3 className="upgrade-choice-modal-meta-title">Eco na masmorra</h3>
              <p className="upgrade-choice-modal-meta-desc">
                O próximo guardião também evolui automaticamente:
              </p>
              <div className="enemy-evolve-note upgrade-choice-enemy-note">{enemyUpgradePreview}</div>
            </div>

            <div className="upgrade-choice-modal-log">
              <BattleLogHistory
                entries={lastBattleLog}
                title="Histórico da última câmara"
                className="upgrade-choice-log-card"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function PhaseBridgeScreen() {
  const campaignPhase = useGameStore((s) => s.campaignPhase)
  const beginNextCampaignPhase = useGameStore((s) => s.beginNextCampaignPhase)
  const milestoneD4Message = useGameStore((s) => s.milestoneD4Message)
  const collection = useGameStore((s) => s.collection)
  const playerHp = useGameStore((s) => s.playerHp)
  const playerHpMax = useGameStore((s) => s.playerHpMax)
  const lives = useGameStore((s) => s.lives)
  const runStats = useGameStore((s) => s.runStats)
  const isPvpMode = useGameStore((s) => s.isPvpMode)

  const [carryDiceIdx, setCarryDiceIdx] = useState(0)
  useEffect(() => {
    setCarryDiceIdx(defaultPhaseCarryDiceIndex(collection))
  }, [collection])

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
        <h2 style={{ marginBottom: 8 }}>
          {isPvpMode ? 'Fronteira da Arena' : 'Fronteira da Fenda'}
        </h2>
        <p style={{ marginBottom: 12, color: 'var(--color-text-secondary)' }}>
          {isPvpMode ? (
            <>
              A arena{' '}
              <strong>
                <span aria-hidden>{doneTheme.icon}</span> {doneTheme.label}
              </strong>{' '}
              foi dominada ({TOTAL_BATTLES} duelos). Na próxima fase os oponentes serão mais fortes.
              Você recebe{' '}
              <strong>{diceFriendlyOneDieOf(nextDie)}</strong>{' '}
              <span style={{ fontSize: 12, opacity: 0.9 }}>(notação {diceNotationOne(nextDie)})</span>{' '}
              e leva <strong>mais um dado</strong> à sua escolha. Seu estado:{' '}
              <strong>
                {playerHp} / {playerHpMax} PV
              </strong>{' '}
              e <strong>{lives}</strong> vida(s).
            </>
          ) : (
            <>
              A fase{' '}
              <strong>
                <span aria-hidden>{doneTheme.icon}</span> {doneTheme.label}
              </strong>{' '}
              foi selada ({TOTAL_BATTLES} câmaras). Na próxima etapa você recebe{' '}
              <strong>{diceFriendlyOneDieOf(nextDie)}</strong>{' '}
              <span style={{ fontSize: 12, opacity: 0.9 }}>(notação {diceNotationOne(nextDie)})</span>{' '}
              e leva <strong>mais um dado</strong> à sua escolha da mesa abaixo. O que permanece do
              corpo:{' '}
              <strong>
                {playerHp} / {playerHpMax} PV
              </strong>{' '}
              e <strong>{lives}</strong> vida(s).
            </>
          )}
        </p>
        {milestoneD4Message ? (
          <p className="milestone-d4-banner" role="status">
            {milestoneD4Message}
          </p>
        ) : null}

        <div className="phase-bridge-carry" role="group" aria-label="Escolha um dado para carregar">
          <h3 className="phase-bridge-carry-title">Levar para a próxima fase</h3>
          <p className="phase-bridge-carry-hint">
            Toque em um dado para selecionar. Os outros não atravessam a fronteira.
          </p>
          <div className="phase-bridge-carry-grid">
            {collection.map((d, i) => {
              const hasSp = d.special.length > 0
              const selected = i === carryDiceIdx
              return (
                <button
                  type="button"
                  key={`${d.sides}-${d.count}-${i}`}
                  className={[
                    'phase-bridge-carry-card',
                    'collection-die',
                    hasSp ? 'has-special' : '',
                    selected ? 'phase-bridge-carry-card--selected' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  aria-pressed={selected}
                  onClick={() => setCarryDiceIdx(i)}
                >
                  <div className="collection-die-primary">{diceFriendlyPrimary(d)}</div>
                  <div className="collection-die-notation" aria-hidden>
                    {diceNotation(d)} · de 1 a {d.sides}
                  </div>
                  {hasSp ? (
                    <>
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
                </button>
              )
            })}
          </div>
        </div>

        <CampaignTrailMap doneThrough={campaignPhase} pulsePhase={nextPhase} />
        <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)', marginTop: 12 }}>
          Vitórias na campanha: {runStats.battlesWon} / {TOTAL_CAMPAIGN_CHAMBERS}
        </p>
        <button
          type="button"
          className="btn-primary"
          style={{ marginTop: 16, padding: '10px 28px' }}
          onClick={() => beginNextCampaignPhase(carryDiceIdx)}
        >
          Continuar para {nextTheme.icon} {nextTheme.label}
        </button>
      </div>
    </div>
  )
}

function PublishRunCard() {
  const authUser = useGameStore((s) => s.authUser)
  const setAuthUser = useGameStore((s) => s.setAuthUser)
  const playerName = useGameStore((s) => s.playerName)
  const setPlayerName = useGameStore((s) => s.setPlayerName)
  const endVictory = useGameStore((s) => s.endVictory)
  const runStats = useGameStore((s) => s.runStats)
  const collection = useGameStore((s) => s.collection)
  const campaignPhase = useGameStore((s) => s.campaignPhase)
  const playerHpMax = useGameStore((s) => s.playerHpMax)

  const [authOpen, setAuthOpen] = useState(false)
  const [status, setStatus] = useState<'idle' | 'submitting' | 'done' | 'error'>('idle')

  const isOnline = !!supabase
  const loggedIn = !!authUser
  const score = computeScore(runStats)

  const handlePublish = async () => {
    if (!playerName.trim()) return
    setStatus('submitting')
    const ok = await submitRun({
      playerName: playerName.trim(),
      gameVersion: GAME_VERSION,
      score,
      battlesWon: runStats.battlesWon,
      deepestFloor: runStats.deepestFloor,
      campaignCompleted: endVictory,
      campaignPhase,
      combatRounds: runStats.combatRounds,
      damageDealt: runStats.damageDealt,
      buildJson: { collection, playerHpMax, campaignPhase },
      runStatsJson: runStats,
    })
    setStatus(ok ? 'done' : 'error')
  }

  return (
    <div className="card publish-run-card">
      <AuthModal
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        onAuth={(user) => setAuthUser(user)}
      />

      <h3 style={{ marginBottom: 8 }}>📊 Publicar no ranking</h3>
      <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
        Score desta run: <strong>{score.toLocaleString()}</strong>
      </p>

      {status === 'done' ? (
        <p className="publish-run-success">Run publicada com sucesso!</p>
      ) : isOnline && !loggedIn ? (
        <>
          <p style={{ fontSize: 13, marginBottom: 10 }}>
            Crie uma conta ou entre para salvar sua run no ranking global.
          </p>
          <button
            type="button"
            className="btn-primary"
            style={{ padding: '8px 24px', fontSize: 13 }}
            onClick={() => setAuthOpen(true)}
          >
            Criar conta / Entrar
          </button>
        </>
      ) : (
        <>
          <div className="publish-run-row">
            <input
              type="text"
              className="publish-run-input"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Seu nome"
              maxLength={30}
              disabled={status === 'submitting'}
            />
            <button
              type="button"
              className="btn-primary"
              style={{ padding: '8px 20px', fontSize: 13 }}
              disabled={status === 'submitting' || !playerName.trim()}
              onClick={handlePublish}
            >
              {status === 'submitting' ? 'Enviando…' : 'Publicar'}
            </button>
          </div>
          {status === 'error' && (
            <p className="publish-run-error">
              Não foi possível publicar.
            </p>
          )}
        </>
      )}
    </div>
  )
}

function EndScreen() {
  const endVictory = useGameStore((s) => s.endVictory)
  const milestoneD4Message = useGameStore((s) => s.milestoneD4Message)
  const collection = useGameStore((s) => s.collection)
  const goToStart = useGameStore((s) => s.goToStart)
  const startCampaign = useGameStore((s) => s.startCampaign)
  const startCampaignFromBuild = useGameStore((s) => s.startCampaignFromBuild)
  const lastBattleLog = useGameStore((s) => s.lastBattleLog)
  const runStats = useGameStore((s) => s.runStats)
  const isPvpMode = useGameStore((s) => s.isPvpMode)
  const campaignPhase = useGameStore((s) => s.campaignPhase)
  const arenaPoints = useGameStore((s) => s.arenaPoints)
  const lastArenaPointsDelta = useGameStore((s) => s.lastArenaPointsDelta)
  const [leaderboardOpen, setLeaderboardOpen] = useState(false)

  const handleLoadBuild = useCallback(
    (snapshot: BuildSnapshot) => startCampaignFromBuild(snapshot),
    [startCampaignFromBuild],
  )

  return (
    <div className={`app-screen active end-screen ${endVictory ? 'end-screen--victory' : 'end-screen--defeat'}`}>
      <LeaderboardModal
        open={leaderboardOpen}
        onClose={() => setLeaderboardOpen(false)}
        onLoadBuild={handleLoadBuild}
      />

      <div className="card end-screen-hero">
        {isPvpMode && endVictory ? (
          <>
            <div className="end-screen-badge" aria-hidden>
              ⚔️
            </div>
            <p className="end-screen-ribbon">Arena dominada</p>
            <div className="end-screen-emoji-row" aria-hidden>
              🏆 ⚔️ 🎲
            </div>
            <h2 className="end-screen-title">Campeão da Arena</h2>
            <p className="end-screen-lead">
              Você atravessou as <strong>{CAMPAIGN_PHASE_COUNT} fases</strong> da Arena (
              <strong>{TOTAL_CAMPAIGN_CHAMBERS} duelos</strong>) enfrentando builds reais de outros
              jogadores. Nenhuma build resistiu à sua estratégia.
            </p>
            <p className="end-screen-sub">Volte à campanha ou tente novamente!</p>
            {lastArenaPointsDelta !== null && (
              <div className="arena-points-result">
                <ArenaRankBadge points={arenaPoints} />
                <span className={`arena-points-delta arena-points-delta--${lastArenaPointsDelta >= 0 ? 'up' : 'down'}`}>
                  {lastArenaPointsDelta >= 0 ? '+' : ''}{lastArenaPointsDelta} AP
                </span>
              </div>
            )}
          </>
        ) : isPvpMode && !endVictory ? (
          <>
            <div className="end-screen-grave" aria-hidden>
              <span className="end-screen-grave__mound" />
              <span className="end-screen-grave__coffin">⚰️</span>
              <span className="end-screen-grave__stone">🪦</span>
              <span className="end-screen-grave__skull">💀</span>
            </div>
            <p className="end-screen-epitaph">Derrotado na Arena</p>
            <h2 className="end-screen-title end-screen-title--defeat">Arena encerrada</h2>
            <p className="end-screen-lead">
              Suas três vidas se esgotaram na fase{' '}
              <strong>{CAMPAIGN_PHASES[campaignPhase]?.label ?? ''}</strong> da Arena. As builds alheias
              foram duras demais — por enquanto.
            </p>
            <p className="end-screen-sub">Tente novamente ou volte à campanha.</p>
            {lastArenaPointsDelta !== null && (
              <div className="arena-points-result">
                <ArenaRankBadge points={arenaPoints} />
                <span className={`arena-points-delta arena-points-delta--${lastArenaPointsDelta >= 0 ? 'up' : 'down'}`}>
                  {lastArenaPointsDelta >= 0 ? '+' : ''}{lastArenaPointsDelta} AP
                </span>
              </div>
            )}
          </>
        ) : endVictory ? (
          <>
            <div className="end-screen-badge" aria-hidden>
              🏆
            </div>
            <p className="end-screen-ribbon">Trilha completa</p>
            <div className="end-screen-emoji-row" aria-hidden>
              ⚗️ ✨ 🎲
            </div>
            <h2 className="end-screen-title">Maestria elementar</h2>
            <p className="end-screen-lead">
              Você atravessou as <strong>{CAMPAIGN_PHASE_COUNT} fases</strong> (
              <strong>{TOTAL_CAMPAIGN_CHAMBERS} câmaras</strong>) e estabilizou o núcleo da Fenda. A mesa
              obedeceu: seu grimório está completo — por ora — e cada 🎲 dado que você moldou conta uma
              história de sobrevivência.
            </p>
            <p className="end-screen-sub">Obrigado por jogar. Até a próxima descida.</p>
            {milestoneD4Message ? (
              <p className="milestone-d4-banner end-screen-milestone" role="status">
                {milestoneD4Message}
              </p>
            ) : null}
          </>
        ) : (
          <>
            <div className="end-screen-grave" aria-hidden>
              <span className="end-screen-grave__mound" />
              <span className="end-screen-grave__coffin">⚰️</span>
              <span className="end-screen-grave__stone">🪦</span>
              <span className="end-screen-grave__skull">💀</span>
            </div>
            <p className="end-screen-epitaph">Aqui jaz a última tentativa na Fenda</p>
            <h2 className="end-screen-title end-screen-title--defeat">Trilha encerrada</h2>
            <p className="end-screen-lead">
              As três vidas se esgotaram. A escuridão da Fenda não devolve o que engole — só resta marcar a
              cova, respirar e, se quiser, subir de novo com 🎲 dados novos na mão.
            </p>
            <p className="end-screen-sub">Volte ao laboratório quando estiver pronto para outra descida.</p>
          </>
        )}
      </div>

      <BattleLogHistory entries={lastBattleLog} title="Histórico da última câmara" />

      <RunStatsSummary stats={runStats} />

      <PublishRunCard />

      <div className="card">
        <h3 style={{ marginBottom: 8 }}>🎲 Seus dados ao fim da run</h3>
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
        <button
          type="button"
          onClick={() => setLeaderboardOpen(true)}
          style={{ padding: '8px 24px' }}
        >
          📊 Ver ranking
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
  const setAuthUser = useGameStore((s) => s.setAuthUser)
  useMenuMusic(screen === 'start')

  useEffect(() => {
    getAuthUser().then((u) => {
      if (u) {
        setAuthUser(u)
        syncFromCloud().catch(() => {})
      }
    })
    return onAuthChange((u) => {
      setAuthUser(u)
      if (u) syncFromCloud().catch(() => {})
    })
  }, [setAuthUser])

  return (
    <>
      {screen === 'start' ? <StartScreen /> : null}
      {screen === 'battle' ? <BattleScreen /> : null}
      {screen === 'post_battle' ? <PostBattleScreen /> : null}
      {screen === 'upgrade' ? <UpgradeScreen /> : null}
      {screen === 'phase_bridge' ? <PhaseBridgeScreen /> : null}
      {screen === 'end' ? <EndScreen /> : null}
    </>
  )
}
