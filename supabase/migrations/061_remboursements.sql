-- Migration 061 : Module remboursement client — deux temps
-- Étape 1 : déclaration (correction modal) → reste_du évolue immédiatement via trigger
-- Étape 2 : affectation ligne Débit → statut = effectue → export comptable + interne

-- ── Tables ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS remboursements (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id   uuid        NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  id_ligne_bancaire varchar(50) REFERENCES lignes_bancaires(id_operation) ON DELETE SET NULL,
  statut            text        NOT NULL DEFAULT 'en_attente' CHECK (statut IN ('en_attente', 'effectue')),
  commentaire       text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid        REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS remboursement_lignes (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  remboursement_id  uuid          NOT NULL REFERENCES remboursements(id) ON DELETE CASCADE,
  numero_facture    varchar(50)   NOT NULL,
  code_client       varchar(50)   NOT NULL,
  montant           numeric(12,2) NOT NULL CHECK (montant > 0)
);

CREATE INDEX IF NOT EXISTS idx_remboursements_org    ON remboursements(organisation_id);
CREATE INDEX IF NOT EXISTS idx_remboursements_statut ON remboursements(statut);
CREATE INDEX IF NOT EXISTS idx_remb_lignes_remb_id   ON remboursement_lignes(remboursement_id);

-- ── RLS ────────────────────────────────────────────────────────────────────────

ALTER TABLE remboursements      ENABLE ROW LEVEL SECURITY;
ALTER TABLE remboursement_lignes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "remboursements_org"       ON remboursements;
DROP POLICY IF EXISTS "remboursement_lignes_org" ON remboursement_lignes;

CREATE POLICY "remboursements_org" ON remboursements
  FOR ALL USING (organisation_id = get_my_organisation_id());

CREATE POLICY "remboursement_lignes_org" ON remboursement_lignes
  FOR ALL USING (
    remboursement_id IN (
      SELECT id FROM remboursements WHERE organisation_id = get_my_organisation_id()
    )
  );

-- ── Trigger : auto-inject organisation_id ──────────────────────────────────────

DROP TRIGGER IF EXISTS remboursements_inject_org_id ON remboursements;
CREATE TRIGGER remboursements_inject_org_id
  BEFORE INSERT ON remboursements
  FOR EACH ROW EXECUTE FUNCTION inject_organisation_id();

-- ── Trigger : sync reste_du sur remboursement_lignes ──────────────────────────
-- INSERT  → reste_du += montant  (la créance se rouvre partiellement)
-- DELETE  → reste_du -= montant  (annulation du remboursement)
-- UPDATE montant → ajustement delta

CREATE OR REPLACE FUNCTION sync_reste_du_remboursement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE factures SET reste_du = reste_du + NEW.montant
    WHERE numero_piece = NEW.numero_facture;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE factures SET reste_du = reste_du - OLD.montant
    WHERE numero_piece = OLD.numero_facture;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE factures SET reste_du = reste_du + (NEW.montant - OLD.montant)
    WHERE numero_piece = NEW.numero_facture;
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_reste_du_remboursement ON remboursement_lignes;
CREATE TRIGGER trg_sync_reste_du_remboursement
  AFTER INSERT OR UPDATE OR DELETE ON remboursement_lignes
  FOR EACH ROW EXECUTE FUNCTION sync_reste_du_remboursement();
