// Utilitaires date sans dépendance externe
// Toujours utiliser les composantes locales pour éviter le décalage UTC (France UTC+1/+2)

export function toLocalIso(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function debutMoisLocal(d: Date = new Date()): string {
  return toLocalIso(new Date(d.getFullYear(), d.getMonth(), 1))
}

export function todayLocal(): string {
  return toLocalIso(new Date())
}
