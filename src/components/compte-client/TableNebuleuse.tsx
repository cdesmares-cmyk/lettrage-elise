// Vue nébuleuse : regroupement par code_groupement avec expand factures consolidées
import React, { useState } from 'react'
import type { GroupeNebuleuse, FactureDetail, StatutFacture } from '../../types/client'
import { LignesFactures } from './LignesFactures'

interface Props {
  groupes: GroupeNebuleuse[]
  chargement: boolean
  getFactures: (codes: string[]) => FactureDetail[]
  estChargement: (codes: string[]) => boolean
  onExpand: (codes: string[]) => void
  onStatutChange: (numero: string, statut: StatutFacture | null) => void
  onHistorique: (fac: FactureDetail) => void
}

function fmt(n: number) {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

function classeScore(note: number) {
  if (note <= 40) return { bar: 'bg-emerald-500', txt: 'text-emerald-600' }
  if (note <= 70) return { bar: 'bg-amber-500', txt: 'text-amber-600' }
  return { bar: 'bg-red-500', txt: 'text-red-600' }
}

export function TableNebuleuse({ groupes, chargement, getFactures, estChargement, onExpand, onStatutChange, onHistorique }: Props) {
  const [ouvert, setOuvert] = useState<string | null>(null)

  // Un seul groupe ouvert à la fois — ferme le précédent automatiquement
  function toggle(key: string, codes: string[]) {
    setOuvert(prev => {
      if (prev === key) return null
      onExpand(codes)
      return key
    })
  }

  if (chargement) return <div className="bg-white border border-gray-200 rounded-xl shadow-sm flex items-center justify-center py-16 text-sm text-gray-400">Chargement…</div>
  if (!groupes.length) return <div className="bg-white border border-gray-200 rounded-xl shadow-sm flex items-center justify-center py-16 text-sm text-gray-400">Aucun groupe trouvé.</div>

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-100">
            <th className="w-10 px-3 py-2.5" />
            <th className="text-left px-3 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Groupe · Nom</th>
            <th className="text-right px-3 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Encours consolidé</th>
            <th className="text-center px-3 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Clients</th>
            <th className="text-center px-3 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Fac. impayées</th>
            <th className="px-3 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Score risque max</th>
            <th className="px-3 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Codes clients</th>
          </tr>
        </thead>
        <tbody>
          {groupes.map(g => {
            const estOuvert = ouvert === g.groupe_key
            const sc = classeScore(g.note_risque)
            const estGroupe = g.nb_clients > 1
            // getFactures uniquement pour le groupe ouvert — évite le filtre sur tous les groupes
            const factures = estOuvert ? getFactures(g.codes_clients) : []
            return (
              <React.Fragment key={g.groupe_key}>
                <tr
                  onClick={() => toggle(g.groupe_key, g.codes_clients)}
                  className={`cursor-pointer transition-colors border-b border-gray-50 ${estOuvert ? 'bg-emerald-50 border-b-0' : 'hover:bg-gray-50'}`}
                >
                  <td className="px-3 py-3 text-center">
                    <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] transition-transform ${estOuvert ? 'bg-emerald-600 text-white rotate-90' : 'bg-gray-100 text-gray-500'}`}>▶</span>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      {estGroupe ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 border border-emerald-300 text-emerald-700">🌐 GROUPE</span>
                      ) : (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 border border-gray-300 text-gray-500">CLIENT</span>
                      )}
                      <span className="text-sm font-semibold text-gray-800">{g.nom_groupe}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <span className="font-mono font-bold text-sm tabular-nums text-gray-900">{fmt(g.encours_total)}</span>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <span className="text-sm font-bold text-blue-600 tabular-nums">{g.nb_clients}</span>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <span className={`text-sm font-bold tabular-nums ${g.nb_impayees > 0 ? 'text-amber-600' : 'text-gray-400'}`}>{g.nb_impayees}</span>
                    <span className="text-gray-300 text-xs"> / {g.nb_factures}</span>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-14 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${sc.bar}`} style={{ width: `${g.note_risque}%` }} />
                      </div>
                      <span className={`text-xs font-bold tabular-nums ${sc.txt}`}>{g.note_risque}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-1">
                      {g.codes_clients.map(code => (
                        <span key={code} className="font-mono text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">{code}</span>
                      ))}
                    </div>
                  </td>
                </tr>

                {estOuvert && (
                  <tr>
                    <td colSpan={7} className="px-0 py-0 border-b-2 border-emerald-100">
                      {estChargement(g.codes_clients) ? (
                        <div className="py-6 text-center text-xs text-gray-400">Chargement…</div>
                      ) : g.clients.map(client => {
                        const facsCli = factures.filter(f => f.code_client === client.code_dso)
                        return (
                          <div key={client.code_dso}>
                            <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 border-b border-emerald-100 sticky top-0">
                              <span className="font-mono text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">{client.code_dso}</span>
                              <span className="text-xs font-semibold text-gray-700">{client.nom}</span>
                              <span className="text-[10px] text-gray-400 ml-1">{facsCli.length} facture{facsCli.length > 1 ? 's' : ''}</span>
                            </div>
                            <div className="px-4 py-2 bg-emerald-50/20">
                              <LignesFactures
                                factures={facsCli}
                                chargement={false}
                                onStatutChange={onStatutChange}
                                onHistorique={onHistorique}
                                compact
                              />
                            </div>
                          </div>
                        )
                      })}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
