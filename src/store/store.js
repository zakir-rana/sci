// store/store.js — Phase 3.0 modular extraction (logic unchanged from single-file v2_1)
import { genUid } from '../utils/uid.js';

export function productExists(id) { return DB.products.some(p => p.id === id); }

export function partyExists(id) { return DB.parties.some(p => p.id === id); }

export function userExists(id) { return DB.users.some(u => u.id === id); }

export function userHasRole(id, role) { const u = DB.users.find(x => x.id === id); return !!u && u.role === role; }
// A "void" invoice (Rejected/Draft) is NOT a real receivable and must be
// excluded from all financial aggregations (sales, due, outstanding, GP).

export function isVoidInvoice(inv) {
  return inv && (inv.approvalStatus === 'Rejected' || inv.approvalStatus === 'Draft');
}
// Invoices that count toward real sales/financials.

export function realInvoices(list) { return (list || []).filter(inv => !isVoidInvoice(inv)); }

// ===================== DATA STORE =====================
/// UPDATED SECTION — DATA STORE: 4-level geography hierarchy, approval pipeline, extended fields

export const DEFAULT_DB = {
  users: [
    { id:1, name:'Rahim CEO', username:'ceo', password:'1234', role:'CEO', territory:'Bangladesh', territoryCode:'NAT-ALL', reportsTo:null, phone:'+880 1711-000001', status:'Active' },
    { id:2, name:'Karim ASM', username:'asm1', password:'1234', role:'ASM', territory:'Dhaka Division', territoryCode:'DHA-DIV', reportsTo:1, phone:'+880 1711-000002', status:'Active' },
    { id:3, name:'Hasan RSM', username:'rsm1', password:'1234', role:'RSM', territory:'Dhaka North', territoryCode:'DHA-NTH', reportsTo:2, phone:'+880 1711-000003', status:'Active' },
    { id:4, name:'Salam AM', username:'am1', password:'1234', role:'AM', territory:'Mirpur Area', territoryCode:'DHA-MIR', reportsTo:3, phone:'+880 1711-000004', status:'Active' },
    { id:5, name:'Jamal MIO', username:'mio1', password:'1234', role:'MIO', territory:'Mirpur-10', territoryCode:'DHA-M10', reportsTo:4, phone:'+880 1711-000005', status:'Active' },
    { id:6, name:'Rafi MIO', username:'mio2', password:'1234', role:'MIO', territory:'Mirpur-1', territoryCode:'DHA-M01', reportsTo:4, phone:'+880 1711-000006', status:'Active' },
    { id:7, name:'Arif RSM', username:'rsm2', password:'1234', role:'RSM', territory:'Dhaka South', territoryCode:'DHA-STH', reportsTo:2, phone:'+880 1711-000007', status:'Active' },
    { id:8, name:'Nabil AM', username:'am2', password:'1234', role:'AM', territory:'Motijheel Area', territoryCode:'DHA-MTJ', reportsTo:7, phone:'+880 1711-000008', status:'Active' },
    { id:9, name:'Sohel MIO', username:'mio3', password:'1234', role:'MIO', territory:'Motijheel', territoryCode:'DHA-MTJ', reportsTo:8, phone:'+880 1711-000009', status:'Active' },
  ],
  products: [
    { id:1, name:'Napa 500mg', category:'Tablet', unit:'Strip', tp:15, sp:20, stock:500, desc:'Paracetamol 500mg' },
    { id:2, name:'Amoxil 250mg', category:'Capsule', unit:'Strip', tp:45, sp:60, stock:300, desc:'Amoxicillin 250mg' },
    { id:3, name:'ORS Saline', category:'Syrup', unit:'Sachet', tp:8, sp:12, stock:1000, desc:'Oral Rehydration Salt' },
    { id:4, name:'Insulin Actrapid', category:'Injection', unit:'Vial', tp:350, sp:450, stock:100, desc:'Insulin injection' },
    { id:5, name:'Clotrimazole Cream', category:'Cream', unit:'Bottle', tp:65, sp:85, stock:200, desc:'Antifungal cream' },
    { id:6, name:'Vitamin C 1000mg', category:'Tablet', unit:'Box', tp:120, sp:160, stock:400, desc:'Ascorbic acid' },
    { id:7, name:'Monpas 10mg', category:'Tablet', unit:'Strip', tp:80, sp:110, stock:250, desc:'Montelukast' },
    { id:8, name:'Ranitidine 150mg', category:'Tablet', unit:'Strip', tp:25, sp:35, stock:600, desc:'H2 blocker' },
  ],
  parties: [
    { id:1, name:'Dr. Alam Clinic', type:'Doctor', area:'Mirpur-10', territoryCode:'DHA-M10', phone:'01700-111111', address:'Mirpur-10, Dhaka', mioId:5 },
    { id:2, name:'Green Pharmacy', type:'Pharmacy', area:'Mirpur-1', territoryCode:'DHA-M01', phone:'01700-222222', address:'Mirpur-1, Dhaka', mioId:6 },
    { id:3, name:'Dhaka Distributors', type:'Distributor', area:'Motijheel', territoryCode:'DHA-MTJ', phone:'01700-333333', address:'Motijheel, Dhaka', mioId:9 },
    { id:4, name:'Dr. Hana Hospital', type:'Hospital', area:'Mirpur-10', territoryCode:'DHA-M10', phone:'01700-444444', address:'Mirpur-10, Dhaka', mioId:5 },
    { id:5, name:'Sheba Medical', type:'Chemist', area:'Motijheel', territoryCode:'DHA-MTJ', phone:'01700-555555', address:'Motijheel, Dhaka', mioId:9 },
    { id:6, name:'City Pharma', type:'Pharmacy', area:'Mirpur-1', territoryCode:'DHA-M01', phone:'01700-666666', address:'Mirpur-1, Dhaka', mioId:6 },
  ],
  invoices: [
    { id:1, invoiceNo:'INV-2025-001', partyId:1, date:'2025-05-01', items:[{productId:1,qty:10,tp:15,sp:20,disc:0},{productId:2,qty:5,tp:45,sp:60,disc:5}], total:480, paid:480, status:'Paid', payType:'Cash', approvalStatus:'Invoiced', approvalHistory:[], mioId:5, territoryCode:'DHA-M10', notes:'' },
    { id:2, invoiceNo:'INV-2025-002', partyId:2, date:'2025-05-03', items:[{productId:3,qty:50,tp:8,sp:12,disc:0},{productId:6,qty:10,tp:120,sp:160,disc:10}], total:2044, paid:1000, status:'Partial', payType:'Partial', approvalStatus:'Pending AM', approvalHistory:[{action:'submitted',by:6,date:'2025-05-03',remarks:'Partial payment agreed'}], mioId:6, territoryCode:'DHA-M01', notes:'' },
    { id:3, invoiceNo:'INV-2025-003', partyId:3, date:'2025-05-05', items:[{productId:4,qty:5,tp:350,sp:450,disc:0},{productId:7,qty:20,tp:80,sp:110,disc:5}], total:4340, paid:0, status:'Due', payType:'Credit', approvalStatus:'Pending RSM', approvalHistory:[{action:'submitted',by:9,date:'2025-05-05',remarks:'30-day credit requested'},{action:'approved',by:8,role:'AM',date:'2025-05-05',remarks:'AM approved'}], mioId:9, territoryCode:'DHA-MTJ', notes:'' },
    { id:4, invoiceNo:'INV-2025-004', partyId:4, date:'2025-05-07', items:[{productId:8,qty:30,tp:25,sp:35,disc:0},{productId:5,qty:5,tp:65,sp:85,disc:0}], total:1475, paid:1475, status:'Paid', payType:'Cash', approvalStatus:'Invoiced', approvalHistory:[], mioId:5, territoryCode:'DHA-M10', notes:'' },
    { id:5, invoiceNo:'INV-2025-005', partyId:5, date:'2025-05-09', items:[{productId:1,qty:20,tp:15,sp:20,disc:0},{productId:2,qty:10,tp:45,sp:60,disc:0}], total:1000, paid:500, status:'Partial', payType:'Partial', approvalStatus:'Approved', approvalHistory:[{action:'submitted',by:9,date:'2025-05-09',remarks:''},{action:'approved',by:8,role:'AM',date:'2025-05-09',remarks:'OK'},{action:'approved',by:7,role:'RSM',date:'2025-05-09',remarks:'OK'},{action:'approved',by:2,role:'ASM',date:'2025-05-10',remarks:'Final approval'}], mioId:9, territoryCode:'DHA-MTJ', notes:'' },
    { id:6, invoiceNo:'INV-2025-006', partyId:6, date:'2025-05-11', items:[{productId:6,qty:15,tp:120,sp:160,disc:10}], total:2160, paid:0, status:'Due', payType:'Credit', approvalStatus:'Pending ASM', approvalHistory:[{action:'submitted',by:6,date:'2025-05-11',remarks:''},{action:'approved',by:4,role:'AM',date:'2025-05-11',remarks:'OK'},{action:'approved',by:3,role:'RSM',date:'2025-05-11',remarks:'Approved'}], mioId:6, territoryCode:'DHA-M01', notes:'' },
    { id:7, invoiceNo:'INV-2025-007', partyId:1, date:'2025-04-15', items:[{productId:1,qty:15,tp:15,sp:20,disc:0}], total:300, paid:300, status:'Paid', payType:'Cash', approvalStatus:'Invoiced', approvalHistory:[], mioId:5, territoryCode:'DHA-M10', notes:'' },
    { id:8, invoiceNo:'INV-2025-008', partyId:3, date:'2025-04-20', items:[{productId:4,qty:3,tp:350,sp:450,disc:0}], total:1350, paid:0, status:'Due', payType:'Credit', approvalStatus:'Draft', approvalHistory:[], mioId:9, territoryCode:'DHA-MTJ', notes:'' },
  ],
  targets: [
    { id:1, userId:5, month:'2025-05', amount:50000 },
    { id:2, userId:6, month:'2025-05', amount:40000 },
    { id:3, userId:9, month:'2025-05', amount:60000 },
    { id:4, userId:4, month:'2025-05', amount:150000 },
    { id:5, userId:3, month:'2025-05', amount:300000 },
    { id:6, userId:2, month:'2025-05', amount:700000 },
  ],
  /// UPDATED SECTION — Territory master data
  territories: [
    { id:1, code:'DHA-M10', name:'Mirpur-10, Dhaka', region:'Dhaka', rsmId:3, amId:4, mioId:5, asmId:2, areaId:1 },
    { id:2, code:'DHA-M01', name:'Mirpur-1, Dhaka', region:'Dhaka', rsmId:3, amId:4, mioId:6, asmId:2, areaId:1 },
    { id:3, code:'DHA-MTJ', name:'Motijheel, Dhaka', region:'Dhaka', rsmId:7, amId:8, mioId:9, asmId:2, areaId:2 },
  ],
  /// UPDATED SECTION — 4-level Geography Hierarchy
  divisions: [
    { id:1, name:'Dhaka Division', code:'DHA-DIV', asmId:2 },
    { id:2, name:'Chittagong Division', code:'CTG-DIV', asmId:null },
  ],
  regions: [
    { id:1, name:'Dhaka North', code:'DHA-NTH', divisionId:1, rsmId:3 },
    { id:2, name:'Dhaka South', code:'DHA-STH', divisionId:1, rsmId:7 },
    { id:3, name:'Chittagong City', code:'CTG-CTY', divisionId:2, rsmId:null },
  ],
  areas: [
    { id:1, name:'Mirpur Area', code:'DHA-MIR', regionId:1, amId:4 },
    { id:2, name:'Motijheel Area', code:'DHA-MTJ-A', regionId:2, amId:8 },
  ],
  /// UPDATED SECTION — DCR data
  dcrs: [
    { id:1, mioId:5, date:'2025-05-10', doctor:'Dr. Alam', chemist:'Green Pharma', status:'Visited', orderAmount:5000, followup:'2025-05-17', notes:'Good response on Napa' },
    { id:2, mioId:6, date:'2025-05-11', doctor:'Dr. Hana', chemist:'City Pharma', status:'Visited', orderAmount:3500, followup:'2025-05-18', notes:'New product intro' },
    { id:3, mioId:9, date:'2025-05-12', doctor:'', chemist:'Sheba Medical', status:'No Meeting', orderAmount:0, followup:'2025-05-15', notes:'Doctor not available' },
  ],
  /// UPDATED SECTION — Expense data
  expenses: [
    { id:1, submittedBy:5, date:'2025-05-10', type:'Travel', amount:350, notes:'Mirpur to Gulshan travel', status:'Approved', approvedBy:4 },
    { id:2, submittedBy:6, date:'2025-05-11', type:'DA', amount:500, notes:'Daily allowance', status:'Pending', approvedBy:null },
    { id:3, submittedBy:9, date:'2025-05-12', type:'Fuel', amount:280, notes:'Motijheel field visits', status:'Pending', approvedBy:null },
  ],
  /// UPDATED SECTION — Per-user module permissions (overrides defaults)
  userPermissions: {},
  /// UPDATED SECTION — Company settings
  company: { name:'RxPharma Bangladesh Ltd.', address:'Dhaka, Bangladesh', phone:'+880 1700-000000', logo:null },
  /// MIGRATION-SENSITIVE — audit trail (future Supabase audit_log table)
  auditLog: [],
  // invoiceSeq is a monotonic, never-reused counter for invoice numbering (fix #5)
  nextId: { user:10, product:9, party:7, invoice:9, target:7, territory:4, dcr:4, expense:4, division:3, region:4, area:3, invoiceSeq:9 }
};

