import { useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { exporterLettrageXls } from '../lib/exportLettrageXls'
import { fetchAll } from '../lib/pagination'

export interface ExportComptable {
  id: string
  date_debut: string
  date_fin: string
  nb_lettrages: number
  montant_total: number
  created_at: string
  exporte_par: string | null
}

export function useExportComptable() {
  const [lignesExportees, setLignesExportees] = useState<Map<string, string>>(new Map())
  const [historique, setHistorique] = useState<ExportComptable[]>([])
  const [chargement, setChargement] = useState(false)

  const charger = useCallback(async () => {
    const [lockRows, { data: histData }] = await Promise.all([
      // Paginé, et non plus `.limit(10000)`. Cette carte dit à l'écran quelles
      // lignes sont verrouillées ; tronquée, elle affichait comme libres des
      // lignes déjà exportées, invitant à les relettrer.
      fetchAll<{ id_ligne_bancaire: string | null; export_id: string | null }>((from, to) =>
        supabase
          .from('lettrages')
          .select('id, id_ligne_bancaire, export_id')
          .not('export_id', 'is', null)
          .eq('annule', false)
          .order('id')
          .range(from, to)
      ),
      supabase
        .from('exports_comptables')
        .select('id, date_debut, date_fin, nb_lettrages, montant_total, created_at, exporte_par')
        .order('created_at', { ascending: false })
        .limit(20),
    ])

    const rows = lockRows
    const hist = (histData as ExportComptable[]) ?? []
    const dateByExportId = Object.fromEntries(hist.map(e => [e.id, e.created_at]))

    const exportMap = new Map<string, string>()
    for (const r of rows) {
      if (r.id_ligne_bancaire && r.export_id && !exportMap.has(r.id_ligne_bancaire)) {
        exportMap.set(r.id_ligne_bancaire, dateByExportId[r.export_id] ?? '')
      }
    }
    setLignesExportees(exportMap)
    setHistorique(hist)
  }, [])

  /**
   * Le périmètre exact de l'export, calculé en SQL.
   *
   * Avant la migration 194, cette fonction lançait quatre requêtes sans
   * pagination. PostgREST les tronquait à 1000 lignes EN SILENCE : l'écran
   * annonçait « 1000 lignes » dès que la période en comptait davantage, et —
   * plus grave — le montant total était la somme des mille premières lignes
   * seulement. L'opérateur déclenchait un verrouillage comptable irréversible
   * sur un chiffre sous-estimé.
   *
   * Compter et sommer sont le travail de Postgres, pas celui du navigateur :
   * un aller-retour, aucun plafond à contourner, et des milliers de lignes qui
   * ne traversent plus le réseau pour finir dans un `reduce`.
   */
  async function apercu(dateDebut: string, dateFin: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.rpc as any)('apercu_export_comptable', {
      p_date_debut: dateDebut,
      p_date_fin:   dateFin,
    })
    if (error) throw error
    const r = (data ?? {}) as {
      nb_lignes?: number; montant?: number; nb_non_lettrees?: number
      nb_compensations?: number; nb_corrections?: number
    }
    return {
      nbLignes:        r.nb_lignes ?? 0,
      montant:         Number(r.montant ?? 0),
      nbNonLettrees:   r.nb_non_lettrees ?? 0,
      nbCompensations: r.nb_compensations ?? 0,
      nbCorrections:   r.nb_corrections ?? 0,
    }
  }

  /**
   * LE FICHIER D'ABORD, LE VERROU ENSUITE.
   *
   * L'ordre inverse était en place jusqu'au 2026-11-27, et il exposait à la
   * pire des deux pannes : la RPC verrouillait, puis la génération du fichier
   * échouait — réseau, délai, volume. Les lettrages étaient alors verrouillés
   * comptablement, aucun fichier n'était produit, et l'écran affichait « Erreur
   * lors de l'export » sans dire que le verrou, lui, avait bien eu lieu.
   * L'opérateur croyait l'opération annulée alors qu'elle était faite.
   *
   * Dans ce sens-ci, un échec du verrou laisse l'opérateur avec un fichier et
   * rien de verrouillé : il relance, et l'état repart propre. Le fichier ne
   * dépend pas du verrou — exporterLettrageXls filtre sur la période, jamais
   * sur export_id — donc son contenu est identique avant et après.
   */
  async function exporter(dateDebut: string, dateFin: string) {
    setChargement(true)
    try {
      await genererFichier(dateDebut, dateFin, `export_comptable_${dateDebut}_${dateFin}`)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.rpc as any)('creer_export_comptable', {
        p_date_debut: dateDebut,
        p_date_fin:   dateFin,
      })
      if (error) {
        throw new Error(
          `Le fichier a été téléchargé, mais le verrouillage a échoué : ${error.message}. `
          + 'Les lettrages ne sont PAS verrouillés — relancez l\'export.'
        )
      }
      await charger()
    } finally {
      setChargement(false)
    }
  }

  /**
   * Le périmètre de l'export interne, avant de le lancer.
   *
   * Même principe que `apercu`, et même raison d'être en SQL : compter des
   * dizaines de milliers de lignes dans le navigateur pour n'en garder qu'un
   * total, c'est le travail de Postgres.
   *
   * Les compteurs reproduisent exactement ce que construit exportLettrageXls,
   * de façon à ce que le fichier remis à l'expert-comptable puisse être
   * recompté contre ce que l'écran annonçait.
   */
  async function apercuInterne(dateDebut: string, dateFin: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.rpc as any)('apercu_export_interne', {
      p_date_debut: dateDebut,
      p_date_fin:   dateFin,
    })
    if (error) throw error
    const r = (data ?? {}) as {
      nb_lignes_bancaires?: number; nb_affectations?: number
      nb_lettrees?: number; nb_non_lettrees?: number
      montant_credit?: number; montant_lettre?: number
    }
    return {
      nbLignesBancaires: r.nb_lignes_bancaires ?? 0,
      nbAffectations:    r.nb_affectations ?? 0,
      nbLettrees:        r.nb_lettrees ?? 0,
      nbNonLettrees:     r.nb_non_lettrees ?? 0,
      montantCredit:     Number(r.montant_credit ?? 0),
      montantLettre:     Number(r.montant_lettre ?? 0),
    }
  }

  async function retelecharger(exp: ExportComptable) {
    await genererFichier(
      exp.date_debut,
      exp.date_fin,
      `export_comptable_${exp.date_debut}_${exp.date_fin}`
    )
  }

  async function genererFichier(dateDebut: string, dateFin: string, nomFichier: string) {
    await exporterLettrageXls(dateDebut, dateFin, nomFichier)
  }

  return { lignesExportees, historique, chargement, charger, apercu, apercuInterne, exporter, retelecharger }
}
