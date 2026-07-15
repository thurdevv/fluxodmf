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
import { normalizePhone, resolveProvider, sendWhatsApp } from "@/lib/whatsapp";

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

/**
 * Avisa os gestores que o fluxo foi importado e esta disponivel para conferir.
 *
 * Fica em "importar" e nao em "pagamentos" de proposito: o gatilho e o fim da
 * importacao, e quem importa tambem pode ser funcionario. O disparo nao escolhe
 * destinatario nem texto — vai para os gestores ativos com conta atribuida, e o
 * telefone de cada um so o coordenador define (aba Usuarios).
 */
export async function POST() {
  try {
    const actor = await requireTab("importar");
    const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
    const provider = resolveProvider();
    const gestores = await prisma.user.findMany({
      where: { role: Role.GESTOR, status: UserStatus.ATIVO },
      include: { works: { include: { work: true } } },
    });

    const createdLogs: Awaited<ReturnType<typeof prisma.notificationLog.create>>[] = [];

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
      // O painel e uma rota so, com abas por estado.
      const link = `${baseUrl}/painel`;
      const message = `Ola, ${gestor.name}. O fluxo de pagamentos foi importado e esta disponivel para conferencia. Existem ${paymentCount} pagamento(s) pendentes de aprovacao para ${workNames}. Acesse: ${link}`;

      const rawPhone = gestor.phone?.trim() ?? "";
      const phone = normalizePhone(rawPhone);
      // Sem telefone e com telefone ilegivel sao problemas diferentes, e quem
      // for cobrar o gestor precisa saber qual dos dois aconteceu.
      const result = phone
        ? await sendWhatsApp({ to: phone, message })
        : {
            status: NotificationStatus.FALHOU,
            errorMessage: rawPhone
              ? `Telefone "${rawPhone}" nao foi reconhecido. Corrija na aba Usuarios.`
              : "Gestor sem telefone cadastrado. Cadastre na aba Usuarios.",
          };

      const log = await prisma.notificationLog.create({
        data: {
          userId: gestor.id,
          workIds: JSON.stringify(workIds),
          paymentCount,
          // Para onde a mensagem foi de fato. Sem envio, guarda o que estava
          // cadastrado, senao o log nao diz o que precisa ser corrigido.
          destination: phone ?? rawPhone,
          message,
          link,
          status: result.status,
          providerId: result.providerId,
          errorMessage: result.errorMessage,
        },
      });

      createdLogs.push(log);
    }

    const countBy = (status: NotificationStatus) =>
      createdLogs.filter((log) => log.status === status).length;

    const summary = {
      notified: createdLogs.length,
      sent: countBy(NotificationStatus.ENVIADO),
      simulated: countBy(NotificationStatus.SIMULADO),
      failed: countBy(NotificationStatus.FALHOU),
    };

    await auditLog({
      actorId: actor.id,
      event: "NOTIFICATIONS_CREATED",
      entity: "NotificationLog",
      metadata: { ...summary, provedor: provider.name },
    });

    /**
     * So os contadores. O log completo carrega o telefone do gestor, e este
     * POST e acessivel ao funcionario (o gatilho e o fim da importacao) — quem
     * pode ver os destinos e o GET, que exige a aba Pagamentos.
     */
    return ok({ ...summary, provider: provider.name });
  } catch (error) {
    return handleApiError(error);
  }
}
