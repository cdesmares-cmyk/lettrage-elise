import type { Relance, StatutRelance } from '../../hooks/useRelances'
import { useRole } from '../../contexts/RoleContext'

const STATUTS: { val: StatutRelance; label: string; cls: string }[] = [
  { val: 'brouillon',    label: 'Brouillon',    cls: 'bg-gray-100 text-gray-500 border-gray-200' },
  { val: 'envoyee',      label: 'Envoyée',      cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  { val: 'repondue',     label: 'Répondue',     cls: 'bg-violet-50 text-violet-700 border-violet-200' },
  { val: 'sans_reponse', label: 'Sans réponse', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  { val: 'payee',        label: 'Payée',        cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
]

function badgeStatut(statut: StatutRelance) {
  const s = STATUTS.find(s => s.val === statut) ?? STATUTS[0]
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${s.cls}`}>{s.label}</span>
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
}

function joursDepuis(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}

const SEUIL_ALERTE = 10

const TRANSITIONS: Partial<Record<StatutRelance, StatutRelance[]>> = {
  envoyee:      ['repondue', 'sans_reponse', 'payee'],
  sans_reponse: ['repondue', 'payee'],
}

interface Props {
  relances: Relance[]
  chargement: boolean
  onMajStatut: (id: string, statut: StatutRelance) => Promise<boolean>
}

export function TableauRelances({ relances, chargement, onMajStatut }: Props) {
  const { peutModifier } = useRole()
  const recentes = relances.filter(r => r.statut !== 'brouillon').slice(0, 20)

  if (chargement) {
    return <div className="py-12 text-center text-sm text-gray-400">Chargement…</div>
  }

  if (recentes.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-sm text-gray-400">Aucune relance envoyée pour le moment</p>
        <p className="text-xs text-gray-300 mt-1">Ouvrez une fiche client pour démarrer</p>
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50/60">
            <th className="text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider px-4 py-3">Client</th>
            <th className="text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider px-4 py-3">Objet</th>
            <th className="text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider px-4 py-3">Envoyée le</th>
            <th className="text-center text-[10px] font-bold text-gray-400 uppercase tracking-wider px-4 py-3">J+</th>
            <th className="text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider px-4 py-3">Statut</th>
            <th className="text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider px-4 py-3">Pts</th>
            {peutModifier && <th className="px-4 py-3" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {recentes.map(r => {
            const actions = TRANSITIONS[r.statut] ?? []
            const jours = r.envoyee_le ? joursDepuis(r.envoyee_le) : null
            const enRetard = jours !== null && jours >= SEUIL_ALERTE && r.statut === 'envoyee'
            const rowCls = enRetard
              ? 'bg-amber-50/60 hover:bg-amber-50 border-l-2 border-l-amber-400'
              : 'hover:bg-gray-50/40'

            return (
              <tr key={r.id} className={`transition-colors ${rowCls}`}>
                <td className="px-4 py-3 font-mono text-xs text-gray-600">{r.code_client}</td>
                <td className="px-4 py-3 text-gray-700 max-w-[200px] truncate">{r.objet}</td>
                <td className="px-4 py-3 text-gray-400 text-xs tabular-nums">
                  {r.envoyee_le ? fmtDate(r.envoyee_le) : '—'}
                </td>
                <td className="px-4 py-3 text-center">
                  {jours !== null ? (
                    <span className={`text-[11px] font-bold tabular-nums ${
                      enRetard ? 'text-amber-600' :
                      r.statut === 'repondue' || r.statut === 'payee' ? 'text-gray-300' : 'text-gray-500'
                    }`}>
                      {jours === 0 ? 'Auj.' : `${jours}j`}
                    </span>
                  ) : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    {badgeStatut(r.statut)}
                    {enRetard && (
                      <span className="text-[9px] font-bold text-amber-500" title={`Envoyée il y a ${jours} jours sans réponse`}>⏰</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-xs font-bold text-gray-500 tabular-nums">
                  {r.points_attribues > 0 ? `+${r.points_attribues}` : '—'}
                </td>
                {peutModifier && (
                  <td className="px-4 py-3">
                    {actions.length > 0 && (
                      <div className="flex gap-1 flex-wrap">
                        {actions.map(a => {
                          const s = STATUTS.find(s => s.val === a)!
                          const isPrimary = a === 'repondue' || a === 'payee'
                          return (
                            <button
                              key={a}
                              onClick={() => onMajStatut(r.id, a)}
                              className={`text-[10px] font-semibold px-2 py-1 rounded border transition-colors ${
                                isPrimary
                                  ? 'border-blue-200 text-blue-600 hover:bg-blue-50 hover:border-blue-400'
                                  : 'border-gray-200 text-gray-400 hover:border-amber-300 hover:text-amber-600 hover:bg-amber-50'
                              }`}
                            >
                              → {s.label}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
