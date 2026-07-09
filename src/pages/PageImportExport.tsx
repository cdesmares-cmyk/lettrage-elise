// Onglet Import / Export — regroupe le dépôt de fichiers (Import) et les exports comptables (Export)
import { useState } from 'react'
import { IcUpload, IcDownload } from '../components/Icones'
import { PageDepot } from './PageDepot'
import { SectionExport } from '../components/import-export/SectionExport'

type Vue = 'import' | 'export'

export function PageImportExport() {
  const [vue, setVue] = useState<Vue>('import')

  return (
    <div>
      {/* En-tête avec toggle Import / Export */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">Import / Export</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {vue === 'import'
              ? 'Importez vos relevés bancaires et fichiers de facturation'
              : 'Exportez vos données comptables'}
          </p>
        </div>
        <div className="flex items-center bg-gray-100 rounded-lg p-1 gap-0.5">
          <button
            onClick={() => setVue('import')}
            className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-colors ${
              vue === 'import' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <IcUpload size={13} className="inline-block mr-1.5" /> Import
          </button>
          <button
            onClick={() => setVue('export')}
            className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-colors ${
              vue === 'export' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <IcDownload size={13} className="inline-block mr-1.5" /> Export
          </button>
        </div>
      </div>

      {vue === 'import' && <PageDepot hideEnTete />}

      {vue === 'export' && <SectionExport />}
    </div>
  )
}
