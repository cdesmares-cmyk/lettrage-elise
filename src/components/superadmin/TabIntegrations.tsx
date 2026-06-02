import { useState } from 'react'
import { type IntegrationSA, useSuperAdminOrg } from '../../hooks/useSuperAdminOrg'

const IcEdit  = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
const IcCheck = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
const IcSync  = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>

const formaterDate = (iso: string | null) =>
  !iso ? null : new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

const CATALOGUE = [
  { id: 'axonaut',    nom: 'Axonaut',    description: 'CRM & Facturation', disponible: true },
  { id: 'pennylane',  nom: 'Pennylane',  description: 'Comptabilité',      disponible: false },
  { id: 'sage',       nom: 'Sage',       description: 'ERP / Paie',        disponible: false },
  { id: 'hubspot',    nom: 'HubSpot',    description: 'CRM Marketing',     disponible: false },
]

// ── Carte intégration ─────────────────────────────────────────────────────────

function CarteIntegration({ provider, integ, orgId, actions }: {
  provider: typeof CATALOGUE[0]
  integ: IntegrationSA | undefined
  orgId: string
  actions: ReturnType<typeof useSuperAdminOrg>
}) {
  const [editOuvert, setEditOuvert] = useState(false)
  const [cleInput, setCleInput]     = useState('')
  const [enCours, setEnCours]       = useState<'test' | 'sync' | 'save' | null>(null)

  async function handleSave() {
    if (!cleInput.trim()) return
    setEnCours('save')
    const ok = await actions.setIntegrationKey(orgId, provider.id, cleInput.trim())
    setEnCours(null)
    if (ok) { setEditOuvert(false); setCleInput('') }
  }

  async function handleTest() {
    setEnCours('test')
    await actions.testIntegration(orgId, provider.id)
    setEnCours(null)
  }

  async function handleSync() {
    setEnCours('sync')
    await actions.triggerSync(orgId, provider.id)
    setEnCours(null)
  }

  const configure = !!integ?.api_key_masked

  return (
    <div className={`rounded-xl border p-4 flex flex-col gap-3 transition-all ${!provider.disponible ? 'opacity-40 bg-gray-50 border-gray-100' : 'bg-white border-gray-200 hover:border-ockham-teal/30 hover:shadow-sm'}`}>
      {/* En-tête */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-gray-900 leading-tight">{provider.nom}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">{provider.description}</p>
        </div>
        <div className="flex-shrink-0">
          {!provider.disponible
            ? <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-400">Bientôt</span>
            : configure
            ? <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-50 text-green-700 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-500" />Configuré</span>
            : <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-500">Non configuré</span>
          }
        </div>
      </div>

      {/* Clé masquée */}
      {configure && !editOuvert && (
        <div className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
          <span className="font-mono text-xs text-gray-500 tracking-widest">{integ!.api_key_masked}</span>
          <button onClick={() => setEditOuvert(true)} className="text-gray-400 hover:text-ockham-teal transition-colors cursor-pointer p-0.5"><IcEdit /></button>
        </div>
      )}

      {/* Formulaire clé */}
      {provider.disponible && editOuvert && (
        <div className="flex gap-2">
          <input type="password" value={cleInput} onChange={e => setCleInput(e.target.value)}
            placeholder="Clé API…" autoFocus
            className="flex-1 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-ockham-teal/40" />
          <button onClick={handleSave} disabled={!cleInput.trim() || enCours === 'save'}
            className="px-3 py-1.5 bg-ockham-teal text-white text-xs font-semibold rounded-lg hover:bg-ockham-teal-dark disabled:opacity-40 cursor-pointer flex items-center gap-1">
            <IcCheck /> {enCours === 'save' ? '…' : 'OK'}
          </button>
          <button onClick={() => { setEditOuvert(false); setCleInput('') }}
            className="px-3 py-1.5 border border-gray-200 text-xs text-gray-600 rounded-lg hover:border-gray-300 cursor-pointer">✕</button>
        </div>
      )}

      {/* Bouton configurer (non encore configuré) */}
      {provider.disponible && !configure && !editOuvert && (
        <button onClick={() => setEditOuvert(true)}
          className="w-full py-1.5 text-xs font-semibold text-ockham-teal border border-ockham-teal/40 rounded-lg hover:bg-ockham-teal-muted transition-colors cursor-pointer">
          Configurer
        </button>
      )}

      {/* Dernière vérif + actions */}
      {configure && !editOuvert && (
        <div className="flex items-center justify-between pt-1">
          <p className="text-[10px] text-gray-400">
            {integ?.verifie_le ? `Vérifié ${formaterDate(integ.verifie_le)}` : 'Jamais vérifié'}
          </p>
          <div className="flex items-center gap-1.5">
            <button onClick={handleTest} disabled={!!enCours}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-semibold border border-gray-200 rounded-lg hover:border-ockham-teal/40 hover:text-ockham-teal hover:bg-ockham-teal-muted transition-all cursor-pointer disabled:opacity-40">
              <IcCheck /> {enCours === 'test' ? '…' : 'Tester'}
            </button>
            <button onClick={handleSync} disabled={!!enCours}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-semibold border border-gray-200 rounded-lg hover:border-ockham-teal/40 hover:text-ockham-teal hover:bg-ockham-teal-muted transition-all cursor-pointer disabled:opacity-40">
              <IcSync /> {enCours === 'sync' ? '…' : 'Sync'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Tab ───────────────────────────────────────────────────────────────────────

export function TabIntegrations({ orgId, actions }: {
  orgId: string
  actions: ReturnType<typeof useSuperAdminOrg>
}) {
  const integrations = actions.detail?.integrations ?? []
  const byProvider = new Map(integrations.map(i => [i.provider, i]))

  return (
    <div className="px-6 py-5">
      <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-4">Connecteurs</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {CATALOGUE.map(p => (
          <CarteIntegration key={p.id} provider={p} integ={byProvider.get(p.id)} orgId={orgId} actions={actions} />
        ))}
      </div>
    </div>
  )
}
