"use client";

import { BarChart3, Clock3, FileCheck2, RefreshCw, Repeat2 } from "lucide-react";
import { FormEvent, useState } from "react";
import { Money } from "@/components/Money";
import { useFetchData } from "@/components/panel/useFetchData";
import { money } from "@/lib/format";

type Analytics = {
  totals: {
    amount: number;
    payments: number;
    averageApprovalHours: number;
    reschedules: number;
    receiptOnTimeRate: number;
    receiptEligible: number;
  };
  suppliers: Array<{ name: string; count: number; amount: number }>;
  works: Array<{ name: string; count: number; amount: number }>;
  categoryGrowth: Array<{ category: string; current: number; previous: number; growth: number }>;
  rejectionReasons: Array<{ reason: string; count: number }>;
  monthlyByWork: Array<{ month: string; work: string; amount: number }>;
  filters: {
    from: string;
    to: string;
    workId: string | null;
    works: Array<{ id: string; name: string }>;
  };
};

export function AnalyticsTab() {
  const [draftFilters, setDraftFilters] = useState({ from: "", to: "", workId: "" });
  const [filters, setFilters] = useState({ from: "", to: "", workId: "" });
  const parameters = new URLSearchParams(
    Object.entries(filters).filter(([, value]) => value) as Array<[string, string]>,
  );
  const { data, error, loading, reload } = useFetchData<Analytics>(
    `/api/analytics?${parameters.toString()}`,
  );

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFilters(draftFilters);
  }

  if (loading) return <div className="panel pad">Calculando indicadores...</div>;
  if (error || !data) return <div className="alert error">{error || "Indicadores indisponíveis."}</div>;
  const maxSupplier = Math.max(...data.suppliers.map((item) => item.amount), 1);
  const months = [...new Set(data.monthlyByWork.map((item) => item.month))].slice(-6);
  return (
    <>
      <div className="section-header">
        <div>
          <h2>Visão gerencial</h2>
          <span className="muted">Indicadores do período e da obra selecionados.</span>
        </div>
        <button className="button ghost" type="button" onClick={reload}>
          <RefreshCw size={16} /> Atualizar
        </button>
      </div>

      <form className="panel pad toolbar analytics-filters" onSubmit={applyFilters}>
        <div className="field">
          <label htmlFor="analytics-from">De</label>
          <input
            className="input"
            id="analytics-from"
            type="date"
            value={draftFilters.from}
            onChange={(event) => setDraftFilters({ ...draftFilters, from: event.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="analytics-to">Até</label>
          <input
            className="input"
            id="analytics-to"
            type="date"
            value={draftFilters.to}
            onChange={(event) => setDraftFilters({ ...draftFilters, to: event.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="analytics-work">Obra</label>
          <select
            className="select"
            id="analytics-work"
            value={draftFilters.workId}
            onChange={(event) => setDraftFilters({ ...draftFilters, workId: event.target.value })}
          >
            <option value="">Todas as obras</option>
            {data.filters.works.map((work) => (
              <option key={work.id} value={work.id}>
                {work.name}
              </option>
            ))}
          </select>
        </div>
        <div className="form-actions">
          <button className="button" type="submit">Aplicar filtros</button>
          <button
            className="button ghost"
            type="button"
            onClick={() => {
              setDraftFilters({ from: "", to: "", workId: "" });
              setFilters({ from: "", to: "", workId: "" });
            }}
          >
            Limpar
          </button>
        </div>
      </form>

      <section className="approval-stats">
        <div className="approval-stat">
          <span>Movimentado</span><strong>{money(data.totals.amount)}</strong>
          <small>{data.totals.payments} pagamentos</small>
        </div>
        <div className="approval-stat approval-stat-success">
          <span><Clock3 size={14} /> Tempo de aprovação</span>
          <strong>{data.totals.averageApprovalHours.toFixed(1)}h</strong><small>média</small>
        </div>
        <div className="approval-stat approval-stat-warning">
          <span><Repeat2 size={14} /> Remarcações</span><strong>{data.totals.reschedules}</strong>
          <small>no período</small>
        </div>
        <div className="approval-stat approval-stat-success">
          <span><FileCheck2 size={14} /> Notas no prazo</span>
          <strong>{data.totals.receiptOnTimeRate.toFixed(0)}%</strong>
          <small>{data.totals.receiptEligible} vencidas analisadas</small>
        </div>
      </section>

      <section className="split-grid">
        <div className="panel pad">
          <h2><BarChart3 size={18} /> Gasto por fornecedor</h2>
          <div className="metric-bars">
            {data.suppliers.map((item) => (
              <div className="metric-bar" key={item.name}>
                <div><strong>{item.name}</strong><span>{item.count} lançamento(s) · <Money value={item.amount} /></span></div>
                <span className="metric-track"><i style={{ width: `${(item.amount / maxSupplier) * 100}%` }} /></span>
              </div>
            ))}
          </div>
        </div>
        <div className="panel pad">
          <h2>Evolução por obra</h2>
          <div className="table-wrap">
            <table className="table"><thead><tr><th>Obra</th>{months.map((month) => <th className="amount" key={month}>{month.slice(5)}</th>)}</tr></thead>
              <tbody>{data.works.map((work) => <tr key={work.name}><td><strong>{work.name}</strong><small className="muted">{work.count} itens</small></td>{months.map((month) => <td className="amount" key={month}>{money(data.monthlyByWork.find((item) => item.month === month && item.work === work.name)?.amount ?? 0)}</td>)}</tr>)}</tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="split-grid">
        <div className="panel pad">
          <h2>Categorias que mais cresceram</h2>
          <div className="detail-list">{data.categoryGrowth.map((item) => <div className="detail-item" key={item.category}><span>{item.category}</span><strong>{money(item.current)}</strong><small className={item.growth > 0 ? "trend-up" : "muted"}>{item.growth > 0 ? "+" : ""}{item.growth.toFixed(0)}% contra os 30 dias anteriores</small></div>)}</div>
        </div>
        <div className="panel pad">
          <h2>Motivos de reprovação</h2>
          {data.rejectionReasons.length ? <div className="detail-list">{data.rejectionReasons.map((item) => <div className="detail-item" key={item.reason}><span>{item.reason}</span><strong>{item.count}</strong></div>)}</div> : <p className="muted">Nenhuma reprovação no período.</p>}
        </div>
      </section>
    </>
  );
}
