// Panneau droit : formulaire de lettrage (3 états : vide / alerte / formulaire)
import { useRef } from 'react'
import type { useLettrageForm } from '../../hooks/useLettrageForm'
import type { ClasseLettrage } from '../../types/lettrage'

type Props = ReturnType<typeof useLettrageForm> & {
  onOuvrirCorrection: () => void
}

function fmt(n: number) {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

function formatDate(iso: string | null) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('fr-FR')
}

export function PanneauLettrage(props: Props) {
  const {
    ligneActive, lettragesExistants, lignesForme,
    modeAlerte, chargement,
    annuler, ajouterLigne, supprimerLigne, modifierLigne,
    chercherInfoFacture, valider, peutValider,
    creditDisponible, montantAttribue, restant,
    onOuvrirCorrection,
  } = props

  const debounceRefs = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  function handleNumeroChange(key: string, value: string) {
    modifierLigne(key, { numero_facture: value, info_facture: null })
    clearTimeout(debounceRefs.current[key])
    debounceRefs.current[key] = setTimeout(() => chercherInfoFacture(key, value), 400)
  }

  const pct = creditDisponible > 0 ? Math.min(100, Math.round((montantAttribue / creditDisponible) * 100)) : 0
  const surPaiement = restant < -0.005

  // ── État vide ──
  if (!ligneActive) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm flex flex-col items-center justify-center min-h-[320px] text-center px-6 py-10 sticky top-20">
        <div className="text-4xl mb-3 opacity-30">👆</div>
        <p className="font-semibold text-gray-700 text-sm mb-1">Sélectionnez une ligne bancaire</p>
        <p className="text-gray-400 text-xs">Cliquez sur un crédit dans la liste pour commencer le lettrage</p>
      </div>
    )
  }

  // ── État alerte (ligne 100% lettrée) ──
  if (modeAlerte) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden sticky top-20">
        <div className="px-5 py-4 border-b border-gray-100 bg-amber-50">
          <p className="text-[10px] font-semibold text-amber-600 uppercase tracking-wider mb-1">Déjà lettré à 100 %</p>
          <p className="text-sm font-semibold text-gray-800">{ligneActive.libelle}</p>
          <p className="text-xs text-gray-500 mt-0.5">{fmt(ligneActive.credit ?? 0)}</p>
        </div>

        <div className="px-5 py-4">
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-4 text-sm text-amber-800">
            <span className="flex-shrink-0 mt-0.5">⚠️</span>
            <span>
              Cette opération a été lettrée le{' '}
              <strong>{formatDate(ligneActive.derniere_date_lettrage)}</strong>.
              L'information a potentiellement été transmise au cabinet comptable.
            </span>
          </div>

          {lettragesExistants.length > 0 && (
            <>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Lettrages enregistrés</p>
              <div className="space-y-1.5 mb-4">
                {lettragesExistants.map(l => (
                  <div key={l.id} className="flex items-center justify-between text-xs bg-gray-50 rounded-lg px-3 py-2">
                    <div>
                      <span className="font-mono font-semibold text-gray-700">{l.numero_facture}</span>
                      <span className="text-gray-400 ml-2">{formatDate(l.date_lettrage)}</span>
                    </div>
                    <span className="font-semibold text-gray-700">{fmt(l.montant)}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          <button
            onClick={onOuvrirCorrection}
            className="w-full text-sm font-semibold text-blue-600 border-2 border-blue-200 hover:border-blue-400 hover:bg-blue-50 px-4 py-2.5 rounded-lg transition-all"
          >
            ✏️ Corriger via le module de correction
          </button>
        </div>

        <div className="px-5 pb-4">
          <button onClick={annuler} className="w-full text-xs text-gray-400 hover:text-gray-600 transition-colors py-1.5">
            ← Désélectionner
          </button>
        </div>
      </div>
    )
  }

  // ── Formulaire de lettrage ──
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden sticky top-20">
      {/* En-tête */}
      <div className="px-5 py-4 border-b border-gray-100 bg-blue-50/60">
        <p className="text-[10px] font-semibold text-blue-500 uppercase tracking-wider mb-1">Lettrage en cours</p>
        <p className="text-sm font-semibold text-gray-800 truncate">{ligneActive.libelle}</p>
        <p className="text-xs text-gray-500 mt-0.5">
          {new Date(ligneActive.date_operation).toLocaleDateString('fr-FR')}
          {ligneActive.infos_complementaires && <> · {ligneActive.infos_complementaires}</>}
        </p>
        <p className="text-xl font-bold text-gray-900 mt-2 tabular-nums">{fmt(creditDisponible)}</p>
      </div>

      {/* Lignes de lettrage */}
      <div className="px-5 pt-4 pb-2">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-3">Lignes de lettrage</p>

        <div className="space-y-3 mb-3">
          {lignesForme.map(ligne => (
            <div key={ligne._key}>
              <div className="grid grid-cols-[80px_1fr_76px_24px] gap-2 items-center">
                {/* Classe */}
                <select
                  value={ligne.classe}
                  onChange={e => modifierLigne(ligne._key, { classe: e.target.value as ClasseLettrage })}
                  className="border border-gray-200 rounded-md px-2 py-1.5 text-xs text-gray-700 bg-white outline-none focus:border-blue-400 appearance-none"
                >
                  <option value="facture">Facture</option>
                  <option value="autres">Autres</option>
                </select>

                {/* N° Facture */}
                <div className="relative">
                  <input
                    type="text"
                    value={ligne.numero_facture}
                    onChange={e => handleNumeroChange(ligne._key, e.target.value)}
                    placeholder={ligne.classe === 'autres' ? 'Description…' : 'N° facture'}
                    className="w-full border border-gray-200 rounded-md px-2.5 py-1.5 text-xs font-mono outline-none focus:border-blue-400 pr-6"
                  />
                  {ligne.chargement && (
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-blue-400 animate-pulse">⟳</span>
                  )}
                </div>

                {/* Montant */}
                <input
                  type="number"
                  value={ligne.montant}
                  onChange={e => modifierLigne(ligne._key, { montant: e.target.value })}
                  placeholder="0,00"
                  step="0.01"
                  className="border border-gray-200 rounded-md px-2.5 py-1.5 text-xs text-right font-mono outline-none focus:border-blue-400"
                />

                {/* Supprimer */}
                <button
                  onClick={() => supprimerLigne(ligne._key)}
                  className="w-6 h-6 rounded-full border border-red-200 bg-red-50 text-red-400 hover:bg-red-100 text-sm flex items-center justify-center transition-colors"
                >
                  ×
                </button>
              </div>

              {/* Info facture auto-remplie */}
              {ligne.classe === 'facture' && ligne.info_facture && (
                <div className="mt-1 ml-[88px] text-[10px] text-emerald-600 font-medium">
                  ✓ {ligne.info_facture.nom_client ?? ligne.info_facture.code_client}
                  {' · '}reste dû : {fmt(ligne.info_facture.reste_du)}
                  {ligne.info_facture.reste_du === 0 && (
                    <span className="ml-1 text-amber-500">— déjà soldée</span>
                  )}
                </div>
              )}
              {ligne.classe === 'facture' && !ligne.info_facture && !ligne.chargement && ligne.numero_facture.length >= 4 && (
                <div className="mt-1 ml-[88px] text-[10px] text-red-400">
                  Facture introuvable
                </div>
              )}
            </div>
          ))}
        </div>

        <button
          onClick={ajouterLigne}
          className="flex items-center gap-1.5 w-full border border-dashed border-gray-200 hover:border-blue-300 hover:text-blue-500 text-gray-400 text-xs font-medium py-2 rounded-lg transition-all"
        >
          <span className="mx-auto">+ Ajouter une ligne</span>
        </button>
      </div>

      {/* Totaux */}
      <div className="mx-5 mb-4 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-sm">
        <div className="flex justify-between items-center py-1">
          <span className="text-xs text-gray-400">Crédit disponible</span>
          <span className="font-semibold tabular-nums text-gray-700">{fmt(creditDisponible)}</span>
        </div>
        <div className="flex justify-between items-center py-1">
          <span className="text-xs text-gray-400">Attribué</span>
          <span className="font-semibold tabular-nums text-emerald-600">{fmt(montantAttribue)}</span>
        </div>
        <div className="flex justify-between items-center py-1 border-t border-gray-200 mt-1 pt-2">
          <span className="text-xs text-gray-500 font-medium">Restant</span>
          <div className="flex items-center gap-2">
            <span className={`font-bold tabular-nums ${surPaiement ? 'text-red-600' : restant < 0.01 ? 'text-emerald-600' : 'text-amber-600'}`}>
              {fmt(Math.abs(restant))}
            </span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
              surPaiement ? 'bg-red-100 text-red-600' :
              restant < 0.01 ? 'bg-emerald-100 text-emerald-600' :
              'bg-amber-100 text-amber-700'
            }`}>
              {surPaiement ? '⚠ Dépassement' : restant < 0.01 ? '✓ 100 %' : `${pct} %`}
            </span>
          </div>
        </div>
      </div>

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
          className="flex-[2] flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold py-2.5 rounded-lg transition-colors"
        >
          {chargement ? <><span className="animate-spin text-xs">⏳</span> En cours…</> : '✓ Valider le lettrage'}
        </button>
      </div>
    </div>
  )
}
