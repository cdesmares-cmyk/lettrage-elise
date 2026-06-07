// Modale d'affectation d'une ligne Débit à un remboursement déclaré
import toast from 'react-hot-toast'
import type { RemboursementEnAttente } from '../../hooks/useRemboursements'

interface Props {
  ouvert: boolean
  ligneBancaire: { id_operation: string; libelle: string; debit: number | null; credit: number | null } | null
  enAttente: RemboursementEnAttente[]
  onAffecter: (remboursementId: string, idLigneBancaire: string) => Promise<void>
  onFermer: () => void
}

const TOLERANCE = 0.01

function fmt(n: number) {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR')
}

export function ModalAffectationRemboursement({ ouvert, ligneBancaire, enAttente, onAffecter, onFermer }: Props) {
  if (!ouvert || !ligneBancaire) return null

  // Montant sortant : colonne debit si renseignée, sinon valeur absolue du credit négatif
  const montantDebit = (ligneBancaire.debit ?? 0) > 0
    ? (ligneBancaire.debit ?? 0)
    : Math.abs(ligneBancaire.credit ?? 0)

  async function handleAffecter(rembId: string) {
    try {
      await onAffecter(rembId, ligneBancaire!.id_operation)
      toast.success('Remboursement affecté — présent dans les exports')
      onFermer()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur lors de l\'affectation')
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onFermer() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        {/* En-tête */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h3 className="text-sm font-bold text-gray-900">Affecter un remboursement</h3>
            <p className="text-xs text-gray-500 mt-0.5 max-w-xs truncate">
              Débit : <span className="font-medium text-gray-700">{ligneBancaire.libelle}</span>
              {montantDebit > 0 && (
                <span className="text-gray-900 font-semibold ml-2">−{fmt(montantDebit)}</span>
              )}
            </p>
          </div>
          <button
            onClick={onFermer}
            className="w-7 h-7 rounded-full border border-gray-200 bg-gray-50 hover:bg-gray-100 hover:border-gray-300 text-gray-400 text-sm flex items-center justify-center transition-colors"
          >✕</button>
        </div>

        {/* Contenu */}
        <div className="px-6 py-4 space-y-3 max-h-[60vh] overflow-y-auto">
          {enAttente.length === 0 ? (
            <div className="text-center py-8 space-y-2">
              <p className="text-sm text-gray-500">Aucun remboursement en attente d'affectation.</p>
              <p className="text-xs text-gray-400">
                Déclarez d'abord le remboursement depuis le module{' '}
                <strong>Correction → Remboursement</strong>.
              </p>
            </div>
          ) : (
            enAttente.map(r => {
              const total = r.lignes.reduce((s, l) => s + l.montant, 0)
              const match = Math.abs(montantDebit - total) <= TOLERANCE

              return (
                <div
                  key={r.id}
                  className={`border rounded-xl p-4 space-y-3 ${match ? 'border-gray-200' : 'border-amber-200 bg-amber-50/40'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1 flex-1">
                      <p className="text-[10px] text-gray-400 font-medium">Déclaré le {fmtDate(r.created_at)}</p>
                      {r.lignes.map(l => (
                        <div key={l.id} className="flex items-center gap-2 text-xs">
                          <span className="font-mono text-gray-700">{l.numero_facture}</span>
                          <span className="text-gray-300">·</span>
                          <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded font-mono">{l.code_client}</span>
                          <span className="text-gray-300">·</span>
                          <span className="font-semibold text-gray-700">−{fmt(l.montant)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="text-right flex-shrink-0 space-y-1">
                      <p className="text-sm font-bold text-gray-900">−{fmt(total)}</p>
                      {match ? (
                        <span className="inline-block text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                          ✓ Montant concordant
                        </span>
                      ) : (
                        <span className="inline-block text-[10px] font-semibold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded">
                          Écart {fmt(Math.abs(montantDebit - total))}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => handleAffecter(r.id)}
                    disabled={!match}
                    className="w-full py-1.5 text-xs font-semibold text-white bg-ockham-teal hover:bg-ockham-teal/90 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {match ? 'Affecter ce remboursement à ce débit' : 'Montant non concordant — affectation impossible'}
                  </button>
                </div>
              )
            })
          )}
        </div>

        {/* Pied */}
        <div className="px-6 py-3 border-t border-gray-100">
          <button
            onClick={onFermer}
            className="w-full text-xs font-medium text-gray-500 hover:text-gray-700 py-1.5 transition-colors"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  )
}
