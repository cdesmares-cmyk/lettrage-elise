// Définition des champs cibles pour chaque type d'import
// Utilisé par les hooks d'import ET les composants de mapping
import type { ChampCible } from '../types/import'

export const CHAMPS_BANCAIRES: ChampCible[] = [
  {
    cle: 'id_operation',
    label: 'N° Opération (pivot)',
    est_pivot: true,
    requis: true,
    est_lettrable: false,
    aliases: [
      'n operation', 'no operation', 'numero operation', 'numerodoperation',
      'ref operation', 'reference operation', 'id operation', 'transaction id',
      'reference', 'ref', 'numero',
    ],
  },
  {
    cle: 'date_operation',
    label: 'Date opération',
    est_pivot: false,
    requis: true,
    est_lettrable: false,
    aliases: ['date', 'date valeur', 'date operation', 'date ope', 'date transaction', 'valeur date'],
  },
  {
    cle: 'libelle',
    label: 'Libellé',
    est_pivot: false,
    requis: true,
    est_lettrable: false,
    aliases: ['libelle', 'intitule', 'description', 'motif', 'objet', 'designation', 'wording'],
  },
  {
    cle: 'detail',
    label: 'Détail / Réf. client',
    est_pivot: false,
    requis: false,
    est_lettrable: false,
    aliases: ['detail', 'ref client', 'reference client', 'communication', 'info complementaire', 'commentaire'],
  },
  {
    cle: 'debit',
    label: 'Débit (non-lettrable)',
    est_pivot: false,
    requis: false,
    est_lettrable: false,  // les débits ne sont pas utilisés dans le lettrage
    aliases: ['debit', 'montant debit', 'sortie', 'depense', 'retrait'],
  },
  {
    cle: 'credit',
    label: 'Crédit',
    est_pivot: false,
    requis: false,
    est_lettrable: true,
    aliases: ['credit', 'montant credit', 'entree', 'encaissement', 'versement', 'depot'],
  },
]

export const CHAMPS_FACTURES: ChampCible[] = [
  {
    cle: 'numero_piece',
    label: 'N° de pièce (pivot)',
    est_pivot: true,
    requis: true,
    est_lettrable: true,
    aliases: [
      'numero piece', 'num piece', 'no piece', 'numerodepiece',
      'n facture', 'no facture', 'numero facture', 'ref facture',
      'piece', 'reference', 'ref',
    ],
  },
  {
    cle: 'code_client',
    label: 'Code client',
    est_pivot: false,
    requis: true,
    est_lettrable: false,
    aliases: ['code client', 'codeclient', 'client', 'code dso', 'codedso', 'dso', 'code'],
  },
  {
    cle: 'date_emission',
    label: "Date d'émission",
    est_pivot: false,
    requis: true,
    est_lettrable: false,
    aliases: ['date emission', 'datemission', 'date facture', 'datefacture', 'date creation', 'date'],
  },
  {
    cle: 'date_echeance',
    label: "Date d'échéance",
    est_pivot: false,
    requis: false,
    est_lettrable: false,
    aliases: ['echeance', 'date echeance', 'dateecheance', 'due date', 'duedate', 'expiration'],
  },
  {
    cle: 'montant_ttc',
    label: 'Montant TTC',
    est_pivot: false,
    requis: true,
    est_lettrable: false,
    aliases: ['montant ttc', 'montantttc', 'total ttc', 'totalttc', 'montant', 'total', 'ttc', 'amount'],
  },
  {
    cle: 'est_avoir',
    label: 'Avoir ?',
    est_pivot: false,
    requis: false,
    est_lettrable: false,
    aliases: ['avoir', 'est avoir', 'estavoir', 'type', 'nature document'],
  },
]
