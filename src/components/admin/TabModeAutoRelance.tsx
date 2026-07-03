// Onglet Mode Auto — paramètres de relance automatique au niveau organisation
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { IcWarning } from '../Icones'
import toast from 'react-hot-toast'

interface ParamsAuto {
  delai_echeance_jours: number
  delai_declenchement_relance_jours: number
  delai_rerelance_jours: number
  relance_auto_active: boolean
  signature_auto: string | null
}

export function TabModeAutoRelance() {
  const { profil } = useAuth()
  const [params, setParams] = useState<ParamsAuto>({
    delai_echeance_jours: 30,
    delai_declenchement_relance_jours: 7,
    delai_rerelance_jours: 30,
    relance_auto_active: false,
    signature_auto: null,
  })
  const [chargement, setChargement] = useState(true)
  const [sauvegarde, setSauvegarde] = useState(false)

  useEffect(() => {
    if (!profil?.organisation_id) return
    supabase
      .from('organisations')
      .select('delai_echeance_jours, delai_declenchement_relance_jours, delai_rerelance_jours, relance_auto_active, signature_auto')
      .eq('id', profil.organisation_id)
      .single()
      .then(({ data }) => {
        if (data) {
          const row = data as ParamsAuto
          setParams({
            delai_echeance_jours: row.delai_echeance_jours ?? 30,
            delai_declenchement_relance_jours: row.delai_declenchement_relance_jours ?? 7,
            delai_rerelance_jours: row.delai_rerelance_jours ?? 30,
            relance_auto_active: row.relance_auto_active ?? false,
            signature_auto: row.signature_auto ?? null,
          })
        }
        setChargement(false)
      })
  }, [profil?.organisation_id])

  async function sauvegarder() {
    if (!profil?.organisation_id) return
    setSauvegarde(true)
    try {
      const { error } = await supabase
        .from('organisations')
        .update(params as never)
        .eq('id', profil.organisation_id)
      if (error) throw error
      toast.success('Paramètres enregistrés.')
    } catch {
      toast.error('Erreur lors de la sauvegarde.')
    } finally {
      setSauvegarde(false)
    }
  }

  if (chargement) return <div className="flex-1 flex items-center justify-center text-xs text-gray-400">Chargement…</div>

  return (
    <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
        <p className="text-xs font-semibold text-amber-700 flex items-center gap-1.5">
          <IcWarning size={13} className="flex-shrink-0" />
          Mode automatique — activation après configuration du cron
        </p>
        <p className="text-xs text-amber-600 mt-1">
          Les clients en procédure collective et ceux marqués "exclure" sont toujours ignorés.
        </p>
      </div>

      <div>
        <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
          Délai de paiement par défaut
        </label>
        <div className="flex items-center gap-3">
          <input type="number" min={1} max={120} value={params.delai_echeance_jours}
            onChange={e => setParams(p => ({ ...p, delai_echeance_jours: Math.max(1, parseInt(e.target.value) || 30) }))}
            className="w-24 border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono text-gray-700 outline-none focus:border-ockham-teal"
          />
          <span className="text-sm text-gray-500">jours net</span>
        </div>
        <p className="text-[11px] text-gray-400 mt-1.5">
          Terme contractuel pour calculer la date d'échéance si elle n'est pas renseignée sur la facture. Surchargeable par client dans le volet Options.
        </p>
      </div>

      <div>
        <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
          Délai avant première relance automatique
        </label>
        <div className="flex items-center gap-3">
          <input type="number" min={1} max={60} value={params.delai_declenchement_relance_jours}
            onChange={e => setParams(p => ({ ...p, delai_declenchement_relance_jours: Math.max(1, parseInt(e.target.value) || 7) }))}
            className="w-24 border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono text-gray-700 outline-none focus:border-ockham-teal"
          />
          <span className="text-sm text-gray-500">jours après échéance</span>
        </div>
        <p className="text-[11px] text-gray-400 mt-1.5">
          Une facture non réglée déclenche une relance X jours après son échéance calculée.
        </p>
      </div>

      <div>
        <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
          Délai minimum entre deux relances
        </label>
        <div className="flex items-center gap-3">
          <input type="number" min={7} max={90} value={params.delai_rerelance_jours}
            onChange={e => setParams(p => ({ ...p, delai_rerelance_jours: Math.max(7, parseInt(e.target.value) || 30) }))}
            className="w-24 border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono text-gray-700 outline-none focus:border-ockham-teal"
          />
          <span className="text-sm text-gray-500">jours (défaut : 30)</span>
        </div>
        <p className="text-[11px] text-gray-400 mt-1.5">
          Un client ne recevra pas deux relances auto en deçà de ce délai, même si de nouvelles factures sont éligibles.
        </p>
      </div>

      <div>
        <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
          Signature email automatique
        </label>
        <textarea
          rows={4}
          value={params.signature_auto ?? ''}
          onChange={e => setParams(p => ({ ...p, signature_auto: e.target.value || null }))}
          placeholder="Ex : Cordialement,&#10;Le service comptable&#10;[Nom organisation]"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 outline-none focus:border-ockham-teal resize-none font-sans leading-relaxed"
        />
        <p className="text-[11px] text-gray-400 mt-1.5">
          Insérée après le corps du scénario. La balise [Nom organisation] est disponible.
        </p>
      </div>

      <div className="border-t border-gray-100 pt-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-700">Activer le mode automatique</p>
            <p className="text-xs text-gray-400 mt-0.5">
              Les relances s'envoient sans intervention manuelle. Désactivable à tout moment.
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer flex-shrink-0 ml-4">
            <input type="checkbox" checked={params.relance_auto_active}
              onChange={e => setParams(p => ({ ...p, relance_auto_active: e.target.checked }))}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-gray-200 peer-checked:bg-ockham-teal rounded-full transition-colors after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4" />
          </label>
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <button onClick={sauvegarder} disabled={sauvegarde}
          className="px-4 py-2 text-sm font-semibold bg-ockham-teal text-white rounded-lg hover:bg-ockham-teal-dark disabled:opacity-50 transition-colors">
          {sauvegarde ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </div>
  )
}
