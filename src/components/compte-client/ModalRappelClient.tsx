import { useState } from 'react'
import { useGmailAuth } from '../../hooks/useGmailAuth'
import { useOutlookAuth } from '../../hooks/useOutlookAuth'
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

async function creerEvenementGoogle(
  accessToken: string,
  titre:       string,
  prevu_le:    string,
  heure:       string | null,
  note:        string | null,
): Promise<string | null> {
  let start, end
  if (heure) {
    const [h, m] = heure.split(':').map(Number)
    const endH   = String(Math.min(h + 1, 23)).padStart(2, '0')
    const endM   = String(m).padStart(2, '0')
    start = { dateTime: `${prevu_le}T${heure}:00`, timeZone: 'Europe/Paris' }
    end   = { dateTime: `${prevu_le}T${endH}:${endM}:00`, timeZone: 'Europe/Paris' }
  } else {
    start = { date: prevu_le }
    end   = { date: prevu_le }
  }
  try {
    const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method:  'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ summary: titre, description: note ?? '', start, end }),
    })
    if (!res.ok) return null
    const data = await res.json()
    return (data.id as string) ?? null
  } catch {
    return null
  }
}

async function creerEvenementOutlook(
  accessToken: string,
  titre:       string,
  prevu_le:    string,
  heure:       string | null,
  note:        string | null,
): Promise<string | null> {
  const startHeure = heure ?? '09:00'
  const [h, m]     = startHeure.split(':').map(Number)
  const endH       = String(Math.min(h + 1, 23)).padStart(2, '0')
  const endM       = String(m).padStart(2, '0')
  try {
    const res = await fetch('https://graph.microsoft.com/v1.0/me/events', {
      method:  'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject:  titre,
        body:     { contentType: 'text', content: note ?? '' },
        start:    { dateTime: `${prevu_le}T${startHeure}:00`, timeZone: 'Europe/Paris' },
        end:      { dateTime: `${prevu_le}T${endH}:${endM}:00`, timeZone: 'Europe/Paris' },
        isAllDay: !heure,
      }),
    })
    if (!res.ok) return null
    const data = await res.json()
    return (data.id as string) ?? null
  } catch {
    return null
  }
}

export function ModalRappelClient({ codeClient: _codeClient, nomClient, rappels, creerRappel, supprimerRappel, onClose }: Props) {
  const gmail   = useGmailAuth()
  const outlook = useOutlookAuth()

  const [prevu_le, setPrevu_le] = useState('')
  const [heure,    setHeure]    = useState('')
  const [note,     setNote]     = useState('')
  const [enCours,  setEnCours]  = useState(false)

  const provider = gmail.token ? 'gmail' : outlook.token ? 'outlook' : null

  async function handleSubmit() {
    if (!prevu_le) return
    setEnCours(true)
    try {
      let calendarEventId: string | null = null
      const titre = `Rappel — ${nomClient}`

      if (provider === 'gmail') {
        const token = await gmail.getTokenValide()
        if (token) {
          calendarEventId = await creerEvenementGoogle(token, titre, prevu_le, heure || null, note || null)
          if (!calendarEventId) toast('Rappel créé sans calendrier — reconnectez Gmail pour activer Google Calendar', { icon: '⚠️' })
        }
      } else if (provider === 'outlook') {
        const token = await outlook.getTokenValide()
        if (token) {
          calendarEventId = await creerEvenementOutlook(token, titre, prevu_le, heure || null, note || null)
          if (!calendarEventId) toast('Rappel créé sans calendrier — reconnectez Outlook pour activer Outlook Calendar', { icon: '⚠️' })
        }
      }

      const ok = await creerRappel({ prevu_le, heure: heure || null, note: note || null, calendar_event_id: calendarEventId })
      if (!ok) { toast.error('Erreur lors de l\'enregistrement'); return }
      if (calendarEventId) toast.success('Rappel créé · Événement ajouté au calendrier')
      else if (provider) { /* message déjà affiché */ }
      else toast.success('Rappel créé')
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setEnCours(false)
    }
  }

  const aujourd_hui = new Date().toISOString().slice(0, 10)

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-gray-800">Rappel personnel</h3>
            <p className="text-[11px] text-gray-400 mt-0.5 truncate max-w-[220px]">{nomClient}</p>
          </div>
          <button onClick={onClose} className="text-gray-300 hover:text-gray-500 transition-colors">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">

          {/* Rappels existants */}
          {rappels.length > 0 && (
            <div className="space-y-1.5">
              {rappels.map(r => (
                <div key={r.id} className="flex items-center justify-between bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                  <div className="min-w-0">
                    <span className="text-xs font-semibold text-blue-700">
                      {new Date(r.prevu_le + 'T12:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
                      {r.heure && <span className="ml-1 font-mono">{r.heure.slice(0, 5)}</span>}
                    </span>
                    {r.note && <p className="text-[10px] text-blue-500 mt-0.5 truncate">{r.note}</p>}
                  </div>
                  <button
                    onClick={() => supprimerRappel(r.id)}
                    className="text-blue-200 hover:text-red-400 transition-colors ml-3 flex-shrink-0"
                    title="Supprimer ce rappel"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Formulaire */}
          <div className="space-y-2.5">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Date</label>
                <input
                  type="date"
                  value={prevu_le}
                  onChange={e => setPrevu_le(e.target.value)}
                  min={aujourd_hui}
                  autoFocus
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 outline-none focus:border-ockham-teal transition-colors"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">
                  Heure <span className="normal-case font-normal text-gray-300">(opt.)</span>
                </label>
                <input
                  type="time"
                  value={heure}
                  onChange={e => setHeure(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 outline-none focus:border-ockham-teal transition-colors"
                />
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">
                Note <span className="normal-case font-normal text-gray-300">(opt.)</span>
              </label>
              <input
                type="text"
                value={note}
                onChange={e => setNote(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                placeholder="Ex : Relancer pour accord de paiement…"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 outline-none focus:border-ockham-teal transition-colors"
              />
            </div>
          </div>

          {/* Indicateur provider */}
          {provider ? (
            <p className="text-[10px] text-gray-400">
              Événement créé dans{' '}
              <span className="font-semibold text-gray-600">
                {provider === 'gmail' ? 'Google Calendar' : 'Outlook Calendar'}
              </span>
            </p>
          ) : (
            <p className="text-[10px] text-amber-500">
              Connectez Gmail ou Outlook pour créer aussi un événement calendrier.
            </p>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              onClick={onClose}
              className="text-xs text-gray-400 border border-gray-200 hover:border-gray-300 px-3 py-1.5 rounded-lg transition-colors"
            >Annuler</button>
            <button
              onClick={handleSubmit}
              disabled={!prevu_le || enCours}
              className="text-xs font-semibold text-white bg-ockham-teal hover:bg-ockham-teal-dark px-4 py-1.5 rounded-lg disabled:opacity-40 transition-colors"
            >{enCours ? '…' : 'Créer le rappel'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
