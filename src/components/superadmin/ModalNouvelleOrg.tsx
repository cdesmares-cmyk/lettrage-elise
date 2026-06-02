import { useState } from 'react'
import toast from 'react-hot-toast'

function slugifier(val: string) {
  return val.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function IcX() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  )
}

export function ModalNouvelleOrg({
  ouvert,
  onFermer,
  onCreer,
}: {
  ouvert: boolean
  onFermer: () => void
  onCreer: (params: { nom: string; slug: string; email_admin: string; nom_admin: string }) => Promise<boolean>
}) {
  const [nom, setNom]                   = useState('')
  const [slug, setSlug]                 = useState('')
  const [slugManuel, setSlugManuel]     = useState(false)
  const [emailAdmin, setEmailAdmin]     = useState('')
  const [nomAdmin, setNomAdmin]         = useState('')
  const [envoi, setEnvoi]               = useState(false)

  function resetForm() {
    setNom(''); setSlug(''); setSlugManuel(false); setEmailAdmin(''); setNomAdmin('')
  }

  function handleNomChange(v: string) {
    setNom(v)
    if (!slugManuel) setSlug(slugifier(v))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nom.trim() || !slug.trim() || !emailAdmin.trim()) {
      toast.error('Tous les champs obligatoires doivent être remplis')
      return
    }
    setEnvoi(true)
    const ok = await onCreer({ nom: nom.trim(), slug: slug.trim(), email_admin: emailAdmin.trim(), nom_admin: nomAdmin.trim() })
    setEnvoi(false)
    if (ok) { resetForm(); onFermer() }
  }

  if (!ouvert) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">Nouvelle organisation</h2>
          <button onClick={() => { resetForm(); onFermer() }} className="text-gray-400 hover:text-gray-700 cursor-pointer">
            <IcX />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 flex flex-col gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              Nom de l'organisation <span className="text-red-500">*</span>
            </label>
            <input
              type="text" value={nom} onChange={e => handleNomChange(e.target.value)}
              placeholder="SARL Exemple"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ockham-teal/30 focus:border-ockham-teal"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              Slug (identifiant URL) <span className="text-red-500">*</span>
            </label>
            <input
              type="text" value={slug}
              onChange={e => { setSlug(e.target.value); setSlugManuel(true) }}
              placeholder="sarl-exemple"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ockham-teal/30 focus:border-ockham-teal"
              required
            />
            <p className="text-[11px] text-gray-400 mt-1">Lettres minuscules, chiffres et tirets uniquement.</p>
          </div>

          <div className="pt-1 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-500 mb-3 uppercase tracking-wide">Premier administrateur</p>
            <div className="flex flex-col gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Email admin <span className="text-red-500">*</span>
                </label>
                <input
                  type="email" value={emailAdmin} onChange={e => setEmailAdmin(e.target.value)}
                  placeholder="admin@client.com"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ockham-teal/30 focus:border-ockham-teal"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Nom affiché</label>
                <input
                  type="text" value={nomAdmin} onChange={e => setNomAdmin(e.target.value)}
                  placeholder="Prénom Nom"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ockham-teal/30 focus:border-ockham-teal"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-1">
            <button
              type="button" onClick={() => { resetForm(); onFermer() }} disabled={envoi}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 border border-gray-200 hover:border-gray-300 rounded-lg transition-colors cursor-pointer disabled:opacity-40"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={envoi || !nom.trim() || !slug.trim() || !emailAdmin.trim()}
              className="px-5 py-2 text-sm font-semibold bg-ockham-teal text-white rounded-lg hover:bg-ockham-teal-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              {envoi ? 'Création…' : 'Créer et inviter'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
