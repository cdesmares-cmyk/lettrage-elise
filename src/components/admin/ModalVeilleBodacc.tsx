// Modal — Scan historique BODACC (usage unique par tenant)
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

interface Props {
  onClose: () => void
}

type Etat = 'chargement' | 'deja_fait' | 'avertissement' | 'confirmation' | 'scan' | 'ok' | 'erreur'

interface SyncResult {
  mode: string
  clients_traités: number
  alertes_insérées: number
  statuts_mis_a_jour: number
  erreurs: string[]
}

export function ModalVeilleBodacc({ onClose }: Props) {
  const { utilisateur, profil } = useAuth()
  const [etat, setEtat]           = useState<Etat>('chargement')
  const [motDePasse, setMotDePasse] = useState('')
  const [erreurMdp, setErreurMdp]   = useState<string | null>(null)
  const [résumé, setRésumé]         = useState<SyncResult | null>(null)
  const [erreur, setErreur]         = useState<string | null>(null)

  useEffect(() => {
    if (!profil?.organisation_id) return
    supabase
      .from('organisations')
      .select('bodacc_onboarding_done_at')
      .eq('id', profil.organisation_id)
      .single()
      .then(({ data }) => {
        const fait = (data as { bodacc_onboarding_done_at: string | null } | null)?.bodacc_onboarding_done_at
        setEtat(fait ? 'deja_fait' : 'avertissement')
      })
  }, [profil?.organisation_id])

  async function confirmerMotDePasse() {
    if (!utilisateur?.email || !motDePasse) return
    setErreurMdp(null)
    const { error } = await supabase.auth.signInWithPassword({
      email: utilisateur.email,
      password: motDePasse,
    })
    if (error) {
      setErreurMdp('Mot de passe incorrect.')
      return
    }
    await lancerScan()
  }

  async function lancerScan() {
    if (!profil?.organisation_id) return
    setEtat('scan')
    setErreur(null)

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
            <h2 className="text-base font-semibold text-gray-900">Scan historique BODACC</h2>
            <p className="text-xs text-gray-500 mt-0.5">Analyse des procédures collectives sur votre portefeuille</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
        </div>

        {etat === 'chargement' && (
          <div className="flex items-center gap-3 py-2">
            <div className="w-4 h-4 border-2 border-gray-300 border-t-transparent rounded-full animate-spin flex-shrink-0" />
            <span className="text-sm text-gray-500">Vérification…</span>
          </div>
        )}

        {etat === 'deja_fait' && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 space-y-2">
            <p className="text-sm font-semibold text-amber-800">Scan déjà effectué</p>
            <p className="text-xs text-amber-700">
              Le scan historique a déjà été lancé pour votre organisation. Le scan quotidien automatique surveille désormais vos clients en continu.
            </p>
            <p className="text-xs text-amber-600 mt-1">
              Pour relancer un nouveau scan, contactez le support technique.
            </p>
          </div>
        )}

        {etat === 'avertissement' && (
          <div className="space-y-4">
            <div className="rounded-xl bg-blue-50 border border-blue-200 p-4 space-y-2">
              <p className="text-sm font-semibold text-blue-800">Avant de lancer le scan</p>
              <ul className="text-xs text-blue-700 space-y-1.5 list-disc list-inside">
                <li>Vérifiez que <strong>l'ensemble de vos clients ont été importés</strong></li>
                <li>Assurez-vous que les <strong>numéros SIRET sont correctement renseignés</strong> pour maximiser la remontée d'information</li>
                <li>Ce scan est <strong>à usage unique</strong> — le scan quotidien automatique prend le relais ensuite</li>
              </ul>
            </div>
            <p className="text-xs text-gray-400">
              L'analyse remonte à votre première facture. La durée varie selon le volume de clients et d'historique.
            </p>
          </div>
        )}

        {etat === 'confirmation' && (
          <div className="space-y-4">
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-4">
              <p className="text-sm font-semibold text-amber-800 mb-1">Confirmation administrateur</p>
              <p className="text-xs text-amber-700">Saisissez votre mot de passe pour confirmer le lancement du scan historique.</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Mot de passe</label>
              <input
                type="password"
                value={motDePasse}
                onChange={e => { setMotDePasse(e.target.value); setErreurMdp(null) }}
                onKeyDown={e => e.key === 'Enter' && confirmerMotDePasse()}
                placeholder="Votre mot de passe"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-ockham-teal/40 focus:border-ockham-teal"
                autoFocus
              />
              {erreurMdp && <p className="text-xs text-red-600 mt-1.5">{erreurMdp}</p>}
            </div>
          </div>
        )}

        {etat === 'scan' && (
          <div className="flex items-center gap-3 py-2">
            <div className="w-4 h-4 border-2 border-ockham-teal border-t-transparent rounded-full animate-spin flex-shrink-0" />
            <span className="text-sm text-gray-600">Scan en cours… Cela peut prendre quelques minutes.</span>
          </div>
        )}

        {etat === 'ok' && résumé && (
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 space-y-1.5">
            <p className="text-sm font-semibold text-emerald-800">Scan terminé</p>
            <ul className="text-xs text-emerald-700 space-y-0.5">
              <li>Clients analysés : <span className="font-medium">{résumé.clients_traités}</span></li>
              <li>Alertes détectées : <span className="font-medium">{résumé.alertes_insérées}</span></li>
              <li>Statuts mis à jour : <span className="font-medium">{résumé.statuts_mis_a_jour}</span></li>
            </ul>
            {résumé.erreurs?.length > 0 && (
              <p className="text-xs text-amber-600 mt-1">{résumé.erreurs.length} erreur(s) — voir les logs Supabase</p>
            )}
            <p className="text-xs text-gray-500 mt-2">Le scan quotidien automatique prend maintenant le relais.</p>
          </div>
        )}

        {etat === 'erreur' && (
          <div className="rounded-xl bg-red-50 border border-red-200 p-4 space-y-1">
            <p className="text-sm font-semibold text-red-800">Erreur</p>
            <p className="text-xs text-red-600">{erreur}</p>
            <p className="text-xs text-gray-500 mt-1">Contactez le support technique si le problème persiste.</p>
          </div>
        )}

        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors">
            Fermer
          </button>
          {etat === 'avertissement' && (
            <button
              onClick={() => setEtat('confirmation')}
              className="px-4 py-2 text-sm font-medium bg-ockham-teal text-white rounded-lg hover:bg-ockham-teal/90 transition-colors"
            >
              Lancer le scan historique
            </button>
          )}
          {etat === 'confirmation' && (
            <button
              onClick={confirmerMotDePasse}
              disabled={!motDePasse}
              className="px-4 py-2 text-sm font-medium bg-ockham-teal text-white rounded-lg hover:bg-ockham-teal/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Confirmer et lancer
            </button>
          )}
        </div>

      </div>
    </div>
  )
}
