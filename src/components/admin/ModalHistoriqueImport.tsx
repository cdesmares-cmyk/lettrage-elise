import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAppData } from '../../contexts/AppDataContext'
import toast from 'react-hot-toast'
import { ModalBase } from './ModalBase'
import { IcClock } from '../Icones'
import type { ImportRecord } from '../../hooks/useAdmin'

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function ModalHistoriqueImport({ onClose }: { onClose: () => void }) {
  const { rafraichir } = useAppData()
  const [imports, setImports] = useState<ImportRecord[]>([])
  const [chargement, setChargement] = useState(false)
  const [confirmImport, setConfirmImport] = useState<string | null>(null)

  const charger = useCallback(async () => {
    const { data } = await supabase
      .from('imports')
      .select('id, type, nom_fichier, nb_lignes_inserees, nb_lignes_doublons, cree_le')
      .order('cree_le', { ascending: false })
      .limit(10)
    setImports((data as unknown as ImportRecord[]) ?? [])
  }, [])

  useEffect(() => { charger() }, [charger])

  async function handleAnnuler(imp: ImportRecord) {
    setChargement(true)
    try {
      if (imp.type === 'csv_bancaire') {
        // Supprimer les lettrages liés aux lignes bancaires de cet import
        const { data: lignes } = await supabase.from('lignes_bancaires').select('id_operation').eq('import_id', imp.id)
        const ids = (lignes ?? []).map((l: { id_operation: string }) => l.id_operation)
        if (ids.length > 0) {
          const { error } = await supabase.from('lettrages').delete().in('id_ligne_bancaire', ids)
          if (error) throw error
        }
        const { error } = await supabase.from('lignes_bancaires').delete().eq('import_id', imp.id)
        if (error) throw error

      } else if (imp.type === 'xlsx_factures') {
        // Supprimer les lettrages puis les factures de cet import
        const { data: facs } = await supabase.from('factures').select('numero_piece').eq('import_id', imp.id)
        const nums = (facs ?? []).map((f: { numero_piece: string }) => f.numero_piece)
        if (nums.length > 0) {
          const { error } = await supabase.from('lettrages').delete().in('numero_facture', nums)
          if (error) throw error
        }
        const { error } = await supabase.from('factures').delete().eq('import_id', imp.id)
        if (error) throw error

      } else if (imp.type === 'import_clients') {
        // Supprimer les factures 411 tampon, puis les clients de cet import
        const { data: cls } = await supabase.from('clients').select('code_dso').eq('import_id', imp.id)
        const codes = (cls ?? []).map((c: { code_dso: string }) => c.code_dso)
        if (codes.length > 0) {
          // Lettrages liés aux factures de ces clients
          const { data: facs } = await supabase.from('factures').select('numero_piece').in('code_client', codes)
          const nums = (facs ?? []).map((f: { numero_piece: string }) => f.numero_piece)
          if (nums.length > 0) {
            const { error } = await supabase.from('lettrages').delete().in('numero_facture', nums)
            if (error) throw error
          }
          const { error: errFacs } = await supabase.from('factures').delete().in('code_client', codes)
          if (errFacs) throw errFacs
        }
        const { error } = await supabase.from('clients').delete().eq('import_id', imp.id)
        if (error) throw error

      } else if (imp.type === 'import_contacts') {
        const { error } = await supabase.from('contacts_client').delete().eq('import_id', imp.id)
        if (error) throw error

      } else if (imp.type === 'import_lettrage') {
        const { error } = await supabase.from('lettrages').delete().eq('import_id', imp.id)
        if (error) throw error
      }

      await supabase.from('imports').delete().eq('id', imp.id)
      toast.success('Import annulé.')
      setConfirmImport(null)
      await charger()
      rafraichir()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur lors de l\'annulation.')
    } finally {
      setChargement(false)
    }
  }

  return (
    <ModalBase titre="Historique d'import" onClose={onClose} largeur="max-w-3xl" icon={<IcClock size={14} />}>
      <div className="px-6 py-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs text-gray-400">10 imports les plus récents</p>
          <button onClick={charger} className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 px-2.5 py-1 rounded transition-colors">↺ Actualiser</button>
        </div>

        {imports.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">Aucun import enregistré.</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-3 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Type</th>
                <th className="text-left px-3 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Fichier</th>
                <th className="text-center px-3 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Lignes</th>
                <th className="text-left px-3 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Date</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {imports.map(imp => (
                <tr key={imp.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-3 py-3">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${imp.type === 'csv_bancaire' ? 'bg-ockham-teal-muted border-ockham-teal/40 text-ockham-teal-dark' : 'bg-violet-50 border-violet-200 text-violet-700'}`}>
                      {imp.type === 'csv_bancaire' ? 'Bancaire' : 'Factures'}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-gray-600 truncate max-w-[180px]">{imp.nom_fichier ?? '—'}</td>
                  <td className="px-3 py-3 text-center font-mono text-gray-700">{imp.nb_lignes_inserees ?? 0}</td>
                  <td className="px-3 py-3 text-gray-500 whitespace-nowrap">{fmtDate(imp.cree_le)}</td>
                  <td className="px-3 py-3 text-right">
                    {confirmImport === imp.id ? (
                      <div className="flex items-center gap-2 justify-end">
                        <span className="text-[11px] text-red-600 font-medium">Confirmer ?</span>
                        <button onClick={() => handleAnnuler(imp)} disabled={chargement} className="text-[11px] font-bold text-white bg-red-500 hover:bg-red-600 px-2.5 py-1 rounded disabled:opacity-50">Oui</button>
                        <button onClick={() => setConfirmImport(null)} className="text-[11px] text-gray-500 border border-gray-200 px-2.5 py-1 rounded">Non</button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmImport(imp.id)} className="text-[11px] font-semibold text-red-500 border border-red-200 hover:bg-red-50 px-2.5 py-1 rounded transition-colors">
                        Annuler
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </ModalBase>
  )
}
