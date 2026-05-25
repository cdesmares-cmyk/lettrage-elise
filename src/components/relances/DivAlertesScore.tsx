import { useAlertesScore } from '../../hooks/useAlertesScore'
import { useRole } from '../../contexts/RoleContext'
import { useAppData } from '../../contexts/AppDataContext'
import { useGmailAuth } from '../../hooks/useGmailAuth'
import { useCommentairesFactures } from '../../hooks/useCommentairesFactures'
import { ModalCompositionRelance } from './ModalCompositionRelance'
import { useState, useRef, useCallback } from 'react'
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
  const [scrollRatio, setScrollRatio] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)

  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const max = el.scrollHeight - el.clientHeight
    setScrollRatio(max > 0 ? el.scrollTop / max : 0)
  }, [])

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

  const dotSize = (zone: 'top' | 'mid' | 'bot') => {
    const active =
      scrollRatio < 0.33 ? 'top' :
      scrollRatio < 0.67 ? 'mid' : 'bot'
    return active === zone
      ? 'w-2 h-2 bg-gray-500'
      : 'w-1 h-1 bg-gray-300'
  }

  return (
    <>
      <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-4">
        <div className="flex items-stretch gap-3">

          {/* Hitbox scroll vertical — 3 alertes visibles */}
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto space-y-2"
            style={{
              height: 276,
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
            }}
          >
          {alertes.map((a, i) => {
            const cls = cardClasses(a.score_risque)
            return (
              <div
                key={a.id}
                onClick={() => peutModifier && handleRelancer(a.code_client)}
                className={`flex items-center gap-4 border rounded-xl px-4 py-3 transition-all select-none ${cls.border} ${cls.bg} ${peutModifier ? 'cursor-pointer hover:shadow-sm' : ''}`}
              >
                {/* Rang */}
                <span className="text-[10px] font-bold text-gray-300 w-4 flex-shrink-0 text-center">#{i + 1}</span>

                {/* Identité client */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-900 truncate">{a.nom_client ?? a.code_client}</p>
                  <p className="text-[10px] font-mono text-gray-400">{a.code_client}</p>
                </div>

                {/* Badge risque */}
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${cls.badge}`}>
                  {a.score_risque} — {cls.label}
                </span>

                {/* Métriques */}
                <div className="text-right flex-shrink-0">
                  <p className="text-[12px] font-bold text-gray-800 tabular-nums">{formatEuros(a.encours_ttc)}</p>
                  <p className={`text-[10px] font-semibold tabular-nums ${a.retard_max_jours > 90 ? 'text-red-500' : a.retard_max_jours > 60 ? 'text-amber-500' : 'text-gray-400'}`}>
                    {a.retard_max_jours}j retard
                  </p>
                </div>

                {/* Actions — stopPropagation pour ne pas déclencher le relancer */}
                <div className="flex items-center gap-1.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
                  <button
                    onClick={() => onOuvrirFiche(a.code_client)}
                    className="text-[10px] font-semibold text-ockham-teal border border-ockham-teal/30 bg-white hover:bg-ockham-teal-muted px-2.5 py-1 rounded-lg transition-colors"
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
        </div>

          {/* Indicateur scroll — 3 dots animés */}
          {alertes.length > 3 && (
            <div className="flex flex-col items-center justify-center gap-1.5 flex-shrink-0 w-3">
              <span className={`block rounded-full transition-all duration-300 ${dotSize('top')}`} />
              <span className={`block rounded-full transition-all duration-300 ${dotSize('mid')}`} />
              <span className={`block rounded-full transition-all duration-300 ${dotSize('bot')}`} />
            </div>
          )}
        </div>

        <p className="text-[10px] text-gray-400 mt-3">
          {alertes.length} alerte{alertes.length > 1 ? 's' : ''} aujourd'hui
          {peutModifier && ' · cliquer pour relancer'}
          {alertes.length > 3 && ' · défiler pour voir toutes les alertes'}
        </p>
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
