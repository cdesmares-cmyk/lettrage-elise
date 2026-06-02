import { useEffect, useState } from 'react'
import { type OrganisationSA } from '../../hooks/useSuperAdmin'
import { useSuperAdminOrg } from '../../hooks/useSuperAdminOrg'
import { SectionMonitoring } from './SectionMonitoring'
import { TabUtilisateurs } from './TabUtilisateurs'
import { TabIntegrations } from './TabIntegrations'
import { TabParametres } from './TabParametres'

const IcX = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>

const formaterDate  = (iso: string | null) => !iso ? '—' : new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
const formaterEuros = (val: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(val)

type Onglet = 'utilisateurs' | 'integrations' | 'parametres' | 'monitoring'

const ONGLETS: { id: Onglet; label: string }[] = [
  { id: 'utilisateurs', label: 'Utilisateurs' },
  { id: 'integrations', label: 'Intégrations' },
  { id: 'parametres',   label: 'Paramètres'   },
  { id: 'monitoring',   label: 'Monitoring'   },
]

export function ModalOrg({ org: orgInitial, onFermer, onToggle }: {
  org: OrganisationSA
  onFermer: () => void
  onToggle: (id: string, actif: boolean) => void
}) {
  const [org, setOrg]         = useState(orgInitial)
  const [onglet, setOnglet]   = useState<Onglet>('utilisateurs')
  const orgActions            = useSuperAdminOrg()
  const { detail, chargement, chargerDetail } = orgActions

  useEffect(() => {
    chargerDetail(org.id)
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onFermer() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [org.id, chargerDetail, onFermer])

  const runs = detail?.runs ?? []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onFermer}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl flex flex-col overflow-hidden"
        style={{ maxHeight: '90vh' }} onClick={e => e.stopPropagation()}>

        {/* En-tête navy */}
        <div className="bg-ockham-navy px-6 py-4 flex-shrink-0">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h2 className="text-white font-bold text-lg leading-tight">{org.nom}</h2>
              <p className="text-ockham-teal text-xs font-mono mt-0.5 opacity-80">{org.slug}</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-white/50">Actif</span>
                <button onClick={() => onToggle(org.id, !org.actif)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer ${org.actif ? 'bg-ockham-teal' : 'bg-white/20'}`}>
                  <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${org.actif ? 'translate-x-4' : 'translate-x-1'}`} />
                </button>
              </div>
              <button onClick={onFermer} className="text-white/50 hover:text-white transition-colors cursor-pointer p-1"><IcX /></button>
            </div>
          </div>
          <div className="flex items-center gap-5 flex-wrap text-xs text-white/55">
            <span>Créée le <strong className="text-white/80">{formaterDate(org.cree_le)}</strong></span>
            <span className="w-px h-3 bg-white/15" />
            <span><strong className="text-white/80">{org.nb_utilisateurs}</strong> utilisateurs</span>
            <span className="w-px h-3 bg-white/15" />
            <span><strong className="text-white/80">{org.nb_clients}</strong> clients</span>
            <span className="w-px h-3 bg-white/15" />
            <span>Encours <strong className="text-ockham-teal">{formaterEuros(org.encours_total)}</strong></span>
          </div>
        </div>

        {/* Navigation par onglets */}
        <div className="flex items-center border-b border-gray-100 bg-white flex-shrink-0 px-6">
          {ONGLETS.map(o => (
            <button key={o.id} onClick={() => setOnglet(o.id)}
              className={`px-4 py-3 text-xs font-semibold border-b-2 transition-colors cursor-pointer -mb-px ${
                onglet === o.id
                  ? 'border-ockham-teal text-ockham-teal-dark'
                  : 'border-transparent text-gray-400 hover:text-gray-700'
              }`}>
              {o.label}
              {o.id === 'monitoring' && !chargement && runs.length > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded-full text-[9px]">{[...new Set(runs.map(r => r.fonction))].length}</span>
              )}
            </button>
          ))}
        </div>

        {/* Contenu onglet */}
        <div className="flex-1 overflow-y-auto">
          {onglet === 'utilisateurs' && (
            <TabUtilisateurs orgId={org.id} actions={orgActions} />
          )}
          {onglet === 'integrations' && (
            <TabIntegrations orgId={org.id} actions={orgActions} />
          )}
          {onglet === 'parametres' && (
            <TabParametres org={org} actions={orgActions} onNomChange={nom => setOrg(prev => ({ ...prev, nom }))} />
          )}
          {onglet === 'monitoring' && (
            <div className="px-6 py-5">
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-3">Edge Functions</p>
              {chargement
                ? <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-10 bg-gray-100 rounded-lg animate-pulse" />)}</div>
                : runs.length === 0
                ? <p className="text-sm text-gray-400 italic">Aucun run enregistré pour cette organisation.</p>
                : <SectionMonitoring runs={runs} />
              }
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-between bg-gray-50/50 flex-shrink-0">
          <p className="text-[11px] text-gray-300 font-mono">id : {org.id.slice(0, 8)}…</p>
          <button onClick={onFermer} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 border border-gray-200 hover:border-gray-300 rounded-lg transition-colors cursor-pointer">Fermer</button>
        </div>
      </div>
    </div>
  )
}
