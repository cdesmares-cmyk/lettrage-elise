// Correction d'affectation depuis le compte client.
//
// Le module de la page Lettrage fait la même chose, mais demande de taper les
// numéros de facture, les montants et leur signe, et de tomber soi-même à zéro.
// Ici l'opérateur désigne, l'application calcule : il coche ce qu'il reprend,
// coche où il réaffecte, et ne saisit jamais un signe ni un total.
import { useState, useMemo, useEffect } from 'react'
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { construireEcrituresCorrection, totalEcritures, type LigneCorrection } from '../../lib/correctionLettrage'
import { IcLoader, IcX } from '../Icones'
import type { FactureDetail } from '../../types/client'

interface Props {
  codeDso: string
  nomClient: string
  factures: FactureDetail[]
  onFermer: () => void
  onRefreshFactures: () => void
}

type Selection = Map<string, string>

function euros(n: number) {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

/** Ce qui est actuellement affecté sur la facture. */
function montantLettre(f: FactureDetail) {
  return Math.round((f.montant_ttc - f.reste_du) * 100) / 100
}

function lire(v: string) {
  return parseFloat(v.replace(',', '.')) || 0
}

function somme(map: Selection) {
  let t = 0
  for (const v of map.values()) t += lire(v)
  return Math.round(t * 100) / 100
}

// Colonne définie au niveau du module, pas dans le composant parent : une
// fonction composant créée pendant le rendu est remontée à chaque frappe, et
// le champ montant perdrait le focus à chaque caractère.
function Colonne({
  titre, aide, lignes, map, setMap, valeurDe, libelleMontant, exportees,
}: {
  titre: string
  aide: string
  lignes: FactureDetail[]
  map: Selection
  setMap: (m: Selection) => void
  valeurDe: (f: FactureDetail) => number
  libelleMontant: string
  exportees: Set<string>
}) {
  function basculer(numero: string, defaut: number) {
    const n = new Map(map)
    if (n.has(numero)) n.delete(numero)
    else n.set(numero, String(Math.round(defaut * 100) / 100))
    setMap(n)
  }
  function saisir(numero: string, valeur: string) {
    const n = new Map(map)
    n.set(numero, valeur)
    setMap(n)
  }

  return (
    <div className="flex-1 min-w-0 flex flex-col">
      <div className="px-5 pt-4 pb-2">
        <p className="text-[11px] font-bold text-ockham-teal uppercase tracking-wider">{titre}</p>
        <p className="text-[11px] text-gray-400 mt-1">{aide}</p>
      </div>
      <div className="flex-1 overflow-y-auto px-5 pb-4">
        {!lignes.length ? (
          <p className="text-xs text-gray-400 py-8 text-center">Aucune facture éligible.</p>
        ) : (
          <div className="space-y-1">
            {lignes.map(f => {
              const choisi = map.has(f.numero_piece)
              return (
                <div key={f.numero_piece}
                     className={`border rounded-lg px-3 py-2 transition-colors ${
                       choisi ? 'border-ockham-teal bg-ockham-teal-muted' : 'border-gray-200 hover:border-gray-300'
                     }`}>
                  <div className="flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      checked={choisi}
                      onChange={() => basculer(f.numero_piece, valeurDe(f))}
                      className="accent-ockham-teal flex-shrink-0"
                    />
                    <button onClick={() => basculer(f.numero_piece, valeurDe(f))}
                            className="flex-1 min-w-0 text-left">
                      <span className="text-xs font-mono font-semibold text-gray-800">{f.numero_piece}</span>
                      {exportees.has(f.numero_piece) && (
                        <span className="ml-2 text-[9px] font-bold text-gray-400 border border-gray-200 rounded px-1 py-px">
                          EXPORTÉE
                        </span>
                      )}
                      <span className="block text-[10.5px] text-gray-400">
                        {libelleMontant} {euros(valeurDe(f))}
                      </span>
                    </button>
                    {choisi && (
                      <input
                        type="text"
                        value={map.get(f.numero_piece) ?? ''}
                        onChange={e => saisir(f.numero_piece, e.target.value)}
                        className="w-24 border border-gray-200 rounded-md px-2 py-1 text-xs text-right font-mono tabular-nums outline-none focus:border-ockham-teal"
                      />
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export function ModalCorrectionClient({ codeDso, nomClient, factures, onFermer, onRefreshFactures }: Props) {
  const { utilisateur } = useAuth()
  const [reprises, setReprises] = useState<Selection>(new Map())
  const [affectations, setAffectations] = useState<Selection>(new Map())
  const [exportees, setExportees] = useState<Set<string>>(new Set())
  const [enCours, setEnCours] = useState(false)

  // Les pseudo-factures 411 ne sont pas des factures : elles n'ont rien à faire
  // dans une correction d'affectation.
  const reelles = useMemo(
    () => factures.filter(f => !f.numero_piece.startsWith('411_')),
    [factures]
  )
  const sources = useMemo(
    () => reelles.filter(f => montantLettre(f) > 0.005).sort((a, b) => montantLettre(b) - montantLettre(a)),
    [reelles]
  )
  const cibles = useMemo(
    () => reelles.filter(f => f.reste_du > 0.005).sort((a, b) => b.reste_du - a.reste_du),
    [reelles]
  )

  // Information, pas restriction : une correction n'écrit pas dans le passé.
  // Mais le comptable verra deux mouvements dans le prochain export, autant
  // que l'opérateur le sache avant de valider.
  useEffect(() => {
    const numeros = reelles.map(f => f.numero_piece)
    if (!numeros.length) return
    supabase
      .from('lettrages')
      .select('numero_facture')
      .in('numero_facture', numeros)
      .eq('annule', false)
      .not('export_id', 'is', null)
      .then(({ data }) => {
        setExportees(new Set(((data ?? []) as { numero_facture: string }[]).map(r => r.numero_facture)))
      })
  }, [reelles])

  const totalRepris  = somme(reprises)
  const totalAffecte = somme(affectations)
  const ecart        = Math.round((totalRepris - totalAffecte) * 100) / 100
  const equilibre    = Math.abs(ecart) < 0.01
  const peutValider  = totalRepris > 0.005 && equilibre && !enCours

  async function valider() {
    if (!peutValider) return
    setEnCours(true)
    try {
      const lignes: LigneCorrection[] = []
      for (const [numero, v] of reprises) {
        const m = lire(v)
        if (m > 0.005) lignes.push({ numero_facture: numero, code_client: codeDso, montant: -m })
      }
      for (const [numero, v] of affectations) {
        const m = lire(v)
        if (m > 0.005) lignes.push({ numero_facture: numero, code_client: codeDso, montant: m })
      }

      const ecritures = await construireEcrituresCorrection(
        lignes,
        { cree_par: utilisateur?.id ?? null, operateur: utilisateur?.email?.split('@')[0] ?? null },
        new Date().toISOString().split('T')[0],
      )

      // Dernier filet avant d'écrire. Il est côté navigateur, comme tout le
      // reste de cette opération : la base ne contrôle pas encore l'équilibre.
      const total = totalEcritures(ecritures)
      if (Math.abs(total) >= 0.01) {
        toast.error(`Écritures déséquilibrées (${euros(total)}). Rien n'a été enregistré.`)
        return
      }

      const { error } = await supabase.from('lettrages').insert(ecritures as never)
      if (error) throw error
      toast.success('Correction enregistrée.')
      onRefreshFactures()
      onFermer()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur lors de la correction.')
    } finally {
      setEnCours(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
         onClick={e => { if (e.target === e.currentTarget) onFermer() }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[88vh] flex flex-col">

        <div className="px-6 py-4 flex items-center justify-between" style={{ background: '#0E1A2B' }}>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-white truncate">Corriger une affectation</h2>
            <p className="text-[11px] text-white/50 mt-0.5 truncate">{nomClient}</p>
          </div>
          <button onClick={onFermer}
                  className="w-7 h-7 rounded-full border border-white/20 text-white/60 hover:bg-white/10 hover:text-white flex items-center justify-center flex-shrink-0">
            <IcX size={12} />
          </button>
        </div>

        <div className="px-6 pt-4">
          <p className="text-[11px] text-gray-500 leading-relaxed">
            La correction ne modifie rien du passé. Elle pose aujourd'hui deux écritures qui
            s'annulent : une négative là où le règlement était mal affecté, une positive là où il
            doit aller. Une période déjà exportée reste intacte, la correction apparaîtra dans le
            prochain export.
          </p>
        </div>

        <div className="flex-1 min-h-0 flex divide-x divide-gray-100 mt-2">
          <Colonne
            titre="1 — Reprendre"
            aide="Factures qui portent une affectation. Cochez ce que vous retirez."
            lignes={sources} map={reprises} setMap={setReprises}
            valeurDe={montantLettre} libelleMontant="Affecté :" exportees={exportees}
          />
          <Colonne
            titre="2 — Réaffecter"
            aide="Factures encore dues. Cochez où le règlement doit aller."
            lignes={cibles} map={affectations} setMap={setAffectations}
            valeurDe={f => f.reste_du} libelleMontant="Reste dû :" exportees={exportees}
          />
        </div>

        <div className={`px-6 py-3 border-t flex items-center justify-between text-sm ${
          totalRepris < 0.005 ? 'bg-gray-50 border-gray-100'
            : equilibre ? 'bg-emerald-50 border-emerald-200'
            : 'bg-amber-50 border-amber-200'
        }`}>
          <div className="text-xs">
            <span className="text-gray-500">Repris</span>{' '}
            <span className="font-bold tabular-nums text-gray-800">{euros(totalRepris)}</span>
            <span className="text-gray-300 mx-2">·</span>
            <span className="text-gray-500">Réaffecté</span>{' '}
            <span className="font-bold tabular-nums text-gray-800">{euros(totalAffecte)}</span>
          </div>
          <div className="text-xs font-semibold">
            {totalRepris < 0.005
              ? <span className="text-gray-400">Cochez d'abord ce que vous reprenez</span>
              : equilibre
                ? <span className="text-emerald-700">Équilibré, impact 0,00 €</span>
                : <span className="text-amber-700">
                    {ecart > 0 ? `Reste ${euros(ecart)} à réaffecter` : `${euros(-ecart)} de trop réaffectés`}
                  </span>}
          </div>
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
          <button onClick={onFermer} disabled={enCours}
                  className="flex-1 text-sm font-medium text-gray-500 border border-gray-200 hover:border-gray-300 py-2.5 rounded-lg transition-colors disabled:opacity-40">
            Annuler
          </button>
          <button onClick={valider} disabled={!peutValider}
                  className="flex-[2] flex items-center justify-center gap-2 bg-ockham-teal hover:bg-ockham-teal-dark disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold py-2.5 rounded-lg transition-colors">
            {enCours ? <><IcLoader size={13} /> Enregistrement…</> : 'Enregistrer la correction'}
          </button>
        </div>
      </div>
    </div>
  )
}
