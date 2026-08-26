import type { ProcedureLigne } from '../../hooks/useProcedures'

// ─── Couleurs et labels — identiques à PanneauOptions.tsx ────────────────────
const STATUT: Record<string, { label: string; badge: string }> = {
  liquidation:  { label: 'Liquidation judiciaire',  badge: 'bg-red-50 text-red-700 border-red-200' },
  redressement: { label: 'Redressement judiciaire', badge: 'bg-orange-50 text-orange-700 border-orange-200' },
  sauvegarde:   { label: 'Sauvegarde',              badge: 'bg-amber-50 text-amber-700 border-amber-200' },
  cloture:      { label: 'Clôture',                 badge: 'bg-gray-50 text-gray-500 border-gray-200' },
  radiation:    { label: 'Radiation',               badge: 'bg-gray-50 text-gray-500 border-gray-200' },
}

function IcBadge({ type }: { type: string }) {
  const cls = 'flex-shrink-0'
  if (type === 'liquidation')
    return <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cls}><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
  if (type === 'redressement')
    return <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cls}><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
  if (type === 'sauvegarde')
    return <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cls}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
  if (type === 'cloture')
    return <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cls}><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
  return null
}

function BadgeDeclaration({ statut, encours }: { statut: string | null; encours: number }) {
  if (encours < 0.01)
    return <span className="text-xs text-gray-300">—</span>
  if (!statut || statut === 'brouillon')
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-50 text-red-600 border border-red-100">
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        À déclarer
      </span>
    )
  if (statut === 'declaree' || statut === 'acceptee')
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-ockham-teal-muted text-ockham-teal-dark border border-ockham-teal/25">
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
        {statut === 'acceptee' ? 'Acceptée' : 'Déclarée'}
      </span>
    )
  if (statut === 'rejetee')
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-50 text-red-700 border border-red-100">Rejetée</span>
  return null
}

const fmtEuros = (n: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

interface Props {
  lignes: ProcedureLigne[]
  chargement: boolean
  showKpis?: boolean
  onOuvrirDetail: (l: ProcedureLigne) => void
}

export function ListeProcedures({ lignes, chargement, showKpis = false, onOuvrirDetail }: Props) {
  if (chargement) {
    return (
      <div className="space-y-4">
        {showKpis && (
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-20 bg-white rounded-xl border border-gray-100 animate-pulse" />)}
          </div>
        )}
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          {[1, 2, 3].map(i => <div key={i} className="h-12 border-b border-gray-50 animate-pulse" />)}
        </div>
      </div>
    )
  }

  // ─── KPIs ────────────────────────────────────────────────────────────────────
  const totalEncours = lignes.reduce((s, l) => s + l.encours, 0)
  const aDeclarer   = lignes.filter(l => l.encours >= 0.01 && (!l.declarationStatut || l.declarationStatut === 'brouillon')).length
  const declarees   = lignes.filter(l => l.declarationStatut === 'declaree' || l.declarationStatut === 'acceptee').length

  return (
    <div className="space-y-4">

      {/* KPIs (onglet En cours uniquement) */}
      {showKpis && (
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-gray-100 px-5 py-4">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Clients exposés</p>
            <p className="text-2xl font-bold text-gray-900">{lignes.length}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">procédures actives</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 px-5 py-4">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Encours exposé</p>
            <p className="text-2xl font-bold text-ockham-copper">{fmtEuros(totalEncours)}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">toutes procédures</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 px-5 py-4">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Déclarations à faire</p>
            <p className="text-2xl font-bold text-red-600">{aDeclarer}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">créances non déclarées</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 px-5 py-4">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Déclarations faites</p>
            <p className="text-2xl font-bold text-ockham-teal">{declarees}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">créances déclarées</p>
          </div>
        </div>
      )}

      {/* Tableau */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {lignes.length === 0 ? (
          <div className="flex items-center justify-center h-32">
            <p className="text-sm text-gray-300">Aucune procédure enregistrée</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: '#0E1A2B' }}>
                <th className="text-left px-4 py-3 text-[11px] font-semibold" style={{ color: 'rgba(255,255,255,0.55)' }}>Code client</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold" style={{ color: 'rgba(255,255,255,0.55)' }}>Nom</th>
                <th className="text-right px-4 py-3 text-[11px] font-semibold" style={{ color: 'rgba(255,255,255,0.55)' }}>Encours</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold" style={{ color: 'rgba(255,255,255,0.55)' }}>Type de procédure</th>
                <th className="text-center px-4 py-3 text-[11px] font-semibold" style={{ color: 'rgba(255,255,255,0.55)' }}>Jours depuis BODACC</th>
                <th className="text-center px-4 py-3 text-[11px] font-semibold" style={{ color: 'rgba(255,255,255,0.55)' }}>Déclaration</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {lignes.map(l => {
                const st = STATUT[l.typeProcedure]
                return (
                  <tr
                    key={l.alerteId}
                    onClick={() => onOuvrirDetail(l)}
                    className="hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3.5">
                      <span className="font-mono text-[11px] text-gray-400">{l.codeClient}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="font-semibold text-gray-800">{l.nom}</span>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      {l.encours >= 0.01
                        ? <span className="font-bold text-ockham-copper">{fmtEuros(l.encours)}</span>
                        : <span className="text-gray-300">—</span>
                      }
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${st?.badge ?? 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                        <IcBadge type={l.typeProcedure} />
                        {st?.label ?? l.typeProcedure}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <span className="text-sm font-semibold text-gray-700">{l.joursDepuis} j</span>
                      <div className="text-[10px] text-gray-400 mt-0.5">{fmtDate(l.dateParution)}</div>
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <BadgeDeclaration statut={l.declarationStatut} encours={l.encours} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

    </div>
  )
}
