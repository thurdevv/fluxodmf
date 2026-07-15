import { ApiError } from "@/lib/api";

/**
 * O Conta Azul entrega o export com extensao .xls mesmo sendo um xlsx, entao a
 * conversao aceita as tres extensoes — ao contrario da importacao do fluxo, que
 * so recebe o modelo ja refinado.
 */
const ACCEPTED_EXTENSIONS = ["csv", "xlsx", "xls"];

export function readConvertUpload(formData: FormData) {
  const file = formData.get("file");

  if (!(file instanceof File)) {
    throw new ApiError(400, "Envie a planilha bruta em CSV, XLS ou XLSX.");
  }

  const extension = file.name.split(".").pop()?.toLowerCase();
  if (!extension || !ACCEPTED_EXTENSIONS.includes(extension)) {
    throw new ApiError(400, "Formato invalido. Use CSV, XLS ou XLSX.");
  }

  return file;
}
