"use client";

import { Check, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { usePanel } from "@/components/panel/PanelContext";
import type { PanelUserRow } from "@/components/panel/tabs/UsersTab";
import { useFetchData } from "@/components/panel/useFetchData";
import { userStatusLabels } from "@/lib/format";
import { Role, roleDescriptions, roleLabels, tabRoles, TAB_IDS } from "@/lib/permissions";

type UsersResponse = {
  users: PanelUserRow[];
  works: { id: string; name: string }[];
  error?: string;
};

const tabLabels: Record<(typeof TAB_IDS)[number], string> = {
  dashboard: "Dashboard",
  importar: "Importação",
  conciliacao: "Conciliação",
  pagamentos: "Pagamentos",
  usuarios: "Usuários",
  permissoes: "Permissões",
  logs: "Logs",
};

export function PermissionsTab() {
  const { user: currentUser } = usePanel();
  const { data, error, loading, reload, setError } =
    useFetchData<UsersResponse>("/api/admin/users");
  const [busyId, setBusyId] = useState("");
  const [message, setMessage] = useState("");

  // Solicitacao pendente ainda nao tem perfil definido: so aparece na aba Usuarios.
  const users = (data?.users ?? []).filter((item) => item.status !== "PENDENTE");
  const works = data?.works ?? [];

  async function update(id: string, body: Record<string, unknown>, successMessage: string) {
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
        setError(data.error ?? "Não foi possível alterar a permissão.");
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

  function toggleWork(target: PanelUserRow, workId: string) {
    const current = target.works.map((work) => work.id);
    const next = current.includes(workId)
      ? current.filter((id) => id !== workId)
      : [...current, workId];

    void update(target.id, { workIds: next }, `Contas de ${target.name} atualizadas.`);
  }

  return (
    <>
      {error ? <div className="alert error" role="alert">{error}</div> : null}
      {message ? <div className="alert success" role="status">{message}</div> : null}

      <section className="section">
        <div className="section-header">
          <h2>O que cada perfil acessa</h2>
        </div>
        <div className="panel">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Perfil</th>
                  {TAB_IDS.map((tab) => (
                    <th key={tab}>{tabLabels[tab]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.values(Role).map((role) => (
                  <tr key={role}>
                    <td>
                      <strong>{roleLabels[role]}</strong>
                      <br />
                      <small className="muted">{roleDescriptions[role]}</small>
                    </td>
                    {TAB_IDS.map((tab) => (
                      <td key={tab}>
                        {tabRoles[tab].includes(role) ? (
                          <Check size={16} color="var(--success)" aria-label="Tem acesso" />
                        ) : (
                          <span className="muted" aria-label="Sem acesso">
                            —
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-header">
          <h2>Perfil de cada usuário</h2>
        </div>
        <div className="panel">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Usuário</th>
                  <th>Status</th>
                  <th>Perfil</th>
                  <th>Contas vinculadas</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td className="daily-flow-empty" colSpan={4}>
                      Carregando...
                    </td>
                  </tr>
                ) : null}
                {users.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.name}</strong>
                      <br />
                      <small className="muted">{item.username}</small>
                    </td>
                    <td>
                      <small className="muted">{userStatusLabels[item.status]}</small>
                    </td>
                    <td>
                      <select
                        className="select"
                        value={item.role}
                        disabled={busyId === item.id}
                        onChange={(event) =>
                          update(
                            item.id,
                            { role: event.target.value },
                            `${item.name} agora é ${roleLabels[event.target.value as Role]}.`,
                          )
                        }
                        aria-label={`Perfil de ${item.name}`}
                      >
                        {Object.values(Role).map((role) => (
                          <option key={role} value={role}>
                            {roleLabels[role]}
                          </option>
                        ))}
                      </select>
                      {item.id === currentUser.id ? (
                        <>
                          <br />
                          <small className="muted">
                            <ShieldCheck size={11} /> sua conta
                          </small>
                        </>
                      ) : null}
                    </td>
                    <td>
                      <div className="checkbox-grid">
                        {works.map((work) => (
                          <label className="checkbox-line" key={work.id}>
                            <input
                              type="checkbox"
                              checked={item.works.some((linked) => linked.id === work.id)}
                              disabled={busyId === item.id}
                              onChange={() => toggleWork(item, work.id)}
                            />
                            {work.name}
                          </label>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
                {!loading && users.length === 0 ? (
                  <tr>
                    <td className="daily-flow-empty" colSpan={4}>
                      Nenhum usuário ativo.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </>
  );
}