/// UPDATED SECTION — localStorage persistence

export let DB;

export function saveDB() {
  try {
    localStorage.setItem('rxpharma_db', JSON.stringify(DB));
  } catch(e) { console.warn('saveDB failed:', e); }
}

export function loadDB() {
  try {
    const saved = localStorage.getItem('rxpharma_db');
    if (saved) {
      const parsed = JSON.parse(saved);
      // Merge to ensure new keys from DEFAULT_DB are present
      DB = Object.assign({}, DEFAULT_DB, parsed);
      // Ensure arrays exist
      if (!DB.territories) DB.territories = DEFAULT_DB.territories;
      if (!DB.divisions) DB.divisions = DEFAULT_DB.divisions;
      if (!DB.regions) DB.regions = DEFAULT_DB.regions;
      if (!DB.areas) DB.areas = DEFAULT_DB.areas;
      if (!DB.dcrs) DB.dcrs = DEFAULT_DB.dcrs;
      if (!DB.expenses) DB.expenses = DEFAULT_DB.expenses;
      if (!DB.userPermissions) DB.userPermissions = {};
      if (!DB.company) DB.company = DEFAULT_DB.company;
      if (!DB.auditLog) DB.auditLog = [];
      if (!DB.nextId.territory) DB.nextId.territory = DEFAULT_DB.nextId.territory;
      if (!DB.nextId.dcr) DB.nextId.dcr = DEFAULT_DB.nextId.dcr;
      if (!DB.nextId.expense) DB.nextId.expense = DEFAULT_DB.nextId.expense;
      if (!DB.nextId.division) DB.nextId.division = DEFAULT_DB.nextId.division;
      if (!DB.nextId.region) DB.nextId.region = DEFAULT_DB.nextId.region;
      if (!DB.nextId.area) DB.nextId.area = DEFAULT_DB.nextId.area;
      // fix #5: derive a safe monotonic invoice sequence that never reuses numbers
      if (!DB.nextId.invoiceSeq) {
        const maxSeq = DB.invoices.reduce((m, inv) => {
          const match = /(\d+)\s*$/.exec(inv.invoiceNo || '');
          return match ? Math.max(m, parseInt(match[1])) : m;
        }, 0);
        DB.nextId.invoiceSeq = Math.max(maxSeq + 1, DB.nextId.invoice || 1);
      }
      // Migrate old invoices that lack payType/approvalStatus
      DB.invoices.forEach(inv => {
        if (!inv.payType) inv.payType = 'Cash';
        if (!inv.approvalStatus) inv.approvalStatus = inv.payType==='Cash'?'Invoiced':'Draft';
        if (!inv.approvalHistory) inv.approvalHistory = [];
      });
      backfillUids(); // H. MIGRATION-SENSITIVE — ensure every record has a stable uid
    } else {
      DB = JSON.parse(JSON.stringify(DEFAULT_DB));
    }
  } catch(e) {
    DB = JSON.parse(JSON.stringify(DEFAULT_DB));
  }
}

/// H. MIGRATION-SENSITIVE — attach stable uids to every record (idempotent)

export function backfillUids() {
  const cols = ['users','products','parties','invoices','targets','territories','divisions','regions','areas','dcrs','expenses'];
  cols.forEach(c => { if (Array.isArray(DB[c])) DB[c].forEach(r => { if (r && !r.uid) r.uid = genUid(); }); });
  if (!DB.auditLog) DB.auditLog = [];
}
