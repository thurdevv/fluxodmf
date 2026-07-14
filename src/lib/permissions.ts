import { Role } from "@prisma-generated/enums";

export { Role };

/**
 * Fonte unica das regras de acesso (RBAC). O menu do painel e as rotas de API
 * consultam este modulo, para que esconder uma aba e bloquear o endpoint
 * correspondente nunca saiam de sincronia.
 *
 * Funcionario  -> Dashboard e Importacao.
 * Gestor       -> tudo do Funcionario + Pagamentos (editar/gerenciar fluxos).
 * Coordenador  -> acesso total, incluindo areas criticas (usuarios, permissoes, logs).
 */
export const TAB_IDS = [
  "dashboard",
  "importar",
  "pagamentos",
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
  importar: ALL_ROLES,
  pagamentos: MANAGEMENT,
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
  FUNCIONARIO: "Visualiza o dashboard e importa o fluxo de pagamentos.",
  GESTOR: "Tudo do funcionário, mais editar pagamentos e gerenciar fluxos.",
  COORDENADOR: "Acesso total, incluindo usuários, permissões e configurações.",
};
