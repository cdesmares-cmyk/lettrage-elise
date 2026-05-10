import type { LigneHistorique } from '../../hooks/useHistoriqueLettrage'

interface Props {
  lignes: LigneHistorique[]
  chargement: boolean
}

function fmt(n: number) {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}
function fmtDateHeure(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })
    + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

export function TableHistoriqueLettrage({ lignes, chargement }: Props) {
  if (chargement) {
    return <div className="py-10 text-center text-sm text-gray-400">Chargement…</div>
  }
  if (!lignes.length) {
    return <div className="py-10 text-center text-sm text-gray-400">Aucune action de lettrage enregistrée.</div>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-100">
            <th className="text-left px-3 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">Date · Heure</th>
            <th className="text-left px-3 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Ligne bancaire</th>
            <th className="text-left px-3 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Code client</th>
            <th className="text-left px-3 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">N° Facture</th>
            <th className="text-right px-3 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Montant</th>
            <th className="text-left px-3 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Opérateur</th>
          </tr>
        </thead>
        <tbody>
          {lignes.map(l => {
            const isCorrection = !l.id_ligne_bancaire
            const isNegatif = l.montant < 0
            return (
              <tr key={l.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap font-mono text-[11px]">
                  {fmtDateHeure(l.created_at)}
                </td>
                <td className="px-3 py-2.5 max-w-[220px]">
                  {isCorrection ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-700">
                      ✏️ Correction
                    </span>
                  ) : (
                    <div>
                      <p className="truncate text-gray-700 font-medium">{l.libelle_bancaire ?? '—'}</p>
                      <p className="font-mono text-[10px] text-gray-400">{l.id_ligne_bancaire}</p>
                    </div>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <span className="font-mono text-[11px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                    {l.code_client}
                  </span>
                </td>
                <td className="px-3 py-2.5 font-mono text-blue-700 font-semibold">{l.numero_facture}</td>
                <td className="px-3 py-2.5 text-right font-mono font-bold tabular-nums">
                  <span className={isNegatif ? 'text-red-600' : 'text-emerald-600'}>
                    {l.montant >= 0 ? '+' : ''}{fmt(l.montant)}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-gray-500 text-[11px] max-w-[160px] truncate">
                  {l.operateur ?? <span className="text-gray-300">—</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
