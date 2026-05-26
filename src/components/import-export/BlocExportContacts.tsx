// Bloc Export Contacts — télécharge tous les contacts actifs en CSV (prêt pour ré-import)
import { useState } from 'react'
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabase'

interface RowContact {
  id: string
  code_client: string
  nom: string
  prenom: string | null
  email: string
  telephone: string | null
  role_contact: string
}

function genererCSV(contacts: RowContact[]): string {
  const entete = ['id_contact', 'code_client', 'nom', 'prenom', 'email', 'telephone', 'role_contact', 'delete']
  const echapper = (v: string | null | undefined) => {
    const s = v ?? ''
    if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`
    return s
  }
  const lignes = contacts.map(c => [
    echapper(c.id),
    echapper(c.code_client),
    echapper(c.nom),
    echapper(c.prenom),
    echapper(c.email),
    echapper(c.telephone),
    echapper(c.role_contact),
    '',
  ].join(','))
  return [entete.join(','), ...lignes].join('\n')
}

export function BlocExportContacts() {
  const [chargement, setChargement] = useState(false)

  async function handleExport() {
    setChargement(true)
    try {
      const { data, error } = await supabase
        .from('contacts_client')
        .select('id, code_client, nom, prenom, email, telephone, role_contact')
        .eq('actif', true)
        .order('code_client')
        .order('nom')
      if (error) throw error

      const contacts = (data ?? []) as RowContact[]
      if (contacts.length === 0) {
        toast('Aucun contact actif à exporter', { icon: 'ℹ️' })
        return
      }

      const csv = genererCSV(contacts)
      const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `contacts_${new Date().toISOString().split('T')[0]}.csv`
      a.click()
      URL.revokeObjectURL(url)
      toast.success(`${contacts.length} contact${contacts.length > 1 ? 's' : ''} exporté${contacts.length > 1 ? 's' : ''}`)
    } catch {
      toast.error('Erreur lors de l\'export des contacts')
    } finally {
      setChargement(false)
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 flex flex-col gap-4">
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-lg bg-ockham-teal-muted flex items-center justify-center text-ockham-teal text-xl flex-shrink-0">
          📇
        </div>
        <div>
          <h3 className="text-sm font-bold text-gray-900">Export Contacts</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Fichier CSV de tous les contacts actifs — modifiable et ré-importable directement.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleExport}
          disabled={chargement}
          className="flex items-center gap-2 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 px-4 py-2 rounded-lg transition-colors disabled:opacity-40 whitespace-nowrap"
        >
          {chargement ? '⟳ Export…' : '⬇ Exporter .csv'}
        </button>
      </div>

      <div className="border-t border-gray-100 pt-3 text-[11px] text-gray-500">
        <p className="font-semibold text-gray-600 mb-1">Colonnes exportées</p>
        <p>id_contact · code_client · nom · prénom · email · téléphone · rôle · delete</p>
        <p className="mt-1 text-gray-400">La colonne <span className="font-mono">delete</span> est vide à l'export — indiquez <span className="font-mono">delete</span> pour désactiver un contact lors du ré-import.</p>
      </div>
    </div>
  )
}
