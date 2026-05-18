// Volet latéral — commentaire + statut d'une facture
import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import type { FactureDetail, StatutFacture, CommentaireFacture } from '../../types/client'

const STATUTS: { val: StatutFacture; label: string; cls: string }[] = [
  { val: 'litige',      label: '⚠ Litige',       cls: 'bg-red-100 text-red-800 border-red-300' },
  { val: 'provisionne', label: '📦 Provisionné',  cls: 'bg-orange-100 text-orange-800 border-orange-300' },
]

const _fmt = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

interface Props {
  facture: FactureDetail | null
  commentaire: CommentaireFacture | null
  onFermer: () => void
  onSauvegarder: (data: { numero_piece: string; contact: string; date_contact: string; commentaire: string }) => Promise<boolean>
  onStatutChange: (numero: string, statut: StatutFacture | null) => void
}

export function PanneauCommentaireFacture({ facture, commentaire, onFermer, onSauvegarder, onStatutChange }: Props) {
  const { utilisateur } = useAuth()
  const operateurCourant = utilisateur?.email?.split('@')[0] ?? ''
  const [statut, setStatut] = useState<StatutFacture | null>(null)
  const [contact, setContact] = useState('')
  const [dateContact, setDateContact] = useState('')
  const [texte, setTexte] = useState('')
  const [enregistrement, setEnregistrement] = useState(false)

  useEffect(() => {
    if (facture) {
      setStatut(facture.statut_facture)
      setContact(commentaire?.contact ?? '')
      setDateContact(commentaire?.date_contact ?? '')
      setTexte(commentaire?.commentaire ?? '')
    }
  }, [facture?.numero_piece, commentaire])

  if (!facture) return null

  async function handleSauvegarder() {
    if (!facture) return
    setEnregistrement(true)
    const ok = await onSauvegarder({
      numero_piece: facture.numero_piece,
      contact,
      date_contact: dateContact,
      commentaire: texte,
    })
    if (ok && statut !== facture.statut_facture) {
      onStatutChange(facture.numero_piece, statut)
    }
    setEnregistrement(false)
    if (ok) onFermer()
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40" onClick={onFermer} />
      <div className="fixed top-0 right-0 bottom-0 w-[380px] bg-white shadow-2xl z-50 flex flex-col">

        {/* En-tête */}
        <div className="px-5 py-4 bg-ockham-navy flex items-start justify-between">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Commentaire facture</p>
            <p className="text-sm font-bold text-white font-mono">{facture.numero_piece}</p>
            <p className="text-xs text-slate-400 mt-0.5">
              {facture.nom_client ?? facture.code_client} · {_fmt.format(facture.reste_du)} € restant dû
            </p>
          </div>
          <button
            onClick={onFermer}
            className="w-7 h-7 rounded-full border border-white/20 bg-white/10 hover:bg-white/20 text-slate-300 text-sm flex items-center justify-center transition-colors"
          >✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">

          {/* Statut */}
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Statut de la facture</label>
            <div className="space-y-1.5">
              {STATUTS.map(s => (
                <button
                  key={s.val}
                  onClick={() => setStatut(statut === s.val ? null : s.val)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-semibold transition-all ${
                    statut === s.val ? s.cls : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  {s.label}
                  {statut === s.val && <span className="ml-auto">✓</span>}
                </button>
              ))}
              {statut && (
                <button onClick={() => setStatut(null)} className="w-full text-xs text-gray-400 hover:text-gray-600 py-1 transition-colors">
                  ✕ Effacer le statut
                </button>
              )}
            </div>
          </div>

          {/* Contact */}
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Contact</label>
            <input
              type="text"
              value={contact}
              onChange={e => setContact(e.target.value)}
              placeholder="Nom, email, téléphone…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 outline-none focus:border-ockham-teal transition-colors"
            />
          </div>

          {/* Date */}
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Date du contact</label>
            <input
              type="date"
              value={dateContact}
              onChange={e => setDateContact(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 outline-none focus:border-ockham-teal transition-colors"
            />
          </div>

          {/* Commentaire */}
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Commentaire</label>
            <textarea
              value={texte}
              onChange={e => setTexte(e.target.value)}
              placeholder="Notes sur le blocage, informations de suivi…"
              rows={5}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 outline-none focus:border-ockham-teal transition-colors resize-none"
            />
          </div>

          {/* Opérateur */}
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Opérateur</label>
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">
              <span className="text-sm text-gray-700 font-medium flex-1">{commentaire?.operateur ?? operateurCourant}</span>
              {commentaire?.updated_at && (
                <span className="text-[10px] text-gray-400">
                  {new Date(commentaire.updated_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-5 py-4 border-t border-gray-100">
          <button
            onClick={onFermer}
            disabled={enregistrement}
            className="flex-1 text-sm font-medium text-gray-500 border border-gray-200 py-2.5 rounded-lg hover:border-gray-300 transition-colors disabled:opacity-40"
          >
            Annuler
          </button>
          <button
            onClick={handleSauvegarder}
            disabled={enregistrement}
            className="flex-[2] flex items-center justify-center gap-2 bg-ockham-teal hover:bg-ockham-teal-dark disabled:opacity-40 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors"
          >
            {enregistrement ? '…' : '✓ Enregistrer'}
          </button>
        </div>
      </div>
    </>
  )
}
