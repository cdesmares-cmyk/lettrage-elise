// Envoi différé : une fenêtre de quelques secondes pour annuler avant que
// l'email ne parte réellement.
//
// POURQUOI LE DÉLAI EST AVANT L'ENVOI, ET NON APRÈS. Un email remis à l'API
// Gmail ou Outlook ne se rappelle pas — il n'existe aucun « unsend ». La seule
// annulation honnête consiste donc à RETARDER l'appel à l'API. L'autre
// implémentation possible — envoyer tout de suite puis, en cas d'annulation,
// supprimer la ligne dans relances — serait un mensonge : le client aurait son
// email et Ockham aurait effacé sa propre trace. Le pire des deux mondes.
//
// POURQUOI AU NIVEAU DE L'APPLICATION. Le bandeau doit survivre à la fermeture
// du modal de relance, qui se ferme immédiatement après le clic. S'il vivait
// dans le modal, il disparaîtrait avec lui.
//
// LA LIMITE, ASSUMÉE : le délai se déroule dans le navigateur. Fermer l'onglet
// pendant ces secondes annule l'envoi sans le dire. Gmail évite ça parce que
// son délai est côté serveur. D'où l'avertissement beforeunload ci-dessous, et
// un délai volontairement court. La vraie solution serait une file d'attente
// côté serveur — disproportionné tant que le besoin reste celui-ci.
//
// MESURE QUI A MOTIVÉ CE CHANTIER, le 2026-11-18 sur SAS MELEZE : sur 1 325
// relances externes, 109 re-relances à moins de 15 jours, dont 66 LE MÊME
// JOUR. Une relance sur vingt est un doublon du jour même. Ce n'est pas une
// pratique de recouvrement, c'est un accident qui se répète.
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import toast from 'react-hot-toast'

/** Durée de la fenêtre d'annulation. Choisie par Clément. */
const DELAI_SECONDES = 5

interface ContexteEnvoiDiffere {
  /**
   * Programme un envoi. L'action n'est exécutée qu'à la fin du compte à
   * rebours, ou immédiatement si un autre envoi est programmé entre-temps.
   */
  programmer: (libelle: string, action: () => Promise<void>) => void
  /** Vrai tant qu'un envoi attend. Sert à bloquer un second clic. */
  enAttente: boolean
}

const Contexte = createContext<ContexteEnvoiDiffere | null>(null)

export function useEnvoiDiffere(): ContexteEnvoiDiffere {
  const ctx = useContext(Contexte)
  if (!ctx) throw new Error('useEnvoiDiffere doit être utilisé dans FournisseurEnvoiDiffere')
  return ctx
}

export function FournisseurEnvoiDiffere({ children }: { children: ReactNode }) {
  const [libelle, setLibelle] = useState<string | null>(null)
  const [restant, setRestant] = useState(DELAI_SECONDES)
  const action = useRef<(() => Promise<void>) | null>(null)

  const executer = useCallback(() => {
    const aFaire = action.current
    action.current = null
    setLibelle(null)
    if (!aFaire) return
    aFaire().catch((err: unknown) => {
      toast.error(err instanceof Error ? err.message : "L'envoi a échoué.")
    })
  }, [])

  const programmer = useCallback((nouveauLibelle: string, nouvelleAction: () => Promise<void>) => {
    // Un envoi déjà en attente part SANS ATTENDRE. On ne garde jamais deux
    // envois suspendus : l'ordre d'arrivée deviendrait impossible à suivre, et
    // le bandeau ne pourrait en annoncer qu'un.
    const precedente = action.current
    action.current = nouvelleAction
    setLibelle(nouveauLibelle)
    setRestant(DELAI_SECONDES)
    if (precedente) {
      precedente().catch((err: unknown) => {
        toast.error(err instanceof Error ? err.message : "L'envoi précédent a échoué.")
      })
    }
  }, [])

  function annuler() {
    action.current = null
    setLibelle(null)
    toast("Annulé — rien n'est parti.", { icon: '↩' })
  }

  // Le compte à rebours. Le setTimeout déclenche l'envoi, l'interval ne sert
  // qu'à l'affichage : séparer les deux évite que le chiffre montré pilote
  // l'exécution.
  useEffect(() => {
    if (!libelle) return
    const fin = setTimeout(executer, DELAI_SECONDES * 1000)
    const tic = setInterval(() => setRestant(r => Math.max(0, r - 1)), 1000)
    return () => { clearTimeout(fin); clearInterval(tic) }
  }, [libelle, executer])

  // Quitter la page pendant la fenêtre annulerait l'envoi en silence.
  useEffect(() => {
    if (!libelle) return
    function avantFermeture(e: BeforeUnloadEvent) {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', avantFermeture)
    return () => window.removeEventListener('beforeunload', avantFermeture)
  }, [libelle])

  return (
    <Contexte.Provider value={{ programmer, enAttente: libelle !== null }}>
      {children}

      {/* En bas à GAUCHE : les toasts occupent le coin droit, et la barre de
          progression de la relance en masse aussi. */}
      {libelle && (
        <div className="fixed bottom-6 left-6 z-[70] flex items-center gap-4 bg-ockham-navy text-white rounded-2xl shadow-2xl px-5 py-3 text-xs animate-fade-up">
          <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-ockham-teal opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-ockham-teal" />
          </span>
          <span className="font-semibold">{libelle}</span>
          <span className="text-slate-400 tabular-nums">part dans {restant} s</span>
          <button
            onClick={annuler}
            className="font-semibold px-3 py-1.5 rounded-lg border border-white/25 hover:bg-white/10 transition-colors cursor-pointer"
          >
            Annuler l'envoi
          </button>
        </div>
      )}
    </Contexte.Provider>
  )
}
