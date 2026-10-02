// Vue Responsable Groupe.
//
// Ce n'est pas un ecran d'accueil : c'est une application a part entiere, avec
// sa propre navigation, qui vit AU-DESSUS des structures. On y entre a chaque
// connexion quand le compte est rattache a plusieurs structures, et on en sort
// en ouvrant l'une d'elles.
//
// Deux onglets : les chiffres de chaque structure, et le choix de celle dans
// laquelle travailler. Aucune ligne comptable n'est chargee ici — uniquement
// des TOTAUX, calcules en base par kpis_mes_organisations().
//
// Le vocabulaire visuel est celui du tableau de bord, repris au balisage pres :
// tuiles blanches posees sur le fond gris de la page, memes libelles, memes
// seuils de couleur, meme graphique de balance agee. Qui connait l'un lit
// l'autre sans rien apprendre.
import { useState, useEffect } from 'react'
import { ResponsiveContainer, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { destinationCourante } from '../../lib/structureSession'

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
  nb_factures_echues: number
  nb_clients_echus: number
  ca12: number
  dso: number | null
  non_echu: number
  retard_1_30: number
  retard_31_60: number
  retard_61_90: number
  retard_90_plus: number
}

// Memes couleurs et memes tranches que la balance agee du tableau de bord.
const AGE_COLORS = ['#10b981', '#f59e0b', '#f97316', '#ef4444', '#991b1b']
const TRANCHES: { cle: keyof KpiOrg; label: string }[] = [
  { cle: 'non_echu',       label: 'Non échu' },
  { cle: 'retard_1_30',    label: '1 – 30j'  },
  { cle: 'retard_31_60',   label: '31 – 60j' },
  { cle: 'retard_61_90',   label: '61 – 90j' },
  { cle: 'retard_90_plus', label: '+90j'     },
]

// Seuils recopies de BlocKpis : un DSO « Bon » doit avoir la meme teinte dans
// le portail et dans la structure, sinon les deux ecrans se contredisent a
// l'oeil avant de se contredire en chiffres.
function dsoConfig(dso: number) {
  if (dso <= 30) return { texte: '#059669', bg: '#ECFDF5', border: '#A7F3D0', label: 'Excellent' }
  if (dso <= 45) return { texte: '#3BA89F', bg: '#ECFDFB', border: '#CFEDE9', label: 'Bon'       }
  if (dso <= 60) return { texte: '#D97706', bg: '#FFFBEB', border: '#FDE68A', label: 'Attention' }
  return              { texte: '#DC2626', bg: '#FEF2F2', border: '#FECACA', label: 'Critique'  }
}

