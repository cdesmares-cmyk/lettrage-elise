// État et logique du formulaire de lettrage principal
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import toast from 'react-hot-toast'
import type { LigneBancaireAvecStatut, LettrageExistant, LigneForme, InfoFacture } from '../types/lettrage'

interface RowLettrageExist { id: string; numero_facture: string; code_client: string; montant: number; date_lettrage: string; commentaire: string | null }
interface RowFactureInfo { reste_du: number; code_client: string; nom_client: string | null; statut_paiement: string }

let _k = 0
function cle() { return String(++_k) }
function nouvelleLigne(): LigneForme {
  return { _key: cle(), classe: 'facture', numero_facture: '', montant: '', info_facture: null, chargement: false }
}

export interface LettrageValideData {
  numerosLettres: { numeroPiece: string; montant: number }[]
  idLigneBancaire: string
  montantTotal: number
}

export function useLettrageForm(
  onSuccess: (data: LettrageValideData) => void,
  on471Success?: (idLigneBancaire: string, numerosLettres: { numeroPiece: string; montant: number }[]) => void,
  on411Success?: (numerosLettres: { numeroPiece: string; montant: number }[]) => void,
) {
  const { utilisateur } = useAuth()
  const [ligneActive, setLigneActive] = useState<LigneBancaireAvecStatut | null>(null)
  const [lettragesExistants, setLettragesExistants] = useState<LettrageExistant[]>([])
  const [lignesForme, setLignesForme] = useState<LigneForme[]>([nouvelleLigne()])
  const [modeAlerte, setModeAlerte] = useState(false)
  const [chargement, setChargement] = useState(false)

  async function selectionnerLigne(ligne: LigneBancaireAvecStatut) {
    if (ligne.statut_lettrage === 'debit') return
    const { data } = await supabase
      .from('lettrages')
      .select('id, numero_facture, code_client, montant, date_lettrage, commentaire')
      .eq('id_ligne_bancaire', ligne.id_operation)
    const rows = data as unknown as RowLettrageExist[] | null
    setLettragesExistants(rows ?? [])
    setLigneActive(ligne)
    setModeAlerte(ligne.statut_lettrage === 'lettre')
    setLignesForme([nouvelleLigne()])
  }

  function annuler() {
    setLigneActive(null)
    setLettragesExistants([])
    setLignesForme([nouvelleLigne()])
    setModeAlerte(false)
  }

  function ajouterLigne() { setLignesForme(prev => [...prev, nouvelleLigne()]) }

  function injecterFactures(factures: { numero_facture: string; montant: number; code_client: string; nom_client: string | null }[]) {
    const nouvelles: LigneForme[] = factures.map(f => ({
      _key: cle(),
      classe: 'facture' as const,
      numero_facture: f.numero_facture,
      montant: String(Math.round(f.montant * 100) / 100),
      info_facture: { reste_du: f.montant, code_client: f.code_client, nom_client: f.nom_client, statut_paiement: 'partiel' },
      chargement: false,
    }))
    setLignesForme(prev => {
      const nonVides = prev.filter(l => l.numero_facture.trim() !== '')
      return [...nonVides, ...nouvelles]
    })
  }

  function supprimerLigne(key: string) {
    setLignesForme(prev => prev.filter(l => l._key !== key))
  }

  function modifierLigne(key: string, champ: Partial<LigneForme>) {
    setLignesForme(prev => prev.map(l => l._key === key ? { ...l, ...champ } : l))
  }

  async function chercherInfoFacture(key: string, numero: string) {
    if (numero.length < 4) {
      modifierLigne(key, { info_facture: null, chargement: false })
      return
    }
    modifierLigne(key, { chargement: true })
    const { data } = await supabase
      .from('v_factures_avec_reste_du')
      .select('reste_du, code_client, nom_client, statut_paiement')
      .eq('numero_piece', numero)
      .maybeSingle()
    const row = data as unknown as RowFactureInfo | null
    if (row) {
      const resteDu = Math.max(0, row.reste_du)
      modifierLigne(key, {
        chargement: false,
        info_facture: row as InfoFacture,
        montant: resteDu > 0 ? String(Math.round(resteDu * 100) / 100) : '',
      })
    } else {
      modifierLigne(key, { chargement: false, info_facture: null })
    }
  }

  function peutValider(): boolean {
    if (!ligneActive || !lignesForme.length) return false
    const disp = ligneActive.restant ?? 0
    const attribue = Math.round(lignesForme.reduce((s, l) => s + (parseFloat(l.montant) || 0), 0) * 100) / 100
    if (attribue > disp + 0.005) return false
    const restantCalc = Math.round((disp - attribue) * 100) / 100
    return lignesForme.every(l => {
      if (l.classe === 'facture' || l.classe === 'cheque' || l.classe === 'lcr') {
        const m = parseFloat(l.montant)
        return !!l.info_facture && !!l.montant && !isNaN(m) && m !== 0
      }
      if (l.classe === 'compte_client') return !!l.client_411 && restantCalc > 0.005
      if (l.classe === 'compte_attente') return restantCalc > 0.005
      return !!l.numero_facture.trim()
    })
  }

  async function valider() {
    if (!ligneActive || !peutValider()) return
    const ligneCompteClient = lignesForme.find(l => l.classe === 'compte_client')
    const ligneCompteAttente = lignesForme.find(l => l.classe === 'compte_attente')
    if (ligneCompteClient?.client_411) {
      await affecterEn411(ligneCompteClient.client_411.code_dso, ligneCompteClient.client_411.nom)
      return
    }
    if (ligneCompteAttente) {
      await affecterEn471()
      return
    }
    setChargement(true)
    try {
      // Vérification live : s'assurer que le reste_du est encore suffisant en base
      // (protection contre le double-lettrage si un autre user a lettrée entre-temps)
      const factureLignes = lignesForme.filter(l =>
        (l.classe === 'facture' || l.classe === 'cheque' || l.classe === 'lcr') && l.numero_facture
      )
      if (factureLignes.length > 0) {
        const { data: freshData } = await supabase
          .from('v_factures_avec_reste_du')
          .select('numero_piece, reste_du')
          .in('numero_piece', factureLignes.map(l => l.numero_facture.trim()))
        const freshMap = new Map(
          ((freshData as { numero_piece: string; reste_du: number }[]) ?? []).map(r => [r.numero_piece, r.reste_du])
        )
        for (const l of factureLignes) {
          const resteDuLive = freshMap.get(l.numero_facture.trim()) ?? 0
          const montant = parseFloat(l.montant) || 0
          if (resteDuLive < montant - 0.005) {
            toast.error(`Facture ${l.numero_facture} : solde insuffisant (${resteDuLive.toFixed(2)} € restant). Elle a peut-être déjà été lettrée.`)
            setChargement(false)
            return
          }
        }
      }

      const today = new Date().toISOString().split('T')[0]
      // Pour les lignes "Autres" sans montant : utiliser le restant après les factures
      const montantFactures = Math.round(
        lignesForme
          .filter(l => l.classe === 'facture')
          .reduce((s, l) => s + (parseFloat(l.montant) || 0), 0) * 100
      ) / 100
      const resteAutres = Math.max(0, Math.round((creditDisponible - montantFactures) * 100) / 100)

      const modeDepuisClasse = (classe: string) => {
        if (classe === 'cheque') return 'cheque'
        if (classe === 'lcr') return 'lcr'
        return 'manuel'
      }
      const inserts = lignesForme.map(l => ({
        id_ligne_bancaire: ligneActive.id_operation,
        numero_facture: l.classe === 'autres' ? null : l.numero_facture.trim(),
        code_client: l.classe === 'autres' ? 'AUTRES' : (l.info_facture?.code_client ?? ''),
        montant: l.classe === 'autres' && !l.montant
          ? resteAutres
          : Math.round(parseFloat(l.montant) * 100) / 100,
        date_lettrage: today,
        mode: modeDepuisClasse(l.classe),
        commentaire: l.classe === 'autres' ? (l.numero_facture.trim() || null) : null,
        cree_par: utilisateur?.id ?? null,
        operateur: utilisateur?.email?.split('@')[0] ?? null,
      }))
      const { error } = await supabase.from('lettrages').insert(inserts as never)
      if (error) throw error
      onSuccess({
        numerosLettres: inserts
          .filter(i => i.code_client !== 'AUTRES')
          .map(i => ({ numeroPiece: i.numero_facture ?? '', montant: i.montant })),
        idLigneBancaire: ligneActive.id_operation,
        montantTotal: Math.round(inserts.reduce((s, i) => s + i.montant, 0) * 100) / 100,
      })
      // Alimente le dictionnaire auto-apprenant si toutes les factures sont d'un même client
      const codesUniques = [...new Set(inserts.filter(i => i.code_client !== 'AUTRES').map(i => i.code_client))]
      if (codesUniques.length === 1 && ligneActive.libelle) {
        // @ts-expect-error fn_upsert_libelle_sepa absente du schéma généré
        supabase.rpc('fn_upsert_libelle_sepa', { p_libelle: ligneActive.libelle, p_code_client: codesUniques[0] }).then()
      }
      annuler()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : (err as { message?: string })?.message ?? 'Erreur lors du lettrage.')
    } finally {
      setChargement(false)
    }
  }

  // Utiliser le restant (après lettrages existants) et non le crédit brut
  const creditDisponible = ligneActive?.restant ?? 0
  const montantAttribue = Math.round(
    lignesForme.reduce((s, l) => s + (parseFloat(l.montant) || 0), 0) * 100
  ) / 100
  const restant = Math.round((creditDisponible - montantAttribue) * 100) / 100

  async function affecterEn411(codeClient: string, nomClient: string | null) {
    if (!ligneActive) return
    setChargement(true)
    try {
      const today = new Date().toISOString().split('T')[0]
      // Insérer les lignes valides du formulaire (mix autorisé, lignes compte exclues)
      const valides = lignesForme.filter(l => {
        if (l.classe === 'compte_client' || l.classe === 'compte_attente') return false
        if (l.classe === 'autres') return !!l.numero_facture.trim()
        const m = parseFloat(l.montant)
        return !!l.info_facture && !!l.numero_facture && !isNaN(m) && m > 0
      })
      const numerosLettres: { numeroPiece: string; montant: number }[] = []
      let montantMix = 0
      if (valides.length > 0) {
        const inserts = valides.map(l => ({
          id_ligne_bancaire: ligneActive.id_operation,
          numero_facture: l.classe === 'autres' ? null : l.numero_facture.trim(),
          code_client: l.classe === 'autres' ? 'AUTRES' : (l.info_facture?.code_client ?? ''),
          montant: Math.round(parseFloat(l.montant) * 100) / 100,
          date_lettrage: today,
          mode: 'manuel',
          commentaire: l.classe === 'autres' ? (l.numero_facture.trim() || null) : null,
          cree_par: utilisateur?.id ?? null,
          operateur: utilisateur?.email?.split('@')[0] ?? null,
        }))
        const { error } = await supabase.from('lettrages').insert(inserts as never)
        if (error) throw error
        montantMix = Math.round(inserts.reduce((s, i) => s + i.montant, 0) * 100) / 100
        inserts.filter(i => i.code_client !== 'AUTRES').forEach(i => {
          numerosLettres.push({ numeroPiece: i.numero_facture ?? '', montant: i.montant })
        })
      }
      // Créer la pseudo-facture 411 si elle n'existe pas déjà
      const numero411 = `411_${codeClient}`
      await supabase.from('factures').upsert({
        numero_piece: numero411,
        code_client: codeClient,
        nom_client: nomClient,
        date_emission: today,
        montant_ht: 0,
        montant_ttc: 0,
        reste_du: 0,
        est_avoir: false,
      } as never, { onConflict: 'organisation_id,numero_piece', ignoreDuplicates: true })
      // Lettrage temporaire : ligne bancaire → 411_CLIENT pour le restant
      const montant411 = Math.round((creditDisponible - montantMix) * 100) / 100
      if (montant411 > 0.005) {
        const { error } = await supabase.from('lettrages').insert({
          id_ligne_bancaire: ligneActive.id_operation,
          numero_facture: numero411,
          code_client: codeClient,
          montant: montant411,
          date_lettrage: today,
          mode: 'manuel',
          commentaire: null,
          cree_par: utilisateur?.id ?? null,
          operateur: utilisateur?.email?.split('@')[0] ?? null,
        } as never)
        if (error) throw error
      }
      on411Success?.(numerosLettres)
      annuler()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur lors de l\'affectation 411.')
    } finally {
      setChargement(false)
    }
  }

  async function affecterEn471() {
    if (!ligneActive) return
    setChargement(true)
    try {
      // Insérer les lignes valides du formulaire (mix autorisé, lignes compte exclues)
      const valides = lignesForme.filter(l => {
        if (l.classe === 'compte_client' || l.classe === 'compte_attente') return false
        if (l.classe === 'autres') return !!l.numero_facture.trim()
        const m = parseFloat(l.montant)
        return !!l.info_facture && !!l.numero_facture && !isNaN(m) && m > 0
      })
      const numerosLettres: { numeroPiece: string; montant: number }[] = []
      if (valides.length > 0) {
        const today = new Date().toISOString().split('T')[0]
        const inserts = valides.map(l => ({
          id_ligne_bancaire: ligneActive.id_operation,
          numero_facture: l.classe === 'autres' ? null : l.numero_facture.trim(),
          code_client: l.classe === 'autres' ? 'AUTRES' : (l.info_facture?.code_client ?? ''),
          montant: Math.round(parseFloat(l.montant) * 100) / 100,
          date_lettrage: today,
          mode: 'manuel',
          commentaire: l.classe === 'autres' ? (l.numero_facture.trim() || null) : null,
          cree_par: utilisateur?.id ?? null,
          operateur: utilisateur?.email?.split('@')[0] ?? null,
        }))
        const { error } = await supabase.from('lettrages').insert(inserts as never)
        if (error) throw error
        inserts.filter(i => i.code_client !== 'AUTRES').forEach(i => {
          numerosLettres.push({ numeroPiece: i.numero_facture ?? '', montant: i.montant })
        })
      }
      // Marquer la ligne en attente 471
      const { error: errUpdate } = await supabase
        .from('lignes_bancaires')
        .update({ en_attente_471: true } as never)
        .eq('id_operation', ligneActive.id_operation)
      if (errUpdate) throw errUpdate
      on471Success?.(ligneActive.id_operation, numerosLettres)
      annuler()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur lors de l\'affectation 471.')
    } finally {
      setChargement(false)
    }
  }

  return {
    ligneActive, lettragesExistants, lignesForme,
    modeAlerte, chargement,
    selectionnerLigne, annuler, ajouterLigne, supprimerLigne,
    modifierLigne, chercherInfoFacture, injecterFactures, valider, peutValider,
    creditDisponible, montantAttribue, restant,
  }
}
