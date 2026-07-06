// Section Export — sélection du type d'export puis panneau de configuration
import { useState } from 'react'
import type { ReactNode } from 'react'
import { IcBarChart, IcContacts, IcDownload, IcInfo, IcUsers } from '../Icones'
import toast from 'react-hot-toast'
import { exporterLettrageXls } from '../../lib/exportLettrageXls'
import { exporterRelancesAutoXls, type LigneRelanceAuto } from '../../lib/exportXls'
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

type TypeExport = 'lettrage' | 'contacts' | 'clients' | 'relances'

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
  {
    type: 'relances',
    icone: <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>,
    titre: 'Relances client',
    description: 'Historique de toutes les relances envoyées (automatiques et manuelles) : date, client, montant, email, statut.',
    info: 'Sélectionnez une plage de dates pour filtrer les relances à exporter.',
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

  async function handleExportRelances() {
    setChargement(true)
    try {
      interface RowLog { id: string; resend_id: string | null; envoye_le: string; code_client: string; contact_email: string | null; montant_total: number | null; statut: string }
      interface RowManuelle { id: string; code_client: string; envoyee_le: string; note: string | null; note_operateur: string | null; contacts_ids: string[] | null; factures_ids: string[] | null }
      interface RowClientNom { code_dso: string; nom: string }
      interface RowContact { id: string; email: string }

      const [{ data: logsRaw }, { data: manuellesRaw }, { data: clientsRaw }] = await Promise.all([
        supabase.from('relances_auto_log').select('id, resend_id, envoye_le, code_client, contact_email, montant_total, statut').gte('envoye_le', dateDebut).lte('envoye_le', dateFin + 'T23:59:59').order('envoye_le', { ascending: false }).limit(2000),
        supabase.from('relances').select('id, code_client, envoyee_le, note, note_operateur, contacts_ids, factures_ids').not('envoyee_le', 'is', null).gte('envoyee_le', dateDebut).lte('envoyee_le', dateFin + 'T23:59:59').order('envoyee_le', { ascending: false }).limit(1000),
        supabase.from('clients').select('code_dso, nom'),
      ])
      const logs = (logsRaw ?? []) as RowLog[]
      const manuelles = (manuellesRaw ?? []) as RowManuelle[]
      const clientsData = (clientsRaw ?? []) as RowClientNom[]

      if (!logs.length && !manuelles.length) { toast('Aucune relance à exporter', { icon: 'ℹ️' }); return }

      // Batch contacts pour relances manuelles
      const allContactIds = [...new Set(manuelles.flatMap(r => r.contacts_ids ?? []))]
      let contactEmailMap: Record<string, string> = {}
      if (allContactIds.length > 0) {
        const { data: contactsRaw } = await supabase.from('contacts_client').select('id, email').in('id', allContactIds)
        for (const c of (contactsRaw ?? []) as RowContact[]) contactEmailMap[c.id] = c.email
      }

      const nomParCode: Record<string, string> = {}
      for (const c of clientsData) nomParCode[c.code_dso] = c.nom

      // Lignes auto — groupées par resend_id
      const groupes: Record<string, RowLog[]> = {}
      for (const row of logs) {
        const key = row.resend_id ?? row.id
        if (!groupes[key]) groupes[key] = []
        groupes[key]!.push(row)
      }
      const lignesAuto: LigneRelanceAuto[] = Object.values(groupes).map(rows => {
        const first = rows[0]!
        const statut = rows.some(r => r.statut === 'bounce') ? 'Contact' : rows.some(r => r.statut === 'erreur') ? 'Erreur' : 'Envoyé'
        return { date: first.envoye_le, type: 'Auto' as const, code_client: first.code_client, nom_client: nomParCode[first.code_client] ?? '', montant_total: first.montant_total, emails: first.contact_email ?? '', statut, commentaire: '', nb_factures: rows.length }
      })

      // Lignes manuelles
      const lignesManuelles: LigneRelanceAuto[] = manuelles.map(r => ({
        date: r.envoyee_le,
        type: 'Manuelle' as const,
        code_client: r.code_client,
        nom_client: nomParCode[r.code_client] ?? '',
        montant_total: null,
        emails: (r.contacts_ids ?? []).map(id => contactEmailMap[id] ?? '').filter(Boolean).join('; '),
        statut: 'Envoyée',
        commentaire: r.note ?? r.note_operateur ?? '',
        nb_factures: r.factures_ids?.length ?? 0,
      }))

      const lignes = [...lignesAuto, ...lignesManuelles].sort((a, b) => b.date.localeCompare(a.date))
      exporterRelancesAutoXls(lignes)
      toast.success(`${lignes.length} relance${lignes.length > 1 ? 's' : ''} exportée${lignes.length > 1 ? 's' : ''}`)
    } catch {
      toast.error('Erreur lors de l\'export des relances')
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
          <IcInfo size={15} className="flex-shrink-0 mt-0.5 text-ockham-teal" />
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

        {type === 'relances' && (
          <div className="border border-gray-200 rounded-xl p-5">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Plage de dates</p>
            <div className="flex items-end gap-3 flex-wrap">
              <div>
                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-1">Du</label>
                <input type="date" value={dateDebut} onChange={e => setDateDebut(e.target.value)}
                  className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-ockham-teal bg-white transition-colors" />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-1">Au</label>
                <input type="date" value={dateFin} onChange={e => setDateFin(e.target.value)}
                  className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-ockham-teal bg-white transition-colors" />
              </div>
              <button onClick={handleExportRelances} disabled={chargement || !dateDebut || !dateFin}
                className="flex items-center gap-2 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 px-4 py-2 rounded-lg transition-colors disabled:opacity-40 whitespace-nowrap">
                {chargement ? '⟳ Export…' : <><IcDownload size={13} className="inline-block mr-1.5" />Exporter .xlsx</>}
              </button>
            </div>
            <div className="border-t border-gray-100 pt-3 mt-4 text-[11px] text-gray-500">
              <p className="font-semibold text-gray-600 mb-1">Colonnes exportées</p>
              <p>Date · Type (Auto / Manuelle) · Code client · Nom client · Montant · Email(s) contact · Statut · Commentaire · Nb factures</p>
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