function fmtEuro(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} M€`
  if (n >= 10_000)    return `${Math.round(n / 1_000)} k€`
  return n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
}
function fmtNb(n: number): string { return n.toLocaleString('fr-FR') }
function fmtK(v: number): string { return v >= 1000 ? `${Math.round(v / 1000)}k€` : String(v) }

function TooltipEuro({ active, payload, label }: {
  active?: boolean
  payload?: { value: number }[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2">
      <p className="text-[11px] font-semibold text-gray-700">{label}</p>
      <p className="text-[12px] font-mono font-bold text-gray-900 tabular-nums">
        {payload[0].value.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })}
      </p>
    </div>
  )
}

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

function BoutonOuvrir({ onClick, enCours }: { onClick: () => void; enCours: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={enCours}
      className="text-[12px] font-semibold text-ockham-teal hover:text-ockham-teal-dark border border-ockham-teal/30 hover:border-ockham-teal rounded-lg px-3.5 py-1.5 transition-colors disabled:opacity-50 disabled:cursor-wait whitespace-nowrap"
    >
      {enCours ? 'Ouverture…' : 'Ouvrir →'}
    </button>
  )
}

/** Tuile au balisage du tableau de bord : fond blanc, coin arrondi large,
 *  ombre legere, bordure teintee selon la gravite. Elle est posee sur le fond
 *  gris de la page — c'est ce contraste qui la fait exister, et c'est
 *  precisement ce qu'une carte englobante blanche detruisait. */
function Tuile({ label, valeur, sous, couleurTexte, couleurBordure, fond, taille = 26 }: {
  label: string; valeur: string; sous: string
  couleurTexte?: string; couleurBordure?: string; fond?: string; taille?: number
}) {
  return (
    <div
      className="bg-white rounded-2xl border shadow-sm px-5 py-4 flex flex-col gap-2"
      style={{ borderColor: couleurBordure ?? '#F3F4F6', background: fond }}
    >
      <span className="text-[10px] font-bold uppercase tracking-[.1em] text-gray-400">{label}</span>
      <span
        className="font-extrabold tabular-nums leading-tight"
        style={{ fontSize: taille, color: couleurTexte ?? '#111827' }}
      >
        {valeur}
      </span>
      <span className="text-[11px] text-gray-400 leading-snug">{sous}</span>
    </div>
  )
}

function BlocStructure({ k, onOuvrir, enCours }: { k: KpiOrg; onOuvrir: () => void; enCours: boolean }) {
  const cfg = dsoConfig(k.dso ?? 0)
  const donnees = TRANCHES.map(t => ({ label: t.label, montant: k[t.cle] as number }))
  const total = donnees.reduce((s, d) => s + d.montant, 0)

  return (
    <section>
      {/* En-tete : qui on regarde, et par ou on y entre. */}
      <div className="flex items-center gap-3 mb-3">
        <Pastille nom={k.nom} />
        <div className="min-w-0 flex-1">
          <p className="font-bold text-gray-900 text-[16px] truncate leading-tight">{k.nom}</p>
          {k.code_org && <p className="text-gray-400 text-[11px] font-mono mt-0.5">{k.code_org}</p>}
        </div>
        <BoutonOuvrir onClick={onOuvrir} enCours={enCours} />
      </div>

      {/* La premiere rangee du tableau de bord d'une structure, meme ordre et
          memes libelles. Les colonnes etant fixes, les DSO s'alignent
          verticalement d'une structure a l'autre. */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr', gap: 12 }}>
        <Tuile
          label="DSO roulant — 12 mois"
          valeur={k.dso === null ? '—' : `${k.dso.toFixed(1)} j`}
          sous={k.dso === null ? 'Chiffre d’affaires de référence absent' : cfg.label}
          taille={32}
          couleurTexte={k.dso === null ? '#D1D5DB' : cfg.texte}
          couleurBordure={k.dso === null ? undefined : cfg.border}
          fond={k.dso === null ? undefined : `linear-gradient(135deg, #fff 60%, ${cfg.bg})`}
        />
        <Tuile
          label="Factures impayées échues"
          valeur={fmtNb(k.nb_factures_echues)}
          sous="Échéance dépassée"
          couleurTexte={k.nb_factures_echues > 0 ? '#DC2626' : undefined}
          couleurBordure={k.nb_factures_echues > 0 ? '#FEE2E2' : undefined}
        />
        <Tuile
          label="Clients avec impayés échus"
          valeur={fmtNb(k.nb_clients_echus)}
          sous="Clients distincts concernés"
          couleurTexte={k.nb_clients_echus > 0 ? '#D97706' : '#9CA3AF'}
          couleurBordure={k.nb_clients_echus > 0 ? '#FEF3C7' : undefined}
        />
        <Tuile
          label="Encours total TTC"
          valeur={fmtEuro(k.encours_ttc)}
          sous="Toutes factures ouvertes"
          taille={22}
        />
      </div>

      {/* Balance agee : le meme graphique que le tableau de bord, resserre.
          La legende passe a droite plutot qu'en dessous — elle y tient sans
          allonger la page, ce qui compte quand on empile quatre structures. */}
      {total > 0 && (
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm mt-3 px-5 py-4">
          <p className="text-[10px] font-bold uppercase tracking-[.1em] text-gray-400 mb-2">
            Balance âgée des créances
          </p>
          <div className="flex gap-6 items-center">
            <div className="flex-1 min-w-0">
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={donnees} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={fmtK} tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={46} />
                  <Tooltip content={<TooltipEuro />} cursor={{ fill: '#f9fafb' }} />
                  <Bar dataKey="montant" radius={[4, 4, 0, 0]} maxBarSize={44}>
                    {donnees.map((_, i) => <Cell key={i} fill={AGE_COLORS[i]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="space-y-1.5 w-[190px] flex-shrink-0">
              {donnees.map((t, i) => (
                <div key={t.label} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: AGE_COLORS[i] }} />
                    <span className="text-gray-600">{t.label}</span>
                  </div>
                  <span className={`font-mono font-semibold tabular-nums ${t.montant > 0 ? 'text-gray-800' : 'text-gray-300'}`}>
                    {fmtEuro(t.montant)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
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
      // On retourne la ou l'utilisateur allait : si le portail s'est affiche
      // sur un lien de notification, le choix d'une structure y ramene. Le
      // parametre org du lien est retire, sinon un choix different de celui du
      // lien ferait rebasculer en boucle.
      await basculerStructure(id, destinationCourante(true))
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
        <div className="px-8 py-7 max-w-[1400px]">

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
                  className="group text-left bg-white border border-gray-100 hover:border-ockham-teal rounded-2xl shadow-sm hover:shadow-md px-5 py-5 transition-all disabled:opacity-50 disabled:cursor-wait"
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
            <div className="flex flex-col gap-9">
              {kpis === null && (
                <p className="text-sm text-gray-400">Calcul des indicateurs…</p>
              )}

              {kpis?.length === 0 && (
                <div className="px-4 py-3 rounded-lg bg-ockham-copper-light border border-ockham-copper/25 text-[13px] text-gray-700">
                  Aucun indicateur disponible. Si vos structures s’affichent dans l’onglet voisin,
                  c’est que la migration 174 n’est pas appliquée.
                  {erreurKpis && (
                    <span className="block mt-1.5 font-mono text-[11px] text-gray-500">{erreurKpis}</span>
                  )}
                </div>
              )}

              {kpis?.map(k => (
                <BlocStructure
                  key={k.id}
                  k={k}
                  enCours={enCours === k.id}
                  onOuvrir={() => ouvrir(k.id)}
                />
              ))}

              {/* Le DSO d'une structure sans chiffre d'affaires de reference ne
                  peut pas se calculer. Le dire vaut mieux qu'afficher un zero. */}
              {kpis && kpis.some(k => k.dso === null) && (
                <p className="text-[12px] text-gray-400">
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
