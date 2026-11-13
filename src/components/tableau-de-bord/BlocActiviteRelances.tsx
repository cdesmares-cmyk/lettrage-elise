import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import type { useDashboard, PeriodeEncaissement, CanalRecouvrement } from '../../hooks/useDashboard'

type Props = ReturnType<typeof useDashboard>

const _fmtK    = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })
const _fmtEuro = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
function fmtK(n: number)    { return n >= 1000 ? _fmtK.format(n / 1000) + 'k€' : _fmtK.format(n) + '€' }
function fmtEuro(n: number) { return _fmtEuro.format(n) + ' €' }
function fmtNb(n: number)   { return _fmtK.format(n) }

// Teal et navy pour ce qui passe PAR Ockham, deux gris pour ce qui se fait
// dehors. Lu comme ca, le graphique mesure aussi l'adoption de l'outil : si le
// gris domine, l'outil ne capte pas le travail reel.
//
// Le navy est la couleur de structure de la charte, et il tranche franchement
// avec l'ardoise de l'appel. Deux gris moyens voisins dans un empilement
// seraient indistinguables.
const CANAUX: { cle: CanalRecouvrement; label: string; couleur: string }[] = [
  { cle: 'manuel', label: 'Manuel', couleur: '#4CC5BB' },
  { cle: 'auto',   label: 'Auto',   couleur: '#0E1A2B' },
  { cle: 'appel',  label: 'Appel',  couleur: '#64748B' },
  { cle: 'mail',   label: 'Mail',   couleur: '#CBD5E1' },
]

const PERIODES: { val: PeriodeEncaissement; label: string }[] = [
  { val: 'jour',      label: '7 jours'    },
  { val: 'semaine',   label: '12 sem.'    },
  { val: 'mois',      label: '12 mois'    },
  { val: 'trimestre', label: 'Trimestres' },
  { val: 'annee',     label: 'Années'     },
]

