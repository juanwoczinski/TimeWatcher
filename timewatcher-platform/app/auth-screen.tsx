"use client";

import { useEffect, useState } from "react";
import type { ChangeEvent, ReactNode } from "react";

// The GrainGradient shader is WebGL-based; load it only on the client to avoid
// the SSR/Workers build touching browser globals.
function ShaderPanel() {
  const [Shader, setShader] = useState<
    ((props: Record<string, unknown>) => ReactNode) | null
  >(null);
  useEffect(() => {
    let alive = true;
    import("@paper-design/shaders-react")
      .then((m) => {
        if (alive) setShader(() => m.GrainGradient as never);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return (
    <div className="relative hidden overflow-hidden rounded-md bg-black p-8 text-white sm:p-12 lg:flex lg:min-h-0">
      {Shader && (
        <Shader
          speed={1}
          scale={1}
          rotation={0}
          offsetX={0}
          offsetY={0}
          softness={0.5}
          intensity={0.5}
          noise={0.25}
          shape="corners"
          frame={2854.5}
          colors={["#FFFFFF", "#14CFE8", "#7A52FF", "#FFFFFF"]}
          colorBack="#00000000"
          className="absolute inset-0 bg-black"
        />
      )}
      <div className="relative z-10 flex h-full w-full flex-col justify-between">
        <h2 className="max-w-[620px] pt-0 text-5xl font-medium tracking-[-0.05em] text-white sm:text-6xl lg:pt-16 lg:text-[64px] lg:leading-[0.98] xl:text-[70px]">
          Inteligência
          <br />
          do tempo
        </h2>
        <div className="mb-0 inline-flex items-center gap-3 xl:mb-24">
          <img
            src="/timewatcher-logo.png"
            alt=""
            className="size-9 rounded-lg xl:size-11"
          />
          <span className="text-lg font-medium text-white/85 xl:text-2xl">
            TeamWatcher · by Synova IT
          </span>
        </div>
      </div>
    </div>
  );
}

function AuthField({
  label,
  type = "text",
  value,
  onChange,
  autoComplete,
  readOnly,
}: {
  label: string;
  type?: string;
  value: string;
  onChange?: (e: ChangeEvent<HTMLInputElement>) => void;
  autoComplete?: string;
  readOnly?: boolean;
}) {
  return (
    <label className="flex h-14 items-center gap-4 rounded-[10px] border border-black/25 bg-white px-5 text-lg leading-none focus-within:border-black/60 dark:border-white/15 dark:bg-white/5 dark:focus-within:border-white/40 xl:text-xl">
      <input
        type={type}
        value={value}
        onChange={onChange}
        readOnly={readOnly}
        aria-label={label}
        placeholder={label}
        autoComplete={autoComplete}
        className="min-w-0 flex-1 bg-transparent text-black outline-none placeholder:text-black/40 read-only:text-black/50 dark:text-white dark:placeholder:text-white/35 dark:read-only:text-white/45"
      />
    </label>
  );
}

export function AuthScreen({
  mode,
  token,
  onDone,
}: {
  mode: "login" | "setpw";
  token: string | null;
  onDone: () => void;
}) {
  const isSetPw = mode === "setpw";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isSetPw && token) {
      fetch(`/platform-api/auth/invite?token=${encodeURIComponent(token)}`, {
        credentials: "same-origin",
      })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error("invalid"))))
        .then((d) => setInviteEmail(d.email || ""))
        .catch(() => setError("Convite inválido ou expirado."));
    }
  }, [isSetPw, token]);

  const submit = async () => {
    setError("");
    if (isSetPw) {
      if (password.length < 8)
        return setError("A senha precisa de ao menos 8 caracteres.");
      if (password !== confirm) return setError("As senhas não conferem.");
    }
    setBusy(true);
    try {
      const r = isSetPw
        ? await fetch("/platform-api/auth/accept-invite", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({ token, password }),
          })
        : await fetch("/platform-api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({ email, password }),
          });
      if (r.ok) return onDone();
      setError(
        isSetPw
          ? "Convite inválido ou expirado."
          : "E-mail ou senha inválidos.",
      );
    } catch {
      setError("Não foi possível concluir. Tente novamente.");
    }
    setBusy(false);
  };

  return (
    <section className="min-h-screen bg-white p-3 text-black antialiased [font-synthesis:none] dark:bg-[#050505] dark:text-white">
      <div className="grid min-h-[calc(100vh-1.5rem)] gap-6 lg:grid-cols-[0.94fr_1.06fr]">
        <div className="flex min-h-[760px] items-center rounded-md border border-black/20 bg-white px-6 py-12 sm:px-10 lg:min-h-0 lg:px-14 xl:px-20 dark:border-white/10 dark:bg-[#0a0a0a]">
          <div className="mx-auto w-full max-w-[520px]">
            <img
              src="/timewatcher-logo.png"
              alt=""
              className="mb-8 size-12 rounded-xl"
            />
            <h1 className="text-3xl font-medium tracking-[-0.04em] sm:text-4xl lg:text-[42px] lg:leading-[1.05]">
              {isSetPw ? "Definir senha" : "Entrar"}
            </h1>
            <p className="mt-3 text-lg leading-snug text-black/60 dark:text-white/55 sm:text-xl">
              {isSetPw
                ? "Crie sua senha para acessar o TeamWatcher"
                : "Acesse o painel do TeamWatcher"}
            </p>

            <form
              className="mt-10 space-y-5"
              onSubmit={(e) => {
                e.preventDefault();
                if (!busy) submit();
              }}
            >
              {isSetPw ? (
                <>
                  <AuthField
                    label="E-mail"
                    type="email"
                    value={inviteEmail}
                    readOnly
                  />
                  <AuthField
                    label="Nova senha"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                  <AuthField
                    label="Confirmar senha"
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    autoComplete="new-password"
                  />
                </>
              ) : (
                <>
                  <AuthField
                    label="E-mail"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="username"
                  />
                  <AuthField
                    label="Senha"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                  />
                </>
              )}

              {error && (
                <p className="text-sm font-medium text-red-500">{error}</p>
              )}

              <button
                type="submit"
                disabled={busy}
                className="mt-4 flex h-12 w-full items-center justify-center rounded-[10px] border border-black/40 bg-black text-xl font-medium text-white transition-colors hover:bg-black/85 disabled:opacity-60 dark:border-white/40 dark:bg-white dark:text-black dark:hover:bg-white/85"
              >
                {busy
                  ? "…"
                  : isSetPw
                    ? "Definir senha e entrar"
                    : "Entrar"}
              </button>
            </form>

            <p className="mt-8 text-sm leading-5 text-black/45 dark:text-white/40">
              Acesso apenas por convite. Fale com o administrador da sua empresa.
            </p>
          </div>
        </div>

        <ShaderPanel />
      </div>
    </section>
  );
}
