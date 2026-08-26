import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAppData } from '../contexts/AppDataContext'
import type { CompteClient } from '../types/client'

export interface MandataireBodacc {
  qualite?: string
  nom?: string
  adresse?: string
  reference_dossier?: string
}

export interface ProcedureLigne {
  alerteId: string
  codeClient: string
  nom: string
  encours: number
  typeProcedure: string
  dateParution: string | null
  dateJugement: string | null
  tribunal: string | null
  sourceUrl: string | null
  mandataire: MandataireBodacc | null
  joursDepuis: number
  declarationStatut: string | null
  declarationMontant: number | null
}

const TYPES_ENCOURS = new Set(['liquidation', 'redressement', 'sauvegarde'])
const TYPES_ARCHIVE  = new Set(['cloture', 'radiation'])

interface AlerteRow {
  id: string
  code_client: string
  type_procedure: string
  date_parution: string | null
  date_jugement: string | null
  tribunal: string | null
  source_url: string | null
  mandataire: MandataireBodacc | null
}

interface DeclarationRow {
  alerte_id: string
  statut: string
  montant_creancier: number | null
}

export function useProcedures() {
  const { clients } = useAppData()
  const [encours, setEncours] = useState<ProcedureLigne[]>([])
  const [archive, setArchive] = useState<ProcedureLigne[]>([])
  const [chargement, setChargement] = useState(true)

  useEffect(() => {
    let annule = false

    async function charger() {
      setChargement(true)
      try {
        const [alertesRes, declarationsRes] = await Promise.all([
          supabase
            .from('alertes_risque')
            .select('id, code_client, type_procedure, date_parution, date_jugement, tribunal, source_url, mandataire')
            .eq('masquee', false)
            .order('date_parution', { ascending: false }),
          supabase
            .from('declarations_creances')
            .select('alerte_id, statut, montant_creancier'),
        ])

        if (annule) return

        const alertes = (alertesRes.data ?? []) as AlerteRow[]
        const declarations = (declarationsRes.data ?? []) as DeclarationRow[]

        const declMap = new Map<string, DeclarationRow>()
        for (const d of declarations) declMap.set(d.alerte_id, d)

        const clientMap = new Map<string, CompteClient>()
        for (const c of clients) clientMap.set(c.code_dso, c)

        // Un seul traitement par client — l'alerte la plus récente détermine le bucket
        const vus = new Set<string>()
        const lignesEncours: ProcedureLigne[] = []
        const lignesArchive: ProcedureLigne[] = []

        for (const a of alertes) {
          if (vus.has(a.code_client)) continue
          vus.add(a.code_client)

          const client = clientMap.get(a.code_client)
          if (!client) continue

          const jours = a.date_parution
            ? Math.floor((Date.now() - new Date(a.date_parution).getTime()) / 86_400_000)
            : 0

          const decl = declMap.get(a.id)

          const ligne: ProcedureLigne = {
            alerteId: a.id,
            codeClient: a.code_client,
            nom: client.nom,
            encours: client.encours_total,
            typeProcedure: a.type_procedure,
            dateParution: a.date_parution,
            dateJugement: a.date_jugement,
            tribunal: a.tribunal,
            sourceUrl: a.source_url,
            mandataire: a.mandataire,
            joursDepuis: jours,
            declarationStatut: decl?.statut ?? null,
            declarationMontant: decl?.montant_creancier ?? null,
          }

          if (TYPES_ENCOURS.has(a.type_procedure)) lignesEncours.push(ligne)
          else if (TYPES_ARCHIVE.has(a.type_procedure)) lignesArchive.push(ligne)
        }

        setEncours(lignesEncours)
        setArchive(lignesArchive)
      } catch {
        // silencieux
      } finally {
        if (!annule) setChargement(false)
      }
    }

    charger()
    return () => { annule = true }
  }, [clients])

  return { encours, archive, chargement }
}
