import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabase'
import { SEUIL_SANS_SUITE_DEFAUT } from '../../hooks/useRelances'

const CAT = 'config_seuil_sans_suite'

export function TabReglesRelance() {
  const [seuil, setSeuil] = useState(SEUIL_SANS_SUITE_DEFAUT)
  const [saving, setSaving] = useState(false)
  const [chargement, setChargement] = useState(true)

  useEffect(() => {
    supabase.from('ref_valeurs').select('valeur').eq('categorie', CAT).maybeSingle()
      .then(({ data }) => {
        const val = parseInt((data as { valeur: string } | null)?.valeur ?? '')
        if (!isNaN(val) && val > 0) setSeuil(val)
        setChargement(false)
      })
  }, [])

  async function sauvegarder() {
    if (seuil < 1) return
    setSaving(true)
    await supabase.from('ref_valeurs').delete().eq('categorie', CAT)
    const { error } = await supabase.from('ref_valeurs').insert({ categorie: CAT, valeur: String(seuil) } as never)
    setSaving(false)
    if (error) { toast.error('Erreur lors de la sauvegarde'); return }
    toast.success(`Seuil mis à jour : ${seuil} jours`)
  }

  if (chargement) return <div className="p-6 text-sm text-gray-400">Chargement…</div>

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-8">
      <div className="max-w-md space-y-4">
        <div>
          <p className="text-[11px] font-bold text-ockham-navy/60 uppercase tracking-wider mb-1">Seuil "Sans suite"</p>
          <p className="text-xs text-gray-400 mb-3">
            Nombre de jours sans paiement détecté après l'envoi d'une relance avant de basculer automatiquement vers l'onglet <span className="font-semibold" style={{ color: '#C07840' }}>Sans suite</span>. L'alerte ⚠️ apparaît 10 jours avant ce seuil.
          </p>
          <div className="flex items-center gap-3">
            <input
              type="number"
              min={10}
              max={120}
              value={seuil}
              onChange={e => setSeuil(parseInt(e.target.value) || SEUIL_SANS_SUITE_DEFAUT)}
              className="w-24 border border-gray-200 rounded-lg px-3 py-2 text-sm font-semibold text-gray-700 outline-none focus:border-ockham-teal transition-colors text-center"
            />
            <span className="text-sm text-gray-400">jours</span>
          </div>
          <p className="text-[10px] text-gray-300 mt-1.5">
            Alerte ⚠️ à partir de J+{Math.max(1, seuil - 10)} · Sans suite à J+{seuil}
          </p>
        </div>

        <div className="pt-2 border-t border-gray-100">
          <p className="text-[11px] font-bold text-ockham-navy/60 uppercase tracking-wider mb-1">Archivage automatique</p>
          <p className="text-xs text-gray-400">
            Les relances classées <span className="font-semibold text-emerald-600">Payées</span> ou <span className="font-semibold" style={{ color: '#C07840' }}>Sans suite</span> sont archivées automatiquement après <span className="font-semibold text-gray-600">60 jours</span> (non configurable).
          </p>
        </div>

        <button
          onClick={sauvegarder}
          disabled={saving}
          className="px-4 py-2 text-xs font-semibold bg-ockham-teal text-white rounded-lg hover:bg-ockham-teal-dark disabled:opacity-50 transition-colors cursor-pointer"
        >
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </div>
  )
}
