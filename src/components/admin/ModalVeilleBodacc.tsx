// Modal — Synchronisation manuelle de la veille BODACC
// L'Edge Function gère tout : alertes_risque + statut_juridique
import { useState } from 'react'
import { supabase } from '../../lib/supabase'

interface Props {
  onClose: () => void
}

type Etat = 'idle' | 'sync' | 'ok' | 'erreur'

interface SyncResult {
  clients_traités: number
  alertes_insérées: number
  statuts_mis_a_jour: number
  erreurs: string[]
}

export function ModalVeilleBodacc({ onClose }: Props) {
  const [etat, setEtat]     = useState<Etat>('idle')
  const [résumé, setRésumé] = useState<SyncResult | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)

  async function lancer() {
    setEtat('sync')
    setErreur(null)
    setRésumé(null)

    const { data, error } = await supabase.functions.invoke('bodacc-sync')

    if (error || !data) {
      setErreur(error?.message ?? 'Erreur lors de la synchronisation BODACC.')
      setEtat('erreur')
      return
    }

    setRésumé(data as SyncResult)
    setEtat('ok')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 flex flex-col gap-5">

        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Veille BODACC</h2>
            <p className="text-xs text-gray-500 mt-0.5">Synchronisation manuelle des procédures collectives</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
        </div>

        {etat === 'idle' && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              Lance un scan BODACC sur les 200 premiers clients avec SIRET et met à jour automatiquement leur statut juridique.
            </p>
            <p className="text-xs text-gray-400">Le cron quotidien à 6h tourne en arrière-plan sans action de ta part.</p>
          </div>
        )}

        {etat === 'sync' && (
          <div className="flex items-center gap-3 py-2">
            <div className="w-4 h-4 border-2 border-ockham-teal border-t-transparent rounded-full animate-spin flex-shrink-0" />
            <span className="text-sm text-gray-600">Interrogation de l'API BODACC…</span>
          </div>
        )}

        {etat === 'ok' && résumé && (
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 space-y-1.5">
            <p className="text-sm font-semibold text-emerald-800">Synchronisation terminée</p>
            <ul className="text-xs text-emerald-700 space-y-0.5">
              <li>Clients scannés : <span className="font-medium">{résumé.clients_traités}</span></li>
              <li>Alertes insérées : <span className="font-medium">{résumé.alertes_insérées}</span></li>
              <li>Statuts mis à jour : <span className="font-medium">{résumé.statuts_mis_a_jour}</span></li>
            </ul>
            {résumé.erreurs?.length > 0 && (
              <p className="text-xs text-amber-600 mt-1">{résumé.erreurs.length} erreur(s) — voir les logs Supabase</p>
            )}
          </div>
        )}

        {etat === 'erreur' && (
          <div className="rounded-xl bg-red-50 border border-red-200 p-4">
            <p className="text-sm font-semibold text-red-800 mb-1">Erreur</p>
            <p className="text-xs text-red-600">{erreur}</p>
          </div>
        )}

        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors">
            Fermer
          </button>
          {(etat === 'idle' || etat === 'erreur') && (
            <button
              onClick={lancer}
              className="px-4 py-2 text-sm font-medium bg-ockham-teal text-white rounded-lg hover:bg-ockham-teal/90 transition-colors"
            >
              Lancer le scan
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
