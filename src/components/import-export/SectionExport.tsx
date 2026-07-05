// Section Export — sélection du type d'export puis panneau de configuration
import { useState } from 'react'
import type { ReactNode } from 'react'
import { IcBarChart, IcContacts, IcDownload, IcUsers } from '../Icones'
import toast from 'react-hot-toast'
import { exporterLettrageXls } from '../../lib/exportLettrageXls'
import { supabase } from '../../lib/supabase'
import * as XLSX from 'xlsx'

async function fetchAll<T>(
  buildQuery: (from: number, to: number) => PromiseLike<{ data: unknown }>
): Promise<T[]> {
  const PAGE = 1000
  const acc: T[] = []
  let offset = 0
  while (true) {
    const { data } = await buildQuery(offset, offset + PAGE - 1)
    const rows = (data ?? []) as T[]
    acc.push(...rows)
    if (rows.length < PAGE) break
    offset += PAGE
  }
  return acc
}

type TypeExport = 'lettrage' | 'contacts' | 'clients'

const OPTIONS: {
  type: TypeExport
  icone: ReactNode
  titre: string
  description: string
  info: string
}[] = [
  {
    type: 'lettrage',
    icone: <IcBarChart size={26} />,
    titre: 'Lettrage',
    description: 'Fichier Excel multi-onglets : affectation, lignes bancaires, cadrage comptable.',
    info: 'Sélectionnez une plage de dates pour filtrer les lettrages à exporter.',
  },
  {
    type: 'contacts',
    icone: <IcContacts size={26} />,
    titre: 'Contacts',
    description: 'Tous les contacts actifs de votre organisation, prêts à être modifiés et ré-importés.',
    info: 'Export instantané — aucune période à sélectionner.',
  },
  {
    type: 'clients',
    icone: <IcUsers size={26} />,
    titre: 'Comptes clients',
    description: 'Tous les clients avec leurs paramètres (relance auto, commercial, plateforme…), prêts à être modifiés et ré-importés.',
    info: 'Export instantané — même format que l\'import clients.',
  },
]

function debutMoisCourant() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
}
function today() {
  return new Date().toISOString().split('T')[0]
}

interface RowClient {
  code_dso: string
  nom: string
  commercial: string | null
  operateur: string | null
  plateforme: string | null
  code_groupement: string | null
  siret: string | null
  relance_auto_active: boolean
}

function exporterClientsXlsx(clients: RowClient[]) {
  const lignes = clients.map(c => ({
    'Code client':         c.code_dso,
    'Nom':                 c.nom,
    'Commercial':          c.commercial ?? '',
    'Opérateur':           c.operateur ?? '',
    'Plateforme':          c.plateforme ?? '',
    'Code groupement':     c.code_groupement ?? '',
    'SIRET':               c.siret ?? '',
    'Relance automatique': c.relance_auto_active ? 'oui' : 'non',
  }))
  const ws = XLSX.utils.json_to_sheet(lignes)
  ws['!cols'] = [
    { wch: 16 }, { wch: 35 }, { wch: 20 }, { wch: 20 },
    { wch: 20 }, { wch: 18 }, { wch: 16 }, { wch: 20 },
  ]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Clients')
  XLSX.writeFile(wb, `clients_${new Date().toISOString().split('T')[0]}.xlsx`)
}

interface RowContact {
  id: string
  code_client: string
  nom: string
  prenom: string | null
  email: string
  telephone: string | null
  role_contact: string
}

