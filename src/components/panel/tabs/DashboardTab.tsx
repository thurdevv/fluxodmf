"use client";

import { useEffect, useState } from "react";
import { Money } from "@/components/Money";
import { StatusBadge } from "@/components/StatusBadge";
import { money, shortDate, statusLabels } from "@/lib/format";

type StatusKey = keyof typeof statusLabels;

type AccountMetric = {
  workId: string;
  name: string;
  count: number;
  totalAmount: number;
  openAmount: number;
  contribution: number;
  balance: number;
  coverage: number | null;
};

type PaymentRow = {
  id: string;
  supplierName: string;
  description: string;
  amount: number;
  category: string;
  currentDueDate: string;
  status: StatusKey;
  work: { name: string };
  overdue: boolean;
  dueToday: boolean;
};

type DashboardResponse = {
  totals: {
    count: number;
    amount: number;
    openAmount: number;
    contribution: number;
    overdueCount: number;
    overdueAmount: number;
    todayCount: number;
    todayAmount: number;
  };
  referenceDate: string;
  statusCards: { status: StatusKey; count: number; amount: number }[];
  byAccount: AccountMetric[];
  byCategory: { category: string; count: number; amount: number }[];
  flow: PaymentRow[];
};

/** Dias de atraso entre o vencimento e a data de referencia do servidor. */
function daysLate(dueDate: string, referenceDate: string) {
  const due = Date.parse(`${dueDate.slice(0, 10)}T00:00:00.000Z`);
  const reference = Date.parse(`${referenceDate}T00:00:00.000Z`);
  return Math.round((reference - due) / 86_400_000);
}

