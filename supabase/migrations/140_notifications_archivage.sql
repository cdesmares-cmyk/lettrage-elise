-- ══════════════════════════════════════════════════════════════════════
-- Migration 140 — Archivage des notifications
-- Une notification archivée disparaît du badge et du panneau cloche
-- mais reste visible dans le Journal de notifications
-- ══════════════════════════════════════════════════════════════════════

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS archivee_le timestamptz;

-- Mise à jour de l'index principal pour inclure archivee_le
DROP INDEX IF EXISTS idx_notifications_destinataire;
CREATE INDEX idx_notifications_destinataire
  ON public.notifications USING btree (destinataire_id, lu_le, archivee_le, cree_le DESC);
