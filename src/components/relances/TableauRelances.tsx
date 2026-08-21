import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { IcSearch, IcSliders } from '../Icones'
import { joursDepuis, SEUIL_SANS_SUITE_DEFAUT } from '../../hooks/useRelances'
import type { Relance, StatutRelance, EtatVueRelance } from '../../hooks/useRelances'
import { useRole } from '../../contexts/RoleContext'
import { useAppData } from '../../contexts/AppDataContext'
import type { StatsOperateur } from '../../hooks/useLeaderboard'
import type { CommentaireFacture } from '../../types/client'
import { ModalDetailRelance } from './ModalDetailRelance'

// Calculé dynamiquement dans le composant via le prop seuilSansSuite

type ColSort = 'code_client' | 'nom_client' | 'envoyee_le' | 'jours' | 'montant' | 'operateur'

const TH = 'text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider px-3 py-3 cursor-pointer hover:text-ockham-teal select-none whitespace-nowrap'

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
}
function fmtEuros(n: number) {
  return n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
}
function fmtPct(n: number) { return `${Math.round(n)} %` }

const IcAlerte = () => (
  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
    <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>
)

function estEnAlerte(r: Relance, seuil: number): boolean {
  return r.envoyee_le != null && joursDepuis(r.envoyee_le) >= seuil - 10
}

interface SauvegarderComData {
  numero_piece: string; contact: string; date_contact: string
  commentaire: string; operateur: string; ne_pas_relancer?: boolean
}

interface Props {
  relances: Relance[]
  chargement: boolean
  onglet: EtatVueRelance
  onMajStatut: (id: string, statut: StatutRelance, dateRappel?: string) => Promise<boolean>
  onArchiver: (id: string) => Promise<boolean>
  onSauvegarderNote: (id: string, note: string) => Promise<boolean>
  onSauvegarderCommentaire: (data: SauvegarderComData) => Promise<boolean>
  classement: StatsOperateur[]
  commentaires: Map<string, CommentaireFacture>
  filtreOp: string
  onFiltreOpChange: (op: string) => void
  seuilSansSuite?: number
  facturesMapRelancesRelances: Map<string, { reste_du: number; montant_ttc: number }>
}