function genererCSVContacts(contacts: RowContact[]): string {
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

export function SectionExport() {
  const [type, setType] = useState<TypeExport | null>(null)
  const [dateDebut, setDateDebut] = useState(debutMoisCourant)
  const [dateFin, setDateFin] = useState(today)
  const [chargement, setChargement] = useState(false)

  const optionSelectionnee = OPTIONS.find(o => o.type === type)

  async function handleExportLettrage() {
    if (!dateDebut || !dateFin) { toast.error('Veuillez sélectionner une période'); return }
    setChargement(true)
    try {
      await exporterLettrageXls(dateDebut, dateFin)
      toast.success('Export généré')
    } catch {
      toast.error('Erreur lors de l\'export')
    } finally {
      setChargement(false)
    }
  }

  async function handleExportClients() {
    setChargement(true)
    try {
      const clients = await fetchAll<RowClient>((from, to) =>
        supabase
          .from('clients')
          .select('code_dso, nom, commercial, operateur, plateforme, code_groupement, siret, relance_auto_active')
          .order('nom')
          .range(from, to)
      )
      if (clients.length === 0) {
        toast('Aucun client à exporter', { icon: 'ℹ️' })
        return
      }
      exporterClientsXlsx(clients)
      toast.success(`${clients.length} client${clients.length > 1 ? 's' : ''} exporté${clients.length > 1 ? 's' : ''}`)
    } catch {
      toast.error('Erreur lors de l\'export des clients')
    } finally {
      setChargement(false)
    }
  }

  async function handleExportContacts() {
    setChargement(true)
    try {
      const contacts = await fetchAll<RowContact>((from, to) =>
        supabase
          .from('contacts_client')
          .select('id, code_client, nom, prenom, email, telephone, role_contact')
          .eq('actif', true)
          .order('code_client')
          .order('nom')
          .range(from, to)
      )
      if (contacts.length === 0) {
        toast('Aucun contact actif à exporter', { icon: 'ℹ️' })
        return
      }
      const csv = genererCSVContacts(contacts)
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
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
      <div className="border-b border-gray-100 px-6 py-4">
        <h2 className="text-sm font-semibold text-gray-800">Choisir le type d'export</h2>
      </div>
      <div className="p-6">

        {/* Grille de sélection — même pattern que EtapeType */}
        <div className="grid grid-cols-2 gap-4 mb-5">
          {OPTIONS.map(opt => (
            <button
              key={opt.type}
              onClick={() => setType(opt.type)}
              className={`relative text-left border-2 rounded-xl p-5 transition-all ${
                type === opt.type
                  ? 'border-ockham-teal bg-ockham-teal-muted'
                  : 'border-gray-200 bg-white hover:border-ockham-teal/40 hover:bg-ockham-teal-muted/30'
              }`}
            >
              {type === opt.type && (
                <span className="absolute top-3 right-3 flex h-5 w-5 items-center justify-center rounded-full bg-ockham-teal text-white text-[10px] font-bold">
                  ✓
                </span>
              )}
              <div className="mb-3 text-gray-500">{opt.icone}</div>
              <p className="font-semibold text-sm text-gray-900 mb-1">{opt.titre}</p>
              <p className="text-xs text-gray-500 leading-relaxed">{opt.description}</p>
            </button>
          ))}
        </div>

        {/* Bandeau info type sélectionné */}
        <div className="flex gap-3 bg-ockham-teal-muted border border-ockham-teal/40 rounded-lg px-4 py-3 mb-6 text-sm text-ockham-teal-dark">
          <span className="text-base flex-shrink-0">💡</span>
          <span>
            {optionSelectionnee
              ? optionSelectionnee.info
              : 'Sélectionnez un type pour voir les options disponibles.'}
          </span>
        </div>

        {/* Panneau de configuration — affiché une fois le type choisi */}
        {type === 'lettrage' && (
          <div className="border border-gray-200 rounded-xl p-5">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Plage de dates</p>
            <div className="flex items-end gap-3 flex-wrap">
              <div>
                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-1">Du</label>
                <input
                  type="date"
                  value={dateDebut}
                  onChange={e => setDateDebut(e.target.value)}
                  className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-ockham-teal bg-white transition-colors"
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-1">Au</label>
                <input
                  type="date"
                  value={dateFin}
                  onChange={e => setDateFin(e.target.value)}
                  className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-ockham-teal bg-white transition-colors"
                />
              </div>
              <button
                onClick={handleExportLettrage}
                disabled={chargement || !dateDebut || !dateFin}
                className="flex items-center gap-2 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 px-4 py-2 rounded-lg transition-colors disabled:opacity-40 whitespace-nowrap"
              >
                {chargement ? '⟳ Export…' : <><IcDownload size={13} className="inline-block mr-1.5" />Exporter .xlsx</>}
              </button>
            </div>
            <div className="border-t border-gray-100 pt-3 mt-4 grid grid-cols-2 gap-3 text-[11px] text-gray-500">
              <div>
                <p className="font-semibold text-gray-600 mb-1">Onglet Affectation</p>
                <p>Date · Ligne bancaire · Code client</p>
                <p>N° Facture · Montant · Commentaire · Opérateur</p>
              </div>
              <div>
                <p className="font-semibold text-gray-600 mb-1">Onglet Lignes bancaires</p>
                <p>Date · Libellé · Débit · Crédit</p>
                <p>Type (Facture / Autres) · Commentaire</p>
              </div>
              <div className="col-span-2">
                <p className="font-semibold text-gray-600 mb-1">Onglet Cadrage</p>
                <p>Par jour : Total Crédit reçu · Total Lettré (hors Autres) — écart visible pour l'expert-comptable</p>
              </div>
            </div>
          </div>
        )}

        {type === 'clients' && (
          <div className="border border-gray-200 rounded-xl p-5">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="text-[11px] text-gray-500">
                <p className="font-semibold text-gray-600 mb-1">Colonnes exportées</p>
                <p>code_dso · nom · commercial · opérateur · plateforme · code_groupement · siret · relance_auto_active</p>
                <p className="mt-1 text-gray-400">
                  La colonne <span className="font-mono">Relance automatique</span> est exportée en <span className="font-mono">oui</span> / <span className="font-mono">non</span> — modifiable et ré-importable directement.
                </p>
              </div>
              <button
                onClick={handleExportClients}
                disabled={chargement}
                className="flex items-center gap-2 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 px-4 py-2 rounded-lg transition-colors disabled:opacity-40 whitespace-nowrap self-end"
              >
                {chargement ? '⟳ Export…' : <><IcDownload size={13} className="inline-block mr-1.5" />Exporter .xlsx</>}
              </button>
            </div>
          </div>
        )}

        {type === 'contacts' && (
          <div className="border border-gray-200 rounded-xl p-5">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="text-[11px] text-gray-500">
                <p className="font-semibold text-gray-600 mb-1">Colonnes exportées</p>
                <p>id_contact · code_client · nom · prénom · email · téléphone · rôle · delete</p>
                <p className="mt-1 text-gray-400">
                  La colonne <span className="font-mono">delete</span> est vide à l'export — indiquez <span className="font-mono">delete</span> pour désactiver un contact lors du ré-import.
                </p>
              </div>
              <button
                onClick={handleExportContacts}
                disabled={chargement}
                className="flex items-center gap-2 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 px-4 py-2 rounded-lg transition-colors disabled:opacity-40 whitespace-nowrap self-end"
              >
                {chargement ? '⟳ Export…' : <><IcDownload size={13} className="inline-block mr-1.5" />Exporter .csv</>}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
