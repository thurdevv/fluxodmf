import { handleApiError, ok } from "@/lib/api";
import { requireTab } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(request: Request) {
  try {
    await requireTab("logs");

    const { searchParams } = new URL(request.url);
    const event = searchParams.get("event")?.trim();
    const actorId = searchParams.get("actorId")?.trim();
    const limit = Math.min(Number(searchParams.get("limit") ?? 200) || 200, 500);

    const where = {
      ...(event ? { event } : {}),
      ...(actorId ? { actorId } : {}),
    };

    const [logs, eventGroups, actors] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: { actor: { select: { id: true, name: true, username: true } } },
      }),
      prisma.auditLog.groupBy({ by: ["event"], _count: { _all: true } }),
      prisma.user.findMany({
        select: { id: true, name: true, username: true },
        orderBy: { name: "asc" },
      }),
    ]);

    return ok({
      logs: logs.map((log) => ({
        id: log.id,
        event: log.event,
        entity: log.entity,
        entityId: log.entityId,
        metadata: JSON.parse(log.metadata || "{}"),
        actor: log.actor
          ? { id: log.actor.id, name: log.actor.name, username: log.actor.username }
          : null,
        createdAt: log.createdAt.toISOString(),
      })),
      events: eventGroups
        .map((row) => ({ event: row.event, count: row._count._all }))
        .sort((a, b) => a.event.localeCompare(b.event)),
      actors,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
