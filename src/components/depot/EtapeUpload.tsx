// Étape 2 : dépôt du fichier par glisser-déposer ou sélection
import { useRef, useState } from 'react'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'
import type { TypeFichier } from '../../types/import'
import { CHAMPS_BANCAIRES, CHAMPS_FACTURES, CHAMPS_LETTRAGES, CHAMPS_CLIENTS } from '../../lib/champsImport'

interface Props {
  typeFichier: TypeFichier
  onFichierSelectionne: (fichier: File) => Promise<void>
  onRetour: () => void
  chargement: boolean
}

const ACCEPT_TOUS = '.csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const EXT_TOUS = ['.csv', '.xlsx', '.xls']

const CONFIG: Record<TypeFichier, { accept: string; extensions: string[]; label: string; nomModele: string; modeleXlsx: boolean }> = {
  csv_bancaire: {
    accept: ACCEPT_TOUS,
    extensions: EXT_TOUS,
    label: 'Relevé bancaire',
    nomModele: 'modele_releve_bancaire.csv',
    modeleXlsx: false,
  },
  xlsx_factures: {
    accept: ACCEPT_TOUS,
    extensions: EXT_TOUS,
    label: 'Factures',
    nomModele: 'modele_factures.xlsx',
    modeleXlsx: true,
  },
  import_lettrage: {
    accept: ACCEPT_TOUS,
    extensions: EXT_TOUS,
    label: 'Lettrage',
    nomModele: 'modele_lettrage.xlsx',
    modeleXlsx: true,
  },
  import_clients: {
    accept: ACCEPT_TOUS,
    extensions: EXT_TOUS,
    label: 'Comptes clients',
    nomModele: 'modele_comptes_clients.csv',
    modeleXlsx: false,
  },
}

// Exemples indicatifs par clé de champ
const EXEMPLES: Record<string, string> = {
  id_operation:           'OP-2024-00123',
  date_operation:         '15/03/2025',
  libelle:                'VIR SEPA CLIENT MARTIN',
  detail:                 'REF-CLIENT-456',
  infos_complementaires:  '',
  debit:                  '',
  credit:                 '1250,00',
  numero_piece:           'FAC-2025-0456',
  code_client:            'CLI-001',
  nom_client:             'SARL Martin',
  date_emission:          '01/03/2025',
  date_echeance:          '31/03/2025',
  montant_ht:             '1041,67',
  montant_ttc:            '1250,00',
  est_avoir:              'F',
  numero_facture:         'FAC-2025-0456',
  montant:                '1250,00',
  date_lettrage:          '15/03/2025',
  id_ligne_bancaire:      'OP-2024-00123',
  commentaire:            '',
  code_dso:               'CLI-001',
  nom:                    'SARL Martin',
  commercial:             'Jean Dupont',
  operateur:              'cdesmares',
  plateforme:             'Chorus',
  code_groupement:        'GRP-01',
}

const CHAMPS_PAR_TYPE = {
  csv_bancaire:    CHAMPS_BANCAIRES,
  xlsx_factures:   CHAMPS_FACTURES,
  import_lettrage: CHAMPS_LETTRAGES,
  import_clients:  CHAMPS_CLIENTS,
}

// Valeurs numériques réelles pour le template XLSX (stockées comme numbers, pas strings)
const EXEMPLES_XLSX_NOMBRES = new Set(['montant_ht', 'montant_ttc', 'credit', 'debit', 'montant'])

function telechargerModele(typeFichier: TypeFichier) {
  const config = CONFIG[typeFichier]
  const champs = CHAMPS_PAR_TYPE[typeFichier]
  const enTetes = champs.map(c => c.label)

  if (config.modeleXlsx) {
    // Template XLSX : nombres stockés en tant que nombres réels → zéro ambiguïté décimale
    const exemples = champs.map(c => {
      const raw = EXEMPLES[c.cle] ?? ''
      if (EXEMPLES_XLSX_NOMBRES.has(c.cle) && raw) {
        const n = parseFloat(raw.replace(',', '.'))
        return isNaN(n) ? raw : n
      }
      return raw
    })
    const ws = XLSX.utils.aoa_to_sheet([enTetes, exemples])
    // Largeur des colonnes
    ws['!cols'] = enTetes.map(() => ({ wch: 20 }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Factures')
    XLSX.writeFile(wb, config.nomModele)
  } else {
    // Template CSV pour les autres types
    const exemples = champs.map(c => EXEMPLES[c.cle] ?? '')
    const csv = [enTetes, exemples].map(row => row.map(v => `"${v}"`).join(';')).join('\r\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = config.nomModele
    a.click()
    URL.revokeObjectURL(url)
  }
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
              Formats acceptés : .csv · .xlsx · .xls · Taille max : 10 Mo
            </p>
          </>
        )}
      </div>

      <div className="flex justify-between items-center mt-5">
        <button
          onClick={onRetour}
          disabled={chargement}
          className="text-sm font-medium text-gray-500 hover:text-gray-800 disabled:opacity-40 px-4 py-2 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors"
        >
          ← Retour
        </button>
        <button
          onClick={() => telechargerModele(typeFichier)}
          className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 border border-blue-200 hover:border-blue-400 bg-blue-50 hover:bg-blue-100 px-3 py-2 rounded-lg transition-colors"
        >
          ⬇ Modèle {config.modeleXlsx ? 'XLSX' : 'CSV'}
        </button>
      </div>
    </div>
  )
}
