// Onglet Auto — ce que le robot a envoyé.
//
// Un canal à part, et non une colonne de plus dans les onglets existants : une
// relance automatique n'appelle pas la même suite qu'un geste humain. Les
// mélanger aurait fait disparaître la distinction au moment où elle compte.
//
// Une ligne = un email, pas une facture. Le journal du robot porte une ligne
// par facture ; le regroupement se fait dans useRelances, sur le resend_id.
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppData } from '../../contexts/AppDataContext'
import type { EnvoiAuto } from '../../hooks/useRelances'
import type { CommentaireFacture } from '../../types/client'
import { ModalEnvoiAuto } from './ModalEnvoiAuto'
import { Pagination } from '../Pagination'

interface Props {
  envois: EnvoiAuto[]
  chargement: boolean
  recherche?: string
  commentaires: Map<string, CommentaireFacture>
  onSauvegarderCommentaire: (data: {
    numero_piece: string; contact: string; date_contact: string
    commentaire: string; operateur: string; ne_pas_relancer?: boolean
  }) => Promise<boolean>
}

function euros(n: number) {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

function BadgeStatut({ statut }: { statut: EnvoiAuto['statut'] }) {
  const style = statut === 'envoye' ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : statut === 'bounce'           ? 'bg-red-50 text-red-700 border-red-200'
    : 'bg-amber-50 text-amber-700 border-amber-200'
  const label = statut === 'envoye' ? 'Envoyé' : statut === 'bounce' ? 'Rebond' : 'Erreur'
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${style}`}>{label}</span>
}

const PAGE_SIZE = 50

export function TableRelancesAuto({ envois, chargement, recherche = '', commentaires, onSauvegarderCommentaire }: Props) {
  const navigate = useNavigate()
  const { clients } = useAppData()
  const clientsMap = useMemo(() => new Map(clients.map(c => [c.code_dso, c.nom])), [clients])
  const [page, setPage] = useState(0)
  const [ouvert, setOuvert] = useState<EnvoiAuto | null>(null)

  const filtres = useMemo(() => {
    const q = recherche.trim().toLowerCase()
    if (!q) return envois
    return envois.filter(e =>
      e.code_client.toLowerCase().includes(q) ||
      (clientsMap.get(e.code_client) ?? '').toLowerCase().includes(q) ||
      (e.contact_email ?? '').toLowerCase().includes(q) ||
      e.numeros.some(n => n.toLowerCase().includes(q))
    )
  }, [envois, recherche, clientsMap])

  const nbPages  = Math.max(1, Math.ceil(filtres.length / PAGE_SIZE))
  const visibles = filtres.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const TH = 'text-[10px] font-bold uppercase tracking-wider text-gray-400 px-4 py-2.5 text-left whitespace-nowrap'
  const TD = 'px-4 py-3 border-b border-slate-50'

  if (chargement) {
    return <div className="py-14 text-center text-sm text-gray-400">Chargement…</div>
  }
  if (!envois.length) {
    return (
      <div className="py-14 px-6 text-center">
        <p className="text-sm text-gray-500 font-medium">Aucun envoi automatique.</p>
        <p className="text-[11.5px] text-gray-400 mt-2 max-w-xl mx-auto leading-relaxed">
          Le robot n'a encore rien envoyé, ou le mode automatique n'est pas activé.
          Son réglage est dans Paramètres des relances, onglet Mode Auto.
        </p>
      </div>
    )
  }

  return (
    <>
      <table className="w-full">
        <thead>
          <tr className="bg-gray-50/60 border-b border-gray-100">
            <th className={TH}>Code</th>
            <th className={TH}>Client</th>
            <th className={`${TH} text-right`}>Nb factures</th>
            <th className={`${TH} text-right`}>Montant relance</th>
            <th className={TH}>Statut</th>
          </tr>
        </thead>
        <tbody>
          {visibles.map(e => (
            <tr key={e.cle} onClick={() => setOuvert(e)}
                className="cursor-pointer hover:bg-ockham-teal-muted transition-colors">
              {/* Le code mene au compte client, la ligne ouvre l'envoi : deux
                  destinations distinctes, donc on arrete la propagation. */}
              <td className={TD} onClick={ev => ev.stopPropagation()}>
                <button
                  onClick={() => navigate(`/compte-client?client=${encodeURIComponent(e.code_client)}`)}
                  className="font-mono text-xs text-ockham-teal hover:text-ockham-teal-dark hover:underline transition-colors"
                >
                  {e.code_client}
                </button>
              </td>
              <td className={TD}>
                <span className="text-sm font-semibold text-gray-800">
                  {clientsMap.get(e.code_client) ?? e.code_client}
                </span>
              </td>
              <td className={`${TD} text-right`}>
                <span className="text-xs tabular-nums text-gray-500" title={e.numeros.join(', ')}>
                  {e.numeros.length}
                </span>
              </td>
              <td className={`${TD} text-right text-sm font-bold tabular-nums text-gray-800`}>
                {euros(e.montant_total)}
              </td>
              <td className={TD}><BadgeStatut statut={e.statut} /></td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/40">
        <span className="text-[11px] text-gray-400 tabular-nums">
          {filtres.length} envoi{filtres.length > 1 ? 's' : ''}
        </span>
      </div>

      <Pagination page={page} total={nbPages} onChange={setPage} />

      <ModalEnvoiAuto
        envoi={ouvert}
        nomClient={ouvert ? (clientsMap.get(ouvert.code_client) ?? ouvert.code_client) : ""}
        commentaires={commentaires}
        onSauvegarderCommentaire={onSauvegarderCommentaire}
        onFermer={() => setOuvert(null)}
      />
    </>
  )
}
