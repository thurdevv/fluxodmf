import { ApiError, handleApiError, ok } from "@/lib/api";
import { requireTab } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { convertRawFile } from "@/lib/flow-converter";
import { readConvertUpload } from "../upload";

/** Le o export bruto e mostra o que sairia na planilha de fluxo, sem gerar nada. */
export async function POST(request: Request) {
  try {
    await requireTab("importar");

    const file = readConvertUpload(await request.formData());
    const works = await prisma.work.findMany({ where: { active: true } });

    let conversion;
    try {
      conversion = await convertRawFile(file.name, await file.arrayBuffer(), works);
    } catch {
      throw new ApiError(
        400,
        "Nao foi possivel ler a planilha. Se o arquivo for um .xls antigo, reexporte como .xlsx.",
      );
    }

    return ok(conversion);
  } catch (error) {
    return handleApiError(error);
  }
}
