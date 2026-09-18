import { useState, useEffect } from 'react'
import { useGmailAuth } from '../../hooks/useGmailAuth'
import { useOutlookAuth } from '../../hooks/useOutlookAuth'
import { CalendrierSemaine } from './CalendrierSemaine'
import type { Rappel } from '../../hooks/useRappelClient'
import toast from 'react-hot-toast'

interface Props {
  codeClient:      string
  nomClient:       string
  rappels:         Rappel[]
  creerRappel:     (p: { prevu_le: string; heure?: string | null; note?: string | null; calendar_event_id?: string | null }) => Promise<boolean>
  supprimerRappel: (id: string) => Promise<void>
  onClose:         () => void
}

async function creerEvenementGoogle(token: string, titre: string, prevu_le: string, heure: string | null, note: string | null): Promise<string | null> {
  let start, end
  if (heure) {
    const [h, m] = heure.split(':').map(Number)
    const endH   = String(Math.min(h + 1, 23)).padStart(2, '0')
    start = { dateTime: `${prevu_le}T${heure}:00`, timeZone: 'Europe/Paris' }
    end   = { dateTime: `${prevu_le}T${endH}:${String(m).padStart(2, '0')}:00`, timeZone: 'Europe/Paris' }
  } else {
    start = { date: prevu_le }; end = { date: prevu_le }
  }
  try {
    const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ summary: titre, description: note ?? '', start, end }),
    })
    if (!res.ok) return null
    return ((await res.json()).id as string) ?? null
  } catch { return null }
}

async function creerEvenementOutlook(token: string, titre: string, prevu_le: string, heure: string | null, note: string | null): Promise<string | null> {
  const startH = heure ?? '09:00'
  const [h, m] = startH.split(':').map(Number)
  const endH   = String(Math.min(h + 1, 23)).padStart(2, '0')
  try {
    const res = await fetch('https://graph.microsoft.com/v1.0/me/events', {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject: titre, body: { contentType: 'text', content: note ?? '' },
        start: { dateTime: `${prevu_le}T${startH}:00`, timeZone: 'Europe/Paris' },
        end:   { dateTime: `${prevu_le}T${endH}:${String(m).padStart(2, '0')}:00`, timeZone: 'Europe/Paris' },
        isAllDay: !heure,
      }),
    })
    if (!res.ok) return null
    return ((await res.json()).id as string) ?? null
  } catch { return null }
}

function labelDate(prevu_le: string, heure: string): string {
  const d = new Date(prevu_le + 'T12:00:00')
  const date = d.toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long' })
  return `${date.charAt(0).toUpperCase() + date.slice(1)} · ${heure}`
}

