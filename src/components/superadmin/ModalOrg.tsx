import { useEffect, useRef, useState } from 'react'
import { type OrganisationSA } from '../../hooks/useSuperAdmin'
import { useSuperAdminOrg, type UtilisateurDetailSA } from '../../hooks/useSuperAdminOrg'
import { SectionMonitoring } from './SectionMonitoring'

const IcX    = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
const IcPlus = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
const IcChevron = () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>

const formaterEuros = (val: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(val)
const formaterDate  = (iso: string | null) => !iso ? '—' : new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })

// ── Ligne utilisateur ─────────────────────────────────────────────────────────

function LigneUtilisateur({ u, actions }: {
  u: UtilisateurDetailSA
  actions: ReturnType<typeof useSuperAdminOrg>
}) {
  const [menuOuvert, setMenuOuvert] = useState(false)
  const [tempPwd, setTempPwd]       = useState<string | null>(null)
  const [copie, setCopie]           = useState(false)
  const [enCours, setEnCours]       = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOuvert) return
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOuvert(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [menuOuvert])

  async function handleAction(type: string) {
    setMenuOuvert(false)
    setEnCours(type)
    if (type === 'reset')   await actions.resetUserPassword(u.email)
    if (type === 'invite')  await actions.resendInvitation(u.email)
    if (type === 'suspend') await actions.suspendUser(u.id, !u.suspendu)
    if (type === 'temp') {
      const pwd = await actions.setTempPassword(u.id)
      if (pwd) setTempPwd(pwd)
    }
    setEnCours(null)
  }

  function copierPwd() {
    if (!tempPwd) return
    navigator.clipboard.writeText(tempPwd)
    setCopie(true)
    setTimeout(() => setCopie(false), 2000)
  }

  const itemCls = 'w-full flex items-center gap-2.5 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer text-left'

  return (
    <>
      <tr className="border-t border-gray-100 hover:bg-gray-50/50 transition-colors">
        <td className="py-2.5 px-3 overflow-hidden">
          <p className="text-sm font-semibold text-gray-900 leading-tight truncate">{u.nom_affiche || '—'}</p>
          <p className="text-[11px] text-gray-400 mt-0.5 truncate">{u.email}</p>
        </td>
        <td className="py-2.5 px-3">
          <select value={u.role} onChange={e => actions.updateUserRole(u.id, e.target.value)}
            className="border border-gray-200 rounded-md px-2 py-1 text-xs font-semibold font-[inherit] cursor-pointer focus:outline-none focus:ring-1 focus:ring-ockham-teal/40 w-full">
            {['admin', 'commercial', 'lecteur', 'responsable_poste_client'].map(r => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </td>
        <td className="py-2.5 px-3 text-xs text-gray-500 whitespace-nowrap">{formaterDate(u.derniere_connexion)}</td>
        <td className="py-2.5 px-3 whitespace-nowrap">
          {u.suspendu
            ? <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-50 text-red-600">Suspendu</span>
            : u.invitation_en_attente
            ? <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-600">Invitation en attente</span>
            : <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-50 text-green-700">Actif</span>
          }
        </td>
        <td className="py-2.5 px-3">
          <div ref={menuRef} className="relative inline-block">
            <button
              onClick={() => setMenuOuvert(v => !v)}
              disabled={!!enCours}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:border-ockham-teal hover:text-ockham-teal-dark hover:bg-ockham-teal-muted transition-all cursor-pointer disabled:opacity-40"
            >
              {enCours ? 'En cours…' : 'Actions compte'}
              <IcChevron />
            </button>

            {menuOuvert && (
              <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-lg py-1 min-w-[190px]">
                <button className={itemCls} onClick={() => handleAction(u.invitation_en_attente ? 'invite' : 'reset')}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                  {u.invitation_en_attente ? 'Renvoyer invitation' : 'Reset mdp'}
                </button>
                {!u.invitation_en_attente && (
                  <button className={itemCls} onClick={() => handleAction('temp')}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                    Mdp temporaire
                  </button>
                )}
                <div className="border-t border-gray-100 my-1" />
                <button className={`${itemCls} ${u.suspendu ? 'text-green-700 hover:!bg-green-50' : 'text-red-600 hover:!bg-red-50'}`} onClick={() => handleAction('suspend')}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  {u.suspendu ? 'Réactiver le compte' : 'Suspendre le compte'}
                </button>
              </div>
            )}
          </div>
        </td>
      </tr>

      {/* Modale mdp temporaire */}
      {tempPwd && (
        <tr className="contents">
          <td className="contents">
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setTempPwd(null)}>
              <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4" onClick={e => e.stopPropagation()}>
                <p className="text-sm font-bold text-gray-900 mb-0.5">Mot de passe temporaire</p>
                <p className="text-xs text-gray-400 mb-4">{u.nom_affiche || u.email}</p>
                <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-xl px-4 py-3 mb-4">
                  <span className="font-mono font-bold text-green-800 text-xl tracking-widest">{tempPwd}</span>
                </div>
                <div className="flex gap-2">
                  <button onClick={copierPwd}
                    className="flex-1 px-4 py-2 bg-ockham-teal text-white rounded-lg text-sm font-semibold hover:bg-ockham-teal-dark transition-colors cursor-pointer">
                    {copie ? '✓ Copié' : 'Copier'}
                  </button>
                  <button onClick={() => setTempPwd(null)}
                    className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:border-gray-300 cursor-pointer">
                    Fermer
                  </button>
                </div>
                <p className="text-[11px] text-gray-400 mt-3 text-center">Non affiché à nouveau après fermeture.</p>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// ── Modal principale ──────────────────────────────────────────────────────────

export function ModalOrg({ org, onFermer, onToggle }: {
  org: OrganisationSA
  onFermer: () => void
  onToggle: (id: string, actif: boolean) => void
}) {
  const orgActions = useSuperAdminOrg()
  const { detail, chargement, chargerDetail, inviteUser } = orgActions
  const [formInvite, setFormInvite]   = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteNom, setInviteNom]     = useState('')
  const [inviteRole, setInviteRole]   = useState('commercial')
  const [inviteEnvoi, setInviteEnvoi] = useState(false)

  useEffect(() => {
    chargerDetail(org.id)
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onFermer() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [org.id, chargerDetail, onFermer])

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    setInviteEnvoi(true)
    const ok = await inviteUser({ organisation_id: org.id, email: inviteEmail.trim(), nom_affiche: inviteNom.trim(), role: inviteRole })
    setInviteEnvoi(false)
    if (ok) { setFormInvite(false); setInviteEmail(''); setInviteNom('') }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onFermer}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl flex flex-col overflow-hidden"
        style={{ maxHeight: '90vh' }} onClick={e => e.stopPropagation()}>

        {/* En-tête navy */}
        <div className="bg-ockham-navy px-6 py-4 flex-shrink-0">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h2 className="text-white font-bold text-lg leading-tight">{org.nom}</h2>
              <p className="text-ockham-teal text-xs font-mono mt-0.5 opacity-80">{org.slug}</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-white/50">Actif</span>
                <button onClick={() => onToggle(org.id, !org.actif)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer ${org.actif ? 'bg-ockham-teal' : 'bg-white/20'}`}>
                  <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${org.actif ? 'translate-x-4' : 'translate-x-1'}`} />
                </button>
              </div>
              <button onClick={onFermer} className="text-white/50 hover:text-white transition-colors cursor-pointer p-1"><IcX /></button>
            </div>
          </div>
          <div className="flex items-center gap-5 flex-wrap text-xs text-white/55">
            <span>Créée le <strong className="text-white/80">{formaterDate(org.cree_le)}</strong></span>
            <span className="w-px h-3 bg-white/15" />
            <span><strong className="text-white/80">{org.nb_utilisateurs}</strong> utilisateurs</span>
            <span className="w-px h-3 bg-white/15" />
            <span><strong className="text-white/80">{org.nb_clients}</strong> clients</span>
            <span className="w-px h-3 bg-white/15" />
            <span>Encours <strong className="text-ockham-teal">{formaterEuros(org.encours_total)}</strong></span>
            <span className="w-px h-3 bg-white/15" />
            <span className={`flex items-center gap-1 ${org.axonaut_actif ? 'text-ockham-teal' : 'text-white/30'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${org.axonaut_actif ? 'bg-ockham-teal' : 'bg-white/20'}`} />
              Axonaut {org.axonaut_actif ? 'connecté' : 'non configuré'}
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="px-6 py-5 border-b border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Utilisateurs <span className="ml-1 bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full text-[10px]">{detail?.utilisateurs.length ?? '—'}</span></p>
              <button onClick={() => setFormInvite(v => !v)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-ockham-teal text-white rounded-lg hover:bg-ockham-teal-dark transition-colors cursor-pointer">
                <IcPlus /> Ajouter
              </button>
            </div>

            {formInvite && (
              <form onSubmit={handleInvite} className="mb-4 p-3 bg-ockham-teal-muted rounded-xl border border-ockham-teal/20 flex items-end gap-3 flex-wrap">
                <div className="flex-1 min-w-[180px]">
                  <label className="block text-[10px] font-semibold text-gray-500 mb-1">Email *</label>
                  <input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} required placeholder="prenom@client.com"
                    className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ockham-teal/40" />
                </div>
                <div className="flex-1 min-w-[140px]">
                  <label className="block text-[10px] font-semibold text-gray-500 mb-1">Nom affiché</label>
                  <input type="text" value={inviteNom} onChange={e => setInviteNom(e.target.value)} placeholder="Prénom Nom"
                    className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ockham-teal/40" />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-gray-500 mb-1">Rôle</label>
                  <select value={inviteRole} onChange={e => setInviteRole(e.target.value)}
                    className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs font-[inherit] focus:outline-none cursor-pointer">
                    <option value="admin">admin</option>
                    <option value="commercial">commercial</option>
                    <option value="lecteur">lecteur</option>
                  </select>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setFormInvite(false)}
                    className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-600 hover:border-gray-300 cursor-pointer">Annuler</button>
                  <button type="submit" disabled={inviteEnvoi || !inviteEmail.trim()}
                    className="px-3 py-1.5 text-xs font-semibold bg-ockham-teal text-white rounded-lg hover:bg-ockham-teal-dark disabled:opacity-40 cursor-pointer">
                    {inviteEnvoi ? 'Envoi…' : 'Inviter'}
                  </button>
                </div>
              </form>
            )}

            {chargement
              ? <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-10 bg-gray-100 rounded-lg animate-pulse" />)}</div>
              : (
              <div className="overflow-x-auto">
                <table className="w-full table-fixed">
                  <colgroup><col className="w-[26%]" /><col className="w-[18%]" /><col className="w-[16%]" /><col className="w-[18%]" /><col className="w-[22%]" /></colgroup>
                  <thead>
                    <tr className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                      <th className="text-left pb-2 px-3">Utilisateur</th>
                      <th className="text-left pb-2 px-3">Rôle</th>
                      <th className="text-left pb-2 px-3">Dernière connexion</th>
                      <th className="text-left pb-2 px-3">Statut</th>
                      <th className="text-left pb-2 px-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(detail?.utilisateurs ?? []).map(u => (
                      <LigneUtilisateur key={u.id} u={u} actions={orgActions} />
                    ))}
                    {detail?.utilisateurs.length === 0 && (
                      <tr><td colSpan={5} className="py-6 text-center text-sm text-gray-400 italic">Aucun utilisateur dans cette organisation.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {!chargement && detail && detail.runs.length > 0 && (
            <div className="px-6 py-5">
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-3">Edge Functions</p>
              <SectionMonitoring runs={detail.runs} /></div>
          )}
        </div>

        <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-between bg-gray-50/50 flex-shrink-0">
          <p className="text-[11px] text-gray-300 font-mono">id : {org.id.slice(0, 8)}…</p>
          <button onClick={onFermer} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 border border-gray-200 hover:border-gray-300 rounded-lg transition-colors cursor-pointer">Fermer</button>
        </div>
      </div>
    </div>
  )
}
