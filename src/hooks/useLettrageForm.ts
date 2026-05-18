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

export function useLettrageForm(onSuccess: (data: LettrageValideData) => void) {
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
    // Calcul inline pour éviter toute ambiguïté sur les consts déclarées en bas
    const disp = ligneActive.restant ?? 0
    const attribue = Math.round(lignesForme.reduce((s, l) => s + (parseFloat(l.montant) || 0), 0) * 100) / 100
    if (attribue > disp + 0.005) return false // surcharge bloquée
    return lignesForme.every(l => {
      if (l.classe === 'facture' || l.classe === 'cheque' || l.classe === 'lcr') {
        const m = parseFloat(l.montant)
        return !!l.info_facture && !!l.montant && !isNaN(m) && m !== 0
      }
      // "Autres" : description obligatoire, montant optionnel (auto-calculé)
      return !!l.numero_facture.trim()
    })
  }

  async function valider() {
    if (!ligneActive || !peutValider()) return
    setChargement(true)
    try {
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

  return {
    ligneActive, lettragesExistants, lignesForme,
    modeAlerte, chargement,
    selectionnerLigne, annuler, ajouterLigne, supprimerLigne,
    modifierLigne, chercherInfoFacture, valider, peutValider,
    creditDisponible, montantAttribue, restant,
  }
}
