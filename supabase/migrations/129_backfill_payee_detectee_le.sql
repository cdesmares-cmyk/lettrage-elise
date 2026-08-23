-- Migration 129 : backfill payee_detectee_le via date réelle de lettrage post-envoi
-- Logique : pour chaque relance envoyée, chercher le premier lettrage (non annulé)
-- dont date_lettrage >= envoyee_le sur les factures de la relance.
-- Si aucun lettrage trouvé → NULL (affichage "—" dans le tableau).

UPDATE relances r
SET payee_detectee_le = (
  SELECT MIN(l.date_lettrage)::timestamptz
  FROM lettrages l
  WHERE l.numero_facture = ANY(r.factures_ids::text[])
    AND l.date_lettrage >= r.envoyee_le::date
    AND (l.annule IS NULL OR l.annule = false)
)
WHERE r.envoyee_le IS NOT NULL;
