// Onglet 1 — Dépôt : import des fichiers CSV bancaires et XLSX factures (section 5.1 du CDC)
import { useState } from 'react'
import toast from 'react-hot-toast'
import { BanniereJarvis } from '../components/depot/BanniereJarvis'
import { EtapeType } from '../components/depot/EtapeType'
import { EtapeUpload } from '../components/depot/EtapeUpload'
import { EtapeMapping } from '../components/depot/EtapeMapping'
import { EtapeValidation } from '../components/depot/EtapeValidation'
import { HistoriqueImports } from '../components/depot/HistoriqueImports'
import { useImportBancaire } from '../hooks/useImportBancaire'
import { useImportFactures } from '../hooks/useImportFactures'
import { useImportLettrage } from '../hooks/useImportLettrage'
import { useImportClients } from '../hooks/useImportClients'
import { useAppData } from '../contexts/AppDataContext'
import type { TypeFichier, LigneMapping, ResultatAnalyse, ResultatValidation } from '../types/import'

function msgErr(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message
  if (err && typeof err === 'object' && 'message' in err) return String((err as { message: unknown }).message)
  return fallback
}

type Etape = 'type' | 'upload' | 'mapping' | 'validation' | 'succes'

const TITRES: Record<Etape, string> = {
  type: 'Choisir le type de fichier',
  upload: 'Déposer le fichier',
  mapping: 'Correspondance des colonnes',
  validation: 'Validation avant import',
  succes: 'Import réussi',
}

const NB_ETAPES = 4
const NUM_ETAPE: Record<Etape, number> = { type: 1, upload: 2, mapping: 3, validation: 4, succes: 4 }
const ETAPES_ORDONNEES: Etape[] = ['type', 'upload', 'mapping', 'validation']

