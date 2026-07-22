// Logique de dispatch d'une ligne 411 Attente vers des factures réelles
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import toast from 'react-hot-toast'
import { TOLERANCE_CENT } from '../lib/constantes'
import type { LigneBancaireAvecStatut, LettrageExistant, LigneForme, InfoFacture } from '../types/lettrage'

interface RowLettrageExist { id: string; numero_facture: string; code_client: string; montant: number; date_lettrage: string; commentaire: string | null }
interface RowFactureInfo { reste_du: number; code_client: string; nom_client: string | null; statut_paiement: string }

let _k = 0
function cle() { return String(++_k + 10000) }
function nouvelleLigne(): LigneForme {
  return { _key: cle(), classe: 'facture', numero_facture: '', montant: '', info_facture: null, chargement: false }
}

export interface Dispatch411AttenteData {
  numerosLettres: { numeroPiece: string; montant: number }[]
  idLigneBancaire: string
  montantTotal: number
}

// Alias rétrocompatible
export type Dispatch471Data = Dispatch411AttenteData

export function useDispatch411Attente(onSuccess: (data: Dispatch411AttenteData) => void) {
  const { utilisateur } = useAuth()
  const [ligneActive, setLigneActive] = useState<LigneBancaireAvecStatut | null>(null)
  const [lettragesExistants, setLettragesExistants] = useState<LettrageExistant[]>([])
  const [lignesForme, setLignesForme] = useState<LigneForme[]>([nouvelleLigne()])
  const [chargement, setChargement] = useState(false)
  // Crédit net disponible depuis le lettrage 411_ATTENTE (null = ligne sans lettrage attente, mode rétrocompat)
  const [creditAttente, setCreditAttente] = useState<number | null>(null)

  async function selectionnerLigne(ligne: LigneBancaireAvecStatut) {
    const { data: lettragesData } = await supabase
      .from('lettrages')
      .select('id, numero_facture, code_client, montant, date_lettrage, commentaire')
      .eq('id_ligne_bancaire', ligne.id_operation)
      .eq('annule', false)
    const rows = lettragesData as unknown as RowLettrageExist[] | null
    // Crédit net = valeur pré-calculée par la vue (somme algébrique des lettrages 411_ATTENTE)
    const creditNet = (ligne.credit_attente_411 ?? 0) > 0 ? ligne.credit_attente_411! : null
    setLettragesExistants(rows ?? [])
    setLigneActive(ligne)
    setLignesForme([nouvelleLigne()])
    setCreditAttente(creditNet)
  }

  function annuler() {
    setLigneActive(null)
    setLettragesExistants([])
    setLignesForme([nouvelleLigne()])
    setCreditAttente(null)
  }

  function ajouterLigne() { setLignesForme(prev => [...prev, nouvelleLigne()]) }
  function supprimerLigne(key: string) { setLignesForme(prev => prev.filter(l => l._key !== key)) }
  function modifierLigne(key: string, champ: Partial<LigneForme>) {
    setLignesForme(prev => prev.map(l => l._key === key ? { ...l, ...champ } : l))
  }

  async function chercherInfoFacture(key: string, numero: string) {
    if (numero.length < 4) { modifierLigne(key, { info_facture: null, chargement: false }); return }
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

  function motifInvalide(): string | null {
    if (!ligneActive) return 'Aucune ligne sélectionnée'
    if (!lignesForme.length) return 'Aucune ligne de dispatch'
    const attribue = Math.round(lignesForme.reduce((s, l) => s + (parseFloat(l.montant) || 0), 0) * 100) / 100
    if (attribue > creditDisponible + TOLERANCE_CENT) return `Dépassement du crédit disponible (${creditDisponible.toFixed(2)} €)`
    for (const l of lignesForme) {
      if (l.classe === 'facture' || l.classe === 'cheque' || l.classe === 'lcr') {
        if (!l.info_facture) return 'Facture introuvable ou non saisie'
        const m = parseFloat(l.montant)
        if (!l.montant || isNaN(m) || m === 0) return 'Montant invalide'
      } else if (l.classe === 'compte_client') {
        if (!l.client_411) return 'Client non sélectionné'
        const m = parseFloat(l.montant)
        if (!l.montant || isNaN(m) || m === 0) return 'Montant invalide'
      } else if (!l.numero_facture.trim()) {
        return 'Commentaire requis pour la ligne "Autres"'
      }
    }
    return null
  }

  function peutValider(): boolean { return motifInvalide() === null }

  async function valider() {
    if (!ligneActive || !peutValider()) return
    setChargement(true)
    try {
      const today = new Date().toISOString().split('T')[0]

      // Upsert pseudo-factures 411_CLIENT pour les lignes compte_client
      for (const l of lignesForme) {
        if (l.classe === 'compte_client' && l.client_411) {
          await supabase.from('factures').upsert({
            numero_piece: `411_${l.client_411.code_dso}`,
            code_client: l.client_411.code_dso,
            nom_client: l.client_411.nom,
            date_emission: today,
            montant_ht: 0,
            montant_ttc: 0,
            reste_du: 0,
            est_avoir: false,
          } as never, { onConflict: 'organisation_id,numero_piece', ignoreDuplicates: true })
        }
      }

      const montantFactures = Math.round(
        lignesForme.filter(l => l.classe !== 'autres').reduce((s, l) => s + (parseFloat(l.montant) || 0), 0) * 100
      ) / 100
      const resteAutres = Math.max(0, Math.round((creditDisponible - montantFactures) * 100) / 100)

      const inserts = lignesForme.map(l => ({
        id_ligne_bancaire: ligneActive.id_operation,
        numero_facture: l.classe === 'autres'
          ? null
          : l.classe === 'compte_client' && l.client_411
            ? `411_${l.client_411.code_dso}`
            : l.numero_facture.trim(),
        code_client: l.classe === 'autres'
          ? 'AUTRES'
          : l.classe === 'compte_client' && l.client_411
            ? l.client_411.code_dso
            : (l.info_facture?.code_client ?? ''),
        montant: l.classe === 'autres' && !l.montant
          ? resteAutres
          : Math.round(parseFloat(l.montant) * 100) / 100,
        date_lettrage: today,
        mode: 'dispatch',
        commentaire: l.classe === 'autres' ? (l.numero_facture.trim() || null) : null,
        cree_par: utilisateur?.id ?? null,
        operateur: utilisateur?.email?.split('@')[0] ?? null,
      }))

      const montantDispatche = Math.round(inserts.reduce((s, i) => s + i.montant, 0) * 100) / 100

      // Reversal 411_ATTENTE sur le vrai id_ligne_bancaire.
      // mode='correction' est exempté du trigger de date (migration 103) et de
      // l'index unique (migrations 103+105), donc pas de conflit avec le lettrage initial.
      if (creditAttente !== null) {
        const correctionId = crypto.randomUUID()
        const { error: errCorr } = await supabase.from('lettrages').insert({
          id_ligne_bancaire: ligneActive.id_operation,
          numero_facture: '411_ATTENTE',
          code_client: 'ATTENTE',
          montant: -montantDispatche,
          date_lettrage: today,
          mode: 'correction',
          correction_id: correctionId,
          commentaire: 'Dispatch 411 Attente',
          cree_par: utilisateur?.id ?? null,
          operateur: utilisateur?.email?.split('@')[0] ?? null,
        } as never)
        if (errCorr) throw errCorr
      }

      const { error } = await supabase.from('lettrages').insert(inserts as never)
      if (error) throw error

      // Effacer le flag 411 Attente uniquement si le crédit est totalement dispatché
      const restantApres = Math.round((creditDisponible - montantDispatche) * 100) / 100
      if (Math.abs(restantApres) < TOLERANCE_CENT) {
        const { error: errUpdate } = await supabase
          .from('lignes_bancaires')
          .update({ en_attente_411: false } as never)
          .eq('id_operation', ligneActive.id_operation)
        if (errUpdate) throw errUpdate
      }

      onSuccess({
        numerosLettres: inserts
          .filter(i => i.code_client !== 'AUTRES')
          .map(i => ({ numeroPiece: i.numero_facture ?? '', montant: i.montant })),
        idLigneBancaire: ligneActive.id_operation,
        montantTotal: montantDispatche,
      })
      annuler()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur lors du dispatch 411 Attente.')
    } finally {
      setChargement(false)
    }
  }

  // creditAttente !== null → nouveau flux avec lettrage 411_ATTENTE ; sinon rétrocompat restant
  const creditDisponible = creditAttente !== null ? creditAttente : (ligneActive?.restant ?? 0)
  const montantAttribue = Math.round(lignesForme.reduce((s, l) => s + (parseFloat(l.montant) || 0), 0) * 100) / 100
  const restant = Math.round((creditDisponible - montantAttribue) * 100) / 100

  function injecterLignes(factures: { numero_facture: string; montant: number }[]) {
    if (!factures.length) return
    const vides = lignesForme.filter(l => l.classe === 'facture' && !l.numero_facture)
    const nonVides = lignesForme.filter(l => l.classe !== 'facture' || !!l.numero_facture)
    const nouvelles: LigneForme[] = factures.map((f, i) => ({
      _key: i < vides.length ? vides[i]._key : cle(),
      classe: 'facture' as const,
      numero_facture: f.numero_facture,
      montant: String(f.montant),
      info_facture: null,
      chargement: true,
    }))
    setLignesForme([...nonVides, ...nouvelles])
    nouvelles.forEach(l => chercherInfoFacture(l._key, l.numero_facture))
  }

  return {
    ligneActive, lettragesExistants, lignesForme,
    chargement,
    selectionnerLigne, annuler, ajouterLigne, supprimerLigne,
    modifierLigne, chercherInfoFacture, injecterLignes, valider, peutValider, motifInvalide,
    creditDisponible, montantAttribue, restant,
  }
}

// Alias rétrocompatible (évite les imports cassés non détectés)
export const useDispatch471 = useDispatch411Attente
