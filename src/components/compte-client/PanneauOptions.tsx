// Volet latéral coulissant — édition des infos client + contacts
import { useState, useEffect, useRef, useId } from 'react'
import type { CompteClient, StatutJuridique } from '../../types/client'
import { useRefValeurs, normaliserValeurRef } from '../../hooks/useRefValeurs'
import { SectionContacts } from './SectionContacts'
import { supabase } from '../../lib/supabase'
import { useRole } from '../../contexts/RoleContext'
import { useAppData } from '../../contexts/AppDataContext'

type EtatSync = 'idle' | 'loading' | 'ok' | 'alerte' | 'erreur'
type Onglet   = 'infos' | 'contacts' | 'relances' | 'bodacc'

const COOLDOWN_MS = 24 * 60 * 60 * 1000

function lireCooldown(codeDso: string, siret: string): boolean {
  try {
    const raw = localStorage.getItem(`bodacc_sync_${codeDso}`)
    if (!raw) return false
    const { ts, siret: siretSauvé } = JSON.parse(raw) as { ts: number; siret: string }
    return siretSauvé === siret && Date.now() - ts < COOLDOWN_MS
  } catch { return false }
}

function écrireCooldown(codeDso: string, siret: string) {
  localStorage.setItem(`bodacc_sync_${codeDso}`, JSON.stringify({ ts: Date.now(), siret }))
}

interface NoteRelance {
  id: string
  note: string | null
  note_operateur: string | null
  note_archivee_le: string | null
  cree_le: string
}

interface LogRelanceAuto {
  id: string
  numero_facture: string
  envoye_le: string
  statut: 'envoye' | 'bounce' | 'erreur'
}

interface AlerteBodacc {
  id: string
  type_procedure: string
  date_parution: string | null
  date_jugement: string | null
  tribunal: string | null
  description: string | null
}

interface Props {
  client: CompteClient | null
  onFermer: () => void
  onSauvegarder: (codeDso: string, opts: {
    statut_juridique: StatutJuridique | null
    commercial: string | null
    operateur: string | null
    plateforme: string | null
    code_groupement: string | null
    siret: string | null
  }) => Promise<boolean>
}

const STATUT_BODACC: Record<StatutJuridique, { label: string; couleur: string; badge: string }> = {
  liquidation:  { label: 'Liquidation',  couleur: 'bg-red-50 text-red-800 border-red-300',       badge: 'bg-red-100 text-red-700' },
  redressement: { label: 'Redressement', couleur: 'bg-orange-50 text-orange-800 border-orange-300', badge: 'bg-orange-100 text-orange-700' },
  sauvegarde:   { label: 'Sauvegarde',   couleur: 'bg-amber-50 text-amber-800 border-amber-300',  badge: 'bg-amber-100 text-amber-700' },
  cloture:      { label: 'Clôture',      couleur: 'bg-gray-50 text-gray-600 border-gray-300',     badge: 'bg-gray-100 text-gray-500' },
}

function badgeProcedure(type: string): string {
  return STATUT_BODACC[type as StatutJuridique]?.badge ?? 'bg-slate-100 text-slate-500'
}

function classeScore(note: number) {
  if (note <= 40) return { bar: 'bg-emerald-500', txt: 'text-emerald-600', label: 'Risque faible' }
  if (note <= 70) return { bar: 'bg-amber-500', txt: 'text-amber-600', label: 'Risque modéré' }
  return { bar: 'bg-red-500', txt: 'text-red-600', label: 'Risque élevé' }
}

// Combobox : saisie libre + suggestions depuis ref_valeurs
function ComboRef({
  label, valeur, setValeur, options, placeholder,
}: { label: string; valeur: string; setValeur: (v: string) => void; options: string[]; placeholder?: string }) {
  const listId = useId()
  return (
    <div>
      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">{label}</label>
      <input
        type="text"
        list={listId}
        value={valeur}
        onChange={e => setValeur(e.target.value)}
        placeholder={placeholder ?? '— Aucun —'}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 outline-none focus:border-ockham-teal transition-colors bg-white"
      />
      <datalist id={listId}>
        {options.map(o => <option key={o} value={o} />)}
      </datalist>
    </div>
  )
}

