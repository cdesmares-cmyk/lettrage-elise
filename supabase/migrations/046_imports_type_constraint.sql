-- Migration 046 : Ajout des types import_clients et import_contacts à la contrainte CHECK
-- Bug : useImportClients et useImportContacts insèrent type='import_clients'/'import_contacts'
-- mais la contrainte ne les listait pas → échec silencieux sur tout import contacts/clients.

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

ALTER TABLE imports ADD CONSTRAINT imports_type_check
  CHECK (type IN (
    'csv_bancaire',
    'xlsx_factures',
    'import_lettrage',
    'import_clients',
    'import_contacts'
  ));
