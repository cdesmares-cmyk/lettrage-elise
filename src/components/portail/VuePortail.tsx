// Vue Responsable Groupe.
//
// Ce n'est pas un ecran d'accueil : c'est une application a part entiere, avec
// sa propre navigation, qui vit AU-DESSUS des structures. On y entre a chaque
// connexion quand le compte est rattache a plusieurs structures, et on en sort
// en ouvrant l'une d'elles.
//
// Deux onglets : les chiffres de chaque structure, et le choix de celle dans
// laquelle travailler. Aucune ligne comptable n'est chargee ici — uniquement
// des TOTAUX, calcules en base par kpis_mes_organisations() (migration 172).
//
// La navigation est un etat local et non des routes : cette vue remplace
// l'application le temps du choix, elle n'a pas a exister dans son routeur.
import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'

type Onglet = 'tableau-de-bord' | 'organisations'

interface KpiOrg {
  id: string
  nom: string
  code_org: string | null
  est_active: boolean
  encours_ttc: number
  creances: number
  nb_clients: number
  nb_factures: number
  ca12: number
  dso: number | null
  non_echu: number
  retard_1_30: number
  retard_31_60: number
  retard_61_90: number
  retard_90_plus: number
}

// Tranches de la balance agee, dans l'ordre et avec les couleurs du tableau de
// bord : un lecteur qui connait l'un doit reconnaitre l'autre.
const TRANCHES: { cle: keyof KpiOrg; label: string; couleur: string }[] = [
  { cle: 'non_echu',       label: 'Non échu',  couleur: '#4CC5BB' },
  { cle: 'retard_1_30',    label: '1 – 30j',   couleur: '#F0B429' },
  { cle: 'retard_31_60',   label: '31 – 60j',  couleur: '#E8853A' },
  { cle: 'retard_61_90',   label: '61 – 90j',  couleur: '#E05C3E' },
  { cle: 'retard_90_plus', label: '+90j',      couleur: '#A32E1F' },
]

