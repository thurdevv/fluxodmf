import { z } from "zod";
import { auditLog } from "@/lib/audit";
import { handleApiError } from "@/lib/api";
import { requireTab } from "@/lib/auth";
import { buildMissingNotesPdf, pdfContentDisposition } from "@/lib/pdf-reports";

const rowSchema = z.object({
  rowNumber: z.number().int(),
  advance: z.string(),
  collaborator: z.string(),
  type: z.string(),
  merchant: z.string(),
  amount: z.number(),
  date: z.string(),
  transactionStatus: z.string(),
  reviewStatus: z.string(),
  hasReceipt: z.string(),
  category: z.string(),
  description: z.string(),
});

const exportSchema = z.object({
  collaborators: z.array(z.string()).max(50),
  rows: z.array(rowSchema).max(5000),
});

function reportDate() {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
  })
    .format(new Date())
    .replace("/", ".");
}

function safeName(value: string) {
  return value.replace(/[<>:"/\\|?*]/g, "-").trim() || "colaborador";
}

export async function POST(request: Request) {
  try {
    const actor = await requireTab("conciliacao");
    const body = exportSchema.parse(await request.json());
    const pdf = await buildMissingNotesPdf(body);
    const collaborator = safeName(body.collaborators.join(", "));
    const fileName = `Auditoria ${reportDate()} - ${collaborator}.pdf`;

    await auditLog({
      actorId: actor.id,
      event: "NOTAS_FALTANTES_EXPORTADAS",
      entity: "Reconciliation",
      metadata: {
        colaboradores: body.collaborators.join(", "),
        quantidade: body.rows.length,
        valor: Number(body.rows.reduce((sum, row) => sum + row.amount, 0).toFixed(2)),
      },
    });

    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": pdfContentDisposition(fileName),
        "Content-Length": String(pdf.length),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
