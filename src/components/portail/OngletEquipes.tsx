// Onglet Equipes du portail.
//
// Qui accede a quelle structure, et de quoi le changer. Une ligne par personne,
// les structures du perimetre en pastilles : pleine quand l'acces est ouvert,
// vide quand il ne l'est pas. Un clic bascule.
//
// L'ecran ne decide rien. Chaque clic appelle ouvrir_structure() ou
// fermer_structure(), qui reverifient tout en base — role de l'appelant,
// appartenance a la structure, appartenance de la personne au perimetre. Un
// refus remonte tel quel, avec son message.
//
// Aucune donnee comptable ici : des noms, des emails, des roles.
import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'

interface LigneEquipe {
  utilisateur_id: string
  prenom: string | null
  nom: string
  email: string
  role: string
  origine_id: string
  structures: string[]
}

const LIBELLE_ROLE: Record<string, string> = {
  admin:                    'Administrateur',
  responsable_poste_client: 'Resp. poste client',
  commercial:               'Commercial',
}

export function OngletEquipes() {
  const { organisations, utilisateur } = useAuth()
  const [lignes, setLignes] = useState<LigneEquipe[] | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [enCours, setEnCours] = useState<string | null>(null)

  // Un compteur plutot qu'une fonction de rechargement : apres une ecriture on
  // l'incremente, et l'effet relit. La lecture reste au meme endroit, et l'etat
  // n'est pose que dans la reponse de la requete.
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let annule = false
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(supabase as any).rpc('equipes_mes_organisations')
      .then(({ data, error }: { data: LigneEquipe[] | null; error: { message: string } | null }) => {
        if (annule) return
        if (error) {
          console.warn('[Ockham] equipes_mes_organisations() a echoue :', error.message)
          setErreur(error.message)
        }
        setLignes(data ?? [])
      })
    return () => { annule = true }
  }, [version])

  async function basculerAcces(l: LigneEquipe, orgId: string, ouvert: boolean) {
    setErreur(null)
    setEnCours(l.utilisateur_id + orgId)
    const fn = ouvert ? 'fermer_structure' : 'ouvrir_structure'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).rpc(fn, {
      p_utilisateur_id: l.utilisateur_id,
      p_organisation_id: orgId,
    })
    if (error) setErreur(error.message)
    else setVersion(v => v + 1)
    setEnCours(null)
  }

  const nomComplet = (l: LigneEquipe) => (l.prenom ? `${l.prenom} ${l.nom}` : l.nom)

  return (
    <div className="flex flex-col gap-4">

      <p className="text-[13px] text-gray-500 -mt-3">
        Ouvrez ou fermez l’accès d’une personne à l’une de vos structures.
        La structure d’origine ne peut pas être retirée — elle définit son rattachement.
      </p>

      {erreur && (
        <div className="px-4 py-2.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
          {erreur}
        </div>
      )}

      {lignes === null && <p className="text-sm text-gray-400">Chargement…</p>}

      {lignes?.length === 0 && (
        <div className="px-4 py-3 rounded-lg bg-ockham-copper-light border border-ockham-copper/25 text-[13px] text-gray-700">
          Aucune personne dans votre périmètre. Si cet écran reste vide alors que vos
          structures s’affichent, c’est que la migration 176 n’est pas appliquée.
        </div>
      )}

      {lignes?.map(l => {
        const estMoi = l.utilisateur_id === utilisateur?.id
        return (
          <div key={l.utilisateur_id} className="bg-white border border-gray-100 rounded-2xl shadow-sm px-5 py-4">
            <div className="flex items-center gap-3 mb-3.5">
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center font-bold text-[13px] flex-shrink-0"
                style={{ background: '#E6F7F5', color: '#3BA89F' }}
              >
                {nomComplet(l).slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-gray-900 text-[14px] truncate leading-tight">
                  {nomComplet(l)}
                  {estMoi && <span className="text-gray-400 font-normal"> · vous</span>}
                </p>
                <p className="text-gray-400 text-[11px] truncate mt-0.5">{l.email}</p>
              </div>
              <span className="text-[10px] font-bold uppercase tracking-[.08em] text-gray-400 flex-shrink-0">
                {LIBELLE_ROLE[l.role] ?? l.role}
              </span>
            </div>

            <div className="flex flex-wrap gap-2 pt-3.5 border-t border-gray-100">
              {organisations.map(o => {
                const ouvert    = l.structures.includes(o.id)
                const origine   = l.origine_id === o.id
                // Deux refus que la base opposerait de toute facon : on ne les
                // propose pas plutot que de laisser cliquer pour rien.
                const verrouille = (ouvert && origine) || (ouvert && estMoi)
                const cle = l.utilisateur_id + o.id
                return (
                  <button
                    key={o.id}
                    onClick={() => !verrouille && basculerAcces(l, o.id, ouvert)}
                    disabled={verrouille || enCours !== null}
                    title={
                      origine    ? 'Structure d’origine — ne peut pas être retirée'
                      : estMoi && ouvert ? 'Vous ne pouvez pas retirer votre propre accès'
                      : ouvert   ? 'Retirer l’accès'
                      :            'Ouvrir l’accès'
                    }
                    className={`text-[12px] font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
                      ouvert
                        ? 'bg-ockham-teal-muted border-ockham-teal/30 text-ockham-teal-dark'
                        : 'bg-white border-gray-200 text-gray-400 hover:border-ockham-teal hover:text-ockham-teal'
                    } ${verrouille ? 'opacity-70 cursor-default' : 'cursor-pointer'} ${
                      enCours !== null ? 'opacity-50' : ''
                    }`}
                  >
                    {enCours === cle ? '…' : ouvert ? '✓ ' : '+ '}
                    {o.nom}
                    {origine && <span className="font-normal opacity-60"> · origine</span>}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
