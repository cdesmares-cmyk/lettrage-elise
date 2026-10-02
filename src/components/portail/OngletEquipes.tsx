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
  const [recherche, setRecherche] = useState('')
  const [filtreStructure, setFiltreStructure] = useState('')

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

  // Recherche sur le nom ET l'email : on cherche souvent quelqu'un dont on a
  // l'adresse sous les yeux sans se rappeler l'orthographe exacte du nom.
  // La normalisation retire les accents — « Palucci » doit trouver « Palùcci ».
  const normaliser = (v: string) =>
    v.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()

  const visibles = (lignes ?? []).filter(l => {
    if (filtreStructure && !l.structures.includes(filtreStructure)) return false
    if (!recherche.trim()) return true
    const q = normaliser(recherche)
    return normaliser(nomComplet(l)).includes(q) || normaliser(l.email).includes(q)
  })

  return (
    <div className="flex flex-col gap-4">

      <p className="text-[13px] text-gray-500 -mt-3">
        Ouvrez ou fermez l’accès d’une personne à l’une de vos structures.
        La structure d’origine ne peut pas être retirée — elle définit son rattachement.
      </p>

      {/* Barre de recherche — même vocabulaire que celle du Compte client :
          qui connaît l'une se sert de l'autre sans réfléchir. */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-1.5 flex-1 min-w-[220px] max-w-sm">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-400 flex-shrink-0">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="text"
            value={recherche}
            onChange={e => setRecherche(e.target.value)}
            placeholder="Rechercher un nom, un e-mail…"
            className="text-xs text-gray-700 placeholder-gray-400 outline-none w-full bg-transparent"
          />
          {recherche && (
            <button
              onClick={() => setRecherche('')}
              className="text-gray-400 hover:text-gray-600 text-xs flex-shrink-0"
            >✕</button>
          )}
        </div>

        <div className="relative">
          <select
            value={filtreStructure}
            onChange={e => setFiltreStructure(e.target.value)}
            aria-label="Filtrer par structure"
            className={`text-xs font-semibold pl-3 pr-8 py-1.5 rounded-lg border appearance-none bg-white outline-none transition-colors cursor-pointer ${
              filtreStructure
                ? 'border-ockham-teal text-ockham-teal'
                : 'border-gray-200 text-gray-500 hover:border-gray-300'
            }`}
          >
            <option value="">Toutes les structures</option>
            {organisations.map(o => (
              <option key={o.id} value={o.id}>{o.nom}</option>
            ))}
          </select>
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none text-[10px]">▾</span>
        </div>

        {lignes && (
          <span className="text-[12px] text-gray-400 tabular-nums">
            {visibles.length} personne{visibles.length > 1 ? 's' : ''}
            {visibles.length !== lignes.length && ` sur ${lignes.length}`}
          </span>
        )}
      </div>

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

      {lignes && lignes.length > 0 && visibles.length === 0 && (
        <p className="text-sm text-gray-400">Aucune personne ne correspond à cette recherche.</p>
      )}

      {visibles.map(l => {
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
