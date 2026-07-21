-- CreateEnum
CREATE TYPE "StandardReasonAction" AS ENUM ('REPROVAR', 'TRANSFERIR', 'CANCELAR', 'SOLICITAR_INFO', 'REABRIR');
CREATE TYPE "AdvanceStatus" AS ENUM ('ABERTO', 'PRESTADO', 'FECHADO', 'CANCELADO');
CREATE TYPE "AllocationSource" AS ENUM ('MANUAL', 'REGRA');

-- AlterTable
ALTER TABLE "Payment"
ADD COLUMN "hasReceipt" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "receiptReceivedAt" TIMESTAMP(3),
ADD COLUMN "appliedApprovalRuleId" TEXT,
ADD COLUMN "requiredApprovals" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "requiredApprovalRole" "Role" NOT NULL DEFAULT 'GESTOR';

-- CreateTable
CREATE TABLE "Tag" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "color" TEXT NOT NULL DEFAULT '#3157A4',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ApprovalRule" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "minAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "maxAmount" DECIMAL(65,30),
  "workId" TEXT,
  "category" TEXT,
  "tagId" TEXT,
  "requiredRole" "Role" NOT NULL DEFAULT 'GESTOR',
  "requiredApprovals" INTEGER NOT NULL DEFAULT 1,
  "preventSelfApproval" BOOLEAN NOT NULL DEFAULT true,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ApprovalRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PaymentApproval" (
  "id" TEXT NOT NULL,
  "paymentId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "approvalRuleId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaymentApproval_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PaymentTag" (
  "paymentId" TEXT NOT NULL,
  "tagId" TEXT NOT NULL,
  CONSTRAINT "PaymentTag_pkey" PRIMARY KEY ("paymentId", "tagId")
);

