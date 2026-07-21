"use client";

import { BarChart3, Clock3, FileCheck2, RefreshCw, Repeat2 } from "lucide-react";
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
};

export function AnalyticsTab() {
  const { data, error, loading, reload } = useFetchData<Analytics>("/api/analytics");
  if (loading) return <div className="panel pad">Calculando indicadores...</div>;
  if (error || !data) return <div className="alert error">{error || "Indicadores indisponíveis."}</div>;
  const maxSupplier = Math.max(...data.suppliers.map((item) => item.amount), 1);
  const months = [...new Set(data.monthlyByWork.map((item) => item.month))].slice(-6);

  return (
    <>
      <div className="section-header">
        <div>
          <h2>Visão gerencial</h2>
          <span className="muted">Últimos 12 meses, com rateios considerados.</span>
        </div>
        <button className="button ghost" type="button" onClick={reload}>
          <RefreshCw size={16} /> Atualizar
        </button>
      </div>

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
