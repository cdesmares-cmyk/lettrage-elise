// Tracer un echange qui a eu lieu hors d'Ockham : un appel, ou un mail parti
// d'une boite personnelle.
//
// L'objectif est de gagner du temps, pas de remplir un dossier. Rien n'est
// obligatoire sauf le canal : on enregistre meme sans contact et sans
// commentaire, parce qu'un appel trace sans detail deplace quand meme le J+,
// et que c'est l'essentiel. Exiger un texte ferait renoncer a tracer.
//
// La saisie ne cree PAS de fiche contact. Creer une fiche exige un email et se
// heurte a la contrainte UNIQUE (organisation_id, email, code_client) : un
// operateur qui n'a qu'un prenom et un numero de standard serait bloque.
// Cocher une fiche existante n'est qu'un raccourci de saisie.
import { useState } from 'react'
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useContacts } from '../../hooks/useContacts'
import type { Contact } from '../../hooks/useContacts'
import { IcLoader, IcTelephone, IcEnveloppe } from '../Icones'
import { ZoneTexteAuto } from './ZoneTexteAuto'

interface Props {
  codeClient: string
  onEnregistre: () => void
}

type Canal = 'appel' | 'mail'

// Navy sur blanc pour les deux, et pas de teal. Dans Ockham le teal veut deja
// dire « relancer » (bouton Relancer, badges de relance envoyee). Tracer un
// appel deja passe n'est pas declencher une relance : meme couleur, deux
// gestes confondus a l'ecran. Le navy est la couleur de structure, et c'est
// bien du classement qu'on fait ici. Le pictogramme distingue les deux bulles,
// puisque la couleur ne le fait plus.
const CANAUX: { val: Canal; label: string; Icone: typeof IcTelephone }[] = [
  { val: 'appel', label: 'Appel', Icone: IcTelephone },
  { val: 'mail',  label: 'Mail',  Icone: IcEnveloppe },
]

function aujourdhui() {
  return new Date().toISOString().split('T')[0]
}

/** Les quatre champs du contact. Tous facultatifs, tous independants. */
interface ChampsContact {
  nom: string
  prenom: string
  telephone: string
  email: string
}

const CONTACT_VIDE: ChampsContact = { nom: '', prenom: '', telephone: '', email: '' }

// Defini au niveau module : dans le composant parent, il serait remonte a
// chaque frappe et le champ perdrait le focus.
function ChampTexte({ label, value, onChange, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void; type?: string
}) {
  return (
    <label className="block">
      <span className="block text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1">{label}</span>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-[11px] outline-none focus:border-ockham-teal"
      />
    </label>
  )
}

