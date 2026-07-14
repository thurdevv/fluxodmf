import crypto from "node:crypto";
import { parse as parseCsv } from "csv-parse/sync";
import ExcelJS from "exceljs";
import type {
  ImportContributionRow,
  ImportPreview,
  ImportSummaryCheck,
  PaymentImportRow,
} from "@/types";

type WorkMatcher = {
  id: string;
  name: string;
  slug: string;
  costCenterAliases: string;
};

type RawRow = Record<string, unknown>;

/**
 * Colunas da planilha de fluxo: FORNECEDOR | DATA | DESCRICAO | VALOR |
 * CATEGORIA | CENTRO DE CUSTO. Os aliases mantem compatibilidade com exports
 * do Conta Azul, que nomeiam as mesmas colunas de outro jeito.
 */
const requiredColumns = {
  supplierName: ["fornecedor", "cliente fornecedor", "nome fornecedor", "supplier"],
  description: ["descricao", "historico", "observacao"],
  amount: ["valor", "valor liquido", "amount", "total"],
  dueDate: ["data", "vencimento", "data vencimento", "data de vencimento", "due date"],
  costCenter: ["centro de custo", "centro custo", "obra", "conta", "cost center"],
};

const optionalColumns = {
  category: ["categoria", "category", "plano de contas"],
  externalReference: ["referencia", "documento", "numero", "id"],
};

/** Rotulos que marcam o fim da tabela de pagamentos e o inicio dos blocos de resumo. */
const summaryHeaderLabels = ["conta", "valor", "status"];
const contributionSectionLabels = ["aportes", "aporte"];
const totalLabels = ["total", "subtotal", "total geral", "soma"];

