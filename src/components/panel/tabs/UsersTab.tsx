"use client";

import { Check, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { FormEvent, useState } from "react";
import { usePanel } from "@/components/panel/PanelContext";
import { useFetchData } from "@/components/panel/useFetchData";
import { dateTime, userStatusLabels } from "@/lib/format";
import { Role, roleLabels } from "@/lib/permissions";

export type PanelUserRow = {
  id: string;
  name: string;
  username: string;
  email: string;
  role: Role;
  status: keyof typeof userStatusLabels;
  phone: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  createdAt: string;
  works: { id: string; name: string }[];
};

type UsersResponse = {
  users: PanelUserRow[];
  works: { id: string; name: string }[];
  error?: string;
};

/** Cor do badge por status, reaproveitando as classes de status de pagamento. */
const statusClass: Record<PanelUserRow["status"], string> = {
  PENDENTE: "PENDENTE",
  ATIVO: "APROVADO",
  RECUSADO: "REPROVADO",
  INATIVO: "CANCELADO",
};

const emptyForm = {
  name: "",
  username: "",
  email: "",
  password: "",
  phone: "",
  role: Role.FUNCIONARIO as Role,
};

export function UsersTab() {
  const { user: currentUser } = usePanel();
  const { data, error, loading, reload, setError } =
    useFetchData<UsersResponse>("/api/admin/users");
  const [busyId, setBusyId] = useState("");
  const [message, setMessage] = useState("");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [confirmDelete, setConfirmDelete] = useState<PanelUserRow | null>(null);

  const users = data?.users ?? [];

  async function patchUser(id: string, body: Record<string, unknown>, successMessage: string) {
    setBusyId(id);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...body }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Não foi possível atualizar o usuário.");
        return;
      }

      setMessage(successMessage);
      reload();
    } catch {
      setError("Falha de conexão.");
    } finally {
      setBusyId("");
    }
  }

  async function createUser(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    setBusyId("new");

    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Não foi possível criar o usuário.");
        return;
      }

      setForm(emptyForm);
      setCreating(false);
      setMessage("Usuário criado e já ativo.");
      reload();
    } catch {
      setError("Falha de conexão.");
    } finally {
      setBusyId("");
    }
  }

  async function deleteUser(target: PanelUserRow) {
    setBusyId(target.id);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/admin/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: target.id }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Não foi possível excluir o usuário.");
        return;
      }

      setMessage(data.message ?? "Usuário excluído.");
      setConfirmDelete(null);
      reload();
    } catch {
      setError("Falha de conexão.");
    } finally {
      setBusyId("");
    }
  }

  const pending = users.filter((item) => item.status === "PENDENTE");
  const others = users.filter((item) => item.status !== "PENDENTE");

  return (
    <>
      {error ? <div className="alert error">{error}</div> : null}
      {message ? <div className="alert success">{message}</div> : null}

      <section className="section">
        <div className="section-header">
          <h2>Solicitações de acesso ({pending.length})</h2>
          <button className="button ghost" type="button" onClick={reload}>
            <RefreshCw size={16} />
            Atualizar
          </button>
        </div>

        {pending.length === 0 ? (
          <div className="panel pad">
            <span className="muted">Nenhuma solicitação aguardando aprovação.</span>
          </div>
        ) : (
          <div className="panel">
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Usuário</th>
                    <th>E-mail</th>
                    <th>Solicitado em</th>
                    <th>Aprovar como</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {pending.map((item) => (
                    <PendingRow
                      key={item.id}
                      user={item}
                      busy={busyId === item.id}
                      onApprove={(role) =>
                        patchUser(
                          item.id,
                          { status: "ATIVO", role },
                          `Acesso de ${item.name} aprovado como ${roleLabels[role]}.`,
                        )
                      }
                      onReject={() =>
                        patchUser(
                          item.id,
                          { status: "RECUSADO" },
                          `Solicitação de ${item.name} recusada.`,
                        )
                      }
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      <section className="section">
        <div className="section-header">
          <h2>Usuários ({others.length})</h2>
          <button
            className="button"
            type="button"
            onClick={() => setCreating((value) => !value)}
          >
            <Plus size={16} />
            {creating ? "Fechar" : "Novo usuário"}
          </button>
        </div>

        {creating ? (
          <form className="panel pad form-grid" onSubmit={createUser}>
            <div className="field">
              <label htmlFor="new-name">Nome</label>
              <input
                className="input"
                id="new-name"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="new-username">Usuário</label>
              <input
                className="input"
                id="new-username"
                value={form.username}
                onChange={(event) => setForm({ ...form, username: event.target.value })}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="new-email">E-mail</label>
              <input
                className="input"
                id="new-email"
                type="email"
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="new-password">Senha</label>
              <input
                className="input"
                id="new-password"
                type="password"
                value={form.password}
                onChange={(event) => setForm({ ...form, password: event.target.value })}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="new-role">Perfil</label>
              <select
                className="select"
                id="new-role"
                value={form.role}
                onChange={(event) => setForm({ ...form, role: event.target.value as Role })}
              >
                {Object.values(Role).map((role) => (
                  <option key={role} value={role}>
                    {roleLabels[role]}
                  </option>
                ))}
              </select>
            </div>
            <button className="button success" type="submit" disabled={busyId === "new"}>
              {busyId === "new" ? "Criando..." : "Criar usuário"}
            </button>
          </form>
        ) : null}

        <div className="panel">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Usuário</th>
                  <th>Perfil</th>
                  <th>Status</th>
                  <th>Revisado por</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td className="daily-flow-empty" colSpan={6}>
                      Carregando...
                    </td>
                  </tr>
                ) : null}
                {others.map((item) => (
                  <tr key={item.id}>
                    <td>
                      {item.name}
                      {item.id === currentUser.id ? (
                        <>
                          {" "}
                          <small className="muted">(você)</small>
                        </>
                      ) : null}
                      <br />
                      <small className="muted">{item.email}</small>
                    </td>
                    <td>{item.username}</td>
                    <td>{roleLabels[item.role]}</td>
                    <td>
                      <span className={`status ${statusClass[item.status]}`}>
                        {userStatusLabels[item.status]}
                      </span>
                    </td>
                    <td>
                      {item.reviewedBy ? (
                        <>
                          {item.reviewedBy}
                          <br />
                          <small className="muted">
                            {item.reviewedAt ? dateTime(item.reviewedAt) : ""}
                          </small>
                        </>
                      ) : (
                        <span className="muted">-</span>
                      )}
                    </td>
                    <td>
                      <div className="button-row">
                        {item.status === "ATIVO" ? (
                          <button
                            className="button secondary"
                            type="button"
                            disabled={busyId === item.id}
                            onClick={() =>
                              patchUser(
                                item.id,
                                { status: "INATIVO" },
                                `${item.name} desativado.`,
                              )
                            }
                          >
                            Desativar
                          </button>
                        ) : (
                          <button
                            className="button secondary"
                            type="button"
                            disabled={busyId === item.id}
                            onClick={() =>
                              patchUser(item.id, { status: "ATIVO" }, `${item.name} ativado.`)
                            }
                          >
                            Ativar
                          </button>
                        )}
                        <button
                          className="button danger"
                          type="button"
                          disabled={busyId === item.id || item.id === currentUser.id}
                          onClick={() => setConfirmDelete(item)}
                          title={
                            item.id === currentUser.id
                              ? "Você não pode excluir a própria conta"
                              : "Excluir usuário"
                          }
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!loading && others.length === 0 ? (
                  <tr>
                    <td className="daily-flow-empty" colSpan={6}>
                      Nenhum usuário cadastrado.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {confirmDelete ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal">
            <h2>Excluir usuário</h2>
            <p>
              Excluir <strong>{confirmDelete.name}</strong> ({confirmDelete.username})? Se a
              conta tiver histórico no sistema, ela será desativada em vez de removida.
            </p>
            <div className="button-row">
              <button
                className="button danger"
                type="button"
                disabled={busyId === confirmDelete.id}
                onClick={() => void deleteUser(confirmDelete)}
              >
                {busyId === confirmDelete.id ? "Excluindo..." : "Excluir"}
              </button>
              <button
                className="button secondary"
                type="button"
                onClick={() => setConfirmDelete(null)}
              >
                Voltar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function PendingRow({
  user,
  busy,
  onApprove,
  onReject,
}: {
  user: PanelUserRow;
  busy: boolean;
  onApprove: (role: Role) => void;
  onReject: () => void;
}) {
  // O perfil e escolhido no momento da aprovacao, nao no autocadastro.
  const [role, setRole] = useState<Role>(Role.FUNCIONARIO);

  return (
    <tr>
      <td>{user.name}</td>
      <td>{user.username}</td>
      <td>{user.email}</td>
      <td>{dateTime(user.createdAt)}</td>
      <td>
        <select
          className="select"
          value={role}
          onChange={(event) => setRole(event.target.value as Role)}
          aria-label={`Perfil para ${user.name}`}
        >
          {Object.values(Role).map((value) => (
            <option key={value} value={value}>
              {roleLabels[value]}
            </option>
          ))}
        </select>
      </td>
      <td>
        <div className="button-row">
          <button
            className="button success"
            type="button"
            disabled={busy}
            onClick={() => onApprove(role)}
          >
            <Check size={14} />
            Aprovar
          </button>
          <button className="button danger" type="button" disabled={busy} onClick={onReject}>
            <X size={14} />
            Recusar
          </button>
        </div>
      </td>
    </tr>
  );
}