export function FormEchangeClient({ codeClient, onEnregistre }: Props) {
  const { utilisateur, profil } = useAuth()
  const { contacts } = useContacts(codeClient)
  const [canal, setCanal] = useState<Canal | null>(null)
  const [contactId, setContactId] = useState<string | null>(null)
  const [champs, setChamps] = useState<ChampsContact>(CONTACT_VIDE)
  const [date, setDate] = useState(aujourdhui())
  const [commentaire, setCommentaire] = useState('')
  const [retour, setRetour] = useState('')
  const [enCours, setEnCours] = useState(false)

  function fermer() {
    setCanal(null)
    setContactId(null)
    setChamps(CONTACT_VIDE)
    setDate(aujourdhui())
    setCommentaire('')
    setRetour('')
  }

  // Cocher une fiche recopie ses valeurs dans les quatre champs, qui restent
  // modifiables : si le numero a change, on le corrige ici sans aller toucher
  // la fiche contact. Les colonnes enregistrent ce qui a REELLEMENT servi ce
  // jour-la, contact_id garde le lien vers la fiche.
  function choisirContact(ct: Contact) {
    if (contactId === ct.id) {
      setContactId(null)
      setChamps(CONTACT_VIDE)
      return
    }
    setContactId(ct.id)
    setChamps({
      nom:       ct.nom ?? '',
      prenom:    ct.prenom ?? '',
      telephone: ct.telephone ?? '',
      email:     ct.email ?? '',
    })
  }

  function majChamp(cle: keyof ChampsContact, v: string) {
    setChamps(prev => ({ ...prev, [cle]: v }))
  }

  async function enregistrer() {
    if (!canal) return
    setEnCours(true)
    try {
      // organisation_id est pose par le trigger inject_organisation_id : sans
      // lui le RLS rejetterait la ligne en silence.
      const { error } = await supabase.from('echanges_clients').insert({
        code_client:       codeClient,
        canal,
        contact_id:        contactId,
        contact_nom:       champs.nom.trim() || null,
        contact_prenom:    champs.prenom.trim() || null,
        contact_telephone: champs.telephone.trim() || null,
        contact_email:     champs.email.trim() || null,
        commentaire:       commentaire.trim() || null,
        retour_client:     retour.trim() || null,
        echange_le:        date,
        cree_par:          utilisateur?.id ?? null,
        operateur:         profil?.initiales ?? null,
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
        {CANAUX.map(({ val, label, Icone }) => (
          <button
            key={val}
            onClick={() => setCanal(val)}
            className="inline-flex items-center gap-1.5 text-[11px] font-bold text-ockham-navy border border-ockham-navy/25 bg-white px-3 py-1 rounded-full hover:bg-ockham-navy hover:text-white hover:border-ockham-navy transition-colors cursor-pointer"
          >
            <Icone size={12} />
            {label}
          </button>
        ))}
      </div>
    )
  }

  const titre = canal === 'appel' ? 'Appel client' : 'Mail client'
  const Icone = canal === 'appel' ? IcTelephone : IcEnveloppe

  return (
    <div className="border border-ockham-navy/20 rounded-xl p-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="inline-flex items-center gap-1.5 text-[11px] font-bold text-ockham-navy">
          <Icone size={12} />
          {titre}
        </p>
        <button onClick={fermer} className="text-[10px] text-gray-400 hover:text-gray-600 cursor-pointer">
          Annuler
        </button>
      </div>

      {contacts.length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">
            Reprendre un contact connu
          </p>
          <div className="space-y-1">
            {contacts.map(ct => (
              <button
                key={ct.id}
                onClick={() => choisirContact(ct)}
                className={`w-full text-left flex items-center gap-2 px-2.5 py-1.5 rounded-lg border transition-colors cursor-pointer ${
                  contactId === ct.id
                    ? 'border-ockham-teal bg-ockham-teal-muted'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <span className="text-[11px] font-semibold text-gray-700 truncate">
                  {ct.prenom ? `${ct.prenom} ${ct.nom}` : ct.nom}
                </span>
                <span className="text-[10px] text-gray-400 truncate ml-auto">{ct.email}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Contact</p>
        <div className="grid grid-cols-2 gap-2">
          <ChampTexte label="Nom"       value={champs.nom}       onChange={v => majChamp('nom', v)} />
          <ChampTexte label="Prénom"    value={champs.prenom}    onChange={v => majChamp('prenom', v)} />
          <ChampTexte label="Téléphone" value={champs.telephone} onChange={v => majChamp('telephone', v)} type="tel" />
          <ChampTexte label="Mail"      value={champs.email}     onChange={v => majChamp('email', v)} type="email" />
        </div>
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
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Commentaire</p>
        <ZoneTexteAuto value={commentaire} onChange={setCommentaire} placeholder="Ce qui a été dit" />
      </div>

      <div>
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Retour du client</p>
        <ZoneTexteAuto value={retour} onChange={setRetour} placeholder="Peut être complété plus tard" />
      </div>

      <button
        onClick={enregistrer}
        disabled={enCours}
        className="w-full inline-flex items-center justify-center gap-2 bg-ockham-teal hover:bg-ockham-teal-dark disabled:opacity-40 text-white text-[11px] font-bold py-2 rounded-lg transition-colors cursor-pointer"
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
