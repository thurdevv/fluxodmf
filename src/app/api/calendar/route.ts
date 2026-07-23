import { PaymentStatus } from "@prisma-generated/enums";
import { handleApiError, ok } from "@/lib/api";
import { requireTab } from "@/lib/auth";
import { numberValue } from "@/lib/finance-management";
import { prisma } from "@/lib/db";

function range(request: Request) {
  const url = new URL(request.url);
  const now = new Date();
  const from = url.searchParams.get("from")
    ? new Date(`${url.searchParams.get("from")}T00:00:00.000Z`)
    : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const to = url.searchParams.get("to")
    ? new Date(`${url.searchParams.get("to")}T23:59:59.999Z`)
    : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));
  return { from, to };
}

export async function GET(request: Request) {
  try {
    await requireTab("calendario");
    const { from, to } = range(request);
    const [payments, contributions, advances] = await Promise.all([
      prisma.payment.findMany({
        where: {
          currentDueDate: { gte: from, lte: to },
          status: { notIn: [PaymentStatus.REPROVADO, PaymentStatus.CANCELADO] },
        },
        orderBy: { currentDueDate: "asc" },
        include: {
          work: true,
          tags: { include: { tag: true } },
          approvals: {
            orderBy: { createdAt: "asc" },
            include: { actor: { select: { name: true } } },
          },
        },
      }),
      prisma.contribution.findMany({
        where: { importBatch: { createdAt: { gte: from, lte: to } } },
        include: { work: true, importBatch: true },
      }),
      prisma.advance.findMany({
        where: { dueDate: { gte: from, lte: to } },
        include: { work: true },
      }),
    ]);
    const events = [
      ...payments.map((item) => ({
        id: `payment-${item.id}`,
        type: "PAGAMENTO",
        date: item.currentDueDate.toISOString(),
        title: item.supplierName,
        subtitle: `${item.work.name} · ${item.category || "Sem categoria"}`,
        amount: numberValue(item.amount),
        status: item.status,
        tags: item.tags.map(({ tag }) => tag),
        details: {
          description: item.description,
          category: item.category || "Sem categoria",
          workName: item.work.name,
          externalReference: item.externalReference,
          approvedBy: item.approvals.map((approval) => approval.actor.name),
        },
      })),
      ...contributions.map((item) => ({
        id: `contribution-${item.id}`,
        type: "APORTE",
        date: item.importBatch.createdAt.toISOString(),
        title: `Aporte ${item.work.name}`,
        subtitle: item.importBatch.fileName,
        amount: numberValue(item.amount),
        status: "PREVISTO",
        tags: [],
      })),
      ...advances.map((item) => ({
        id: `advance-${item.id}`,
        type: "ADIANTAMENTO",
        date: item.dueDate.toISOString(),
        title: item.collaboratorName,
        subtitle: `${item.work?.name ?? "Sem obra"} · ${item.description}`,
        amount: numberValue(item.amount),
        status: item.status,
        tags: [],
      })),
    ].sort((a, b) => a.date.localeCompare(b.date));
    return ok({ from: from.toISOString(), to: to.toISOString(), events });
  } catch (error) {
    return handleApiError(error);
  }
}