export function DashboardTab() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    fetch("/api/dashboard")
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Falha ao carregar métricas.");
        return body as DashboardResponse;
      })
      .then((body) => active && setData(body))
      .catch((err: Error) => active && setError(err.message))
      .finally(() => active && setLoading(false));

    return () => {
      active = false;
    };
  }, []);

  if (loading) return <div className="panel pad">Carregando métricas...</div>;
  if (error) return <div className="alert error">{error}</div>;
  if (!data) return null;

  const { totals } = data;
  const balance = Number((totals.contribution - totals.openAmount).toFixed(2));
  const maxCategory = data.byCategory[0]?.amount ?? 0;

  return (
    <>
      <section className="stats-grid" aria-label="Resumo do fluxo">
        <div className="stat">
          <span>Pagamentos</span>
          <strong>{totals.count}</strong>
          <small>{money(totals.amount)} no total</small>
        </div>
        <div className="stat">
          <span>Em aberto</span>
          <strong>{money(totals.openAmount)}</strong>
          <small>a sair do caixa</small>
        </div>
        <div className="stat">
          <span>Vencidos</span>
          <strong style={{ color: totals.overdueCount > 0 ? "var(--danger)" : undefined }}>
            {totals.overdueCount}
          </strong>
          <small>
            {totals.overdueCount > 0 ? money(totals.overdueAmount) : "nada em atraso"}
          </small>
        </div>
        <div className="stat">
          <span>Aportes</span>
          <strong>{money(totals.contribution)}</strong>
          <small>entradas previstas</small>
        </div>
        <div className="stat">
          <span>Saldo</span>
          <strong style={{ color: balance < 0 ? "var(--danger)" : "var(--success)" }}>
            {money(balance)}
          </strong>
          <small>{balance < 0 ? "aporte insuficiente" : "aporte cobre o fluxo"}</small>
        </div>
      </section>

      <section className="section">
        <div className="section-header">
          <h2>Cobertura por conta</h2>
        </div>
        <div className="panel">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Conta</th>
                  <th>Lançamentos</th>
                  <th className="amount">Em aberto</th>
                  <th className="amount">Aporte</th>
                  <th className="amount">Saldo</th>
                  <th>Cobertura</th>
                </tr>
              </thead>
              <tbody>
                {data.byAccount.map((account) => (
                  <tr key={account.workId}>
                    <td>{account.name}</td>
                    <td>{account.count}</td>
                    <td className="amount">
                      <Money value={account.openAmount} />
                    </td>
                    <td className="amount">
                      <Money value={account.contribution} />
                    </td>
                    <td
                      className="amount"
                      style={{ color: account.balance < 0 ? "var(--danger)" : undefined }}
                    >
                      <Money value={account.balance} />
                    </td>
                    <td>
                      {account.coverage === null ? (
                        <span className="muted">-</span>
                      ) : (
                        <span
                          className={`status ${account.coverage >= 100 ? "APROVADO" : "PENDENTE"}`}
                        >
                          {account.coverage.toFixed(0)}%
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                {data.byAccount.length === 0 ? (
                  <tr>
                    <td className="daily-flow-empty" colSpan={6}>
                      Nenhuma conta com movimento. Importe uma planilha para começar.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="split-grid">
        <div className="section">
          <div className="section-header">
            <h2>Fluxo em aberto ({data.flow.length})</h2>
            {totals.todayCount > 0 ? (
              <span className="muted">{totals.todayCount} vence(m) hoje</span>
            ) : null}
          </div>
          <div className="panel">
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Fornecedor</th>
                    <th>Conta</th>
                    <th>Vencimento</th>
                    <th>Status</th>
                    <th className="amount">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {data.flow.map((payment) => {
                    const late = payment.overdue
                      ? daysLate(payment.currentDueDate, data.referenceDate)
                      : 0;

                    return (
                      <tr key={payment.id}>
                        <td>
                          {payment.supplierName}
                          <br />
                          <small className="muted">{payment.description}</small>
                        </td>
                        <td>{payment.work.name}</td>
                        <td>
                          <span style={{ color: payment.overdue ? "var(--danger)" : undefined }}>
                            {shortDate(payment.currentDueDate)}
                          </span>
                          {payment.overdue ? (
                            <>
                              <br />
                              <small style={{ color: "var(--danger)" }}>
                                vencido há {late} {late === 1 ? "dia" : "dias"}
                              </small>
                            </>
                          ) : null}
                          {payment.dueToday ? (
                            <>
                              <br />
                              <small style={{ color: "var(--warning)" }}>vence hoje</small>
                            </>
                          ) : null}
                        </td>
                        <td>
                          <StatusBadge status={payment.status} />
                        </td>
                        <td className="amount">
                          <Money value={payment.amount} />
                        </td>
                      </tr>
                    );
                  })}
                  {data.flow.length === 0 ? (
                    <tr>
                      <td className="daily-flow-empty" colSpan={5}>
                        {totals.count > 0
                          ? "Sessão de aprovação concluída: todos os pagamentos foram pagos, reprovados ou remarcados."
                          : "Nenhum pagamento importado. Comece pela aba Importação."}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="section">
          <div className="section-header">
            <h2>Por categoria</h2>
          </div>
          <div className="panel pad">
            <div className="detail-list">
              {data.byCategory.slice(0, 12).map((row) => (
                <div className="detail-item" key={row.category}>
                  <span>{row.category}</span>
                  <strong>
                    <Money value={row.amount} />
                  </strong>
                  {/* Barra proporcional a maior categoria, para leitura rapida. */}
                  <div
                    aria-hidden="true"
                    style={{
                      height: 4,
                      borderRadius: 999,
                      marginTop: 4,
                      background: "var(--primary-soft)",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        borderRadius: 999,
                        background: "var(--primary)",
                        width: `${maxCategory > 0 ? (row.amount / maxCategory) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
              {data.byCategory.length === 0 ? (
                <p className="muted">Sem categorias importadas ainda.</p>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-header">
          <h2>Por status</h2>
        </div>
        <div className="stats-grid">
          {data.statusCards
            .filter((card) => card.count > 0)
            .map((card) => (
              <div className="stat" key={card.status}>
                <span>{statusLabels[card.status]}</span>
                <strong>{card.count}</strong>
                <small>{money(card.amount)}</small>
              </div>
            ))}
          {data.statusCards.every((card) => card.count === 0) ? (
            <p className="muted">Nenhum pagamento importado ainda.</p>
          ) : null}
        </div>
      </section>
    </>
  );
}
