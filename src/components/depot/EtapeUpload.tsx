// Étape 2 : dépôt du fichier par glisser-déposer ou sélection
import { useRef, useState } from 'react'
import toast from 'react-hot-toast'
import type { TypeFichier } from '../../types/import'

interface Props {
  typeFichier: TypeFichier
  onFichierSelectionne: (fichier: File) => Promise<void>
  onRetour: () => void
  chargement: boolean
}

const CONFIG: Record<TypeFichier, { accept: string; extensions: string[]; label: string }> = {
  csv_bancaire: {
    accept: '.csv,text/csv',
    extensions: ['.csv'],
    label: 'Relevé bancaire CSV',
  },
  xlsx_factures: {
    accept: '.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    extensions: ['.xlsx', '.xls'],
    label: 'Factures XLSX',
  },
  import_lettrage: {
    accept: '.csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    extensions: ['.csv', '.xlsx', '.xls'],
    label: 'Lettrage CSV ou XLSX',
  },
  import_groupements: {
    accept: '.csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    extensions: ['.csv', '.xlsx', '.xls'],
    label: 'Groupements clients CSV ou XLSX',
  },
}

export function EtapeUpload({ typeFichier, onFichierSelectionne, onRetour, chargement }: Props) {
  const [survol, setSurvol] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const config = CONFIG[typeFichier]

  function valider(fichier: File): boolean {
    const ext = '.' + (fichier.name.split('.').pop() ?? '').toLowerCase()
    if (!config.extensions.includes(ext)) {
      toast.error(`Format invalide. Formats acceptés : ${config.extensions.join(', ')}`)
      return false
    }
    if (fichier.size > 10 * 1024 * 1024) {
      toast.error('Fichier trop volumineux (max 10 Mo).')
      return false
    }
    return true
  }

  async function gererFichier(fichier: File) {
    if (!valider(fichier)) return
    await onFichierSelectionne(fichier)
  }

  function gererDrop(e: React.DragEvent) {
    e.preventDefault()
    setSurvol(false)
    const fichier = e.dataTransfer.files[0]
    if (fichier) gererFichier(fichier)
  }

  function gererInput(e: React.ChangeEvent<HTMLInputElement>) {
    const fichier = e.target.files?.[0]
    if (fichier) gererFichier(fichier)
    e.target.value = ''
  }

  return (
    <div>
      <div
        onDragOver={e => { e.preventDefault(); setSurvol(true) }}
        onDragLeave={() => setSurvol(false)}
        onDrop={gererDrop}
        onClick={() => !chargement && inputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-12 text-center transition-all cursor-pointer select-none ${
          chargement
            ? 'border-blue-300 bg-blue-50 cursor-wait'
            : survol
              ? 'border-blue-500 bg-blue-50'
              : 'border-gray-200 hover:border-blue-400 hover:bg-blue-50/40'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={config.accept}
          onChange={gererInput}
          className="hidden"
          disabled={chargement}
        />

        {chargement ? (
          <>
            <div className="text-3xl mb-3 animate-pulse">⏳</div>
            <p className="font-semibold text-gray-700 text-sm">Analyse du fichier en cours…</p>
            <p className="text-gray-400 text-xs mt-1">Détection des colonnes et calcul du hash</p>
          </>
        ) : (
          <>
            <div className="text-3xl mb-3">📄</div>
            <p className="font-semibold text-gray-800 text-sm mb-1">
              Glissez votre fichier {config.label} ici
            </p>
            <p className="text-gray-500 text-sm">
              ou <span className="text-blue-600 font-semibold">parcourir vos fichiers</span>
            </p>
            <p className="text-gray-400 text-[11px] font-mono mt-3">
              Formats acceptés : {config.extensions.join(' · ')} · Taille max : 10 Mo
            </p>
          </>
        )}
      </div>

      <div className="flex justify-between mt-5">
        <button
          onClick={onRetour}
          disabled={chargement}
          className="text-sm font-medium text-gray-500 hover:text-gray-800 disabled:opacity-40 px-4 py-2 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors"
        >
          ← Retour
        </button>
      </div>
    </div>
  )
}
