/**
 * Envio de WhatsApp aos gestores.
 *
 * O provedor ainda nao foi definido, entao o unico adapter que existe e o
 * simulado: ele registra a mensagem e devolve SIMULADO, sem sair para a rede.
 * O resto do sistema (rota, NotificationLog, auditoria, painel) ja funciona
 * ponta a ponta contra ele.
 *
 * Para plugar o provedor real, escreva um objeto que satisfaca WhatsAppProvider
 * e devolva-o em resolveProvider(). O `.env` ja reserva WHATSAPP_ACCESS_TOKEN,
 * WHATSAPP_PHONE_NUMBER_ID e WHATSAPP_TEMPLATE_NAME, cujos nomes vieram da
 * Cloud API da Meta — mas nada aqui depende dessa escolha.
 */

import { NotificationStatus } from "@prisma-generated/enums";

export type WhatsAppMessage = {
  /** Telefone ja normalizado em E.164 sem o "+", como as APIs de WhatsApp pedem. */
  to: string;
  message: string;
};

export type WhatsAppResult = {
  status: NotificationStatus;
  /** Id da mensagem no provedor, quando ele devolve um. */
  providerId?: string;
  errorMessage?: string;
};

export type WhatsAppProvider = {
  name: string;
  send(message: WhatsAppMessage): Promise<WhatsAppResult>;
};

/**
 * Normaliza para E.164 sem o "+". O telefone e texto livre no cadastro
 * ("(11) 98765-4321"), e nenhum provedor aceita esse formato.
 *
 * Reconhece dois formatos e recusa o resto:
 *   - 10 digitos (fixo com DDD) ou 11 (celular com DDD) -> assume Brasil, +55;
 *   - ja comecando com 55 e com 12 ou 13 digitos -> aceita como esta.
 *
 * Recusar devolve null, o que vira um log FALHOU dizendo qual telefone nao foi
 * reconhecido. E o comportamento desejado: mandar a mensagem para um numero
 * adivinhado e pior do que nao mandar e avisar.
 */
export function normalizePhone(raw: string | null | undefined) {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return null;

  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) return digits;

  return null;
}

const simulatedProvider: WhatsAppProvider = {
  name: "simulado",
  async send() {
    return { status: NotificationStatus.SIMULADO };
  },
};

/**
 * As variaveis nascem como string vazia no .env, que e falsy mas nao undefined
 * — por isso a checagem e de conteudo, nao de presenca.
 */
export function isProviderConfigured() {
  return Boolean(
    process.env.WHATSAPP_ACCESS_TOKEN?.trim() && process.env.WHATSAPP_PHONE_NUMBER_ID?.trim(),
  );
}

export function resolveProvider(): WhatsAppProvider {
  // Quando o provedor real existir, devolva-o aqui se isProviderConfigured().
  return simulatedProvider;
}

export async function sendWhatsApp(message: WhatsAppMessage): Promise<WhatsAppResult> {
  const provider = resolveProvider();

  try {
    return await provider.send(message);
  } catch (error) {
    // Falha de um gestor nao pode derrubar a notificacao dos outros: vira
    // FALHOU no log, com o motivo visivel para quem for cobrar.
    return {
      status: NotificationStatus.FALHOU,
      errorMessage: error instanceof Error ? error.message : "Falha ao enviar a mensagem.",
    };
  }
}
