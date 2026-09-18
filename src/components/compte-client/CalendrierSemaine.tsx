import { useState, useEffect, useRef } from 'react'

interface CalEvent {
  id:      string
  titre:   string
  debutDt: Date | null
  finDt:   Date | null
}

const JOURS   = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
const MOIS    = ['jan.', 'fév.', 'mar.', 'avr.', 'mai', 'jun.', 'jul.', 'aoû.', 'sep.', 'oct.', 'nov.', 'déc.']
const START_H = 8
const END_H   = 19
const SLOT_H  = 22  // px par créneau de 30 min

interface Slot { h: number; m: number }

const SLOTS: Slot[] = (() => {
  const s: Slot[] = []
  for (let h = START_H; h <= END_H; h++) {
    s.push({ h, m: 0 })
    if (h < END_H) s.push({ h, m: 30 })
  }
  return s
})()

function lundiDeSemaine(offset: number): Date {
  const d   = new Date()
  const day = d.getDay()
  const lundi = new Date(d)
  lundi.setDate(d.getDate() + (day === 0 ? -6 : 1 - day) + offset * 7)
  lundi.setHours(0, 0, 0, 0)
  return lundi
}

function addJours(d: Date, n: number): Date {
  const r = new Date(d); r.setDate(r.getDate() + n); return r
}

function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function heureStr(slot: Slot): string {
  return `${String(slot.h).padStart(2, '0')}:${String(slot.m).padStart(2, '0')}`
}

function slotOccupe(jour: Date, slot: Slot, events: CalEvent[]): CalEvent | null {
  const debut = new Date(jour); debut.setHours(slot.h, slot.m, 0, 0)
  const fin   = new Date(debut.getTime() + 30 * 60_000)
  for (const e of events) {
    if (!e.debutDt || !e.finDt) continue
    if (e.debutDt < fin && e.finDt > debut) return e
  }
  return null
}

function isDebut(jour: Date, slot: Slot, evt: CalEvent): boolean {
  if (!evt.debutDt) return false
  const debut = new Date(jour); debut.setHours(slot.h, slot.m, 0, 0)
  const fin   = new Date(debut.getTime() + 30 * 60_000)
  return evt.debutDt >= debut && evt.debutDt < fin
}

async function fetchGoogle(token: string, debut: Date, fin: Date): Promise<CalEvent[]> {
  try {
    const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events')
    url.searchParams.set('timeMin', debut.toISOString())
    url.searchParams.set('timeMax', fin.toISOString())
    url.searchParams.set('singleEvents', 'true')
    url.searchParams.set('orderBy', 'startTime')
    url.searchParams.set('maxResults', '250')
    const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) return []
    const data = await res.json()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data.items ?? []).flatMap((item: any) => {
      if (!item.start?.dateTime) return []
      return [{ id: item.id, titre: item.summary ?? '(Sans titre)', debutDt: new Date(item.start.dateTime), finDt: new Date(item.end.dateTime) }]
    })
  } catch { return [] }
}

async function fetchOutlook(token: string, debut: Date, fin: Date): Promise<CalEvent[]> {
  try {
    const url = `https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=${debut.toISOString()}&endDateTime=${fin.toISOString()}&$top=250&$select=subject,start,end,isAllDay`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) return []
    const data = await res.json()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data.value ?? []).flatMap((item: any) => {
      if (item.isAllDay) return []
      const dt = (s: string) => new Date(s.replace(/\.(\d+)$/, '') + 'Z')
      return [{ id: item.id, titre: item.subject ?? '(Sans titre)', debutDt: dt(item.start.dateTime), finDt: dt(item.end.dateTime) }]
    })
  } catch { return [] }
}

interface Props {
  accessToken: string | null
  provider:    'gmail' | 'outlook' | null
  selected?:   { prevu_le: string; heure: string }
  onSelect:    (prevu_le: string, heure: string) => void
}

