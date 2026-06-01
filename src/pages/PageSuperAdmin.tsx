import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useSuperAdmin, type OrganisationSA } from '../hooks/useSuperAdmin'
import toast from 'react-hot-toast'

// ── Icônes SVG inline ──────────────────────────────────────────────────────

function IcBuilding() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 21h18M9 21V7l6-4v18M9 11h6M9 15h6M9 7h.01"/>
    </svg>
  )
}

function IcUsers() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  )
}

function IcEuro() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 10h12M4 14h12M19.5 8a6.5 6.5 0 1 0 0 8"/>
    </svg>
  )
}

function IcRefresh({ spin }: { spin?: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={spin ? 'animate-spin' : ''}>
      <path d="M23 4v6h-6"/><path d="M1 20v-6h6"/>
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
    </svg>
  )
}

function IcPlus() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  )
}

function IcChevron({ open }: { open: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  )
}

function IcX() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formaterEuros(val: number) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(val)
}

function formaterDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function slugifier(val: string) {
  return val.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// ── Composant carte métrique ───────────────────────────────────────────────

function CarteMetrique({ label, valeur, icone, couleur }: {
  label: string
  valeur: string | number
  icone: React.ReactNode
  couleur: string
}) {
  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${couleur}`}>
      <div className="flex-shrink-0 opacity-70">{icone}</div>
      <div>
        <p className="text-xs font-medium opacity-60 leading-none mb-0.5">{label}</p>
        <p className="text-sm font-bold leading-none">{valeur}</p>
      </div>
    </div>
  )
}

// ── Ligne organisation avec accordéon utilisateurs ─────────────────────────

function LigneOrganisation({ org, onToggle }: {
  org: OrganisationSA
  onToggle: (id: string, actif: boolean) => void
}) {
  const [ouvert, setOuvert] = useState(false)

  return (
    <>
      <tr className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${!org.actif ? 'opacity-50' : ''}`}>
        <td className="py-3 px-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setOuvert(v => !v)}
              className="text-gray-400 hover:text-gray-700 cursor-pointer"
              title="Voir les utilisateurs"
            >
              <IcChevron open={ouvert} />
            </button>
            <div>
              <p className="text-sm font-semibold text-gray-800">{org.nom}</p>
              <p className="text-[11px] text-gray-400 font-mono">{org.slug}</p>
            </div>
          </div>
        </td>
        <td className="py-3 px-4 text-center">
          <span className="text-sm font-medium text-gray-700">{org.nb_utilisateurs}</span>
        </td>
        <td className="py-3 px-4 text-center">
          <span className="text-sm font-medium text-gray-700">{org.nb_clients}</span>
        </td>
        <td className="py-3 px-4 text-right">
          <span className="text-sm font-semibold text-gray-800">{formaterEuros(org.encours_total)}</span>
        </td>
        <td className="py-3 px-4 text-center">
          <span className="text-[11px] text-gray-400">{formaterDate(org.cree_le)}</span>
        </td>
        <td className="py-3 px-4 text-center">
          <button
            onClick={() => onToggle(org.id, !org.actif)}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer ${
              org.actif ? 'bg-ockham-teal' : 'bg-gray-300'
            }`}
            title={org.actif ? 'Désactiver' : 'Activer'}
          >
            <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
              org.actif ? 'translate-x-4' : 'translate-x-1'
            }`} />
          </button>
        </td>
      </tr>

      {ouvert && (
        <tr className="bg-ockham-teal-muted/40 border-b border-ockham-teal/10">
          <td colSpan={6} className="px-10 py-3">
            {org.utilisateurs.length === 0 ? (
              <p className="text-xs text-gray-400 italic">Aucun utilisateur dans cette organisation.</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-400 uppercase tracking-wide">
                    <th className="text-left pb-1.5 pr-6 font-medium">Nom</th>
                    <th className="text-left pb-1.5 pr-6 font-medium">Email</th>
                    <th className="text-left pb-1.5 pr-6 font-medium">Rôle</th>
                    <th className="text-left pb-1.5 font-medium">Inscrit le</th>
                  </tr>
                </thead>
                <tbody>
                  {org.utilisateurs.map(u => (
                    <tr key={u.id} className="border-t border-ockham-teal/10">
                      <td className="py-1.5 pr-6 font-medium text-gray-700">{u.nom_affiche || '—'}</td>
                      <td className="py-1.5 pr-6 text-gray-500">{u.email}</td>
                      <td className="py-1.5 pr-6">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          u.role === 'admin'
                            ? 'bg-ockham-navy/10 text-ockham-navy'
                            : u.role === 'commercial'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-gray-100 text-gray-600'
                        }`}>
                          {u.role}
                        </span>
                      </td>
                      <td className="py-1.5 text-gray-400">{formaterDate(u.cree_le)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

// ── Skeleton chargement ────────────────────────────────────────────────────

function SkeletonTable({ lignes = 4 }: { lignes?: number }) {
  return (
    <tbody>
      {Array.from({ length: lignes }).map((_, i) => (
        <tr key={i} className="border-b border-gray-100">
          {Array.from({ length: 7 }).map((__, j) => (
            <td key={j} className="py-3 px-4">
              <div className="h-4 bg-gray-100 rounded animate-pulse" style={{ width: j === 0 ? '80%' : '60%' }} />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  )
}

// ── Modal Nouvelle Organisation ────────────────────────────────────────────

function ModalNouvelleOrg({
  ouvert,
  onFermer,
  onCreer,
}: {
  ouvert: boolean
  onFermer: () => void
  onCreer: (params: { nom: string; slug: string; email_admin: string; nom_admin: string }) => Promise<boolean>
}) {
  const [nom, setNom] = useState('')
  const [slug, setSlug] = useState('')
  const [slugManuel, setSlugManuel] = useState(false)
  const [emailAdmin, setEmailAdmin] = useState('')
  const [nomAdmin, setNomAdmin] = useState('')
  const [envoi, setEnvoi] = useState(false)

  function resetForm() {
    setNom('')
    setSlug('')
    setSlugManuel(false)
    setEmailAdmin('')
    setNomAdmin('')
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
    if (ok) {
      resetForm()
      onFermer()
    }
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
            <label className="block text-xs font-semibold text-gray-600 mb-1">Nom de l'organisation <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={nom}
              onChange={e => handleNomChange(e.target.value)}
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
              type="text"
              value={slug}
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
                <label className="block text-xs font-semibold text-gray-600 mb-1">Email admin <span className="text-red-500">*</span></label>
                <input
                  type="email"
                  value={emailAdmin}
                  onChange={e => setEmailAdmin(e.target.value)}
                  placeholder="admin@client.com"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ockham-teal/30 focus:border-ockham-teal"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Nom affiché</label>
                <input
                  type="text"
                  value={nomAdmin}
                  onChange={e => setNomAdmin(e.target.value)}
                  placeholder="Prénom Nom"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ockham-teal/30 focus:border-ockham-teal"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={() => { resetForm(); onFermer() }}
              disabled={envoi}
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

// ── Métriques globales ─────────────────────────────────────────────────────

function BlocMetriquesGlobales({ organisations }: { organisations: OrganisationSA[] }) {
  const actives = organisations.filter(o => o.actif).length
  const totalClients = organisations.reduce((s, o) => s + o.nb_clients, 0)
  const totalEncours = organisations.reduce((s, o) => s + o.encours_total, 0)

  return (
    <div className="grid grid-cols-3 gap-3 mb-6">
      <CarteMetrique
        label="Organisations actives"
        valeur={`${actives} / ${organisations.length}`}
        icone={<IcBuilding />}
        couleur="bg-ockham-teal-muted border-ockham-teal/20 text-ockham-teal-dark"
      />
      <CarteMetrique
        label="Clients total"
        valeur={totalClients}
        icone={<IcUsers />}
        couleur="bg-blue-50 border-blue-100 text-blue-700"
      />
      <CarteMetrique
        label="Encours global"
        valeur={formaterEuros(totalEncours)}
        icone={<IcEuro />}
        couleur="bg-purple-50 border-purple-100 text-purple-700"
      />
    </div>
  )
}

// ── Page principale ────────────────────────────────────────────────────────

export function PageSuperAdmin() {
  const { profil, chargement: chargementAuth } = useAuth()
  const { organisations, chargement, erreur, chargerDashboard, creerOrganisation, toggleOrg } = useSuperAdmin()
  const [modalOuvert, setModalOuvert] = useState(false)

  useEffect(() => {
    if (profil?.role === 'superadmin') {
      chargerDashboard()
    }
  }, [profil?.role, chargerDashboard])

  if (chargementAuth) return null

  if (!profil || profil.role !== 'superadmin') {
    return <Navigate to="/tableau-de-bord" replace />
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* En-tête */}
      <header className="bg-ockham-navy border-b border-ockham-teal/20 px-8 py-4 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center font-extrabold text-[1.1rem] bg-ockham-teal/10">
            <span className="text-ockham-teal">O</span>
          </div>
          <div>
            <span className="text-white font-bold text-sm tracking-wide">OCKHAM</span>
            <span className="ml-2 px-2 py-0.5 bg-ockham-teal/20 text-ockham-teal text-[10px] font-bold rounded-full uppercase tracking-wider">
              Super Admin
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400">{profil.nom_affiche || profil.role}</span>
          <a href="/tableau-de-bord" className="text-xs text-slate-400 hover:text-white transition-colors cursor-pointer">
            ← Retour à l'app
          </a>
        </div>
      </header>

      <main className="max-w-screen-xl mx-auto px-8 py-8">
        {/* Titre + actions */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Pilotage multi-organisations</h1>
            <p className="text-sm text-gray-500 mt-0.5">Vue consolidée de toutes les organisations OCKHAM Finance</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={chargerDashboard}
              disabled={chargement}
              className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-gray-600 hover:text-gray-900 border border-gray-200 hover:border-gray-300 rounded-lg transition-colors cursor-pointer disabled:opacity-40"
            >
              <IcRefresh spin={chargement} />
              Actualiser
            </button>
            <button
              onClick={() => setModalOuvert(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-ockham-teal text-white rounded-lg hover:bg-ockham-teal-dark transition-colors cursor-pointer"
            >
              <IcPlus />
              Nouvelle organisation
            </button>
          </div>
        </div>

        {/* Métriques globales */}
        {!chargement && organisations.length > 0 && (
          <BlocMetriquesGlobales organisations={organisations} />
        )}

        {/* Tableau des organisations */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <IcBuilding />
              <h2 className="text-sm font-bold text-gray-800">Organisations</h2>
              {!chargement && (
                <span className="ml-1 px-2 py-0.5 bg-gray-100 text-gray-500 text-[11px] font-semibold rounded-full">
                  {organisations.length}
                </span>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="py-2.5 px-4 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Organisation</th>
                  <th className="py-2.5 px-4 text-center text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Utilisateurs</th>
                  <th className="py-2.5 px-4 text-center text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Clients</th>
                  <th className="py-2.5 px-4 text-right text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Encours</th>
                  <th className="py-2.5 px-4 text-center text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Créée le</th>
                  <th className="py-2.5 px-4 text-center text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Actif</th>
                </tr>
              </thead>

              {chargement ? (
                <SkeletonTable lignes={3} />
              ) : erreur ? (
                <tbody>
                  <tr>
                    <td colSpan={6} className="py-16 text-center">
                      <p className="text-sm text-red-500 font-medium">{erreur}</p>
                      <button
                        onClick={chargerDashboard}
                        className="mt-3 text-xs text-ockham-teal hover:text-ockham-teal-dark font-medium cursor-pointer"
                      >
                        Réessayer
                      </button>
                    </td>
                  </tr>
                </tbody>
              ) : organisations.length === 0 ? (
                <tbody>
                  <tr>
                    <td colSpan={6} className="py-16 text-center">
                      <p className="text-sm text-gray-400">Aucune organisation trouvée.</p>
                      <button
                        onClick={() => setModalOuvert(true)}
                        className="mt-3 text-xs text-ockham-teal hover:text-ockham-teal-dark font-medium cursor-pointer"
                      >
                        Créer la première organisation →
                      </button>
                    </td>
                  </tr>
                </tbody>
              ) : (
                <tbody>
                  {organisations.map(org => (
                    <LigneOrganisation key={org.id} org={org} onToggle={toggleOrg} />
                  ))}
                </tbody>
              )}
            </table>
          </div>
        </div>
      </main>

      <ModalNouvelleOrg
        ouvert={modalOuvert}
        onFermer={() => setModalOuvert(false)}
        onCreer={creerOrganisation}
      />
    </div>
  )
}
