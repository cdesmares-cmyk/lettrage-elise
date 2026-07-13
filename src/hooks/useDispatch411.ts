// Dispatch atomique d'un compte 411 vers des factures réelles (RPC PostgreSQL)
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import toast from 'react-hot-toast'
import { TOLERANCE_CENT } from '../lib/constantes'
import type { FactureDetail } from '../types/client'
import type { LigneForme, InfoFacture } from '../types/lettrage'

interface RowFactureInfo { reste_du: number; code_client: string; nom_client: string | null; statut_paiement: string }

let _k = 0
function cle() { return String(++_k + 20000) }
function nouvelleLigne(): LigneForme {
  return { _key: cle(), classe: 'facture', numero_facture: '', montant: '', info_facture: null, chargement: false }
}

export interface Dispatch411Data {
  numerosLettres: { numeroPiece: string; montant: number }[]
  montantTotal: number
}

export function useDispatch411(onSuccess: (data: Dispatch411Data) => void) {
  const { utilisateur } = useAuth()
  const [factureActive, setFactureActive] = useState<FactureDetail | null>(null)
  const [lignesForme, setLignesForme] = useState<LigneForme[]>([nouvelleLigne()])
  const [chargement, setChargement] = useState(false)

  function selectionnerFacture411(facture: FactureDetail) {
    setFactureActive(facture)
    setLignesForme([nouvelleLigne()])
  }

  function annuler() {
    setFactureActive(null)
    setLignesForme([nouvelleLigne()])
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
    if (!factureActive) return 'Aucun compte 411 sélectionné'
    if (!lignesForme.length) return 'Aucune ligne de dispatch'
    const attribue = Math.round(lignesForme.reduce((s, l) => s + (parseFloat(l.montant) || 0), 0) * 100) / 100
    if (attribue > creditDisponible + TOLERANCE_CENT) return `Dépassement du crédit disponible (${creditDisponible.toFixed(2)} €)`
    for (const l of lignesForme) {
      if (l.classe === 'facture' || l.classe === 'cheque' || l.classe === 'lcr') {
        if (!l.info_facture) return 'Facture introuvable ou non saisie'
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
    if (!factureActive || !peutValider()) return
    setChargement(true)
    try {
      const montantFactures = Math.round(
        lignesForme.filter(l => l.classe !== 'autres').reduce((s, l) => s + (parseFloat(l.montant) || 0), 0) * 100
      ) / 100
      const resteAutres = Math.max(0, Math.round((creditDisponible - montantFactures) * 100) / 100)

      const payload = lignesForme.map(l => ({
        numero_facture: l.classe === 'autres' ? '' : l.numero_facture.trim(),
        code_client: l.classe === 'autres' ? 'AUTRES' : (l.info_facture?.code_client ?? ''),
        montant: l.classe === 'autres' && !l.montant
          ? resteAutres
          : Math.round(parseFloat(l.montant) * 100) / 100,
      })).filter(l => l.montant > 0)

      // @ts-expect-error dispatch_411 absente du schéma généré
      const { error } = await supabase.rpc('dispatch_411', {
        p_numero_411: factureActive.numero_piece,
        p_operateur: utilisateur?.email?.split('@')[0] ?? 'inconnu',
        p_lettrages: payload,
      })
      if (error) throw error

      const numerosLettres = payload
        .filter(l => l.code_client !== 'AUTRES' && l.numero_facture)
        .map(l => ({ numeroPiece: l.numero_facture, montant: l.montant }))

      onSuccess({
        numerosLettres,
        montantTotal: Math.round(payload.reduce((s, l) => s + l.montant, 0) * 100) / 100,
      })
      annuler()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur lors du dispatch 411.')
    } finally {
      setChargement(false)
    }
  }

  const creditDisponible = factureActive ? Math.abs(factureActive.reste_du) : 0
  const montantAttribue = Math.round(lignesForme.reduce((s, l) => s + (parseFloat(l.montant) || 0), 0) * 100) / 100
  const restant = Math.round((creditDisponible - montantAttribue) * 100) / 100

  const clientsDispatches = [...new Set(lignesForme.map(l => l.info_facture?.code_client).filter(Boolean))]
  const warningMultiClient = clientsDispatches.length > 1

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
    factureActive, lignesForme,
    chargement,
    selectionnerFacture411, annuler, ajouterLigne, supprimerLigne,
    modifierLigne, chercherInfoFacture, injecterLignes, valider, peutValider, motifInvalide,
    creditDisponible, montantAttribue, restant,
    warningMultiClient,
  }
}
