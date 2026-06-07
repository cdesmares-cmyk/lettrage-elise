// Modale d'extraction des lettrages — onglets [Interne] et [Comptable]
import { useState } from 'react'
import { IcSearch, IcDownload, IcLoader, IcX } from '../Icones'
import { supabase } from '../../lib/supabase'
import { exporterExtractionXls } from '../../lib/exportXls'
import { TabExportComptable } from './TabExportComptable'
import type { LigneExtractionLettrage } from '../../lib/exportXls'
import type { ExportComptable } from '../../hooks/useExportComptable'

interface Props {
  ouvert: boolean
  onFermer: () => void
  historique: ExportComptable[]
  chargementExport: boolean
  onApercu: (d: string, f: string) => Promise<{ nbLignes: number; montant: number; nbNonLettrees: number }>
  onExporter: (d: string, f: string) => Promise<void>
  onRetelecharger: (exp: ExportComptable) => Promise<void>
}

type Onglet = 'interne' | 'comptable'

interface RowLettrage {
  id: string
  date_lettrage: string
  code_client: string
  numero_facture: string | null
  montant: number
  commentaire: string | null
  id_ligne_bancaire: string | null
}

function fmt(n: number) {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR')
}

export function ModalExtractionLettrage({ ouvert, onFermer, historique, chargementExport, onApercu, onExporter, onRetelecharger }: Props) {
  const now = new Date()
  const today = now.toISOString().split('T')[0]
  const debutMois = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]

  const [onglet, setOnglet] = useState<Onglet>('interne')

  // État onglet Interne
  const [dateDebut, setDateDebut] = useState(debutMois)
  const [dateFin, setDateFin] = useState(today)
  const [filtreClient, setFiltreClient] = useState('')
  const [lignes, setLignes] = useState<LigneExtractionLettrage[]>([])
  const [chargement, setChargement] = useState(false)
  const [execute, setExecute] = useState(false)

  async function chercher() {
    setChargement(true)
    setExecute(true)

    let query = supabase
      .from('lettrages')
      .select('id, date_lettrage, code_client, numero_facture, montant, commentaire, id_ligne_bancaire')
      .gte('date_lettrage', dateDebut)
      .lte('date_lettrage', dateFin)
      .order('date_lettrage', { ascending: false })
      .order('code_client', { ascending: true })

    if (filtreClient.trim()) {
      query = query.ilike('code_client', `%${filtreClient.trim()}%`)
    }

    const { data: lettrageData } = await query
    const rows = (lettrageData as unknown as RowLettrage[]) ?? []

    const ids = [...new Set(rows.map(r => r.id_ligne_bancaire).filter(Boolean))] as string[]
    let libelleMap: Record<string, string> = {}
    if (ids.length) {
      const { data: bancaireData } = await supabase
        .from('lignes_bancaires')
        .select('id_operation, libelle')
        .in('id_operation', ids)
      const bancaires = (bancaireData as unknown as { id_operation: string; libelle: string }[]) ?? []
      libelleMap = Object.fromEntries(bancaires.map(b => [b.id_operation, b.libelle]))
    }

    const lettragesLignes: LigneExtractionLettrage[] = rows.map(r => ({
      ...r,
      libelle_bancaire: r.id_ligne_bancaire ? (libelleMap[r.id_ligne_bancaire] ?? null) : null,
    }))

    // Remboursements effectués sur la même période (date de la ligne Débit)
    const rembLignes = await chargerRembEffectuesInterne(dateDebut, dateFin, filtreClient)

    setLignes([...lettragesLignes, ...rembLignes])
    setChargement(false)
  }

  async function chargerRembEffectuesInterne(debut: string, fin: string, filtre: string): Promise<LigneExtractionLettrage[]> {
    const { data: debitData } = await supabase
      .from('lignes_bancaires')
      .select('id_operation, libelle, date_operation')
      .gte('date_operation', debut)
      .lte('date_operation', fin)
      .not('debit', 'is', null)
      .gt('debit', 0)

    const debitRows = (debitData as unknown as { id_operation: string; libelle: string; date_operation: string }[]) ?? []
    if (!debitRows.length) return []

    const debitMap = Object.fromEntries(debitRows.map(d => [d.id_operation, d]))
    const debitIds = Object.keys(debitMap)

    const { data: rembData } = await supabase
      .from('remboursements')
      .select('id, id_ligne_bancaire')
      .eq('statut', 'effectue')
      .in('id_ligne_bancaire', debitIds)

    const rembs = (rembData as unknown as { id: string; id_ligne_bancaire: string }[]) ?? []
    if (!rembs.length) return []

    const rembIds = rembs.map(r => r.id)
    const rembByLigne = Object.fromEntries(rembs.map(r => [r.id, r.id_ligne_bancaire]))

    let query = supabase
      .from('remboursement_lignes')
      .select('id, remboursement_id, numero_facture, code_client, montant')
      .in('remboursement_id', rembIds)

    if (filtre.trim()) {
      query = query.ilike('code_client', `%${filtre.trim()}%`)
    }

    const { data: lignesData } = await query

    return ((lignesData as unknown as { id: string; remboursement_id: string; numero_facture: string; code_client: string; montant: number }[]) ?? []).map(l => {
      const idLigne = rembByLigne[l.remboursement_id]
      const debitInfo = idLigne ? debitMap[idLigne] : null
      return {
        id: l.id,
        date_lettrage: debitInfo?.date_operation ?? debut,
        libelle_bancaire: debitInfo?.libelle ?? null,
        code_client: l.code_client,
        numero_facture: l.numero_facture,
        montant: -l.montant,
        commentaire: 'Remboursement client',
      }
    })
  }

  const total = lignes.reduce((s, l) => s + l.montant, 0)

  if (!ouvert) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onFermer() }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">

        {/* En-tête */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-bold text-gray-900">Extraction Lettrage</h2>
            <p className="text-xs text-gray-500 mt-0.5">Export interne ou verrouillage comptable par période</p>
          </div>
          <button onClick={onFermer}
            className="text-gray-400 hover:text-gray-600 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors"><IcX size={15} /></button>
        </div>

        {/* Onglets */}
        <div className="flex border-b border-gray-100 px-6">
          {(['interne', 'comptable'] as Onglet[]).map(o => (
            <button key={o} onClick={() => setOnglet(o)}
              className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors capitalize ${
                onglet === o
                  ? 'border-ockham-teal text-ockham-teal'
                  : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}>
              {o === 'interne' ? 'Interne' : 'Comptable'}
            </button>
          ))}
        </div>

        {/* Onglet Interne */}
        {onglet === 'interne' && (
          <>
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
              <div className="flex items-end gap-4 flex-wrap">
                <div>
                  <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Date de début</label>
                  <input type="date" value={dateDebut} onChange={e => setDateDebut(e.target.value)}
                    className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 outline-none focus:border-ockham-teal bg-white" />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Date de fin</label>
                  <input type="date" value={dateFin} onChange={e => setDateFin(e.target.value)}
                    className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 outline-none focus:border-ockham-teal bg-white" />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Code client (optionnel)</label>
                  <input type="text" value={filtreClient} onChange={e => setFiltreClient(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && chercher()}
                    placeholder="Tous les clients"
                    className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 outline-none focus:border-ockham-teal bg-white w-44" />
                </div>
                <button onClick={chercher} disabled={chargement}
                  className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold px-4 py-1.5 rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap">
                  {chargement ? <><IcLoader size={13} /> Chargement…</> : <><IcSearch size={13} className="inline-block mr-1.5" />Rechercher</>}
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto px-6 py-4">
              {!execute && (
                <div className="flex items-center justify-center h-32 text-sm text-gray-400">
                  Définissez vos filtres et cliquez sur Rechercher
                </div>
              )}
              {execute && !chargement && !lignes.length && (
                <div className="flex items-center justify-center h-32 text-sm text-gray-400">
                  Aucun lettrage trouvé pour cette période
                </div>
              )}
              {lignes.length > 0 && (
                <>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs text-gray-500">
                      {lignes.length} lettrage{lignes.length > 1 ? 's' : ''} · Total : <span className="font-semibold text-gray-800">{fmt(total)}</span>
                    </p>
                    <button onClick={() => exporterExtractionXls(lignes)}
                      className="flex items-center gap-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded-lg transition-colors">
                      <IcDownload size={12} className="inline-block mr-1" /> Extraire XLS
                    </button>
                  </div>
                  <div className="border border-gray-200 rounded-xl overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                          <th className="text-left px-3 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Date</th>
                          <th className="text-left px-3 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Ligne bancaire</th>
                          <th className="text-left px-3 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Code client</th>
                          <th className="text-left px-3 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">N° Facture</th>
                          <th className="text-right px-3 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Montant attribué</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lignes.map((l, i) => (
                          <tr key={l.id} className={`border-b border-gray-100 ${i % 2 !== 0 ? 'bg-gray-50/50' : ''}`}>
                            <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{fmtDate(l.date_lettrage)}</td>
                            <td className="px-3 py-2 text-gray-700 max-w-[220px] truncate">{l.libelle_bancaire ?? <span className="text-gray-300">—</span>}</td>
                            <td className="px-3 py-2">
                              <span className="font-mono font-bold text-ockham-teal bg-ockham-teal-muted px-1.5 py-0.5 rounded text-[10px]">{l.code_client}</span>
                            </td>
                            <td className="px-3 py-2 font-mono text-gray-700">
                              {l.numero_facture ?? <span className="text-amber-600 font-semibold not-italic text-[10px]">Autres{l.commentaire ? ` · ${l.commentaire}` : ''}</span>}
                            </td>
                            <td className="px-3 py-2 text-right font-mono font-semibold text-gray-900">{fmt(l.montant)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-gray-200 bg-gray-50">
                          <td colSpan={4} className="px-3 py-2.5 text-xs font-semibold text-gray-500 text-right">Total :</td>
                          <td className="px-3 py-2.5 text-right font-mono font-bold text-gray-900">{fmt(total)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </>
              )}
            </div>
          </>
        )}

        {/* Onglet Comptable */}
        {onglet === 'comptable' && (
          <TabExportComptable
            historique={historique}
            chargement={chargementExport}
            onApercu={onApercu}
            onExporter={onExporter}
            onRetelecharger={onRetelecharger}
          />
        )}
      </div>
    </div>
  )
}
