import { useState } from 'react'
import type { Relance, StatutRelance } from '../../hooks/useRelances'
import { useRole } from '../../contexts/RoleContext'

const STATUTS: { val: StatutRelance; label: string; cls: string }[] = [
  { val: 'brouillon',          label: 'Brouillon',             cls: 'bg-gray-100 text-gray-500 border-gray-200' },
  { val: 'envoyee',            label: 'Relance en cours',      cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  { val: 'repondue',           label: 'Prise de contact',      cls: 'bg-violet-50 text-violet-700 border-violet-200' },
  { val: 'promesse_paiement',  label: 'Promesse de paiement',  cls: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  { val: 'sans_reponse',       label: 'Sans réponse',          cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  { val: 'payee',              label: 'Payée',                 cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
]

function badgeStatut(statut: StatutRelance) {
  const s = STATUTS.find(s => s.val === statut) ?? STATUTS[0]
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded border whitespace-nowrap ${s.cls}`}>{s.label}</span>
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
}

function joursDepuis(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}

const SEUIL_ALERTE = 10

const TRANSITIONS: Partial<Record<StatutRelance, StatutRelance[]>> = {
  envoyee:           ['repondue', 'sans_reponse', 'payee'],
  sans_reponse:      ['repondue', 'payee'],
  repondue:          ['promesse_paiement', 'payee'],
  promesse_paiement: ['payee'],
}

const FILTRES: { val: StatutRelance | 'tous'; label: string }[] = [
  { val: 'tous',              label: 'Tous les statuts' },
  { val: 'envoyee',           label: 'Relance en cours' },
  { val: 'repondue',          label: 'Prise de contact' },
  { val: 'promesse_paiement', label: 'Promesse de paiement' },
  { val: 'sans_reponse',      label: 'Sans réponse' },
  { val: 'payee',             label: 'Payée' },
]

interface Props {
  relances: Relance[]
  chargement: boolean
  onMajStatut: (id: string, statut: StatutRelance) => Promise<boolean>
  onArchiver: (id: string) => Promise<boolean>
}

export function TableauRelances({ relances, chargement, onMajStatut, onArchiver }: Props) {
  const { peutModifier } = useRole()
  const [filtre, setFiltre] = useState<StatutRelance | 'tous'>('tous')
  const [afficherArchivees, setAfficherArchivees] = useState(false)
  const [editStatut, setEditStatut] = useState<string | null>(null)

  if (chargement) {
    return <div className="py-12 text-center text-sm text-gray-400">Chargement…</div>
  }

  const actives = relances.filter(r =>
    r.statut !== 'brouillon' &&
    (afficherArchivees ? true : !r.archivee)
  )

  const filtrees = filtre === 'tous'
    ? actives
    : actives.filter(r => r.statut === filtre)

  if (filtrees.length === 0 && actives.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-sm text-gray-400">Aucune relance envoyée pour le moment</p>
        <p className="text-xs text-gray-300 mt-1">Ouvrez une fiche client pour démarrer</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Barre de filtres */}
      <div className="flex items-center gap-3">
        <select
          value={filtre}
          onChange={e => setFiltre(e.target.value as StatutRelance | 'tous')}
          className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:border-ockham-teal bg-white text-gray-600"
        >
          {FILTRES.map(f => (
            <option key={f.val} value={f.val}>{f.label}</option>
          ))}
        </select>
        <button
          onClick={() => setAfficherArchivees(v => !v)}
          className={`text-[10px] font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
            afficherArchivees
              ? 'border-ockham-teal text-ockham-teal bg-ockham-teal-muted'
              : 'border-gray-200 text-gray-400 hover:border-gray-300'
          }`}
        >
          {afficherArchivees ? '✓ Archivées visibles' : 'Archivées'}
        </button>
        {filtrees.length > 0 && (
          <span className="text-[10px] text-gray-400 ml-auto">{filtrees.length} ligne{filtrees.length !== 1 ? 's' : ''}</span>
        )}
      </div>

      {filtrees.length === 0 ? (
        <div className="py-8 text-center text-sm text-gray-400">Aucune relance pour ce filtre</div>
      ) : (
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
                {peutModifier && <th className="px-4 py-3 w-[180px]" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtrees.map(r => {
                const actions = TRANSITIONS[r.statut] ?? []
                const jours = r.envoyee_le ? joursDepuis(r.envoyee_le) : null
                const enRetard = jours !== null && jours >= SEUIL_ALERTE && r.statut === 'envoyee'
                const rowCls = r.archivee
                  ? 'bg-gray-50/50 opacity-60'
                  : enRetard
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
                          r.statut === 'repondue' || r.statut === 'promesse_paiement' || r.statut === 'payee' ? 'text-gray-300' : 'text-gray-500'
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
                        <div className="flex items-center gap-1.5">
                          {/* Dropdown changement statut */}
                          {!r.archivee && actions.length > 0 && (
                            editStatut === r.id ? (
                              <select
                                autoFocus
                                defaultValue=""
                                onBlur={() => setEditStatut(null)}
                                onChange={async e => {
                                  if (!e.target.value) return
                                  setEditStatut(null)
                                  await onMajStatut(r.id, e.target.value as StatutRelance)
                                }}
                                className="text-[10px] border border-ockham-teal rounded px-2 py-1 outline-none bg-white text-gray-700 min-w-[140px]"
                              >
                                <option value="" disabled>→ Choisir…</option>
                                {actions.map(a => (
                                  <option key={a} value={a}>{STATUTS.find(s => s.val === a)?.label}</option>
                                ))}
                              </select>
                            ) : (
                              <button
                                onClick={() => setEditStatut(r.id)}
                                className="text-[10px] font-semibold px-2.5 py-1 rounded border border-gray-200 text-gray-400 hover:border-ockham-teal hover:text-ockham-teal hover:bg-ockham-teal-muted transition-colors whitespace-nowrap"
                              >
                                → Statut
                              </button>
                            )
                          )}
                          {/* Archiver */}
                          {!r.archivee && (
                            <button
                              onClick={() => onArchiver(r.id)}
                              className="text-[10px] text-gray-300 hover:text-red-400 border border-transparent hover:border-red-200 hover:bg-red-50 px-2 py-1 rounded transition-colors"
                              title="Archiver cette relance"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
