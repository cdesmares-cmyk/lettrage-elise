// Modal — Synchronisation manuelle de la veille BODACC
// Déclenche l'Edge Function bodacc-sync puis met à jour statut_juridique des clients touchés.
import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { StatutJuridique } from '../../types/client'

interface Props {
  onClose: () => void
}

type Etat = 'idle' | 'sync' | 'maj' | 'ok' | 'erreur'

const PRIORITE: Record<string, number> = { liquidation: 1, redressement: 2, sauvegarde: 3, cloture: 4 }

interface AlerteRow {
  code_client: string
  type_procedure: string
  date_parution: string
}

export function ModalVeilleBodacc({ onClose }: Props) {
  const [etat, setEtat]       = useState<Etat>('idle')
  const [résumé, setRésumé]   = useState<{ clients_traités: number; alertes_insérées: number; nb_mis_a_jour: number } | null>(null)
  const [erreur, setErreur]   = useState<string | null>(null)

  async function lancer() {
    setEtat('sync')
    setErreur(null)
    setRésumé(null)

    // 1. Déclencher l'Edge Function
    const { data: syncData, error: syncErr } = await supabase.functions.invoke('bodacc-sync')
    if (syncErr || !syncData) {
      setErreur(syncErr?.message ?? 'Erreur lors de la synchronisation BODACC.')
      setEtat('erreur')
      return
    }

    // 2. Mettre à jour statut_juridique pour les clients avec alertes
    setEtat('maj')
    const { data: alertes, error: errAlertes } = await supabase
      .from('alertes_risque')
      .select('code_client, type_procedure, date_parution')
      .order('date_parution', { ascending: false })

    if (errAlertes) {
      setErreur(errAlertes.message)
      setEtat('erreur')
      return
    }

    // Alerte la plus grave par client (priorité : liquidation > redressement > sauvegarde > cloture)
    const parClient: Record<string, string> = {}
    for (const a of (alertes ?? []) as AlerteRow[]) {
      const actuel = parClient[a.code_client]
      if (!actuel || (PRIORITE[a.type_procedure] ?? 99) < (PRIORITE[actuel] ?? 99)) {
        parClient[a.code_client] = a.type_procedure
      }
    }

    // Regrouper par type de procédure pour faire une update par lot
    const parProcedure: Record<string, string[]> = {}
    for (const [code, type] of Object.entries(parClient)) {
      if (!parProcedure[type]) parProcedure[type] = []
      parProcedure[type].push(code)
    }

    let nbMaj = 0
    for (const [type, codes] of Object.entries(parProcedure)) {
      for (let i = 0; i < codes.length; i += 500) {
        const { error } = await supabase
          .from('clients')
          .update({ statut_juridique: type as StatutJuridique })
          .in('code_dso', codes.slice(i, i + 500))
        if (!error) nbMaj += codes.slice(i, i + 500).length
      }
    }

    setRésumé({
      clients_traités:  syncData.clients_traités  ?? 0,
      alertes_insérées: syncData.alertes_insérées ?? 0,
      nb_mis_a_jour:    nbMaj,
    })
    setEtat('ok')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 flex flex-col gap-5">

        {/* En-tête */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Veille BODACC</h2>
            <p className="text-xs text-gray-500 mt-0.5">Synchronisation manuelle des procédures collectives</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
        </div>

        {/* Corps */}
        {etat === 'idle' && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              Lance un scan BODACC sur tous les clients ayant un SIRET et met à jour leur statut juridique (liquidation, redressement, sauvegarde, clôture).
            </p>
            <p className="text-xs text-gray-400">Fenêtre par défaut : 90 derniers jours.</p>
          </div>
        )}

        {(etat === 'sync' || etat === 'maj') && (
          <div className="flex items-center gap-3 py-2">
            <div className="w-4 h-4 border-2 border-ockham-teal border-t-transparent rounded-full animate-spin flex-shrink-0" />
            <span className="text-sm text-gray-600">
              {etat === 'sync' ? 'Interrogation de l\'API BODACC…' : 'Mise à jour des statuts clients…'}
            </span>
          </div>
        )}

        {etat === 'ok' && résumé && (
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 space-y-1.5">
            <p className="text-sm font-semibold text-emerald-800">Synchronisation terminée</p>
            <ul className="text-xs text-emerald-700 space-y-0.5">
              <li>Clients scannés : <span className="font-medium">{résumé.clients_traités}</span></li>
              <li>Alertes insérées : <span className="font-medium">{résumé.alertes_insérées}</span></li>
              <li>Statuts mis à jour : <span className="font-medium">{résumé.nb_mis_a_jour}</span></li>
            </ul>
          </div>
        )}

        {etat === 'erreur' && (
          <div className="rounded-xl bg-red-50 border border-red-200 p-4">
            <p className="text-sm font-semibold text-red-800 mb-1">Erreur</p>
            <p className="text-xs text-red-600">{erreur}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
          >
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
