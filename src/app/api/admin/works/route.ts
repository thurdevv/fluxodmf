import { z } from "zod";
import { auditLog } from "@/lib/audit";
import { handleApiError, ok } from "@/lib/api";
import { requireTab, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

const workSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(2),
  slug: z.string().min(2),
  aliases: z.array(z.string()).default([]),
  active: z.boolean().optional(),
});

type WorkRecord = {
  id: string;
  name: string;
  slug: string;
  costCenterAliases: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};

function serializeWork(work: WorkRecord) {
  return {
    ...work,
    aliases: JSON.parse(work.costCenterAliases || "[]"),
    createdAt: work.createdAt.toISOString(),
    updatedAt: work.updatedAt.toISOString(),
  };
}

export async function GET() {
  try {
    await requireUser();
    const works = await prisma.work.findMany({ orderBy: { name: "asc" } });
    return ok({ works: works.map(serializeWork) });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireTab("permissoes");
    const body = workSchema.parse(await request.json());

    const work = await prisma.work.create({
      data: {
        name: body.name,
        slug: body.slug,
        costCenterAliases: JSON.stringify(body.aliases),
        active: body.active ?? true,
      },
    });

    await auditLog({
      actorId: actor.id,
      event: "CONTA_CRIADA",
      entity: "Work",
      entityId: work.id,
    });

    return ok({ work: serializeWork(work) }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const actor = await requireTab("permissoes");
    const body = workSchema.extend({ id: z.string() }).parse(await request.json());

    const work = await prisma.work.update({
      where: { id: body.id },
      data: {
        name: body.name,
        slug: body.slug,
        costCenterAliases: JSON.stringify(body.aliases),
        active: body.active ?? true,
      },
    });

    await auditLog({
      actorId: actor.id,
      event: "CONTA_ATUALIZADA",
      entity: "Work",
      entityId: work.id,
    });

    return ok({ work: serializeWork(work) });
  } catch (error) {
    return handleApiError(error);
  }
}
