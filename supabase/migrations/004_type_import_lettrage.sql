-- Migration 004 : Ajout du type import_lettrage pour l'import en masse de lettrages
-- Permet la migration historique (point 0) et l'import de prelevements automatiques

-- Supprimer la contrainte existante (nom auto-genere par PostgreSQL)
DO $$
BEGIN
  EXECUTE (
    SELECT 'ALTER TABLE imports DROP CONSTRAINT ' || quote_ident(conname)
    FROM pg_constraint
    WHERE conrelid = 'imports'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%csv_bancaire%'
    LIMIT 1
  );
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Recreer avec le nouveau type
ALTER TABLE imports ADD CONSTRAINT imports_type_check
  CHECK (type IN ('csv_bancaire', 'xlsx_factures', 'import_lettrage'));