export function TableauRelances({ relances, chargement, onglet, onMajStatut, onArchiver, onSauvegarderNote, onSauvegarderCommentaire, classement, commentaires, filtreOp, onFiltreOpChange, seuilSansSuite = SEUIL_SANS_SUITE_DEFAUT, facturesMapRelancesRelances }: Props) {
  const navigate = useNavigate()
  const { peutModifier } = useRole()
  const { clients } = useAppData()
  const [recherche, setRecherche] = useState('')
  const [relanceOuverteId, setRelanceOuverteId] = useState<string | null>(null)
  const relanceOuverte = relances.find(r => r.id === relanceOuverteId) ?? null
  const [filtreOpOuvert, setFiltreOpOuvert] = useState(false)
  const [tri, setTri] = useState<ColSort>('envoyee_le')
  const [triAsc, setTriAsc] = useState(false)
  const [alertesSeulement, setAlertesSeulement] = useState(false)

  const clientsMap = useMemo(() => new Map(clients.map(c => [c.code_dso, c.nom])), [clients])
  const opMap = useMemo(() => new Map(classement.map(s => [s.operateur.id, s.operateur.initiales || s.operateur.email.slice(0, 3).toUpperCase()])), [classement])

  const operateursDispo = useMemo(() => {
    const ids = [...new Set(relances.map(r => r.operateur_id))]
    return ids.filter(id => opMap.has(id)).map(id => ({ id, nom: opMap.get(id)! }))
  }, [relances, opMap])

  function getMontant(r: Relance) {
    return (r.factures_ids ?? []).reduce((s, id) => s + (facturesMapRelances.get(id)?.montant_ttc ?? 0), 0)
  }
  function getSolde(r: Relance) {
    return (r.factures_ids ?? []).reduce((s, id) => s + (facturesMapRelances.get(id)?.reste_du ?? 0), 0)
  }
  function getEncaisse(r: Relance) { return Math.max(0, r.solde_snapshot - getSolde(r)) }
  function getPct(r: Relance) { return r.solde_snapshot > 0 ? (getEncaisse(r) / r.solde_snapshot) * 100 : 0 }

  const nbAlertes = useMemo(
    () => relances.filter(r => (filtreOp === 'tous' || r.operateur_id === filtreOp) && estEnAlerte(r, seuilSansSuite)).length,
    [relances, filtreOp]
  )

  const filtrees = useMemo(() => relances.filter(r => {
    if (filtreOp !== 'tous' && r.operateur_id !== filtreOp) return false
    if (recherche.trim()) {
      const q = recherche.toLowerCase()
      const nom = (clientsMap.get(r.code_client) ?? '').toLowerCase()
      if (!nom.includes(q) && !r.code_client.toLowerCase().includes(q)) return false
    }
    if (onglet === 'en_cours' && alertesSeulement && !estEnAlerte(r, seuilSansSuite)) return false
    return true
  }), [relances, filtreOp, recherche, clientsMap, onglet, alertesSeulement])

  const affichees = useMemo(() => [...filtrees].sort((a, b) => {
    if (onglet === 'en_cours') {
      const pa = estEnAlerte(a, seuilSansSuite) ? 0 : 1
      const pb = estEnAlerte(b, seuilSansSuite) ? 0 : 1
      if (pa !== pb) return pa - pb
    }
    let cmp = 0
    switch (tri) {
      case 'code_client': cmp = a.code_client.localeCompare(b.code_client); break
      case 'nom_client':  cmp = (clientsMap.get(a.code_client) ?? '').localeCompare(clientsMap.get(b.code_client) ?? ''); break
      case 'envoyee_le':  cmp = (a.envoyee_le ?? '').localeCompare(b.envoyee_le ?? ''); break
      case 'jours': {
        const ja = a.envoyee_le ? joursDepuis(a.envoyee_le) : -1
        const jb = b.envoyee_le ? joursDepuis(b.envoyee_le) : -1
        cmp = ja - jb; break
      }
      case 'montant':   cmp = getMontant(a) - getMontant(b); break
      case 'operateur': cmp = (opMap.get(a.operateur_id) ?? '').localeCompare(opMap.get(b.operateur_id) ?? ''); break
    }
    return triAsc ? cmp : -cmp
  }), [filtrees, tri, triAsc, clientsMap, onglet])

  function toggleTri(col: ColSort) {
    if (tri === col) setTriAsc(v => !v)
    else { setTri(col); setTriAsc(false) }
  }
  function fleche(col: ColSort) {
    if (tri !== col) return <span className="text-gray-300 ml-0.5 text-[9px]">↕</span>
    return <span className="text-ockham-teal ml-0.5 text-[9px]">{triAsc ? '↑' : '↓'}</span>
  }

  if (chargement) return <div className="py-12 text-center text-sm text-gray-400">Chargement…</div>

  return (
    <div className="space-y-3">
      {/* Barre filtres */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 min-w-[180px] flex-1 max-w-xs">
          <IcSearch size={13} className="text-gray-300 flex-shrink-0" />
          <input value={recherche} onChange={e => setRecherche(e.target.value)} placeholder="Client, code…" className="flex-1 text-xs outline-none bg-transparent text-gray-700 placeholder-gray-300" />
          {recherche && <button onClick={() => setRecherche('')} className="text-gray-300 hover:text-gray-500 text-xs leading-none">✕</button>}
        </div>

        {operateursDispo.length > 0 && (
          <div className="relative">
            <button onClick={() => setFiltreOpOuvert(v => !v)} className={`flex items-center gap-1.5 text-xs border rounded-lg px-2.5 py-1.5 transition-colors ${filtreOp !== 'tous' ? 'border-ockham-teal text-ockham-teal bg-ockham-teal-muted' : 'border-gray-200 text-gray-400 hover:border-gray-300 bg-white'}`}>
              <IcSliders size={12} />
              <span className="font-semibold">{filtreOp !== 'tous' ? opMap.get(filtreOp) : 'Opérateur'}</span>
            </button>
            {filtreOpOuvert && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setFiltreOpOuvert(false)} />
                <div className="absolute top-full mt-1 right-0 bg-white border border-gray-200 rounded-xl shadow-lg z-40 min-w-[160px] py-1">
                  <button onClick={() => { onFiltreOpChange('tous'); setFiltreOpOuvert(false) }} className={`w-full text-left text-xs px-3 py-2 hover:bg-gray-50 transition-colors ${filtreOp === 'tous' ? 'font-semibold text-ockham-teal' : 'text-gray-600'}`}>Tous les opérateurs</button>
                  {operateursDispo.map(o => (
                    <button key={o.id} onClick={() => { onFiltreOpChange(o.id); setFiltreOpOuvert(false) }} className={`w-full text-left text-xs px-3 py-2 hover:bg-gray-50 transition-colors ${filtreOp === o.id ? 'font-semibold text-ockham-teal' : 'text-gray-600'}`}>{o.nom}</button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {onglet === 'en_cours' && nbAlertes > 0 && (
          <button
            onClick={() => setAlertesSeulement(v => !v)}
            className={`ml-auto flex items-center gap-1.5 text-xs font-semibold border rounded-lg px-3 py-1.5 transition-colors ${alertesSeulement ? 'border-amber-400 text-amber-700 bg-amber-50' : 'border-amber-200 text-amber-600 hover:border-amber-300 bg-white'}`}
          >
            <IcAlerte /> Alertes uniquement ({nbAlertes})
          </button>
        )}
      </div>

      {/* Table */}
      {filtrees.length === 0 ? (
        <div className="py-10 text-center text-sm text-gray-400">
          {relances.length === 0 ? 'Aucune relance dans cet onglet' : 'Aucune relance pour ce filtre'}
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th onClick={() => toggleTri('code_client')} className={TH}>Code{fleche('code_client')}</th>
              <th onClick={() => toggleTri('nom_client')} className={TH}>Client{fleche('nom_client')}</th>

              {onglet === 'en_cours' && <>
                <th onClick={() => toggleTri('montant')} className={`${TH} text-right`}>Montant{fleche('montant')}</th>
                <th onClick={() => toggleTri('envoyee_le')} className={TH}>Envoyée le{fleche('envoyee_le')}</th>
                <th onClick={() => toggleTri('jours')} className={TH}>Âge{fleche('jours')}</th>
                <th className={TH}>État</th>
              </>}
              {onglet === 'payee' && <>
                <th onClick={() => toggleTri('montant')} className={`${TH} text-right`}>Relancé{fleche('montant')}</th>
                <th className={`${TH} text-right`}>Encaissé</th>
                <th className={TH}>Recouvrement</th>
              </>}
              {onglet === 'sans_suite' && <>
                <th onClick={() => toggleTri('montant')} className={`${TH} text-right`}>Montant{fleche('montant')}</th>
                <th onClick={() => toggleTri('envoyee_le')} className={TH}>Envoyée le{fleche('envoyee_le')}</th>
                <th onClick={() => toggleTri('jours')} className={TH}>J+{fleche('jours')}</th>
              </>}

              <th onClick={() => toggleTri('operateur')} className={TH}>Op.{fleche('operateur')}</th>
              {peutModifier && <th className="px-3 py-3 w-10" />}
            </tr>
          </thead>
          <tbody>
            {affichees.map(r => {
              const jours = r.envoyee_le ? joursDepuis(r.envoyee_le) : null
              const alerte = estEnAlerte(r, seuilSansSuite)
              const restant = jours !== null ? seuilSansSuite - jours : null
              return (
                <tr key={r.id} onClick={() => setRelanceOuverteId(r.id)} className="transition-colors cursor-pointer border-t border-gray-50 first:border-t-0 hover:bg-gray-50/40">
                  {/* Code */}
                  <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                    <button onClick={() => navigate(`/compte-client?client=${r.code_client}`)} className="group/code flex items-center gap-1 font-mono text-xs text-ockham-teal">
                      {r.code_client}
                      <svg className="w-3 h-3 opacity-0 group-hover/code:opacity-100 transition-opacity" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 6h8M7 3l3 3-3 3"/></svg>
                    </button>
                  </td>
                  {/* Client */}
                  <td className="px-3 py-2.5 text-xs font-medium text-gray-700 max-w-[180px] truncate">
                    {clientsMap.get(r.code_client) ?? '—'}
                  </td>

                  {/* En cours */}
                  {onglet === 'en_cours' && <>
                    <td className="px-3 py-2.5 text-xs tabular-nums text-gray-600 text-right whitespace-nowrap">
                      {getMontant(r) > 0 ? fmtEuros(getMontant(r)) : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-gray-400 whitespace-nowrap">
                      {r.envoyee_le ? fmtDate(r.envoyee_le) : '—'}
                    </td>
                    <td className="px-3 py-2.5">
                      {jours !== null
                        ? <span className={`text-[11px] font-bold tabular-nums ${alerte ? 'text-red-600' : jours >= 14 ? 'text-amber-600' : 'text-gray-500'}`}>J+{jours}</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      {alerte && restant !== null
                        ? <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded border border-amber-300 bg-amber-50 text-amber-700 whitespace-nowrap"><IcAlerte /> J-{restant} avant sans suite</span>
                        : <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded border border-ockham-teal/30 bg-ockham-teal-muted text-ockham-teal-dark whitespace-nowrap">En cours</span>}
                    </td>
                  </>}

                  {/* Payées */}
                  {onglet === 'payee' && <>
                    <td className="px-3 py-2.5 text-xs tabular-nums text-gray-400 text-right line-through whitespace-nowrap">
                      {r.solde_snapshot > 0 ? fmtEuros(r.solde_snapshot) : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-xs tabular-nums font-semibold text-right whitespace-nowrap" style={{ color: '#059669' }}>
                      {fmtEuros(getEncaisse(r))}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden max-w-[64px]">
                          <div className="h-full rounded-full" style={{ width: `${Math.min(100, getPct(r))}%`, background: '#10B981' }} />
                        </div>
                        <span className="text-[11px] font-bold tabular-nums" style={{ color: '#059669' }}>{fmtPct(getPct(r))}</span>
                      </div>
                    </td>
                  </>}

                  {/* Sans suite */}
                  {onglet === 'sans_suite' && <>
                    <td className="px-3 py-2.5 text-xs tabular-nums text-gray-600 text-right whitespace-nowrap">
                      {getMontant(r) > 0 ? fmtEuros(getMontant(r)) : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-gray-400 whitespace-nowrap">
                      {r.envoyee_le ? fmtDate(r.envoyee_le) : '—'}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="text-[11px] font-bold tabular-nums text-red-600">
                        {jours !== null ? `J+${jours}` : '—'}
                      </span>
                    </td>
                  </>}

                  {/* Opérateur */}
                  <td className="px-3 py-2.5">
                    {opMap.get(r.operateur_id)
                      ? <span className="text-[10px] font-bold text-ockham-navy/50 bg-ockham-teal-muted px-1.5 py-0.5 rounded tracking-wide">{opMap.get(r.operateur_id)}</span>
                      : <span className="text-gray-300">—</span>}
                  </td>

                  {/* Archive */}
                  {peutModifier && (
                    <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                      <button onClick={() => onArchiver(r.id)} title="Archiver" className="w-5 h-5 rounded-full border border-red-200 bg-red-50/60 flex items-center justify-center text-red-300 hover:text-red-500 hover:bg-red-100 hover:border-red-300 transition-colors">
                        <span className="text-[9px] leading-none font-bold">✕</span>
                      </button>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      <ModalDetailRelance
        relance={relanceOuverte}
        onFermer={() => setRelanceOuverteId(null)}
        onMajStatut={onMajStatut}
        onArchiver={onArchiver}
        onSauvegarderNote={onSauvegarderNote}
        commentaires={commentaires}
        onSauvegarderCommentaire={onSauvegarderCommentaire}
      />
    </div>
  )
}
