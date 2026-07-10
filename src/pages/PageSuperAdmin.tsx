import { useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useSuperAdmin, type OrganisationSA } from '../hooks/useSuperAdmin'
import { ModalNouvelleOrg } from '../components/superadmin/ModalNouvelleOrg'
import { CarteOrg } from '../components/superadmin/CarteOrg'
import { SectionMonitoring } from '../components/superadmin/SectionMonitoring'
import { ModalOrg } from '../components/superadmin/ModalOrg'

const PAGE_SIZE = 20

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

function IcSearch() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  )
}

function formaterEuros(val: number) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(val)
}

function SkeletonCards() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
          <div className="h-4 bg-gray-100 rounded animate-pulse w-3/4" />
          <div className="h-3 bg-gray-100 rounded animate-pulse w-1/2" />
          <div className="h-3 bg-gray-100 rounded animate-pulse w-2/3" />
        </div>
      ))}
    </div>
  )
}

export function PageSuperAdmin() {
  const { profil, chargement: chargementAuth } = useAuth()
  const { organisations, runs, chargement, erreur, chargerDashboard, creerOrganisation, toggleOrg } = useSuperAdmin()

  const [modalOuvert, setModalOuvert]   = useState(false)
  const [orgDetail, setOrgDetail]       = useState<OrganisationSA | null>(null)
  const [recherche, setRecherche]       = useState('')
  const [page, setPage]                 = useState(1)

  useEffect(() => {
    if (profil?.role === 'superadmin') chargerDashboard()
  }, [profil?.role, chargerDashboard])

  const filtered = useMemo(() => {
    const q = recherche.toLowerCase().trim()
    if (!q) return organisations
    return organisations.filter(o =>
      o.nom.toLowerCase().includes(q) || o.slug.toLowerCase().includes(q)
    )
  }, [organisations, recherche])

  const totalPages    = Math.ceil(filtered.length / PAGE_SIZE)
  const pageCourante  = Math.min(page, Math.max(1, totalPages))
  const slice         = filtered.slice((pageCourante - 1) * PAGE_SIZE, pageCourante * PAGE_SIZE)

  const fonctionsPerOrg = useMemo(
    () => [...new Set(runs.filter(r => r.organisation_id !== null).map(r => r.fonction))].sort(),
    [runs]
  )

  const actives     = organisations.filter(o => o.actif).length
  const totalEnc    = organisations.reduce((s, o) => s + o.encours_total, 0)
  const totalCli    = organisations.reduce((s, o) => s + o.nb_clients, 0)

  if (chargementAuth) return null
  if (!profil || profil.role !== 'superadmin') return <Navigate to="/tableau-de-bord" replace />

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-ockham-navy border-b border-ockham-teal/20 px-8 py-4 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-ockham-teal/10">
            <span className="text-ockham-teal font-extrabold text-lg">O</span>
          </div>
          <div>
            <span className="text-white font-bold text-sm tracking-wide">OCKHAM</span>
            <span className="ml-2 px-2 py-0.5 bg-ockham-teal/20 text-ockham-teal text-[10px] font-bold rounded-full uppercase tracking-wider">
              Super Admin
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400">{profil.initiales || profil.role}</span>
          <a href="/tableau-de-bord" className="text-xs text-slate-400 hover:text-white transition-colors cursor-pointer">
            ← Retour à l'app
          </a>
        </div>
      </header>

      <main className="max-w-screen-xl mx-auto px-8 py-8">
        {/* Titre + actions */}
        <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Pilotage multi-organisations</h1>
            <p className="text-sm text-gray-500 mt-0.5">Vue consolidée de toutes les organisations OCKHAM Finance</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={chargerDashboard} disabled={chargement}
              className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-gray-600 hover:text-gray-900 border border-gray-200 hover:border-gray-300 rounded-lg transition-colors cursor-pointer disabled:opacity-40"
            >
              <IcRefresh spin={chargement} /> Actualiser
            </button>
            <button
              onClick={() => setModalOuvert(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-ockham-teal text-white rounded-lg hover:bg-ockham-teal-dark transition-colors cursor-pointer"
            >
              <IcPlus /> Nouvelle organisation
            </button>
          </div>
        </div>

        {/* KPIs globaux */}
        {!chargement && organisations.length > 0 && (
          <div className="grid grid-cols-3 gap-3 mb-6">
            {[
              { label: 'Organisations actives', val: `${actives} / ${organisations.length}`, color: 'bg-ockham-teal-muted border-ockham-teal/20 text-ockham-teal-dark' },
              { label: 'Clients total', val: totalCli, color: 'bg-blue-50 border-blue-100 text-blue-700' },
              { label: 'Encours global', val: formaterEuros(totalEnc), color: 'bg-purple-50 border-purple-100 text-purple-700' },
            ].map(k => (
              <div key={k.label} className={`px-4 py-3 rounded-xl border ${k.color} flex flex-col gap-0.5`}>
                <p className="text-xs font-medium opacity-60 leading-none">{k.label}</p>
                <p className="text-sm font-bold leading-none">{k.val}</p>
              </div>
            ))}
          </div>
        )}

        {/* Barre de recherche */}
        {organisations.length > 0 && (
          <div className="relative mb-4 max-w-sm">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
              <IcSearch />
            </span>
            <input
              type="search" value={recherche}
              onChange={e => { setRecherche(e.target.value); setPage(1) }}
              placeholder="Rechercher par nom ou slug…"
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-ockham-teal/30 focus:border-ockham-teal bg-white"
            />
          </div>
        )}

        {/* Grille de cartes */}
        {chargement ? (
          <SkeletonCards />
        ) : erreur ? (
          <div className="py-16 text-center">
            <p className="text-sm text-red-500 font-medium">{erreur}</p>
            <button onClick={chargerDashboard} className="mt-3 text-xs text-ockham-teal hover:text-ockham-teal-dark font-medium cursor-pointer">
              Réessayer
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            {recherche ? (
              <p className="text-sm text-gray-400">Aucune organisation ne correspond à « {recherche} ».</p>
            ) : (
              <>
                <p className="text-sm text-gray-400">Aucune organisation.</p>
                <button onClick={() => setModalOuvert(true)} className="mt-3 text-xs text-ockham-teal hover:text-ockham-teal-dark font-medium cursor-pointer">
                  Créer la première organisation →
                </button>
              </>
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {slice.map(org => (
                <CarteOrg key={org.id} org={org} runs={runs} fonctionsPerOrg={fonctionsPerOrg} onToggle={toggleOrg} onOuvrir={setOrgDetail} />
              ))}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-5 text-xs text-gray-500">
                <span>{filtered.length} organisation{filtered.length > 1 ? 's' : ''}</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))} disabled={pageCourante === 1}
                    className="px-3 py-1.5 rounded-lg border border-gray-200 hover:border-gray-300 disabled:opacity-40 cursor-pointer"
                  >
                    ← Précédent
                  </button>
                  <span className="px-2 font-semibold text-gray-700">{pageCourante} / {totalPages}</span>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={pageCourante === totalPages}
                    className="px-3 py-1.5 rounded-lg border border-gray-200 hover:border-gray-300 disabled:opacity-40 cursor-pointer"
                  >
                    Suivant →
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        <SectionMonitoring runs={runs} />
      </main>

      <ModalNouvelleOrg ouvert={modalOuvert} onFermer={() => setModalOuvert(false)} onCreer={creerOrganisation} />

      {orgDetail && (
        <ModalOrg
          org={orgDetail}
          onFermer={() => setOrgDetail(null)}
          onToggle={(id, actif) => { toggleOrg(id, actif); setOrgDetail(prev => prev ? { ...prev, actif } : prev) }}
        />
      )}
    </div>
  )
}
