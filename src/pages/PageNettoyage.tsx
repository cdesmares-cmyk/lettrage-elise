// Module Nettoyage — contacts.
//
// Un écran de chantier, pas un tableau de bord : on l'ouvre pour corriger, et
// il doit se vider. Trois règles tenues ici :
//   1. Une ligne qui n'appelle pas un geste n'y figure pas.
//   2. Le tri est l'encours, jamais le nom ni la date.
//   3. L'écran diagnostique, il n'édite pas — le clic ouvre le compte client.
import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import toast from 'react-hot-toast'
import { useNettoyage, type ClientInjoignable, type ContactAProbleme } from '../hooks/useNettoyage'
import { Pagination } from '../components/Pagination'
import { IcContacts, IcDownload, IcLoader } from '../components/Icones'

// Même pagination que le tableau des comptes clients : 25 par page.
const PAGE_SIZE = 25

function euros(n: number) {
  return n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
}

function Kpi({ valeur, libelle, couleur }: { valeur: string; libelle: string; couleur?: string }) {
  return (
    <div>
      <div className="text-[26px] font-extrabold tracking-tight tabular-nums leading-none" style={couleur ? { color: couleur } : undefined}>
        {valeur}
      </div>
      <p className="text-[10.5px] text-gray-400 font-medium leading-snug mt-2">{libelle}</p>
    </div>
  )
}

function Pastille({ ton, children }: { ton: 'rouge' | 'gris'; children: React.ReactNode }) {
  const cls = ton === 'rouge' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'
  return <span className={`text-[10.5px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${cls}`}>{children}</span>
}