function TooltipActivite({ active, payload, label }: {
  active?: boolean
  payload?: { name: string; value: number; color: string }[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  const montant = payload.find(p => p.name === 'Montant relancé')
  // Du haut de la pile vers le bas, pour suivre l'ordre visuel des barres.
  const actions = payload.filter(p => p.name !== 'Montant relancé' && p.value > 0).reverse()
  const total   = actions.reduce((s, p) => s + p.value, 0)
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2.5 text-xs min-w-[200px]">
      <p className="font-semibold text-gray-600 mb-2">{label}</p>
      <div className="space-y-1.5">
        {actions.map(p => (
          <div key={p.name} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0 border border-gray-200" style={{ background: p.color }} />
              <span className="text-gray-400">{p.name}</span>
            </div>
            <span className="font-semibold text-gray-700 tabular-nums">{fmtNb(p.value)}</span>
          </div>
        ))}
        {actions.length > 1 && (
          <div className="flex items-center justify-between gap-4 pt-1.5 border-t border-gray-100">
            <span className="text-gray-400">Total actions</span>
            <span className="font-bold text-gray-800 tabular-nums">{fmtNb(total)}</span>
          </div>
        )}
        {montant && montant.value > 0 && (
          <div className="flex items-center justify-between gap-4 pt-1.5 border-t border-gray-100">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-[2px] rounded-full flex-shrink-0" style={{ background: montant.color }} />
              {/* Le libelle dit d'ou vient le montant : appel et mail n'en
                  portent pas, et sans cette precision on lirait la courbe
                  comme couvrant les quatre barres. */}
              <span className="text-gray-400">Montant relancé <span className="text-gray-300">(manuel + auto)</span></span>
            </div>
            <span className="font-mono font-semibold text-gray-800 tabular-nums">{fmtEuro(montant.value)}</span>
          </div>
        )}
      </div>
    </div>
  )
}

export function BlocActiviteRelances({
  pointsActiviteRelances, periodeActiviteRelances, setPeriodeActiviteRelances,
  operateursActivite, filtreOperateur, setFiltreOperateur,
  pointsActiviteRecouvrement, activiteSurQuatreCanaux,
  canauxMasques, setCanauxMasques,
  decalage, reculer, avancer, revenirAAujourdhui, decalageMax,
  joursOuvresActivite, setJoursOuvresActivite,
}: Props) {
  // Tant que la migration 188 n'est pas executee, on retombe sur l'ancienne
  // source en la projetant sur la meme forme : un seul canal rempli, les trois
  // autres a zero. Un seul chemin de rendu, aucune bascule a maintenir.
  const points = activiteSurQuatreCanaux
    ? pointsActiviteRecouvrement
    : pointsActiviteRelances.map(p => ({
        label: p.label, manuel: p.nb_relances, auto: 0, appel: 0, mail: 0, montant: p.montant,
      }))

  if (!points.length) return null

  const totalParCanal = Object.fromEntries(
    CANAUX.map(c => [c.cle, points.reduce((s, p) => s + p[c.cle], 0)])
  ) as Record<CanalRecouvrement, number>

  const totalActions = CANAUX.reduce((s, c) => s + totalParCanal[c.cle], 0)
  const totalMontant = points.reduce((s, p) => s + p.montant, 0)
  const hasData      = totalActions > 0

  function basculerCanal(cle: CanalRecouvrement) {
    setCanauxMasques(
      canauxMasques.includes(cle)
        ? canauxMasques.filter(c => c !== cle)
        : [...canauxMasques, cle]
    )
  }

  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
      <div className="border-b border-gray-100 px-5 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-bold text-gray-800">Activité recouvrement</h3>
          {totalMontant > 0 && (
            <span className="text-[11px] font-mono font-bold text-gray-600">{fmtEuro(totalMontant)}</span>
          )}
          {totalActions > 0 && (
            <span className="text-[11px] text-gray-400">
              · <span className="font-semibold text-gray-600">{fmtNb(totalActions)}</span> action{totalActions > 1 ? 's' : ''}
            </span>
          )}
          {decalage > 0 && (
            <button
              onClick={revenirAAujourdhui}
              title="Revenir à la période en cours"
              className="inline-flex items-center gap-1 text-[10px] font-bold text-ockham-copper bg-ockham-copper/10 border border-ockham-copper/30 px-2 py-0.5 rounded-full hover:bg-ockham-copper/20 transition-colors cursor-pointer"
            >
              Historique · revenir à aujourd'hui
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Filtre operateur. Affiche seulement s'il y a plus d'une personne
              a relancer : a une seule, le selecteur n'apporte rien et encombre
              un en-tete qui porte deja cinq boutons de periode. */}
          {operateursActivite.length > 1 && (
            <div className="relative">
              <select
                value={filtreOperateur}
                onChange={e => setFiltreOperateur(e.target.value)}
                className={`text-[10px] font-semibold pl-2.5 pr-6 py-1 rounded border appearance-none bg-white outline-none transition-colors cursor-pointer ${
                  filtreOperateur
                    ? 'border-ockham-teal text-ockham-teal'
                    : 'border-gray-200 text-gray-500 hover:border-gray-300'
                }`}
              >
                <option value="">Tous les opérateurs</option>
                {operateursActivite.map(o => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
              <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none text-[9px]">▾</span>
            </div>
          )}

          {/* N'apparait qu'en vue « 7 jours » : c'est la seule ou les week-ends
              font des barres vides. Sur les autres periodes ils sont DANS les
              tranches, et les retirer ferait perdre des actions.
              Reglage propre a ce graphique : il a son propre selecteur de
              periode, un interrupteur partage avec les encaissements agirait
              a distance sans qu'on comprenne pourquoi. */}
          {periodeActiviteRelances === 'jour' && (
            <button
              onClick={() => setJoursOuvresActivite(!joursOuvresActivite)}
              title={joursOuvresActivite
                ? 'Les actions du week-end sont rattachées au lundi suivant'
                : 'Afficher les sept derniers jours ouvrés'}
              className={`text-[10px] font-semibold px-2.5 py-1 rounded border transition-colors cursor-pointer ${
                joursOuvresActivite
                  ? 'border-ockham-teal bg-ockham-teal-muted text-ockham-teal-dark'
                  : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
              }`}
            >
              Jours ouvrés
            </button>
          )}

          {/* Navigation dans le passe. Un cran = une unite de la periode
              affichee : un jour en vue « 7 jours », un mois en vue « 12 mois ».
              Borne a gauche par DECALAGE_MAX, qui correspond aux 24 mois
              charges : au-dela les barres seraient vides et on croirait a une
              panne plutot qu'a une absence de donnees. */}
          <div className="flex items-center gap-0.5">
            <button
              onClick={reculer}
              disabled={decalage >= decalageMax}
              title="Période précédente"
              className="w-6 h-6 flex items-center justify-center rounded border border-gray-200 text-gray-500 hover:border-ockham-teal hover:text-ockham-teal disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <button
              onClick={avancer}
              disabled={decalage === 0}
              title="Période suivante"
              className="w-6 h-6 flex items-center justify-center rounded border border-gray-200 text-gray-500 hover:border-ockham-teal hover:text-ockham-teal disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>

        <div className="flex gap-1">
          {PERIODES.map(p => (
            <button
              key={p.val}
              onClick={() => setPeriodeActiviteRelances(p.val)}
              className={`text-[10px] font-semibold px-2.5 py-1 rounded transition-colors ${
                periodeActiviteRelances === p.val
                  ? 'bg-ockham-navy text-white'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        </div>
      </div>

      {/* La legende EST le filtre : cliquer sur un canal le masque. Deux
          commandes pour une seule intention, ce serait une de trop. */}
      {activiteSurQuatreCanaux && (
        <div className="px-5 py-2.5 border-b border-gray-100 bg-gray-50/40 flex items-center gap-3 flex-wrap">
          {CANAUX.map(c => {
            const masque = canauxMasques.includes(c.cle)
            return (
              <button
                key={c.cle}
                onClick={() => basculerCanal(c.cle)}
                title={masque ? `Afficher ${c.label}` : `Masquer ${c.label}`}
                className={`flex items-center gap-1.5 text-[10px] font-semibold transition-opacity cursor-pointer ${
                  masque ? 'opacity-35' : 'opacity-100'
                }`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-sm shrink-0 border border-gray-300"
                  style={{ background: masque ? 'transparent' : c.couleur }}
                />
                <span className="text-gray-500">{c.label}</span>
                <span className="font-mono font-semibold text-gray-700 tabular-nums">
                  {fmtNb(totalParCanal[c.cle])}
                </span>
              </button>
            )
          })}
          {canauxMasques.length > 0 && (
            <button
              onClick={() => setCanauxMasques([])}
              className="text-[10px] text-gray-400 hover:text-gray-600 cursor-pointer ml-1"
            >
              Tout afficher
            </button>
          )}
        </div>
      )}

      <div className="p-5 select-none">
        {!hasData ? (
          <div className="flex items-center justify-center h-48 text-xs text-gray-400">
            Aucune relance envoyée sur la période
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={points} margin={{ top: 4, right: 48, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
              {/* Axe gauche — nb relances */}
              <YAxis
                yAxisId="left"
                tickFormatter={fmtNb}
                tick={{ fontSize: 10, fill: '#9ca3af' }}
                axisLine={false}
                tickLine={false}
                width={36}
                allowDecimals={false}
              />
              {/* Axe droit — montant */}
              <YAxis
                yAxisId="right"
                orientation="right"
                tickFormatter={fmtK}
                tick={{ fontSize: 10, fill: '#9ca3af' }}
                axisLine={false}
                tickLine={false}
                width={48}
              />
              <Tooltip content={<TooltipActivite />} cursor={{ fill: '#f9fafb' }} />
              {/* Pas de coins arrondis sur un empilement : avec des canaux
                  masquables, la barre du haut change, et l'arrondi se
                  retrouverait au milieu de la pile. */}
              {CANAUX.filter(c => !canauxMasques.includes(c.cle)).map(c => (
                <Bar
                  key={c.cle}
                  yAxisId="left"
                  dataKey={c.cle}
                  name={c.label}
                  stackId="canaux"
                  fill={c.couleur}
                  maxBarSize={36}
                />
              ))}
              <Line
                yAxisId="right"
                dataKey="montant"
                name="Montant relancé"
                stroke="#C07840"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: '#C07840' }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
