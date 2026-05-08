-- Migration 007 : Index de performance
-- Accélère les vues v_factures_avec_reste_du et v_comptes_clients
-- Ces index transforment les scans complets (lents) en lookups ciblés

-- Jointure principale dans v_factures_avec_reste_du : factures ↔ lettrages
CREATE INDEX IF NOT EXISTS idx_factures_code_client       ON factures(code_client);
CREATE INDEX IF NOT EXISTS idx_lettrages_numero_facture   ON lettrages(numero_facture);

-- Filtre "factures actives" (reste_du > 0) depuis le contexte React
CREATE INDEX IF NOT EXISTS idx_factures_est_avoir         ON factures(est_avoir);

-- Jointure dans le module lettrage : lettrages ↔ lignes_bancaires
CREATE INDEX IF NOT EXISTS idx_lettrages_id_ligne_bancaire ON lettrages(id_ligne_bancaire);