// Dropdown strict pour les champs gérés uniquement par l'admin (opérateur)
function SelectRef({
  label, valeur, setValeur, options,
}: { label: string; valeur: string; setValeur: (v: string) => void; options: string[] }) {
  return (
    <div>
      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">{label}</label>
      <div className="relative">
        <select
          value={valeur}
          onChange={e => setValeur(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 outline-none focus:border-ockham-teal transition-colors appearance-none bg-white pr-8"
        >
          <option value="">— Aucun —</option>
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none text-[10px]">▾</span>
      </div>
    </div>
  )
}

export function PanneauOptions({ client, onFermer, onSauvegarder }: Props) {
  const { valeurs: commerciaux, ajouter: ajouterCommercial } = useRefValeurs('commercial')
  const { valeurs: operateurs } = useRefValeurs('operateur')
  const { valeurs: plateformes, ajouter: ajouterPlateforme } = useRefValeurs('plateforme')
  const { peutModifier } = useRole()
  const { mettreAJourClientLocal } = useAppData()

  const [statut, setStatut]           = useState<StatutJuridique | ''>('')
  const [commercial, setCommercial]   = useState('')
  const [operateur, setOperateur]     = useState('')
  const [plateforme, setPlateforme]   = useState('')
  const [groupement, setGroupement]   = useState('')
  const [siret, setSiret]             = useState('')
  const [relanceAutoActive, setRelanceAutoActive] = useState<boolean>(true)
  const [delaiEcheanceClient, setDelaiEcheanceClient] = useState<string>('')
  const [enregistrement, setEnregistrement] = useState(false)
  const [etatSync, setEtatSync]       = useState<EtatSync>('idle')
  const [syncAlertes, setSyncAlertes] = useState(0)
  const [onglet, setOnglet]           = useState<Onglet>('infos')
  const [notesRelances, setNotesRelances]     = useState<NoteRelance[]>([])
  const [notesChargement, setNotesChargement] = useState(false)
  const [logsRelanceAuto, setLogsRelanceAuto] = useState<LogRelanceAuto[]>([])
  const [logsAutoChargement, setLogsAutoChargement] = useState(false)
  const [alertesBodacc, setAlertesBodacc]           = useState<AlerteBodacc[]>([])
  const [alertesBodaccChargement, setAlertesBodaccChargement] = useState(false)
  const [masquageEnCours, setMasquageEnCours] = useState<Set<string>>(new Set())
  const clientCodeRef = useRef<string | null>(null)

  async function chargerAlertesBodacc() {
    if (!client) return
    setAlertesBodaccChargement(true)
    const { data } = await supabase
      .from('alertes_risque')
      .select('id, type_procedure, date_parution, date_jugement, tribunal, description')
      .eq('code_client', client.code_dso)
      .eq('masquee', false)
      .order('date_parution', { ascending: false })
    const alertes = (data ?? []) as AlerteBodacc[]
    setAlertesBodacc(alertes)
    setAlertesBodaccChargement(false)

    // Si des alertes existent mais que le statut n'est pas encore renseigné, recalcule
    if (alertes.length > 0 && !client.statut_juridique) {
      const { data: { session } } = await supabase.auth.getSession()
      const { data: res } = await supabase.functions.invoke('bodacc-sync', {
        body: { action: 'recalculer_statut', code_dso: client.code_dso },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      })
      if (res?.statut_juridique) setStatut(res.statut_juridique as StatutJuridique)
    }
  }

  async function refreshStatut() {
    if (!client) return
    const { data } = await supabase
      .from('clients')
      .select('statut_juridique')
      .eq('code_dso', client.code_dso)
      .maybeSingle()
    const nouveau = (data as { statut_juridique: StatutJuridique | null } | null)?.statut_juridique ?? null
    setStatut(nouveau ?? '')
    mettreAJourClientLocal(client.code_dso, { statut_juridique: nouveau })
  }

  useEffect(() => {
    if (client) {
      const switching = clientCodeRef.current !== client.code_dso
      clientCodeRef.current = client.code_dso

      setStatut(client.statut_juridique ?? '')
      setCommercial(client.commercial ?? '')
      setOperateur(client.operateur ?? '')
      setPlateforme(client.plateforme ?? '')
      setGroupement(client.code_groupement ?? '')
      setSiret(client.siret ?? '')

      if (switching) {
        setEtatSync('idle')
        setSyncAlertes(0)
        setAlertesBodacc([])
        setMasquageEnCours(new Set())
        supabase.from('clients').select('relance_auto_active, delai_echeance_jours').eq('code_dso', client.code_dso)
          .maybeSingle().then(({ data }) => {
            const row = data as { relance_auto_active: boolean; delai_echeance_jours: number | null } | null
            setRelanceAutoActive(row?.relance_auto_active ?? false)
            setDelaiEcheanceClient(row?.delai_echeance_jours != null ? String(row.delai_echeance_jours) : '')
          })
      }
    }
  }, [client])

  useEffect(() => {
    if (onglet !== 'relances' || !client) return

    setNotesChargement(true)
    supabase
      .from('relances')
      .select('id, note, note_operateur, note_archivee_le, cree_le')
      .eq('code_client', client.code_dso)
      .eq('archivee', true)
      .not('note', 'is', null)
      .order('note_archivee_le', { ascending: false })
      .limit(5)
      .then(({ data }) => {
        setNotesRelances((data ?? []) as NoteRelance[])
        setNotesChargement(false)
      })

    setLogsAutoChargement(true)
    supabase
      .from('relances_auto_log')
      .select('id, numero_facture, envoye_le, statut')
      .eq('code_client', client.code_dso)
      .order('envoye_le', { ascending: false })
      .limit(30)
      .then(({ data }) => {
        setLogsRelanceAuto((data ?? []) as LogRelanceAuto[])
        setLogsAutoChargement(false)
      })
  }, [onglet, client])

  useEffect(() => {
    if (onglet !== 'bodacc' || !client) return
    chargerAlertesBodacc()
  }, [onglet, client])

  if (!client) return null

  function fermerEtReset() { setOnglet('infos'); onFermer() }

  async function handleSauvegarder() {
    setEnregistrement(true)

    const valCommercial = normaliserValeurRef(commercial)
    const valPlateforme = normaliserValeurRef(plateforme)
    if (valCommercial && !commerciaux.includes(valCommercial)) {
      await ajouterCommercial(valCommercial)
    }
    if (valPlateforme && !plateformes.includes(valPlateforme)) {
      await ajouterPlateforme(valPlateforme)
    }

    const ok = await onSauvegarder(client!.code_dso, {
      statut_juridique: statut || null,
      commercial: valCommercial || null,
      operateur: operateur.trim() || null,
      plateforme: valPlateforme || null,
      code_groupement: groupement.trim() || null,
      siret: siret.trim() || null,
    })
    setEnregistrement(false)
    if (ok) onFermer()
  }

  const siretNormalisé = siret.replace(/\D/g, '')
  const siretValide    = siretNormalisé.length === 14
  const siretManquant  = siretNormalisé.length === 0
  const cooldownActif  = !siretManquant && lireCooldown(client.code_dso, siretNormalisé)

  async function lancerSyncBodacc() {
    if (!siretNormalisé || etatSync === 'loading') return
    setEtatSync('loading')
    setSyncAlertes(0)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const { data, error } = await supabase.functions.invoke('bodacc-sync', {
        body: { action: 'client_unique', sirets: [siretNormalisé] },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      })
      if (error || data?.error) { setEtatSync('erreur'); return }
      const nb = (data as { alertes_inserees?: number })?.alertes_inserees ?? 0
      setSyncAlertes(nb)
      setEtatSync(nb > 0 ? 'alerte' : 'ok')
      écrireCooldown(client!.code_dso, siretNormalisé)
      await refreshStatut()
      await chargerAlertesBodacc()
    } catch { setEtatSync('erreur') }
  }

  async function masquerAlerte(alerteId: string) {
    setMasquageEnCours(prev => new Set(prev).add(alerteId))
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const { error } = await supabase.functions.invoke('bodacc-sync', {
        body: { action: 'masquer_alerte', alerte_id: alerteId },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      })
      if (!error) {
        setAlertesBodacc(prev => prev.filter(a => a.id !== alerteId))
        await refreshStatut()
      }
    } finally {
      setMasquageEnCours(prev => { const s = new Set(prev); s.delete(alerteId); return s })
    }
  }

  const sc = classeScore(client.note_risque)

  const LABELS_ONGLETS: Record<Onglet, string> = {
    infos:    'Informations',
    contacts: 'Contacts',
    relances: 'Relances',
    bodacc:   'BODACC',
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40" onClick={fermerEtReset} />
      <div className="fixed top-0 right-0 bottom-0 w-[380px] bg-white shadow-2xl z-50 flex flex-col">

        {/* En-tête client */}
        <div className="flex items-start justify-between px-5 py-4 bg-ockham-navy">
          <div>
            <p className="text-sm font-bold text-slate-100">{client.nom}</p>
            <p className="text-xs text-slate-400 mt-0.5 font-mono">{client.code_dso}</p>
          </div>
          <button onClick={fermerEtReset} className="w-7 h-7 rounded-full border border-white/20 bg-white/10 hover:bg-white/20 text-slate-300 text-sm flex items-center justify-center transition-colors">✕</button>
        </div>

        {/* Onglets */}
        <div className="flex gap-1.5 px-4 py-3 bg-ockham-navy border-b border-white/10 flex-shrink-0">
          {(['infos', 'contacts', 'relances', 'bodacc'] as Onglet[]).map(o => (
            <button
              key={o}
              onClick={() => setOnglet(o)}
              className={`relative flex-1 py-2 text-[11px] font-semibold rounded-md border transition-colors ${
                onglet === o
                  ? 'bg-white/15 border-white/50 text-white'
                  : 'border-white/20 text-slate-400 hover:bg-white/10 hover:text-slate-200'
              }`}
            >
              {LABELS_ONGLETS[o]}
              {o === 'relances' && client.relance_auto_alerte && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-amber-500 border-2 border-ockham-navy" />
              )}
            </button>
          ))}
        </div>

        {/* Contenu */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

          {/* ── CONTACTS ── */}
          {onglet === 'contacts' && <SectionContacts codeClient={client.code_dso} />}

          {/* ── RELANCES ── */}
          {onglet === 'relances' && (
            <div className="space-y-3">
              {peutModifier && (
                <div className="pb-3 border-b border-gray-100 space-y-3">
                  {/* Toggle relance auto */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Relances automatiques</p>
                      <p className="text-[10px] text-gray-300 mt-0.5">Inclure ce client dans les envois auto</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer flex-shrink-0 ml-3">
                      <input type="checkbox" checked={relanceAutoActive}
                        onChange={async e => {
                          const val = e.target.checked
                          setRelanceAutoActive(val)
                          await supabase.from('clients').update({ relance_auto_active: val } as never).eq('code_dso', client!.code_dso)
                        }}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-gray-200 peer-checked:bg-ockham-teal rounded-full transition-colors after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4" />
                    </label>
                  </div>
                  {/* Délai paiement personnalisé */}
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">
                      Délai de paiement personnalisé
                    </label>
                    <div className="flex items-center gap-2">
                      <input type="number" min={1} max={120} value={delaiEcheanceClient}
                        onChange={e => setDelaiEcheanceClient(e.target.value)}
                        placeholder="Défaut org"
                        className="w-24 border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-mono text-gray-700 outline-none focus:border-ockham-teal"
                      />
                      {delaiEcheanceClient && (
                        <button onClick={async () => {
                          const val = parseInt(delaiEcheanceClient)
                          await supabase.from('clients').update({ delai_echeance_jours: isNaN(val) ? null : val } as never).eq('code_dso', client!.code_dso)
                          setDelaiEcheanceClient(isNaN(val) ? '' : String(val))
                        }} className="text-[11px] font-medium text-ockham-teal border border-ockham-teal/30 px-2.5 py-1 rounded-lg hover:bg-ockham-teal/5 transition-colors">
                          Appliquer
                        </button>
                      )}
                      {delaiEcheanceClient && (
                        <button onClick={async () => {
                          await supabase.from('clients').update({ delai_echeance_jours: null } as never).eq('code_dso', client!.code_dso)
                          setDelaiEcheanceClient('')
                        }} className="text-[11px] text-gray-400 hover:text-gray-600">
                          Réinitialiser
                        </button>
                      )}
                    </div>
                    <p className="text-[10px] text-gray-300 mt-1">Laissez vide pour utiliser le terme de l'organisation.</p>
                  </div>
                </div>
              )}
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Notes archivées — {client.nom}</p>
              {notesChargement ? (
                <p className="text-xs text-gray-400">Chargement…</p>
              ) : notesRelances.length === 0 ? (
                <p className="text-xs text-gray-400 italic">Aucune note de relance archivée pour ce client.</p>
              ) : (
                notesRelances.map(n => (
                  <div key={n.id} className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-bold text-ockham-teal uppercase tracking-wider">
                        {n.note_operateur ?? 'Opérateur inconnu'}
                      </span>
                      {n.note_archivee_le && (
                        <span className="text-[10px] text-gray-400">
                          {new Date(n.note_archivee_le).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' })}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-600 leading-relaxed whitespace-pre-wrap">{n.note}</p>
                  </div>
                ))
              )}

              {/* Historique relances automatiques */}
              <div className="pt-3 border-t border-gray-100 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Relances automatiques</p>
                  {client.relance_auto_alerte && peutModifier && (
                    <button
                      onClick={async () => {
                        await supabase.from('clients').update({ relance_auto_alerte: false } as never).eq('code_dso', client!.code_dso)
                        mettreAJourClientLocal(client!.code_dso, { relance_auto_alerte: false } as never)
                      }}
                      className="text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-300 hover:bg-amber-100 px-2.5 py-1 rounded-md transition-colors"
                    >
                      Marquer comme traité
                    </button>
                  )}
                </div>
                {logsAutoChargement ? (
                  <p className="text-xs text-gray-400">Chargement…</p>
                ) : logsRelanceAuto.length === 0 ? (
                  <p className="text-xs text-gray-400 italic">Aucune relance automatique envoyée pour ce client.</p>
                ) : (() => {
                  const grouped = logsRelanceAuto.reduce<Record<string, LogRelanceAuto[]>>((acc, log) => {
                    const date = log.envoye_le.slice(0, 10)
                    if (!acc[date]) acc[date] = []
                    acc[date].push(log)
                    return acc
                  }, {})
                  return Object.entries(grouped).map(([date, logs]) => {
                    const statut = logs.some(l => l.statut === 'bounce') ? 'bounce'
                      : logs.some(l => l.statut === 'erreur') ? 'erreur'
                      : 'envoye'
                    const badgeClass = statut === 'envoye'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : statut === 'bounce'
                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                      : 'bg-red-50 text-red-700 border-red-200'
                    const badgeLabel = statut === 'envoye' ? 'Envoyé' : statut === 'bounce' ? 'Bounce' : 'Erreur'
                    return (
                      <div key={date} className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-bold text-gray-500">
                            {new Date(date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' })}
                          </span>
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${badgeClass}`}>{badgeLabel}</span>
                        </div>
                        <p className="text-[11px] text-gray-500 leading-relaxed">
                          {logs.map(l => l.numero_facture).join(', ')}
                        </p>
                      </div>
                    )
                  })
                })()}
              </div>
            </div>
          )}

          {/* ── BODACC ── */}
          {onglet === 'bodacc' && (
            <div className="space-y-4">

              {/* Statut actuel */}
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Statut juridique actuel</label>
                {statut && STATUT_BODACC[statut as StatutJuridique] ? (
                  <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-semibold ${STATUT_BODACC[statut as StatutJuridique].couleur}`}>
                    {STATUT_BODACC[statut as StatutJuridique].label}
                    <span className="ml-auto text-[10px] opacity-60">BODACC</span>
                  </div>
                ) : (
                  <div className="px-3 py-2 rounded-lg border border-emerald-200 bg-emerald-50 text-xs text-emerald-700 font-medium">
                    Aucune procédure collective active
                  </div>
                )}
              </div>

              {/* Bouton synchronisation */}
              {siretManquant ? (
                <p className="text-[11px] text-gray-400 italic">
                  Renseignez un SIRET dans l'onglet Informations pour activer la surveillance BODACC.
                </p>
              ) : !siretValide ? (
                <p className="text-[11px] text-amber-600 flex items-center gap-1.5">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                  SIRET invalide — corrigez-le dans l'onglet Informations.
                </p>
              ) : peutModifier ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] text-gray-400 font-mono">{siretNormalisé}</p>
                    <button
                      onClick={lancerSyncBodacc}
                      disabled={etatSync === 'loading' || cooldownActif}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                        cooldownActif
                          ? 'border-gray-200 text-gray-300 bg-gray-50 cursor-not-allowed'
                          : etatSync === 'loading'
                          ? 'border-ockham-teal/30 text-ockham-teal bg-ockham-teal-muted cursor-wait'
                          : 'border-ockham-teal/40 text-ockham-teal bg-ockham-teal-muted hover:bg-ockham-teal/10 cursor-pointer'
                      }`}
                    >
                      {etatSync === 'loading' ? (
                        <>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                          Vérification…
                        </>
                      ) : cooldownActif ? (
                        <>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                          Synchronisé (24h)
                        </>
                      ) : (
                        <>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                          Synchroniser BODACC
                        </>
                      )}
                    </button>
                  </div>
                  {etatSync === 'ok' && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-700 font-medium">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                      Aucune nouvelle procédure détectée
                    </div>
                  )}
                  {etatSync === 'alerte' && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 font-medium">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                      {syncAlertes} procédure{syncAlertes > 1 ? 's' : ''} détectée{syncAlertes > 1 ? 's' : ''}
                    </div>
                  )}
                  {etatSync === 'erreur' && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-xs text-gray-500">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      Erreur lors de la vérification — réessayez
                    </div>
                  )}
                </div>
              ) : null}

              {/* Historique procédures */}
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Procédures détectées</label>
                {alertesBodaccChargement ? (
                  <div className="space-y-2">
                    {[1, 2].map(i => (
                      <div key={i} className="h-14 rounded-lg bg-gray-100 animate-pulse" />
                    ))}
                  </div>
                ) : alertesBodacc.length === 0 ? (
                  <p className="text-xs text-gray-400 italic px-1">
                    Aucune procédure collective enregistrée.
                    {siretValide && !cooldownActif && peutModifier && ' Cliquez sur Synchroniser pour lancer une vérification.'}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {alertesBodacc.map(a => (
                      <div key={a.id} className="flex items-start gap-3 px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50">
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${badgeProcedure(a.type_procedure)}`}>
                              {STATUT_BODACC[a.type_procedure as StatutJuridique]?.label ?? a.type_procedure}
                            </span>
                            {a.date_parution && (
                              <span className="text-[10px] text-gray-400">
                                {new Date(a.date_parution).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
                              </span>
                            )}
                          </div>
                          {a.tribunal && (
                            <p className="text-[11px] text-gray-500 truncate">{a.tribunal}</p>
                          )}
                        </div>
                        {peutModifier && (
                          <button
                            onClick={() => masquerAlerte(a.id)}
                            disabled={masquageEnCours.has(a.id)}
                            title="Masquer ce faux positif — l'alerte ne sera plus prise en compte"
                            className="flex-shrink-0 text-[10px] text-gray-400 hover:text-red-500 transition-colors disabled:opacity-40 py-0.5 px-1.5 rounded border border-transparent hover:border-red-200 hover:bg-red-50"
                          >
                            {masquageEnCours.has(a.id) ? '…' : 'Masquer'}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── INFORMATIONS ── */}
          {onglet === 'infos' && <>
            {/* Statut juridique — lecture seule, alimenté par BODACC */}
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Statut juridique</label>
              {statut && STATUT_BODACC[statut as StatutJuridique] ? (
                <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-semibold ${STATUT_BODACC[statut as StatutJuridique].couleur}`}>
                  {STATUT_BODACC[statut as StatutJuridique].label}
                  <span className="ml-auto text-[10px] opacity-60">BODACC</span>
                  <button
                    onClick={() => setOnglet('bodacc')}
                    className="ml-1 text-[10px] underline underline-offset-2 opacity-60 hover:opacity-100"
                  >
                    Détail
                  </button>
                </div>
              ) : (
                <p className="text-xs text-gray-400 italic px-1">Aucune procédure collective détectée</p>
              )}
            </div>

            <ComboRef label="Commercial" valeur={commercial} setValeur={setCommercial} options={commerciaux} placeholder="Ex : Jean Dupont" />
            <SelectRef label="Opérateur" valeur={operateur} setValeur={setOperateur} options={operateurs} />
            <ComboRef label="Plateforme d'envoi" valeur={plateforme} setValeur={setPlateforme} options={plateformes} placeholder="Ex : Chorus, Cegedim…" />

            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Code groupement <span className="text-gray-300 normal-case font-normal">(nébuleuse)</span></label>
              <input
                type="text"
                value={groupement}
                onChange={e => setGroupement(e.target.value)}
                placeholder="Ex : GRP-01, HOLDING-A…"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono text-gray-700 outline-none focus:border-ockham-teal transition-colors"
              />
              <p className="text-[10px] text-gray-400 mt-1.5">Texte ou chiffre libre. Les clients partageant ce code seront regroupés dans la vue Nébuleuse.</p>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">SIRET <span className="text-gray-300 normal-case font-normal">(veille BODACC)</span></label>
              <input
                type="text"
                value={siret}
                onChange={e => { setSiret(e.target.value.replace(/\D/g, '').slice(0, 14)); setEtatSync('idle') }}
                placeholder="14 chiffres"
                className={`w-full border rounded-lg px-3 py-2 text-sm font-mono text-gray-700 outline-none focus:border-ockham-teal transition-colors ${
                  !siretManquant && !siretValide ? 'border-amber-300 bg-amber-50' : 'border-gray-200'
                }`}
              />
              {!siretManquant && !siretValide && (
                <p className="text-[11px] text-amber-600 mt-1.5 flex items-center gap-1">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                  SIRET invalide — 14 chiffres attendus ({siretNormalisé.length}/14)
                </p>
              )}
              {siretValide && peutModifier && (
                <p className="text-[10px] text-gray-400 mt-1.5">
                  Synchronisation BODACC disponible dans l'onglet{' '}
                  <button onClick={() => setOnglet('bodacc')} className="text-ockham-teal underline underline-offset-2">BODACC</button>.
                </p>
              )}
            </div>

            {/* Score risque (lecture seule) */}
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Note de risque (calculée)</label>
              <div className="flex items-center gap-4 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
                <span className={`text-3xl font-extrabold tabular-nums ${sc.txt}`}>{client.note_risque}</span>
                <div className="flex-1">
                  <p className={`text-xs font-bold ${sc.txt}`}>{sc.label}</p>
                  <div className="w-full h-2 bg-gray-200 rounded-full mt-1.5 overflow-hidden">
                    <div className={`h-full rounded-full ${sc.bar}`} style={{ width: `${client.note_risque}%` }} />
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1">Calculé chaque matin — retard, tendance, % échu, BODACC</p>
                </div>
              </div>
            </div>
          </>}
        </div>

        {/* Pied de page */}
        {onglet === 'infos' && (
          <div className="flex gap-2 px-5 py-4 border-t border-gray-100">
            <button onClick={fermerEtReset} disabled={enregistrement} className="flex-1 text-sm font-medium text-gray-500 border border-gray-200 py-2.5 rounded-lg hover:border-gray-300 transition-colors disabled:opacity-40">
              Annuler
            </button>
            <button onClick={handleSauvegarder} disabled={enregistrement} className="flex-[2] flex items-center justify-center gap-2 bg-ockham-teal hover:bg-ockham-teal-dark disabled:opacity-40 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors">
              {enregistrement ? '…' : '✓ Enregistrer'}
            </button>
          </div>
        )}
        {(onglet === 'contacts' || onglet === 'relances' || onglet === 'bodacc') && (
          <div className="px-5 py-4 border-t border-gray-100">
            <button onClick={fermerEtReset} className="w-full text-sm font-medium text-gray-500 border border-gray-200 py-2.5 rounded-lg hover:border-gray-300 transition-colors">
              Fermer
            </button>
          </div>
        )}
      </div>
    </>
  )
}
