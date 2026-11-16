// Hook CRUD pour les remises Chèque / LCR (Sprint 4)
import { useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import toast from 'react-hot-toast'
import type { Remise, LigneFormRemise } from '../types/remise'

export interface RemiseSuccessData {
  numerosLettres: { numeroPiece: string; montant: number }[]
}

function errMsg(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message
  if (err && typeof err === 'object' && 'message' in err) return String((err as { message: unknown }).message)
  return fallback
}

interface RowRemise {
  id: string; type: 'cheque' | 'lcr'; numero: string; montant_total: number | null
  statut: 'en_attente' | 'encaisse'; id_ligne_bancaire: string | null
  date_encaissement: string | null; cree_par: string | null
  operateur: string | null; created_at: string
}
interface RowLettrage {
  id: string; remise_id: string; numero_facture: string | null
  code_client: string; montant: number; commentaire: string | null
}

/**
 * Traduit une ligne de formulaire en ligne JSON pour les RPC.
 *
 * Une ligne 471 n'a pas de facture : code_client vaut 'AUTRES', le numéro est
 * ignoré côté SQL, et le libellé part dans « libelle » où la fonction le
 * concatène au commentaire de remise.
 */
function ligneVersJson(l: LigneFormRemise) {
  const autres = l.classe === 'autres'
  return {
    numero_facture: autres ? '' : l.numero_facture.trim(),
    code_client:    autres ? 'AUTRES' : (l.info_facture?.code_client ?? ''),
    montant:        Math.round(parseFloat(l.montant) * 100) / 100,
    libelle:        autres ? l.libelle.trim() : '',
  }
}

export function useRemises(onSuccessCallback?: (data?: RemiseSuccessData) => void) {
  const { utilisateur } = useAuth()
  const [remises, setRemises] = useState<Remise[]>([])
  const [chargement, setChargement] = useState(false)
  const silentRef = useRef(false)

  async function charger() {
    if (!silentRef.current) setChargement(true)
    silentRef.current = false
    try {
      const { data: rd, error: re } = await supabase
        .from('remises').select('*').order('created_at', { ascending: false })
      if (re) throw re
      const rows = (rd as unknown as RowRemise[]) ?? []
      if (rows.length === 0) { setRemises([]); return }

      const ids = rows.map(r => r.id)
      const { data: ld } = await supabase
        .from('lettrages')
        .select('id, remise_id, numero_facture, code_client, montant, commentaire')
        .in('remise_id', ids)
      const lettrages = (ld as unknown as RowLettrage[]) ?? []

      setRemises(rows.map(r => ({
        ...r,
        lignes: lettrages
          .filter(l => l.remise_id === r.id)
          .map(l => ({ id: l.id, numero_facture: l.numero_facture, code_client: l.code_client, montant: l.montant, commentaire: l.commentaire })),
      })))
    } catch (err) {
      console.error('[useRemises]', err)
      toast.error(errMsg(err, 'Erreur lors du chargement des remises.'))
    } finally {
      setChargement(false)
    }
  }

  async function creer(
    type: 'cheque' | 'lcr',
    numero: string,
    lignes: LigneFormRemise[],
    montantLcr: number | null,
  ) {
    setChargement(true)
    try {
      const lignesJson = lignes.map(ligneVersJson)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: remiseId, error } = await (supabase.rpc as any)('creer_remise_atomique', {
        p_type:          type,
        p_numero:        numero,
        p_montant_total: type === 'lcr' ? montantLcr : null,
        p_cree_par:      utilisateur?.id ?? null,
        p_operateur:     utilisateur?.email?.split('@')[0] ?? null,
        p_lignes:        lignesJson,
      })
      if (error) throw error

      const newRemise: Remise = {
        id: remiseId as string, type, numero,
        montant_total: type === 'lcr' ? montantLcr : null,
        statut: 'en_attente', id_ligne_bancaire: null, date_encaissement: null,
        cree_par: utilisateur?.id ?? null,
        operateur: utilisateur?.email?.split('@')[0] ?? null,
        created_at: new Date().toISOString(),
        lignes: lignesJson.map(i => ({
          id: '',
          numero_facture: i.code_client === 'AUTRES' ? null : i.numero_facture,
          code_client: i.code_client,
          montant: i.montant,
          commentaire: null,
        })),
      }
      setRemises(prev => [newRemise, ...prev])
      toast.success(`Remise ${type === 'cheque' ? 'CHQ' : 'LCR'} n°${numero} créée.`)
      // Les lignes 471 sont écartées : elles ne correspondent à aucune facture,
      // donc rien à surligner dans la table de lettrage.
      onSuccessCallback?.({
        numerosLettres: lignesJson
          .filter(i => i.code_client !== 'AUTRES')
          .map(i => ({ numeroPiece: i.numero_facture, montant: i.montant })),
      })
    } catch (err) {
      console.error('[useRemises]', err)
      toast.error(errMsg(err, 'Erreur lors de la création.'))
    } finally {
      setChargement(false)
    }
    silentRef.current = true
    charger()
  }

  async function modifier(
    remiseId: string,
    type: 'cheque' | 'lcr',
    numero: string,
    lignes: LigneFormRemise[],
    montantLcr: number | null,
  ) {
    setChargement(true)
    try {
      const lignesJson = lignes.map(ligneVersJson)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.rpc as any)('modifier_remise_atomique', {
        p_remise_id:     remiseId,
        p_type:          type,
        p_numero:        numero,
        p_montant_total: type === 'lcr' ? montantLcr : null,
        p_lignes:        lignesJson,
      })
      if (error) throw error
      toast.success('Remise mise à jour.')
      await charger()
      onSuccessCallback?.()
    } catch (err) {
      console.error('[useRemises]', err)
      toast.error(errMsg(err, 'Erreur lors de la modification.'))
    } finally {
      setChargement(false)
    }
  }

  async function supprimer(remiseId: string) {
    const remise = remises.find(r => r.id === remiseId)
    if (remise?.statut === 'encaisse') {
      toast.error('Impossible de supprimer une remise déjà encaissée.')
      return
    }
    setChargement(true)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.rpc as any)('supprimer_remise_atomique', { p_remise_id: remiseId })
      if (error) throw error
      toast.success('Remise annulée et lettrages supprimés.')
      await charger()
      onSuccessCallback?.()
    } catch (err) {
      console.error('[useRemises]', err)
      toast.error(errMsg(err, 'Erreur lors de l\'annulation.'))
    } finally {
      setChargement(false)
    }
  }

  async function encaisser(remiseId: string, idLigneBancaire: string) {
    setChargement(true)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.rpc as any)('encaisser_remise_atomique', {
        p_remise_id:         remiseId,
        p_id_ligne_bancaire: idLigneBancaire,
      })
      if (error) throw error
      toast.success('Remise encaissée — lettrages finalisés.')
      await charger()
      onSuccessCallback?.()
    } catch (err) {
      console.error('[useRemises]', err)
      const msg  = (err as { message?: string })?.message ?? ''
      const code = (err as { code?: string })?.code ?? ''
      if (msg.includes('doublon_lettrage') || code === '23505') {
        toast.error('Ces factures sont déjà lettrées sur cette ligne bancaire.')
      } else if (msg.includes('déjà été encaissée')) {
        toast.error('Cette remise a déjà été encaissée.')
      } else {
        toast.error(errMsg(err, 'Erreur lors de l\'encaissement.'))
      }
    } finally {
      setChargement(false)
    }
  }

  return { remises, chargement, charger, creer, modifier, supprimer, encaisser }
}
