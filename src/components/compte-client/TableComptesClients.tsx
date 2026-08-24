// Vue principale : une ligne par client, expandable pour voir les factures
import { useState, useEffect, useRef } from 'react'
import toast from 'react-hot-toast'
import { joursDepuis, SEUIL_SANS_SUITE_DEFAUT } from '../../hooks/useRelances'
import type { CompteClient, FactureDetail, StatutFacture, CommentaireFacture } from '../../types/client'
import { LignesFactures } from './LignesFactures'
import { Pagination } from '../Pagination'
import { useRole } from '../../contexts/RoleContext'

interface Props {
  clients: CompteClient[]
  chargement: boolean
  recherche: string
  getFactures: (code: string) => FactureDetail[]
  estChargement: (code: string) => boolean
  onExpand: (code: string) => void
  onChargerHistorique: (code: string) => void
  estHistoriqueCharge: (code: string) => boolean
  onStatutChange: (numero: string, statut: StatutFacture | null) => void
  onHistorique: (fac: FactureDetail) => void
  onOptions: (client: CompteClient) => void
  onRelancer: (client: CompteClient) => void
  onCompenser?: (client: CompteClient) => void
  dernieresRelances?: Map<string, string>
  commentaires?: Map<string, CommentaireFacture>
  onOuvrirCommentaire?: (fac: FactureDetail) => void
  modeSelection?: boolean
  selection?: Set<string>
  onToggleSelection?: (code: string) => void
  onSelectionnerPage?: (codes: string[]) => void
  creditParClient?: Map<string, number>
  nbPiecesParClient?: Map<string, number>
  onToggleASuivre?: (codeDso: string) => void
}

const PAGE_SIZE = 25

