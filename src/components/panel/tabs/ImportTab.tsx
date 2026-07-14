"use client";

import { AlertTriangle, CheckCircle2, FileSpreadsheet, Upload } from "lucide-react";
import { ChangeEvent, useRef, useState } from "react";
import { Money } from "@/components/Money";
import { money, shortDate } from "@/lib/format";
import type { ImportPreview } from "@/types";

type ConfirmResponse = {
  importedRows?: number;
  skippedRows?: number;
  importedContributions?: number;
  error?: string;
};

export function ImportTab() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setPreview(null);
    setMessage("");
    setError("");
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    setFile(event.target.files?.[0] ?? null);
    reset();
  }

  async function previewFile() {
    if (!file) return;

    setLoading(true);
    reset();

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/imports/preview", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Não foi possível ler a planilha.");
        return;
      }

      setPreview(data as ImportPreview);
    } catch {
      setError("Falha de conexão ao enviar o arquivo.");
    } finally {
      setLoading(false);
    }
  }

  async function confirmImport() {
    if (!preview) return;

    setConfirming(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/imports/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: preview.fileName,
          totalRows: preview.totalRows,
          rows: preview.rows,
          contributions: preview.contributions,
        }),
      });

      const data = (await response.json()) as ConfirmResponse;

      if (!response.ok) {
        setError(data.error ?? "Não foi possível confirmar o lote.");
        return;
      }

      const parts = [`${data.importedRows ?? 0} pagamento(s) importado(s)`];
      if (data.importedContributions) parts.push(`${data.importedContributions} aporte(s)`);
      if (data.skippedRows) parts.push(`${data.skippedRows} já existia(m) e foi(ram) ignorado(s)`);

      setPreview(null);
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setMessage(`${parts.join(", ")}.`);
    } catch {
      setError("Falha de conexão ao confirmar o lote.");
    } finally {
      setConfirming(false);
    }
  }

  const divergences = preview?.summaryChecks.filter(
    (check) => check.difference !== null && Math.abs(check.difference) >= 0.01,
  );

  return (
    <>
      <section className="import-center" aria-label="Importar arquivo de pagamentos">
        <div className="import-box">
          <FileSpreadsheet size={38} aria-hidden="true" />
          <strong>Envie o arquivo CSV ou XLSX</strong>
          <span className="muted">
            Colunas: fornecedor, data, descrição, valor, categoria e centro de custo.
          </span>
          {file ? <span className="muted import-file-name">{file.name}</span> : null}
          <input
            ref={fileInputRef}
            className="visually-hidden"
            id="file"
            type="file"
            accept=".csv,.xlsx"
            onChange={onFileChange}
          />
          <div className="button-row">
            <button
              className="button"
              type="button"
              onClick={() => (file ? void previewFile() : fileInputRef.current?.click())}
              disabled={loading}
            >
              <Upload size={16} />
              {loading ? "Lendo..." : file ? "Gerar prévia" : "Selecionar arquivo"}
            </button>
            {file ? (
              <button
                className="button secondary"
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={loading}
              >
                Trocar
              </button>
            ) : null}
          </div>
        </div>
      </section>

      {error ? <div className="alert error">{error}</div> : null}
      {message ? <div className="alert success">{message}</div> : null}

      {preview?.missingColumns.length ? (
        <div className="alert error">
          Colunas obrigatórias não encontradas: {preview.missingColumns.join(", ")}.
        </div>
      ) : null}

      {preview ? (
        <>
          <section className="stats-grid">
            <div className="stat">
              <span>Linhas</span>
              <strong>{preview.totalRows}</strong>
              <small>lidas do arquivo</small>
            </div>
            <div className="stat">
              <span>Válidas</span>
              <strong>{preview.validRows}</strong>
              <small>{money(preview.totalAmount)}</small>
            </div>
            <div className="stat">
              <span>Inválidas</span>
              <strong>{preview.invalidRows}</strong>
              <small>fora do lote</small>
            </div>
            <div className="stat">
              <span>Duplicadas</span>
              <strong>{preview.duplicateRows}</strong>
              <small>bloqueadas</small>
            </div>
            <div className="stat">
              <span>Aportes</span>
              <strong>{preview.contributions.length}</strong>
              <small>
                {money(preview.contributions.reduce((sum, row) => sum + row.amount, 0))}
              </small>
            </div>
          </section>

          {divergences?.length ? (
            <div className="alert error">
              <strong>
                <AlertTriangle size={14} /> Resumo da planilha não bate com a soma das linhas
              </strong>
              <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                {divergences.map((check) => (
                  <li key={check.accountLabel}>
                    {check.accountLabel}: planilha diz {money(check.sheetAmount ?? 0)}, soma das
                    linhas dá {money(check.computedAmount)} (diferença de{" "}
                    {money(check.difference ?? 0)}). O sistema vai usar a soma das linhas.
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {preview.contributions.length ? (
            <section className="section">
              <div className="section-header">
                <h2>Aportes do arquivo</h2>
              </div>
              <div className="panel">
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Conta</th>
                        <th>Reconhecida como</th>
                        <th>Situação</th>
                        <th className="amount">Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.contributions.map((row) => (
                        <tr key={`${row.rowNumber}-${row.accountLabel}`}>
                          <td>{row.accountLabel}</td>
                          <td>{row.workName ?? "-"}</td>
                          <td>
                            {row.errors.length === 0 ? (
                              <span className="status APROVADO">Será importado</span>
                            ) : (
                              <span className="status REPROVADO">{row.errors.join("; ")}</span>
                            )}
                          </td>
                          <td className="amount">
                            <Money value={row.amount} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          ) : null}

          <section className="section">
            <div className="section-header">
              <h2>Prévia do lote</h2>
              <button
                className="button success"
                type="button"
                onClick={confirmImport}
                disabled={preview.validRows === 0 || confirming}
              >
                <CheckCircle2 size={16} />
                {confirming ? "Confirmando..." : `Confirmar ${preview.validRows} linha(s)`}
              </button>
            </div>

            <div className="panel">
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Linha</th>
                      <th>Fornecedor</th>
                      <th>Descrição</th>
                      <th>Categoria</th>
                      <th>Conta</th>
                      <th>Data</th>
                      <th>Situação</th>
                      <th className="amount">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((row) => (
                      <tr key={`${row.rowNumber}-${row.uniqueKey}`}>
                        <td>{row.rowNumber}</td>
                        <td>{row.supplierName || "-"}</td>
                        <td>{row.description || "-"}</td>
                        <td>
                          <small className="muted">{row.category || "-"}</small>
                        </td>
                        <td>{row.workName ?? row.costCenter ?? "-"}</td>
                        <td>{row.currentDueDate ? shortDate(row.currentDueDate) : "-"}</td>
                        <td>
                          {row.errors.length === 0 ? (
                            <span className="status APROVADO">Válida</span>
                          ) : (
                            <span className="status REPROVADO">{row.errors.join("; ")}</span>
                          )}
                        </td>
                        <td className="amount">
                          <Money value={row.amount} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </>
      ) : null}
    </>
  );
}
