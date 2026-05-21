// Volet latéral coulissant — édition des infos client + contacts
import { useState, useEffect, useId } from 'react'
import type { CompteClient, StatutJuridique } from '../../types/client'
import { useRefValeurs } from '../../hooks/useRefValeurs'
import { SectionContacts } from './SectionContacts'
import { supabase } from '../../lib/supabase'

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
  }) => Promise<boolean>
}

const STATUTS_JURIDIQUES: { val: StatutJuridique; label: string; couleur: string }[] = [
  { val: 'sauvegarde', label: '📁 Sauvegarde', couleur: 'bg-amber-100 text-amber-800 border-amber-300' },
  { val: 'liquidation', label: '🚫 Liquidation', couleur: 'bg-red-100 text-red-800 border-red-300' },
  { val: 'redressement', label: '🔄 Redressement', couleur: 'bg-orange-100 text-orange-800 border-orange-300' },
]

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

  const [statut, setStatut] = useState<StatutJuridique | ''>('')
  const [commercial, setCommercial] = useState('')
  const [operateur, setOperateur] = useState('')
  const [plateforme, setPlateforme] = useState('')
  const [groupement, setGroupement] = useState('')
  const [enregistrement, setEnregistrement] = useState(false)
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
    })
    setEnregistrement(false)
    if (ok) onFermer()
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
          {/* Statut juridique */}
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Statut juridique</label>
            <div className="space-y-1.5">
              {STATUTS_JURIDIQUES.map(s => (
                <button
                  key={s.val}
                  onClick={() => setStatut(statut === s.val ? '' : s.val)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-semibold transition-all ${
                    statut === s.val ? s.couleur + ' border' : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  {s.label}
                  {statut === s.val && <span className="ml-auto text-[10px]">✓</span>}
                </button>
              ))}
              {statut && (
                <button onClick={() => setStatut('')} className="w-full text-xs text-gray-400 hover:text-gray-600 py-1 transition-colors">
                  ✕ Effacer le statut
                </button>
              )}
            </div>
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
                <p className="text-[10px] text-gray-400 mt-1">0,40 × ancienneté + 0,35 × encours + 0,25 × nb impayées (normalisés)</p>
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
