-- Migration 192 : adresse de réponse des relances automatiques
--
-- POURQUOI. Les relances auto partent par Resend, depuis une adresse générique
-- (RESEND_FROM_RELANCE, par défaut relances@ockham.finance). Un client qui
-- clique sur « Répondre » écrit donc à une boîte que personne ne relève, et sa
-- réponse — un litige, une demande d'échéancier, un règlement annoncé — est
-- perdue. C'est le pire cas en recouvrement : le client a répondu, et on croit
-- qu'il n'a pas répondu.
--
-- Resend accepte un champ reply_to sur son endpoint /emails/batch, celui
-- qu'utilise le robot. L'expéditeur affiché reste générique, mais le bouton
-- « Répondre » pointe vers la boîte renseignée ici.
--
-- POURQUOI UNE COLONNE PAR ORGANISATION, et non une constante. Ockham est
-- multi-tenant : une adresse écrite en dur dans la fonction enverrait les
-- réponses de toutes les organisations vers la même boîte. La colonne vit avec
-- les autres réglages du robot — delai_rerelance_jours, signature_auto — et se
-- règle au même endroit, dans Paramètres relances → Mode auto.
--
-- NULL = comportement actuel inchangé : aucun reply_to n'est envoyé, et les
-- réponses retombent sur l'adresse d'expédition.
--
-- Le format est validé CÔTÉ FONCTION avant l'envoi, pas ici. Une contrainte
-- CHECK rejetterait la saisie, ce qui est le bon moment pour le dire ; mais
-- elle ne protégerait pas des lignes déjà écrites par un autre chemin, et
-- Resend rejette un lot ENTIER de 100 emails si une seule adresse est mal
-- formée. La fonction omet donc le champ plutôt que de risquer la nuit entière.

ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS relance_auto_reply_to TEXT NULL;

COMMENT ON COLUMN organisations.relance_auto_reply_to IS
  'Adresse de réponse (reply_to) des relances automatiques envoyées par Resend. '
  'NULL : aucun reply_to, les réponses vont à l''adresse d''expédition. '
  'Le format est vérifié par la fonction relance-auto, qui omet le champ si '
  'l''adresse est douteuse — Resend rejette tout le lot sur une adresse invalide.';
