// Modal "vue aérienne" des factures d'un client depuis le tableau de bord
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabase'
import { useAppData } from '../../contexts/AppDataContext'
import { LignesFactures } from '../compte-client/LignesFactures'
import type { StatutFacture, FactureDetail } from '../../types/client'

interface Props {
  code: string
  nom: string
  onClose: () => void
}

export function ModalClientTdb({ code, nom, onClose }: Props) {
  const navigate = useNavigate()
  const { facturesActives, mettreAJourStatutLocal } = useAppData()
  const factures = facturesActives.filter(f => f.code_client === code && !f.numero_piece.startsWith('411_'))

  useEffect(() => {
    function handleKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  async function handleStatutChange(numero: string, statut: StatutFacture | null) {
    const { error } = await supabase.from('factures').update({ statut_facture: statut } as never).eq('numero_piece', numero)
    if (error) { toast.error('Erreur mise à jour statut'); return }
    mettreAJourStatutLocal(numero, statut)
  }

  function handleHistorique(_fac: FactureDetail) {
    toast('Historique complet disponible dans le module Compte Client.')
  }

  const nbImpayees = factures.filter(f => f.reste_du > 0.005).length
  const totalDu = factures.filter(f => f.reste_du > 0.005).reduce((s, f) => s + f.reste_du, 0)
  const _fmtEuro = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-5xl max-h-[82vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* En-tête */}
        <div className="flex items-center justify-between px-6 py-4 flex-shrink-0 bg-ockham-navy">
          <div>
            <h2 className="text-base font-bold text-white">{nom}</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              <button
                onClick={() => { onClose(); navigate(`/compte-client?client=${code}`) }}
                className="font-mono text-ockham-teal hover:underline cursor-pointer mr-2"
              >
                {code}
              </button>
              {nbImpayees} facture{nbImpayees > 1 ? 's' : ''} impayée{nbImpayees > 1 ? 's' : ''}
              {' · '}
              <span className="font-semibold text-red-400">
                {_fmtEuro.format(totalDu)} €
              </span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full border border-white/20 bg-white/10 hover:bg-white/20 text-slate-300 text-sm flex items-center justify-center transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Corps */}
        <div className="overflow-auto flex-1 bg-white dark:bg-slate-800">
          {factures.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-sm text-gray-400 dark:text-gray-500">
              Aucune facture active trouvée pour ce client.
            </div>
          ) : (
            <LignesFactures
              factures={factures}
              chargement={false}
              onStatutChange={handleStatutChange}
              onHistorique={handleHistorique}
              compact
            />
          )}
        </div>

        {/* Pied */}
        <div className="px-6 py-3 border-t border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-900 flex items-center justify-between">
          <p className="text-[10px] text-gray-400 dark:text-gray-500">
            Données issues du cache — historique complet dans le module Compte Client
          </p>
          <button
            onClick={onClose}
            className="text-xs font-medium text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-slate-600 px-3 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  )
}
