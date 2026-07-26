// Modal de lettrage automatique en bulk — confiance 3/3 uniquement
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import toast from 'react-hot-toast'
import { IcFlash, IcX } from '../Icones'
import type { DistribAuto } from '../../hooks/useDetectionListe'

export interface LettrageAutoResult {
  lettragesParLigne: Array<{
    idLigneBancaire: string
    montantTotal: number
    numerosLettres: { numeroPiece: string; montant: number }[]
  }>
  nbIgnores: number
}

interface Props {
  ouvert: boolean
  distributions: Map<string, DistribAuto>
  onFermer: () => void
  onSuccess: (result: LettrageAutoResult) => void
}

function fmt(n: number) {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
}

export function ModalLettrageAuto({ ouvert, distributions, onFermer, onSuccess }: Props) {
  const { utilisateur } = useAuth()
  const [selection, setSelection] = useState<Set<string>>(new Set())
  const [enCours, setEnCours] = useState(false)
  const [succes, setSucces] = useState<{ nbValides: number; nbIgnores: number } | null>(null)

  useEffect(() => {
    if (ouvert) {
      setSelection(new Set(distributions.keys()))
      setEnCours(false)
      setSucces(null)
    }
  }, [ouvert, distributions])

  if (!ouvert) return null

  const entries = [...distributions.entries()]
  const nbSelectionnes = [...selection].filter(id => distributions.has(id)).length
  const montantTotal = [...selection]
    .filter(id => distributions.has(id))
    .reduce((sum, id) => {
      const d = distributions.get(id)!
      return sum + d.factures.reduce((s, f) => s + f.reste_du, 0)
    }, 0)

  function toggleRow(id: string) {
    setSelection(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function valider() {
    const ids = [...selection].filter(id => distributions.has(id))
    if (!ids.length) return
    setEnCours(true)
    try {
      const buildRows = (id: string) => {
        const { factures, ligne } = distributions.get(id)!
        return factures.map(f => ({
          id_ligne_bancaire: ligne.id_operation,
          numero_facture: f.numero_piece,
          code_client: f.code_client,
          montant: Math.round(f.reste_du * 100) / 100,
          date_lettrage: ligne.date_operation,
          mode: 'manuel',
          commentaire: null,
          cree_par: utilisateur?.id ?? null,
          operateur: utilisateur?.email?.split('@')[0] ?? null,
        }))
      }

      // Tentative bulk unique
      const allRows = ids.flatMap(buildRows)
      const { error } = await supabase.from('lettrages').insert(allRows as never)

      let validIds = ids
      let nbIgnores = 0

      if (error) {
        if (error.code === '23505') {
          // Doublon détecté — retry ligne par ligne pour isoler
          validIds = []
          for (const id of ids) {
            const { error: e } = await supabase.from('lettrages').insert(buildRows(id) as never)
            if (!e) validIds.push(id)
            else nbIgnores++
          }
        } else {
          throw error
        }
      }

      // Enrichissement dictionnaire SEPA (même logique que le manuel)
      for (const id of validIds) {
        const { factures, ligne } = distributions.get(id)!
        const codesUniques = [...new Set(factures.map(f => f.code_client))]
        if (codesUniques.length === 1 && ligne.libelle) {
          // @ts-expect-error fn_upsert_libelle_sepa absente du schéma généré
          supabase.rpc('fn_upsert_libelle_sepa', { p_libelle: ligne.libelle, p_code_client: codesUniques[0] }).then()
        }
      }

      const lettragesParLigne = validIds.map(id => {
        const { factures, ligne } = distributions.get(id)!
        return {
          idLigneBancaire: ligne.id_operation,
          montantTotal: Math.round(factures.reduce((s, f) => s + f.reste_du, 0) * 100) / 100,
          numerosLettres: factures.map(f => ({
            numeroPiece: f.numero_piece,
            montant: Math.round(f.reste_du * 100) / 100,
          })),
        }
      })

      const result: LettrageAutoResult = { lettragesParLigne, nbIgnores }
      setSucces({ nbValides: validIds.length, nbIgnores })
      onSuccess(result)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur lors du lettrage automatique.')
    } finally {
      setEnCours(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget && !enCours) onFermer() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">

        {/* En-tête */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100">
          <div>
            <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-teal-50 border border-teal-100 text-teal-600">
                <IcFlash size={12} />
              </span>
              Lettrage automatique
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              <strong>{distributions.size} lignes</strong> détectées confiance 3/3 — décochez pour exclure avant de valider.
            </p>
          </div>
          <button
            onClick={onFermer}
            disabled={enCours}
            className="w-7 h-7 rounded-full border border-gray-200 bg-gray-50 hover:bg-red-50 hover:border-red-200 hover:text-red-500 text-gray-400 flex items-center justify-center transition-colors disabled:opacity-40"
          >
            <IcX size={13} />
          </button>
        </div>

        {succes ? (
          /* État succès */
          <div className="flex flex-col items-center justify-center py-14 px-8 text-center gap-3">
            <div className="w-12 h-12 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-500 text-2xl">✓</div>
            <div>
              <p className="text-base font-bold text-gray-900">
                {succes.nbValides} lettrage{succes.nbValides > 1 ? 's' : ''} validé{succes.nbValides > 1 ? 's' : ''}
              </p>
              {succes.nbIgnores > 0 && (
                <p className="text-xs text-gray-500 mt-1">
                  {succes.nbIgnores} ligne{succes.nbIgnores > 1 ? 's' : ''} ignorée{succes.nbIgnores > 1 ? 's' : ''} — déjà traitées
                </p>
              )}
            </div>
            <button
              onClick={onFermer}
              className="mt-2 px-6 py-2 text-sm font-semibold text-white bg-ockham-teal hover:bg-ockham-teal/90 rounded-xl transition-colors"
            >
              Fermer
            </button>
          </div>
        ) : (
          <>
            {/* Barre sélect/désélect */}
            <div className="flex items-center justify-between px-6 py-2 bg-gray-50 border-b border-gray-100 text-xs text-gray-500">
              <span>{nbSelectionnes} ligne{nbSelectionnes > 1 ? 's' : ''} sélectionnée{nbSelectionnes > 1 ? 's' : ''}</span>
              <div className="flex gap-3">
                <button onClick={() => setSelection(new Set(distributions.keys()))} className="text-ockham-teal font-semibold hover:underline">Tout sélectionner</button>
                <button onClick={() => setSelection(new Set())} className="text-ockham-teal font-semibold hover:underline">Tout décocher</button>
              </div>
            </div>

            {/* Liste */}
            <div className="overflow-y-auto flex-1">
              <div className="grid grid-cols-[28px_56px_1fr_150px_88px] px-6 py-2 border-b border-gray-100 bg-gray-50">
                <span /><span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Date</span>
                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Libellé</span>
                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide text-right">Facture(s)</span>
                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide text-right">Montant</span>
              </div>
              {entries.map(([id, { factures, ligne }]) => {
                const checked = selection.has(id)
                const montantLigne = Math.round(factures.reduce((s, f) => s + f.reste_du, 0) * 100) / 100
                return (
                  <div
                    key={id}
                    onClick={() => toggleRow(id)}
                    className={`grid grid-cols-[28px_56px_1fr_150px_88px] items-center px-6 py-3 border-b border-gray-50 cursor-pointer transition-all hover:bg-gray-50 ${checked ? '' : 'opacity-35'}`}
                  >
                    <input type="checkbox" checked={checked} onChange={() => toggleRow(id)} onClick={e => e.stopPropagation()} className="w-4 h-4 accent-ockham-teal" />
                    <span className="text-[11px] text-gray-400 font-mono">{formatDate(ligne.date_operation)}</span>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-gray-800 truncate">{ligne.libelle}</p>
                      {ligne.infos_complementaires && (
                        <p className="text-[10px] text-gray-400 truncate">{ligne.infos_complementaires}</p>
                      )}
                    </div>
                    <div className="flex flex-col gap-0.5 items-end">
                      {factures.map(f => (
                        <span key={f.numero_piece} className="text-[10px] font-semibold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded font-mono whitespace-nowrap">
                          {f.numero_piece}
                        </span>
                      ))}
                    </div>
                    <div className="text-right text-xs font-bold font-mono text-gray-800">{fmt(montantLigne)} €</div>
                  </div>
                )
              })}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
              <div>
                <p className="text-sm font-bold text-gray-900">
                  <span className="text-ockham-teal">{nbSelectionnes}</span> ligne{nbSelectionnes > 1 ? 's' : ''} sélectionnée{nbSelectionnes > 1 ? 's' : ''}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Total : <span className="font-semibold text-gray-700">{fmt(montantTotal)} €</span>
                </p>
              </div>
              <div className="flex gap-2">
                <button onClick={onFermer} disabled={enCours} className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-40">
                  Annuler
                </button>
                <button
                  onClick={valider}
                  disabled={nbSelectionnes === 0 || enCours}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-ockham-teal hover:bg-ockham-teal/90 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {enCours ? '⏳ Validation…' : <><IcFlash size={11} /> Valider {nbSelectionnes} lettrage{nbSelectionnes > 1 ? 's' : ''}</>}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