export function PageDepot() {
  const [etape, setEtape] = useState<Etape>('type')
  const [typeFichier, setTypeFichier] = useState<TypeFichier | null>(null)
  const [fichier, setFichier] = useState<File | null>(null)
  const [analyse, setAnalyse] = useState<ResultatAnalyse | null>(null)
  const [mapping, setMapping] = useState<LigneMapping[]>([])
  const [validation, setValidation] = useState<ResultatValidation | null>(null)
  const [chargement, setChargement] = useState(false)
  const [compteurRafraichissement, setCompteurRafraichissement] = useState(0)

  const { rafraichir: rafraichirDonnees } = useAppData()
  const hookBancaire = useImportBancaire()
  const hookFactures = useImportFactures()
  const hookLettrage = useImportLettrage()
  const hookClients = useImportClients()
  const hook = typeFichier === 'csv_bancaire' ? hookBancaire
    : typeFichier === 'xlsx_factures' ? hookFactures
    : typeFichier === 'import_lettrage' ? hookLettrage
    : hookClients

  function reinitialiser() {
    setEtape('type')
    setTypeFichier(null)
    setFichier(null)
    setAnalyse(null)
    setMapping([])
    setValidation(null)
  }

  async function gererFichierSelectionne(f: File) {
    setChargement(true)
    try {
      const resultatAnalyse = await hook.analyserFichier(f)
      setFichier(f)
      setAnalyse(resultatAnalyse)
      setMapping(resultatAnalyse.mapping)
      setEtape('mapping')
    } catch (err) {
      toast.error(msgErr(err, 'Erreur lors de l\'analyse du fichier.'))
    } finally {
      setChargement(false)
    }
  }

  async function gererPreparerImport() {
    if (!fichier || !analyse) return
    setChargement(true)
    try {
      const resultatValidation = await hook.preparerImport(fichier, mapping, analyse.hash)
      setValidation(resultatValidation)
      setEtape('validation')
    } catch (err) {
      toast.error(msgErr(err, 'Erreur lors de la préparation.'))
    } finally {
      setChargement(false)
    }
  }

  async function gererConfirmerImport() {
    if (!validation) return
    setChargement(true)
    try {
      const resultat = await hook.executerImport(validation)
      setCompteurRafraichissement(c => c + 1)
      // Attendre que le cache soit à jour avant d'afficher le succès
      await rafraichirDonnees()
      setEtape('succes')
      toast.success(`Import réussi — ${resultat.nb_inserees.toLocaleString('fr-FR')} lignes ajoutées.`)
    } catch (err) {
      toast.error(msgErr(err, 'Erreur lors de l\'import.'))
    } finally {
      setChargement(false)
    }
  }

  function changerMapping(index: number, champCible: string | null) {
    setMapping(prev => prev.map((m, i) => i === index ? { ...m, champ_cible: champCible, auto: false } : m))
  }

  const numeroEtapeActuelle = NUM_ETAPE[etape]

  return (
    <div>
      <BanniereJarvis />

      {/* En-tête de page */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900 tracking-tight">Dépôt de fichiers</h1>
          <p className="text-sm text-gray-500 mt-0.5">Importez vos relevés bancaires et fichiers de facturation</p>
        </div>
        {etape !== 'type' && etape !== 'succes' && (
          <button onClick={reinitialiser} className="text-sm text-gray-400 hover:text-gray-700 transition-colors">
            ✕ Annuler l'import
          </button>
        )}
      </div>

      {/* Progression par étapes */}
      {etape !== 'succes' && (
        <div className="flex items-center gap-0 mb-6">
          {Array.from({ length: NB_ETAPES }, (_, i) => {
            const n = i + 1
            const etat = n < numeroEtapeActuelle ? 'fait' : n === numeroEtapeActuelle ? 'actif' : 'attente'
            return (
              <div key={n} className="flex items-center" style={{ flex: n < NB_ETAPES ? 1 : 'none' }}>
                <div className="flex items-center gap-2">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 ${
                    etat === 'fait' ? 'bg-emerald-500 text-white' :
                    etat === 'actif' ? 'bg-ockham-teal text-white ring-4 ring-ockham-teal/20' :
                    'bg-gray-200 text-gray-400'
                  }`}>
                    {etat === 'fait' ? '✓' : n}
                  </div>
                  <span className={`text-xs font-medium whitespace-nowrap ${
                    etat === 'actif' ? 'text-ockham-teal' : etat === 'fait' ? 'text-emerald-600' : 'text-gray-400'
                  }`}>
                    {TITRES[ETAPES_ORDONNEES[i]]}
                  </span>
                </div>
                {n < NB_ETAPES && (
                  <div className={`flex-1 h-px mx-3 ${n < numeroEtapeActuelle ? 'bg-emerald-300' : 'bg-gray-200'}`} />
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Zone principale */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
        <div className="border-b border-gray-100 px-6 py-4">
          <h2 className="text-sm font-semibold text-gray-800">
            {etape === 'succes' ? '✅ Import réussi' : TITRES[etape]}
          </h2>
        </div>
        <div className="p-6">
          {etape === 'type' && (
            <EtapeType
              valeur={typeFichier}
              onChange={setTypeFichier}
              onSuivant={() => { if (typeFichier) setEtape('upload') }}
            />
          )}
          {etape === 'upload' && typeFichier && (
            <EtapeUpload
              typeFichier={typeFichier}
              onFichierSelectionne={gererFichierSelectionne}
              onRetour={() => setEtape('type')}
              chargement={chargement}
            />
          )}
          {etape === 'mapping' && analyse && typeFichier && (
            <EtapeMapping
              typeFichier={typeFichier}
              mapping={mapping}
              onChangerMapping={changerMapping}
              onSuivant={gererPreparerImport}
              onRetour={() => setEtape('upload')}
              chargement={chargement}
              nbLignes={analyse.apercu.length}
              nomFichier={fichier?.name ?? ''}
            />
          )}
          {etape === 'validation' && validation && typeFichier && (
            <EtapeValidation
              typeFichier={typeFichier}
              resultat={validation}
              mapping={mapping}
              onConfirmer={gererConfirmerImport}
              onRetour={() => setEtape('mapping')}
              chargement={chargement}
            />
          )}
          {etape === 'succes' && validation && (
            <div className="text-center py-8">
              <div className="text-4xl mb-4">✅</div>
              <h3 className="text-lg font-bold text-gray-900 mb-1">Import terminé</h3>
              <p className="text-gray-500 text-sm mb-6">
                {validation.nom_fichier} · {typeFichier === 'import_clients'
                  ? `${validation.nb_nouvelles} créé${validation.nb_nouvelles > 1 ? 's' : ''}, ${validation.nb_doublons} mis à jour`
                  : `${validation.nb_nouvelles.toLocaleString('fr-FR')} lignes importées`}
                {typeFichier !== 'import_clients' && validation.nb_doublons > 0 && ` · ${validation.nb_doublons} doublons ignorés`}
                {(validation.nb_invalides ?? 0) > 0 && ` · ${validation.nb_invalides} factures ignorées`}
                {(validation.nb_avertissements ?? 0) > 0 && ` · ${validation.nb_avertissements} sur-paiements`}
              </p>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={reinitialiser}
                  className="px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Nouvel import
                </button>
                <a
                  href="/lettrage"
                  className="px-4 py-2 text-sm font-semibold bg-ockham-teal hover:bg-ockham-teal-dark text-white rounded-lg transition-colors"
                >
                  → Aller au Lettrage
                </a>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Historique */}
      <div className="mt-6 bg-white border border-gray-200 rounded-xl shadow-sm">
        <div className="border-b border-gray-100 px-6 py-4">
          <h2 className="text-sm font-semibold text-gray-800">🕐 Imports récents</h2>
        </div>
        <div className="p-4">
          <HistoriqueImports rafraichir={compteurRafraichissement} />
        </div>
      </div>
    </div>
  )
}
