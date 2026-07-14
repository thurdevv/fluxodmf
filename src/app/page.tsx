import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

// Todos os perfis entram no mesmo painel; as abas e que variam por perfil.
export default async function Home() {
  const session = await getSession();
  redirect(session ? "/painel" : "/login");
}