function fmt(n: number) {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

function classeScore(note: number) {
  if (note <= 40) return { bar: 'bg-[#4CC5BB]', txt: 'text-[#0D9488]' }
  if (note <= 70) return { bar: 'bg-[#E8B888]', txt: 'text-[#C07840]' }
  return { bar: 'bg-red-400', txt: 'text-red-600' }
}

type EtatRelance = 'a_relancer' | 'recente' | 'sans_suite' | 'aucune_facture'
const RELANCE_ETATS_TOUS = new Set<EtatRelance>(['a_relancer', 'recente', 'sans_suite', 'aucune_facture'])

const STATUT_LABELS: Record<string, string> = {
  sauvegarde:   'Sauvegarde',
  liquidation:  'Liquidation',
  redressement: 'Redressement',
  cloture:      'Clôture',
}
const STATUT_CLASSES: Record<string, string> = {
  sauvegarde:   'bg-amber-50 border-amber-200 text-amber-700',
  liquidation:  'bg-red-50 border-red-200 text-red-700',
  redressement: 'bg-orange-50 border-orange-200 text-orange-700',
  cloture:      'bg-gray-50 border-gray-200 text-gray-500',
}
const STATUT_ICONES = {
  liquidation:  () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>,
  redressement: () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  sauvegarde:   () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  cloture:      () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>,
}

type SortDir = 'asc' | 'desc'

function sortRows<T extends Record<string, unknown>>(data: T[], col: keyof T, dir: SortDir): T[] {
  return [...data].sort((a, b) => {
    const av = a[col] ?? '', bv = b[col] ?? ''
    const cmp = typeof av === 'number' && typeof bv === 'number'
      ? av - bv
      : String(av).localeCompare(String(bv), 'fr-FR', { numeric: true })
    return dir === 'asc' ? cmp : -cmp
  })
}

function ColTh({ label, col, sort, dir, onSort, align = 'left' }: {
  label: string; col: string
  sort: string; dir: SortDir
  onSort: (col: string) => void
  align?: 'left' | 'right' | 'center'
}) {
  const active = sort === col
  const alignCls = align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start'
  return (
    <th
      onClick={() => onSort(col)}
      className={`px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider cursor-pointer select-none hover:text-gray-600 transition-colors ${active ? 'text-ockham-teal' : 'text-gray-400'}`}
    >
      <span className={`flex items-center gap-1 ${alignCls}`}>
        {label}
        <span className={`text-[9px] ${active ? 'text-ockham-teal' : 'text-gray-300'}`}>
          {active ? (dir === 'asc' ? '▲' : '▼') : '⬍'}
        </span>
      </span>
    </th>
  )
}

function fmtEurosEncours(n: number): string {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

function joursAnciennete(f: FactureDetail): number {
  const ref = f.date_echeance || f.date_emission
  if (!ref) return 0
  return Math.max(0, Math.floor((Date.now() - new Date(ref).getTime()) / 86_400_000))
}

async function copierEncours(c: CompteClient, factures: FactureDetail[]) {
  const date = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
  const lignes = factures.filter(f => Math.abs(f.reste_du) > 0.005)
  const total = lignes.reduce((s, f) => s + f.reste_du, 0)

  function couleurRestant(f: FactureDetail): string {
    if (f.est_avoir) return '#059669'
    const j = joursAnciennete(f)
    if (j > 60) return '#DC2626'
    if (j > 30) return '#D97706'
    return '#111827'
  }

  const lignesHTML = lignes.map(f => {
    const jours = joursAnciennete(f)
    const clr = couleurRestant(f)
    const type = f.est_avoir ? 'A' : 'F'
    const bgType = f.est_avoir ? '#D1FAE5' : '#E6F7F5'
    const txtType = f.est_avoir ? '#059669' : '#0D9488'
    return `<tr>
      <td style="padding:7px 12px;border-bottom:1px solid #F3F4F6;font-family:monospace;font-size:12px;font-weight:700;color:#0D9488;">${f.numero_piece}</td>
      <td style="padding:7px 8px;border-bottom:1px solid #F3F4F6;text-align:center;">
        <span style="display:inline-block;background:${bgType};color:${txtType};border-radius:3px;padding:1px 5px;font-size:10px;font-weight:700;">${type}</span>
      </td>
      <td style="padding:7px 14px 7px 12px;border-bottom:1px solid #F3F4F6;text-align:right;font-size:12px;color:#374151;font-weight:600;">${fmtEurosEncours(f.montant_ttc)}</td>
      <td style="padding:7px 14px 7px 12px;border-bottom:1px solid #F3F4F6;text-align:right;font-size:12px;font-weight:700;color:${clr};">${fmtEurosEncours(f.reste_du)}</td>
      <td style="padding:7px 12px;border-bottom:1px solid #F3F4F6;text-align:center;font-size:11px;color:${clr};font-weight:600;">${jours}j</td>
    </tr>`
  }).join('')

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:660px;">
  <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:0;">
    <tr><td style="padding:14px 18px;background:#0E1A2B;">
      <p style="margin:0;font-size:15px;font-weight:700;color:#FFFFFF;">${c.nom}</p>
      <p style="margin:4px 0 0;font-size:11px;color:#9CA3AF;">Code client : ${c.code_dso} · Encours au ${date}</p>
    </td></tr>
  </table>
  <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #E5E7EB;border-top:none;">
    <thead>
      <tr style="background:#F9FAFB;">
        <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;color:#6B7280;border-bottom:1px solid #E5E7EB;">N° Facture</th>
        <th style="padding:8px 8px;text-align:center;font-size:10px;font-weight:700;text-transform:uppercase;color:#6B7280;border-bottom:1px solid #E5E7EB;">Type</th>
        <th style="padding:8px 14px 8px 12px;text-align:right;font-size:10px;font-weight:700;text-transform:uppercase;color:#6B7280;border-bottom:1px solid #E5E7EB;">Montant TTC</th>
        <th style="padding:8px 14px 8px 12px;text-align:right;font-size:10px;font-weight:700;text-transform:uppercase;color:#6B7280;border-bottom:1px solid #E5E7EB;">Restant dû</th>
        <th style="padding:8px 12px;text-align:center;font-size:10px;font-weight:700;text-transform:uppercase;color:#6B7280;border-bottom:1px solid #E5E7EB;">Ancienneté</th>
      </tr>
    </thead>
    <tbody>${lignesHTML}</tbody>
    <tfoot>
      <tr style="background:#F9FAFB;">
        <td colspan="3" style="padding:10px 14px 10px 12px;text-align:right;font-size:11px;font-weight:700;color:#6B7280;border-top:2px solid #D1D5DB;">Total restant dû</td>
        <td style="padding:10px 14px 10px 12px;text-align:right;font-size:14px;font-weight:800;color:#0E1A2B;border-top:2px solid #D1D5DB;">${fmtEurosEncours(total)}</td>
        <td style="border-top:2px solid #D1D5DB;"></td>
      </tr>
    </tfoot>
  </table>
  <p style="margin:6px 0 0;font-size:10px;color:#9CA3AF;text-align:right;">Généré via Ockham · ${date}</p>
</div>`

  const sep = '─'.repeat(68)
  const plainText = [
    `ENCOURS CLIENT — ${c.nom} (${c.code_dso})`,
    `État au ${date}`,
    sep,
    `  ${'N° Facture'.padEnd(16)} T   ${'Montant TTC'.padStart(13)}   ${'Restant dû'.padStart(13)}   Ancien.`,
    sep,
    ...lignes.map(f => {
      const type = f.est_avoir ? 'A' : 'F'
      return `  ${f.numero_piece.padEnd(16)} ${type}   ${fmtEurosEncours(f.montant_ttc).padStart(13)}   ${fmtEurosEncours(f.reste_du).padStart(13)}   ${joursAnciennete(f)}j`
    }),
    sep,
    `  ${'Total restant dû'.padEnd(22)}${''.padStart(13)}   ${fmtEurosEncours(total).padStart(13)}`,
    '',
    `Généré via Ockham · ${date}`,
  ].join('\n')

  try {
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([plainText], { type: 'text/plain' }),
      }),
    ])
  } catch {
    await navigator.clipboard.writeText(plainText)
  }
  toast.success(`Encours ${c.nom} copié`)
}

export function TableComptesClients({ clients, chargement, recherche, getFactures, estChargement, onExpand, onChargerHistorique, estHistoriqueCharge, onStatutChange, onHistorique, onOptions, onRelancer, onCompenser, dernieresRelances, commentaires, onOuvrirCommentaire, modeSelection = false, selection = new Set(), onToggleSelection, onSelectionnerPage, creditParClient, nbPiecesParClient, onToggleASuivre }: Props) {
  const { peutModifier } = useRole()
  const [ouvert, setOuvert] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const [sortCol, setSortCol] = useState<string>('encours_total')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [filtreAlertes, setFiltreAlertes] = useState(false)
  const [filtreASuivre, setFiltreASuivre] = useState(false)
  const [pendingUnfollow, setPendingUnfollow] = useState<string | null>(null)
  const [filtresRelance, setFiltresRelance] = useState<Set<EtatRelance>>(new Set(RELANCE_ETATS_TOUS))
  const [relancePopupOpen, setRelancePopupOpen] = useState(false)
  const relancePopupPos = useRef<{ top: number; left: number }>({ top: 0, left: 0 })
  const relancePopupRef = useRef<HTMLDivElement>(null)
  const checkboxToutRef = useRef<HTMLInputElement>(null)

  const nbAlertes = clients.filter(c => c.relance_auto_alerte).length

  // Réinitialiser la page uniquement quand la recherche change (pas lors d'un refresh data)
  useEffect(() => { setPage(0) }, [recherche])
  // Fermer le panneau ouvert uniquement si le client n'est plus dans la liste
  useEffect(() => { if (ouvert && !clients.find(c => c.code_dso === ouvert)) setOuvert(null) }, [clients, ouvert])
  useEffect(() => {
    if (!relancePopupOpen) return
    function onClickOutside(e: MouseEvent) {
      if (relancePopupRef.current && !relancePopupRef.current.contains(e.target as Node)) setRelancePopupOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [relancePopupOpen])

  function toggle(code: string) {
    if (modeSelection) { onToggleSelection?.(code); return }
    if (ouvert === code) { setOuvert(null) }
    else { setOuvert(code); onExpand(code) }
  }

  function handleSort(col: string) {
    setSortCol(prev => {
      if (prev === col) {
        setSortDir(d => d === 'asc' ? 'desc' : 'asc')
        return col
      }
      setSortDir('desc')
      return col
    })
    setPage(0)
  }

  // Ces calculs et ce hook doivent rester AVANT les early returns pour ne jamais
  // modifier le nombre de hooks appelés entre deux rendus (règle React).
  function etatRelance(c: CompteClient): EtatRelance {
    if (c.nb_impayees === 0) return 'aucune_facture'
    const derniere = dernieresRelances?.get(c.code_dso)
    if (!derniere) return 'a_relancer'
    const jours = joursDepuis(derniere)
    if (jours < SEUIL_SANS_SUITE_DEFAUT) return 'recente'
    return 'sans_suite'
  }
  function toggleRelance(v: EtatRelance) {
    setFiltresRelance(prev => { const next = new Set(prev); if (next.has(v)) next.delete(v); else next.add(v); return next })
    setPage(0)
  }
  const clientsFiltres = clients
    .filter(c => !filtreAlertes || c.relance_auto_alerte)
    .filter(c => !filtreASuivre || c.a_suivre)
    .filter(c => filtresRelance.size === 4 || filtresRelance.has(etatRelance(c)))
  const clientsTries = sortRows(clientsFiltres as unknown as Record<string, unknown>[], sortCol, sortDir) as unknown as CompteClient[]
  const nbPages = Math.ceil(clientsTries.length / PAGE_SIZE)
  const clientsPage = clientsTries.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const thProps = { sort: sortCol, dir: sortDir, onSort: handleSort }

  const tousPageCoches = modeSelection && clientsPage.length > 0 && clientsPage.every(c => selection.has(c.code_dso))
  const quelquesPageCoches = modeSelection && clientsPage.some(c => selection.has(c.code_dso)) && !tousPageCoches
  useEffect(() => {
    if (checkboxToutRef.current) checkboxToutRef.current.indeterminate = quelquesPageCoches
  }, [quelquesPageCoches])

  if (chargement) return <div className="bg-white border border-gray-200 rounded-xl shadow-sm flex items-center justify-center py-16 text-sm text-gray-400">Chargement…</div>
  if (!clients.length) return <div className="bg-white border border-gray-200 rounded-xl shadow-sm flex items-center justify-center py-16 text-sm text-gray-400">Aucun client trouvé.</div>

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-x-clip min-h-[1400px]">
      {nbAlertes > 0 && (
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 bg-amber-50">
          <span className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" />
          <span className="text-xs text-amber-700 font-medium flex-1">
            {nbAlertes} client{nbAlertes > 1 ? 's' : ''} avec une alerte de contact
          </span>
          <button
            onClick={() => { setFiltreAlertes(f => !f); setPage(0) }}
            className={`text-[11px] font-semibold px-2.5 py-1 rounded-md border transition-colors ${
              filtreAlertes
                ? 'bg-amber-500 text-white border-amber-500'
                : 'bg-white text-amber-700 border-amber-300 hover:bg-amber-100'
            }`}
          >
            {filtreAlertes ? 'Voir tous' : 'Filtrer'}
          </button>
        </div>
      )}
      <table className="w-full">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-100">
            <th className="w-10 px-3 py-2.5 text-center">
              {modeSelection && (
                <input
                  ref={checkboxToutRef}
                  type="checkbox"
                  checked={tousPageCoches}
                  onChange={() => {
                    if (tousPageCoches) onSelectionnerPage?.([])
                    else onSelectionnerPage?.(clientsPage.map(c => c.code_dso))
                  }}
                  className="accent-ockham-teal w-4 h-4 rounded cursor-pointer"
                />
              )}
            </th>
            <ColTh label="Code" col="code_dso" {...thProps} align="left" />
            <ColTh label="Nom" col="nom" {...thProps} align="left" />
            <ColTh label="Encours TTC" col="encours_total" {...thProps} align="right" />
            <ColTh label="Pièces actives" col="nb_impayees" {...thProps} align="center" />
            <ColTh label="Score Risque" col="note_risque" {...thProps} align="left" />
            <th
              onClick={() => { setFiltreASuivre(f => !f); setPage(0) }}
              className={`px-3 py-2.5 text-center cursor-pointer select-none hover:text-gray-600 transition-colors ${filtreASuivre ? 'text-ockham-teal' : 'text-gray-400'}`}
              title={filtreASuivre ? 'Voir tous les clients' : 'Filtrer : À Suivre uniquement'}
            >
              <span className="flex items-center justify-center gap-1 text-[10px] font-semibold uppercase tracking-wider">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3" {...(filtreASuivre ? { fill: 'currentColor', fillOpacity: '0.3' } : {})}/>
                </svg>
                À Suivre
                {filtreASuivre && <span className="text-[9px]">▼</span>}
              </span>
            </th>
            <ColTh label="Statut juridique" col="statut_juridique" {...thProps} align="left" />
            <ColTh label="Groupement" col="code_groupement" {...thProps} align="left" />
            <th
              onMouseDown={e => e.stopPropagation()}
              onClick={e => {
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                relancePopupPos.current = { top: rect.bottom + 4, left: Math.max(4, rect.right - 215) }
                setRelancePopupOpen(o => !o)
              }}
              className={`text-center px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider cursor-pointer select-none hover:text-gray-600 transition-colors ${filtresRelance.size < 4 ? 'text-ockham-teal' : 'text-gray-400'}`}
            >
              <span className="flex items-center justify-center gap-1">
                Relances
                <span className={`text-[9px] ${filtresRelance.size < 4 ? 'text-ockham-teal' : 'text-gray-300'}`}>{filtresRelance.size < 3 ? '▼' : '⬍'}</span>
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          {clientsPage.map(c => {
            const estOuvert = ouvert === c.code_dso
            const sc = classeScore(c.note_risque)
            const factures = getFactures(c.code_dso)
            // nb_factures_total - nb_impayees = factures entièrement réglées (stats SQL, indépendant du cache)
            const nbReglees = c.nb_factures_total - c.nb_impayees
            const estSelectionne = selection.has(c.code_dso)
            const credit = creditParClient?.get(c.code_dso) ?? 0
            const soldeNet = c.encours_total - credit
            const nbPieces = nbPiecesParClient?.get(c.code_dso) ?? c.nb_impayees
            return (
              <>
                <tr
                  key={c.code_dso}
                  onClick={() => toggle(c.code_dso)}
                  className={`cursor-pointer transition-colors border-b border-gray-50 ${
                    modeSelection
                      ? estSelectionne ? 'bg-ockham-teal-muted' : 'hover:bg-gray-50'
                      : estOuvert ? 'bg-ockham-teal-muted border-b-0' : 'hover:bg-gray-50'
                  }`}
                >
                  <td className="px-3 py-3 text-center" onClick={e => { e.stopPropagation(); toggle(c.code_dso) }}>
                    {modeSelection ? (
                      <input
                        type="checkbox"
                        checked={estSelectionne}
                        onChange={() => onToggleSelection?.(c.code_dso)}
                        className="accent-ockham-teal w-4 h-4 rounded cursor-pointer"
                      />
                    ) : (
                      <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] transition-transform ${estOuvert ? 'bg-ockham-teal text-white rotate-90' : 'bg-gray-100 text-gray-500'}`}>▶</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <span className="font-mono text-xs font-bold text-ockham-teal bg-ockham-teal-muted px-2 py-0.5 rounded">{c.code_dso}</span>
                  </td>
                  <td className="px-3 py-3">
                    <span className="text-sm font-semibold text-gray-800 line-clamp-2">{c.nom}</span>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <span className={`font-mono font-bold text-sm tabular-nums whitespace-nowrap ${soldeNet > 0 ? 'text-gray-900' : 'text-gray-400'}`}>{fmt(soldeNet)}</span>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <span className={`text-sm font-bold tabular-nums ${nbPieces > 0 ? 'text-gray-800' : 'text-gray-300'}`}>{nbPieces}</span>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-14 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${sc.bar}`} style={{ width: `${c.note_risque}%` }} />
                      </div>
                      <span className={`text-xs font-bold tabular-nums ${sc.txt}`}>{c.note_risque}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <button
                      onClick={e => { e.stopPropagation(); c.a_suivre ? setPendingUnfollow(c.code_dso) : onToggleASuivre?.(c.code_dso) }}
                      disabled={!peutModifier || !onToggleASuivre}
                      title={c.a_suivre ? 'Retirer de "À Suivre"' : 'Marquer À Suivre'}
                      className={`p-1 rounded transition-colors ${
                        c.a_suivre
                          ? 'text-ockham-teal'
                          : 'text-gray-300 hover:text-ockham-teal'
                      } ${(!peutModifier || !onToggleASuivre) ? 'cursor-default' : 'cursor-pointer'}`}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={c.a_suivre ? '2.5' : '2'} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                        <circle cx="12" cy="12" r="3" {...(c.a_suivre ? { fill: 'currentColor', fillOpacity: '0.35' } : {})}/>
                      </svg>
                    </button>
                  </td>
                  <td className="px-3 py-3">
                    {c.statut_juridique ? (() => {
                      const Icon = STATUT_ICONES[c.statut_juridique!]
                      return (
                        <span className={`inline-flex items-center gap-1.5 text-[10px] font-medium px-2 py-0.5 rounded border ${STATUT_CLASSES[c.statut_juridique!]}`}>
                          {Icon && <Icon />}
                          {STATUT_LABELS[c.statut_juridique!]}
                        </span>
                      )
                    })() : (
                      <span className="text-[10px] text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    {c.code_groupement ? (
                      <span className="font-mono text-[11px] bg-gray-50 text-gray-500 px-2 py-0.5 rounded border border-gray-200">{c.code_groupement}</span>
                    ) : <span className="text-[10px] text-gray-300">—</span>}
                  </td>
                  <td className="px-3 py-3 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      {peutModifier && (() => {
                        if (c.nb_impayees === 0) return (
                          <button disabled
                            className="text-[10px] font-semibold px-2.5 py-1 rounded-md border border-gray-200 text-gray-300 bg-gray-50 cursor-not-allowed"
                            title="Aucune facture impayée"
                          >
                            ✉ Relancer
                          </button>
                        )
                        const etat = etatRelance(c)
                        return (
                          <button
                            onClick={e => { e.stopPropagation(); onRelancer(c) }}
                            className={`text-[10px] font-semibold px-2.5 py-1 rounded-md border transition-all ${
                              etat === 'recente'
                                ? 'text-emerald-600 border-emerald-300 bg-emerald-50 hover:bg-emerald-100'
                                : etat === 'sans_suite'
                                ? 'border-[#C07840]/50 bg-[#F5E9D8] hover:bg-[#EDDBCA]'
                                : 'bg-ockham-teal text-white border-ockham-teal hover:bg-ockham-teal-dark'
                            }`}
                            style={etat === 'sans_suite' ? { color: '#C07840' } : undefined}
                          >
                            ✉ Relancer
                          </button>
                        )
                      })()}
                      {estOuvert && onCompenser && peutModifier && (() => {
                        const aAvoirs = factures.some(f => f.est_avoir && f.reste_du < 0)
                        if (!aAvoirs) return null
                        return (
                          <button
                            onClick={e => { e.stopPropagation(); onCompenser(c) }}
                            className="text-[10px] font-semibold text-violet-700 bg-violet-50 border border-violet-300 hover:bg-violet-100 hover:border-violet-400 px-2.5 py-1 rounded-md transition-all"
                            title="Compenser un avoir avec une ou plusieurs factures"
                          >
                            ⇄ Compenser
                          </button>
                        )
                      })()}
                      {estOuvert && (
                        <button
                          onClick={e => { e.stopPropagation(); copierEncours(c, factures) }}
                          className="text-[10px] font-semibold text-gray-600 bg-white border border-gray-300 shadow-sm px-2.5 py-1 rounded-md hover:border-ockham-teal hover:text-ockham-teal transition-all"
                          title="Copier l'encours pour un mail"
                        >
                          ⎘ Copier
                        </button>
                      )}
                      <div className="relative inline-block">
                        <button
                          onClick={e => { e.stopPropagation(); onOptions(c) }}
                          className="text-[10px] font-semibold text-gray-600 bg-white border border-gray-300 shadow-sm px-2.5 py-1 rounded-md hover:border-ockham-teal hover:text-ockham-teal transition-all"
                        >
                          ⚙ Options
                        </button>
                        {c.relance_auto_alerte && (
                          <span
                            className="absolute -top-1.5 -right-1.5 w-3 h-3 rounded-full bg-amber-500 border-2 border-white"
                            title="Problème de contact détecté — ouvrez Options › Relances pour traiter."
                          />
                        )}
                      </div>
                    </div>
                  </td>
                </tr>

                {estOuvert && !modeSelection && (
                  <tr key={`${c.code_dso}-fac`}>
                    <td colSpan={10} className="px-0 py-0 border-b border-gray-100">
                      <div className="bg-gray-50 border-l-2 border-ockham-teal ml-0 overflow-hidden">
                        {factures.length === 0 && nbReglees > 0 && !estHistoriqueCharge(c.code_dso) ? (
                          // Toutes les factures sont réglées — pas d'impayée en mémoire
                          <div className="py-3 text-center">
                            <p className="text-xs text-emerald-600 font-medium mb-2">✓ Toutes les factures sont réglées</p>
                            <button
                              onClick={e => { e.stopPropagation(); onChargerHistorique(c.code_dso) }}
                              className="text-[11px] font-medium text-ockham-teal hover:text-ockham-teal-dark hover:underline transition-colors"
                            >
                              + Charger {nbReglees} facture{nbReglees > 1 ? 's' : ''} réglée{nbReglees > 1 ? 's' : ''}
                            </button>
                          </div>
                        ) : (
                          <>
                            <LignesFactures
                              factures={factures}
                              chargement={estChargement(c.code_dso)}
                              onStatutChange={onStatutChange}
                              onHistorique={onHistorique}
                              commentaires={commentaires}
                              onOuvrirCommentaire={onOuvrirCommentaire}
                              recherche={recherche}
                              compact
                            />
                            {nbReglees > 0 && !estHistoriqueCharge(c.code_dso) && (
                              <div className="mt-2 text-center">
                                <button
                                  onClick={e => { e.stopPropagation(); onChargerHistorique(c.code_dso) }}
                                  className="text-[11px] font-medium text-ockham-teal hover:text-ockham-teal-dark hover:underline transition-colors"
                                >
                                  + Charger {nbReglees} facture{nbReglees > 1 ? 's' : ''} réglée{nbReglees > 1 ? 's' : ''}
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            )
          })}
        </tbody>
      </table>

      <Pagination page={page} total={nbPages} onChange={setPage} />

      {pendingUnfollow && (() => {
        const clientCible = clients.find(c => c.code_dso === pendingUnfollow)
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
              <div className="px-6 py-4 flex items-center gap-3" style={{ background: '#0E1A2B' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#4CC5BB" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3" fill="#4CC5BB" fillOpacity="0.3"/>
                </svg>
                <h2 className="text-sm font-bold text-white">Ne plus suivre ce client ?</h2>
              </div>
              <div className="px-5 py-5 flex flex-col items-center gap-4 text-center">
                <p className="text-xs text-gray-500 leading-relaxed">
                  Retirer <span className="font-semibold text-gray-800">{clientCible?.nom ?? pendingUnfollow}</span> de la liste "À suivre" ?
                </p>
                <div className="flex gap-2.5 justify-center">
                  <button
                    onClick={() => { onToggleASuivre?.(pendingUnfollow); setPendingUnfollow(null) }}
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[11.5px] font-semibold border border-teal-600/30 bg-teal-600/[0.07] text-teal-700 hover:bg-teal-600/[0.14] transition-colors"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    Oui, retirer
                  </button>
                  <button
                    onClick={() => setPendingUnfollow(null)}
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[11.5px] font-semibold border border-red-500/25 bg-red-500/[0.06] text-red-600 hover:bg-red-500/[0.12] transition-colors"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    Annuler
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {relancePopupOpen && (
        <div
          ref={relancePopupRef}
          className="fixed z-50 bg-white border border-gray-200 rounded-xl shadow-lg py-2 min-w-[215px]"
          style={{ top: relancePopupPos.current.top, left: relancePopupPos.current.left }}
        >
          <div className="px-4 pb-1.5 border-b border-gray-100 mb-1">
            <button
              onClick={() => { setFiltresRelance(filtresRelance.size < 4 ? new Set(RELANCE_ETATS_TOUS) : new Set()); setPage(0) }}
              className="text-[10px] font-semibold text-ockham-teal hover:text-ockham-teal-dark transition-colors cursor-pointer"
            >
              {filtresRelance.size === 4 ? 'Tout décocher' : 'Tout cocher'}
            </button>
          </div>
          <label className="flex items-center gap-2.5 px-4 py-1.5 hover:bg-gray-50 transition-colors cursor-pointer">
            <input type="checkbox" checked={filtresRelance.has('a_relancer')} onChange={() => toggleRelance('a_relancer')} className="accent-ockham-teal w-3.5 h-3.5" />
            <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-md border bg-ockham-teal text-white border-ockham-teal">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
              À relancer
            </span>
          </label>
          <label className="flex items-center gap-2.5 px-4 py-1.5 hover:bg-gray-50 transition-colors cursor-pointer">
            <input type="checkbox" checked={filtresRelance.has('recente')} onChange={() => toggleRelance('recente')} className="accent-ockham-teal w-3.5 h-3.5" />
            <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-md border bg-emerald-50 text-emerald-600 border-emerald-300">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              Relancé récemment
            </span>
          </label>
          <label className="flex items-center gap-2.5 px-4 py-1.5 hover:bg-gray-50 transition-colors cursor-pointer">
            <input type="checkbox" checked={filtresRelance.has('sans_suite')} onChange={() => toggleRelance('sans_suite')} className="w-3.5 h-3.5" style={{ accentColor: '#C07840' }} />
            <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-md border" style={{ background: '#F5E9D8', color: '#C07840', borderColor: '#C0784050' }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
              Sans suite
            </span>
          </label>
          <label className="flex items-center gap-2.5 px-4 py-1.5 hover:bg-gray-50 transition-colors cursor-pointer">
            <input type="checkbox" checked={filtresRelance.has('aucune_facture')} onChange={() => toggleRelance('aucune_facture')} className="accent-ockham-teal w-3.5 h-3.5" />
            <span className="text-[10px] font-medium text-gray-400">— Aucune facture impayée</span>
          </label>
        </div>
      )}
    </div>
  )
}