export function PageNettoyage() {
  const navigate = useNavigate()
  const { clients, contacts, chargement, erreur, encoursInjoignable, nbContactsActifs } = useNettoyage()
  const [onglet, setOnglet] = useState<'clients' | 'contacts'>('clients')
  const [page, setPage] = useState(0)

  const liste = onglet === 'clients' ? clients : contacts
  const nbPages = Math.ceil(liste.length / PAGE_SIZE)
  const visibles = useMemo(
    () => liste.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [liste, page]
  )

  // Le clic ouvre le compte client sur l'onglet Contacts. Le point d'entrée
  // existe déjà : PageCompteClient lit ?client= et ?onglet=.
  function ouvrirClient(codeDso: string) {
    navigate(`/compte-client?client=${encodeURIComponent(codeDso)}&onglet=contacts`)
  }

  // L'export reprend exactement la forme que l'import de contacts avale
  // (voir CHAMPS_CONTACTS), plus une colonne encours : sans elle on exporte
  // des milliers de lignes sans savoir lesquelles valent l'effort. Les colonnes
  // que l'import ne connaît pas sont ignorées — c'est déjà le cas de
  // nom_client dans l'export « Clients sans contact ».
  function exporter() {
    if (!liste.length) { toast('Rien à exporter', { icon: 'ℹ️' }); return }
    const lignes = onglet === 'clients'
      ? (liste as ClientInjoignable[]).map(c => ({
          id_contact: '', code_client: c.code_dso, nom_client: c.nom,
          encours: Math.round(c.encours * 100) / 100,
          nom: '', prenom: '', email: '', telephone: '', role_contact: '', delete: '',
        }))
      : (liste as ContactAProbleme[]).map(c => ({
          id_contact: c.id, code_client: c.code_client, nom_client: c.nom_client,
          encours: Math.round(c.encours_client * 100) / 100,
          nom: c.identite, prenom: '', email: c.email, telephone: '',
          role_contact: c.role_contact, delete: '',
        }))
    const ws = XLSX.utils.json_to_sheet(lignes)
    ws['!cols'] = [{ wch: 38 }, { wch: 16 }, { wch: 30 }, { wch: 12 }, { wch: 24 }, { wch: 18 }, { wch: 30 }, { wch: 16 }, { wch: 20 }, { wch: 8 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Nettoyage')
    XLSX.writeFile(wb, `nettoyage_${onglet}_${new Date().toISOString().split('T')[0]}.xlsx`)
    toast.success(`${lignes.length} ligne${lignes.length > 1 ? 's' : ''} exportée${lignes.length > 1 ? 's' : ''}`)
  }

  const TH = 'text-[10px] font-bold uppercase tracking-wider text-gray-400 px-4 py-2.5 text-left whitespace-nowrap'
  const TD = 'px-4 py-3 border-b border-slate-50'

  return (
    <div className="px-6 py-6 max-w-[1200px] mx-auto">

      <div className="flex items-end justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Nettoyage</h1>
          <p className="text-sm text-gray-400 mt-1">
            Contacts — qui je ne peux pas atteindre, et ce que ça représente.
          </p>
        </div>
        <button
          onClick={exporter}
          disabled={chargement || !liste.length}
          className="inline-flex items-center gap-2 border border-gray-200 text-gray-600 rounded-lg px-4 py-2.5 text-sm hover:bg-gray-50 disabled:opacity-40 transition-colors"
        >
          <IcDownload size={14} /> Exporter la liste
        </button>
      </div>

      {erreur && (
        <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-lg px-3.5 py-3 mb-5">
          <span className="text-red-400">⚠</span>
          <p className="text-sm text-red-700">{erreur}</p>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-5">
        <div className="grid grid-cols-3 gap-7">
          <div className="border-r border-gray-100 pr-7">
            <Kpi valeur={chargement ? '—' : euros(encoursInjoignable)} couleur="#B91C1C"
                 libelle="Encours derrière des clients sans aucun contact" />
          </div>
          <div className="border-r border-gray-100 pr-7">
            <Kpi valeur={chargement ? '—' : String(clients.length)}
                 libelle="Clients avec un encours et aucune adresse" />
          </div>
          <Kpi valeur={chargement ? '—' : String(contacts.length)}
               libelle="Contacts à ranger ou à corriger" />
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">

        <div className="flex items-center justify-between border-b border-gray-100 px-2">
          <div className="flex">
            {([
              ['clients',  'Clients',  clients.length],
              ['contacts', 'Contacts', contacts.length],
            ] as const).map(([val, label, n]) => (
              <button
                key={val}
                // Remise a la page 1 ici plutot que dans un effet : meme motif
                // que le tableau des comptes clients.
                onClick={() => { setOnglet(val); setPage(0) }}
                className={`px-4 py-3 text-xs font-bold border-b-2 transition-colors ${
                  onglet === val
                    ? 'text-ockham-teal-dark border-ockham-teal'
                    : 'text-gray-400 border-transparent hover:text-gray-600'
                }`}
              >
                {label} <span className="font-medium opacity-50 tabular-nums">{chargement ? '' : n}</span>
              </button>
            ))}
          </div>
          <span className="pr-4 text-[11px] text-gray-400 font-medium">
            Triés par encours décroissant
          </span>
        </div>

        {chargement ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-gray-400">
            <IcLoader size={14} /> Chargement…
          </div>
        ) : !liste.length ? (
          <div className="py-14 px-6 text-center">
            <IcContacts size={26} className="text-gray-200 mx-auto mb-3" />
            <p className="text-sm text-gray-500 font-medium">Rien à nettoyer ici. C'est le bon résultat.</p>
            {/* Une liste vide doit dire pourquoi elle est vide, sinon on ne sait
                pas distinguer « tout va bien » de « l'écran est cassé ». */}
            <p className="text-[11.5px] text-gray-400 mt-2.5 max-w-xl mx-auto leading-relaxed">
              {onglet === 'clients'
                ? <>Chaque client qui a un encours a au moins une adresse active. Il n'y a personne à qui on ne puisse pas écrire.</>
                : <>Sur {nbContactsActifs} contacts actifs, aucun n'a de rôle inconnu et aucun rebond n'est signalé. Les rôles « Relance » et « Comptabilité », quelle que soit leur orthographe, sont reconnus — ils n'apparaissent donc pas ici.</>}
            </p>
          </div>
        ) : onglet === 'clients' ? (
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50/60 border-b border-gray-100">
                <th className={TH}>Client</th>
                <th className={`${TH} text-right`}>Encours</th>
                <th className={`${TH} text-right`}>Pièces</th>
                <th className={TH}>Problème</th>
                <th className={TH} />
              </tr>
            </thead>
            <tbody>
              {(visibles as ClientInjoignable[]).map(c => (
                <tr key={c.code_dso} onClick={() => ouvrirClient(c.code_dso)}
                    className="cursor-pointer hover:bg-ockham-teal-muted transition-colors">
                  <td className={TD}>
                    <div className="text-sm font-semibold text-gray-800">{c.nom}</div>
                    <div className="text-[11px] text-gray-400 tabular-nums">{c.code_dso}</div>
                  </td>
                  <td className={`${TD} text-right text-sm font-bold tabular-nums text-gray-800`}>{euros(c.encours)}</td>
                  <td className={`${TD} text-right text-xs tabular-nums text-gray-400`}>{c.nb_impayees}</td>
                  <td className={TD}><Pastille ton="rouge">Aucun contact</Pastille></td>
                  <td className={`${TD} text-right text-gray-300`}>›</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50/60 border-b border-gray-100">
                <th className={TH}>Contact</th>
                <th className={TH}>Client</th>
                <th className={`${TH} text-right`}>Encours client</th>
                <th className={TH}>Problème</th>
                <th className={TH} />
              </tr>
            </thead>
            <tbody>
              {(visibles as ContactAProbleme[]).map(c => (
                <tr key={c.id} onClick={() => ouvrirClient(c.code_client)}
                    className="cursor-pointer hover:bg-ockham-teal-muted transition-colors">
                  <td className={TD}>
                    <div className="text-sm font-semibold text-gray-800">{c.email || '— pas d\'adresse —'}</div>
                    <div className="text-[11px] text-gray-400">
                      {c.identite} · <span className="font-semibold text-ockham-copper">{c.role_contact || '—'}</span>
                    </div>
                  </td>
                  <td className={`${TD} text-xs text-gray-500`}>{c.nom_client}</td>
                  <td className={`${TD} text-right text-sm font-bold tabular-nums text-gray-800`}>{euros(c.encours_client)}</td>
                  <td className={TD}>
                    <Pastille ton={c.probleme === 'rebond' ? 'rouge' : 'gris'}>{c.detail}</Pastille>
                  </td>
                  <td className={`${TD} text-right text-gray-300`}>›</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {!chargement && liste.length > 0 && (
          <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/40 flex items-center justify-between">
            <span className="text-[11px] text-gray-400 tabular-nums">
              {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, liste.length)} sur {liste.length}
            </span>
            <Pagination page={page} total={nbPages} onChange={setPage} />
          </div>
        )}
      </div>

      <p className="text-[11px] text-gray-400 mt-4 leading-relaxed max-w-3xl">
        Cet écran ne modifie rien. Un clic ouvre le compte client sur l'onglet Contacts, là où
        la correction se fait. Pour traiter en masse, exportez la liste : le fichier a la forme
        que l'import de contacts attend, colonne <span className="font-mono">encours</span> en plus
        pour trier dans le tableur.
      </p>
    </div>
  )
}
