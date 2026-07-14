import { z } from "zod";
import { ActionType, PaymentStatus } from "@prisma-generated/enums";
import { auditLog } from "@/lib/audit";
import { ApiError, handleApiError, ok } from "@/lib/api";
import { requireTab } from "@/lib/auth";
import { prisma } from "@/lib/db";

const rowSchema = z.object({
  externalReference: z.string().optional(),
  supplierName: z.string().min(1),
  description: z.string().min(1),
  amount: z.number().positive(),
  category: z.string().default(""),
  originalDueDate: z.string().min(1),
  currentDueDate: z.string().min(1),
  costCenter: z.string().min(1),
  workId: z.string().min(1),
  uniqueKey: z.string().min(1),
  errors: z.array(z.string()),
  duplicate: z.boolean(),
});

const contributionSchema = z.object({
  accountLabel: z.string().min(1),
  amount: z.number().positive(),
  workId: z.string().min(1),
  errors: z.array(z.string()),
});

const confirmSchema = z.object({
  fileName: z.string().min(1),
  totalRows: z.number().int().nonnegative(),
  rows: z.array(rowSchema),
  contributions: z.array(contributionSchema).default([]),
});

function dateFromIsoDay(day: string) {
  return new Date(`${day}T00:00:00.000Z`);
}

export async function POST(request: Request) {
  try {
    const user = await requireTab("importar");
    const body = confirmSchema.parse(await request.json());

    const validRows = body.rows.filter((row) => row.errors.length === 0 && !row.duplicate);
    const validContributions = body.contributions.filter((row) => row.errors.length === 0);

    if (validRows.length === 0) {
      throw new ApiError(400, "Não há linhas válidas para importar.");
    }

    // O cliente manda uniqueKey, mas quem decide o que e duplicado e o banco:
    // a preview pode estar velha se outra pessoa importou nesse meio tempo.
    const keys = validRows.map((row) => row.uniqueKey);
    const alreadyImported = await prisma.payment.findMany({
      where: { uniqueKey: { in: keys } },
      select: { uniqueKey: true },
    });
    const existingKeys = new Set(alreadyImported.map((row) => row.uniqueKey));
    const rowsToImport = validRows.filter((row) => !existingKeys.has(row.uniqueKey));

    if (rowsToImport.length === 0) {
      throw new ApiError(409, "Todas as linhas desta planilha já foram importadas.");
    }

    const batch = await prisma.$transaction(async (tx) => {
      const importBatch = await tx.importBatch.create({
        data: {
          fileName: body.fileName,
          totalRows: body.totalRows,
          validRows: rowsToImport.length,
          invalidRows: body.rows.length - rowsToImport.length,
          importedById: user.id,
        },
      });

      for (const row of rowsToImport) {
        const payment = await tx.payment.create({
          data: {
            externalReference: row.externalReference,
            supplierName: row.supplierName,
            description: row.description,
            amount: row.amount,
            category: row.category,
            originalDueDate: dateFromIsoDay(row.originalDueDate),
            currentDueDate: dateFromIsoDay(row.currentDueDate),
            costCenter: row.costCenter,
            uniqueKey: row.uniqueKey,
            workId: row.workId,
            importBatchId: importBatch.id,
            createdById: user.id,
            status: PaymentStatus.PENDENTE,
          },
        });

        await tx.paymentAction.create({
          data: {
            paymentId: payment.id,
            actorId: user.id,
            type: ActionType.IMPORTAR,
            newStatus: PaymentStatus.PENDENTE,
            note: `Importado do arquivo ${body.fileName}`,
          },
        });
      }

      for (const contribution of validContributions) {
        await tx.contribution.create({
          data: {
            accountLabel: contribution.accountLabel,
            amount: contribution.amount,
            workId: contribution.workId,
            importBatchId: importBatch.id,
          },
        });
      }

      return importBatch;
    });

    await auditLog({
      actorId: user.id,
      event: "IMPORT_CONFIRM",
      entity: "ImportBatch",
      entityId: batch.id,
      metadata: {
        fileName: batch.fileName,
        importedRows: rowsToImport.length,
        skippedRows: validRows.length - rowsToImport.length,
        contributions: validContributions.length,
        totalAmount: Number(
          rowsToImport.reduce((sum, row) => sum + row.amount, 0).toFixed(2),
        ),
      },
    });

    return ok(
      {
        batchId: batch.id,
        importedRows: rowsToImport.length,
        skippedRows: validRows.length - rowsToImport.length,
        importedContributions: validContributions.length,
      },
      201,
    );
  } catch (error) {
    return handleApiError(error);
  }
}
