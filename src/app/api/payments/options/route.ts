import { handleApiError, ok } from "@/lib/api";
import { requireTab } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    await requireTab("pagamentos");
    const [tags, reasons, works] = await Promise.all([
      prisma.tag.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
      prisma.standardReason.findMany({
        where: { active: true },
        orderBy: [{ action: "asc" }, { sortOrder: "asc" }],
      }),
      prisma.work.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    ]);
    return ok({ tags, reasons, works });
  } catch (error) {
    return handleApiError(error);
  }
}
