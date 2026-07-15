import { z } from "zod";
import { ActionType, PaymentStatus } from "@prisma-generated/enums";
import { auditLog } from "@/lib/audit";
import { ApiError, handleApiError, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canAdminister, canEditPayments } from "@/lib/permissions";
import { serializePayment } from "@/lib/serializers";

const actionSchema = z.object({
  action: z.enum([
    "approve",
    "reject",
    "transfer",
    "request_info",
    "answer_info",
    "cancel",
    "reopen",
  ]),
  reason: z.string().trim().optional(),
  newDueDate: z.string().trim().optional(),
  note: z.string().trim().optional(),
});

/**
 * Cancelar e voltar para em aberto mexem em pagamento ja decidido: so o
 * coordenador faz. `reopen` e o nome interno da acao "Voltar para em aberto".
 */
const CRITICAL_ACTIONS = ["cancel", "reopen"];

function requireReason(reason: string | undefined, message: string) {
  if (!reason || reason.length < 3) {
    throw new ApiError(400, message);
  }
}

function dateFromIsoDay(day: string | undefined) {
  if (!day) return null;
  const date = new Date(`${day}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const body = actionSchema.parse(await request.json());

    // Funcionario so ve dashboard e importacao: nao age sobre pagamentos.
    if (!canEditPayments(user.role)) {
      throw new ApiError(403, "Seu perfil não tem permissão para agir sobre pagamentos.");
    }

    if (CRITICAL_ACTIONS.includes(body.action) && !canAdminister(user.role)) {
      throw new ApiError(
        403,
        "Somente o coordenador pode cancelar ou voltar pagamentos para em aberto.",
      );
    }

    const payment = await prisma.payment.findUnique({
      where: { id },
      include: { work: true },
    });

    if (!payment) {
      throw new ApiError(404, "Pagamento não encontrado.");
    }

    if (payment.status === PaymentStatus.APROVADO && body.action !== "reopen") {
      throw new ApiError(409, "Pagamento aprovado fica bloqueado para novas ações diretas.");
    }

    if (payment.status === PaymentStatus.CANCELADO && body.action !== "reopen") {
      throw new ApiError(
        409,
        "Pagamento cancelado precisa voltar para em aberto antes de novas ações.",
      );
    }

    let newStatus: PaymentStatus = payment.status;
    let actionType: ActionType = ActionType.APROVAR;
    let newDueDate: Date | null = null;

    if (body.action === "approve") {
      newStatus = PaymentStatus.APROVADO;
      actionType = ActionType.APROVAR;
    }

    if (body.action === "reject") {
      requireReason(body.reason, "Informe o motivo da reprovação.");
      newStatus = PaymentStatus.REPROVADO;
      actionType = ActionType.REPROVAR;
    }

    if (body.action === "transfer") {
      requireReason(body.reason, "Informe o motivo da transferência.");
      newDueDate = dateFromIsoDay(body.newDueDate);
      if (!newDueDate) {
        throw new ApiError(400, "Informe uma nova data válida.");
      }
      newStatus = PaymentStatus.TRANSFERIDO;
      actionType = ActionType.TRANSFERIR;
    }

    if (body.action === "request_info") {
      requireReason(body.reason, "Informe o que precisa ser complementado.");
      newStatus = PaymentStatus.INFO_SOLICITADA;
      actionType = ActionType.SOLICITAR_INFO;
    }

    if (body.action === "answer_info") {
      requireReason(body.reason ?? body.note, "Informe a resposta.");
      newStatus = PaymentStatus.CORRIGIDO;
      actionType = ActionType.RESPONDER_INFO;
    }

    if (body.action === "cancel") {
      requireReason(body.reason, "Informe o motivo do cancelamento.");
      newStatus = PaymentStatus.CANCELADO;
      actionType = ActionType.CANCELAR;
    }

    if (body.action === "reopen") {
      requireReason(body.reason, "Informe o motivo para voltar o pagamento a em aberto.");
      newStatus = PaymentStatus.PENDENTE;
      actionType = ActionType.REABRIR;
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.paymentAction.create({
        data: {
          paymentId: payment.id,
          actorId: user.id,
          type: actionType,
          previousStatus: payment.status,
          newStatus,
          reason: body.reason,
          note: body.note,
          newDueDate,
        },
      });

      return tx.payment.update({
        where: { id: payment.id },
        data: {
          status: newStatus,
          currentDueDate: newDueDate ?? undefined,
        },
        include: {
          work: true,
          importBatch: true,
          actions: {
            orderBy: { createdAt: "desc" },
            include: { actor: true },
          },
        },
      });
    });

    await auditLog({
      actorId: user.id,
      event: "PAGAMENTO_ACAO",
      entity: "Payment",
      entityId: payment.id,
      metadata: {
        acao: body.action,
        fornecedor: payment.supplierName,
        conta: payment.work.name,
        de: payment.status,
        para: newStatus,
        motivo: body.reason,
        ...(newDueDate ? { novaData: newDueDate.toISOString().slice(0, 10) } : {}),
      },
    });

    return ok({ payment: serializePayment(updated) });
  } catch (error) {
    return handleApiError(error);
  }
}