export function CalendrierSemaine({ accessToken, provider, selected, onSelect }: Props) {
  const [offset,     setOffset]     = useState(0)
  const [events,     setEvents]     = useState<CalEvent[]>([])
  const [chargement, setChargement] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const lundi = lundiDeSemaine(offset)
  const jours = Array.from({ length: 7 }, (_, i) => addJours(lundi, i))

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 2 * SLOT_H
  }, [])

  useEffect(() => {
    if (!accessToken || !provider) { setEvents([]); return }
    const debut = new Date(lundi)
    const fin   = addJours(lundi, 7)
    setChargement(true)
    const fn = provider === 'gmail' ? fetchGoogle : fetchOutlook
    fn(accessToken, debut, fin).then(setEvents).finally(() => setChargement(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offset, accessToken, provider])

  const now        = new Date()
  const finSemaine = addJours(lundi, 6)
  const labelSem   = `${lundi.getDate()} ${MOIS[lundi.getMonth()]} — ${finSemaine.getDate()} ${MOIS[finSemaine.getMonth()]} ${finSemaine.getFullYear()}`

  return (
    <div className="flex flex-col gap-2">
      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button onClick={() => setOffset(o => o - 1)} className="text-[10px] text-gray-400 hover:text-gray-600 px-2 py-1 rounded hover:bg-gray-100 transition-colors">← Précédente</button>
        <span className="text-[11px] font-semibold text-gray-600">{labelSem}</span>
        <button onClick={() => setOffset(o => o + 1)} className="text-[10px] text-gray-400 hover:text-gray-600 px-2 py-1 rounded hover:bg-gray-100 transition-colors">Suivante →</button>
      </div>

      {/* Grille */}
      <div className="border border-gray-200 rounded-xl overflow-hidden text-[10px] select-none">

        {/* En-tête jours */}
        <div className="grid border-b border-gray-200 bg-gray-50" style={{ gridTemplateColumns: '36px repeat(7, 1fr)' }}>
          <div />
          {jours.map((jour, i) => {
            const isAuj = toISO(jour) === toISO(now)
            return (
              <div key={i} className={`text-center py-1.5 border-l border-gray-200 ${isAuj ? 'text-ockham-teal font-bold' : 'text-gray-400'}`}>
                <div className="leading-none">{JOURS[i]}</div>
                <div className="text-[12px] font-bold leading-none mt-0.5">{jour.getDate()}</div>
              </div>
            )
          })}
        </div>

        {/* Corps scrollable */}
        <div ref={scrollRef} className="overflow-y-auto" style={{ maxHeight: '292px' }}>
          {chargement ? (
            <div className="flex items-center justify-center py-10 text-gray-300">Chargement…</div>
          ) : (
            SLOTS.map(slot => (
              <div key={`${slot.h}-${slot.m}`} className="grid border-b border-gray-100 last:border-0" style={{ gridTemplateColumns: '36px repeat(7, 1fr)', minHeight: `${SLOT_H}px` }}>
                {/* Label heure */}
                <div className={`flex items-start justify-end pr-1.5 pt-0.5 border-r border-gray-100 bg-gray-50 leading-none ${slot.m === 0 ? 'text-gray-400' : 'text-gray-200'}`}>
                  {slot.m === 0 && `${slot.h}h`}
                </div>

                {/* Cellules */}
                {jours.map((jour, j) => {
                  const evt      = slotOccupe(jour, slot, events)
                  const dateStr  = toISO(jour)
                  const heureS   = heureStr(slot)
                  const select   = selected?.prevu_le === dateStr && selected?.heure === heureS
                  const slotFin  = new Date(jour); slotFin.setHours(slot.h, slot.m + 30, 0, 0)
                  const passe    = now > slotFin

                  return (
                    <div
                      key={j}
                      title={evt?.titre}
                      onClick={() => !evt && !passe && onSelect(dateStr, heureS)}
                      className={[
                        'border-l border-gray-100 px-0.5 overflow-hidden',
                        select             ? 'bg-ockham-teal'                          : '',
                        evt && !select     ? 'bg-blue-50'                              : '',
                        passe && !evt && !select ? 'bg-gray-50/70 cursor-default'      : '',
                        !evt && !passe && !select ? 'hover:bg-ockham-teal/10 cursor-pointer' : '',
                      ].join(' ')}
                    >
                      {evt && isDebut(jour, slot, evt) && (
                        <span className={`truncate block leading-tight pt-0.5 font-medium ${select ? 'text-white' : 'text-blue-500'}`} style={{ fontSize: '9px' }}>
                          {evt.titre}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            ))
          )}
        </div>
      </div>

      {!accessToken && (
        <p className="text-[10px] text-amber-500 text-center">Connectez Gmail ou Outlook pour voir votre agenda.</p>
      )}
    </div>
  )
}
