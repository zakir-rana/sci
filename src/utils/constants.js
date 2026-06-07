// utils/constants.js — Phase 3.0 modular extraction (logic unchanged from single-file v2_1)

export const TERRITORY_LIST = [
  { code:'DHA-M10', name:'Mirpur-10, Dhaka' },
  { code:'DHA-M01', name:'Mirpur-1, Dhaka' },
  { code:'DHA-MTJ', name:'Motijheel, Dhaka' },
  { code:'DHA-GTR', name:'Gulshan-Tejgaon, Dhaka' },
  { code:'DHA-UTR', name:'Uttara, Dhaka' },
  { code:'CTG-AGR', name:'Agrabad, Chittagong' },
  { code:'CTG-NSB', name:'Nasirabad, Chittagong' },
  { code:'SYL-Z01', name:'Zone-1, Sylhet' },
  { code:'SYL-Z02', name:'Zone-2, Sylhet' },
  { code:'RJH-S01', name:'Sector-1, Rajshahi' },
];

export const PARTY_TYPES = ['Pharmacy','Doctor','Chemist','Distributor','Hospital','Clinic','Institution'];

/// UPDATED SECTION — RBAC permission levels

export const PERM = { NONE:'NONE', VIEW:'VIEW', CREATE:'CREATE', EDIT:'EDIT', FULL:'FULL' };

/// UPDATED SECTION — Approval pipeline statuses

export const APPROVAL_STATUS = {
  DRAFT: 'Draft',
  PENDING_AM: 'Pending AM',
  PENDING_RSM: 'Pending RSM',
  PENDING_ASM: 'Pending ASM',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  INVOICED: 'Invoiced'
};

/// UPDATED SECTION — Default module permissions per role

export const DEFAULT_MODULE_PERMS = {
  CEO:       { dashboard:PERM.FULL, products:PERM.FULL, parties:PERM.FULL, invoices:PERM.FULL, sales:PERM.FULL, outstanding:PERM.FULL, targets:PERM.FULL, users:PERM.FULL, settings:PERM.FULL, territory:PERM.FULL, dcr:PERM.FULL, expense:PERM.FULL, approvals:PERM.FULL },
  ASM:       { dashboard:PERM.FULL, products:PERM.VIEW, parties:PERM.EDIT, invoices:PERM.EDIT, sales:PERM.VIEW, outstanding:PERM.VIEW, targets:PERM.EDIT, users:PERM.EDIT, settings:PERM.NONE, territory:PERM.VIEW, dcr:PERM.VIEW, expense:PERM.EDIT, approvals:PERM.FULL },
  RSM:       { dashboard:PERM.VIEW, products:PERM.VIEW, parties:PERM.EDIT, invoices:PERM.EDIT, sales:PERM.VIEW, outstanding:PERM.VIEW, targets:PERM.EDIT, users:PERM.NONE, settings:PERM.NONE, territory:PERM.VIEW, dcr:PERM.VIEW, expense:PERM.EDIT, approvals:PERM.EDIT },
  AM:        { dashboard:PERM.VIEW, products:PERM.VIEW, parties:PERM.CREATE, invoices:PERM.CREATE, sales:PERM.VIEW, outstanding:PERM.VIEW, targets:PERM.VIEW, users:PERM.NONE, settings:PERM.NONE, territory:PERM.VIEW, dcr:PERM.VIEW, expense:PERM.CREATE, approvals:PERM.EDIT },
  MIO:       { dashboard:PERM.VIEW, products:PERM.VIEW, parties:PERM.CREATE, invoices:PERM.CREATE, sales:PERM.VIEW, outstanding:PERM.VIEW, targets:PERM.VIEW, users:PERM.NONE, settings:PERM.NONE, territory:PERM.NONE, dcr:PERM.CREATE, expense:PERM.CREATE, approvals:PERM.VIEW },
  Warehouse: { dashboard:PERM.VIEW, products:PERM.FULL, parties:PERM.VIEW, invoices:PERM.VIEW, sales:PERM.VIEW, outstanding:PERM.NONE, targets:PERM.NONE, users:PERM.NONE, settings:PERM.NONE, territory:PERM.NONE, dcr:PERM.NONE, expense:PERM.NONE, approvals:PERM.NONE },
};

export const ROLE_ORDER = ['CEO','ASM','RSM','AM','MIO'];

export const ROLE_COLORS = { CEO:'ceo', ASM:'asm', RSM:'rsm', AM:'am', MIO:'mio' };

/// UPDATED SECTION — Product access: only CEO and Warehouse can add/edit/delete
