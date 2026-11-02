// Tracer un échange qui a eu lieu hors d'Ockham : un appel, ou un mail parti
// d'une boîte personnelle.
//
// L'objectif est de gagner du temps, pas de remplir un dossier. Rien n'est
// obligatoire sauf le canal : on enregistre même sans commentaire, parce
// qu'un appel tracé sans détail déplace quand même le J+, et que c'est
// l'essentiel. Exiger un texte ferait renoncer à tracer.
//
// Le contact se coche dans la liste du client, ou s'écrit en clair. La saisie
// libre ne crée PAS de fiche contact : si l'opérateur n'a qu'un prénom et un
// standard, il ne doit pas être bloqué par un formulaire qui réclame un email.
import { useState } from 'react'
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useContacts } from '../../hooks/useContacts'
import { IcLoader } from '../Icones'

interface Props {
  codeClient: string
  onEnregistre: () => void
}

type Canal = 'appel' | 'mail'

const CANAUX: { val: Canal; label: string; cls: string }[] = [
  // Ocre pour l'appel, teal pour le mail.
  { val: 'appel', label: 'Appel', cls: 'border-ockham-copper/40 bg-ockham-copper/10 text-ockham-copper hover:bg-ockham-copper/20' },
  { val: 'mail',  label: 'Mail',  cls: 'border-ockham-teal/40 bg-ockham-teal-muted text-ockham-teal-dark hover:bg-ockham-teal-muted/70' },
]

function aujourdhui() {
  return new Date().toISOString().split('T')[0]
}

export function FormEchangeClient({ codeClient, onEnregistre }: Props) {
  const { utilisateur, profil } = useAuth()
  const { contacts } = useContacts(codeClient)
  const [canal, setCanal] = useState<Canal | null>(null)
  const [contactId, setContactId] = useState<string | null>(null)
  const [contactLibre, setContactLibre] = useState('')
  const [date, setDate] = useState(aujourdhui())
  const [commentaire, setCommentaire] = useState('')
  const [retour, setRetour] = useState('')
  const [enCours, setEnCours] = useState(false)

  function fermer() {
    setCanal(null)
    setContactId(null)
    setContactLibre('')
    setDate(aujourdhui())
    setCommentaire('')
    setRetour('')
  }

  async function enregistrer() {
    if (!canal) return
    setEnCours(true)
    try {
      // organisation_id est posé par le trigger inject_organisation_id : sans
      // lui le RLS rejetterait la ligne en silence.
      const { error } = await supabase.from('echanges_clients').insert({
        code_client:   codeClient,
        canal,
        contact_id:    contactId,
        contact_libre: contactLibre.trim() || null,
        commentaire:   commentaire.trim() || null,
        retour_client: retour.trim() || null,
        echange_le:    date,
        cree_par:      utilisateur?.id ?? null,
        operateur:     profil?.initiales ?? null,
      } as never)
      if (error) throw error
      toast.success(canal === 'appel' ? 'Appel enregistré' : 'Mail enregistré')
      fermer()
      onEnregistre()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur lors de l\'enregistrement.')
    } finally {
      setEnCours(false)
    }
  }

  if (!canal) {
    return (
      <div className="flex gap-2">
        {CANAUX.map(c => (
          <button
            key={c.val}
            onClick={() => setCanal(c.val)}
            className={`flex-1 text-[11px] font-bold py-2 rounded-full border transition-colors ${c.cls}`}
          >
            {c.label}
          </button>
        ))}
      </div>
    )
  }

  const titre = canal === 'appel' ? 'Appel client' : 'Mail hors Ockham'
  const accent = canal === 'appel' ? 'border-ockham-copper/30' : 'border-ockham-teal/30'

  return (
    <div className={`border rounded-xl p-3 space-y-3 ${accent}`}>
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-bold text-ockham-navy">{titre}</p>
        <button onClick={fermer} className="text-[10px] text-gray-400 hover:text-gray-600">Annuler</button>
      </div>

      <div>
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Contact</p>
        {contacts.length > 0 && (
          <div className="space-y-1 mb-2">
            {contacts.map(ct => (
              <label key={ct.id}
                     className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border cursor-pointer transition-colors ${
                       contactId === ct.id ? 'border-ockham-teal bg-ockham-teal-muted' : 'border-gray-200 hover:border-gray-300'
                     }`}>
                <input
                  type="checkbox"
                  checked={contactId === ct.id}
                  onChange={() => setContactId(contactId === ct.id ? null : ct.id)}
                  className="accent-ockham-teal flex-shrink-0"
                />
                <span className="text-[11px] font-semibold text-gray-700 truncate">
                  {ct.prenom ? `${ct.prenom} ${ct.nom}` : ct.nom}
                </span>
                <span className="text-[10px] text-gray-400 truncate">{ct.email}</span>
              </label>
            ))}
          </div>
        )}
        <input
          type="text"
          value={contactLibre}
          onChange={e => setContactLibre(e.target.value)}
          placeholder="ou saisir un nom, un service, un numéro…"
          className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-[11px] outline-none focus:border-ockham-teal"
        />
      </div>

      <div>
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Date</p>
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-[11px] outline-none focus:border-ockham-teal"
        />
      </div>

      <div>
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Ce qui a été dit</p>
        <textarea
          value={commentaire}
          onChange={e => setCommentaire(e.target.value)}
          rows={2}
          placeholder="Facultatif"
          className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-[11px] outline-none focus:border-ockham-teal resize-none"
        />
      </div>

      <div>
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Retour du client</p>
        <textarea
          value={retour}
          onChange={e => setRetour(e.target.value)}
          rows={2}
          placeholder="Facultatif, peut être complété plus tard"
          className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-[11px] outline-none focus:border-ockham-teal resize-none"
        />
      </div>

      <button
        onClick={enregistrer}
        disabled={enCours}
        className="w-full inline-flex items-center justify-center gap-2 bg-ockham-teal hover:bg-ockham-teal-dark disabled:opacity-40 text-white text-[11px] font-bold py-2 rounded-lg transition-colors"
      >
        {enCours ? <><IcLoader size={12} /> Enregistrement…</> : 'Enregistrer'}
      </button>

      <p className="text-[10px] text-gray-400 leading-snug">
        Compte comme un contact client : le J+ repart de cette date. Sans effet sur le niveau
        de relance, qui ne mesure que l'escalade sur les factures impayées.
      </p>
    </div>
  )
}
