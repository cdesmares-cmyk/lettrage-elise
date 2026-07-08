import { useMemo, useState } from 'react'
import { IcFileText } from '../Icones'
import { useAppData } from '../../contexts/AppDataContext'
import type { Relance } from '../../hooks/useRelances'
import type { CompteClient, CommentaireFacture } from '../../types/client'

function joursDepuis(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}

function scorePriorite(encours: number, ancMax: number, joursSansRelance: number, hasSansReponse: boolean): number {
  const jsr = Math.min(joursSansRelance, 365)
  const base = (ancMax / 30) * 2 + encours / 1000 + jsr / 7
  return hasSansReponse ? base * 1.3 : base
}

function fmtEuros(n: number): string {
  return n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
}

function badgeAnc(j: number) {
  if (j > 90) return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700">{j}j</span>
  if (j > 60) return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">{j}j</span>
  return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{j}j</span>
}

export type ModePriorite = 'score' | 'encours' | 'anciennete'

const ONGLETS: { val: ModePriorite; label: string }[] = [
  { val: 'score',      label: 'Score' },
  { val: 'encours',    label: 'Encours' },
  { val: 'anciennete', label: 'Ancienneté' },
]

interface Props {
  relances: Relance[]
  onRelancer: (client: CompteClient) => void
  commentaires?: Map<string, CommentaireFacture>
}

export function ListePriorites({ relances, onRelancer, commentaires }: Props) {
  const [mode, setMode] = useState<ModePriorite>('score')
  const { clients, facturesActives } = useAppData()

  const SEUIL_ALERTE = 10

  const priorites = useMemo(() => {
    const derniereRelance: Record<string, string> = {}
    const clientsAvecSansReponse = new Set<string>()
    const clientsEnAlerte = new Set<string>()

    for (const r of relances) {
      if (r.statut === 'sans_reponse') clientsAvecSansReponse.add(r.code_client)
      if (r.statut !== 'brouillon' && r.envoyee_le) {
        if (!derniereRelance[r.code_client] || r.envoyee_le > derniereRelance[r.code_client]) {
          derniereRelance[r.code_client] = r.envoyee_le
        }
      }
      if (
        r.statut === 'sans_reponse' ||
        (r.statut === 'envoyee' && r.envoyee_le != null && joursDepuis(r.envoyee_le) > SEUIL_ALERTE)
      ) {
        clientsEnAlerte.add(r.code_client)
      }
    }

    const liste = clients
      .filter(c => c.nb_impayees > 0 && c.encours_total > 0 && c.statut_juridique !== 'liquidation')
      .map(c => {
        const factures = facturesActives.filter(f =>
          f.code_client === c.code_dso && f.reste_du > 0 &&
          !commentaires?.get(f.numero_piece)?.ne_pas_relancer
        )
        const ancMax = factures.length > 0
          ? Math.max(...factures.map(f => f.date_echeance ? joursDepuis(f.date_echeance) : 0))
          : 0
        const joursSansRelance = derniereRelance[c.code_dso] ? joursDepuis(derniereRelance[c.code_dso]) : 365
        const hasSansReponse = clientsAvecSansReponse.has(c.code_dso)
        const estEnAlerte = clientsEnAlerte.has(c.code_dso)
        const hasStatut = factures.some(f => f.statut_facture != null)
        const hasCommentaire = commentaires ? factures.some(f => commentaires.has(f.numero_piece)) : false
        return {
          ...c,
          ancMax: Math.max(0, ancMax),
          joursSansRelance,
          jamsRelance: !derniereRelance[c.code_dso],
          hasSansReponse,
          estEnAlerte,
          hasStatut,
          hasCommentaire,
          score: scorePriorite(c.encours_total, Math.max(0, ancMax), joursSansRelance, hasSansReponse),
        }
      })

    liste.sort((a, b) => {
      // Clients en alerte remontent en premier dans tous les modes
      if (a.estEnAlerte !== b.estEnAlerte) return a.estEnAlerte ? -1 : 1
      if (mode === 'score')      return b.score - a.score
      if (mode === 'encours')    return b.encours_total - a.encours_total
      if (mode === 'anciennete') return b.ancMax - a.ancMax
      return 0
    })

    return liste.slice(0, 10)
  }, [clients, facturesActives, relances, commentaires, mode])

  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between gap-3">
        <p className="text-[10px] font-bold text-ockham-navy/60 uppercase tracking-wider flex-shrink-0">À relancer en priorité</p>
        <div className="flex items-center bg-gray-100 rounded-md p-0.5 gap-0.5">
          {ONGLETS.map(o => (
            <button
              key={o.val}
              onClick={() => setMode(o.val)}
              className={`text-[10px] font-semibold px-2.5 py-1 rounded transition-colors whitespace-nowrap ${
                mode === o.val ? 'bg-white text-ockham-navy shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {priorites.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-gray-400">Aucun client avec des impayés</div>
      ) : (
        <div className="divide-y divide-gray-50">
          {priorites.map((c, i) => (
            <div
              key={c.code_dso}
              className={`flex items-center gap-3 px-4 py-2.5 transition-colors group ${c.hasSansReponse ? 'bg-amber-50/40 hover:bg-amber-50' : 'hover:bg-gray-50/40'}`}
            >
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {c.estEnAlerte && <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />}
                <span className={`w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center flex-shrink-0 ${i === 0 ? 'bg-ockham-teal text-white' : 'bg-gray-100 text-gray-500'}`}>
                  {i + 1}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-gray-800 truncate">{c.nom}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <p className="text-[10px] font-mono text-gray-400">{c.code_dso}</p>
                  {c.hasSansReponse && <span className="text-[9px] font-bold text-amber-600 bg-amber-100 px-1 rounded">sans réponse</span>}
                  {c.hasStatut && <span title="Facture(s) en litige" className="text-[10px]">⚠</span>}
                  {c.hasCommentaire && <span title="Commentaire(s)" className="text-ockham-teal"><IcFileText size={10} /></span>}
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {badgeAnc(c.ancMax)}
                <span className="text-[11px] font-semibold text-gray-600 tabular-nums">{fmtEuros(c.encours_total)}</span>
              </div>
              <button
                onClick={() => onRelancer(c)}
                className="flex-shrink-0 text-[10px] font-bold px-2 py-1 rounded border border-ockham-teal/40 text-ockham-teal bg-white hover:bg-ockham-teal hover:text-white hover:border-ockham-teal transition-all opacity-0 group-hover:opacity-100"
              >
                ✉
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
