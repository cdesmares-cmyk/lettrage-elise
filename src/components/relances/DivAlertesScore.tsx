import { useState } from 'react'
import { useAlertesScore } from '../../hooks/useAlertesScore'
import { useRole } from '../../contexts/RoleContext'

const PAR_PAGE = 5

function badgeScore(score: number) {
  if (score >= 70) return { bg: 'bg-red-100 text-red-700',    label: 'Élevé' }
  if (score >= 40) return { bg: 'bg-amber-100 text-amber-700', label: 'Modéré' }
  return              { bg: 'bg-emerald-100 text-emerald-700', label: 'Faible' }
}

function formatEuros(n: number) {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(n) + ' €'
}

interface Props {
  onOuvrirFiche: (codeClient: string) => void
}

export function DivAlertesScore({ onOuvrirFiche }: Props) {
  const { alertes, chargement, prendreEnCharge, snoozeJours } = useAlertesScore()
  const { peutModifier } = useRole()
  const [page, setPage] = useState(0)

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

  const nbPages = Math.ceil(alertes.length / PAR_PAGE)
  const pageCourante = Math.min(page, nbPages - 1)
  const visibles = alertes.slice(pageCourante * PAR_PAGE, (pageCourante + 1) * PAR_PAGE)

  return (
    <div className="space-y-2">
      {visibles.map((a, i) => {
        const rang = pageCourante * PAR_PAGE + i + 1
        const badge = badgeScore(a.score_risque)
        return (
          <div
            key={a.id}
            className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3 hover:border-gray-300 transition-colors"
          >
            <span className="text-[11px] font-bold text-gray-300 w-5 text-center flex-shrink-0">
              {rang}
            </span>
            <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full flex-shrink-0 ${badge.bg}`}>
              {a.score_risque} — {badge.label}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">{a.nom_client ?? a.code_client}</p>
              <p className="text-[11px] text-gray-400 font-mono">{a.code_client}</p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-sm font-bold text-gray-900">{formatEuros(a.encours_ttc)}</p>
              <p className="text-[11px] text-gray-400">Retard max : {a.retard_max_jours}j</p>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                onClick={() => onOuvrirFiche(a.code_client)}
                className="text-[11px] font-semibold text-ockham-teal border border-ockham-teal/30 bg-ockham-teal/5 hover:bg-ockham-teal hover:text-white px-3 py-1.5 rounded-lg transition-colors"
              >
                Fiche →
              </button>
              {peutModifier && (
                <button
                  onClick={() => prendreEnCharge(a.code_client)}
                  title={`Mettre en attente ${snoozeJours} jours`}
                  className="text-[11px] font-medium text-gray-400 hover:text-gray-600 border border-gray-200 hover:border-gray-300 px-3 py-1.5 rounded-lg transition-colors"
                >
                  ✓ Pris en charge
                </button>
              )}
            </div>
          </div>
        )
      })}

      {/* Pagination */}
      {nbPages > 1 && (
        <div className="flex items-center justify-between pt-1">
          <p className="text-[11px] text-gray-400">
            {pageCourante + 1} / {nbPages} — {alertes.length} alertes
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={pageCourante === 0}
              className="px-2.5 py-1 text-xs border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              ←
            </button>
            {Array.from({ length: nbPages }, (_, i) => (
              <button
                key={i}
                onClick={() => setPage(i)}
                className={`w-7 h-7 text-xs rounded-lg transition-colors ${
                  i === pageCourante
                    ? 'bg-ockham-teal text-white font-semibold'
                    : 'border border-gray-200 text-gray-500 hover:bg-gray-50'
                }`}
              >
                {i + 1}
              </button>
            ))}
            <button
              onClick={() => setPage(p => Math.min(nbPages - 1, p + 1))}
              disabled={pageCourante === nbPages - 1}
              className="px-2.5 py-1 text-xs border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
