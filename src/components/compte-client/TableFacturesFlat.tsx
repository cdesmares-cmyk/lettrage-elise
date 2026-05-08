// Vue factures : liste plate de toutes les factures (toutes les colonnes)
import { useEffect } from 'react'
import type { CompteClient, FactureDetail, StatutFacture } from '../../types/client'
import { LignesFactures } from './LignesFactures'

interface Props {
  clients: CompteClient[]
  getFactures: (codes: string[]) => FactureDetail[]
  estChargement: (codes: string[]) => boolean
  onExpand: (codes: string[]) => void
  onStatutChange: (numero: string, statut: StatutFacture | null) => void
  onHistorique: (fac: FactureDetail) => void
}

export function TableFacturesFlat({ clients, getFactures, estChargement, onExpand, onStatutChange, onHistorique }: Props) {
  const codes = clients.map(c => c.code_dso)

  useEffect(() => {
    if (codes.length > 0) onExpand(codes)
  }, [clients.map(c => c.code_dso).join(',')])

  const factures = getFactures(codes)
  const chargement = estChargement(codes)

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <LignesFactures
        factures={factures}
        chargement={chargement}
        onStatutChange={onStatutChange}
        onHistorique={onHistorique}
      />
    </div>
  )
}