function fmtEuro(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} M€`
  if (n >= 10_000)    return `${Math.round(n / 1_000)} k€`
  return n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
}
function fmtNb(n: number): string { return n.toLocaleString('fr-FR') }

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
  { val: 'tableau-de-bord', label: 'Tableau de bord',   icone: <IcDashboard /> },
  { val: 'organisations',   label: 'Mes organisations', icone: <IcOrganisations /> },
]

function Pastille({ nom }: { nom: string }) {
  return (
    <div
      className="w-9 h-9 rounded-lg flex items-center justify-center font-bold text-[13px] flex-shrink-0"
      style={{ background: '#E6F7F5', color: '#3BA89F' }}
    >
      {nom.slice(0, 2).toUpperCase()}
    </div>
  )
}

function Kpi({ label, valeur, accent }: { label: string; valeur: string; accent?: string }) {
  return (
    <div className="min-w-[88px]">
      <p className="text-[9px] font-bold uppercase tracking-[.08em] text-gray-400 mb-1">{label}</p>
      <p className="font-mono font-bold text-[19px] leading-none tabular-nums" style={{ color: accent ?? '#1F2937' }}>
        {valeur}
      </p>
    </div>
  )
}

function LigneStructure({ k, onOuvrir, enCours }: { k: KpiOrg; onOuvrir: () => void; enCours: boolean }) {
  const [deplie, setDeplie] = useState(false)
  const total = TRANCHES.reduce((s, t) => s + (k[t.cle] as number), 0)

  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-sm px-5 py-4">

      {/* Ligne principale : le nom a gauche, les chiffres toujours aux memes
          colonnes — c'est ce qui permet de balayer les DSO verticalement. */}
      <div className="flex items-center gap-5 flex-wrap">
        <div className="flex items-center gap-3 min-w-[190px]">
          <Pastille nom={k.nom} />
          <div className="min-w-0">
            <p className="font-bold text-gray-900 text-[15px] truncate leading-tight">{k.nom}</p>
            {k.code_org && <p className="text-gray-400 text-[11px] font-mono mt-0.5">{k.code_org}</p>}
          </div>
        </div>

        <div className="flex items-center gap-7 flex-wrap flex-1">
          <Kpi label="DSO roulant"  valeur={k.dso === null ? '—' : `${k.dso.toFixed(1)} j`} accent="#3BA89F" />
          <Kpi label="Encours TTC"  valeur={fmtEuro(k.encours_ttc)} />
          <Kpi label="Clients"      valeur={fmtNb(k.nb_clients)} />
          <Kpi label="Retard +90j"  valeur={fmtEuro(k.retard_90_plus)} accent={k.retard_90_plus > 0 ? '#A32E1F' : undefined} />
        </div>

        <button
          onClick={onOuvrir}
          disabled={enCours}
          className="text-[12px] font-semibold text-ockham-teal hover:text-ockham-teal-dark border border-ockham-teal/30 hover:border-ockham-teal rounded-lg px-3.5 py-1.5 transition-colors disabled:opacity-50 disabled:cursor-wait whitespace-nowrap"
        >
          {enCours ? 'Ouverture…' : 'Ouvrir →'}
        </button>
      </div>

      {/* Balance agee en une barre : la forme se lit d'un coup d'oeil, et elle
          se compare d'une structure a l'autre sans lire un seul chiffre. */}
      {total > 0 && (
        <div className="mt-4">
          <div className="flex h-2 rounded-full overflow-hidden bg-gray-100">
            {TRANCHES.map(t => {
              const v = k[t.cle] as number
              if (v <= 0) return null
              return <div key={t.cle} style={{ width: `${(v / total) * 100}%`, background: t.couleur }} />
            })}
          </div>

          <button
            onClick={() => setDeplie(d => !d)}
            className="text-[11px] text-gray-400 hover:text-gray-600 mt-2 transition-colors"
          >
            {deplie ? 'Masquer le détail' : 'Détail de la balance âgée'}
          </button>

          {deplie && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-3 pt-3 border-t border-gray-100">
              {TRANCHES.map(t => (
                <div key={t.cle}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: t.couleur }} />
                    <span className="text-[10px] font-semibold text-gray-500">{t.label}</span>
                  </div>
                  <p className="font-mono text-[13px] text-gray-800 tabular-nums">{fmtEuro(k[t.cle] as number)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function VuePortail() {
  // On ouvre sur « Mes organisations » : a la connexion, le geste attendu est
  // de choisir une structure, pas de lire des chiffres.
  const [onglet, setOnglet] = useState<Onglet>('organisations')
  const { organisations, basculerStructure, utilisateur } = useAuth()
  const [enCours, setEnCours] = useState<string | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [kpis, setKpis] = useState<KpiOrg[] | null>(null)
  const [erreurKpis, setErreurKpis] = useState<string | null>(null)

  useEffect(() => {
    let annule = false
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(supabase as any).rpc('kpis_mes_organisations')
      .then(({ data, error }: { data: KpiOrg[] | null; error: { message: string } | null }) => {
        if (annule) return
        // Signalee et affichee : une fonction absente ne doit pas se traduire
        // par un ecran vide sans explication.
        if (error) { console.warn('[Ockham] kpis_mes_organisations() a echoue :', error.message); setErreurKpis(error.message) }
        setKpis(data ?? [])
      })
    return () => { annule = true }
  }, [])

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

        {/* Le perimetre, pas une structure : ici on est au-dessus. */}
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
                    <Pastille nom={o.nom} />
                    <div className="min-w-0">
                      <p className="font-bold text-gray-900 text-[15px] truncate leading-tight">{o.nom}</p>
                      {o.code_org && <p className="text-gray-400 text-[11px] font-mono mt-0.5">{o.code_org}</p>}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-3.5 border-t border-gray-100">
                    <span className="text-[12px] font-semibold text-ockham-teal">
                      {enCours === o.id ? 'Ouverture…' : 'Ouvrir l’application'}
                    </span>
                    <span className="text-ockham-teal text-sm group-hover:translate-x-0.5 transition-transform">→</span>
                  </div>
                </button>
              ))}
            </div>
          )}

          {onglet === 'tableau-de-bord' && (
            <div className="flex flex-col gap-3">
              {kpis === null && (
                <p className="text-sm text-gray-400">Calcul des indicateurs…</p>
              )}

              {kpis?.length === 0 && (
                <div className="px-4 py-3 rounded-lg bg-ockham-copper-light border border-ockham-copper/25 text-[13px] text-gray-700">
                  Aucun indicateur disponible. Si vos structures s’affichent dans l’onglet voisin,
                  c’est que la migration 172 n’est pas appliquée.
                  {erreurKpis && (
                    <span className="block mt-1.5 font-mono text-[11px] text-gray-500">{erreurKpis}</span>
                  )}
                </div>
              )}

              {kpis?.map(k => (
                <LigneStructure
                  key={k.id}
                  k={k}
                  enCours={enCours === k.id}
                  onOuvrir={() => ouvrir(k.id)}
                />
              ))}

              {/* Le DSO d'une structure sans chiffre d'affaires de reference ne
                  peut pas se calculer. Le dire vaut mieux qu'afficher un zero. */}
              {kpis && kpis.some(k => k.dso === null) && (
                <p className="text-[12px] text-gray-400 mt-1">
                  Un DSO affiché « — » signifie que la structure n’a pas encore de chiffre
                  d’affaires de référence : il se calcule au premier dépôt de fichier.
                </p>
              )}
            </div>
          )}

        </div>
      </main>
    </div>
  )
}
