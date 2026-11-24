import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import writeXlsxFile, { type Row, type SheetData } from 'write-excel-file/browser';
import type {
  BackupPayload,
  Person,
  PersonBalanceSummary,
  Transaction,
  TransactionType,
  UserPreferences,
} from '../types/ledger';
import {
  formatDateDisplay,
  formatMoney,
  getTodayISO,
  isValidPersonCode,
  normalizePersonCodeKey,
  parseAmount,
  TRANSACTION_TYPE_META,
} from './math';

export function exportPersonStatementPDF(
  person: Person,
  balance: PersonBalanceSummary,
  transactions: Transaction[],
  currencySymbol: string,
  accountOwnerName: string
): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header band
  doc.setFillColor(10, 15, 28);
  doc.rect(0, 0, pageWidth, 86, 'F');
  doc.setTextColor(212, 175, 55);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('SMART PATT BOOK', 40, 38);

  doc.setTextColor(226, 232, 240);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('ACCOUNT STATEMENT', 40, 56);
  doc.text(`Prepared by: ${accountOwnerName}`, pageWidth - 40, 38, { align: 'right' });
  doc.text(`Generated: ${formatDateDisplay(getTodayISO())}`, pageWidth - 40, 56, {
    align: 'right',
  });

  // Person details
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(person.name, 40, 118);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  const metaParts = [
    `Code: ${person.code}`,
    person.phone ? `Phone: ${person.phone}` : null,
    person.place ? `Place: ${person.place}` : null,
    person.email ? `Email: ${person.email}` : null,
  ].filter(Boolean);
  doc.text(metaParts.join('   |   '), 40, 136);

  // Separate Receivable & Payable summary boxes
  autoTable(doc, {
    startY: 154,
    head: [['Receivable Account', 'Amount', 'Payable Account', 'Amount']],
    body: [
      [
        'Total Given',
        formatMoney(balance.totalGiven, currencySymbol),
        'Total Payable (Owed)',
        formatMoney(balance.totalPayablePrincipal, currencySymbol),
      ],
      [
        'Total Received',
        formatMoney(balance.totalReceived, currencySymbol),
        'Total Paid',
        formatMoney(balance.totalPaid, currencySymbol),
      ],
      [
        'Remaining Receivable',
        formatMoney(balance.remainingReceivable, currencySymbol),
        'Remaining Payable',
        formatMoney(balance.remainingPayable, currencySymbol),
      ],
    ],
    theme: 'grid',
    headStyles: { fillColor: [15, 23, 42], textColor: [212, 175, 55], fontSize: 9 },
    bodyStyles: { fontSize: 9, textColor: [15, 23, 42] },
    columnStyles: {
      1: { halign: 'right', fontStyle: 'bold' },
      3: { halign: 'right', fontStyle: 'bold' },
    },
    margin: { left: 40, right: 40 },
  });

  const lastY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 240;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(`Transaction History (${transactions.length} entries)`, 40, lastY + 26);

  autoTable(doc, {
    startY: lastY + 36,
    head: [['Date', 'Type', 'Reference', 'Description', 'Amount']],
    body:
      transactions.length > 0
        ? transactions.map((tx) => [
            formatDateDisplay(tx.date),
            TRANSACTION_TYPE_META[tx.type].label,
            tx.referenceNumber || '-',
            tx.description || '-',
            formatMoney(tx.amount, currencySymbol),
          ])
        : [['-', 'No transactions recorded', '-', '-', '-']],
    theme: 'striped',
    headStyles: { fillColor: [15, 23, 42], textColor: [248, 250, 252], fontSize: 9 },
    bodyStyles: { fontSize: 8.5, textColor: [30, 41, 59] },
    columnStyles: {
      4: { halign: 'right', fontStyle: 'bold' },
    },
    margin: { left: 40, right: 40 },
  });

  const safeCode = person.code.replace(/[^A-Za-z0-9_-]/g, '_');
  doc.save(`SMART_PATT_BOOK_Statement_${safeCode}_${getTodayISO()}.pdf`);
}

function recordsToSheetData(rows: Array<Record<string, string | number>>): SheetData {
  const safeRows = rows.length > 0 ? rows : [{ Status: 'No matching records' }];
  const headers = Object.keys(safeRows[0]);
  const headerRow: Row = headers.map((h) => ({
    value: h,
    fontWeight: 'bold',
  }));
  const dataRows: Row[] = safeRows.map((row) =>
    headers.map((h) => {
      const val = row[h];
      if (typeof val === 'number') {
        return { type: Number, value: val };
      }
      return { type: String, value: String(val ?? '') };
    })
  );
  return [headerRow, ...dataRows];
}

