"use client";

import {
  CalendarDays,
  CheckCircle2,
  ListChecks,
  RefreshCw,
  RotateCcw,
  Search,
  XCircle,
} from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { Money } from "@/components/Money";
import { StatusBadge } from "@/components/StatusBadge";
import { usePanel } from "@/components/panel/PanelContext";
import { useFetchData } from "@/components/panel/useFetchData";
import { dateTime, money, shortDate, statusLabels } from "@/lib/format";
import { canAdminister } from "@/lib/permissions";

type StatusKey = keyof typeof statusLabels;

type Payment = {
  id: string;
  supplierName: string;
  description: string;
  amount: number;
  category: string;
  originalDueDate: string;
  currentDueDate: string;
  costCenter: string;
  status: StatusKey;
  work: { id: string; name: string };
  actions?: {
    id: string;
    type: string;
    reason?: string | null;
    note?: string | null;
    createdAt: string;
    actor?: { name: string };
  }[];
};

type PaymentsResponse = {
  payments: Payment[];
  summary: { total: number; approved: number; alteredDate: number; rejected: number };
};

const statusOptions: { value: "" | StatusKey; label: string }[] = [
  { value: "", label: "Todos os status" },
  { value: "PENDENTE", label: "Pendente" },
  { value: "CORRIGIDO", label: "Corrigido" },
  { value: "INFO_SOLICITADA", label: "Info solicitada" },
  { value: "TRANSFERIDO", label: "Transferido" },
  { value: "APROVADO", label: "Aprovado" },
  { value: "REPROVADO", label: "Reprovado" },
  { value: "CANCELADO", label: "Cancelado" },
];

/** Acoes que exigem justificativa antes de disparar. */
type Mode = "reject" | "transfer" | "cancel" | "reopen";

const modeLabels: Record<Mode, string> = {
  reject: "Reprovar pagamento",
  transfer: "Alterar data de vencimento",
  cancel: "Cancelar pagamento",
  reopen: "Voltar pagamento para em aberto",
};

/** Acoes oferecidas no lote. Tudo menos aprovar pede motivo. */
type BatchAction = "approve" | "reject" | "transfer" | "reopen";

const batchActionLabels: Record<BatchAction, string> = {
  approve: "Aprovar",
  reject: "Reprovar",
  transfer: "Alterar data",
  reopen: "Voltar para em aberto",
};

type BatchResult = { done: number; failed: { supplier: string; error: string }[] };

