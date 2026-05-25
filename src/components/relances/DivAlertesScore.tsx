import { useAlertesScore } from '../../hooks/useAlertesScore'
import { useRole } from '../../contexts/RoleContext'
import { useAppData } from '../../contexts/AppDataContext'
import { useGmailAuth } from '../../hooks/useGmailAuth'
import { useCommentairesFactures } from '../../hooks/useCommentairesFactures'
import { ModalCompositionRelance } from './ModalCompositionRelance'
import { useState } from 'react'
import toast from 'react-hot-toast'
import type { CompteClient } from '../../types/client'

function formatEuros(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M€`
  if (n >= 10_000) return `${Math.round(n / 1_000)} k€`
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(n) + ' €'
}

function cardClasses(score: number) {
  if (score >= 70) return {
    border: 'border-red-200 hover:border-red-400',
    bg: 'bg-red-50/60',
    badge: 'bg-red-100 text-red-700',
    label: 'Élevé',
  }
  if (score >= 40) return {
    border: 'border-amber-200 hover:border-amber-400',
    bg: 'bg-amber-50/40',
    badge: 'bg-amber-100 text-amber-700',
    label: 'Modéré',
  }
  return {
    border: 'border-gray-200 hover:border-ockham-teal/40',
    bg: 'bg-white',
    badge: 'bg-emerald-100 text-emerald-700',
    label: 'Faible',
  }
}

interface Props {
  onOuvrirFiche: (codeClient: string) => void
}

export function DivAlertesScore({ onOuvrirFiche }: Props) {
  const { alertes, chargement, prendreEnCharge, snoozeJours } = useAlertesScore()
  const { peutModifier } = useRole()
  const { clients } = useAppData()
  const gmailAuth = useGmailAuth()
  const { commentaires } = useCommentairesFactures()
  const [clientRelance, setClientRelance] = useState<CompteClient | null>(null)
  const [alerteCodeApresRelance, setAlerteCodeApresRelance] = useState<string | null>(null)

  function handleRelancer(codeClient: string) {
    const client = clients.find(c => c.code_dso === codeClient)
    if (!client) return
    setClientRelance(client)
    setAlerteCodeApresRelance(codeClient)
  }

  function handleRelanceSent() {
    const code = alerteCodeApresRelance
    setClientRelance(null)
    setAlerteCodeApresRelance(null)
    if (!code) return
    toast(t => (
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-700">Mettre ce client en attente {snoozeJours}j ?</span>
        <button onClick={() => { prendreEnCharge(code); toast.dismiss(t.id) }} className="text-xs font-semibold text-ockham-teal hover:underline">Oui</button>
        <button onClick={() => toast.dismiss(t.id)} className="text-xs text-gray-400 hover:text-gray-600">Non</button>
      </div>
    ), { duration: 8000 })
  }

  if (chargement) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-gray-400">
        <span className="w-3 h-3 border border-gray-300 border-t-transparent rounded-full animate-spin" />
        Chargement des alertes…
      </div>
    )
  }

  if (!alertes.length) {
    return (
      <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
        <span className="text-emerald-500 text-lg">✓</span>
        <p className="text-sm text-emerald-700 font-medium">Aucune alerte score aujourd'hui.</p>
      </div>
    )
  }

  return (
    <>
      <div className="relative">
        {/* Strip horizontal scroll */}
        <div
          className="flex gap-3 overflow-x-auto pb-2"
          style={{ scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch' }}
        >
          {alertes.map((a, i) => {
            const cls = cardClasses(a.score_risque)
            return (
              <div
                key={a.id}
                onClick={() => peutModifier && handleRelancer(a.code_client)}
                className={`flex-shrink-0 border rounded-xl p-3.5 transition-all select-none ${cls.border} ${cls.bg} ${peutModifier ? 'cursor-pointer hover:shadow-sm' : ''}`}
                style={{ scrollSnapAlign: 'start', width: 200 }}
              >
                {/* Header : rang + badge */}
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-[10px] font-bold text-gray-300">#{i + 1}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cls.badge}`}>
                    {a.score_risque} — {cls.label}
                  </span>
                </div>

                {/* Nom client */}
                <p className="text-sm font-bold text-gray-900 truncate leading-tight">{a.nom_client ?? a.code_client}</p>
                <p className="text-[10px] font-mono text-gray-400 mt-0.5">{a.code_client}</p>

                {/* Métriques */}
                <div className="mt-3 space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] text-gray-400">Encours</span>
                    <span className="text-[11px] font-bold text-gray-800 tabular-nums">{formatEuros(a.encours_ttc)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] text-gray-400">Retard max</span>
                    <span className={`text-[11px] font-bold tabular-nums ${a.retard_max_jours > 90 ? 'text-red-600' : a.retard_max_jours > 60 ? 'text-amber-600' : 'text-gray-600'}`}>
                      {a.retard_max_jours}j
                    </span>
                  </div>
                </div>

                {/* Actions secondaires */}
                <div className="mt-3 flex gap-1.5" onClick={e => e.stopPropagation()}>
                  <button
                    onClick={() => onOuvrirFiche(a.code_client)}
                    className="flex-1 text-[10px] font-semibold text-ockham-teal border border-ockham-teal/30 bg-white hover:bg-ockham-teal-muted px-2 py-1 rounded-lg transition-colors"
                  >
                    Voir fiche
                  </button>
                  {peutModifier && (
                    <button
                      onClick={() => prendreEnCharge(a.code_client)}
                      title={`Snooze ${snoozeJours}j`}
                      className="text-[10px] font-medium text-gray-400 hover:text-gray-600 border border-gray-200 hover:border-gray-300 px-2 py-1 rounded-lg transition-colors"
                    >
                      ✓
                    </button>
                  )}
                </div>
              </div>
            )
          })}

          {/* Sentinelle de fin pour indiquer qu'il y en a d'autres */}
          {alertes.length > 5 && (
            <div className="flex-shrink-0 flex items-center justify-center text-[11px] font-semibold text-gray-300 pr-2" style={{ width: 40 }}>
              ›
            </div>
          )}
        </div>

        {/* Compteur */}
        <p className="text-[10px] text-gray-400 mt-1">{alertes.length} alerte{alertes.length > 1 ? 's' : ''} aujourd'hui · cliquer pour relancer</p>
      </div>

      <ModalCompositionRelance
        client={clientRelance}
        onFermer={() => { setClientRelance(null); setAlerteCodeApresRelance(null) }}
        onSent={handleRelanceSent}
        gmailAuth={gmailAuth}
        commentaires={commentaires}
      />
    </>
  )
}
