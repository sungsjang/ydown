import { redirect } from "next/navigation";
import { isSignedIn } from "@/lib/auth";
import { LoginForm } from "@/components/login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await isSignedIn()) redirect("/");
  return (
    <main className="login-shell">
      <section className="login-card">
        <div className="brand-mark" aria-hidden="true">Y</div>
        <div>
          <p className="eyebrow">PERSONAL DOWNLOAD QUEUE</p>
          <h1>YDown</h1>
          <p className="muted">내 PC의 다운로드 작업함에 안전하게 접속합니다.</p>
        </div>
        <LoginForm />
      </section>
    </main>
  );
}