export function PaymentsTab() {
  const { user } = usePanel();
  const isCoordinator = canAdminister(user.role);

  const [selectedId, setSelectedId] = useState("");
  const [status, setStatus] = useState<"" | StatusKey>("PENDENTE");
  const [workId, setWorkId] = useState("");
  const [search, setSearch] = useState("");
  // `search` so entra na url quando o usuario clica em Buscar, para nao
  // refazer a consulta a cada tecla digitada.
  const [appliedSearch, setAppliedSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState<Mode | null>(null);
  const [reason, setReason] = useState("");
  const [newDueDate, setNewDueDate] = useState("");

  // Selecao em lote: ids marcados por clique na lista.
  const [batch, setBatch] = useState<string[]>([]);
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchAction, setBatchAction] = useState<BatchAction>("approve");
  const [batchReason, setBatchReason] = useState("");
  const [batchDueDate, setBatchDueDate] = useState("");
  const [batchProgress, setBatchProgress] = useState(0);

  const url = useMemo(() => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (workId) params.set("workId", workId);
    if (appliedSearch) params.set("search", appliedSearch);
    return `/api/payments?${params.toString()}`;
  }, [status, workId, appliedSearch]);

  const { data, error, loading, reload, setError } = useFetchData<PaymentsResponse>(url);

  const payments = data?.payments ?? [];
  const summary = data?.summary ?? { total: 0, approved: 0, alteredDate: 0, rejected: 0 };

  // A selecao e derivada, nao sincronizada por efeito: se o item escolhido sai
  // da lista (mudou o filtro, mudou o status), cai no primeiro sozinho.
  const selected = payments.find((payment) => payment.id === selectedId) ?? payments[0] ?? null;

  /**
   * O lote so considera o que esta na lista atual. Trocar o filtro ou aprovar
   * um item deixa ids orfaos no estado; cruzar com `payments` evita agir sobre
   * pagamento que o usuario nao esta mais vendo.
   */
  const batchPayments = payments.filter((payment) => batch.includes(payment.id));
  const batchTotal = batchPayments.reduce((sum, payment) => sum + payment.amount, 0);

  function toggleBatch(id: string) {
    // Clicar marca/desmarca no lote e sempre leva os detalhes para o clicado.
    setSelectedId(id);
    setBatch((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  async function runAction(action: string, payload: Record<string, unknown> = {}) {
    if (!selected) return;

    setBusy(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch(`/api/payments/${selected.id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Não foi possível concluir a ação.");
        return;
      }

      setMode(null);
      setReason("");
      setNewDueDate("");
      setMessage("Ação registrada.");
      reload();
    } catch {
      setError("Falha de conexão ao executar a ação.");
    } finally {
      setBusy(false);
    }
  }

  /**
   * Aplica a acao a cada pagamento do lote. Vai um a um de proposito: reusa a
   * rota individual (com o RBAC e as regras de status que ela ja aplica) e
   * deixa cada pagamento com seu proprio registro na auditoria. Um erro em um
   * item nao aborta o resto; no fim o usuario ve o que falhou e por que.
   */
  async function runBatch(event: FormEvent) {
    event.preventDefault();
    if (batchPayments.length === 0) return;

    setBusy(true);
    setError("");
    setMessage("");
    setBatchProgress(0);

    const payload: Record<string, unknown> =
      batchAction === "approve"
        ? {}
        : batchAction === "transfer"
          ? { reason: batchReason, newDueDate: batchDueDate }
          : { reason: batchReason };

    const result: BatchResult = { done: 0, failed: [] };

    for (const payment of batchPayments) {
      try {
        const response = await fetch(`/api/payments/${payment.id}/action`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: batchAction, ...payload }),
        });

        if (response.ok) {
          result.done += 1;
        } else {
          const data = await response.json();
          result.failed.push({
            supplier: payment.supplierName,
            error: data.error ?? "erro desconhecido",
          });
        }
      } catch {
        result.failed.push({ supplier: payment.supplierName, error: "falha de conexão" });
      }

      setBatchProgress((value) => value + 1);
    }

    setBusy(false);
    setBatchOpen(false);
    setBatch([]);
    setBatchReason("");
    setBatchDueDate("");
    setBatchProgress(0);

    const verb = batchActionLabels[batchAction].toLowerCase();
    if (result.failed.length === 0) {
      setMessage(`${result.done} pagamento(s) processado(s) com sucesso (${verb}).`);
    } else {
      setMessage(result.done > 0 ? `${result.done} pagamento(s) processado(s).` : "");
      setError(
        `${result.failed.length} falhou(ram): ` +
          result.failed
            .slice(0, 3)
            .map((item) => `${item.supplier} (${item.error})`)
            .join("; ") +
          (result.failed.length > 3 ? ` e mais ${result.failed.length - 3}.` : ""),
      );
    }

    reload();
  }

  function onSubmitModal(event: FormEvent) {
    event.preventDefault();
    if (!mode) return;

    if (mode === "transfer") {
      void runAction("transfer", { reason, newDueDate });
      return;
    }

    void runAction(mode, { reason });
  }

  return (
    <>
      <section className="approval-stats">
        <div className="approval-stat approval-stat-success">
          <span>Aprovados</span>
          <strong>
            {summary.approved} / {summary.total}
          </strong>
          <small>no filtro atual</small>
        </div>
        <div className="approval-stat approval-stat-warning">
          <span>Data alterada</span>
          <strong>{summary.alteredDate}</strong>
          <small>remarcados</small>
        </div>
        <div className="approval-stat approval-stat-danger">
          <span>Reprovados</span>
          <strong>{summary.rejected}</strong>
          <small>com justificativa</small>
        </div>
      </section>

      <section className="toolbar">
        <select
          className="select"
          value={status}
          onChange={(event) => setStatus(event.target.value as "" | StatusKey)}
          aria-label="Filtrar por status"
        >
          {statusOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <select
          className="select"
          value={workId}
          onChange={(event) => setWorkId(event.target.value)}
          aria-label="Filtrar por conta"
        >
          <option value="">Todas as contas</option>
          {user.works.map((work) => (
            <option key={work.id} value={work.id}>
              {work.name}
            </option>
          ))}
        </select>

        <input
          className="input"
          placeholder="Buscar fornecedor, descrição ou categoria"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          aria-label="Buscar"
        />

        <button
          className="button secondary"
          type="button"
          onClick={() => setAppliedSearch(search.trim())}
        >
          <Search size={16} />
          Buscar
        </button>

        {/* So habilita depois que ha pelo menos um pagamento marcado na lista. */}
        <button
          className="button"
          type="button"
          disabled={batchPayments.length === 0 || busy}
          onClick={() => setBatchOpen(true)}
          title={
            batchPayments.length === 0
              ? "Clique nos pagamentos da lista para selecioná-los"
              : `Aplicar uma ação aos ${batchPayments.length} pagamentos selecionados`
          }
        >
          <ListChecks size={16} />
          Ações em lote{batchPayments.length > 0 ? ` (${batchPayments.length})` : ""}
        </button>

        {batchPayments.length > 0 ? (
          <button className="button ghost" type="button" onClick={() => setBatch([])}>
            Limpar seleção
          </button>
        ) : null}
      </section>

      {error ? <div className="alert error">{error}</div> : null}
      {message ? <div className="alert success">{message}</div> : null}

      <section className="split-grid">
        <div className="section">
          <div className="section-header">
            <h2>Pagamentos ({payments.length})</h2>
            <button className="button ghost" type="button" onClick={reload} disabled={loading}>
              <RefreshCw size={16} />
              Atualizar
            </button>
          </div>

          <div className="approval-list">
            {loading ? <div className="panel pad">Carregando...</div> : null}
            {!loading && payments.length === 0 ? (
              <div className="empty">Nenhum pagamento encontrado com esse filtro.</div>
            ) : null}
            {payments.map((payment) => (
              <button
                key={payment.id}
                type="button"
                className={`payment-row ${batch.includes(payment.id) ? "active" : ""}`}
                onClick={() => toggleBatch(payment.id)}
                aria-pressed={batch.includes(payment.id)}
              >
                <div>
                  <strong>{payment.supplierName}</strong>
                  <small>{payment.description}</small>
                  <br />
                  <small className="muted">
                    {payment.work.name} · {shortDate(payment.currentDueDate)}
                  </small>
                </div>
                <div style={{ textAlign: "right", display: "grid", gap: 6 }}>
                  <Money value={payment.amount} />
                  <StatusBadge status={payment.status} />
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="section">
          <div className="section-header">
            <h2>Detalhes</h2>
          </div>
          <div className="panel pad">
            {!selected ? (
              <p className="muted">Selecione um pagamento para ver os detalhes.</p>
            ) : (
              <>
                <div className="detail-list">
                  <div className="detail-item">
                    <span>Fornecedor</span>
                    <strong>{selected.supplierName}</strong>
                  </div>
                  <div className="detail-item">
                    <span>Descrição</span>
                    <strong>{selected.description}</strong>
                  </div>
                  <div className="detail-item">
                    <span>Categoria</span>
                    <strong>{selected.category || "-"}</strong>
                  </div>
                  <div className="detail-item">
                    <span>Conta / centro de custo</span>
                    <strong>
                      {selected.work.name} ({selected.costCenter})
                    </strong>
                  </div>
                  <div className="detail-item">
                    <span>Vencimento</span>
                    <strong>{shortDate(selected.currentDueDate)}</strong>
                    {selected.originalDueDate !== selected.currentDueDate ? (
                      <small className="muted">
                        Original: {shortDate(selected.originalDueDate)}
                      </small>
                    ) : null}
                  </div>
                  <div className="detail-item">
                    <span>Valor</span>
                    <strong>
                      <Money value={selected.amount} />
                    </strong>
                  </div>
                  <div className="detail-item">
                    <span>Status</span>
                    <StatusBadge status={selected.status} />
                  </div>
                </div>

                <div className="button-row" style={{ marginTop: 14 }}>
                  <button
                    className="button success"
                    type="button"
                    disabled={busy || selected.status === "APROVADO"}
                    onClick={() => void runAction("approve")}
                  >
                    <CheckCircle2 size={16} />
                    Aprovar
                  </button>
                  <button
                    className="button danger"
                    type="button"
                    disabled={busy || selected.status === "APROVADO"}
                    onClick={() => setMode("reject")}
                  >
                    <XCircle size={16} />
                    Reprovar
                  </button>
                  <button
                    className="button warning"
                    type="button"
                    disabled={busy || selected.status === "APROVADO"}
                    onClick={() => {
                      setNewDueDate(selected.currentDueDate.slice(0, 10));
                      setMode("transfer");
                    }}
                  >
                    <CalendarDays size={16} />
                    Alterar data
                  </button>
                  {isCoordinator ? (
                    <>
                      <button
                        className="button secondary"
                        type="button"
                        disabled={busy || selected.status === "CANCELADO"}
                        onClick={() => setMode("cancel")}
                      >
                        <XCircle size={16} />
                        Cancelar
                      </button>
                      <button
                        className="button ghost"
                        type="button"
                        disabled={busy}
                        onClick={() => setMode("reopen")}
                      >
                        <RotateCcw size={16} />
                        Voltar para em aberto
                      </button>
                    </>
                  ) : null}
                </div>

                {selected.actions?.length ? (
                  <div style={{ marginTop: 16 }}>
                    <h3 style={{ fontSize: 14, margin: "0 0 8px" }}>Histórico</h3>
                    <div className="detail-list">
                      {selected.actions.map((action) => (
                        <div className="detail-item" key={action.id}>
                          <span>
                            {action.type} · {dateTime(action.createdAt)}
                          </span>
                          <strong>{action.actor?.name ?? "Sistema"}</strong>
                          {action.reason ? (
                            <small className="muted">{action.reason}</small>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>
      </section>

      {mode ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <form className="modal" onSubmit={onSubmitModal}>
            <h2>{modeLabels[mode]}</h2>
            <p>{selected?.supplierName}</p>

            {mode === "transfer" ? (
              <div className="field">
                <label htmlFor="new-due-date">Nova data</label>
                <input
                  className="input"
                  id="new-due-date"
                  type="date"
                  value={newDueDate}
                  onChange={(event) => setNewDueDate(event.target.value)}
                  required
                />
              </div>
            ) : null}

            <div className="field">
              <label htmlFor="reason">Motivo</label>
              <textarea
                className="textarea"
                id="reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                required
                minLength={3}
              />
            </div>

            <div className="button-row">
              <button className="button" type="submit" disabled={busy}>
                {busy ? "Enviando..." : "Confirmar"}
              </button>
              <button
                className="button secondary"
                type="button"
                onClick={() => {
                  setMode(null);
                  setReason("");
                }}
                disabled={busy}
              >
                Voltar
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {batchOpen ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <form className="modal" onSubmit={runBatch}>
            <h2>Ações em lote</h2>
            <p>
              {batchPayments.length} pagamento(s) selecionado(s) · {money(batchTotal)}
            </p>

            <div className="field">
              <label htmlFor="batch-action">Ação</label>
              <select
                className="select"
                id="batch-action"
                value={batchAction}
                onChange={(event) => setBatchAction(event.target.value as BatchAction)}
                disabled={busy}
              >
                <option value="approve">Aprovar os {batchPayments.length}</option>
                <option value="reject">Reprovar os {batchPayments.length}</option>
                <option value="transfer">Alterar a data dos {batchPayments.length}</option>
                {/* Voltar para em aberto e critico: a rota so aceita do coordenador. */}
                {isCoordinator ? (
                  <option value="reopen">Voltar os {batchPayments.length} para em aberto</option>
                ) : null}
              </select>
            </div>

            {batchAction === "transfer" ? (
              <div className="field">
                <label htmlFor="batch-date">Nova data (para todos)</label>
                <input
                  className="input"
                  id="batch-date"
                  type="date"
                  value={batchDueDate}
                  onChange={(event) => setBatchDueDate(event.target.value)}
                  required
                  disabled={busy}
                />
              </div>
            ) : null}

            {batchAction !== "approve" ? (
              <div className="field">
                <label htmlFor="batch-reason">Motivo (aplicado a todos)</label>
                <textarea
                  className="textarea"
                  id="batch-reason"
                  value={batchReason}
                  onChange={(event) => setBatchReason(event.target.value)}
                  required
                  minLength={3}
                  disabled={busy}
                />
              </div>
            ) : null}

            <div className="panel pad" style={{ maxHeight: 140, overflowY: "auto" }}>
              {batchPayments.map((payment) => (
                <div key={payment.id} style={{ fontSize: 12 }}>
                  <span className="muted">{payment.work.name}</span> {payment.supplierName} ·{" "}
                  <Money value={payment.amount} />
                </div>
              ))}
            </div>

            {busy ? (
              <p className="muted">
                Processando {batchProgress} de {batchPayments.length}...
              </p>
            ) : null}

            <div className="button-row">
              <button className="button" type="submit" disabled={busy}>
                {busy ? "Processando..." : `Confirmar ${batchActionLabels[batchAction]}`}
              </button>
              <button
                className="button secondary"
                type="button"
                onClick={() => setBatchOpen(false)}
                disabled={busy}
              >
                Voltar
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
