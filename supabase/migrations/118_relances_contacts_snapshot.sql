-- Migration 118 : snapshot des contacts sur les relances
-- Stocke nom/prénom/email au moment de l'envoi, indépendamment des suppressions futures du contact
-- Structure : [{"id": "uuid", "nom": "Dupont", "prenom": "Jean", "email": "jean@example.com"}]

ALTER TABLE relances ADD COLUMN IF NOT EXISTS contacts_snapshot jsonb;

-- Backfill : peuple le snapshot pour toutes les relances existantes qui ont des contacts_ids
UPDATE relances r
SET contacts_snapshot = (
  SELECT jsonb_agg(
    jsonb_build_object('id', c.id, 'nom', c.nom, 'prenom', c.prenom, 'email', c.email)
  )
  FROM contacts_client c
  WHERE c.id = ANY(r.contacts_ids)
)
WHERE contacts_ids IS NOT NULL
  AND array_length(contacts_ids, 1) > 0
  AND contacts_snapshot IS NULL;
