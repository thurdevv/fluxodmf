import { Role } from "@prisma-generated/enums";

export { Role };

/**
 * Fonte unica das regras de acesso (RBAC). O menu do painel e as rotas de API
 * consultam este modulo, para que esconder uma aba e bloquear o endpoint
 * correspondente nunca saiam de sincronia.
 *
 * Funcionario  -> Painel.
 * Gestor       -> Painel + Operacao.
 * Coordenador  -> acesso total, incluindo areas criticas (usuarios, permissoes, logs).
 */
export const TAB_IDS = [
  "dashboard",
  "indicadores",
  "calendario",
  "importar",
  "conciliacao",
  "pagamentos",
  "adiantamentos",
  "usuarios",
  "permissoes",
  "logs",
] as const;

export type TabId = (typeof TAB_IDS)[number];

const ALL_ROLES: Role[] = [Role.FUNCIONARIO, Role.GESTOR, Role.COORDENADOR];
const MANAGEMENT: Role[] = [Role.GESTOR, Role.COORDENADOR];
const CRITICAL: Role[] = [Role.COORDENADOR];

export const tabRoles: Record<TabId, Role[]> = {
  dashboard: ALL_ROLES,
  indicadores: ALL_ROLES,
  calendario: ALL_ROLES,
  importar: ALL_ROLES,
  conciliacao: ALL_ROLES,
  pagamentos: MANAGEMENT,
  adiantamentos: MANAGEMENT,
  usuarios: CRITICAL,
  permissoes: CRITICAL,
  logs: CRITICAL,
};

export function canAccessTab(role: Role, tab: TabId) {
  return tabRoles[tab].includes(role);
}

export function allowedTabs(role: Role) {
  return TAB_IDS.filter((tab) => canAccessTab(role, tab));
}

/** Aba inicial do perfil: a primeira que ele pode ver. */
export function defaultTab(role: Role): TabId {
  return allowedTabs(role)[0] ?? "dashboard";
}

/** Editar pagamentos, remarcar datas, mexer em registros financeiros. */
export function canEditPayments(role: Role) {
  return MANAGEMENT.includes(role);
}

/** Gerenciar usuarios, perfis e ver auditoria. */
export function canAdminister(role: Role) {
  return CRITICAL.includes(role);
}

export const roleLabels: Record<Role, string> = {
  FUNCIONARIO: "Funcionário",
  GESTOR: "Gestor",
  COORDENADOR: "Coordenador",
};

export const roleDescriptions: Record<Role, string> = {
  FUNCIONARIO: "Acessa todas as áreas do painel, incluindo a conciliação.",
  GESTOR: "Acessa o painel e a operação de pagamentos.",
  COORDENADOR: "Acesso total, incluindo usuários, permissões e logs.",
};
