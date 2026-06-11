// Panneau droit — dispatch d'une ligne 411 Attente vers des factures réelles
import { useRef } from 'react'
import { IcCursor, IcCheck, IcLoader, IcWarning, IcX } from '../Icones'
import type { useDispatch411Attente } from '../../hooks/useDispatch471'

type Props = ReturnType<typeof useDispatch411Attente>

function fmt(n: number) {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

export function PanneauDispatch411Attente(props: Props) {
  const {
    ligneActive, lettragesExistants, lignesForme,
    chargement,
    annuler, ajouterLigne, supprimerLigne, modifierLigne,
    chercherInfoFacture, valider, peutValider, motifInvalide,
    creditDisponible, montantAttribue, restant,
  } = props

  const debounceRefs = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const surPaiement = restant < -0.005

  function handleNumeroChange(key: string, value: string) {
    modifierLigne(key, { numero_facture: value, info_facture: null })
    clearTimeout(debounceRefs.current[key])
    debounceRefs.current[key] = setTimeout(() => chercherInfoFacture(key, value), 400)
  }

  if (!ligneActive) {
    return (
      <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden sticky top-20">
        <div className="flex flex-col items-center justify-center min-h-[280px] text-center px-6 py-10">
          <div className="mb-3 opacity-20 text-orange-400"><IcCursor size={40} /></div>
          <p className="font-semibold text-gray-700 text-sm mb-1">Sélectionnez une ligne en attente</p>
          <p className="text-gray-400 text-xs">Cliquez sur une ligne 411 Attente dans la liste à gauche pour la dispatcher</p>
        </div>
      </div>
    )
  }

  const pct = creditDisponible > 0 ? Math.min(100, Math.round((montantAttribue / creditDisponible) * 100)) : 0
  const motif = motifInvalide()

  return (
    <div className="bg-white border border-orange-100 rounded-xl shadow-sm overflow-hidden sticky top-20">
      {/* En-tête */}
      <div className="px-5 py-4 border-b border-orange-100" style={{ background: 'linear-gradient(135deg, #FFF7ED 0%, #fff 60%)' }}>
        <p className="text-[10px] font-bold text-orange-500 uppercase tracking-widest mb-2">411 Attente</p>
        <p className="text-2xl font-extrabold tabular-nums text-orange-600 leading-none">{fmt(creditDisponible)}</p>
        <p className="text-sm font-semibold text-gray-800 truncate mt-2">{ligneActive.libelle}</p>
        <p className="text-xs text-gray-400 mt-0.5">
          Virement du {new Date(ligneActive.date_operation).toLocaleDateString('fr-FR')}
          {ligneActive.infos_complementaires && <> · {ligneActive.infos_complementaires}</>}
        </p>
      </div>

      {/* Lettrages déjà existants sur cette ligne */}
      {lettragesExistants.length > 0 && (
        <div className="px-5 pt-4 pb-1">
          <p className="text-[10px] font-semibold text-amber-500 uppercase tracking-wide mb-2">Lettrages précédents</p>
          <div className="space-y-1 mb-2">
            {lettragesExistants.map(l => (
              <div key={l.id} className="flex items-center justify-between text-xs bg-amber-50 border border-amber-100 rounded-lg px-3 py-1.5">
                <div>
                  {l.numero_facture
                    ? <span className="font-mono font-semibold text-gray-700">{l.numero_facture}</span>
                    : <span className="text-amber-600 font-semibold">Autres</span>
                  }
                  {l.commentaire && <span className="text-gray-400 ml-2 italic">{l.commentaire}</span>}
                </div>
                <span className="font-semibold text-amber-700">{fmt(l.montant)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lignes de dispatch */}
      <div className="px-5 pt-2 pb-2">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-3">Affecter à des factures</p>
        <div className="space-y-4 mb-3">
          {lignesForme.map(ligne => (
            <div key={ligne._key}>
              <div className="flex items-center gap-2 mb-1.5">
                <div className="relative flex-1">
                  <select
                    value={ligne.classe}
                    onChange={e => {
                      clearTimeout(debounceRefs.current[ligne._key])
                      modifierLigne(ligne._key, { classe: e.target.value as 'facture' | 'autres', numero_facture: '', montant: '', info_facture: null, chargement: false })
                    }}
                    className="w-full border border-gray-200 rounded-md pl-3 pr-6 py-1.5 text-xs text-gray-700 bg-white outline-none focus:border-orange-400 appearance-none cursor-pointer"
                  >
                    <option value="facture">Facture</option>
                    <option value="autres">Autres</option>
                  </select>
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none text-[9px]">▾</span>
                </div>
                <button
                  onClick={() => supprimerLigne(ligne._key)}
                  className="w-6 h-6 rounded-full border border-red-200 bg-red-50 text-red-400 hover:bg-red-100 flex items-center justify-center transition-colors flex-shrink-0"
                >
                  <IcX size={11} />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={ligne.numero_facture}
                    onChange={e => {
                      if (ligne.classe === 'autres') modifierLigne(ligne._key, { numero_facture: e.target.value })
                      else handleNumeroChange(ligne._key, e.target.value)
                    }}
                    placeholder={ligne.classe === 'autres' ? 'Commentaire…' : 'N° facture'}
                    className="w-full border border-gray-200 rounded-md px-2.5 py-1.5 text-xs font-mono outline-none focus:border-orange-400 pr-6"
                  />
                  {ligne.chargement && ligne.classe !== 'autres' && (
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-orange-400"><IcLoader size={11} /></span>
                  )}
                </div>
                <input
                  type="number"
                  value={ligne.montant}
                  onChange={e => modifierLigne(ligne._key, { montant: e.target.value })}
                  placeholder={ligne.classe === 'autres' ? '— auto' : '0,00'}
                  step="0.01"
                  disabled={ligne.classe === 'autres'}
                  className={`w-20 flex-shrink-0 border rounded-md px-2 py-1.5 text-xs text-right font-mono outline-none transition-colors ${
                    ligne.classe === 'autres'
                      ? 'border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed'
                      : 'border-gray-200 focus:border-orange-400'
                  }`}
                />
              </div>
              {ligne.classe === 'facture' && ligne.info_facture && (
                <div className="mt-1 text-[10px] text-emerald-600 font-medium">
                  ✓ {ligne.info_facture.nom_client ?? ligne.info_facture.code_client}
                  {' · '}reste dû : {fmt(ligne.info_facture.reste_du)}
                </div>
              )}
              {ligne.classe === 'facture' && !ligne.info_facture && !ligne.chargement && ligne.numero_facture.length >= 4 && (
                <div className="mt-1 text-[10px] text-red-400">Facture introuvable</div>
              )}
            </div>
          ))}
        </div>
        <button
          onClick={ajouterLigne}
          className="flex items-center gap-1.5 w-full border border-dashed border-gray-200 hover:border-orange-400/40 hover:text-orange-500 text-gray-400 text-xs font-medium py-2 rounded-lg transition-all"
        >
          <span className="mx-auto">+ Ajouter une ligne</span>
        </button>
      </div>

      {/* Totaux */}
      <div className="mx-5 mb-4 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-sm">
        <div className="flex justify-between items-center py-1">
          <span className="text-xs text-gray-400">Montant à dispatcher</span>
          <span className="font-semibold tabular-nums text-gray-700">{fmt(creditDisponible)}</span>
        </div>
        <div className="flex justify-between items-center py-1">
          <span className="text-xs text-gray-400">Attribué</span>
          <span className="font-semibold tabular-nums text-emerald-600">{fmt(montantAttribue)}</span>
        </div>
        <div className="flex justify-between items-center py-1 border-t border-gray-200 mt-1 pt-2">
          <span className="text-xs text-gray-500 font-medium">Restant</span>
          <div className="flex items-center gap-2">
            <span className={`font-bold tabular-nums ${surPaiement ? 'text-red-600' : restant < 0.01 ? 'text-emerald-600' : 'text-orange-500'}`}>
              {fmt(Math.abs(restant))}
            </span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
              surPaiement ? 'bg-red-100 text-red-600' :
              restant < 0.01 ? 'bg-emerald-100 text-emerald-600' :
              'bg-orange-100 text-orange-600'
            }`}>
              {surPaiement ? <span className="inline-flex items-center gap-0.5"><IcWarning size={10} /> Dépassement</span> : restant < 0.01 ? <span className="inline-flex items-center gap-0.5"><IcCheck size={10} /> 100 %</span> : `${pct} %`}
            </span>
          </div>
        </div>
      </div>

      {/* Motif si bouton désactivé */}
      {motif && (
        <div className="mx-5 mb-3 text-[11px] text-orange-600 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
          {motif}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 px-5 pb-5">
        <button
          onClick={annuler}
          disabled={chargement}
          className="flex-1 text-sm font-medium text-gray-500 border border-gray-200 hover:border-gray-300 hover:text-gray-700 py-2.5 rounded-lg transition-colors disabled:opacity-40"
        >
          Annuler
        </button>
        <button
          onClick={valider}
          disabled={!peutValider() || chargement}
          className="flex-[2] flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold py-2.5 rounded-lg transition-colors"
        >
          {chargement ? <><IcLoader size={13} /> En cours…</> : <><IcCheck size={13} /> Dispatcher ce paiement</>}
        </button>
      </div>
    </div>
  )
}

// Alias rétrocompatible
export const PanneauDispatch471 = PanneauDispatch411Attente
