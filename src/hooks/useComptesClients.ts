// Données agrégées clients — lit depuis AppDataContext (chargé une fois au démarrage)
import { useState, useMemo, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAppData } from '../contexts/AppDataContext'
import toast from 'react-hot-toast'
import type { CompteClient, GroupeNebuleuse, KpisCompteClient, StatutJuridique } from '../types/client'

export function useComptesClients() {
  const { clients: raw, facturesActives, chargement, rafraichir, mettreAJourClientLocal, moisMaxBrut, ca12Mois } = useAppData()
  const [recherche, setRechercheState] = useState('')
  // Codes clients trouvés côté serveur (factures soldées hors cache)
  const [codesFallback, setCodesFallback] = useState<Set<string>>(new Set())
  const [chargementServeur, setChargementServeur] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const rechercherServeur = useCallback(async (terme: string) => {
    if (terme.length < 2) { setCodesFallback(new Set()); return }
    setChargementServeur(true)
    const { data } = await supabase
      .from('factures')
      .select('code_client')
      .ilike('numero_piece', `%${terme}%`)
      .limit(200)
    setCodesFallback(new Set(((data ?? []) as { code_client: string }[]).map(r => r.code_client)))
    setChargementServeur(false)
  }, [])

  function setRecherche(terme: string) {
    setRechercheState(terme)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (terme.length < 2) { setCodesFallback(new Set()); return }
    debounceRef.current = setTimeout(() => rechercherServeur(terme), 350)
  }

  const clients = useMemo((): CompteClient[] => {
    if (!recherche.trim()) return raw
    const q = recherche.toLowerCase()
    // Cache local d'abord
    const codesAvecFacture = new Set(
      facturesActives
        .filter(f => f.numero_piece.toLowerCase().includes(q))
        .map(f => f.code_client)
    )
    // Union avec les codes trouvés côté serveur (factures soldées)
    for (const code of codesFallback) codesAvecFacture.add(code)

    return raw.filter(c =>
      c.code_dso.toLowerCase().includes(q) ||
      c.nom.toLowerCase().includes(q) ||
      (c.plateforme ?? '').toLowerCase().includes(q) ||
      (c.code_groupement ?? '').toLowerCase().includes(q) ||
      codesAvecFacture.has(c.code_dso)
    )
  }, [raw, recherche, facturesActives, codesFallback])

  const kpis = useMemo((): KpisCompteClient => {
    const impayees = facturesActives.filter(f => f.reste_du > 0.005 && !f.est_avoir)
    let encours12 = 0
    if (moisMaxBrut) {
      const yr = parseInt(moisMaxBrut.slice(0, 4)), mo = parseInt(moisMaxBrut.slice(5, 7))
      let startMo = mo - 11; let startYr = yr
      if (startMo <= 0) { startMo += 12; startYr -= 1 }
      const il12MoisStr = `${startYr}-${String(startMo).padStart(2, '0')}-01`
      const lastDay = new Date(yr, mo, 0).getDate()
      const moisMaxEndStr = `${yr}-${String(mo).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
      encours12 = impayees
        .filter(f => (f.date_emission ?? '') >= il12MoisStr && (f.date_emission ?? '') <= moisMaxEndStr)
        .reduce((s, f) => s + f.reste_du, 0)
    }
    return {
      nbClientsActifs: clients.filter(c => c.encours_total > 0).length,
      encoursTotalTtc: impayees.reduce((s, f) => s + f.reste_du, 0),
      encoursTotalAvoirs: facturesActives
        .filter(f => f.est_avoir && f.reste_du < -0.005)
        .reduce((s, f) => s + Math.abs(f.reste_du), 0),
      nbFacturesAttente: impayees.length,
      dsoRoulant: ca12Mois > 0 ? encours12 / ca12Mois * 365 : null,
    }
  }, [clients, facturesActives, ca12Mois, moisMaxBrut])

  const nebuleuse = useMemo((): GroupeNebuleuse[] => {
    // Uniquement les clients avec un code_groupement explicite
    const groups = new Map<string, CompteClient[]>()
    for (const c of raw) {
      if (!c.code_groupement) continue
      if (!groups.has(c.code_groupement)) groups.set(c.code_groupement, [])
      groups.get(c.code_groupement)!.push(c)
    }
    return Array.from(groups.entries())
      .map(([key, cls]) => {
        const sorted = [...cls].sort((a, b) =>
          (b.derniere_emission ?? '').localeCompare(a.derniere_emission ?? '')
        )
        return {
          groupe_key: key,
          nom_groupe: sorted[0].nom,
          codes_clients: cls.map(c => c.code_dso),
          nb_clients: cls.length,
          nb_factures: cls.reduce((s, c) => s + c.nb_factures_total, 0),
          nb_impayees: cls.reduce((s, c) => s + c.nb_impayees, 0),
          encours_total: cls.reduce((s, c) => s + c.encours_total, 0),
          note_risque: Math.max(...cls.map(c => c.note_risque)),
          clients: cls,
        }
      })
      .filter(g => g.nb_clients > 1)  // vrais groupes uniquement
      .sort((a, b) => b.encours_total - a.encours_total)
  }, [raw])

  const nebuleuseFiltered = useMemo((): GroupeNebuleuse[] => {
    if (!recherche.trim()) return nebuleuse
    const q = recherche.toLowerCase()
    const codesAvecFacture = new Set(
      facturesActives
        .filter(f => f.numero_piece.toLowerCase().includes(q))
        .map(f => f.code_client)
    )
    return nebuleuse.filter(g =>
      g.groupe_key.toLowerCase().includes(q) ||
      g.nom_groupe.toLowerCase().includes(q) ||
      g.clients.some(c =>
        c.code_dso.toLowerCase().includes(q) ||
        c.nom.toLowerCase().includes(q) ||
        codesAvecFacture.has(c.code_dso)
      )
    )
  }, [nebuleuse, recherche, facturesActives])

  async function sauvegarderOptions(codeDso: string, opts: {
    statut_juridique: StatutJuridique | null
    commercial: string | null
    operateur: string | null
    plateforme: string | null
    code_groupement: string | null
    siret: string | null
  }) {
    // Mise à jour locale immédiate — l'UI reflète le changement sans attendre Supabase
    mettreAJourClientLocal(codeDso, opts)
    toast.success('Informations enregistrées.')
    // Persist en arrière-plan
    const { error } = await supabase
      .from('clients')
      .update(opts as never)
      .eq('code_dso', codeDso)
    if (error) { toast.error(error.message); return false }
    return true
  }

  // Avoirs + sur-lettrages par client (reste_du < 0, hors _compte) — pour affichage solde net
  const creditParClient = useMemo(() => {
    const map = new Map<string, number>()
    for (const f of facturesActives) {
      if (f.reste_du >= -0.005 || f.numero_piece.endsWith('_compte')) continue
      map.set(f.code_client, (map.get(f.code_client) ?? 0) + Math.abs(f.reste_du))
    }
    return map
  }, [facturesActives])

  // Nb pièces actives par client : abs(reste_du) > 0, hors _compte (avoirs inclus)
  const nbPiecesParClient = useMemo(() => {
    const map = new Map<string, number>()
    for (const f of facturesActives) {
      if (Math.abs(f.reste_du) <= 0.005 || f.numero_piece.endsWith('_compte')) continue
      map.set(f.code_client, (map.get(f.code_client) ?? 0) + 1)
    }
    return map
  }, [facturesActives])

  return { clients, chargement, chargementServeur, recherche, setRecherche, kpis, nebuleuse: nebuleuseFiltered, rafraichir, sauvegarderOptions, creditParClient, nbPiecesParClient }
}
