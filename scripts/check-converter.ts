/**
 * Exercita o conversor contra a planilha bruta real e confere que o arquivo
 * gerado volta pelo importador: converter e importar tem que concordar, senao
 * o usuario baixa um fluxo que o proprio sistema recusa.
 *
 * Uso: npx tsx scripts/check-converter.ts <planilha-bruta> [saida.xlsx]
 */

import { writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { buildFlowWorkbook, convertRawFile } from "../src/lib/flow-converter";
import { parsePaymentFile } from "../src/lib/import-parser";
import type { WorkMatcher } from "../src/lib/cost-center";

/** Espelha as contas do seed, sem depender do banco. */
const works: WorkMatcher[] = [
  { id: "w-ediser", name: "EDISER", slug: "ediser", costCenterAliases: JSON.stringify(["EDISER"]) },
  { id: "w-recap", name: "RECAP", slug: "recap", costCenterAliases: JSON.stringify(["RECAP"]) },
  {
    id: "w-jeronimo",
    name: "JERONIMO",
    slug: "jeronimo",
    costCenterAliases: JSON.stringify([
      "JERONIMO",
      "Despesa Pessoal Jeronimo",
      "Despesa Pessoal Jeronimo DJ",
      "Jeronimo DJ",
    ]),
  },
];

const brl = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

async function main() {
  const [source, output] = process.argv.slice(2);
  if (!source) throw new Error("Informe a planilha bruta.");

  const buffer = await readFile(source);
  const arrayBuffer = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;

  const conversion = await convertRawFile(source.split(/[/\\]/).pop() ?? source, arrayBuffer, works);

  console.log("=== CONVERSAO ===");
  console.log("arquivo sugerido :", conversion.suggestedFileName);
  console.log("dia do fluxo     :", conversion.flowDate);
  console.log("colunas faltando :", conversion.missingColumns);
  console.log(
    `linhas           : ${conversion.totalRows} lidas / ${conversion.validRows} validas / ${conversion.invalidRows} invalidas`,
  );
  console.log("total            :", brl(conversion.totalAmount));
  console.log("contas           :");
  for (const account of conversion.accounts) {
    console.log(
      `  - ${account.accountLabel.padEnd(24)} ${brl(account.computedAmount).padStart(14)}${account.isNewWork ? "  (conta nova)" : ""}`,
    );
  }

  const invalid = conversion.rows.filter((row) => row.errors.length > 0);
  if (invalid.length) {
    console.log("linhas invalidas :");
    for (const row of invalid.slice(0, 10)) {
      console.log(`  - L${row.rowNumber}: ${row.errors.join("; ")}`);
    }
  }

  // Um aporte por conta, so para exercitar o bloco APORTES.
  const aportes = conversion.accounts.map((account, index) => ({
    accountLabel: account.accountLabel,
    amount: index === 0 ? 50000 : 30000,
  }));

  const workbook = await buildFlowWorkbook(conversion, aportes);
  const target = output ?? conversion.suggestedFileName;
  writeFileSync(target, workbook);
  console.log("\ngerado           :", target, `(${workbook.byteLength} bytes)`);

  // A prova real: o arquivo gerado tem que passar pelo importador do fluxo.
  const arrayBufferOut = workbook.buffer.slice(
    workbook.byteOffset,
    workbook.byteOffset + workbook.byteLength,
  ) as ArrayBuffer;
  const preview = await parsePaymentFile(conversion.suggestedFileName, arrayBufferOut, works);

  console.log("\n=== REIMPORTACAO DO ARQUIVO GERADO ===");
  console.log("colunas faltando :", preview.missingColumns);
  console.log(
    `linhas           : ${preview.totalRows} lidas / ${preview.validRows} validas / ${preview.invalidRows} invalidas / ${preview.duplicateRows} duplicadas`,
  );
  console.log("total            :", brl(preview.totalAmount));
  console.log("aportes lidos    :");
  for (const contribution of preview.contributions) {
    console.log(
      `  - ${contribution.accountLabel.padEnd(24)} ${brl(contribution.amount).padStart(14)} -> ${contribution.workName}`,
    );
  }
  console.log("resumo conferido :");
  for (const check of preview.summaryChecks) {
    const diff = check.difference ?? 0;
    console.log(
      `  - ${check.accountLabel.padEnd(24)} planilha ${brl(check.sheetAmount ?? 0).padStart(14)} | linhas ${brl(check.computedAmount).padStart(14)} | dif ${brl(diff)}`,
    );
  }

  const badRows = preview.rows.filter((row) => row.errors.length > 0);
  if (badRows.length) {
    console.log("\nLINHAS RECUSADAS NA REIMPORTACAO:");
    for (const row of badRows.slice(0, 10)) {
      console.log(`  - L${row.rowNumber} ${row.supplierName}: ${row.errors.join("; ")}`);
    }
  }

  const ok =
    preview.missingColumns.length === 0 &&
    preview.validRows === conversion.validRows &&
    preview.invalidRows === 0 &&
    Math.abs(preview.totalAmount - conversion.totalAmount) < 0.01 &&
    preview.contributions.length === aportes.length &&
    preview.summaryChecks.every((check) => Math.abs(check.difference ?? 0) < 0.01);

  console.log(`\n${ok ? "OK: round-trip integro." : "FALHOU: round-trip divergiu."}`);
  if (!ok) process.exitCode = 1;
}

void main();
