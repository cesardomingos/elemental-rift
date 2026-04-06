import { Fragment, useEffect, useId, useRef, useState } from 'react'
import type { RunRow, BuildSnapshot } from '../game/runSubmission'
import { getArenaRankInfo } from '../game/runSubmission'
import { fetchLeaderboard, fetchArenaLeaderboard, type ArenaLeaderboardEntry } from '../lib/supabase'
import { getSpecialById } from '../game/constants'
import type { DieInstance } from '../game/types'

type Props = {
  open: boolean
  onClose: () => void
  onLoadBuild: (snapshot: BuildSnapshot) => void
}

type Tab = 'campaign' | 'arena'

function BuildPreview({ collection }: { collection: DieInstance[] }) {
  return (
    <div className="leaderboard-build-preview">
      {collection.map((d, i) => (
        <span key={i} className="dice-tag">
          <span className="dice-tag__text">
            <span className="dice-tag__main">
              {d.count}d{d.sides}
            </span>
          </span>
          {d.special.length > 0 && (
            <span className="dice-tag__icons">
              {d.special.map((id, si) => {
                const sp = getSpecialById(id)
                return sp ? (
                  <span key={si} title={sp.label}>
                    {sp.icon}
                  </span>
                ) : null
              })}
            </span>
          )}
        </span>
      ))}
    </div>
  )
}

function CampaignTab({
  runs,
  loading,
  expandedId,
  setExpandedId,
  onLoadBuild,
  onClose,
}: {
  runs: RunRow[]
  loading: boolean
  expandedId: string | null
  setExpandedId: (id: string | null) => void
  onLoadBuild: (snapshot: BuildSnapshot) => void
  onClose: () => void
}) {
  return (
    <>
      <p className="modal-lead">
        Melhores descidas registradas na Fenda. Toque em uma linha para ver a build.
      </p>

      {loading && <p className="modal-muted">Carregando…</p>}

      {!loading && runs.length === 0 && (
        <p className="modal-muted">Nenhuma entrada no ranking ainda.</p>
      )}

      {runs.length > 0 && (
        <div className="leaderboard-scroll">
          <table className="leaderboard-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Jogador</th>
                <th>Score</th>
                <th>Vitórias</th>
                <th>Completa</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r, i) => {
                const expanded = expandedId === r.id
                return (
                  <Fragment key={r.id}>
                    <tr
                      className={`leaderboard-row${expanded ? ' leaderboard-row--expanded' : ''}`}
                      onClick={() => setExpandedId(expanded ? null : r.id)}
                    >
                      <td className="leaderboard-rank">{i + 1}</td>
                      <td>{r.player_name}</td>
                      <td className="leaderboard-num">{r.score.toLocaleString()}</td>
                      <td className="leaderboard-num">{r.battles_won}/30</td>
                      <td className="leaderboard-num">{r.campaign_completed ? '✓' : '—'}</td>
                    </tr>
                    {expanded && (
                      <tr className="leaderboard-detail-row">
                        <td colSpan={5}>
                          <div className="leaderboard-detail">
                            <p className="leaderboard-detail-label">Build ao fim da run</p>
                            <BuildPreview collection={r.build_json.collection} />
                            <div className="leaderboard-detail-stats">
                              Dano total: {r.damage_dealt.toLocaleString()} · Rodadas:{' '}
                              {r.combat_rounds} · Fase: {r.campaign_phase + 1}
                            </div>
                            <button
                              type="button"
                              className="btn-primary leaderboard-load-btn"
                              onClick={(e) => {
                                e.stopPropagation()
                                onLoadBuild(r.build_json)
                                onClose()
                              }}
                            >
                              Jogar com esta build
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

function ArenaTab({
  entries,
  loading,
}: {
  entries: ArenaLeaderboardEntry[]
  loading: boolean
}) {
  return (
    <>
      <p className="modal-lead">
        Classificação dos jogadores na Arena PvP por pontos de arena (AP).
      </p>

      {loading && <p className="modal-muted">Carregando…</p>}

      {!loading && entries.length === 0 && (
        <p className="modal-muted">Nenhum jogador ranqueado ainda.</p>
      )}

      {entries.length > 0 && (
        <div className="leaderboard-scroll">
          <table className="leaderboard-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Jogador</th>
                <th>Rank</th>
                <th>AP</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e, i) => {
                const info = getArenaRankInfo(e.arena_points)
                return (
                  <tr key={e.id} className="leaderboard-row">
                    <td className="leaderboard-rank">{i + 1}</td>
                    <td>{e.display_name}</td>
                    <td>
                      <span className={`arena-rank-badge arena-rank-badge--${info.rank}`} style={{ fontSize: 11, padding: '1px 7px' }}>
                        {info.icon} {info.label}
                      </span>
                    </td>
                    <td className="leaderboard-num">{e.arena_points.toLocaleString()}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

export function LeaderboardModal({ open, onClose, onLoadBuild }: Props) {
  const titleId = useId()
  const closeRef = useRef<HTMLButtonElement>(null)
  const [tab, setTab] = useState<Tab>('campaign')
  const [runs, setRuns] = useState<RunRow[]>([])
  const [arenaEntries, setArenaEntries] = useState<ArenaLeaderboardEntry[]>([])
  const [loadingCampaign, setLoadingCampaign] = useState(false)
  const [loadingArena, setLoadingArena] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    closeRef.current?.focus()

    setLoadingCampaign(true)
    fetchLeaderboard()
      .then(setRuns)
      .finally(() => setLoadingCampaign(false))

    setLoadingArena(true)
    fetchArenaLeaderboard()
      .then(setArenaEntries)
      .finally(() => setLoadingArena(false))

    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="modal-panel modal-panel--uniform"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 id={titleId} className="modal-title">
            Ranking
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

        <div className="leaderboard-tabs">
          <button
            type="button"
            className={`leaderboard-tab${tab === 'campaign' ? ' leaderboard-tab--active' : ''}`}
            onClick={() => setTab('campaign')}
          >
            🧟 Campanha
          </button>
          <button
            type="button"
            className={`leaderboard-tab${tab === 'arena' ? ' leaderboard-tab--active' : ''}`}
            onClick={() => setTab('arena')}
          >
            ⚔️ Arena
          </button>
        </div>

        <div className="modal-body">
          {tab === 'campaign' ? (
            <CampaignTab
              runs={runs}
              loading={loadingCampaign}
              expandedId={expandedId}
              setExpandedId={setExpandedId}
              onLoadBuild={onLoadBuild}
              onClose={onClose}
            />
          ) : (
            <ArenaTab entries={arenaEntries} loading={loadingArena} />
          )}
        </div>
      </div>
    </div>
  )
}
