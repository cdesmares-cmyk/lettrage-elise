-- Migration 193 : nom commercial affiché comme expéditeur des relances auto
--
-- POURQUOI. Les relances automatiques s'affichaient « Elise Finance », valeur
-- figée dans la variable d'environnement RESEND_FROM_RELANCE, alors que la
-- structure qui relance est « Elise Lyon » — et que la signature du mail, elle,
-- dit bien « Elise Lyon ». Le destinataire voyait donc deux noms différents
-- pour le même émetteur dans un même message. En recouvrement, un doute sur
-- l'identité de l'émetteur est un prétexte de plus pour ne pas payer.
--
-- CE QUI EST PARAMÉTRABLE, ET CE QUI NE L'EST PAS. Cette colonne ne porte que
-- le NOM AFFICHÉ. L'adresse reste celle de RESEND_FROM_RELANCE, parce qu'elle
-- doit appartenir à un domaine vérifié chez Resend (SPF et DKIM). Laisser
-- saisir une adresse complète permettrait d'écrire n'importe quel domaine :
-- Resend refuserait l'envoi en 403, de nuit, sans que personne le voie — la
-- même classe de panne silencieuse que le 401 de septembre.
--
-- Changer l'adresse elle-même est un autre chantier : vérifier elise.com.fr
-- dans Resend, donc poser des enregistrements DNS.
--
-- NULL = comportement actuel inchangé, RESEND_FROM_RELANCE est utilisé tel quel.
--
-- Le nom est assaini CÔTÉ FONCTION avant l'envoi : retrait des retours à la
-- ligne (injection d'en-tête) et des caractères qui casseraient la syntaxe
-- « Nom <adresse> ».

ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS relance_auto_nom_expediteur TEXT NULL;

COMMENT ON COLUMN organisations.relance_auto_nom_expediteur IS
  'Nom commercial affiché comme expéditeur des relances automatiques, par ex. '
  '« Elise Lyon ». NULL : la valeur de RESEND_FROM_RELANCE est utilisée telle '
  'quelle. Seul le NOM est paramétrable : l''adresse doit rester sur un domaine '
  'vérifié chez Resend, sinon l''envoi est refusé en 403.';
