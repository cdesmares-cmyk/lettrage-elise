// Section Export — liste les blocs d'export disponibles
import { BlocExportLettrage } from './BlocExportLettrage'
import { BlocExportContacts } from './BlocExportContacts'

export function SectionExport() {
  return (
    <div>
      <p className="text-xs text-gray-400 mb-4">Sélectionnez une période et générez le fichier.</p>
      <div className="grid grid-cols-1 gap-4 max-w-2xl">
        <BlocExportLettrage />
        <BlocExportContacts />
      </div>
    </div>
  )
}
