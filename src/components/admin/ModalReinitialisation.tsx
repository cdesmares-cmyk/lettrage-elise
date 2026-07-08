import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAppData } from '../../contexts/AppDataContext'
import toast from 'react-hot-toast'
import { ModalBase } from './ModalBase'
import { IcTrash } from '../Icones'

type Entite = 'lettrages' | 'relances' | 'factures' | 'lignes_bancaires' | 'imports' | 'contacts' | 'clients'

const ENTITES: { id: Entite; label: string; description: string }[] = [
  { id: 'lettrages',       label: 'Lettrages',         description: 'Tous les rapprochements facture / relevé' },
  { id: 'relances',        label: 'Relances',           description: 'Historique des relances envoyées' },
  { id: 'factures',        label: 'Factures',           description: 'Toutes les factures et avoirs importés' },
  { id: 'lignes_bancaires',label: 'Lignes bancaires',   description: 'Relevés bancaires importés' },
  { id: 'imports',         label: 'Historique imports', description: 'Journal des imports de fichiers' },
  { id: 'contacts',        label: 'Contacts',           description: 'Contacts associés aux fiches client' },
  { id: 'clients',         label: 'Clients',            description: 'Tous les comptes clients' },
]

// Ordre de suppression safe vis-à-vis des FK
const ORDRE_SUPPRESSION: Entite[] = ['lettrages', 'relances', 'factures', 'lignes_bancaires', 'imports', 'contacts', 'clients']

export function ModalReinitialisation({ onClose }: { onClose: () => void }) {
  const { rafraichir } = useAppData()
  const [selection, setSelection] = useState<Set<Entite>>(new Set())
  const [confirmTexte, setConfirmTexte] = useState('')
  const [etape2, setEtape2] = useState(false)
  const [chargement, setChargement] = useState(false)

  function toggle(id: Entite) {
    setSelection(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toutCocher() {
    setSelection(new Set(ENTITES.map(e => e.id)))
  }

  async function handleReset() {
    if (confirmTexte !== 'RESET' || selection.size === 0) return
    setChargement(true)
    try {
      for (const entite of ORDRE_SUPPRESSION) {
        if (!selection.has(entite)) continue
        const { error } = await supabase.from(entite).delete().gte('created_at', '2000-01-01')
        if (error) throw error
      }
      toast.success(`Réinitialisation effectuée (${selection.size} entité${selection.size > 1 ? 's' : ''}).`)
      setSelection(new Set())
      setConfirmTexte('')
      setEtape2(false)
      rafraichir()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur lors du reset.')
    } finally {
      setChargement(false)
    }
  }

  return (
    <ModalBase titre="Réinitialisation" onClose={onClose} largeur="max-w-lg" icon={<IcTrash size={14} />}>
      <div className="px-6 py-5 space-y-5">

        <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-xs text-red-800">
          <span className="flex-shrink-0 mt-0.5">🔴</span>
          <span>Action irréversible. Sélectionnez les données à supprimer définitivement.</span>
        </div>

        {/* Sélection entités */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-gray-700">Données à supprimer</p>
            <button onClick={toutCocher} className="text-[11px] text-gray-400 hover:text-gray-600 transition-colors">Tout sélectionner</button>
          </div>
          <div className="space-y-1.5">
            {ENTITES.map(e => (
              <label key={e.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors ${selection.has(e.id) ? 'border-red-300 bg-red-50' : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50'}`}>
                <input
                  type="checkbox"
                  checked={selection.has(e.id)}
                  onChange={() => toggle(e.id)}
                  className="accent-red-500 flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-semibold ${selection.has(e.id) ? 'text-red-700' : 'text-gray-700'}`}>{e.label}</p>
                  <p className="text-[11px] text-gray-400">{e.description}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Confirmation */}
        {!etape2 ? (
          <button
            onClick={() => setEtape2(true)}
            disabled={selection.size === 0}
            className="w-full text-sm font-semibold text-red-600 border border-red-300 hover:bg-red-50 px-5 py-2.5 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Continuer ({selection.size} entité{selection.size !== 1 ? 's' : ''} sélectionnée{selection.size !== 1 ? 's' : ''})
          </button>
        ) : (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-4 space-y-3">
            <p className="text-sm font-semibold text-red-700">Tapez <strong>RESET</strong> pour confirmer la suppression :</p>
            <div className="flex items-center gap-3">
              <input
                type="text"
                value={confirmTexte}
                onChange={e => setConfirmTexte(e.target.value)}
                placeholder="RESET"
                autoFocus
                className="border border-red-300 rounded-lg px-3 py-2 text-sm font-mono outline-none focus:border-red-500 w-28 bg-white"
              />
              <button
                onClick={handleReset}
                disabled={confirmTexte !== 'RESET' || chargement}
                className="text-sm font-bold text-white bg-red-600 hover:bg-red-700 px-5 py-2 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {chargement ? '⏳ En cours…' : 'Confirmer'}
              </button>
              <button
                onClick={() => { setEtape2(false); setConfirmTexte('') }}
                className="text-sm text-gray-500 hover:text-gray-700"
              >Annuler</button>
            </div>
          </div>
        )}
      </div>
    </ModalBase>
  )
}
