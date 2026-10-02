// Vue Responsable Groupe.
//
// Ce n'est pas un ecran d'accueil : c'est une application a part entiere, avec
// sa propre navigation, qui vit AU-DESSUS des structures. On y entre a chaque
// connexion quand le compte est rattache a plusieurs structures, et on en sort
// en ouvrant l'une d'elles.
//
// Deux onglets : les chiffres par structure, et le choix de la structure dans
// laquelle travailler. Aucune donnee comptable d'une structure n'est chargee
// ici — seulement des noms, et plus tard des agregats calcules cote serveur.
//
// La navigation est un etat local et non des routes : cette vue remplace
// l'application entiere le temps du choix, elle n'a pas a exister dans le
// routeur de l'application.
import { useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'

type Onglet = 'tableau-de-bord' | 'organisations'

function IcDashboard() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
    </svg>
  )
}

function IcOrganisations() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/>
      <path d="M9 21v-6h6v6"/><path d="M9 11h.01"/><path d="M15 11h.01"/>
    </svg>
  )
}

const ONGLETS: { val: Onglet; label: string; icone: React.ReactNode }[] = [
  { val: 'tableau-de-bord', label: 'Tableau de bord',  icone: <IcDashboard /> },
  { val: 'organisations',   label: 'Mes organisations', icone: <IcOrganisations /> },
]

export function VuePortail() {
  // On ouvre sur « Mes organisations » : a la connexion, le geste attendu est
  // de choisir une structure, pas de lire des chiffres.
  const [onglet, setOnglet] = useState<Onglet>('organisations')
  const { organisations, basculerStructure, utilisateur } = useAuth()
  const [enCours, setEnCours] = useState<string | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)

  async function ouvrir(id: string) {
    setErreur(null)
    setEnCours(id)
    try {
      await basculerStructure(id)
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Structure refusée')
      setEnCours(null)
    }
  }

  async function deconnexion() {
    await supabase.auth.signOut()
    window.location.assign('/connexion')
  }

  const titre = onglet === 'organisations'
    ? { h: 'Mes organisations', s: 'Choisissez la structure dans laquelle travailler' }
    : { h: 'Tableau de bord',   s: 'Vue d’ensemble de vos structures' }

  return (
    <div className="h-screen flex overflow-hidden bg-gray-50">

      {/* ── SIDEBAR ── */}
      <aside className="w-[220px] flex-shrink-0 flex flex-col h-screen" style={{ background: '#0E1A2B' }}>

        <div className="flex items-center gap-2.5 px-4 py-5 border-b border-white/[0.06]">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center font-extrabold text-[1.1rem] flex-shrink-0"
            style={{ background: 'rgba(76,197,187,0.1)', color: '#4CC5BB', border: '1.5px solid rgba(76,197,187,0.35)' }}
          >O</div>
          <span className="text-white font-bold text-[15px] tracking-[0.06em]">OCKHAM</span>
        </div>

        {/* Le perimetre, pas une structure : on est au-dessus. */}
        <div className="px-4 py-2.5 border-b border-white/[0.06] bg-ockham-teal/[0.07]">
          <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-ockham-teal/70 mb-0.5">
            Périmètre
          </p>
          <p className="text-white text-[13px] font-semibold leading-tight">
            {organisations.length} structures
          </p>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-3 flex flex-col gap-0.5">
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-white/40 px-2.5 pt-1 pb-1.5">
            Navigation
          </p>

          {ONGLETS.map(({ val, label, icone }) => {
            const actif = onglet === val
            return (
              <button
                key={val}
                onClick={() => setOnglet(val)}
                className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium transition-colors border text-left ${
                  actif
                    ? 'bg-ockham-teal/[0.12] text-ockham-teal border-ockham-teal/20'
                    : 'text-white/65 border-transparent hover:bg-white/[0.05] hover:text-white/90'
                }`}
              >
                <span className={actif ? 'text-ockham-teal' : 'text-white/55'}>{icone}</span>
                {label}
              </button>
            )
          })}
        </nav>

        <div className="px-3 py-3 border-t border-white/[0.06]">
          <p className="text-white/70 text-[12px] font-semibold truncate">
            {utilisateur?.email?.split('@')[0]}
          </p>
          <button
            onClick={deconnexion}
            className="text-white/35 hover:text-white/70 text-[11px] transition-colors mt-0.5"
          >
            Se déconnecter
          </button>
        </div>
      </aside>

      {/* ── CONTENU ── */}
      <main className="flex-1 overflow-y-auto">
        <div className="px-8 py-7 max-w-6xl">

          <h1 className="text-[26px] font-bold text-gray-900 leading-tight">{titre.h}</h1>
          <p className="text-sm text-gray-500 mt-1 mb-7">{titre.s}</p>

          {erreur && (
            <div className="mb-5 px-4 py-2.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
              {erreur}
            </div>
          )}

          {onglet === 'organisations' && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {organisations.map(o => (
                <button
                  key={o.id}
                  onClick={() => ouvrir(o.id)}
                  disabled={enCours !== null}
                  className="group text-left bg-white border border-gray-100 hover:border-ockham-teal rounded-xl shadow-sm hover:shadow-md px-5 py-5 transition-all disabled:opacity-50 disabled:cursor-wait"
                >
                  <div className="flex items-start gap-3 mb-5">
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center font-bold text-[13px] flex-shrink-0"
                      style={{ background: '#E6F7F5', color: '#3BA89F' }}
                    >
                      {o.nom.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-gray-900 text-[15px] truncate leading-tight">{o.nom}</p>
                      {o.code_org && (
                        <p className="text-gray-400 text-[11px] font-mono mt-0.5">{o.code_org}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-3.5 border-t border-gray-100">
                    <span className="text-[12px] font-semibold text-ockham-teal">
                      {enCours === o.id ? 'Ouverture…' : 'Ouvrir l’application'}
                    </span>
                    <span className="text-ockham-teal text-sm translate-x-0 group-hover:translate-x-0.5 transition-transform">→</span>
                  </div>
                </button>
              ))}
            </div>
          )}

          {onglet === 'tableau-de-bord' && (
            <>
              {/* Les chiffres viendront d'agregats calcules cote serveur, un par
                  structure. Tant qu'ils n'existent pas, on montre la place
                  qu'ils occuperont plutot que des valeurs inventees. */}
              <div className="mb-5 px-4 py-3 rounded-lg bg-ockham-copper-light border border-ockham-copper/25 text-[13px] text-gray-700">
                Les indicateurs par structure arrivent au prochain lot. Ils seront calculés
                chaque nuit, structure par structure — aucune donnée comptable ne circulera
                d’une société à l’autre.
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {organisations.map(o => (
                  <div key={o.id} className="bg-white border border-gray-100 rounded-xl shadow-sm px-5 py-5">
                    <div className="flex items-start gap-3 mb-5">
                      <div
                        className="w-9 h-9 rounded-lg flex items-center justify-center font-bold text-[13px] flex-shrink-0"
                        style={{ background: '#E6F7F5', color: '#3BA89F' }}
                      >
                        {o.nom.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-gray-900 text-[15px] truncate leading-tight">{o.nom}</p>
                        {o.code_org && (
                          <p className="text-gray-400 text-[11px] font-mono mt-0.5">{o.code_org}</p>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      {['Encours TTC', 'Clients', 'Retard +90j'].map(label => (
                        <div key={label}>
                          <p className="text-[9px] font-bold uppercase tracking-[.08em] text-gray-400 mb-1">{label}</p>
                          <p className="text-gray-300 font-mono text-lg leading-none">—</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

        </div>
      </main>
    </div>
  )
}
