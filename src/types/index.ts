import type { Role, UserStatus } from "@prisma-generated/enums";

export type SessionUser = {
  id: string;
  name: string;
  username: string;
  email: string;
  role: Role;
};

export type { Role, UserStatus };

export type PaymentImportRow = {
  rowNumber: number;
  externalReference?: string;
  supplierName: string;
  description: string;
  amount: number;
  category: string;
  originalDueDate: string;
  currentDueDate: string;
  costCenter: string;
  workId?: string;
  workName?: string;
  uniqueKey: string;
  errors: string[];
  duplicate: boolean;
};

/** Linha do bloco APORTES da planilha. */
export type ImportContributionRow = {
  rowNumber: number;
  accountLabel: string;
  amount: number;
  workId?: string;
  workName?: string;
  errors: string[];
};

/**
 * Confronto entre o resumo por conta escrito na planilha e a soma real das
 * linhas de pagamento. `difference` diferente de zero indica planilha defasada.
 */
export type ImportSummaryCheck = {
  accountLabel: string;
  workName?: string;
  sheetAmount: number | null;
  computedAmount: number;
  difference: number | null;
  status?: string;
};

export type ImportPreview = {
  fileName: string;
  missingColumns: string[];
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  totalAmount: number;
  rows: PaymentImportRow[];
  contributions: ImportContributionRow[];
  summaryChecks: ImportSummaryCheck[];
};