CREATE TABLE "StandardReason" (
  "id" TEXT NOT NULL,
  "action" "StandardReasonAction" NOT NULL,
  "label" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StandardReason_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AllocationRule" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "category" TEXT,
  "supplierPattern" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AllocationRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AllocationRuleSplit" (
  "id" TEXT NOT NULL,
  "ruleId" TEXT NOT NULL,
  "workId" TEXT NOT NULL,
  "percentage" DECIMAL(65,30) NOT NULL,
  CONSTRAINT "AllocationRuleSplit_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PaymentAllocation" (
  "id" TEXT NOT NULL,
  "paymentId" TEXT NOT NULL,
  "workId" TEXT NOT NULL,
  "percentage" DECIMAL(65,30) NOT NULL,
  "amount" DECIMAL(65,30) NOT NULL,
  "source" "AllocationSource" NOT NULL DEFAULT 'MANUAL',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PaymentAllocation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Advance" (
  "id" TEXT NOT NULL,
  "collaboratorName" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "amount" DECIMAL(65,30) NOT NULL,
  "spentAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "returnedAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "grantedAt" TIMESTAMP(3) NOT NULL,
  "dueDate" TIMESTAMP(3) NOT NULL,
  "settledAt" TIMESTAMP(3),
  "status" "AdvanceStatus" NOT NULL DEFAULT 'ABERTO',
  "notes" TEXT,
  "documents" TEXT NOT NULL DEFAULT '',
  "workId" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Advance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tag_name_key" ON "Tag"("name");
CREATE INDEX "ApprovalRule_active_priority_idx" ON "ApprovalRule"("active", "priority");
CREATE INDEX "ApprovalRule_workId_idx" ON "ApprovalRule"("workId");
CREATE INDEX "ApprovalRule_tagId_idx" ON "ApprovalRule"("tagId");
CREATE UNIQUE INDEX "PaymentApproval_paymentId_actorId_key" ON "PaymentApproval"("paymentId", "actorId");
CREATE INDEX "PaymentApproval_paymentId_createdAt_idx" ON "PaymentApproval"("paymentId", "createdAt");
CREATE INDEX "PaymentTag_tagId_idx" ON "PaymentTag"("tagId");
CREATE UNIQUE INDEX "StandardReason_action_label_key" ON "StandardReason"("action", "label");
CREATE INDEX "StandardReason_action_active_sortOrder_idx" ON "StandardReason"("action", "active", "sortOrder");
CREATE INDEX "AllocationRule_active_priority_idx" ON "AllocationRule"("active", "priority");
CREATE UNIQUE INDEX "AllocationRuleSplit_ruleId_workId_key" ON "AllocationRuleSplit"("ruleId", "workId");
CREATE INDEX "AllocationRuleSplit_workId_idx" ON "AllocationRuleSplit"("workId");
CREATE UNIQUE INDEX "PaymentAllocation_paymentId_workId_key" ON "PaymentAllocation"("paymentId", "workId");
CREATE INDEX "PaymentAllocation_workId_idx" ON "PaymentAllocation"("workId");
CREATE INDEX "Advance_status_dueDate_idx" ON "Advance"("status", "dueDate");
CREATE INDEX "Advance_workId_idx" ON "Advance"("workId");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_appliedApprovalRuleId_fkey" FOREIGN KEY ("appliedApprovalRuleId") REFERENCES "ApprovalRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ApprovalRule" ADD CONSTRAINT "ApprovalRule_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ApprovalRule" ADD CONSTRAINT "ApprovalRule_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PaymentApproval" ADD CONSTRAINT "PaymentApproval_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaymentApproval" ADD CONSTRAINT "PaymentApproval_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentApproval" ADD CONSTRAINT "PaymentApproval_approvalRuleId_fkey" FOREIGN KEY ("approvalRuleId") REFERENCES "ApprovalRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PaymentTag" ADD CONSTRAINT "PaymentTag_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaymentTag" ADD CONSTRAINT "PaymentTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AllocationRuleSplit" ADD CONSTRAINT "AllocationRuleSplit_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "AllocationRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AllocationRuleSplit" ADD CONSTRAINT "AllocationRuleSplit_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Advance" ADD CONSTRAINT "Advance_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Advance" ADD CONSTRAINT "Advance_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Default management configuration. Everything remains editable in the system.
INSERT INTO "Tag" ("id", "name", "color", "active", "updatedAt") VALUES
('tag-urgent', 'Urgente', '#D97706', true, CURRENT_TIMESTAMP),
('tag-judicial', 'Judicial', '#7C3AED', true, CURRENT_TIMESTAMP),
('tag-tax', 'Tributário', '#2563EB', true, CURRENT_TIMESTAMP),
('tag-retention', 'Retenção', '#475569', true, CURRENT_TIMESTAMP),
('tag-stopped-work', 'Obra paralisada', '#DC2626', true, CURRENT_TIMESTAMP),
('tag-board', 'Diretoria', '#0F766E', true, CURRENT_TIMESTAMP),
('tag-extraordinary', 'Extraordinário', '#BE123C', true, CURRENT_TIMESTAMP);

INSERT INTO "StandardReason" ("id", "action", "label", "sortOrder", "updatedAt") VALUES
('reason-reject-doc', 'REPROVAR', 'Documento ou informação insuficiente', 10, CURRENT_TIMESTAMP),
('reason-reject-value', 'REPROVAR', 'Valor divergente', 20, CURRENT_TIMESTAMP),
('reason-transfer-cash', 'TRANSFERIR', 'Aguardar disponibilidade de caixa', 10, CURRENT_TIMESTAMP),
('reason-transfer-deal', 'TRANSFERIR', 'Vencimento renegociado com o fornecedor', 20, CURRENT_TIMESTAMP),
('reason-cancel-duplicate', 'CANCELAR', 'Pagamento duplicado', 10, CURRENT_TIMESTAMP),
('reason-cancel-expense', 'CANCELAR', 'Despesa cancelada', 20, CURRENT_TIMESTAMP),
('reason-info-document', 'SOLICITAR_INFO', 'Enviar documento comprobatório', 10, CURRENT_TIMESTAMP),
('reason-reopen-correction', 'REABRIR', 'Correção operacional', 10, CURRENT_TIMESTAMP);

INSERT INTO "ApprovalRule" ("id", "name", "minAmount", "maxAmount", "requiredRole", "requiredApprovals", "preventSelfApproval", "priority", "updatedAt") VALUES
('default-up-to-5000', 'Até R$ 5 mil — Gestor', 0, 5000, 'GESTOR', 1, true, 10, CURRENT_TIMESTAMP),
('default-above-5000', 'Acima de R$ 5 mil — Coordenador', 5000.01, NULL, 'COORDENADOR', 1, true, 20, CURRENT_TIMESTAMP);

INSERT INTO "ApprovalRule" ("id", "name", "minAmount", "tagId", "requiredRole", "requiredApprovals", "preventSelfApproval", "priority", "updatedAt") VALUES
('default-extraordinary', 'Extraordinário — Dupla aprovação', 0, 'tag-extraordinary', 'COORDENADOR', 2, true, 100, CURRENT_TIMESTAMP);
