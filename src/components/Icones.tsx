// Icônes SVG partagées — stroke 1.8px, viewBox 24×24, Feather/Heroicons style
interface SvgProps { size?: number; className?: string; color?: string }

function Svg({ size = 15, className = '', color, children }: SvgProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size} height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color ?? 'currentColor'}
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {children}
    </svg>
  )
}

export function IcSearch(p: SvgProps) {
  return <Svg {...p}><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L19 19"/></Svg>
}
export function IcClock(p: SvgProps) {
  return <Svg {...p}><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 15"/></Svg>
}
export function IcDownload(p: SvgProps) {
  return <Svg {...p}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></Svg>
}
export function IcEdit(p: SvgProps) {
  return <Svg {...p}><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></Svg>
}
export function IcWarning(p: SvgProps) {
  return <Svg {...p}><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></Svg>
}
export function IcUsers(p: SvgProps) {
  return <Svg {...p}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></Svg>
}
export function IcUser(p: SvgProps) {
  return <Svg {...p}><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></Svg>
}
export function IcSliders(p: SvgProps) {
  return (
    <Svg {...p}>
      <line x1="4" y1="6" x2="20" y2="6"/>
      <line x1="4" y1="12" x2="20" y2="12"/>
      <line x1="4" y1="18" x2="20" y2="18"/>
      <circle cx="8" cy="6" r="2" fill="currentColor" stroke="none"/>
      <circle cx="16" cy="12" r="2" fill="currentColor" stroke="none"/>
      <circle cx="10" cy="18" r="2" fill="currentColor" stroke="none"/>
    </Svg>
  )
}
export function IcLink(p: SvgProps) {
  return <Svg {...p}><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></Svg>
}
export function IcNewspaper(p: SvgProps) {
  return <Svg {...p}><path d="M4 22h16a2 2 0 002-2V4a2 2 0 00-2-2H8a2 2 0 00-2 2v16a2 2 0 01-2 2zm0 0a2 2 0 01-2-2v-9c0-1.1.9-2 2-2h2"/><line x1="12" y1="10" x2="18" y2="10"/><line x1="12" y1="14" x2="18" y2="14"/><line x1="12" y1="18" x2="18" y2="18"/></Svg>
}
export function IcBell(p: SvgProps) {
  return <Svg {...p}><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></Svg>
}
export function IcTrash(p: SvgProps) {
  return <Svg {...p}><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></Svg>
}
export function IcLogOut(p: SvgProps) {
  return <Svg {...p}><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></Svg>
}
export function IcSun(p: SvgProps) {
  return <Svg {...p}><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></Svg>
}
export function IcMoon(p: SvgProps) {
  return <Svg {...p}><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></Svg>
}
export function IcCursor(p: SvgProps) {
  return <Svg {...p}><path d="M5 3l14 9-7 1-4 7-3-17z"/></Svg>
}
export function IcNetwork(p: SvgProps) {
  return <Svg {...p}><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></Svg>
}
export function IcFileText(p: SvgProps) {
  return <Svg {...p}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></Svg>
}
export function IcBuilding(p: SvgProps) {
  return <Svg {...p}><path d="M3 21h18M3 7v14M21 7v14M6 21V7M18 21V7"/><path d="M3 7l9-4 9 4"/><line x1="9" y1="21" x2="9" y2="14"/><line x1="15" y1="21" x2="15" y2="14"/><rect x="9" y="14" width="6" height="7"/></Svg>
}
export function IcUpload(p: SvgProps) {
  return <Svg {...p}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></Svg>
}
export function IcKey(p: SvgProps) {
  return <Svg {...p}><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></Svg>
}
export function IcRefund(p: SvgProps) {
  return <Svg {...p}><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></Svg>
}
export function IcContacts(p: SvgProps) {
  return <Svg {...p}><path d="M4 4h16a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2z"/><circle cx="9" cy="10" r="3"/><path d="M15 8h2M15 12h2M6 16c0-1.1 1.34-2 3-2s3 .9 3 2"/></Svg>
}
export function IcBarChart(p: SvgProps) {
  return <Svg {...p}><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></Svg>
}
