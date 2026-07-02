-- Migration 076 : correction du décalage de date sur les lettrages importés (mode = 'import')
--
-- Cause : SheetJS (cellDates: true) convertit les serials Excel en objets Date JS heure locale.
-- parseDate() appelait .toISOString() qui retourne UTC — en France (UTC+1/+2), minuit local
-- devient 22h ou 23h UTC le jour précédent → date_lettrage stockée 1 jour trop tôt.
--
-- Correction : ajouter 1 jour à tous les lettrages mode='import'.
-- Les lettrages classiques (mode manuel/auto/semi) et remboursements ne sont pas affectés
-- (leurs dates viennent de lignes_bancaires.date_operation ou sont saisies manuellement).
-- La migration 071 avait explicitement exclu mode='import' de son backfill pour cette raison.

UPDATE lettrages
SET date_lettrage = date_lettrage + INTERVAL '1 day'
WHERE mode = 'import'
  AND id_ligne_bancaire IS NULL;
