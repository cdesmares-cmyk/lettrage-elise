// Contexte global de la correction — survit à la navigation inter-pages
import { createContext, useContext, useRef, useState } from 'react'
import type { ClasseLettrage, InfoFacture } from '../types/lettrage'

export interface LigneCorr {
  _key: string
  classe: ClasseLettrage
  numero_facture: string
  montant: string
  info_facture: InfoFacture | null
  chargement: boolean
}

let _ck = 200
function cle() { return String(++_ck) }
export function nouvelleLigneCorr(): LigneCorr {
  return { _key: cle(), classe: 'facture', numero_facture: '', montant: '', info_facture: null, chargement: false }
}

interface CorrectionContextValue {
  ouvert: boolean
  minimise: boolean
  onglet: 'correction' | 'remboursement' | 'historique'
  lignesCorrection: LigneCorr[]
  ouvrir: () => void
  fermer: () => void
  minimiser: () => void
  restaurer: () => void
  setLignesCorrection: React.Dispatch<React.SetStateAction<LigneCorr[]>>
  setOnglet: (o: 'correction' | 'remboursement' | 'historique') => void
  enregistrerOnSuccess: (fn: () => void) => void
  declencherOnSuccess: () => void
}

const CorrectionContext = createContext<CorrectionContextValue | null>(null)

export function FournisseurCorrection({ children }: { children: React.ReactNode }) {
  const [ouvert, setOuvert] = useState(false)
  const [minimise, setMinimise] = useState(false)
  const [onglet, setOnglet] = useState<'correction' | 'remboursement' | 'historique'>('correction')
  const [lignesCorrection, setLignesCorrection] = useState<LigneCorr[]>([nouvelleLigneCorr(), nouvelleLigneCorr()])
  const onSuccessRef = useRef<(() => void) | null>(null)

  function ouvrir() { setOuvert(true); setMinimise(false) }

  function fermer() {
    setOuvert(false)
    setMinimise(false)
    setOnglet('correction')
    setLignesCorrection([nouvelleLigneCorr(), nouvelleLigneCorr()])
  }

  function minimiser() { setMinimise(true) }

  function restaurer() { setMinimise(false) }

  function enregistrerOnSuccess(fn: () => void) { onSuccessRef.current = fn }

  function declencherOnSuccess() { onSuccessRef.current?.() }

  return (
    <CorrectionContext.Provider value={{
      ouvert, minimise, onglet, lignesCorrection,
      ouvrir, fermer, minimiser, restaurer,
      setLignesCorrection, setOnglet,
      enregistrerOnSuccess, declencherOnSuccess,
    }}>
      {children}
    </CorrectionContext.Provider>
  )
}

export function useCorrectionContext() {
  const ctx = useContext(CorrectionContext)
  if (!ctx) throw new Error('useCorrectionContext must be used within FournisseurCorrection')
  return ctx
}
