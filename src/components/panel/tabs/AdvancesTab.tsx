"use client";

import { BanknoteArrowUp, Pencil, Plus, XCircle } from "lucide-react";
import { FormEvent, useState } from "react";
import { Money } from "@/components/Money";
import { usePanel } from "@/components/panel/PanelContext";
import { useFetchData } from "@/components/panel/useFetchData";
import { shortDate } from "@/lib/format";

type AdvanceStatus = "ABERTO" | "PRESTADO" | "FECHADO" | "CANCELADO";
type Advance = {
  id: string; collaboratorName: string; description: string; amount: number;
  spentAmount: number; returnedAmount: number; balance: number; grantedAt: string;
  dueDate: string; status: AdvanceStatus; notes: string | null; documents: string;
  work: { id: string; name: string } | null;
};
type Response = { advances: Advance[] };
const empty = { id: "", collaboratorName: "", description: "", amount: "", spentAmount: "0", returnedAmount: "0", grantedAt: new Date().toISOString().slice(0, 10), dueDate: "", status: "ABERTO" as AdvanceStatus, notes: "", documents: "", workId: "" };
const labels: Record<AdvanceStatus, string> = { ABERTO: "Em aberto", PRESTADO: "Prestado", FECHADO: "Fechado", CANCELADO: "Cancelado" };

export function AdvancesTab() {
  const { user } = usePanel();
  const { data, error, loading, reload, setError } = useFetchData<Response>("/api/advances");
  const [form, setForm] = useState(empty);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const rows = data?.advances ?? [];
  const openRows = rows.filter((item) => ["ABERTO", "PRESTADO"].includes(item.status));

  function edit(item: Advance) {
    setForm({ id: item.id, collaboratorName: item.collaboratorName, description: item.description, amount: String(item.amount), spentAmount: String(item.spentAmount), returnedAmount: String(item.returnedAmount), grantedAt: item.grantedAt.slice(0, 10), dueDate: item.dueDate.slice(0, 10), status: item.status, notes: item.notes ?? "", documents: item.documents, workId: item.work?.id ?? "" });
    setOpen(true);
  }
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/advances", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save", ...form, amount: Number(form.amount), spentAmount: Number(form.spentAmount), returnedAmount: Number(form.returnedAmount), workId: form.workId || null }) });
      const body = await response.json(); if (!response.ok) { setError(body.error ?? "Não foi possível salvar."); return; }
      setOpen(false); setForm(empty); setMessage("Prestação de contas salva."); reload();
    } catch { setError("Falha de conexão ao salvar o adiantamento."); } finally { setBusy(false); }
  }
  async function cancel(item: Advance) {
    if (!confirm(`Cancelar o adiantamento de ${item.collaboratorName}?`)) return;
    const response = await fetch("/api/advances", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "cancel", id: item.id }) });
    if (response.ok) reload(); else setError((await response.json()).error ?? "Não foi possível cancelar.");
  }

  return <>
    <div className="section-header"><div><h2>Prestação de contas</h2><span className="muted">Adiantamentos, gastos comprovados e devoluções.</span></div><button className="button" type="button" onClick={() => { setForm(empty); setOpen(true); }}><Plus size={16} /> Novo adiantamento</button></div>
    <section className="approval-stats"><div className="approval-stat"><span>Em acompanhamento</span><strong>{openRows.length}</strong><small>adiantamentos</small></div><div className="approval-stat approval-stat-warning"><span>Valor adiantado</span><strong><Money value={openRows.reduce((sum, item) => sum + item.amount, 0)} /></strong><small>em aberto/prestado</small></div><div className="approval-stat approval-stat-danger"><span>A justificar/devolver</span><strong><Money value={openRows.reduce((sum, item) => sum + item.balance, 0)} /></strong><small>saldo pendente</small></div></section>
    {error ? <div className="alert error">{error}</div> : null}{message ? <div className="alert success">{message}</div> : null}
    <div className="panel"><div className="table-wrap"><table className="table"><thead><tr><th>Colaborador</th><th>Obra</th><th>Concessão</th><th>Prazo</th><th>Status</th><th className="amount">Adiantado</th><th className="amount">Gasto</th><th className="amount">Devolvido</th><th className="amount">Saldo</th><th /></tr></thead><tbody>
      {loading ? <tr><td colSpan={10}>Carregando...</td></tr> : rows.map((item) => <tr key={item.id}><td><strong>{item.collaboratorName}</strong><small className="muted">{item.description}</small>{item.documents ? <small className="muted">Docs: {item.documents}</small> : null}</td><td>{item.work?.name ?? "-"}</td><td>{shortDate(item.grantedAt)}</td><td>{shortDate(item.dueDate)}</td><td><span className={`status ${item.status === "FECHADO" ? "APROVADO" : item.status === "CANCELADO" ? "CANCELADO" : "PENDENTE"}`}>{labels[item.status]}</span></td><td className="amount"><Money value={item.amount} /></td><td className="amount"><Money value={item.spentAmount} /></td><td className="amount"><Money value={item.returnedAmount} /></td><td className="amount"><Money value={item.balance} /></td><td><div className="button-row"><button className="icon-button" type="button" title="Editar" onClick={() => edit(item)}><Pencil size={15} /></button>{item.status !== "CANCELADO" ? <button className="icon-button" type="button" title="Cancelar" onClick={() => void cancel(item)}><XCircle size={15} /></button> : null}</div></td></tr>)}
    </tbody></table></div></div>
    {open ? <div className="modal-backdrop" role="dialog" aria-modal="true"><form className="modal modal-wide" onSubmit={save}><h2><BanknoteArrowUp size={20} /> {form.id ? "Editar adiantamento" : "Novo adiantamento"}</h2><div className="form-grid two"><div className="field"><label>Colaborador</label><input className="input" value={form.collaboratorName} onChange={(e) => setForm({ ...form, collaboratorName: e.target.value })} required /></div><div className="field"><label>Obra</label><select className="select" value={form.workId} onChange={(e) => setForm({ ...form, workId: e.target.value })}><option value="">Sem obra</option>{user.works.map((work) => <option key={work.id} value={work.id}>{work.name}</option>)}</select></div><div className="field span-2"><label>Finalidade</label><input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required /></div><div className="field"><label>Valor adiantado</label><input className="input" type="number" min="0.01" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required /></div><div className="field"><label>Valor gasto comprovado</label><input className="input" type="number" min="0" step="0.01" value={form.spentAmount} onChange={(e) => setForm({ ...form, spentAmount: e.target.value })} /></div><div className="field"><label>Valor devolvido</label><input className="input" type="number" min="0" step="0.01" value={form.returnedAmount} onChange={(e) => setForm({ ...form, returnedAmount: e.target.value })} /></div><div className="field"><label>Status</label><select className="select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as AdvanceStatus })}>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div><div className="field"><label>Data da concessão</label><input className="input" type="date" value={form.grantedAt} onChange={(e) => setForm({ ...form, grantedAt: e.target.value })} required /></div><div className="field"><label>Prazo da prestação</label><input className="input" type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} required /></div><div className="field span-2"><label>Documentos apresentados</label><input className="input" placeholder="Ex.: NF 1234, recibo, comprovante PIX" value={form.documents} onChange={(e) => setForm({ ...form, documents: e.target.value })} /></div><div className="field span-2"><label>Observações</label><textarea className="textarea" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div></div><div className="button-row"><button className="button" disabled={busy}>{busy ? "Salvando..." : "Salvar"}</button><button className="button secondary" type="button" onClick={() => setOpen(false)}>Voltar</button></div></form></div> : null}
  </>;
}
