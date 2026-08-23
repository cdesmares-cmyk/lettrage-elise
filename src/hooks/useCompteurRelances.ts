import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { SEUIL_SANS_SUITE_DEFAUT } from './useRelances'

// Pastille navigation : clients dont la relance la plus récente est à J-10 avant "Sans suite"
export function useCompteurRelances() {
  const { utilisateur } = useAuth()
  const [nb, setNb] = useState(0)

  useEffect(() => {
    if (!utilisateur) { setNb(0); return }

    supabase.from('ref_valeurs').select('valeur').eq('categorie', 'config_seuil_sans_suite').maybeSingle()
      .then(({ data }) => {
        const val = parseInt((data as { valeur: string } | null)?.valeur ?? '')
        const seuilJours = !isNaN(val) && val > 0 ? val : SEUIL_SANS_SUITE_DEFAUT

        supabase
          .from('relances')
          .select('code_client, envoyee_le')
          .eq('archivee', false)
          .neq('statut', 'brouillon')
          .not('envoyee_le', 'is', null)
          .then(({ data: rows }) => {
            const relances = (rows ?? []) as { code_client: string; envoyee_le: string }[]

            // Relance la plus récente par client
            const parClient = new Map<string, string>()
            for (const r of relances) {
              const ex = parClient.get(r.code_client)
              if (!ex || r.envoyee_le > ex) parClient.set(r.code_client, r.envoyee_le)
            }

            // Compte les clients dont la relance la plus récente est dans la fenêtre d'alerte
            const msParJour = 86_400_000
            const maintenant = Date.now()
            const count = [...parClient.values()].filter(envoyee_le => {
              const jours = Math.floor((maintenant - new Date(envoyee_le).getTime()) / msParJour)
              return jours >= seuilJours - 10 && jours < seuilJours
            }).length

            setNb(count)
          })
      })
  }, [utilisateur])

  return nb
}
