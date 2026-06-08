// Panneau gauche : liste des lignes bancaires avec statut de lettrage
import type { LigneBancaireAvecStatut, StatutLettrage } from '../../types/lettrage'
import { IcX } from '../Icones'
import { Pagination } from '../Pagination'

interface Props {
  lignes: LigneBancaireAvecStatut[]
  chargement: boolean
  ligneActiveId: string | null
  page: number
  totalPages: number
  onPage: (p: number) => void
  onSelectLigne: (l: LigneBancaireAvecStatut) => void
  onAnnulerLettrage: (l: LigneBancaireAvecStatut) => void
  onAffecterRemboursement: (l: LigneBancaireAvecStatut) => void
  lignesExportees: Map<string, string>
  readOnly?: boolean
}

function fmt(n: number | null) {
  if (n === null) return '—'
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
}

function DotStatut({ statut }: { statut: StatutLettrage }) {
  if (statut === 'lettre')          return <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.2)]" />
  if (statut === 'partiel')         return <span className="inline-block w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_0_3px_rgba(245,158,11,0.2)]" />
  if (statut === 'non_lettre')      return <span className="inline-block w-2 h-2 rounded-full bg-red-500 shadow-[0_0_0_3px_rgba(239,68,68,0.2)]" />
  if (statut === 'en_attente_471')  return <span className="inline-block w-2 h-2 rounded-full bg-orange-400 shadow-[0_0_0_3px_rgba(251,146,60,0.2)]" />
  return <span className="inline-block w-2 h-2 rounded-full bg-gray-300" />
}


export function TableLignesBancaires({
  lignes, chargement, ligneActiveId,
  page, totalPages,
  onPage, onSelectLigne,
  onAnnulerLettrage, onAffecterRemboursement, lignesExportees,
  readOnly = false,
}: Props) {
  const hasActive = ligneActiveId !== null

  return (
    <>
      {chargement ? (
        <div className="flex items-center justify-center py-16 text-gray-400 text-sm">
          Chargement…
        </div>
      ) : lignes.length === 0 ? (
        <div className="flex items-center justify-center py-16 text-gray-400 text-sm">
          Aucune ligne bancaire trouvée.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="w-8 px-3 py-2" />
                <th className="text-left px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap">Date</th>
                <th className="text-left px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Libellé</th>
                <th className="text-right px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap">Débit</th>
                <th className="text-right px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap">Crédit</th>
                <th className="text-right px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap">Restant</th>
                <th className="w-8 px-2 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {lignes.map(ligne => {
                const isDebit = ligne.statut_lettrage === 'debit'
                const is471 = ligne.statut_lettrage === 'en_attente_471'
                const isActive = ligne.id_operation === ligneActiveId
                const isDimmed = hasActive && !isActive && !isDebit
                // Identifie les lignes bancaires débit (y compris celles devenues 'lettre' après affectation)
                const isBankDebit = (ligne.debit !== null && ligne.debit > 0) || (ligne.credit === null || ligne.credit <= 0)

                return (
                  <tr
                    key={ligne.id_operation}
                    onClick={() => { if (readOnly) return; isDebit ? onAffecterRemboursement(ligne) : onSelectLigne(ligne) }}
                    className={`transition-all ${readOnly ? 'cursor-default' : 'cursor-pointer'} ${
                      isDebit ? 'bg-blue-50/40 hover:bg-blue-50' :
                      isActive && is471 ? 'bg-orange-50 border-l-[3px] border-orange-400' :
                      isActive ? 'bg-ockham-teal-muted border-l-[3px] border-ockham-teal' :
                      isDimmed ? 'opacity-30' :
                      isDebit ? 'hover:bg-blue-50' : 'hover:bg-ockham-teal/5'
                    }`}
                  >

                    <td className="px-3 py-3 text-center">
                      <DotStatut statut={ligne.statut_lettrage} />
                    </td>
                    <td className="px-3 py-3 text-xs text-gray-400 whitespace-nowrap font-mono">
                      {formatDate(ligne.date_operation)}
                    </td>
                    <td className="px-3 py-3">
                      <p className={`text-sm font-medium truncate max-w-[280px] ${isDebit ? 'text-gray-400' : 'text-gray-800'}`}>
                        {ligne.libelle}
                      </p>
                      {(ligne.infos_complementaires || ligne.detail) && (
                        <p className="text-[11px] text-gray-400 truncate max-w-[280px] mt-0.5">
                          {ligne.infos_complementaires ?? ligne.detail}
                        </p>
                      )}
                      {isDebit && (
                        <span className="inline-flex items-center bg-blue-100 text-blue-600 text-[10px] font-semibold px-1.5 py-0.5 rounded mt-0.5">
                          Débit — cliquer pour affecter un remboursement
                        </span>
                      )}
                      {ligne.statut_lettrage === 'en_attente_471' && (
                        <span className="inline-flex items-center bg-orange-50 text-orange-500 text-[10px] font-semibold px-1.5 py-0.5 rounded mt-0.5">
                          En attente 471
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right text-sm text-red-500 font-mono whitespace-nowrap">
                      {ligne.debit !== null ? fmt(ligne.debit) : '—'}
                    </td>
                    <td className="px-3 py-3 text-right text-sm font-medium text-gray-700 font-mono whitespace-nowrap">
                      {ligne.credit !== null ? fmt(ligne.credit) : '—'}
                    </td>
                    <td className="px-3 py-3 text-right text-sm font-semibold font-mono whitespace-nowrap">
                      {isDebit ? (
                        <span className="text-gray-300">—</span>
                      ) : ligne.restant <= 0.005 ? (
                        <span className="text-emerald-600">0,00</span>
                      ) : (
                        <span className={ligne.statut_lettrage === 'partiel' ? 'text-amber-600' : 'text-blue-600'}>
                          {fmt(ligne.restant)}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-3 text-center" onClick={e => e.stopPropagation()}>
                      {!readOnly && (ligne.statut_lettrage === 'lettre' || ligne.statut_lettrage === 'partiel' || ligne.statut_lettrage === 'en_attente_471') && !isBankDebit && (
                        lignesExportees.has(ligne.id_operation) ? (
                          <span
                            title="Export comptable effectué — correction via le module Correction"
                            className="inline-flex items-center text-[9px] font-semibold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded whitespace-nowrap cursor-not-allowed"
                          >
                            Exporté
                          </span>
                        ) : (
                          <button
                            onClick={() => onAnnulerLettrage(ligne)}
                            title="Annuler ce lettrage"
                            className="inline-flex items-center justify-center w-8 h-8 rounded hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors cursor-pointer"
                          >
                            <IcX size={13} />
                          </button>
                        )
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {!chargement && <Pagination page={page} total={totalPages} onChange={onPage} />}
    </>
  )
}
