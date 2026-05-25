import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import toast from 'react-hot-toast'

interface Props {
  onClose: () => void
}

interface UserRow {
  id: string
  email: string
  role: string
  recoit_digest_alertes: boolean
}

export function ModalAlertesParametres({ onClose }: Props) {
  const { profil, utilisateur } = useAuth()
  const [delai, setDelai]   = useState(25)
  const [snooze, setSnooze] = useState(20)
  const [users, setUsers]   = useState<UserRow[]>([])
  const [sauvegarde, setSauvegarde] = useState(false)

  useEffect(() => {
    if (!profil?.organisation_id) return
    supabase
      .from('organisations')
      .select('delai_alerte_jours, alerte_snooze_jours')
      .eq('id', profil.organisation_id)
      .single()
      .then(({ data }) => {
        if (data) {
          const row = data as { delai_alerte_jours: number | null; alerte_snooze_jours: number | null }
          setDelai(row.delai_alerte_jours ?? 25)
          setSnooze(row.alerte_snooze_jours ?? 20)
        }
      })

    supabase
      .from('utilisateurs')
      .select('id, email, role, recoit_digest_alertes')
      .eq('organisation_id', profil.organisation_id)
      .then(({ data }) => { if (data) setUsers(data as UserRow[]) })
  }, [profil?.organisation_id])

  const moiMeme = users.find(u => u.id === utilisateur?.id)

  async function sauvegarder() {
    if (!profil?.organisation_id) return
    setSauvegarde(true)
    try {
      const { error } = await supabase
        .from('organisations')
        .update({ delai_alerte_jours: delai, alerte_snooze_jours: snooze } as never)
        .eq('id', profil.organisation_id)
      if (error) throw error
      toast.success('Paramètres alertes enregistrés.')
      onClose()
    } catch {
      toast.error('Erreur lors de la sauvegarde.')
    } finally {
      setSauvegarde(false)
    }
  }

  async function toggleDigest(userId: string, valeur: boolean) {
    await supabase
      .from('utilisateurs')
      .update({ recoit_digest_alertes: valeur } as never)
      .eq('id', userId)
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, recoit_digest_alertes: valeur } : u))
  }

  const commerciaux = users.filter(u => u.role === 'commercial' && u.id !== utilisateur?.id)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 flex flex-col gap-5">

        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Alertes & Scoring</h2>
            <p className="text-xs text-gray-500 mt-0.5">Paramètres de détection du risque client</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
        </div>

        {/* Abonnement personnel */}
        {moiMeme && (
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
              Mes notifications
            </label>
            <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
              <div>
                <p className="text-sm text-gray-700">Recevoir le digest email quotidien</p>
                <p className="text-[11px] text-gray-400 mt-0.5">Récapitulatif des alertes envoyé chaque matin à 7h30</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer flex-shrink-0 ml-3">
                <input
                  type="checkbox"
                  checked={moiMeme.recoit_digest_alertes}
                  onChange={e => toggleDigest(moiMeme.id, e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-gray-200 peer-checked:bg-ockham-teal rounded-full transition-colors after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4" />
              </label>
            </div>
          </div>
        )}

        {/* Délai alerte */}
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
            Délai acceptable après échéance
          </label>
          <div className="flex items-center gap-3">
            <input
              type="number"
              min={1}
              max={90}
              value={delai}
              onChange={e => setDelai(Math.max(1, parseInt(e.target.value) || 25))}
              className="w-24 border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono text-gray-700 outline-none focus:border-ockham-teal"
            />
            <span className="text-sm text-gray-500">jours (défaut : 25)</span>
          </div>
          <p className="text-[11px] text-gray-400 mt-1.5">
            Une facture déclenche une alerte si elle dépasse ce délai après sa date d'échéance.
          </p>
        </div>

        {/* Durée snooze */}
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
            Durée "Pris en charge"
          </label>
          <div className="flex items-center gap-3">
            <input
              type="number"
              min={1}
              max={60}
              value={snooze}
              onChange={e => setSnooze(Math.max(1, parseInt(e.target.value) || 20))}
              className="w-24 border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono text-gray-700 outline-none focus:border-ockham-teal"
            />
            <span className="text-sm text-gray-500">jours (défaut : 20)</span>
          </div>
          <p className="text-[11px] text-gray-400 mt-1.5">
            Durée pendant laquelle un client "pris en charge" disparaît des alertes.
          </p>
        </div>

        {/* Opt-in commerciaux */}
        {commerciaux.length > 0 && (
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
              Digest email — Commerciaux
            </label>
            <div className="space-y-2">
              {commerciaux.map(u => (
                <div key={u.id} className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                  <span className="text-sm text-gray-700">{u.email}</span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={u.recoit_digest_alertes}
                      onChange={e => toggleDigest(u.id, e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-gray-200 peer-checked:bg-ockham-teal rounded-full transition-colors after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4" />
                  </label>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-gray-400 mt-1.5">Admin et responsables poste client reçoivent toujours le digest.</p>
          </div>
        )}

        <div className="flex gap-2 justify-end pt-1">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">
            Annuler
          </button>
          <button
            onClick={sauvegarder}
            disabled={sauvegarde}
            className="px-4 py-2 text-sm font-medium bg-ockham-teal text-white rounded-lg hover:bg-ockham-teal/90 disabled:opacity-50 transition-colors"
          >
            {sauvegarde ? '…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  )
}
