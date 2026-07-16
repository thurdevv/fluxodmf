"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Upload,
  Wand2,
} from "lucide-react";
import { ChangeEvent, useRef, useState } from "react";
import { Money } from "@/components/Money";
import { money, shortDate } from "@/lib/format";
import type { FlowConversion } from "@/lib/flow-converter";
import type { ImportPreview } from "@/types";

type ConfirmResponse = {
  flowName?: string;
  importedRows?: number;
  skippedRows?: number;
  importedContributions?: number;
  createdAccounts?: string[];
  error?: string;
};

export function ImportTab() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [importName, setImportName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Conversor do export bruto do Conta Azul.
  const [rawFile, setRawFile] = useState<File | null>(null);
  const [conversion, setConversion] = useState<FlowConversion | null>(null);
  const [aportes, setAportes] = useState<Record<string, string>>({});
  const [converting, setConverting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const rawInputRef = useRef<HTMLInputElement>(null);

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

  function onRawFileChange(event: ChangeEvent<HTMLInputElement>) {
    setRawFile(event.target.files?.[0] ?? null);
    setConversion(null);
    setAportes({});
    setError("");
    setMessage("");
  }

  /** Le a planilha bruta e mostra o que sairia, sem gerar o arquivo ainda: os
   *  aportes so podem ser informados depois que sabemos quais contas existem. */
  async function convertPreview() {
    if (!rawFile) return;

    setConverting(true);
    setError("");
    setMessage("");
    setConversion(null);

    try {
      const formData = new FormData();
      formData.append("file", rawFile);

      const response = await fetch("/api/imports/convert/preview", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Não foi possível ler a planilha bruta.");
        return;
      }

      setConversion(data as FlowConversion);
    } catch {
      setError("Falha de conexão ao enviar a planilha bruta.");
    } finally {
      setConverting(false);
    }
  }

  async function downloadFlow() {
    if (!rawFile || !conversion) return;

    setDownloading(true);
    setError("");
    setMessage("");

    try {
      const formData = new FormData();
      formData.append("file", rawFile);
      formData.append(
        "aportes",
        JSON.stringify(
          conversion.accounts.map((account) => ({
            accountLabel: account.accountLabel,
            amount: Number(aportes[account.accountLabel]?.replace(",", ".") ?? 0) || 0,
          })),
        ),
      );

      const response = await fetch("/api/imports/convert", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.error ?? "Não foi possível gerar a planilha de fluxo.");
        return;
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = conversion.suggestedFileName;
      anchor.click();
      URL.revokeObjectURL(url);

      setMessage(
        `${conversion.suggestedFileName} gerado. Envie esse arquivo no campo de importação acima.`,
      );
    } catch {
      setError("Falha de conexão ao gerar a planilha de fluxo.");
    } finally {
      setDownloading(false);
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
          importName,
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
      if (data.createdAccounts?.length) {
        parts.push(`contas criadas: ${data.createdAccounts.join(", ")}`);
      }

      setPreview(null);
      setFile(null);
      setImportName("");
      if (fileInputRef.current) fileInputRef.current.value = "";

      setMessage(`${data.flowName ? `${data.flowName}: ` : ""}${parts.join(", ")}.`);
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
        <div className="import-workspace">
          <ol className="process-steps" aria-label="Etapas da importação">
            <li className="active"><span>1</span><strong>Selecionar</strong><small>CSV ou XLSX</small></li>
            <li><span>2</span><strong>Validar</strong><small>Linhas e aportes</small></li>
            <li><span>3</span><strong>Confirmar</strong><small>Criar o fluxo</small></li>
          </ol>

          <div className="import-box">
            <span className="import-icon" aria-hidden="true">
              <FileSpreadsheet size={30} />
            </span>
            <div className="import-copy">
              <span className="eyebrow">PASSO 1 DE 3</span>
              <strong>Selecione a planilha do dia</strong>
              <span className="muted">
                CSV ou XLSX com fornecedor, data, descrição, valor e centro de custo.
              </span>
            </div>
            <div className="field import-name-field">
            <label htmlFor="import-name">Nome do fluxo</label>
            <input
              className="input"
              id="import-name"
              value={importName}
              onChange={(event) => setImportName(event.target.value)}
              placeholder={`FLUXO DE PAGAMENTOS ${new Intl.DateTimeFormat("pt-BR", {
                day: "2-digit",
                month: "2-digit",
              })
                .format(new Date())
                .replace("/", ".")}`}
              maxLength={120}
            />
            <small className="muted">Opcional. Em branco, o sistema usa o nome sugerido.</small>
            </div>
            {file ? <span className="selected-file import-file-name">{file.name}</span> : null}
            <input
              ref={fileInputRef}
              className="visually-hidden"
              id="file"
              type="file"
              accept=".csv,.xlsx"
              aria-label="Planilha de fluxo para importar"
              onChange={onFileChange}
            />
            <div className="button-row import-actions">
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
                  Trocar arquivo
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <details className="secondary-tool panel">
        <summary>
          <span className="secondary-tool-icon" aria-hidden="true"><Wand2 size={18} /></span>
          <span>
            <strong>Precisa converter o arquivo bruto do Conta Azul?</strong>
            <small>Abra a ferramenta auxiliar para gerar uma planilha compatível.</small>
          </span>
          <span className="secondary-tool-action">
            <span className="when-closed">Abrir</span>
            <span className="when-open">Fechar</span>
          </span>
        </summary>

        <div className="secondary-tool-content form-grid">
          <p className="muted">
            Transforma o export bruto <strong>Visão Contas a Pagar</strong> do Conta Azul no
            modelo <strong>FLUXO DE PAGAMENTOS JFX</strong>. O arquivo bruto não entra direto na
            importação: os nomes das colunas não batem.
          </p>

          {rawFile ? <span className="muted import-file-name">{rawFile.name}</span> : null}

          <input
            ref={rawInputRef}
            className="visually-hidden"
            id="raw-file"
            type="file"
            accept=".csv,.xls,.xlsx"
            aria-label="Planilha bruta do Conta Azul para converter"
            onChange={onRawFileChange}
          />

          <div className="button-row">
            <button
              className="button"
              type="button"
              onClick={() => (rawFile ? void convertPreview() : rawInputRef.current?.click())}
              disabled={converting}
            >
              <Wand2 size={16} />
              {converting ? "Lendo..." : rawFile ? "Ler planilha bruta" : "Selecionar planilha bruta"}
            </button>
            {rawFile ? (
              <button
                className="button secondary"
                type="button"
                onClick={() => rawInputRef.current?.click()}
                disabled={converting}
              >
                Trocar
              </button>
            ) : null}
          </div>
        </div>
      </details>

      {error ? <div className="alert error" role="alert">{error}</div> : null}
      {message ? <div className="alert success" role="status">{message}</div> : null}

      {conversion?.missingColumns.length ? (
        <div className="alert error" role="alert">
          Colunas obrigatórias não encontradas na planilha bruta:{" "}
          {conversion.missingColumns.join(", ")}.
        </div>
      ) : null}

      {conversion && !conversion.missingColumns.length ? (
        <section className="section">
          <div className="section-header">
            <h2>Fluxo a gerar</h2>
            <button
              className="button success"
              type="button"
              onClick={() => void downloadFlow()}
              disabled={conversion.validRows === 0 || downloading}
            >
              <Download size={16} />
              {downloading ? "Gerando..." : "Gerar e baixar"}
            </button>
          </div>

          <section className="stats-grid">
            <div className="stat">
              <span>Linhas</span>
              <strong>{conversion.validRows}</strong>
              <small>de {conversion.totalRows} lidas</small>
            </div>
            <div className="stat">
              <span>Total</span>
              <strong>{money(conversion.totalAmount)}</strong>
              <small>soma das linhas</small>
            </div>
            <div className="stat">
              <span>Ignoradas</span>
              <strong>{conversion.invalidRows}</strong>
              <small>fora do arquivo gerado</small>
            </div>
            <div className="stat">
              <span>Arquivo</span>
              <strong>
                {conversion.flowDate ? shortDate(conversion.flowDate) : "-"}
              </strong>
              <small>{conversion.suggestedFileName}</small>
            </div>
          </section>

          <div className="panel">
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Conta</th>
                    <th>Situação</th>
                    <th className="amount">Comprometido</th>
                    <th className="amount">Valor do aporte</th>
                  </tr>
                </thead>
                <tbody>
                  {conversion.accounts.map((account) => (
                    <tr key={account.accountLabel}>
                      <td>{account.accountLabel}</td>
                      <td>
                        {account.isNewWork ? (
                          <span className="status TRANSFERIDO">Conta nova</span>
                        ) : (
                          <span className="status APROVADO">Cadastrada</span>
                        )}
                      </td>
                      <td className="amount">
                        <Money value={account.computedAmount} />
                      </td>
                      <td className="amount">
                        <input
                          className="input"
                          type="number"
                          min="0"
                          step="0.01"
                          inputMode="decimal"
                          placeholder="0,00"
                          aria-label={`Valor do aporte para ${account.accountLabel}`}
                          value={aportes[account.accountLabel] ?? ""}
                          onChange={(event) =>
                            setAportes({
                              ...aportes,
                              [account.accountLabel]: event.target.value,
                            })
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <span className="muted">
            O aporte informado vai para o bloco APORTES da planilha gerada. Conta sem valor não
            entra no bloco.
          </span>
        </section>
      ) : null}

      {preview?.missingColumns.length ? (
        <div className="alert error" role="alert">
          Colunas obrigatórias não encontradas: {preview.missingColumns.join(", ")}.
        </div>
      ) : null}

      {preview?.newAccounts.length ? (
        <div className="alert">
          <strong>
            {preview.newAccounts.length} centro(s) de custo novo(s) — a conta será criada na
            importação:
          </strong>{" "}
          {preview.newAccounts.join(", ")}.
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
            <div className="alert error" role="alert">
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
                            {row.errors.length > 0 ? (
                              <span className="status REPROVADO">{row.errors.join("; ")}</span>
                            ) : row.isNewWork ? (
                              <span className="status TRANSFERIDO">Conta nova</span>
                            ) : (
                              <span className="status APROVADO">Será importado</span>
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
              <div className="button-row">
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
                        <td>
                          {row.workName ?? row.costCenter ?? "-"}
                          {row.isNewWork ? (
                            <>
                              <br />
                              <small style={{ color: "var(--info)" }}>conta nova</small>
                            </>
                          ) : null}
                        </td>
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
