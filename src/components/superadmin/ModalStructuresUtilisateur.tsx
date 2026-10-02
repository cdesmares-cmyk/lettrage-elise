// Perimetre d'un compte, vu par OCKHAM.
//
// Rattacher quelqu'un a une structure, c'est lui donner acces a une societe
// supplementaire. C'est un acte commercial — une structure se facture — et la
// seule chose qui ne doit jamais pouvoir s'auto-accorder. Cet ecran est donc
// reserve au superadmin, et les ecritures passent par la fonction serveur qui
// reverifie ce role.
//
// La structure d'ORIGINE n'est pas detachable : elle definit le rattachement du
// compte, et la retirer rendrait celui-ci immodifiable. Pour deplacer
// quelqu'un, on change son origine — ce n'est pas la meme operation.
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'

interface OrgRow { id: string; nom: string; code_org: string | null }

export function ModalStructuresUtilisateur({ userId, email, origineId, onFermer }: {
  userId: string
  email: string
  origineId: string
  onFermer: () => void
}) {
  const [organisations, setOrganisations] = useState<OrgRow[] | null>(null)
  const [membres, setMembres] = useState<string[]>([])
  const [enCours, setEnCours] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let annule = false
    // Les organisations se lisent directement — le superadmin les voit toutes.
    // Les appartenances passent par la fonction serveur : leurs regles
    // d'isolation sont ecrites pour les clients, et ne couvrent pas le cas du
    // superadmin consultant le compte d'un tiers.
    Promise.all([
      supabase.from('organisations').select('id, nom, code_org').order('nom'),
      supabase.functions.invoke('superadmin-data', {
        body: { action: 'get_user_structures', user_id: userId },
      }),
    ]).then(([orgs, rep]) => {
      if (annule) return
      setOrganisations((orgs.data ?? []) as OrgRow[])
      const d = rep.data as { structures?: string[] } | null
      setMembres(d?.structures ?? [])
      if (rep.error) console.warn('[Ockham] lecture des structures impossible :', rep.error)
    })
    return () => { annule = true }
  }, [userId, version])

  async function basculer(orgId: string, rattache: boolean) {
    setEnCours(orgId)
    const action = rattache ? 'detach_structure' : 'attach_structure'
    const { data, error } = await supabase.functions.invoke('superadmin-data', {
      body: { action, user_id: userId, organisation_id: orgId },
    })
    // Le message utile est dans le CORPS de la reponse, pas dans l'erreur :
    // invoke ne renvoie qu'un « non-2xx status code » qui n'apprend rien.
    const message = (data as { error?: string } | null)?.error
      ?? (error ? await lireErreur(error) : null)
    if (message) toast.error(message)
    else { toast.success(rattache ? 'Structure retirée' : 'Structure rattachée'); setVersion(v => v + 1) }
    setEnCours(null)
  }

  const rattachees = membres.length

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 px-4" onClick={onFermer}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>

        <div className="px-5 py-4 border-b border-gray-100">
          <p className="font-bold text-gray-900 text-[15px]">Périmètre du compte</p>
          <p className="text-[12px] text-gray-500 mt-0.5 truncate">{email}</p>
        </div>

        <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 text-[12px] text-gray-600">
          {rattachees === 0
            ? 'Compte mono-structure. Rattachez-en une seconde pour activer le portail.'
            : `${rattachees} structures — ce compte voit le portail à chaque connexion.`}
        </div>

        <div className="p-2.5 max-h-[55vh] overflow-y-auto">
          {organisations === null && <p className="px-3 py-2 text-sm text-gray-400">Chargement…</p>}

          {organisations?.map(o => {
            const rattache = membres.includes(o.id)
            const origine  = o.id === origineId
            return (
              <button
                key={o.id}
                onClick={() => !origine && basculer(o.id, rattache)}
                disabled={origine || enCours !== null}
                title={origine ? 'Structure d’origine — non détachable' : rattache ? 'Retirer' : 'Rattacher'}
                className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${
                  rattache ? 'bg-ockham-teal-muted' : 'hover:bg-gray-50'
                } ${origine ? 'opacity-70 cursor-default' : ''} ${enCours !== null ? 'opacity-50' : ''}`}
              >
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-[12px] flex-shrink-0"
                  style={{ background: '#E6F7F5', color: '#3BA89F' }}
                >
                  {o.nom.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-gray-900 text-[13px] truncate leading-tight">{o.nom}</p>
                  {o.code_org && <p className="text-gray-400 text-[10px] font-mono mt-0.5">{o.code_org}</p>}
                </div>
                <span className="text-[10px] font-bold uppercase tracking-[.08em] flex-shrink-0">
                  {enCours === o.id ? <span className="text-gray-400">…</span>
                    : origine       ? <span className="text-ockham-teal-dark">Origine</span>
                    : rattache      ? <span className="text-ockham-teal-dark">Rattachée</span>
                    :                 <span className="text-gray-300">Rattacher</span>}
                </span>
              </button>
            )
          })}
        </div>

        <div className="px-5 py-3 border-t border-gray-100 flex justify-end">
          <button onClick={onFermer} className="text-[13px] font-semibold text-gray-600 hover:text-gray-900 px-3 py-1.5">
            Fermer
          </button>
        </div>
      </div>
    </div>
  )
}

/** Le corps d'une reponse en erreur, quand il est lisible. Sans ca, une
 *  fonction qui explique precisement son refus ne laisse qu'un « non-2xx ». */
async function lireErreur(error: unknown): Promise<string> {
  const ctx = (error as { context?: { json?: () => Promise<unknown> } }).context
  if (ctx?.json) {
    try {
      const corps = await ctx.json() as { error?: string }
      if (corps?.error) return corps.error
    } catch { /* corps illisible */ }
  }
  return error instanceof Error ? error.message : 'Opération refusée'
}
