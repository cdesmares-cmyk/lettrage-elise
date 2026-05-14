import { useState } from 'react'
import { useContacts, type Contact, type RoleContact } from '../../hooks/useContacts'
import { useRole } from '../../contexts/RoleContext'

const ROLES: { val: RoleContact; label: string; cls: string }[] = [
  { val: 'comptabilite', label: 'Comptabilité', cls: 'bg-ockham-teal-muted text-ockham-teal-dark border-ockham-teal/40' },
  { val: 'relance',      label: 'Relance',       cls: 'bg-violet-50 text-violet-700 border-violet-200' },
  { val: 'direction',    label: 'Direction',     cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  { val: 'terrain',      label: 'Terrain',       cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { val: 'autre',        label: 'Autre',         cls: 'bg-gray-100 text-gray-500 border-gray-200' },
]

function badgeRole(role: RoleContact) {
  const r = ROLES.find(r => r.val === role) ?? ROLES[4]
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${r.cls}`}>{r.label}</span>
}

const FORM_VIDE = { prenom: '', nom: '', email: '', telephone: '', role_contact: 'comptabilite' as RoleContact }

type Mode = 'liste' | 'ajouter' | { editer: string }

interface Props { codeClient: string }

export function SectionContacts({ codeClient }: Props) {
  const { contacts, chargement, ajouter, modifier, desactiver } = useContacts(codeClient)
  const { peutModifier } = useRole()
  const [mode, setMode] = useState<Mode>('liste')
  const [form, setForm] = useState({ ...FORM_VIDE })
  const [sauvegarde, setSauvegarde] = useState(false)

  function f(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm(prev => ({ ...prev, [field]: e.target.value }))
  }

  function ouvrirEdition(c: Contact) {
    setForm({ prenom: c.prenom ?? '', nom: c.nom, email: c.email, telephone: c.telephone ?? '', role_contact: c.role_contact })
    setMode({ editer: c.id })
  }

  function annuler() { setForm({ ...FORM_VIDE }); setMode('liste') }

  async function soumettre() {
    if (!form.nom.trim() || !form.email.trim()) return
    setSauvegarde(true)
    const data = { ...form, prenom: form.prenom.trim() || null, telephone: form.telephone.trim() || null }
    const ok = mode === 'ajouter'
      ? await ajouter(data)
      : await modifier((mode as { editer: string }).editer, data)
    setSauvegarde(false)
    if (ok) annuler()
  }

  const enEdition = typeof mode === 'object' ? (mode as { editer: string }).editer : null

  if (chargement) return <div className="py-8 text-center text-xs text-gray-400">Chargement…</div>

  return (
    <div className="space-y-3">

      {/* Liste des contacts */}
      {contacts.length === 0 && mode === 'liste' && (
        <div className="py-8 text-center">
          <p className="text-xs text-gray-400 mb-3">Aucun contact pour ce client</p>
          {peutModifier && (
            <button onClick={() => setMode('ajouter')} className="text-xs font-semibold text-ockham-teal border border-ockham-teal/40 bg-ockham-teal-muted hover:bg-ockham-teal/10 px-3 py-1.5 rounded-lg transition-colors">
              + Ajouter le premier contact
            </button>
          )}
        </div>
      )}

      {contacts.map(c => (
        enEdition === c.id ? (
          <FormulaireContact key={c.id} form={form} f={f} sauvegarde={sauvegarde} onSoumettre={soumettre} onAnnuler={annuler} titre="Modifier le contact" />
        ) : (
          <div key={c.id} className={`border rounded-xl px-3.5 py-3 transition-colors ${enEdition && enEdition !== c.id ? 'opacity-30' : 'border-gray-100 bg-gray-50/50'}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-sm font-semibold text-gray-800 truncate">
                    {[c.prenom, c.nom].filter(Boolean).join(' ')}
                  </p>
                  {badgeRole(c.role_contact)}
                </div>
                <p className="text-xs text-ockham-teal truncate">{c.email}</p>
                {c.telephone && <p className="text-xs text-gray-400 mt-0.5">{c.telephone}</p>}
              </div>
              {peutModifier && !enEdition && (
                <div className="flex gap-1 flex-shrink-0">
                  <button onClick={() => ouvrirEdition(c)} className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-ockham-teal hover:bg-ockham-teal-muted transition-colors text-xs" title="Modifier">✏</button>
                  <button onClick={() => desactiver(c.id)} className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors text-xs" title="Supprimer">✕</button>
                </div>
              )}
            </div>
          </div>
        )
      ))}

      {/* Formulaire ajout */}
      {mode === 'ajouter' && (
        <FormulaireContact form={form} f={f} sauvegarde={sauvegarde} onSoumettre={soumettre} onAnnuler={annuler} titre="Nouveau contact" />
      )}

      {/* Bouton ajouter (si liste non vide et pas de formulaire ouvert) */}
      {peutModifier && contacts.length > 0 && mode === 'liste' && (
        <button onClick={() => setMode('ajouter')} className="w-full text-xs font-semibold text-gray-400 border border-dashed border-gray-200 hover:border-ockham-teal/40 hover:text-ockham-teal py-2.5 rounded-xl transition-colors">
          + Ajouter un contact
        </button>
      )}
    </div>
  )
}