export function exportPersonAccountExcel(
  person: Person,
  balance: PersonBalanceSummary,
  transactions: Transaction[],
  currencySymbol: string
): void {
  const summaryRows: Array<Record<string, string | number>> = [
    { Field: 'Person Name', Value: person.name },
    { Field: 'Person Code', Value: person.code },
    { Field: 'Phone', Value: person.phone || '' },
    { Field: 'Place / Address', Value: person.place || '' },
    { Field: 'Email', Value: person.email || '' },
    { Field: 'Notes', Value: person.notes || '' },
    { Field: 'Total Given', Value: balance.totalGiven },
    { Field: 'Total Received', Value: balance.totalReceived },
    { Field: 'Remaining Receivable', Value: balance.remainingReceivable },
    { Field: 'Total Payable (Owed)', Value: balance.totalPayablePrincipal },
    { Field: 'Total Paid', Value: balance.totalPaid },
    { Field: 'Remaining Payable', Value: balance.remainingPayable },
    { Field: 'Currency', Value: currencySymbol.trim() },
  ];

  const txRows: Array<Record<string, string | number>> = transactions.map((tx) => ({
    Date: tx.date,
    Type: TRANSACTION_TYPE_META[tx.type].label,
    Amount: tx.amount,
    Reference: tx.referenceNumber || '',
    Description: tx.description || '',
  }));

  const safeCode = person.code.replace(/[^A-Za-z0-9_-]/g, '_');
  void writeXlsxFile([
    { sheet: 'Account Summary', data: recordsToSheetData(summaryRows) },
    { sheet: 'Transactions', data: recordsToSheetData(txRows) },
  ]).toFile(`SMART_PATT_BOOK_Account_${safeCode}_${getTodayISO()}.xlsx`);
}

export function exportReportPDF(options: {
  title: string;
  subtitle: string;
  columns: string[];
  rows: Array<Array<string | number>>;
  summaryLines: Array<{ label: string; value: string }>;
  fileSlug: string;
}): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFillColor(10, 15, 28);
  doc.rect(0, 0, pageWidth, 74, 'F');
  doc.setTextColor(212, 175, 55);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('SMART PATT BOOK', 36, 32);

  doc.setTextColor(241, 245, 249);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(options.title, 36, 52);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(203, 213, 225);
  doc.text(options.subtitle, pageWidth - 36, 32, { align: 'right' });
  doc.text(`Generated: ${formatDateDisplay(getTodayISO())}`, pageWidth - 36, 52, {
    align: 'right',
  });

  if (options.summaryLines.length > 0) {
    autoTable(doc, {
      startY: 90,
      head: [options.summaryLines.map((s) => s.label)],
      body: [options.summaryLines.map((s) => s.value)],
      theme: 'grid',
      headStyles: { fillColor: [15, 23, 42], textColor: [212, 175, 55], fontSize: 9 },
      bodyStyles: { fontSize: 10, fontStyle: 'bold', textColor: [15, 23, 42] },
      margin: { left: 36, right: 36 },
    });
  }

  const startY =
    ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 88) + 18;

  autoTable(doc, {
    startY,
    head: [options.columns],
    body: options.rows.length > 0 ? options.rows : [options.columns.map((_, i) => (i === 0 ? 'No matching records' : ''))],
    theme: 'striped',
    headStyles: { fillColor: [15, 23, 42], textColor: [248, 250, 252], fontSize: 9 },
    bodyStyles: { fontSize: 8.5, textColor: [30, 41, 59] },
    margin: { left: 36, right: 36 },
  });

  doc.save(`SMART_PATT_BOOK_${options.fileSlug}_${getTodayISO()}.pdf`);
}

export function exportReportExcel(options: {
  sheetName: string;
  rows: Array<Record<string, string | number>>;
  fileSlug: string;
}): void {
  void writeXlsxFile(recordsToSheetData(options.rows), {
    sheet: options.sheetName.slice(0, 31),
  }).toFile(`SMART_PATT_BOOK_${options.fileSlug}_${getTodayISO()}.xlsx`);
}

