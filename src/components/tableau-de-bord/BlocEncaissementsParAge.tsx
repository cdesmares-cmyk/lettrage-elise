// Les encaissements, decomposes par anciennete de la facture payee.
//
// CE QU'IL REPOND. Le graphique du dessus dit COMBIEN on encaisse. Celui-ci dit
// si on encaisse du recent ou du vieux. Meme montant, deux situations opposees :
// 100 k€ sur des factures non echues, c'est un portefeuille sain ; les memes
// 100 k€ sur des creances de plus de 90 jours, c'est du recouvrement qui
// rattrape du retard accumule.
//
// L'ANCIENNETE EST CELLE DU JOUR DU PAIEMENT, pas celle d'aujourd'hui. Une
// facture payee avec 100 jours de retard en janvier reste un encaissement
// « +90j » de janvier, meme regarde en novembre. C'est ce qui rend les barres
// comparables d'un mois sur l'autre.
//
// MEMES TRANCHES ET MEMES COULEURS que la balance agee des creances, plus bas
// dans la page. Deux lectures du meme decoupage : l'une sur ce qui reste du,
// l'autre sur ce qui est rentre.
//
// PAS DE SELECTEUR DE PERIODE ICI. Il est pilote par le graphique des
// encaissements juste au-dessus : les deux se lisent ensemble, ils doivent
// bouger ensemble. Deux selecteurs desynchronises rendraient la comparaison
// trompeuse.
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import type { useDashboard } from '../../hooks/useDashboard'

type Props = ReturnType<typeof useDashboard>

// Identiques a AGE_COLORS de BlocAnalyse : vert pour le non echu, puis le
// rouge qui s'assombrit avec le retard.
const AGE_COLORS = ['#10b981', '#f59e0b', '#f97316', '#ef4444', '#991b1b']

const TRANCHES = [
  { cle: 'nonEchue', label: 'Non échu', couleur: AGE_COLORS[0] },
  { cle: 'j1_30',    label: '1 – 30j',  couleur: AGE_COLORS[1] },
  { cle: 'j31_60',   label: '31 – 60j', couleur: AGE_COLORS[2] },
  { cle: 'j61_90',   label: '61 – 90j', couleur: AGE_COLORS[3] },
  { cle: 'j90_plus', label: '+90j',     couleur: AGE_COLORS[4] },
] as const

const _fmtK    = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })
const _fmtEuro = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
function fmtK(n: number)    { return n >= 1000 ? _fmtK.format(n / 1000) + 'k€' : _fmtK.format(n) + '€' }
function fmtEuro(n: number) { return _fmtEuro.format(n) + ' €' }

function TooltipAge({ active, payload, label }: {
  active?: boolean
  payload?: { name: string; value: number; fill: string }[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  const total = payload.reduce((s, p) => s + p.value, 0)
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2.5 text-xs min-w-[200px]">
      <p className="font-semibold text-gray-600 mb-1.5">{label}</p>
      {/* Du plus ancien au plus recent : l'empilement se lit de haut en bas,
          la legende doit suivre le meme ordre que les barres. */}
      {[...payload].reverse().map(p => (
        <div key={p.name} className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: p.fill }} />
            <span className="text-gray-500">{p.name}</span>
          </div>
          <span className="font-mono font-semibold text-gray-800 tabular-nums">{fmtEuro(p.value)}</span>
        </div>
      ))}
      {total > 0 && (
        <div className="flex items-center justify-between gap-4 mt-1.5 pt-1.5 border-t border-gray-100">
          <span className="text-gray-400">Total</span>
          <span className="font-mono font-bold text-gray-800 tabular-nums">{fmtEuro(total)}</span>
        </div>
      )}
    </div>
  )
}

export function BlocEncaissementsParAge({ pointsEncaissementAge }: Props) {
  const totaux = TRANCHES.map(t =>
    pointsEncaissementAge.reduce((s, p) => s + p[t.cle], 0)
  )
  const total = totaux.reduce((s, n) => s + n, 0)

  // Tant que la migration 187 n'est pas executee, la RPC n'existe pas et le
  // tableau reste vide. Mieux vaut ne rien afficher qu'un graphique plat que
  // personne ne saurait interpreter.
  if (total <= 0) return null

  // La part de ce qui est rentre en retard : le chiffre que l'oeil cherche.
  const partEnRetard = (totaux[1] + totaux[2] + totaux[3] + totaux[4]) / total

  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
      <div className="border-b border-gray-100 px-5 py-3 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-baseline gap-x-3 gap-y-1 flex-wrap">
          <h3 className="text-sm font-bold text-gray-800">Ancienneté des encaissements</h3>
          <span className="text-[11px] font-mono font-bold text-gray-600">{fmtEuro(total)}</span>
          <span className="text-[10px] text-gray-500">
            dont <span className="font-mono font-semibold text-gray-700">
              {Math.round(partEnRetard * 100)}%
            </span> encaissé en retard
          </span>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {TRANCHES.map((t, i) => (
            <span key={t.cle} className="flex items-center gap-1.5 text-[10px] text-gray-500">
              <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: t.couleur }} />
              {t.label}
              <span className="font-mono font-semibold text-gray-700">{fmtK(totaux[i])}</span>
            </span>
          ))}
        </div>
      </div>

      <div className="px-2 py-4">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={pointsEncaissementAge} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={fmtK} tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={42} />
            <Tooltip content={<TooltipAge />} cursor={{ fill: '#f9fafb' }} />
            {TRANCHES.map((t, i) => (
              <Bar
                key={t.cle}
                dataKey={t.cle}
                name={t.label}
                stackId="age"
                fill={t.couleur}
                // Le coin arrondi ne va que sur la derniere tranche empilee,
                // sinon chaque segment serait arrondi au milieu de la barre.
                radius={i === TRANCHES.length - 1 ? [3, 3, 0, 0] : undefined}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