function FormulaireContact({ form, f, sauvegarde, onSoumettre, onAnnuler, titre }: {
  form: typeof FORM_VIDE
  f: (field: keyof typeof FORM_VIDE) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void
  sauvegarde: boolean
  onSoumettre: () => void
  onAnnuler: () => void
  titre: string
}) {
  const valide = form.nom.trim() && form.email.trim()
  return (
    <div className="border border-ockham-teal/20 bg-ockham-teal-muted/40 rounded-xl px-3.5 py-3 space-y-2.5">
      <p className="text-[10px] font-bold text-ockham-teal-dark uppercase tracking-wider">{titre}</p>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[10px] text-gray-400 mb-1">Prénom</label>
          <input value={form.prenom} onChange={f('prenom')} placeholder="Julie" className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-ockham-teal bg-white" />
        </div>
        <div>
          <label className="block text-[10px] text-gray-400 mb-1">Nom *</label>
          <input value={form.nom} onChange={f('nom')} placeholder="Marchand" className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-ockham-teal bg-white" />
        </div>
      </div>
      <div>
        <label className="block text-[10px] text-gray-400 mb-1">Email *</label>
        <input type="email" value={form.email} onChange={f('email')} placeholder="julie@entreprise.fr" className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-ockham-teal bg-white" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[10px] text-gray-400 mb-1">Téléphone</label>
          <input value={form.telephone} onChange={f('telephone')} placeholder="06 00 00 00 00" className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-ockham-teal bg-white" />
        </div>
        <div>
          <label className="block text-[10px] text-gray-400 mb-1">Rôle</label>
          <select value={form.role_contact} onChange={f('role_contact')} className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-ockham-teal bg-white">
            <option value="comptabilite">Comptabilité</option>
            <option value="relance">Relance</option>
            <option value="direction">Direction</option>
            <option value="terrain">Terrain</option>
            <option value="autre">Autre</option>
          </select>
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <button onClick={onAnnuler} className="flex-1 text-xs text-gray-500 border border-gray-200 py-1.5 rounded-lg hover:bg-gray-50 transition-colors">Annuler</button>
        <button onClick={onSoumettre} disabled={!valide || sauvegarde} className="flex-[2] text-xs font-semibold text-white bg-ockham-teal hover:bg-ockham-teal-dark disabled:opacity-40 py-1.5 rounded-lg transition-colors">
          {sauvegarde ? '…' : '✓ Enregistrer'}
        </button>
      </div>
    </div>
  )
}
