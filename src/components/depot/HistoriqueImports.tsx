// Widget historique des imports récents
import { useEffect, useState } from 'react'
import { IcClock, IcBarChart } from '../Icones'
import { supabase } from '../../lib/supabase'

interface LigneHistorique {
  id: string
  type: 'csv_bancaire' | 'xlsx_factures'
  nom_fichier: string | null
  nb_lignes_inserees: number | null
  nb_lignes_doublons: number | null
  cree_le: string
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export function HistoriqueImports({ rafraichir }: { rafraichir: number }) {
  const [imports, setImports] = useState<LigneHistorique[]>([])
  const [chargement, setChargement] = useState(true)

  useEffect(() => {
    async function charger() {
      setChargement(true)
      const { data } = await supabase
        .from('imports')
        .select('id, type, nom_fichier, nb_lignes_inserees, nb_lignes_doublons, cree_le')
        .order('cree_le', { ascending: false })
        .limit(8)
      setImports((data as LigneHistorique[]) ?? [])
      setChargement(false)
    }
    charger()
  }, [rafraichir])

  if (chargement) {
    return (
      <div className="py-6 text-center text-sm text-gray-400">Chargement de l'historique…</div>
    )
  }

  if (imports.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-gray-400">
        <div className="text-2xl mb-2">📂</div>
        Aucun import effectué pour le moment.
      </div>
    )
  }

  return (
    <div className="divide-y divide-gray-100">
      {imports.map(imp => (
        <div key={imp.id} className="flex items-center gap-3 px-1 py-3 hover:bg-gray-50 rounded-lg transition-colors">
          <div className="flex-shrink-0 text-gray-400">
            {imp.type === 'csv_bancaire' ? <IcClock size={18} /> : <IcBarChart size={18} />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-gray-800 truncate">
                {imp.nom_fichier ?? 'Fichier sans nom'}
              </span>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                imp.type === 'csv_bancaire'
                  ? 'bg-sky-100 text-sky-700'
                  : 'bg-emerald-100 text-emerald-700'
              }`}>
                {imp.type === 'csv_bancaire' ? 'CSV' : 'XLSX'}
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">{formatDate(imp.cree_le)}</p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-sm font-semibold text-gray-800">
              {(imp.nb_lignes_inserees ?? 0).toLocaleString('fr-FR')}
            </p>
            <p className="text-[10px] text-gray-400">
              lignes
              {(imp.nb_lignes_doublons ?? 0) > 0 && (
                <span className="text-amber-500"> · {imp.nb_lignes_doublons} doublons</span>
              )}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}
