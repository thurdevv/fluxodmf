import { prisma } from "@/lib/db";

export async function auditLog(input: {
  actorId?: string;
  event: string;
  entity: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}) {
  await prisma.auditLog.create({
    data: {
      actorId: input.actorId,
      event: input.event,
      entity: input.entity,
      entityId: input.entityId,
      metadata: JSON.stringify(input.metadata ?? {}),
    },
  });
}
