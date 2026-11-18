-- Migration 191 : type d'import « Mise à jour de statut » + documentation
--
-- DEUX CHANGEMENTS, AUCUNE DONNÉE TOUCHÉE. Le premier est obligatoire pour que
-- le nouvel import fonctionne ; le second est un commentaire pur.


-- ═══════════════════════════════════════════════════════════════════════════
--  1. La contrainte imports_type_check accepte le nouveau type
-- ═══════════════════════════════════════════════════════════════════════════
--
-- POURQUOI C'EST BLOQUANT. useImportStatutFacture insère une ligne
-- type = 'maj_statut_facture' dans imports. Sans ce type dans la contrainte,
-- l'INSERT est rejeté et l'import échoue à sa toute dernière étape — après que
-- l'opérateur a choisi son fichier, fait sa correspondance de colonnes et
-- validé son récapitulatif.
--
-- C'EST EXACTEMENT LE PIÈGE DE LA MIGRATION 046, qui le dit mot pour mot :
-- « useImportClients et useImportContacts insèrent type='import_clients'/
-- 'import_contacts' mais la contrainte ne les listait pas → échec silencieux
-- sur tout import contacts/clients ». Deux fois suffisent.
--
-- Le bloc DO reprend la méthode de la 046 : la contrainte a été recréée
-- plusieurs fois et son nom en base n'est pas garanti. On la retrouve par son
-- contenu plutôt que par son nom.

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
    'import_contacts',
    'maj_statut_facture'
  ));


-- ═══════════════════════════════════════════════════════════════════════════
--  2. factures.est_provisionnee : colonne abandonnée
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Constat du 2026-11-18, vérifié dans tout le dépôt : cette colonne de la
-- migration 001 est exposée par toutes les vues métier, écrite à false par les
-- deux hooks d'import, et LUE NULLE PART dans l'application.
--
-- Elle est donc à false y compris sur les factures marquées « provisionne »
-- dans statut_facture. C'est un piège : qui la croit fiable — un futur export,
-- un développeur, un repreneur, un audit — obtiendra une réponse fausse sans
-- aucun signal.
--
-- ON NE LA SUPPRIME PAS. Elle figure dans la liste de colonnes de plusieurs
-- vues (002, 006, 008, 019, 020) : la retirer imposerait de toutes les
-- réécrire, pour un gain nul. Arbitré avec Clément : on documente.
--
-- LA SOURCE DE VÉRITÉ EST statut_facture, contrainte par la migration 006 à
-- 'litige' ou 'provisionne'. Le libellé affiché pour 'provisionne' est
-- « Dépréciée » depuis le 2026-11-18 — le PCG réserve « provision » au passif
-- et parle de dépréciation pour un actif (compte 491). Seule l'étiquette a
-- changé, la valeur stockée est inchangée.

COMMENT ON COLUMN factures.est_provisionnee IS
  'ABANDONNÉE — ne pas utiliser. Toujours false, y compris sur une facture '
  'dépréciée. Aucun code ne la lit depuis la migration 001 ; les deux imports '
  'se contentent de l''écrire à false. La source de vérité est '
  'factures.statut_facture (''litige'' ou ''provisionne''). Conservée parce '
  'qu''elle figure dans la liste de colonnes de plusieurs vues métier.';

COMMENT ON COLUMN factures.statut_facture IS
  'Statut métier de la facture, posé à la main ou par l''import '
  '« Mise à jour de statut ». NULL = aucun statut. ''litige'' = contestation '
  'interne, sans conséquence comptable. ''provisionne'' = créance dépréciée, '
  'affichée « Dépréciée » (PCG : dépréciation d''actif, compte 491). '
  'Drapeau binaire : il ne porte ni montant ni date. N''influence aucune '
  'relance — seuls commentaires_factures.ne_pas_relancer et '
  'clients.relance_bloquee bloquent un envoi.';


-- ═══════════════════════════════════════════════════════════════════════════
--  CONTRÔLES APRÈS EXÉCUTION
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 1. Le nouveau type est accepté.
--
--    SELECT pg_get_constraintdef(oid)
--    FROM   pg_constraint
--    WHERE  conrelid = 'imports'::regclass AND contype = 'c'
--      AND  pg_get_constraintdef(oid) LIKE '%csv_bancaire%';
--    -- attendu : les six types, dont maj_statut_facture
--
--
-- 2. LE CONTRÔLE QUI COMPTE : aucun import existant n'a été invalidé. Une
--    contrainte CHECK est vérifiée à l'ajout sur TOUTES les lignes présentes.
--    Si un type inconnu traînait en base, l'ALTER aurait échoué — mais mieux
--    vaut le constater explicitement.
--
--    SELECT type, count(*) FROM imports GROUP BY type ORDER BY 2 DESC;
--    -- attendu : uniquement des types de la liste ci-dessus
--
--
-- 3. Les commentaires sont posés.
--
--    SELECT column_name, col_description('factures'::regclass, ordinal_position)
--    FROM   information_schema.columns
--    WHERE  table_name = 'factures'
--      AND  column_name IN ('est_provisionnee', 'statut_facture');
--    -- attendu : deux lignes commentées
--
--
-- RETOUR ARRIÈRE :
--    Rejouer la migration 046 telle quelle pour la contrainte. Les commentaires
--    se retirent avec COMMENT ON COLUMN … IS NULL. Aucune donnée n'est en jeu
--    dans un cas comme dans l'autre.
--    À ne faire qu'après avoir vérifié qu'aucun import de statut n'a eu lieu :
--    SELECT count(*) FROM imports WHERE type = 'maj_statut_facture';
--    Sinon la contrainte refuserait les lignes déjà enregistrées.
