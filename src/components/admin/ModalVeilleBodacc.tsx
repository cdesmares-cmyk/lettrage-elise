// Modal — Scan global BODACC (disponible à tout moment)
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

interface Props {
  onClose: () => void
}

type Etat = 'chargement' | 'pret' | 'scan' | 'ok' | 'erreur'

interface SyncResult {
  mode: string
  clients_avec_siret: number
  alertes_insérées: number
  statuts_mis_a_jour: number
  tranches: number
  date_min?: string
}

export function ModalVeilleBodacc({ onClose }: Props) {
  const { profil } = useAuth()
  const [etat, setEtat]           = useState<Etat>('chargement')
  const [dernierScan, setDernierScan] = useState<string | null>(null)
  const [résumé, setRésumé]       = useState<SyncResult | null>(null)
  const [erreur, setErreur]       = useState<string | null>(null)

  useEffect(() => {
    if (!profil?.organisation_id) return
    supabase
      .from('organisations')
      .select('bodacc_onboarding_done_at')
      .eq('id', profil.organisation_id)
      .single()
      .then(({ data }) => {
        const fait = (data as { bodacc_onboarding_done_at: string | null } | null)?.bodacc_onboarding_done_at
        if (fait) setDernierScan(new Date(fait).toLocaleDateString('fr-FR'))
        setEtat('pret')
      })
  }, [profil?.organisation_id])

  async function lancerScan() {
    if (!profil?.organisation_id) return
    setEtat('scan')
    setErreur(null)
    setRésumé(null)

    const { data, error } = await supabase.functions.invoke('bodacc-sync', {
      body: { org_id: profil.organisation_id },
    })

    if (error || !data) {
      setErreur(error?.message ?? 'Erreur lors du scan BODACC.')
      setEtat('erreur')
      return
    }

    await supabase
      .from('organisations')
      .update({ bodacc_onboarding_done_at: new Date().toISOString() } as never)
      .eq('id', profil.organisation_id)

    setRésumé(data as SyncResult)
    setEtat('ok')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 flex flex-col gap-5">

        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Scan global BODACC</h2>
            <p className="text-xs text-gray-500 mt-0.5">Analyse de l'historique des procédures collectives sur votre portefeuille</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
        </div>

        {etat === 'chargement' && (
          <div className="flex items-center gap-3 py-2">
            <div className="w-4 h-4 border-2 border-gray-300 border-t-transparent rounded-full animate-spin flex-shrink-0" />
            <span className="text-sm text-gray-500">Chargement…</span>
          </div>
        )}

        {etat === 'pret' && (
          <div className="space-y-4">
            {dernierScan && (
              <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                <span>Dernier scan effectué le <span className="font-medium text-gray-700">{dernierScan}</span></span>
              </div>
            )}
            <div className="rounded-xl bg-blue-50 border border-blue-200 p-4 space-y-2">
              <p className="text-sm font-semibold text-blue-800">Avant de lancer le scan</p>
              <ul className="text-xs text-blue-700 space-y-1.5 list-disc list-inside">
                <li>Vérifiez que <strong>l'ensemble de vos clients ont été importés</strong></li>
                <li>Assurez-vous que les <strong>numéros SIRET sont correctement renseignés</strong></li>
                <li>Le scan couvre l'historique depuis votre première facture</li>
              </ul>
            </div>
            <p className="text-xs text-gray-400">
              Durée estimée : moins d'une minute. Les statuts juridiques seront mis à jour automatiquement.
            </p>
          </div>
        )}

        {etat === 'scan' && (
          <div className="flex items-center gap-3 py-4">
            <div className="w-4 h-4 border-2 border-ockham-teal border-t-transparent rounded-full animate-spin flex-shrink-0" />
            <span className="text-sm text-gray-600">Scan en cours… Cela peut prendre quelques instants.</span>
          </div>
        )}

        {etat === 'ok' && résumé && (
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 space-y-1.5">
            <p className="text-sm font-semibold text-emerald-800">Scan terminé</p>
            <ul className="text-xs text-emerald-700 space-y-0.5">
              {résumé.date_min && <li>Historique depuis : <span className="font-medium">{new Date(résumé.date_min).toLocaleDateString('fr-FR')}</span></li>}
              {résumé.tranches != null && <li>Tranches analysées : <span className="font-medium">{résumé.tranches}</span></li>}
              <li>Clients avec SIRET : <span className="font-medium">{résumé.clients_avec_siret}</span></li>
              <li>Alertes détectées : <span className="font-medium">{résumé.alertes_insérées}</span></li>
              <li>Statuts mis à jour : <span className="font-medium">{résumé.statuts_mis_a_jour}</span></li>
            </ul>
            <p className="text-xs text-gray-500 mt-2">Le scan quotidien automatique surveille désormais les nouvelles publications.</p>
          </div>
        )}

        {etat === 'erreur' && (
          <div className="rounded-xl bg-red-50 border border-red-200 p-4 space-y-1">
            <p className="text-sm font-semibold text-red-800">Erreur</p>
            <p className="text-xs text-red-600">{erreur}</p>
          </div>
        )}

        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors">
            Fermer
          </button>
          {(etat === 'pret' || etat === 'erreur') && (
            <button
              onClick={lancerScan}
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
