import { handleApiError, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { allowedTabs } from "@/lib/permissions";

export async function GET() {
  try {
    const user = await requireUser();

    return ok({
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        email: user.email,
        role: user.role,
        status: user.status,
        works: user.works.map(({ work }) => ({ id: work.id, name: work.name })),
      },
      // O cliente monta o menu a partir daqui; as rotas revalidam por conta propria.
      tabs: allowedTabs(user.role),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
