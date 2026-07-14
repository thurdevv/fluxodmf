import { ActionType, PaymentStatus } from "@prisma-generated/enums";
import { handleApiError, ok } from "@/lib/api";
import { requireTab } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { serializePayment } from "@/lib/serializers";

function parseDateParam(value: string | null, endOfDay = false) {
  if (!value) return undefined;
  return new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
}

export async function GET(request: Request) {
  try {
    // Gestor e coordenador enxergam todas as contas; funcionario nao entra aqui.
    await requireTab("pagamentos");

    const url = new URL(request.url);
    const status = url.searchParams.get("status") as PaymentStatus | null;
    const workId = url.searchParams.get("workId");
    const from = parseDateParam(url.searchParams.get("from"));
    const to = parseDateParam(url.searchParams.get("to"), true);
    const search = url.searchParams.get("search");

    const [payments, statusTotals, alteredDateActions] = await Promise.all([
      prisma.payment.findMany({
        where: {
          status: status && Object.values(PaymentStatus).includes(status) ? status : undefined,
          workId: workId || undefined,
          currentDueDate: from || to ? { gte: from, lte: to } : undefined,
          OR: search
            ? [
                { supplierName: { contains: search } },
                { description: { contains: search } },
                { costCenter: { contains: search } },
                { category: { contains: search } },
              ]
            : undefined,
        },
        orderBy: [{ currentDueDate: "asc" }, { createdAt: "desc" }],
        take: 200,
        include: {
          work: true,
          importBatch: true,
          actions: {
            orderBy: { createdAt: "desc" },
            include: { actor: true },
          },
        },
      }),
      prisma.payment.groupBy({
        by: ["status"],
        _count: { _all: true },
        _sum: { amount: true },
      }),
      prisma.paymentAction.findMany({
        where: { type: ActionType.TRANSFERIR },
        select: { paymentId: true },
        distinct: ["paymentId"],
      }),
    ]);

    const countStatus = (target: PaymentStatus) =>
      statusTotals.find((row) => row.status === target)?._count._all ?? 0;
    const total = statusTotals.reduce((sum, row) => sum + row._count._all, 0);
    const approved = countStatus(PaymentStatus.APROVADO);
    const rejected = countStatus(PaymentStatus.REPROVADO);

    return ok({
      payments: payments.map(serializePayment),
      summary: {
        total,
        approved,
        alteredDate: alteredDateActions.length,
        rejected,
        // A alteração de data é medida pelo histórico e não invalida uma
        // aprovação posterior: o status atual continua sendo a fonte da verdade.
        fullyApproved: total > 0 && approved === total,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