function normalize(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

function findColumn(headers: string[], aliases: string[]) {
  const normalizedAliases = aliases.map(normalize);
  return headers.find((header) => normalizedAliases.includes(normalize(header)));
}

function parseMoney(value: unknown) {
  if (typeof value === "number") return value;
  const text = String(value ?? "")
    .replace(/\s/g, "")
    .replace(/R\$/gi, "");

  if (!text) return NaN;

  if (text.includes(",")) {
    return Number(text.replace(/\./g, "").replace(",", "."));
  }

  return Number(text);
}

function excelSerialDate(serial: number) {
  const utcDays = Math.floor(serial - 25569);
  const seconds = utcDays * 86400;
  const date = new Date(seconds * 1000);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function parseDate(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value === "number" && value > 20000) {
    return excelSerialDate(value);
  }

  const text = String(value ?? "").trim();
  if (!text) return null;

  const brMatch = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (brMatch) {
    const day = Number(brMatch[1]);
    const month = Number(brMatch[2]) - 1;
    const fullYear =
      brMatch[3].length === 2 ? Number(`20${brMatch[3]}`) : Number(brMatch[3]);
    return new Date(Date.UTC(fullYear, month, day));
  }

  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function buildUniqueKey(input: {
  supplierName: string;
  description: string;
  amount: number;
  currentDueDate: string;
  costCenter: string;
}) {
  return crypto
    .createHash("sha256")
    .update(
      [
        normalize(input.supplierName),
        normalize(input.description),
        input.amount.toFixed(2),
        input.currentDueDate,
        normalize(input.costCenter),
      ].join("|"),
    )
    .digest("hex");
}

function aliasesForWork(work: WorkMatcher) {
  let aliases: string[] = [];

  try {
    aliases = JSON.parse(work.costCenterAliases);
  } catch {
    aliases = [];
  }

  return [work.name, work.slug, ...aliases].map(normalize);
}

function resolveWork(costCenter: string, works: WorkMatcher[]) {
  const value = normalize(costCenter);
  if (!value) return undefined;
  return works.find((work) => aliasesForWork(work).includes(value));
}

function detectDelimiter(text: string) {
  const firstLine = text.split(/\r?\n/).find((line) => line.trim()) ?? "";
  const commas = (firstLine.match(/,/g) ?? []).length;
  const semicolons = (firstLine.match(/;/g) ?? []).length;
  return semicolons > commas ? ";" : ",";
}

function parseCsvRows(arrayBuffer: ArrayBuffer) {
  const text = Buffer.from(arrayBuffer).toString("utf8");
  return parseCsv(text, {
    bom: true,
    columns: true,
    delimiter: detectDelimiter(text),
    relax_column_count: true,
    skip_empty_lines: true,
    trim: true,
  }) as RawRow[];
}

function cellValue(value: ExcelJS.CellValue) {
  if (value == null) return "";
  if (value instanceof Date) return value;
  if (typeof value !== "object") return value;
  if ("text" in value && value.text) return value.text;
  if ("result" in value && value.result != null) return value.result;
  if ("richText" in value && Array.isArray(value.richText)) {
    return value.richText.map((part) => part.text).join("");
  }
  if ("formula" in value) return "";
  return String(value);
}

type SheetGrid = {
  headers: string[];
  /** Linhas da tabela de pagamentos, ja recortadas antes dos blocos de resumo. */
  paymentRows: Array<{ raw: RawRow; rowNumber: number }>;
  /** Linhas cruas do restante da planilha, para achar resumo e aportes. */
  trailing: Array<{ cells: string[]; rowNumber: number }>;
};

/**
 * A planilha nao termina na ultima linha de pagamento: abaixo dela vem um
 * SUBTOTAL, um resumo por conta e o bloco APORTES. Tratar isso como pagamento
 * gera linhas invalidas, entao a leitura para no primeiro marcador de fim.
 */
function isEndOfPayments(cells: string[], columnIndexes: { supplier: number; amount: number }) {
  const supplier = normalize(cells[columnIndexes.supplier] ?? "");
  const nonEmpty = cells.filter((cell) => String(cell ?? "").trim());

  // Linha totalmente vazia separando blocos.
  if (nonEmpty.length === 0) return true;

  // Linha de SUBTOTAL: sem fornecedor, mas com valor.
  if (!supplier && nonEmpty.length <= 2) return true;

  // Cabecalho do resumo por conta (CONTA | VALOR | STATUS).
  const normalizedCells = cells.map(normalize).filter(Boolean);
  const looksLikeSummaryHeader =
    normalizedCells.length > 0 &&
    normalizedCells.every((cell) => summaryHeaderLabels.includes(cell));
  if (looksLikeSummaryHeader) return true;

  if (contributionSectionLabels.includes(supplier)) return true;
  if (totalLabels.includes(supplier)) return true;

  return false;
}

async function parseWorkbook(arrayBuffer: ArrayBuffer): Promise<SheetGrid> {
  const workbook = new ExcelJS.Workbook();
  const loadWorkbook = workbook.xlsx.load.bind(workbook.xlsx) as unknown as (
    buffer: Uint8Array,
  ) => Promise<ExcelJS.Workbook>;
  await loadWorkbook(Buffer.from(arrayBuffer));
  const worksheet = workbook.worksheets[0];

  if (!worksheet) return { headers: [], paymentRows: [], trailing: [] };

  const columnCount = Math.max(worksheet.columnCount, 1);
  const headerRow = worksheet.getRow(1);
  const headers = Array.from({ length: columnCount }, (_, index) =>
    String(cellValue(headerRow.getCell(index + 1).value)).trim(),
  );

  const readCells = (rowNumber: number) =>
    Array.from({ length: columnCount }, (_, index) =>
      String(cellValue(worksheet.getRow(rowNumber).getCell(index + 1).value) ?? "").trim(),
    );

  const supplierHeader = findColumn(headers, requiredColumns.supplierName);
  const amountHeader = findColumn(headers, requiredColumns.amount);
  const columnIndexes = {
    supplier: supplierHeader ? headers.indexOf(supplierHeader) : 0,
    amount: amountHeader ? headers.indexOf(amountHeader) : 3,
  };

  const paymentRows: SheetGrid["paymentRows"] = [];
  const trailing: SheetGrid["trailing"] = [];
  let inPayments = true;

  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
    const cells = readCells(rowNumber);

    if (inPayments && isEndOfPayments(cells, columnIndexes)) {
      inPayments = false;
    }

    if (inPayments) {
      const raw: RawRow = {};
      headers.forEach((header, index) => {
        if (!header) return;
        raw[header] = cellValue(worksheet.getRow(rowNumber).getCell(index + 1).value);
      });
      paymentRows.push({ raw, rowNumber });
    } else {
      trailing.push({ cells, rowNumber });
    }
  }

  return { headers, paymentRows, trailing };
}

/**
 * Le o resumo por conta (CONTA | VALOR | STATUS) e o bloco APORTES que ficam
 * abaixo da tabela de pagamentos. O resumo nao e importado: serve so para
 * conferir contra a soma real das linhas.
 */
function parseTrailingBlocks(trailing: SheetGrid["trailing"], works: WorkMatcher[]) {
  const sheetSummary: Array<{ accountLabel: string; amount: number; status?: string }> = [];
  const contributions: ImportContributionRow[] = [];
  let section: "none" | "summary" | "contributions" = "none";

  for (const { cells, rowNumber } of trailing) {
    const filled = cells.map((cell) => String(cell ?? "").trim());
    const nonEmpty = filled.filter(Boolean);
    if (nonEmpty.length === 0) continue;

    const normalizedCells = filled.map(normalize).filter(Boolean);

    if (normalizedCells.some((cell) => contributionSectionLabels.includes(cell))) {
      section = "contributions";
      continue;
    }

    const isSummaryHeader =
      normalizedCells.length > 1 &&
      normalizedCells.every((cell) => summaryHeaderLabels.includes(cell));
    if (isSummaryHeader) {
      section = "summary";
      continue;
    }

    if (section === "none") continue;

    // Nos dois blocos o rotulo da conta e a primeira celula preenchida e o
    // valor e a primeira celula numerica depois dela.
    const labelIndex = filled.findIndex(Boolean);
    const label = filled[labelIndex] ?? "";
    if (!label) continue;
    if (totalLabels.includes(normalize(label))) continue;

    const amountCell = filled
      .slice(labelIndex + 1)
      .find((cell) => cell && !Number.isNaN(parseMoney(cell)));
    const amount = parseMoney(amountCell);
    if (!amountCell || Number.isNaN(amount)) continue;

    if (section === "summary") {
      const statusCell = filled.slice(labelIndex + 2).find(Boolean);
      sheetSummary.push({ accountLabel: label, amount, status: statusCell });
      continue;
    }

    const work = resolveWork(label, works);
    contributions.push({
      rowNumber,
      accountLabel: label,
      amount,
      workId: work?.id,
      workName: work?.name,
      errors: work ? [] : ["Conta do aporte nao reconhecida"],
    });
  }

  return { sheetSummary, contributions };
}

/**
 * Confronta o resumo escrito na planilha com a soma real das linhas de
 * pagamento. A planilha de referencia trazia o RECAP defasado em 2.032,03,
 * entao a divergencia e sinalizada em vez de silenciosamente aceita.
 */
function buildSummaryChecks(
  rows: PaymentImportRow[],
  sheetSummary: Array<{ accountLabel: string; amount: number; status?: string }>,
  works: WorkMatcher[],
): ImportSummaryCheck[] {
  const computed = new Map<string, number>();

  for (const row of rows) {
    if (row.errors.length > 0) continue;
    const work = row.workId;
    if (!work) continue;
    computed.set(work, (computed.get(work) ?? 0) + row.amount);
  }

  const checks: ImportSummaryCheck[] = [];
  const seenWorks = new Set<string>();

  for (const entry of sheetSummary) {
    const work = resolveWork(entry.accountLabel, works);
    const computedAmount = work ? (computed.get(work.id) ?? 0) : 0;
    if (work) seenWorks.add(work.id);

    checks.push({
      accountLabel: entry.accountLabel,
      workName: work?.name,
      sheetAmount: entry.amount,
      computedAmount,
      difference: Number((computedAmount - entry.amount).toFixed(2)),
      status: entry.status,
    });
  }

  // Contas que tem pagamentos mas nao aparecem no resumo da planilha.
  for (const [workId, amount] of computed) {
    if (seenWorks.has(workId)) continue;
    const work = works.find((item) => item.id === workId);
    checks.push({
      accountLabel: work?.name ?? workId,
      workName: work?.name,
      sheetAmount: null,
      computedAmount: amount,
      difference: null,
    });
  }

  return checks;
}

async function readGrid(fileName: string, arrayBuffer: ArrayBuffer): Promise<SheetGrid> {
  const extension = fileName.split(".").pop()?.toLowerCase();

  if (extension === "csv") {
    const rows = parseCsvRows(arrayBuffer);
    return {
      headers: Object.keys(rows[0] ?? {}),
      paymentRows: rows.map((raw, index) => ({ raw, rowNumber: index + 2 })),
      trailing: [],
    };
  }

  return parseWorkbook(arrayBuffer);
}

export async function parsePaymentFile(
  fileName: string,
  arrayBuffer: ArrayBuffer,
  works: WorkMatcher[],
): Promise<ImportPreview> {
  const grid = await readGrid(fileName, arrayBuffer);
  const headers = grid.headers.filter(Boolean);

  const columns = {
    supplierName: findColumn(headers, requiredColumns.supplierName),
    description: findColumn(headers, requiredColumns.description),
    amount: findColumn(headers, requiredColumns.amount),
    dueDate: findColumn(headers, requiredColumns.dueDate),
    costCenter: findColumn(headers, requiredColumns.costCenter),
    category: findColumn(headers, optionalColumns.category),
    externalReference: findColumn(headers, optionalColumns.externalReference),
  };

  const missingColumns = (
    [
      ["Fornecedor", columns.supplierName],
      ["Data", columns.dueDate],
      ["Descricao", columns.description],
      ["Valor", columns.amount],
      ["Centro de custo", columns.costCenter],
    ] as const
  )
    .filter(([, found]) => !found)
    .map(([label]) => label);

  const seen = new Set<string>();

  const rows: PaymentImportRow[] = grid.paymentRows.map(({ raw, rowNumber }) => {
    const errors: string[] = [];
    const supplierName = String(raw[columns.supplierName ?? ""] ?? "").trim();
    const description = String(raw[columns.description ?? ""] ?? "").trim();
    const costCenter = String(raw[columns.costCenter ?? ""] ?? "").trim();
    const category = String(raw[columns.category ?? ""] ?? "").trim();
    const amount = parseMoney(raw[columns.amount ?? ""]);
    const dueDate = parseDate(raw[columns.dueDate ?? ""]);
    const work = resolveWork(costCenter, works);

    if (!supplierName) errors.push("Fornecedor obrigatorio");
    if (!description) errors.push("Descricao obrigatoria");
    if (Number.isNaN(amount) || amount <= 0) errors.push("Valor invalido");
    if (!dueDate) errors.push("Data invalida");
    if (!costCenter) errors.push("Centro de custo obrigatorio");
    else if (!work) errors.push(`Centro de custo nao reconhecido: ${costCenter}`);

    const currentDueDate = dueDate ? isoDate(dueDate) : "";
    const key =
      supplierName && description && amount && currentDueDate && costCenter
        ? buildUniqueKey({ supplierName, description, amount, currentDueDate, costCenter })
        : `invalid-${rowNumber}`;

    const duplicate = seen.has(key);
    seen.add(key);

    if (duplicate) errors.push("Duplicado dentro da planilha");

    return {
      rowNumber,
      externalReference: String(raw[columns.externalReference ?? ""] ?? "").trim() || undefined,
      supplierName,
      description,
      amount: Number.isNaN(amount) ? 0 : amount,
      category,
      originalDueDate: currentDueDate,
      currentDueDate,
      costCenter,
      workId: work?.id,
      workName: work?.name,
      uniqueKey: key,
      errors,
      duplicate,
    };
  });

  const { sheetSummary, contributions } = parseTrailingBlocks(grid.trailing, works);
  const summaryChecks = buildSummaryChecks(rows, sheetSummary, works);
  const validRows = rows.filter((row) => row.errors.length === 0);

  return {
    fileName,
    missingColumns,
    totalRows: rows.length,
    validRows: validRows.length,
    invalidRows: rows.filter((row) => row.errors.length > 0).length,
    duplicateRows: rows.filter((row) => row.duplicate).length,
    totalAmount: Number(validRows.reduce((sum, row) => sum + row.amount, 0).toFixed(2)),
    rows,
    contributions,
    summaryChecks,
  };
}
