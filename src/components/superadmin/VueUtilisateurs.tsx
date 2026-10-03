// Toutes les personnes, toutes organisations confondues.
//
// L'ecran superadmin etait organisation d'abord : pour trouver quelqu'un il
// fallait deja savoir ou il est. A six societes ca passe, a cent non.
//
// Chaque ligne distingue deux choses qu'on ne doit jamais confondre :
//   l'ORIGINE — la societe a laquelle la personne appartient, affichee en clair
//   les ACCES — les societes qu'elle peut en plus consulter, en pastilles
//
// Deplacer quelqu'un (changer son origine) et lui ouvrir un acces sont deux
// gestes opposes : le premier lui fait perdre ses clients. L'ecran ne propose
// aujourd'hui que le second.
import { useState, useEffect } from 'react'
import { useSuperAdminUtilisateurs, type UtilisateurGlobalSA } from '../../hooks/useSuperAdminUtilisateurs'
import { ModalStructuresUtilisateur } from './ModalStructuresUtilisateur'

const LIBELLE_ROLE: Record<string, string> = {
  admin:                    'Admin',
  responsable_poste_client: 'Credit Manager',
  commercial:               'Commercial',
  externe:                  'Externe',
  superadmin:               'Super Admin',
  lecteur:                  'Lecteur',
}

// Retire les accents : « Palucci » doit trouver « Palùcci ».
const normaliser = (v: string) =>
  v.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()

const nomComplet = (u: UtilisateurGlobalSA) =>
  u.prenom ? `${u.prenom} ${u.nom ?? ''}`.trim() : (u.nom ?? u.email.split('@')[0])

export function VueUtilisateurs() {
  const { utilisateurs, organisations, erreur, charger } = useSuperAdminUtilisateurs()
  const [recherche, setRecherche] = useState('')
  const [filtreOrg, setFiltreOrg] = useState('')
  const [fiche, setFiche] = useState<UtilisateurGlobalSA | null>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => { charger() }, [charger, version])

  const nomParOrg = new Map(organisations.map(o => [o.id, o.nom]))

  const visibles = (utilisateurs ?? []).filter(u => {
    // Le filtre par societe retient l'origine ET les acces : on cherche « qui
    // touche a Bordeaux », pas « qui en vient ».
    if (filtreOrg && u.organisation_id !== filtreOrg && !u.acces.includes(filtreOrg)) return false
    if (!recherche.trim()) return true
    const q = normaliser(recherche)
    return normaliser(nomComplet(u)).includes(q)
        || normaliser(u.email).includes(q)
        || normaliser(u.org_nom).includes(q)
  })

  return (
    <>
      <div className="flex items-center gap-3 flex-wrap mb-5">
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2 flex-1 min-w-[240px] max-w-md">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-400 flex-shrink-0">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="text"
            value={recherche}
            onChange={e => setRecherche(e.target.value)}
            placeholder="Rechercher un nom, un e-mail, une société…"
            className="text-xs text-gray-700 placeholder-gray-400 outline-none w-full bg-transparent"
          />
          {recherche && (
            <button onClick={() => setRecherche('')} className="text-gray-400 hover:text-gray-600 text-xs flex-shrink-0">✕</button>
          )}
        </div>

        <div className="relative">
          <select
            value={filtreOrg}
            onChange={e => setFiltreOrg(e.target.value)}
            aria-label="Filtrer par société"
            className={`text-xs font-semibold pl-3 pr-8 py-2 rounded-lg border appearance-none bg-white outline-none cursor-pointer transition-colors ${
              filtreOrg ? 'border-ockham-teal text-ockham-teal' : 'border-gray-200 text-gray-500 hover:border-gray-300'
            }`}
          >
            <option value="">Toutes les sociétés</option>
            {organisations.map(o => <option key={o.id} value={o.id}>{o.nom}</option>)}
          </select>
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none text-[10px]">▾</span>
        </div>

        {utilisateurs && (
          <span className="text-[12px] text-gray-400 tabular-nums">
            {visibles.length} personne{visibles.length > 1 ? 's' : ''}
            {visibles.length !== utilisateurs.length && ` sur ${utilisateurs.length}`}
          </span>
        )}
      </div>

      {erreur && (
        <div className="mb-4 px-4 py-2.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
          {erreur}
        </div>
      )}

      {utilisateurs === null && <p className="text-sm text-gray-400">Chargement…</p>}

      {utilisateurs && visibles.length === 0 && (
        <p className="text-sm text-gray-400">Aucune personne ne correspond à cette recherche.</p>
      )}

      <div className="flex flex-col gap-2.5">
        {visibles.map(u => (
          <div key={u.id} className="bg-white border border-gray-100 rounded-2xl shadow-sm px-5 py-4">
            <div className="flex items-center gap-4 flex-wrap">
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center font-bold text-[12px] flex-shrink-0"
                style={{ background: '#E6F7F5', color: '#3BA89F' }}
              >
                {(u.initiales || nomComplet(u).slice(0, 2)).toUpperCase().slice(0, 3)}
              </div>

              <div className="min-w-0 flex-1">
                <p className="font-bold text-gray-900 text-[14px] truncate leading-tight">
                  {nomComplet(u)}
                  {u.suspendu && (
                    <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-50 text-red-600">Suspendu</span>
                  )}
                  {!u.suspendu && u.invitation_en_attente && (
                    <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-600">Invitation en attente</span>
                  )}
                </p>
                <p className="text-gray-400 text-[11px] truncate mt-0.5">{u.email}</p>
              </div>

              <div className="min-w-[180px]">
                <p className="text-[9px] font-bold uppercase tracking-[.08em] text-gray-400 mb-0.5">Société d’origine</p>
                <p className="text-[13px] font-semibold text-gray-800 truncate">{u.org_nom}</p>
              </div>

              <span className="text-[10px] font-bold uppercase tracking-[.08em] text-gray-400 min-w-[100px]">
                {LIBELLE_ROLE[u.role] ?? u.role}
              </span>

              <button
                onClick={() => setFiche(u)}
                className="text-[12px] font-semibold text-ockham-teal hover:text-ockham-teal-dark border border-ockham-teal/30 hover:border-ockham-teal rounded-lg px-3.5 py-1.5 transition-colors whitespace-nowrap"
              >
                Accès →
              </button>
            </div>

            {/* Les acces supplementaires, en pastilles. Absents chez la quasi
                totalite des comptes : c'est normal, un compte mono-societe n'en
                a aucun. */}
            {u.acces.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap mt-3 pt-3 border-t border-gray-100">
                <span className="text-[9px] font-bold uppercase tracking-[.08em] text-gray-400">
                  Accès supplémentaires
                </span>
                {u.acces.map(id => (
                  <span key={id} className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-ockham-teal-muted text-ockham-teal-dark">
                    {nomParOrg.get(id) ?? '—'}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {fiche && (
        <ModalStructuresUtilisateur
          userId={fiche.id}
          email={fiche.email}
          origineId={fiche.organisation_id}
          onFermer={() => { setFiche(null); setVersion(v => v + 1) }}
        />
      )}
    </>
  )
}
