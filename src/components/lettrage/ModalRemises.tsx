// Modal de gestion des remises Chèque / LCR (Sprint 4)
import { useState, useEffect, useRef } from 'react'
import { IcBuilding, IcEdit } from '../Icones'
import { supabase } from '../../lib/supabase'
import { useRemises } from '../../hooks/useRemises'
import type { RemiseSuccessData } from '../../hooks/useRemises'
import type { Remise, LigneFormRemise, TypeRemise } from '../../types/remise'
import type { InfoFacture } from '../../types/lettrage'
import { NumeroPiece } from '../NumeroPiece'

interface Props {
  ouvert: boolean
  onFermer: () => void
  onSuccess: (data?: RemiseSuccessData) => void
}

function fmt(n: number) {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

function BadgeType({ type }: { type: TypeRemise }) {
  return type === 'cheque'
    ? <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-800 text-white">CHQ</span>
    : <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-sky-200 text-sky-800 border border-sky-300">LCR</span>
}

interface RowFactureInfo { reste_du: number; code_client: string; nom_client: string | null; statut_paiement: string }

let _k = 200
function cle() { return String(++_k) }
function nouvelleLigne(): LigneFormRemise {
  return { _key: cle(), numero_facture: '', montant: '', info_facture: null, chargement: false }
}

export function ModalRemises({ ouvert, onFermer, onSuccess }: Props) {
  const { remises, chargement, charger, creer, modifier, supprimer } = useRemises(onSuccess)

  // Vue : 'liste' | 'formulaire'
  const [vue, setVue] = useState<'liste' | 'formulaire'>('liste')
  const [onglet, setOnglet] = useState<'attente' | 'encaisse'>('attente')
  const [remiseEnEdition, setRemiseEnEdition] = useState<Remise | null>(null)
  const [ouvertes, setOuvertes] = useState<Set<string>>(new Set())

  // État formulaire
  const [typeForm, setTypeForm] = useState<TypeRemise>('cheque')
  const [numeroForm, setNumeroForm] = useState('')
  const [montantLcrForm, setMontantLcrForm] = useState('')
  const [lignesForm, setLignesForm] = useState<LigneFormRemise[]>([nouvelleLigne()])
  const debounceRefs = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  useEffect(() => { if (ouvert) charger() }, [ouvert])

  useEffect(() => {
    if (!ouvert) { setVue('liste'); setOnglet('attente'); setRemiseEnEdition(null) }
  }, [ouvert])

  function ouvrirFormulaire(remise?: Remise) {
    if (remise) {
      // Edition : pré-remplir le formulaire
      setRemiseEnEdition(remise)
      setTypeForm(remise.type)
      setNumeroForm(remise.numero)
      setMontantLcrForm(remise.montant_total != null ? String(remise.montant_total) : '')
      const lignesInit = remise.lignes.length > 0
        ? remise.lignes.map(l => ({ _key: cle(), numero_facture: l.numero_facture, montant: String(l.montant), info_facture: null, chargement: false }))
        : [nouvelleLigne()]
      setLignesForm(lignesInit)
      // Déclencher le lookup pour afficher le nom client sans écraser le montant
      setTimeout(() => {
        lignesInit.forEach(l => { if (l.numero_facture.length >= 4) chercherFacture(l._key, l.numero_facture, true) })
      }, 50)
    } else {
      setRemiseEnEdition(null)
      setTypeForm('cheque')
      setNumeroForm('')
      setMontantLcrForm('')
      setLignesForm([nouvelleLigne()])
    }
    setVue('formulaire')
  }

  function retourListe() { setVue('liste'); setRemiseEnEdition(null) }

  function toggleOuverte(id: string) {
    setOuvertes(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }

  // Gestion lignes formulaire
  function modifierLigne(key: string, champ: Partial<LigneFormRemise>) {
    setLignesForm(prev => prev.map(l => l._key === key ? { ...l, ...champ } : l))
  }
  function supprimerLigne(key: string) {
    setLignesForm(prev => prev.length > 1 ? prev.filter(l => l._key !== key) : prev)
  }
  function ajouterLigne() { setLignesForm(prev => [...prev, nouvelleLigne()]) }

  // preserverMontant = true en mode édition : ne pas écraser le montant déjà saisi
  async function chercherFacture(key: string, numero: string, preserverMontant = false) {
    if (numero.length < 4) { modifierLigne(key, { info_facture: null, chargement: false }); return }
    modifierLigne(key, { chargement: true })
    const { data } = await supabase
      .from('v_factures_avec_reste_du')
      .select('reste_du, code_client, nom_client, statut_paiement')
      .eq('numero_piece', numero).maybeSingle()
    const row = data as unknown as RowFactureInfo | null
    if (row) {
      const resteDu = Math.max(0, row.reste_du)
      modifierLigne(key, {
        chargement: false,
        info_facture: row as InfoFacture,
        ...(preserverMontant ? {} : { montant: resteDu > 0 ? String(Math.round(resteDu * 100) / 100) : '' }),
      })
    } else {
      modifierLigne(key, { chargement: false, info_facture: null })
    }
  }

  function handleNumeroChange(key: string, value: string) {
    modifierLigne(key, { numero_facture: value, info_facture: null })
    clearTimeout(debounceRefs.current[key])
    debounceRefs.current[key] = setTimeout(() => chercherFacture(key, value), 400)
  }

  // Calculs totaux
  const somme = Math.round(lignesForm.reduce((s, l) => s + (parseFloat(l.montant) || 0), 0) * 100) / 100
  const montantLcr = parseFloat(montantLcrForm.replace(',', '.')) || 0
  const ecartLcr = Math.abs(somme - montantLcr)
  const lcrValide = typeForm !== 'lcr' || ecartLcr <= 0.05

  // info_facture requise : garantit que code_client est toujours renseigné avant l'insert
  const lignesValides = lignesForm.every(l => {
    const m = parseFloat(l.montant)
    return !!l.numero_facture.trim() && !!l.info_facture && !l.chargement && !!l.montant && !isNaN(m) && m > 0
  })
  const peutValider = !!numeroForm.trim() && lignesValides && (typeForm !== 'lcr' || (montantLcr > 0 && lcrValide))

  async function handleValider() {
    if (!peutValider) return
    if (remiseEnEdition) {
      await modifier(remiseEnEdition.id, typeForm, numeroForm, lignesForm, typeForm === 'lcr' ? montantLcr : null)
    } else {
      await creer(typeForm, numeroForm, lignesForm, typeForm === 'lcr' ? montantLcr : null)
    }
    retourListe()
  }

  if (!ouvert) return null

  const enAttente = remises.filter(r => r.statut === 'en_attente')
  const encaisses = remises.filter(r => r.statut === 'encaisse')

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onFermer() }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[88vh] flex flex-col">

        {/* En-tête */}
        <div className="flex items-start justify-between px-7 py-5 border-b border-gray-100">
          <div>
            <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <IcBuilding size={15} className="flex-shrink-0" /> Remises Chèque / LCR
              {enAttente.length > 0 && (
                <span className="text-[10px] font-semibold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                  {enAttente.length} en attente
                </span>
              )}
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">Pré-lettrage des factures avant encaissement</p>
          </div>
          <button onClick={onFermer}
            className="w-7 h-7 rounded-full border border-gray-200 bg-gray-50 hover:bg-red-50 hover:border-red-200 hover:text-red-500 text-gray-400 text-sm flex items-center justify-center transition-colors">
            ✕
          </button>
        </div>

        {/* ─── VUE LISTE ─── */}
        {vue === 'liste' && (
          <>
            {/* Onglets */}
            <div className="flex border-b border-gray-100 px-7">
              {(['attente', 'encaisse'] as const).map(t => (
                <button key={t} onClick={() => setOnglet(t)}
                  className={`py-3 px-4 text-sm font-semibold border-b-2 transition-colors ${onglet === t ? 'border-ockham-teal text-ockham-teal' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
                  {t === 'attente' ? `À encaisser · ${enAttente.length}` : `Encaissé · ${encaisses.length}`}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto px-7 py-5">
              {onglet === 'attente' && (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-xs text-gray-400">{enAttente.length} remise(s) en attente d'encaissement</p>
                    <button onClick={() => ouvrirFormulaire()}
                      className="flex items-center gap-1.5 bg-ockham-teal hover:bg-ockham-teal-dark text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors">
                      + Saisir une remise
                    </button>
                  </div>

                  {enAttente.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                      <div className="mb-3 opacity-20 text-gray-400"><IcBuilding size={40} /></div>
                      <p className="text-sm font-medium">Aucune remise en attente</p>
                      <p className="text-xs mt-1">Cliquez sur "Saisir une remise" pour créer votre première remise.</p>
                    </div>
                  )}

                  <div className="space-y-2">
                    {enAttente.map(remise => {
                      const total = remise.type === 'cheque'
                        ? remise.lignes.reduce((s, l) => s + l.montant, 0)
                        : (remise.montant_total ?? 0)
                      const isOpen = ouvertes.has(remise.id)
                      return (
                        <div key={remise.id} className="border border-gray-200 rounded-xl overflow-hidden bg-gray-50">
                          <div className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-100 transition-colors"
                            onClick={() => toggleOuverte(remise.id)}>
                            <div className="flex items-center gap-3">
                              <BadgeType type={remise.type} />
                              <span className="font-mono text-sm font-semibold text-gray-800">{remise.numero}</span>
                              <span className="text-xs text-gray-400">{remise.lignes.length} facture{remise.lignes.length > 1 ? 's' : ''}</span>
                            </div>
                            <div className="flex items-center gap-4">
                              <span className="font-mono font-bold text-sm text-gray-800 tabular-nums">{fmt(total)}</span>
                              <span className="text-gray-300 text-xs">{isOpen ? '▲' : '▶'}</span>
                            </div>
                          </div>
                          {isOpen && (
                            <div className="border-t border-gray-200 bg-white">
                              <div className="grid grid-cols-[130px_1fr_100px] gap-2 px-4 py-2 bg-gray-50 border-b border-gray-100">
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">N° Facture</span>
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Client</span>
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide text-right">Montant</span>
                              </div>
                              {remise.lignes.map(l => (
                                <div key={l.id} className="grid grid-cols-[130px_1fr_100px] gap-2 px-4 py-2 border-b border-gray-50 last:border-0">
                                  <NumeroPiece numero={l.numero_facture} className="font-mono text-xs font-semibold text-ockham-teal" />
                                  <span className="text-xs text-gray-500 truncate">{l.code_client}</span>
                                  <span className="font-mono text-xs text-right tabular-nums">{fmt(l.montant)}</span>
                                </div>
                              ))}
                              <div className="flex justify-end gap-2 px-4 py-3">
                                <button onClick={() => ouvrirFormulaire(remise)}
                                  className="text-xs font-semibold text-ockham-teal border border-ockham-teal/40 hover:bg-ockham-teal-muted px-3 py-1.5 rounded-lg transition-colors">
                                  <IcEdit size={11} className="inline-block mr-1" /> Modifier
                                </button>
                                <button onClick={() => supprimer(remise.id)}
                                  disabled={chargement}
                                  className="text-xs font-semibold text-red-500 border border-red-200 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40">
                                  ✕ Annuler
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </>
              )}

              {onglet === 'encaisse' && (
                <div className="space-y-2">
                  {encaisses.length === 0 && (
                    <div className="text-center py-12 text-gray-400 text-sm">Aucune remise encaissée.</div>
                  )}
                  {encaisses.map(remise => {
                    const total = remise.montant_total ?? remise.lignes.reduce((s, l) => s + l.montant, 0)
                    const isOpen = ouvertes.has(remise.id)
                    return (
                      <div key={remise.id} className="border border-gray-200 rounded-xl overflow-hidden">
                        <div className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
                          onClick={() => toggleOuverte(remise.id)}>
                          <div className="flex items-center gap-3">
                            <BadgeType type={remise.type} />
                            <span className="font-mono text-sm font-semibold text-gray-800">{remise.numero}</span>
                            {remise.date_encaissement && (
                              <span className="text-xs text-emerald-600 font-medium">
                                ✓ {new Date(remise.date_encaissement).toLocaleDateString('fr-FR')}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-4">
                            <span className="font-mono font-bold text-sm text-gray-600 tabular-nums">{fmt(total)}</span>
                            <span className="text-gray-300 text-xs">{isOpen ? '▲' : '▶'}</span>
                          </div>
                        </div>
                        {isOpen && (
                          <div className="border-t border-gray-100 bg-white">
                            {remise.lignes.map(l => (
                              <div key={l.id} className="grid grid-cols-[130px_1fr_100px] gap-2 px-4 py-2 border-b border-gray-50 last:border-0">
                                <NumeroPiece numero={l.numero_facture} className="font-mono text-xs font-semibold text-ockham-teal" />
                                <span className="text-xs text-gray-500">{l.code_client}</span>
                                <span className="font-mono text-xs text-right tabular-nums">{fmt(l.montant)}</span>
                              </div>
                            ))}
                            <div className="flex justify-end px-4 py-3">
                              <span className="text-[10px] text-gray-400 italic">Remise encaissée — non modifiable</span>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="px-7 py-4 border-t border-gray-100 flex justify-end">
              <button onClick={onFermer} className="text-sm font-medium text-gray-500 border border-gray-200 hover:border-gray-300 px-5 py-2.5 rounded-lg transition-colors">
                Fermer
              </button>
            </div>
          </>
        )}

        {/* ─── VUE FORMULAIRE ─── */}
        {vue === 'formulaire' && (
          <>
            <div className="flex-1 overflow-y-auto px-7 py-5">
              <div className="flex items-center gap-3 mb-5">
                <button onClick={retourListe} className="text-sm text-gray-400 hover:text-gray-600 flex items-center gap-1.5 transition-colors">
                  ← Retour
                </button>
                <span className="text-sm font-bold text-gray-800">
                  {remiseEnEdition ? `Modifier ${remiseEnEdition.numero}` : 'Nouvelle remise'}
                </span>
              </div>

              {/* Type + N° remise */}
              <div className="grid grid-cols-2 gap-4 mb-5">
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Type</p>
                  <div className="flex bg-gray-100 rounded-lg p-1 gap-1">
                    {(['cheque', 'lcr'] as const).map(t => (
                      <button key={t} onClick={() => setTypeForm(t)}
                        className={`flex-1 py-2 rounded-md text-xs font-bold transition-all ${typeForm === t ? 'bg-white shadow text-gray-800' : 'text-gray-400 hover:text-gray-600'}`}>
                        {t === 'cheque' ? '🟡 Chèque' : '🔵 LCR'}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">N° de remise</p>
                  <input type="text" value={numeroForm} onChange={e => setNumeroForm(e.target.value)}
                    placeholder="Ex : REM-2026-005"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-ockham-teal" />
                </div>
              </div>

              {/* Montant LCR uniquement */}
              {typeForm === 'lcr' && (
                <div className="mb-5">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Montant total LCR</p>
                  <input type="text" value={montantLcrForm} onChange={e => setMontantLcrForm(e.target.value)}
                    placeholder="Ex : 1 125,50"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono text-right outline-none focus:border-ockham-teal" />
                  <p className="text-[10px] text-gray-400 mt-1">Montant du titre LCR — contrôlé contre la somme des factures (tolérance ±5 ct)</p>
                </div>
              )}

              {/* Lignes factures */}
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Factures à rattacher</p>
              <div className="border border-gray-200 rounded-xl overflow-hidden mb-3">
                <div className="grid grid-cols-[1fr_90px_24px] gap-2 px-4 py-2 bg-gray-50 border-b border-gray-200">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">N° Facture</span>
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide text-right">Montant</span>
                  <span />
                </div>
                {lignesForm.map(ligne => (
                  <div key={ligne._key} className="border-b border-gray-100 last:border-0">
                    <div className="grid grid-cols-[1fr_90px_24px] gap-2 px-4 py-2 items-center">
                      <div className="relative">
                        <input type="text" value={ligne.numero_facture} onChange={e => handleNumeroChange(ligne._key, e.target.value)}
                          placeholder="N° facture…"
                          className="w-full border border-gray-200 rounded-md px-2.5 py-1.5 text-xs font-mono outline-none focus:border-ockham-teal pr-5" />
                        {ligne.chargement && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-ockham-teal animate-pulse">⟳</span>}
                      </div>
                      <input type="text" value={ligne.montant} onChange={e => modifierLigne(ligne._key, { montant: e.target.value })}
                        placeholder="0,00"
                        className="border border-gray-200 rounded-md px-2 py-1.5 text-xs text-right font-mono outline-none focus:border-ockham-teal" />
                      <button onClick={() => supprimerLigne(ligne._key)}
                        className="w-6 h-6 rounded-full border border-red-200 bg-red-50 text-red-400 hover:bg-red-100 text-sm flex items-center justify-center transition-colors">
                        ×
                      </button>
                    </div>
                    {ligne.info_facture && (
                      <div className="px-4 pb-2 text-[10px] text-emerald-600 font-medium -mt-1">
                        ✓ {ligne.info_facture.nom_client ?? ligne.info_facture.code_client} · reste dû : {fmt(ligne.info_facture.reste_du)}
                      </div>
                    )}
                    {!ligne.info_facture && !ligne.chargement && ligne.numero_facture.length >= 4 && (
                      <div className="px-4 pb-2 text-[10px] text-red-400 -mt-1">Facture introuvable</div>
                    )}
                  </div>
                ))}
              </div>
              <button onClick={ajouterLigne}
                className="flex items-center gap-1.5 w-full border border-dashed border-gray-200 hover:border-ockham-teal/40 hover:text-ockham-teal text-gray-400 text-xs font-medium py-2 rounded-lg transition-all mb-4">
                <span className="mx-auto">+ Ajouter une facture</span>
              </button>

              {/* Totaux */}
              <div className={`rounded-lg border px-4 py-3 flex items-center justify-between text-sm ${
                typeForm === 'lcr' && montantLcr > 0 && ecartLcr > 0.05 ? 'bg-red-50 border-red-200' :
                typeForm === 'lcr' && montantLcr > 0 && ecartLcr > 0.005 ? 'bg-amber-50 border-amber-200' :
                'bg-gray-50 border-gray-200'
              }`}>
                <div>
                  <p className="text-xs text-gray-500">
                    {typeForm === 'cheque' ? 'Total remise (calculé)' : 'Somme factures saisies'}
                  </p>
                  {typeForm === 'lcr' && montantLcr > 0 && ecartLcr > 0.005 && ecartLcr <= 0.05 && (
                    <p className="text-[10px] text-amber-600 mt-0.5">⚠ Écart de {fmt(ecartLcr)} — tolérance ±5 ct acceptée</p>
                  )}
                  {typeForm === 'lcr' && montantLcr > 0 && ecartLcr > 0.05 && (
                    <p className="text-[10px] text-red-500 mt-0.5">Écart de {fmt(ecartLcr)} — dépasse la tolérance de ±5 ct</p>
                  )}
                </div>
                <span className={`font-bold tabular-nums ${
                  typeForm === 'lcr' && montantLcr > 0 && ecartLcr > 0.05 ? 'text-red-600' :
                  typeForm === 'lcr' && montantLcr > 0 && ecartLcr > 0.005 ? 'text-amber-600' :
                  'text-gray-800'
                }`}>{fmt(somme)}</span>
              </div>
            </div>

            <div className="flex gap-3 px-7 py-5 border-t border-gray-100">
              <button onClick={retourListe} disabled={chargement}
                className="flex-1 text-sm font-medium text-gray-500 border border-gray-200 hover:border-gray-300 py-2.5 rounded-lg transition-colors disabled:opacity-40">
                Annuler
              </button>
              <button onClick={handleValider} disabled={!peutValider || chargement}
                className="flex-[2] flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold py-2.5 rounded-lg transition-colors">
                {chargement ? <><span className="animate-spin text-xs">⏳</span> En cours…</> : remiseEnEdition ? '✓ Enregistrer les modifications' : '✓ Créer la remise'}
              </button>
            </div>
          </>
        )}

      </div>
    </div>
  )
}
