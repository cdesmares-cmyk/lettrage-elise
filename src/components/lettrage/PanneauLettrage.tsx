// Panneau droit : formulaire de lettrage (3 états : vide / alerte / formulaire)
import { useRef, useState } from 'react'
import { IcCursor, IcWarning, IcEdit, IcSearch } from '../Icones'
import type { useLettrageForm } from '../../hooks/useLettrageForm'
import type { ClasseLettrage } from '../../types/lettrage'
import type { Remise } from '../../types/remise'
import type { CompteClient } from '../../types/client'

type Props = ReturnType<typeof useLettrageForm> & {
  onOuvrirCorrection: () => void
  onOuvrirNavigateur: () => void
  remisesEnAttente: Remise[]
  onEncaisser: (remiseId: string) => Promise<void>
  clients: CompteClient[]
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
    onOuvrirCorrection, onOuvrirNavigateur, remisesEnAttente, onEncaisser, clients,
  } = props

  const debounceRefs = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const [confirmEncaissement, setConfirmEncaissement] = useState<string | null>(null)
  const [openDropdown411Key, setOpenDropdown411Key] = useState<string | null>(null)

  function clientsFiltres(recherche: string) {
    if (recherche.length < 2) return []
    return clients.filter(c =>
      c.nom.toLowerCase().includes(recherche.toLowerCase()) ||
      c.code_dso.toLowerCase().includes(recherche.toLowerCase())
    ).slice(0, 8)
  }

  function handleNumeroChange(key: string, value: string) {
    modifierLigne(key, { numero_facture: value, info_facture: null })
    clearTimeout(debounceRefs.current[key])
    debounceRefs.current[key] = setTimeout(() => chercherInfoFacture(key, value), 400)
  }

  const pct = creditDisponible > 0 ? Math.min(100, Math.round((montantAttribue / creditDisponible) * 100)) : 0
  const surPaiement = restant < -0.005
  const hasCompteClient = lignesForme.some(l => l.classe === 'compte_client')
  const hasAttente411 = lignesForme.some(l => l.classe === 'attente_411')
  const hasCompteLigne = hasCompteClient || hasAttente411
  const labelBouton = hasCompteClient ? 'Affecter au Compte Client'
    : hasAttente411 ? 'Affecter au 411 Attente'
    : '✓ Valider le lettrage'

  // ── État vide ──
  if (!ligneActive) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm flex flex-col items-center justify-center min-h-[320px] text-center px-6 py-10 sticky top-20">
        <div className="mb-3 opacity-20 text-gray-400"><IcCursor size={40} /></div>
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
            <span className="flex-shrink-0 mt-0.5 text-amber-500"><IcWarning size={15} /></span>
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
                      {l.numero_facture
                        ? <span className="font-mono font-semibold text-gray-700">{l.numero_facture}</span>
                        : <span className="text-amber-600 font-semibold">Autres{l.commentaire ? ` · ${l.commentaire}` : ''}</span>
                      }
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
            className="w-full flex items-center justify-center gap-2 text-sm font-semibold text-ockham-teal border-2 border-ockham-teal/40 hover:border-ockham-teal hover:bg-ockham-teal-muted px-4 py-2.5 rounded-lg transition-all"
          >
            <IcEdit size={13} className="flex-shrink-0" /> Corriger via le module de correction
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
    <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden sticky top-20">
      {/* En-tête — crédit sélectionné */}
      <div className="px-5 py-4 border-b border-gray-100" style={{ background: 'linear-gradient(135deg, #ECFDFB 0%, #fff 60%)' }}>
        <p className="text-[10px] font-bold text-ockham-teal uppercase tracking-widest mb-2">Crédit sélectionné</p>
        <p className="text-2xl font-extrabold tabular-nums text-ockham-teal leading-none">{fmt(creditDisponible)}</p>
        <p className="text-sm font-semibold text-gray-800 truncate mt-2">{ligneActive.libelle}</p>
        <p className="text-xs text-gray-400 mt-0.5">
          {new Date(ligneActive.date_operation).toLocaleDateString('fr-FR')}
          {ligneActive.infos_complementaires && <> · {ligneActive.infos_complementaires}</>}
        </p>
      </div>

      {/* Attributions précédentes — visible pour les partiellement lettrés */}
      {lettragesExistants.length > 0 && (
        <div className="px-5 pt-4 pb-1">
          <p className="text-[10px] font-semibold text-amber-500 uppercase tracking-wide mb-2">Attributions précédentes</p>
          <div className="space-y-1 mb-2">
            {lettragesExistants.map(l => (
              <div key={l.id} className="flex items-center justify-between text-xs bg-amber-50 border border-amber-100 rounded-lg px-3 py-1.5">
                <div>
                  {l.numero_facture
                    ? <span className="font-mono font-semibold text-gray-700">{l.numero_facture}</span>
                    : <span className="text-amber-600 font-semibold">Autres</span>
                  }
                  <span className="text-gray-400 ml-2">{formatDate(l.date_lettrage)}</span>
                  {l.commentaire && <span className="text-gray-400 ml-2 italic">{l.commentaire}</span>}
                </div>
                <span className="font-semibold text-amber-700">{fmt(l.montant)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lignes de lettrage */}
      <div className="px-5 pt-4 pb-2">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-3">Nouvelles lignes</p>

        {/* Picker remises quand CHQ ou LCR sélectionné sur la première ligne */}
        {(lignesForme[0]?.classe === 'cheque' || lignesForme[0]?.classe === 'lcr') && (() => {
          const typeActif = lignesForme[0].classe
          const remisesFiltrees = remisesEnAttente
            .filter(r => r.type === typeActif)
            .sort((a, b) => {
              const ta = a.montant_total ?? a.lignes.reduce((s, l) => s + l.montant, 0)
              const tb = b.montant_total ?? b.lignes.reduce((s, l) => s + l.montant, 0)
              return Math.abs(ta - creditDisponible) - Math.abs(tb - creditDisponible)
            })
          return (
            <div className="mb-3">
              {remisesFiltrees.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4">
                  Aucune remise {typeActif === 'cheque' ? 'CHQ' : 'LCR'} en attente
                </p>
              ) : (
                <div className="space-y-2">
                  {remisesFiltrees.map(r => {
                    const total = r.montant_total ?? r.lignes.reduce((s, l) => s + l.montant, 0)
                    const ecart = Math.abs(total - creditDisponible)
                    const exact = ecart <= 0.02
                    const enConfirm = confirmEncaissement === r.id
                    return (
                      <div key={r.id} className={`border rounded-lg px-3 py-2.5 ${exact ? 'border-emerald-300 bg-emerald-50/60' : 'border-red-200 bg-red-50/40'}`}>
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            {r.type === 'cheque'
                              ? <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-800 text-white">CHQ</span>
                              : <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-sky-200 text-sky-800 border border-sky-300">LCR</span>
                            }
                            <span className="text-xs font-semibold text-gray-700">N°{r.numero}</span>
                            {exact
                              ? <span className="text-[10px] font-semibold text-emerald-600">✓ montant exact</span>
                              : <span className="text-[10px] font-semibold text-red-500">⚠ écart {fmt(ecart)}</span>
                            }
                          </div>
                          <span className="text-sm font-bold text-gray-900 tabular-nums">{fmt(total)}</span>
                        </div>
                        <div className="text-[10px] text-gray-500 mb-2 space-y-0.5">
                          {r.lignes.map(l => (
                            <div key={l.id} className="flex justify-between">
                              <span className="font-mono">{l.numero_facture}</span>
                              <span>{fmt(l.montant)}</span>
                            </div>
                          ))}
                        </div>
                        {!exact && (
                          <p className="text-[10px] text-red-500 mb-2">
                            Écart de {fmt(ecart)} avec la ligne bancaire — le montant doit correspondre à ±2 cts.
                          </p>
                        )}
                        {enConfirm ? (
                          <div className="bg-white border border-amber-200 rounded-md px-3 py-2.5 space-y-2">
                            <p className="text-xs font-semibold text-gray-800">
                              Confirmer l'encaissement de la remise {r.type === 'cheque' ? 'CHQ' : 'LCR'} N°{r.numero} ({fmt(total)}) ?
                            </p>
                            <div className="flex gap-2">
                              <button
                                onClick={() => { setConfirmEncaissement(null); onEncaisser(r.id) }}
                                disabled={chargement}
                                className="flex-1 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white py-1.5 rounded-md transition-colors"
                              >
                                Oui, encaisser
                              </button>
                              <button
                                onClick={() => setConfirmEncaissement(null)}
                                className="flex-1 text-xs font-medium border border-gray-200 text-gray-500 hover:border-gray-300 py-1.5 rounded-md transition-colors"
                              >
                                Non
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => exact && setConfirmEncaissement(r.id)}
                            disabled={chargement || !exact}
                            title={!exact ? `Montant incompatible — écart de ${fmt(ecart)}` : undefined}
                            className="w-full text-xs font-semibold bg-ockham-teal hover:bg-ockham-teal-dark disabled:opacity-40 disabled:cursor-not-allowed text-white py-1.5 rounded-md transition-colors"
                          >
                            ✓ Encaisser cette remise
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })()}

        <div className="space-y-4 mb-3">
          {lignesForme.map(ligne => (
            <div key={ligne._key}>
              {/* Ligne 1 : sélecteur de classe + supprimer */}
              <div className="flex items-center gap-2 mb-1.5">
                <div className="relative flex-1">
                  <select
                    value={ligne.classe}
                    onChange={e => {
                      clearTimeout(debounceRefs.current[ligne._key])
                      modifierLigne(ligne._key, { classe: e.target.value as ClasseLettrage, numero_facture: '', montant: '', info_facture: null, chargement: false, client_411: undefined })
                      setOpenDropdown411Key(null)
                    }}
                    className="w-full border border-gray-200 rounded-md pl-3 pr-6 py-1.5 text-xs text-gray-700 bg-white outline-none focus:border-ockham-teal appearance-none cursor-pointer"
                  >
                    <option value="facture">Facture</option>
                    <option value="cheque">CHQ</option>
                    <option value="lcr">LCR</option>
                    <option value="compte_client">411 Client</option>
                    <option value="attente_411">411 Attente</option>
                    <option value="471">471 Attente</option>
                  </select>
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none text-[9px]">▾</span>
                </div>
                <button
                  onClick={() => supprimerLigne(ligne._key)}
                  className="w-6 h-6 rounded-full border border-red-200 bg-red-50 text-red-400 hover:bg-red-100 text-sm flex items-center justify-center transition-colors flex-shrink-0"
                >
                  ×
                </button>
              </div>

              {/* Ligne 2 : champ central + montant */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  {ligne.classe === 'compte_client' ? (
                    <>
                      <input
                        type="text"
                        value={ligne.numero_facture}
                        onChange={e => {
                          modifierLigne(ligne._key, { numero_facture: e.target.value, client_411: undefined })
                          setOpenDropdown411Key(ligne._key)
                        }}
                        onFocus={() => setOpenDropdown411Key(ligne._key)}
                        onBlur={() => setTimeout(() => setOpenDropdown411Key(null), 150)}
                        placeholder="Rechercher un client…"
                        className={`w-full border rounded-md px-2.5 py-1.5 text-xs outline-none pr-6 ${
                          ligne.client_411 ? 'border-indigo-300 bg-indigo-50/50 text-indigo-700 font-semibold' : 'border-gray-200 focus:border-indigo-400 text-gray-700'
                        }`}
                      />
                      {ligne.numero_facture && (
                        <button
                          onMouseDown={() => modifierLigne(ligne._key, { numero_facture: '', client_411: undefined })}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 text-xs"
                        >✕</button>
                      )}
                      {openDropdown411Key === ligne._key && clientsFiltres(ligne.numero_facture).length > 0 && (
                        <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                          {clientsFiltres(ligne.numero_facture).map(c => (
                            <button
                              key={c.code_dso}
                              onMouseDown={() => {
                                modifierLigne(ligne._key, { numero_facture: c.nom, client_411: { code_dso: c.code_dso, nom: c.nom } })
                                setOpenDropdown411Key(null)
                              }}
                              className="w-full text-left px-3 py-2 text-xs hover:bg-indigo-50 transition-colors"
                            >
                              <span className="font-semibold text-gray-800">{c.nom}</span>
                              <span className="text-gray-400 ml-2">{c.code_dso}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  ) : ligne.classe === 'attente_411' ? (
                    <div className="w-full border border-gray-100 rounded-md px-2.5 py-1.5 text-xs text-gray-400 bg-gray-50 cursor-not-allowed">
                      411 Attente (global)
                    </div>
                  ) : ligne.classe === '471' ? (
                    <input
                      type="text"
                      value={ligne.numero_facture}
                      onChange={e => modifierLigne(ligne._key, { numero_facture: e.target.value })}
                      placeholder="Commentaire (optionnel)…"
                      className="w-full border border-violet-200 rounded-md px-2.5 py-1.5 text-xs outline-none focus:border-violet-400 bg-violet-50/40 text-gray-700"
                    />
                  ) : (
                    <>
                      <input
                        type="text"
                        value={ligne.numero_facture}
                        onChange={e => handleNumeroChange(ligne._key, e.target.value)}
                        placeholder="N° facture"
                        className="w-full border border-gray-200 rounded-md px-2.5 py-1.5 text-xs font-mono outline-none focus:border-ockham-teal pr-6"
                      />
                      {ligne.chargement && (
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-ockham-teal animate-pulse">⟳</span>
                      )}
                    </>
                  )}
                </div>

                {/* Montant — auto pour 411 Client, 411 Attente, 471 */}
                <input
                  type="number"
                  value={ligne.classe === 'compte_client' || ligne.classe === 'attente_411' || ligne.classe === '471'
                    ? restant > 0.005 ? String(Math.round(restant * 100) / 100) : ''
                    : ligne.montant
                  }
                  onChange={e => modifierLigne(ligne._key, { montant: e.target.value })}
                  placeholder="— auto"
                  step="0.01"
                  disabled={ligne.classe === 'compte_client' || ligne.classe === 'attente_411' || ligne.classe === '471'}
                  className={`w-20 flex-shrink-0 border rounded-md px-2 py-1.5 text-xs text-right font-mono outline-none transition-colors ${
                    ligne.classe === 'compte_client' || ligne.classe === 'attente_411' || ligne.classe === '471'
                      ? `border-gray-100 bg-gray-50 cursor-not-allowed ${ligne.classe === 'compte_client' ? 'text-indigo-400' : ligne.classe === 'attente_411' ? 'text-orange-400' : 'text-violet-400'}`
                      : 'border-gray-200 focus:border-ockham-teal'
                  }`}
                />
              </div>

              {/* Info sous la ligne */}
              {ligne.classe === 'compte_client' && ligne.client_411 && (
                <div className="mt-1 text-[10px] text-indigo-600 font-medium">
                  ✓ {ligne.client_411.nom ?? ligne.client_411.code_dso} · Compte Client 411
                </div>
              )}
              {(ligne.classe === 'facture' || ligne.classe === 'cheque' || ligne.classe === 'lcr') && ligne.info_facture && (
                <div className="mt-1 text-[10px] text-emerald-600 font-medium">
                  ✓ {ligne.info_facture.nom_client ?? ligne.info_facture.code_client}
                  {' · '}reste dû : {fmt(ligne.info_facture.reste_du)}
                  {ligne.info_facture.reste_du === 0 && (
                    <span className="ml-1 text-amber-500">— déjà soldée</span>
                  )}
                </div>
              )}
              {(ligne.classe === 'facture' || ligne.classe === 'cheque' || ligne.classe === 'lcr') && !ligne.info_facture && !ligne.chargement && ligne.numero_facture.length >= 4 && (
                <div className="mt-1 text-[10px] text-red-400">
                  Facture introuvable
                </div>
              )}
            </div>
          ))}
        </div>

        {!hasCompteLigne && (
          <button
            onClick={ajouterLigne}
            className="flex items-center gap-1.5 w-full border border-dashed border-gray-200 hover:border-ockham-teal/40 hover:text-ockham-teal text-gray-400 text-xs font-medium py-2 rounded-lg transition-all"
          >
            <span className="mx-auto">+ Ajouter une ligne</span>
          </button>
        )}
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
      <div className="flex gap-2 px-5 pb-3">
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
          className="flex-[2] flex items-center justify-center gap-2 bg-ockham-teal hover:bg-ockham-teal-dark disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold py-2.5 rounded-lg transition-colors"
        >
          {chargement ? <><span className="animate-spin text-xs">⏳</span> En cours…</> : labelBouton}
        </button>
      </div>
      <div className="px-5 pb-3">
        <button
          onClick={onOuvrirNavigateur}
          disabled={chargement}
          className="w-full flex items-center justify-center gap-2 text-sm font-semibold text-ockham-teal border border-ockham-teal/30 hover:border-ockham-teal hover:bg-ockham-teal-muted disabled:opacity-40 disabled:cursor-not-allowed px-4 py-2 rounded-lg transition-all"
        >
          <IcSearch size={13} className="flex-shrink-0" /> Naviguer dans les factures
        </button>
      </div>

    </div>
  )
}
