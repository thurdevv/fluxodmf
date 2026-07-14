import {
  NotificationStatus,
  PaymentStatus,
  Role,
  UserStatus,
} from "@prisma-generated/enums";
import { auditLog } from "@/lib/audit";
import { handleApiError, ok } from "@/lib/api";
import { requireTab } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    await requireTab("pagamentos");

    const logs = await prisma.notificationLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { user: true },
    });

    return ok({
      logs: logs.map((log) => ({
        ...log,
        createdAt: log.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST() {
  try {
    const actor = await requireTab("pagamentos");
    const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
    const gestores = await prisma.user.findMany({
      where: { role: Role.GESTOR, status: UserStatus.ATIVO },
      include: { works: { include: { work: true } } },
    });

    const createdLogs = [];

    for (const gestor of gestores) {
      const workIds = gestor.works.map((item) => item.workId);
      if (workIds.length === 0) continue;

      const paymentCount = await prisma.payment.count({
        where: {
          workId: { in: workIds },
          status: { in: [PaymentStatus.PENDENTE, PaymentStatus.CORRIGIDO] },
        },
      });

      if (paymentCount === 0) continue;

      const workNames = gestor.works.map(({ work }) => work.name).join(", ");
      const link = `${baseUrl}/aprovacoes`;
      const message = `Ola, ${gestor.name}. Existem ${paymentCount} pagamentos pendentes de aprovacao para ${workNames}. Acesse: ${link}`;

      const log = await prisma.notificationLog.create({
        data: {
          userId: gestor.id,
          workIds: JSON.stringify(workIds),
          paymentCount,
          destination: gestor.phone ?? gestor.email,
          message,
          link,
          status: NotificationStatus.SIMULADO,
        },
      });

      createdLogs.push(log);
    }

    await auditLog({
      actorId: actor.id,
      event: "NOTIFICATIONS_CREATED",
      entity: "NotificationLog",
      metadata: { count: createdLogs.length },
    });

    return ok({
      sent: createdLogs.length,
      simulated: true,
      logs: createdLogs.map((log) => ({
        ...log,
        createdAt: log.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
