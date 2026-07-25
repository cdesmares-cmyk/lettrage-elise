// Logique de dispatch d'une ligne 411 Attente vers des factures réelles
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import toast from 'react-hot-toast'
import { TOLERANCE_CENT } from '../lib/constantes'
import type { LigneBancaireAvecStatut, LettrageExistant, LigneForme, InfoFacture } from '../types/lettrage'

interface RowLettrageExist { id: string; numero_facture: string; code_client: string; montant: number; date_lettrage: string; commentaire: string | null; annule: boolean }
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
      .select('id, numero_facture, code_client, montant, date_lettrage, commentaire, annule')
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
      const montantNonAutres = Math.round(
        lignesForme.filter(l => l.classe !== 'autres').reduce((s, l) => s + (parseFloat(l.montant) || 0), 0) * 100
      ) / 100
      const resteAutres = Math.max(0, Math.round((creditDisponible - montantNonAutres) * 100) / 100)

      const targets = lignesForme.map(l => ({
        classe: l.classe,
        numero_facture: l.classe === 'autres'
          ? null
          : l.classe === 'compte_client' && l.client_411
            ? `411_${l.client_411.code_dso}`
            : l.numero_facture.trim() || null,
        code_client: l.classe === 'autres'
          ? 'AUTRES'
          : l.classe === 'compte_client' && l.client_411
            ? l.client_411.code_dso
            : (l.info_facture?.code_client ?? ''),
        nom_client: l.classe === 'compte_client' && l.client_411 ? (l.client_411.nom ?? null) : null,
        montant: l.classe === 'autres' && !l.montant
          ? resteAutres
          : Math.round(parseFloat(l.montant) * 100) / 100,
        commentaire: l.classe === 'autres' ? (l.numero_facture.trim() || null) : null,
      }))

      const montantTotal = Math.round(targets.reduce((s, t) => s + t.montant, 0) * 100) / 100

      // @ts-expect-error fn_dispatch_411_attente absente du schéma généré automatiquement
      const { error } = await supabase.rpc('fn_dispatch_411_attente', {
        p_id_ligne_bancaire: ligneActive.id_operation,
        p_operateur: utilisateur?.email?.split('@')[0] ?? '',
        p_targets: targets,
      })
      if (error) throw error

      onSuccess({
        numerosLettres: targets
          .filter(t => t.code_client !== 'AUTRES')
          .map(t => ({ numeroPiece: t.numero_facture ?? '', montant: t.montant })),
        idLigneBancaire: ligneActive.id_operation,
        montantTotal,
      })
      annuler()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : (err as { message?: string })?.message ?? 'Erreur lors du dispatch 411 Attente.')
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
