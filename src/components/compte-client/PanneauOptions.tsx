// Volet latéral coulissant — édition des infos client + contacts
import { useState, useEffect, useId } from 'react'
import type { CompteClient, StatutJuridique } from '../../types/client'
import { useRefValeurs } from '../../hooks/useRefValeurs'
import { SectionContacts } from './SectionContacts'
import { supabase } from '../../lib/supabase'
import { useRole } from '../../contexts/RoleContext'

type EtatSync = 'idle' | 'loading' | 'ok' | 'alerte' | 'erreur'

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

type Onglet = 'infos' | 'contacts' | 'relances'

interface NoteRelance {
  id: string
  note: string | null
  note_operateur: string | null
  note_archivee_le: string | null
  cree_le: string
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

const STATUT_BODACC: Record<StatutJuridique, { label: string; couleur: string }> = {
  sauvegarde:   { label: '📁 Sauvegarde',   couleur: 'bg-amber-50 text-amber-800 border-amber-300' },
  liquidation:  { label: '🚫 Liquidation',  couleur: 'bg-red-50 text-red-800 border-red-300' },
  redressement: { label: '🔄 Redressement', couleur: 'bg-orange-50 text-orange-800 border-orange-300' },
  cloture:      { label: '✅ Clôture',       couleur: 'bg-gray-50 text-gray-600 border-gray-300' },
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

  const [statut, setStatut] = useState<StatutJuridique | ''>('')
  const [commercial, setCommercial] = useState('')
  const [operateur, setOperateur] = useState('')
  const [plateforme, setPlateforme] = useState('')
  const [groupement, setGroupement] = useState('')
  const [siret, setSiret] = useState('')
  const [delaiAlerte, setDelaiAlerte] = useState<string>('')
  const [enregistrement, setEnregistrement] = useState(false)
  const [etatSync, setEtatSync] = useState<EtatSync>('idle')
  const [syncAlertes, setSyncAlertes] = useState(0)
  const [onglet, setOnglet] = useState<Onglet>('infos')
  const [notesRelances, setNotesRelances] = useState<NoteRelance[]>([])
  const [notesChargement, setNotesChargement] = useState(false)

  useEffect(() => {
    if (client) {
      setStatut(client.statut_juridique ?? '')
      setCommercial(client.commercial ?? '')
      setOperateur(client.operateur ?? '')
      setPlateforme(client.plateforme ?? '')
      setGroupement(client.code_groupement ?? '')
      setSiret(client.siret ?? '')
      setDelaiAlerte('')
      setEtatSync('idle')
      setSyncAlertes(0)
      // Charge le seuil alerte client si défini
      supabase.from('clients').select('delai_alerte_jours').eq('code_dso', client.code_dso)
        .maybeSingle().then(({ data }) => {
          const row = data as { delai_alerte_jours: number | null } | null
          setDelaiAlerte(row?.delai_alerte_jours != null ? String(row.delai_alerte_jours) : '')
        })
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
  }, [onglet, client])

  if (!client) return null

  function fermerEtReset() { setOnglet('infos'); onFermer() }

  async function handleSauvegarder() {
    setEnregistrement(true)

    // Auto-création dans ref_valeurs si la valeur est nouvelle (sans doublon)
    const valCommercial = commercial.trim()
    const valPlateforme = plateforme.trim()
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
      const { data, error } = await supabase.functions.invoke('bodacc-sync', {
        body: { action: 'client_unique', sirets: [siretNormalisé] },
      })
      if (error || data?.error) { setEtatSync('erreur'); return }
      const nb = (data as { alertes_inserees?: number })?.alertes_inserees ?? 0
      setSyncAlertes(nb)
      setEtatSync(nb > 0 ? 'alerte' : 'ok')
      écrireCooldown(client!.code_dso, siretNormalisé)
    } catch { setEtatSync('erreur') }
  }

  const sc = classeScore(client.note_risque)

  return (
    <>
      <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40" onClick={fermerEtReset} />
      <div className="fixed top-0 right-0 bottom-0 w-[380px] bg-white shadow-2xl z-50 flex flex-col">
        <div className="flex items-start justify-between px-5 py-4 bg-ockham-navy">
          <div>
            <p className="text-sm font-bold text-slate-100">{client.nom}</p>
            <p className="text-xs text-slate-400 mt-0.5 font-mono">{client.code_dso}</p>
          </div>
          <button onClick={fermerEtReset} className="w-7 h-7 rounded-full border border-white/20 bg-white/10 hover:bg-white/20 text-slate-300 text-sm flex items-center justify-center transition-colors">✕</button>
        </div>

        {/* Onglets */}
        <div className="flex gap-2 px-4 py-3 bg-ockham-navy border-b border-white/10 flex-shrink-0">
          {(['infos', 'contacts', 'relances'] as Onglet[]).map(o => (
            <button
              key={o}
              onClick={() => setOnglet(o)}
              className={`flex-1 py-2 text-xs font-semibold rounded-md border transition-colors ${
                onglet === o
                  ? 'bg-white/15 border-white/50 text-white'
                  : 'border-white/20 text-slate-400 hover:bg-white/10 hover:text-slate-200'
              }`}
            >
              {o === 'infos' ? 'Informations' : o === 'contacts' ? 'Contacts' : 'Relances'}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {onglet === 'contacts' && <SectionContacts codeClient={client.code_dso} />}
          {onglet === 'relances' && (
            <div className="space-y-3">
              {/* Seuil alerte — override discret, admin + responsable uniquement */}
              {peutModifier && (
                <div className="pb-3 border-b border-gray-100">
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">
                    Seuil alerte <span className="normal-case font-normal text-gray-300">(jours après échéance)</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={180}
                      value={delaiAlerte}
                      onChange={e => setDelaiAlerte(e.target.value)}
                      placeholder="Défaut org"
                      className="w-24 border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-mono text-gray-700 outline-none focus:border-ockham-teal"
                    />
                    {delaiAlerte && (
                      <button
                        onClick={async () => {
                          const val = parseInt(delaiAlerte)
                          await supabase.from('clients').update({ delai_alerte_jours: isNaN(val) ? null : val } as never).eq('code_dso', client!.code_dso)
                          setDelaiAlerte(isNaN(val) ? '' : String(val))
                        }}
                        className="text-[11px] font-medium text-ockham-teal border border-ockham-teal/30 px-2.5 py-1 rounded-lg hover:bg-ockham-teal/5 transition-colors"
                      >
                        Appliquer
                      </button>
                    )}
                    {delaiAlerte && (
                      <button
                        onClick={async () => {
                          await supabase.from('clients').update({ delai_alerte_jours: null } as never).eq('code_dso', client!.code_dso)
                          setDelaiAlerte('')
                        }}
                        className="text-[11px] text-gray-400 hover:text-gray-600"
                      >
                        Réinitialiser
                      </button>
                    )}
                  </div>
                  <p className="text-[10px] text-gray-300 mt-1">Laissez vide pour utiliser le seuil de l'organisation.</p>
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
            </div>
          )}
          {onglet === 'infos' && <>
          {/* Statut juridique — lecture seule, alimenté par la veille BODACC */}
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Statut juridique</label>
            {statut && STATUT_BODACC[statut as StatutJuridique] ? (
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-semibold ${STATUT_BODACC[statut as StatutJuridique].couleur}`}>
                {STATUT_BODACC[statut as StatutJuridique].label}
                <span className="ml-auto text-[10px] opacity-60">BODACC</span>
              </div>
            ) : (
              <p className="text-xs text-gray-400 italic px-1">Aucune procédure collective détectée</p>
            )}
          </div>

          {/* Commercial — combobox : saisie libre + auto-création dans ref_valeurs */}
          <ComboRef
            label="Commercial"
            valeur={commercial}
            setValeur={setCommercial}
            options={commerciaux}
            placeholder="Ex : Jean Dupont"
          />

          {/* Opérateur — dropdown strict (géré par l'admin uniquement) */}
          <SelectRef label="Opérateur" valeur={operateur} setValeur={setOperateur} options={operateurs} />

          {/* Plateforme — combobox : saisie libre + auto-création dans ref_valeurs */}
          <ComboRef
            label="Plateforme d'envoi"
            valeur={plateforme}
            setValeur={setPlateforme}
            options={plateformes}
            placeholder="Ex : Chorus, Cegedim…"
          />

          {/* Code groupement */}
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

          {/* SIRET */}
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

            {/* Bouton synchronisation BODACC — admin + responsable uniquement */}
            {peutModifier && (
              <div className="mt-2.5 space-y-2">
                <button
                  onClick={lancerSyncBodacc}
                  disabled={siretManquant || etatSync === 'loading' || cooldownActif}
                  className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                    siretManquant || cooldownActif
                      ? 'border-gray-200 text-gray-300 bg-gray-50 cursor-not-allowed'
                      : etatSync === 'loading'
                      ? 'border-ockham-teal/30 text-ockham-teal bg-ockham-teal-muted cursor-wait'
                      : 'border-ockham-teal/40 text-ockham-teal bg-ockham-teal-muted hover:bg-ockham-teal/10 cursor-pointer'
                  }`}
                  title={siretManquant ? 'Renseignez un SIRET pour lancer la vérification' : cooldownActif ? 'Déjà synchronisé dans les dernières 24h' : undefined}
                >
                  {etatSync === 'loading' ? (
                    <>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                      Vérification en cours…
                    </>
                  ) : cooldownActif ? (
                    <>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                      Synchronisé (24h)
                    </>
                  ) : (
                    <>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                      Synchroniser BODACC
                    </>
                  )}
                </button>

                {etatSync === 'ok' && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-700 font-medium">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                    Aucune procédure collective détectée
                  </div>
                )}
                {etatSync === 'alerte' && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 font-medium">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                    {syncAlertes} procédure{syncAlertes > 1 ? 's' : ''} collective{syncAlertes > 1 ? 's' : ''} détectée{syncAlertes > 1 ? 's' : ''}
                  </div>
                )}
                {etatSync === 'erreur' && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-xs text-gray-500">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    Erreur lors de la vérification — réessayez
                  </div>
                )}
              </div>
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
        {(onglet === 'contacts' || onglet === 'relances') && (
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