export function ModalRappelClient({ codeClient: _codeClient, nomClient, rappels, creerRappel, supprimerRappel, onClose }: Props) {
  const gmail   = useGmailAuth()
  const outlook = useOutlookAuth()

  const [prevu_le,     setPrevu_le]     = useState('')
  const [heure,        setHeure]        = useState('')
  const [note,         setNote]         = useState('')
  const [enCours,      setEnCours]      = useState(false)
  const [accessToken,  setAccessToken]  = useState<string | null>(null)

  const provider = gmail.token ? 'gmail' : outlook.token ? 'outlook' : null

  useEffect(() => {
    async function charger() {
      if (gmail.token)        setAccessToken(await gmail.getTokenValide())
      else if (outlook.token) setAccessToken(await outlook.getTokenValide())
    }
    charger()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gmail.token, outlook.token])

  async function handleSubmit() {
    if (!prevu_le) { toast.error('Sélectionnez un créneau'); return }
    setEnCours(true)
    try {
      let calendarEventId: string | null = null
      const titre = `Rappel — ${nomClient}`
      if (provider === 'gmail' && accessToken) {
        calendarEventId = await creerEvenementGoogle(accessToken, titre, prevu_le, heure || null, note || null)
        if (!calendarEventId) toast('Rappel créé sans calendrier — reconnectez Gmail pour activer Google Calendar', { icon: '⚠️' })
      } else if (provider === 'outlook' && accessToken) {
        calendarEventId = await creerEvenementOutlook(accessToken, titre, prevu_le, heure || null, note || null)
        if (!calendarEventId) toast('Rappel créé sans calendrier — reconnectez Outlook pour activer Outlook Calendar', { icon: '⚠️' })
      }
      const ok = await creerRappel({ prevu_le, heure: heure || null, note: note || null, calendar_event_id: calendarEventId })
      if (!ok) { toast.error('Erreur lors de l\'enregistrement'); return }
      if (calendarEventId) toast.success('Rappel créé · Événement ajouté au calendrier')
      else if (!provider)  toast.success('Rappel créé')
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setEnCours(false)
    }
  }

  const selected = prevu_le ? { prevu_le, heure } : undefined

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl overflow-hidden" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-gray-800">Rappel personnel</h3>
            <p className="text-[11px] text-gray-400 mt-0.5 truncate max-w-[400px]">{nomClient}</p>
          </div>
          <button onClick={onClose} className="text-gray-300 hover:text-gray-500 transition-colors">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">

          {/* Rappels existants (chips) */}
          {rappels.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {rappels.map(r => (
                <div key={r.id} className="flex items-center gap-1.5 bg-blue-50 border border-blue-100 rounded-full px-2.5 py-1 text-[10px]">
                  <span className="font-semibold text-blue-700">
                    {new Date(r.prevu_le + 'T12:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                    {r.heure && ` · ${r.heure.slice(0, 5)}`}
                  </span>
                  {r.note && <span className="text-blue-400 truncate max-w-[120px]">{r.note}</span>}
                  <button onClick={() => supprimerRappel(r.id)} className="text-blue-200 hover:text-red-400 transition-colors ml-0.5">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Calendrier ou saisie manuelle */}
          {provider ? (
            <CalendrierSemaine
              accessToken={accessToken}
              provider={provider}
              selected={selected}
              onSelect={(d, h) => { setPrevu_le(d); setHeure(h) }}
            />
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Date</label>
                <input type="date" value={prevu_le} onChange={e => setPrevu_le(e.target.value)}
                  min={new Date().toISOString().slice(0, 10)} autoFocus
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 outline-none focus:border-ockham-teal transition-colors"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Heure <span className="normal-case font-normal text-gray-300">(opt.)</span></label>
                <input type="time" value={heure} onChange={e => setHeure(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 outline-none focus:border-ockham-teal transition-colors"
                />
              </div>
            </div>
          )}

          {/* Créneau sélectionné + note */}
          <div className="flex items-center gap-3">
            <div className="flex-1">
              {prevu_le ? (
                <div className="flex items-center gap-2 bg-ockham-teal/5 border border-ockham-teal/20 rounded-lg px-3 py-2">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-ockham-teal flex-shrink-0"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                  <span className="text-xs font-semibold text-ockham-teal">{labelDate(prevu_le, heure || '—')}</span>
                  {provider && <span className="text-[10px] text-gray-300 ml-auto">→ {provider === 'gmail' ? 'Google Calendar' : 'Outlook Calendar'}</span>}
                </div>
              ) : (
                <p className="text-[11px] text-gray-300 italic px-1">
                  {provider ? 'Cliquez sur un créneau libre pour sélectionner une date et une heure' : 'Sélectionnez une date'}
                </p>
              )}
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Note <span className="normal-case font-normal text-gray-300">(opt.)</span></label>
            <input type="text" value={note} onChange={e => setNote(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              placeholder="Ex : Relancer pour accord de paiement…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 outline-none focus:border-ockham-teal transition-colors"
            />
          </div>

          {!provider && (
            <p className="text-[10px] text-amber-500">Connectez Gmail ou Outlook pour créer aussi un événement calendrier.</p>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button onClick={onClose} className="text-xs text-gray-400 border border-gray-200 hover:border-gray-300 px-3 py-1.5 rounded-lg transition-colors">Annuler</button>
            <button onClick={handleSubmit} disabled={!prevu_le || enCours}
              className="text-xs font-semibold text-white bg-ockham-teal hover:bg-ockham-teal-dark px-4 py-1.5 rounded-lg disabled:opacity-40 transition-colors"
            >{enCours ? '…' : 'Créer le rappel'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
