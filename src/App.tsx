import { useState } from 'react'
import { useGameStore } from './store/gameStore'
import { useMenuMusic } from './hooks/useMenuMusic'
import { EvolutionsGuideModal } from './components/EvolutionsGuideModal'
import { PlayerAvatar } from './components/PlayerAvatar'
import {
  PLAYER_BASE_HP,
  PLAYER_HP_GROWTH_PER_BATTLE,
  TOTAL_BATTLES,
  getSpecialById,
} from './game/constants'
import { totalRoll } from './game/dice'
import type { DieInstance, LogEntry, RunStats } from './game/types'

function CollectionGrid({ dice }: { dice: DieInstance[] }) {
  return (
    <div className="collection-grid">
      {dice.map((d, i) => {
        const sp = d.special ? getSpecialById(d.special) : null
        return (
          <div
            key={`${d.sides}-${d.count}-${i}`}
            className={`collection-die${d.special ? ' has-special' : ''}`}
          >
            {d.count}d{d.sides}
            {sp ? ` ${sp.icon}` : ''}
            {sp ? (
              <>
                <br />
                <span style={{ fontSize: 10 }}>{sp.label}</span>
              </>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

function DiceTags({ dice }: { dice: DieInstance[] }) {
  return (
    <div className="dice-tags">
      {dice.map((d, i) => {
        const sp = d.special ? getSpecialById(d.special) : null
        return (
          <span key={i} className="dice-tag">
            {d.count}d{d.sides}
            {sp ? ` ${sp.icon}` : ''}
          </span>
        )
      })}
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
        Resumo de todo o percurso na Fenda (inclui todas as câmaras disputadas).
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
        <dt>Maior profundidade</dt>
        <dd>
          Câmara {stats.deepestFloor} / {TOTAL_BATTLES}
        </dd>
      </dl>
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
  const startRun = useGameStore((s) => s.startRun)
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
        <p style={{ marginBottom: '1.5rem' }}>
          Você é um alquimista que desce à <strong>Fenda Elemental</strong>: uma dungeon onde reações
          perigosas tomam forma. Cada vitória é um experimento concluído: seus dados são fórmulas
          instáveis; refine-os entre um confronto e outro.
        </p>
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
            onClick={startRun}
            style={{ padding: '10px 32px', fontSize: 15 }}
          >
            Entrar na Fenda
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
          Os duelos se resolvem sozinhos, rodada a rodada. Desça {TOTAL_BATTLES} câmaras da masmorra.
          Você pode gravar <strong>efeitos especiais</strong> nos dados (ex.: abertura crítica na 1ª
          rodada, face máxima duplicada, curas, bônus de dano). Cada dado rolado devolve 1 PV a quem o
          lançou (até o máximo). Ao avançar de câmara, seu limite de vida sobe{' '}
          <strong>+{PLAYER_HP_GROWTH_PER_BATTLE} PV máximos</strong> por etapa (início: {PLAYER_BASE_HP}).
          Você tem 3 chances de falha. Depois, pode recomeçar a run ou voltar ao laboratório.
        </p>
      </div>
    </div>
  )
}

function BattleScreen() {
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
  const skipBattle = useGameStore((s) => s.skipBattle)
  const runStats = useGameStore((s) => s.runStats)

  const enemy = enemies[battleIndex]
  const pPct = Math.max(0, (playerHp / playerHpMax) * 100)
  const ePct = Math.max(0, (enemyHp / enemyHpMax) * 100)

  return (
    <div className="app-screen active">
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
                display: 'block',
              }}
            >
              Câmara {battleIndex + 1} de {TOTAL_BATTLES}
            </span>
            <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
              Profundidade da Fenda
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
        <div className="fighter">
          <div className="name">Alquimista</div>
          <div className="hp-bar-wrap">
            <div className="hp-bar player" style={{ width: `${pPct}%` }} />
          </div>
          <div className="hp-text">
            {Math.max(0, playerHp)} / {playerHpMax}
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
          <DiceTags dice={collection} />
          <div className="total-sub">
            {playerRolls.length > 0 ? `Total: ${totalRoll(playerRolls)}` : ''}
          </div>
        </div>
        <div className="vs-label">VS</div>
        <div className="fighter">
          <div className="name">{enemy?.name ?? '…'}</div>
          <div className="hp-bar-wrap">
            <div className="hp-bar enemy" style={{ width: `${ePct}%` }} />
          </div>
          <div className="hp-text">
            {Math.max(0, enemyHp)} / {enemyHpMax}
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
          <DiceTags dice={enemy?.dice ?? []} />
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
        <button type="button" onClick={toggleSpeed} style={{ marginRight: 8 }}>
          {speed === 1 ? '⚡ Acelerar' : '🐢 Normal'}
        </button>
        <button
          type="button"
          className="btn-danger"
          onClick={skipBattle}
          disabled={!battleRunning}
        >
          ⏭ Resolver câmara
        </button>
      </div>
    </div>
  )
}

function UpgradeScreen() {
  const lastBattleWon = useGameStore((s) => s.lastBattleWon)
  const lives = useGameStore((s) => s.lives)
  const pendingUpgrades = useGameStore((s) => s.pendingUpgrades)
  const enemyUpgradePreview = useGameStore((s) => s.enemyUpgradePreview)
  const applyUpgrade = useGameStore((s) => s.applyUpgrade)
  const lastBattleLog = useGameStore((s) => s.lastBattleLog)
  const runStats = useGameStore((s) => s.runStats)

  return (
    <div className="app-screen active">
      <div className="card" style={{ textAlign: 'center' }}>
        <PlayerAvatar battlesWon={runStats.battlesWon} emphasize={lastBattleWon} />
        <div className="result-icon">{lastBattleWon ? '📜' : '💀'}</div>
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

function EndScreen() {
  const endVictory = useGameStore((s) => s.endVictory)
  const collection = useGameStore((s) => s.collection)
  const goToStart = useGameStore((s) => s.goToStart)
  const startRun = useGameStore((s) => s.startRun)
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
            ? `Você atravessou as ${TOTAL_BATTLES} câmaras e estabilizou o núcleo da Fenda. Seu grimório está completo, por ora.`
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
          onClick={startRun}
          style={{ padding: '10px 32px' }}
        >
          Nova descida
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
      {screen === 'end' ? <EndScreen /> : null}
    </>
  )
}
