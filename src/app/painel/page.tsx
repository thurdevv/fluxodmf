import { redirect } from "next/navigation";
import { Suspense } from "react";
import { PanelShell } from "@/components/panel/PanelShell";
import { getSession } from "@/lib/auth";

export default async function PainelPage() {
  // Guarda no servidor para nao servir o shell a quem nao tem sessao. O shell
  // revalida no cliente e cada rota de API checa o perfil por conta propria.
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    // O shell le a aba de ?tab=, e useSearchParams exige um limite de Suspense.
    <Suspense
      fallback={
        <div className="login-shell">
          <div className="panel pad">Carregando...</div>
        </div>
      }
    >
      <PanelShell />
    </Suspense>
  );
}
