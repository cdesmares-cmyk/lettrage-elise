// Volet latéral coulissant — édition des infos client (statut juridique, plateforme, groupement)
import { useState, useEffect } from 'react'
import type { CompteClient, StatutJuridique } from '../../types/client'

interface Props {
  client: CompteClient | null
  plateformesConnues: string[]
  onFermer: () => void
  onSauvegarder: (codeDso: string, opts: {
    statut_juridique: StatutJuridique | null
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

export function PanneauOptions({ client, plateformesConnues, onFermer, onSauvegarder }: Props) {
  const [statut, setStatut] = useState<StatutJuridique | ''>('')
  const [plateforme, setPlateforme] = useState('')
  const [groupement, setGroupement] = useState('')
  const [enregistrement, setEnregistrement] = useState(false)

  useEffect(() => {
    if (client) {
      setStatut(client.statut_juridique ?? '')
      setPlateforme(client.plateforme ?? '')
      setGroupement(client.code_groupement ?? '')
    }
  }, [client])

  if (!client) return null

  async function handleSauvegarder() {
    setEnregistrement(true)
    const ok = await onSauvegarder(client!.code_dso, {
      statut_juridique: statut || null,
      plateforme: plateforme.trim() || null,
      code_groupement: groupement.trim() || null,
    })
    setEnregistrement(false)
    if (ok) onFermer()
  }

  const sc = classeScore(client.note_risque)

  return (
    <>
      <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40" onClick={onFermer} />
      <div className="fixed top-0 right-0 bottom-0 w-[360px] bg-white shadow-2xl z-50 flex flex-col">
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <p className="text-sm font-bold text-gray-900">{client.nom}</p>
            <p className="text-xs text-gray-400 mt-0.5 font-mono">{client.code_dso}</p>
          </div>
          <button onClick={onFermer} className="w-7 h-7 rounded-full border border-gray-200 bg-gray-50 hover:bg-red-50 hover:border-red-200 hover:text-red-500 text-gray-400 text-sm flex items-center justify-center transition-colors">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
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

          {/* Plateforme */}
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Plateforme d'envoi</label>
            <input
              type="text"
              value={plateforme}
              onChange={e => setPlateforme(e.target.value)}
              placeholder="Ex : Chorus, Cegedim…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 outline-none focus:border-blue-400 transition-colors"
            />
            {plateformesConnues.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {plateformesConnues.map(p => (
                  <button key={p} onClick={() => setPlateforme(p)}
                    className={`text-[10px] px-2 py-0.5 rounded border font-medium transition-all ${
                      plateforme === p ? 'bg-blue-600 text-white border-blue-600' : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-blue-300 hover:text-blue-600'
                    }`}
                  >{p}</button>
                ))}
              </div>
            )}
          </div>

          {/* Code groupement */}
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Code groupement <span className="text-gray-300 normal-case font-normal">(nébuleuse)</span></label>
            <input
              type="text"
              value={groupement}
              onChange={e => setGroupement(e.target.value)}
              placeholder="Ex : GRP-01, HOLDING-A…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono text-gray-700 outline-none focus:border-blue-400 transition-colors"
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
                <p className="text-[10px] text-gray-400 mt-1">0,4 × encours + 0,6 × impayés (normalisés)</p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-2 px-5 py-4 border-t border-gray-100">
          <button onClick={onFermer} disabled={enregistrement} className="flex-1 text-sm font-medium text-gray-500 border border-gray-200 py-2.5 rounded-lg hover:border-gray-300 transition-colors disabled:opacity-40">
            Annuler
          </button>
          <button onClick={handleSauvegarder} disabled={enregistrement} className="flex-[2] flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors">
            {enregistrement ? '…' : '✓ Enregistrer'}
          </button>
        </div>
      </div>
    </>
  )
}
