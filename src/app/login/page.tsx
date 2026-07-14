import { BrandMark } from "@/components/BrandMark";
import { LoginForm } from "@/components/LoginForm";

export default function LoginPage() {
  return (
    <main className="login-shell">
      <section className="login-panel">
        <BrandMark />
        <h1 className="login-title">DJ Fluxo</h1>
        <p className="login-subtitle">Fluxo de pagamentos</p>
        <LoginForm />
      </section>
    </main>
  );
}
