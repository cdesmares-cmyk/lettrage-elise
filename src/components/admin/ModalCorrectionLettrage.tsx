import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAppData } from '../../contexts/AppDataContext'
import toast from 'react-hot-toast'
import { ModalBase } from './ModalBase'

export function ModalCorrectionLettrage({ onClose }: { onClose: () => void }) {
  const { rafraichir } = useAppData()
  const [debut, setDebut] = useState('')
  const [fin, setFin] = useState('')
  const [chargement, setChargement] = useState(false)

  async function handleSupprimer() {
    if (!debut || !fin) return
    setChargement(true)
    try {
      const { data: avant } = await supabase
        .from('lettrages')
        .select('id', { count: 'exact', head: false })
        .gte('date_lettrage', debut)
        .lte('date_lettrage', fin)
      const nb = (avant ?? []).length

      const { error } = await supabase
        .from('lettrages')
        .delete()
        .gte('date_lettrage', debut)
        .lte('date_lettrage', fin)
      if (error) throw error

      toast.success(`${nb} lettrage${nb > 1 ? 's' : ''} supprimé${nb > 1 ? 's' : ''}.`)
      setDebut('')
      setFin('')
      rafraichir()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur.')
    } finally {
      setChargement(false)
    }
  }

  return (
    <ModalBase titre="Correction lettrage" onClose={onClose} largeur="max-w-lg">
      <div className="px-6 py-5 space-y-4">
        <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-xs text-amber-800">
          <span className="flex-shrink-0 mt-0.5">⚠️</span>
          <span>
            Supprimer des lettrages remet les factures concernées en <strong>impayées</strong> et les lignes bancaires en non lettrées.
            Cette action n'est pas réversible.
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-1.5">Du</label>
            <input
              type="date"
              value={debut}
              onChange={e => setDebut(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-amber-400 bg-white transition-colors"
            />
          </div>
          <div>
            <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-1.5">Au</label>
            <input
              type="date"
              value={fin}
              onChange={e => setFin(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-amber-400 bg-white transition-colors"
            />
          </div>
        </div>

        <button
          onClick={handleSupprimer}
          disabled={!debut || !fin || chargement}
          className="w-full flex items-center justify-center gap-2 text-sm font-semibold text-amber-700 bg-amber-50 border border-amber-300 hover:bg-amber-100 px-4 py-2.5 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {chargement ? '⏳ Suppression en cours…' : '🗑 Supprimer les lettrages sur la période'}
        </button>
      </div>
    </ModalBase>
  )
}
