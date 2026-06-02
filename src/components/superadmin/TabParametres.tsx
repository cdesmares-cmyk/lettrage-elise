import { useState } from 'react'
import { type OrganisationSA } from '../../hooks/useSuperAdmin'
import { useSuperAdminOrg } from '../../hooks/useSuperAdminOrg'

const formaterDate = (iso: string | null) =>
  !iso ? '—' : new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })

export function TabParametres({ org, actions, onNomChange }: {
  org: OrganisationSA
  actions: ReturnType<typeof useSuperAdminOrg>
  onNomChange: (nom: string) => void
}) {
  const [nomEdit, setNomEdit]   = useState(org.nom)
  const [enCours, setEnCours]   = useState(false)
  const modifie = nomEdit.trim() !== org.nom && nomEdit.trim().length > 0

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!modifie) return
    setEnCours(true)
    const ok = await actions.updateOrg(org.id, nomEdit.trim())
    setEnCours(false)
    if (ok) onNomChange(nomEdit.trim())
  }

  return (
    <div className="px-6 py-5 max-w-lg">
      <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-4">Paramètres de l'organisation</p>

      <form onSubmit={handleSave} className="space-y-5">
        {/* Nom */}
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1.5">Nom de l'organisation</label>
          <div className="flex gap-2">
            <input type="text" value={nomEdit} onChange={e => setNomEdit(e.target.value)} required
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ockham-teal/30 focus:border-ockham-teal" />
            <button type="submit" disabled={!modifie || enCours}
              className="px-4 py-2 bg-ockham-teal text-white text-xs font-semibold rounded-lg hover:bg-ockham-teal-dark disabled:opacity-40 transition-colors cursor-pointer">
              {enCours ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </div>

        {/* Slug (lecture seule) */}
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1.5">Slug <span className="text-gray-400 font-normal">(lecture seule)</span></label>
          <div className="border border-gray-100 rounded-lg px-3 py-2 bg-gray-50">
            <span className="font-mono text-sm text-gray-500">{org.slug}</span>
          </div>
        </div>

        {/* Infos */}
        <div className="grid grid-cols-2 gap-3 pt-1">
          <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
            <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wider mb-0.5">Créée le</p>
            <p className="text-sm font-semibold text-gray-700">{formaterDate(org.cree_le)}</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
            <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wider mb-0.5">Identifiant</p>
            <p className="text-xs font-mono text-gray-500 truncate">{org.id}</p>
          </div>
        </div>
      </form>
    </div>
  )
}