export function downloadBackupJSON(
  persons: Person[],
  transactions: Transaction[],
  preferences: UserPreferences
): void {
  const personCodeById = new Map(persons.map((p) => [p.id, p.code]));
  const payload: BackupPayload = {
    app: 'SMART PATT BOOK',
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    preferences,
    persons: persons.map((p) => ({
      id: p.id,
      name: p.name,
      code: p.code,
      phone: p.phone,
      place: p.place,
      email: p.email,
      notes: p.notes,
    })),
    transactions: transactions.map((t) => ({
      id: t.id,
      personId: t.personId,
      personCode: personCodeById.get(t.personId),
      type: t.type,
      amount: t.amount,
      date: t.date,
      description: t.description,
      referenceNumber: t.referenceNumber,
    })),
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `SMART_PATT_BOOK_Backup_${getTodayISO()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export interface BackupValidationResult {
  valid: boolean;
  error?: string;
  warnings: string[];
  payload?: BackupPayload;
}

export function validateBackupJSON(rawText: string): BackupValidationResult {
  const warnings: string[] = [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return { valid: false, error: 'File is not valid JSON.', warnings };
  }

  if (!parsed || typeof parsed !== 'object') {
    return { valid: false, error: 'Backup root must be a JSON object.', warnings };
  }

  const obj = parsed as Record<string, unknown>;
  if (obj.app !== 'SMART PATT BOOK') {
    return {
      valid: false,
      error: 'Unrecognized backup file. Expected a SMART PATT BOOK export.',
      warnings,
    };
  }

  if (!Array.isArray(obj.persons) || !Array.isArray(obj.transactions)) {
    return {
      valid: false,
      error: 'Backup file is missing persons or transactions arrays.',
      warnings,
    };
  }

  const seenCodeKeys = new Set<string>();
  const validPersonIds = new Set<string>();
  const cleanedPersons: BackupPayload['persons'] = [];

  for (let i = 0; i < obj.persons.length; i++) {
    const raw = obj.persons[i] as Record<string, unknown>;
    const name = typeof raw?.name === 'string' ? raw.name.trim() : '';
    const code = typeof raw?.code === 'string' ? raw.code.trim() : '';
    const id = typeof raw?.id === 'string' && raw.id.trim() ? raw.id.trim() : `p_${i}`;

    if (!name || !code || !isValidPersonCode(code)) {
      warnings.push(`Skipped invalid person at index ${i + 1}.`);
      continue;
    }

    const codeKey = normalizePersonCodeKey(code);
    if (seenCodeKeys.has(codeKey)) {
      warnings.push(`Skipped duplicate person code "${code}" inside backup file.`);
      continue;
    }
    seenCodeKeys.add(codeKey);
    validPersonIds.add(id);

    cleanedPersons.push({
      id,
      name: name.slice(0, 120),
      code: code.slice(0, 40),
      phone: typeof raw.phone === 'string' ? raw.phone.trim().slice(0, 30) : '',
      place: typeof raw.place === 'string' ? raw.place.trim().slice(0, 200) : '',
      email: typeof raw.email === 'string' ? raw.email.trim().slice(0, 160) : '',
      notes: typeof raw.notes === 'string' ? raw.notes.trim().slice(0, 1000) : '',
    });
  }

  const validTypes: TransactionType[] = ['GIVEN', 'RECEIVED', 'PAYABLE', 'PAID'];
  const cleanedTransactions: BackupPayload['transactions'] = [];

  for (let i = 0; i < obj.transactions.length; i++) {
    const raw = obj.transactions[i] as Record<string, unknown>;
    const personId = typeof raw?.personId === 'string' ? raw.personId.trim() : '';
    const personCode = typeof raw?.personCode === 'string' ? raw.personCode.trim() : undefined;
    const type = raw?.type as TransactionType;
    const amount = parseAmount(raw?.amount as number);
    const date = typeof raw?.date === 'string' ? raw.date.trim() : '';

    if (
      !validTypes.includes(type) ||
      amount === null ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      (!validPersonIds.has(personId) && !personCode)
    ) {
      warnings.push(`Skipped invalid transaction at index ${i + 1}.`);
      continue;
    }

    cleanedTransactions.push({
      id: typeof raw.id === 'string' ? raw.id : `tx_${i}`,
      personId,
      personCode,
      type,
      amount,
      date,
      description:
        typeof raw.description === 'string' ? raw.description.trim().slice(0, 500) : '',
      referenceNumber:
        typeof raw.referenceNumber === 'string'
          ? raw.referenceNumber.trim().slice(0, 80)
          : '',
    });
  }

  let preferences: UserPreferences | undefined;
  if (obj.preferences && typeof obj.preferences === 'object') {
    const p = obj.preferences as Record<string, unknown>;
    if (typeof p.currencyCode === 'string' && typeof p.currencySymbol === 'string') {
      preferences = {
        currencyCode: p.currencyCode.slice(0, 10),
        currencySymbol: p.currencySymbol.slice(0, 10),
      };
    }
  }

  return {
    valid: true,
    warnings,
    payload: {
      app: 'SMART PATT BOOK',
      schemaVersion: 1,
      exportedAt: typeof obj.exportedAt === 'string' ? obj.exportedAt : new Date().toISOString(),
      preferences,
      persons: cleanedPersons,
      transactions: cleanedTransactions,
    },
  };
}
