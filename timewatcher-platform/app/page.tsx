"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { AuthScreen } from "./auth-screen";

type Period = "today" | "7d" | "30d" | "custom";
type Section =
  | "Visão geral"
  | "Empresas"
  | "Pessoas"
  | "Times"
  | "Dispositivos"
  | "Atividades"
  | "Relatórios"
  | "Instaladores"
  | "Usuários"
  | "Configurações"
  | "Minha conta";
type Role = "super_admin" | "org_admin" | "manager" | "employee";
type IconName =
  | "overview"
  | "companies"
  | "people"
  | "teams"
  | "devices"
  | "activity"
  | "reports"
  | "installers"
  | "settings"
  | "chevron"
  | "logout"
  | "caret"
  | "camera"
  | "userplus";
type Prefs = {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  density: "comfortable" | "compact";
  setDensity: (v: "comfortable" | "compact") => void;
  period: Period;
  setPeriod: (v: Period) => void;
  avatar: string | null;
  setAvatar: (v: string | null) => void;
  displayName: string;
  setDisplayName: (v: string) => void;
};
type App = {
  name: string;
  seconds: number;
  duration: string;
  classification: "productive" | "neutral" | "unproductive";
  share: number;
};
type UrlUsage = {
  url: string;
  domain: string;
  title: string;
  seconds: number;
  duration: string;
  classification: "productive" | "neutral" | "unproductive";
  share: number;
};
type Device = {
  id: string;
  name: string;
  platform: string;
  lastSeen: string;
  status: "online" | "offline";
  trackedSeconds: number;
  activeSeconds: number;
  presses: number;
  clicks: number;
};
type Schedule = {
  id: string;
  tenantId: string;
  name: string;
  start: string;
  end: string;
  breakMinutes: number;
  weekdays: number[];
};
type Tenant = {
  id: string;
  name: string;
  kind?: string;
  status?: string;
  peopleCount?: number;
  deviceCount?: number;
};
type Person = {
  id: string;
  name: string;
  role: string;
  scheduleId?: string;
  deviceCount: number;
  status: "online" | "offline";
  trackedSeconds: number;
  activeSeconds: number;
  idleSeconds: number;
  productiveSeconds: number;
  focusScore: number;
};
type Data = {
  viewer: { username: string; name: string; role: Role; tenantId: string };
  tenant: Tenant;
  tenants: Tenant[];
  period: Period;
  range: { start: string; end: string };
  generatedAt: string;
  person: Person;
  people: Person[];
  schedules: Schedule[];
  schedule?: Schedule;
  summary: {
    trackedSeconds: number;
    activeSeconds: number;
    idleSeconds: number;
    productiveSeconds: number;
    neutralSeconds: number;
    unproductiveSeconds: number;
    focusScore: number;
    deviceCount: number;
    onlineDeviceCount: number;
    screenshotCount: number;
    urlCount: number;
    webSeconds: number;
    lastSeen: string | null;
  };
  devices: Device[];
  apps: App[];
  urls: UrlUsage[];
  domains: {
    domain: string;
    seconds: number;
    duration: string;
    classification: string;
  }[];
  timeline: { hour: number; label: string; seconds: number }[];
  recent: { timestamp: string; duration: number; app: string; title: string }[];
  input: { presses: number; clicks: number };
};
type Shot = {
  id: string;
  capturedAt: string;
  size: number;
  url: string;
  app?: string;
  title?: string;
  device?: string;
  personName?: string;
};

const classLabel = {
  productive: "Produtivo",
  neutral: "Neutro",
  unproductive: "Não produtivo",
};
const labels: Record<Period, string> = {
  today: "Hoje",
  "7d": "Últimos 7 dias",
  "30d": "Últimos 30 dias",
  custom: "Período personalizado",
};
const baseNav: { name: Section; icon: IconName }[] = [
  { name: "Visão geral", icon: "overview" },
  { name: "Empresas", icon: "companies" },
  { name: "Pessoas", icon: "people" },
  { name: "Times", icon: "teams" },
  { name: "Dispositivos", icon: "devices" },
  { name: "Atividades", icon: "activity" },
  { name: "Relatórios", icon: "reports" },
  { name: "Instaladores", icon: "installers" },
  { name: "Usuários", icon: "userplus" },
  { name: "Configurações", icon: "settings" },
];
const desc: Record<Section, string> = {
  "Visão geral": "Produtividade, aderência e uso do tempo com dados reais.",
  Empresas: "Governança multiempresa controlada pela Synova.",
  Pessoas: "Jornada, atividade, ativos e capturas por colaborador.",
  Times: "Grupos de colaboradores e o gestor responsável por cada um.",
  Dispositivos: "Inventário e saúde dos computadores vinculados.",
  Atividades: "Aplicativos, URLs, janelas, atividade e ociosidade.",
  Relatórios: "Filtros e exportações para análise operacional.",
  Instaladores: "Distribuição individual ou em massa vinculada ao tenant.",
  Usuários: "Convites e contas de acesso da sua empresa.",
  Configurações: "Políticas de coleta, classificação e privacidade.",
  "Minha conta": "Perfil, segurança e preferências da sua conta.",
};
const ROLE_SHORT: Record<string, string> = {
  super_admin: "Super admin",
  org_admin: "Administrador",
  manager: "Gestor",
  member: "Membro",
  employee: "Colaborador",
};
function duration(v: number) {
  const t = Math.max(0, Math.round(v)),
    h = Math.floor(t / 3600),
    m = Math.floor((t % 3600) / 60),
    s = t % 60;
  return h
    ? `${h}h ${String(m).padStart(2, "0")}m`
    : `${m}m ${String(s).padStart(2, "0")}s`;
}
function date(v: string | null) {
  return v
    ? new Date(v).toLocaleString("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
      })
    : "Sem sincronização";
}

// Real brand logos: resolve a domain for common apps, then use a favicon
// service; sites use their own domain. Falls back to an initials badge.
const APP_DOMAINS: Record<string, string> = {
  "visual studio code": "visualstudio.com",
  "vs code": "visualstudio.com",
  vscode: "visualstudio.com",
  code: "visualstudio.com",
  "google chrome": "google.com",
  chrome: "google.com",
  "microsoft edge": "microsoft.com",
  edge: "microsoft.com",
  firefox: "mozilla.org",
  safari: "apple.com",
  slack: "slack.com",
  figma: "figma.com",
  notion: "notion.so",
  terminal: "apple.com",
  iterm: "iterm2.com",
  iterm2: "iterm2.com",
  zoom: "zoom.us",
  "microsoft teams": "microsoft.com",
  teams: "microsoft.com",
  spotify: "spotify.com",
  youtube: "youtube.com",
  gmail: "gmail.com",
  outlook: "outlook.com",
  word: "microsoft.com",
  excel: "microsoft.com",
  powerpoint: "microsoft.com",
  xcode: "apple.com",
  docker: "docker.com",
  postman: "postman.com",
  discord: "discord.com",
  whatsapp: "whatsapp.com",
  telegram: "telegram.org",
  github: "github.com",
  gitkraken: "gitkraken.com",
  "intellij idea": "jetbrains.com",
  pycharm: "jetbrains.com",
  webstorm: "jetbrains.com",
  "sublime text": "sublimetext.com",
  obsidian: "obsidian.md",
  linear: "linear.app",
  jira: "atlassian.com",
  confluence: "atlassian.com",
  trello: "trello.com",
  chatgpt: "openai.com",
  openai: "openai.com",
  codex: "openai.com",
  claude: "claude.ai",
  anthropic: "anthropic.com",
  canva: "canva.com",
  photoshop: "adobe.com",
  illustrator: "adobe.com",
  adobe: "adobe.com",
  finder: "apple.com",
};
function appDomain(name: string): string | null {
  const k = name.trim().toLowerCase();
  if (APP_DOMAINS[k]) return APP_DOMAINS[k];
  for (const key of Object.keys(APP_DOMAINS))
    if (k.includes(key)) return APP_DOMAINS[key];
  return null;
}
function faviconUrl(domain: string) {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;
}
function Glyph({
  domain,
  label,
  kind = "app",
}: {
  domain: string | null;
  label: string;
  kind?: "app" | "site";
}) {
  const [failed, setFailed] = useState(false);
  if (domain && !failed) {
    return (
      <span className={`glyph ${kind}`}>
        <img
          src={faviconUrl(domain)}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
        />
      </span>
    );
  }
  return <i>{label.slice(0, 2).toUpperCase()}</i>;
}
function Icon({ name }: { name: IconName }) {
  const p = {
    viewBox: "0 0 24 24",
    width: 18,
    height: 18,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (name) {
    case "overview":
      return (
        <svg {...p}>
          <rect x="3" y="3" width="7" height="9" rx="1" />
          <rect x="14" y="3" width="7" height="5" rx="1" />
          <rect x="14" y="12" width="7" height="9" rx="1" />
          <rect x="3" y="16" width="7" height="5" rx="1" />
        </svg>
      );
    case "companies":
      return (
        <svg {...p}>
          <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18" />
          <path d="M2 22h20M10 6h4M10 10h4M10 14h4M10 18h4" />
        </svg>
      );
    case "people":
      return (
        <svg {...p}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case "teams":
      return (
        <svg {...p}>
          <circle cx="9" cy="8" r="3" />
          <circle cx="17" cy="9" r="2.2" />
          <path d="M3.5 20v-1.5a4 4 0 0 1 4-4h3a4 4 0 0 1 4 4V20" />
          <path d="M16 14.2a3 3 0 0 1 4.5 2.6V20" />
        </svg>
      );
    case "devices":
      return (
        <svg {...p}>
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <path d="M8 21h8M12 17v4" />
        </svg>
      );
    case "activity":
      return (
        <svg {...p}>
          <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
        </svg>
      );
    case "reports":
      return (
        <svg {...p}>
          <path d="M3 3v18h18" />
          <path d="M8 17v-5M13 17V8M18 17v-8" />
        </svg>
      );
    case "installers":
      return (
        <svg {...p}>
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <path d="M7 10l5 5 5-5M12 15V3" />
        </svg>
      );
    case "settings":
      return (
        <svg {...p}>
          <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />
        </svg>
      );
    case "chevron":
      return (
        <svg {...p}>
          <path d="M15 18l-6-6 6-6" />
        </svg>
      );
    case "logout":
      return (
        <svg {...p}>
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <path d="M16 17l5-5-5-5M21 12H9" />
        </svg>
      );
    case "caret":
      return (
        <svg {...p}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      );
    case "camera":
      return (
        <svg {...p}>
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
          <circle cx="12" cy="13" r="4" />
        </svg>
      );
    case "userplus":
      return (
        <svg {...p}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M19 8v6M22 11h-6" />
        </svg>
      );
  }
}
function OsLogo({ os }: { os: "apple" | "windows" | "deploy" }) {
  if (os === "apple")
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
      </svg>
    );
  if (os === "windows")
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M3 5.1 10.4 4v7.3H3zm0 13.8 7.4 1v-7.2H3zM11.3 3.9 21 2.5v8.8h-9.7zm0 8.4H21v8.8l-9.7-1.4z" />
      </svg>
    );
  return (
    <svg
      viewBox="0 0 24 24"
      width="30"
      height="30"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2" y="3" width="20" height="6" rx="1.5" />
      <rect x="2" y="15" width="20" height="6" rx="1.5" />
      <path d="M6 6h.01M6 18h.01" />
    </svg>
  );
}
const AVATAR_URL = "/platform-api/dashboard/avatar";
function Avatar({
  src,
  initials,
  className = "",
}: {
  src: string | null;
  initials: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return (
    <div className={`avatar ${className}`}>
      {src && !failed ? (
        <img src={src} alt="" onError={() => setFailed(true)} />
      ) : (
        initials
      )}
    </div>
  );
}
function Toggle({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      className={`switch ${on ? "on" : ""}`}
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
    >
      <span />
    </button>
  );
}
function processAvatarBlob(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("decode"));
      img.onload = () => {
        const size = 256;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("canvas"));
        const min = Math.min(img.width, img.height);
        ctx.drawImage(
          img,
          (img.width - min) / 2,
          (img.height - min) / 2,
          min,
          min,
          0,
          0,
          size,
          size,
        );
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("encode"))),
          "image/jpeg",
          0.85,
        );
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}
const ACCOUNT_ROLE: Record<string, string> = {
  super_admin: "Super admin · Synova",
  org_admin: "Admin da organização",
  manager: "Gestor",
  employee: "Colaborador",
};

export default function App() {
  const [phase, setPhase] = useState<"loading" | "login" | "setpw" | "app">(
    "loading",
  );
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  useEffect(() => {
    let token: string | null = null;
    try {
      token = new URL(window.location.href).searchParams.get("invite");
    } catch {}
    if (token) {
      setInviteToken(token);
      setPhase("setpw");
      return;
    }
    fetch("/platform-api/auth/me", { credentials: "same-origin" })
      .then((r) => setPhase(r.ok ? "app" : "login"))
      .catch(() => setPhase("login"));
  }, []);
  if (phase === "loading") return <div className="boot-screen" />;
  if (phase === "app") return <Dashboard />;
  return (
    <AuthScreen
      mode={phase === "setpw" ? "setpw" : "login"}
      token={inviteToken}
      onDone={() => window.location.replace("/")}
    />
  );
}
function Dashboard() {
  const [active, setActive] = useState<Section>("Visão geral"),
    [period, setPeriod] = useState<Period>("today"),
    [start, setStart] = useState(""),
    [end, setEnd] = useState(""),
    [tenant, setTenant] = useState(""),
    [data, setData] = useState<Data | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [density, setDensity] = useState<"comfortable" | "compact">(
    "comfortable",
  );
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const load = useCallback(async () => {
    try {
      setError("");
      const q = new URLSearchParams({ period });
      if (period === "custom" && start && end) {
        q.set("start", start);
        q.set("end", end);
      }
      if (tenant) q.set("tenant", tenant);
      const r = await fetch(`/platform-api/dashboard/data?${q}`, {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!r.ok) throw Error();
      const next = await r.json();
      setData(next);
      if (!tenant) setTenant(next.tenant.id);
    } catch {
      setError("Não foi possível carregar os dados enviados pelo agente.");
    } finally {
      setLoading(false);
    }
  }, [period, start, end, tenant]);
  useEffect(() => {
    setLoading(true);
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);
  useEffect(() => {
    try {
      if (localStorage.getItem("tw.collapsed") === "1") setCollapsed(true);
      if (localStorage.getItem("tw.density") === "compact") setDensity("compact");
      const p = localStorage.getItem("tw.period");
      if (p === "today" || p === "7d" || p === "30d") setPeriod(p);
      const dn = localStorage.getItem("tw.displayName");
      if (dn) setDisplayName(dn);
    } catch {}
    fetch(AVATAR_URL, { credentials: "same-origin", cache: "no-store" })
      .then((r) => {
        if (r.ok) setAvatarUrl(`${AVATAR_URL}?v=${Date.now()}`);
      })
      .catch(() => {});
  }, []);
  const isAdmin =
    data?.viewer.role === "super_admin" || data?.viewer.role === "org_admin";
  const nav = baseNav.filter((n) => {
    if (n.name === "Empresas") return data?.viewer.role === "super_admin";
    if (n.name === "Usuários") return isAdmin;
    if (n.name === "Times")
      return isAdmin || data?.viewer.role === "manager";
    return true;
  });
  const tenantName = data?.tenant.name || "TeamWatcher";
  const shownName = displayName || data?.viewer.name || "TeamWatcher";
  const initials =
    shownName
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase() || "TW";
  const toggleSidebar = () =>
    setCollapsed((v) => {
      const nv = !v;
      try {
        localStorage.setItem("tw.collapsed", nv ? "1" : "0");
      } catch {}
      return nv;
    });
  const setName = (v: string) => {
    setDisplayName(v);
    try {
      if (v) localStorage.setItem("tw.displayName", v);
      else localStorage.removeItem("tw.displayName");
    } catch {}
  };
  const logout = async () => {
    try {
      await fetch("/platform-api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
      });
    } catch {}
    window.location.replace("/");
  };
  const openAccount = () => {
    setActive("Minha conta");
    setUserMenuOpen(false);
  };
  const prefs: Prefs = {
    collapsed,
    setCollapsed,
    density,
    setDensity,
    period,
    setPeriod,
    avatar: avatarUrl,
    setAvatar: setAvatarUrl,
    displayName,
    setDisplayName: setName,
  };
  return (
    <main
      className={`app-shell${collapsed ? " collapsed" : ""}${density === "compact" ? " dense" : ""}`}
    >
      <aside className="sidebar">
        <div className="brand">
          <img src="/timewatcher-logo.png" alt="" />
          <div>
            <strong>TeamWatcher</strong>
            <span>Inteligência do tempo</span>
          </div>
        </div>
        <div className="tenant-picker">
          <span className="tenant-mark">{tenantName[0]}</span>
          <div>
            <strong>{tenantName}</strong>
            <small>
              {data?.viewer.role === "super_admin"
                ? "Console Synova · Super admin"
                : "Ambiente da organização"}
            </small>
          </div>
        </div>
        <nav>
          {nav.map((n) => (
            <button
              key={n.name}
              className={active === n.name ? "active" : ""}
              onClick={() => setActive(n.name)}
              title={n.name}
              aria-current={active === n.name ? "page" : undefined}
            >
              <span className="nav-ico">
                <Icon name={n.icon} />
              </span>
              <span className="nav-label">{n.name}</span>
              {n.name === "Dispositivos" && (
                <b>{data?.summary.deviceCount ?? "—"}</b>
              )}
            </button>
          ))}
        </nav>
        <button
          className="rail-toggle"
          onClick={toggleSidebar}
          aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
          aria-expanded={!collapsed}
          title={collapsed ? "Expandir" : "Recolher"}
        >
          <Icon name="chevron" />
        </button>
        <div className="sidebar-foot">
          <button
            className="user-button"
            onClick={() => setUserMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={userMenuOpen}
            title={shownName}
          >
            <Avatar src={avatarUrl} initials={initials} />
            <div className="user-meta">
              <strong>{shownName}</strong>
              <span>
                {data?.viewer.role === "super_admin"
                  ? "Super admin Synova"
                  : "Admin da organização"}
              </span>
            </div>
            <span className="user-caret">
              <Icon name="caret" />
            </span>
          </button>
          {userMenuOpen && (
            <>
              <div
                className="menu-overlay"
                onClick={() => setUserMenuOpen(false)}
              />
              <div className="user-menu" role="menu">
                <button role="menuitem" onClick={openAccount}>
                  <Icon name="settings" />
                  Configurações da conta
                </button>
                <button role="menuitem" className="danger" onClick={logout}>
                  <Icon name="logout" />
                  Sair
                </button>
              </div>
            </>
          )}
        </div>
      </aside>
      <section className="workspace">
        <header>
          <div>
            <p className="eyebrow">
              {tenantName} · {active}
            </p>
            <h1>{active}</h1>
            <p>{desc[active]}</p>
          </div>
          <button className="refresh-button" onClick={load}>
            ↻ Atualizar
          </button>
        </header>
        <div className="toolbar advanced">
          <div
            className={`live ${data?.summary.onlineDeviceCount ? "" : "offline"}`}
          >
            <i />
            {data?.summary.onlineDeviceCount
              ? "Agente conectado"
              : "Sem sincronização recente"}
            {data?.summary.lastSeen && ` · ${date(data.summary.lastSeen)}`}
          </div>
          <div className="filters">
            {data?.viewer.role === "super_admin" && (
              <select
                value={tenant}
                onChange={(e) => setTenant(e.target.value)}
              >
                {data.tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            )}
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as Period)}
            >
              <option value="today">Hoje</option>
              <option value="7d">7 dias</option>
              <option value="30d">30 dias</option>
              <option value="custom">Personalizado</option>
            </select>
            {period === "custom" && (
              <>
                <input
                  type="date"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                />
                <input
                  type="date"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                />
                <button onClick={load}>Aplicar</button>
              </>
            )}
          </div>
        </div>
        {loading && !data ? (
          <State text="Carregando dados reais da sua máquina…" />
        ) : error && !data ? (
          <State text={error} />
        ) : (
          data && (
            <Content
              active={active}
              data={data}
              setActive={setActive}
              period={period}
              start={start}
              end={end}
              tenant={tenant}
              reload={load}
              prefs={prefs}
            />
          )
        )}
      </section>
    </main>
  );
}
function Content({
  active,
  data,
  setActive,
  period,
  start,
  end,
  tenant,
  reload,
  prefs,
}: {
  active: Section;
  data: Data;
  setActive: (v: Section) => void;
  period: Period;
  start: string;
  end: string;
  tenant: string;
  reload: () => void;
  prefs: Prefs;
}) {
  if (active === "Visão geral") return <Overview d={data} go={setActive} />;
  if (active === "Empresas") return <Companies d={data} reload={reload} />;
  if (active === "Pessoas") return <People d={data} reload={reload} />;
  if (active === "Times") return <Teams d={data} />;
  if (active === "Dispositivos") return <Devices d={data} />;
  if (active === "Atividades") return <Activities d={data} />;
  if (active === "Relatórios")
    return (
      <Reports
        d={data}
        period={period}
        start={start}
        end={end}
        tenant={tenant}
      />
    );
  if (active === "Instaladores") return <Installers d={data} />;
  if (active === "Usuários") return <Users d={data} />;
  if (active === "Minha conta") return <Account d={data} prefs={prefs} />;
  return <Settings d={data} prefs={prefs} />;
}
function State({ text }: { text: string }) {
  return <div className="state-card">{text}</div>;
}
function Metric({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <article className="metric">
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{note}</small>
      </div>
    </article>
  );
}
function Overview({ d, go }: { d: Data; go: (s: Section) => void }) {
  const s = d.summary,
    total = s.productiveSeconds + s.neutralSeconds + s.unproductiveSeconds || 1,
    max = Math.max(...d.timeline.map((x) => x.seconds), 1);
  return (
    <>
      <div className="metrics">
        <Metric
          label="Tempo monitorado"
          value={duration(s.trackedSeconds)}
          note={labels[d.period]}
        />
        <Metric
          label="Tempo ativo"
          value={duration(s.activeSeconds)}
          note={`${duration(s.idleSeconds)} ocioso`}
        />
        <Metric
          label="Produtividade"
          value={`${s.focusScore}%`}
          note={`${duration(s.productiveSeconds)} produtivo`}
        />
        <Metric
          label="Sites identificados"
          value={String(s.urlCount)}
          note={s.urlCount ? duration(s.webSeconds) : "Ative o coletor web"}
        />
      </div>
      <div className="grid-main">
        <article className="card activity">
          <div className="card-head">
            <div>
              <h2>Atividade por hora</h2>
              <p>Granularidade horária do período</p>
            </div>
          </div>
          <div className="bar-chart">
            {d.timeline.length ? (
              d.timeline.map((x) => (
                <div className="bar-column" key={x.hour}>
                  <span
                    style={{
                      height: `${Math.max(5, (x.seconds / max) * 100)}%`,
                    }}
                  />
                  <small>{x.label}</small>
                </div>
              ))
            ) : (
              <State text="Ainda não há atividade neste período." />
            )}
          </div>
        </article>
        <article className="card distribution">
          <div className="card-head">
            <div>
              <h2>Distribuição</h2>
              <p>Regras da organização</p>
            </div>
          </div>
          <div className="donut-wrap">
            <div
              className="donut real"
              style={{
                background: `conic-gradient(var(--violet) 0 ${(s.productiveSeconds / total) * 100}%,var(--cyan) ${(s.productiveSeconds / total) * 100}% ${((s.productiveSeconds + s.neutralSeconds) / total) * 100}%,#e3e7ef 0)`,
              }}
            >
              <div>
                <strong>{s.focusScore}%</strong>
                <span>produtivo</span>
              </div>
            </div>
            <ul>
              <li>
                <i className="c1" />
                <span>Produtivo</span>
                <strong>{duration(s.productiveSeconds)}</strong>
              </li>
              <li>
                <i className="c2" />
                <span>Neutro</span>
                <strong>{duration(s.neutralSeconds)}</strong>
              </li>
              <li>
                <i className="c3" />
                <span>Não produtivo</span>
                <strong>{duration(s.unproductiveSeconds)}</strong>
              </li>
            </ul>
          </div>
        </article>
      </div>
      <div className="grid-bottom">
        <article className="card">
          <div className="card-head">
            <div>
              <h2>Aplicativos principais</h2>
              <p>Uso real coletado</p>
            </div>
            <button className="text-button" onClick={() => go("Atividades")}>
              Detalhar →
            </button>
          </div>
          <AppTable apps={d.apps.slice(0, 6)} />
        </article>
        <article className="card">
          <div className="card-head">
            <div>
              <h2>Jornada atribuída</h2>
              <p>Planejado versus observado</p>
            </div>
          </div>
          {d.schedule ? (
            <dl className="settings-list">
              <div>
                <dt>Modelo</dt>
                <dd>{d.schedule.name}</dd>
              </div>
              <div>
                <dt>Horário</dt>
                <dd>
                  {d.schedule.start} — {d.schedule.end}
                </dd>
              </div>
              <div>
                <dt>Intervalo</dt>
                <dd>{d.schedule.breakMinutes} min</dd>
              </div>
            </dl>
          ) : (
            <State text="Nenhuma jornada atribuída." />
          )}
        </article>
      </div>
    </>
  );
}
function Companies({ d, reload }: { d: Data; reload: () => void }) {
  const [name, setName] = useState("");
  async function add() {
    if (!name) return;
    await fetch("/platform-api/dashboard/tenants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setName("");
    reload();
  }
  return (
    <div className="page-stack">
      <div className="section-summary">
        <strong>Synova controla {d.tenants.length} ambiente(s)</strong>
        <span>
          O super admin enxerga empresas; cada organização permanece isolada.
        </span>
      </div>
      <div className="tenant-grid">
        {d.tenants.map((t) => (
          <article className="card" key={t.id}>
            <span className="tenant-mark">{t.name[0]}</span>
            <h2>{t.name}</h2>
            <p>
              {t.kind === "platform"
                ? "Organização controladora · Synova"
                : "Empresa cliente"}
            </p>
            <dl className="settings-list">
              <div>
                <dt>Status</dt>
                <dd>{t.status || "ativo"}</dd>
              </div>
              <div>
                <dt>Colaboradores</dt>
                <dd>{t.peopleCount || 0}</dd>
              </div>
              <div>
                <dt>Dispositivos</dt>
                <dd>{t.deviceCount || 0}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
      <article className="card inline-form">
        <div>
          <h2>Adicionar empresa cliente</h2>
          <p>Cria o tenant isolado sob administração da Synova.</p>
        </div>
        <input
          placeholder="Nome da empresa"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button className="primary" onClick={add}>
          Criar empresa
        </button>
      </article>
    </div>
  );
}
type DirPerson = {
  id: string;
  host: string;
  name: string;
  title: string;
  teamId: string | null;
  scheduleId: string | null;
  device: string;
  platform: string;
  status: "online" | "offline";
  lastSeen: string | null;
  trackedSeconds: number;
  activeSeconds: number;
  idleSeconds: number;
  productiveSeconds: number;
  focusScore: number;
  presses: number;
  clicks: number;
  topApps: {
    name: string;
    seconds: number;
    duration: string;
    classification: App["classification"];
  }[];
};
type Directory = {
  tenant: Tenant;
  people: DirPerson[];
  schedules: Schedule[];
  teams: { id: string; name: string }[];
  counts: { people: number; online: number };
};
function initials(name: string) {
  return (
    (name.match(/\b\p{L}/gu) || []).slice(0, 2).join("").toUpperCase() || "?"
  );
}
function People({ d, reload }: { d: Data; reload: () => void }) {
  const [dir, setDir] = useState<Directory | null>(null);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const canEdit =
    d.viewer.role === "super_admin" || d.viewer.role === "org_admin";

  const load = useCallback(async () => {
    const res = await fetch(`/platform-api/dashboard/people?period=${d.period}`);
    if (res.ok) setDir(await res.json());
  }, [d.period]);
  useEffect(() => {
    load();
  }, [load]);

  const teamName = (id: string | null) =>
    (id && dir?.teams.find((t) => t.id === id)?.name) || "Sem time";
  const people = (dir?.people || []).filter((person) => {
    const t = q.trim().toLowerCase();
    return (
      !t ||
      person.name.toLowerCase().includes(t) ||
      person.host.toLowerCase().includes(t) ||
      teamName(person.teamId).toLowerCase().includes(t)
    );
  });
  const current = people.find((person) => person.id === selected) || null;

  async function save(person: DirPerson, patch: Partial<DirPerson>) {
    setSaving(true);
    await fetch("/platform-api/dashboard/people", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ host: person.host, id: person.id, ...patch }),
    });
    setSaving(false);
    setEditing(null);
    await load();
    reload();
  }

  return (
    <div className="page-stack">
      <div className="people-toolbar">
        <div className="section-summary">
          <strong>
            {dir?.counts.people ?? 0} colaborador(es) monitorado(s)
          </strong>
          <span>
            {dir?.counts.online ?? 0} online agora · diretório derivado da
            telemetria real do agente.
          </span>
        </div>
        <input
          className="people-search"
          placeholder="Buscar por nome, dispositivo ou time…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      {!dir ? (
        <State text="Carregando diretório…" />
      ) : people.length === 0 ? (
        <State text="Nenhum colaborador com telemetria neste período." />
      ) : (
        <div className="roster">
          {people.map((person) => (
            <article
              key={person.id}
              className={`person-card${selected === person.id ? " selected" : ""}`}
              onClick={() =>
                setSelected(selected === person.id ? null : person.id)
              }
            >
              <div className="person-head">
                <div className="avatar">{initials(person.name)}</div>
                <div className="person-meta">
                  <strong>{person.name}</strong>
                  <small>
                    {person.device} · {teamName(person.teamId)}
                  </small>
                </div>
                <span className={`pill ${person.status}`}>{person.status}</span>
              </div>
              <dl className="person-stats">
                <div>
                  <dt>Monitorado</dt>
                  <dd>{duration(person.trackedSeconds)}</dd>
                </div>
                <div>
                  <dt>Ativo</dt>
                  <dd>{duration(person.activeSeconds)}</dd>
                </div>
                <div>
                  <dt>Foco</dt>
                  <dd>{person.focusScore}%</dd>
                </div>
                <div>
                  <dt>Visto</dt>
                  <dd>{date(person.lastSeen)}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      )}
      {current && (
        <article className="card data-card">
          <div className="card-head">
            <div>
              <h2>{current.name}</h2>
              <p>
                {current.title} · {current.device} · {teamName(current.teamId)}
              </p>
            </div>
            <div className="head-actions">
              <span className={`pill ${current.status}`}>{current.status}</span>
              {canEdit && (
                <button
                  className="btn ghost"
                  onClick={() =>
                    setEditing(editing === current.id ? null : current.id)
                  }
                >
                  {editing === current.id ? "Fechar" : "Editar"}
                </button>
              )}
            </div>
          </div>
          {editing === current.id && (
            <PersonEditor
              person={current}
              teams={dir?.teams || []}
              schedules={dir?.schedules || []}
              saving={saving}
              onSave={(patch) => save(current, patch)}
            />
          )}
          <div className="person-detail">
            <div className="avatar large">{initials(current.name)}</div>
            <div>
              <h3>{current.name}</h3>
              <p>
                {current.platform} · visto {date(current.lastSeen)}
              </p>
            </div>
            <dl>
              <div>
                <dt>Monitorado</dt>
                <dd>{duration(current.trackedSeconds)}</dd>
              </div>
              <div>
                <dt>Ativo</dt>
                <dd>{duration(current.activeSeconds)}</dd>
              </div>
              <div>
                <dt>Ocioso</dt>
                <dd>{duration(current.idleSeconds)}</dd>
              </div>
              <div>
                <dt>Produtivo</dt>
                <dd>{duration(current.productiveSeconds)}</dd>
              </div>
            </dl>
          </div>
          <div className="person-apps">
            <h3>Aplicativos mais usados</h3>
            {current.topApps.length ? (
              current.topApps.map((a) => (
                <div className="app-row" key={a.name}>
                  <span>
                    <Glyph domain={appDomain(a.name)} label={a.name} kind="app" />
                    <strong>{a.name}</strong>
                  </span>
                  <span>
                    <em className={`classification ${a.classification}`}>
                      {classLabel[a.classification]}
                    </em>
                  </span>
                  <span>{a.duration}</span>
                </div>
              ))
            ) : (
              <State text="Sem atividade de apps neste período." />
            )}
          </div>
          {(() => {
            const device =
              d.devices.find((x) => x.id === current.host) ||
              d.devices.find((x) => x.name === current.device);
            return device ? (
              <Gallery
                device={device}
                person={current.name}
                tenantId={d.tenant.id}
              />
            ) : null;
          })()}
        </article>
      )}
    </div>
  );
}
function PersonEditor({
  person,
  teams,
  schedules,
  saving,
  onSave,
}: {
  person: DirPerson;
  teams: { id: string; name: string }[];
  schedules: Schedule[];
  saving: boolean;
  onSave: (patch: Partial<DirPerson>) => void;
}) {
  const [name, setName] = useState(person.name);
  const [title, setTitle] = useState(person.title);
  const [teamId, setTeamId] = useState(person.teamId || "");
  const [scheduleId, setScheduleId] = useState(person.scheduleId || "");
  return (
    <div className="person-edit">
      <label>
        Nome
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label>
        Cargo
        <input value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label>
        Time
        <select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
          <option value="">Sem time</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Jornada
        <select
          value={scheduleId}
          onChange={(e) => setScheduleId(e.target.value)}
        >
          <option value="">Sem jornada</option>
          {schedules.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} · {s.start}–{s.end}
            </option>
          ))}
        </select>
      </label>
      <button
        className="primary"
        disabled={saving}
        onClick={() =>
          onSave({
            name,
            title,
            teamId: teamId || null,
            scheduleId: scheduleId || null,
          })
        }
      >
        {saving ? "Salvando…" : "Salvar"}
      </button>
    </div>
  );
}
type TeamRow = {
  id: string;
  name: string;
  tenantId: string;
  managerEmail: string | null;
  managerName: string | null;
  memberCount: number;
  members: { id: string; name: string; host: string }[];
};
type TeamsData = {
  teams: TeamRow[];
  managers: { email: string; name?: string; role: string }[];
  people: { id: string; name: string; teamId: string | null }[];
};
function Teams({ d }: { d: Data }) {
  const [td, setTd] = useState<TeamsData | null>(null);
  const [name, setName] = useState("");
  const [managerEmail, setManagerEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const canManage =
    d.viewer.role === "super_admin" || d.viewer.role === "org_admin";
  const load = useCallback(async () => {
    const res = await fetch("/platform-api/dashboard/teams", {
      credentials: "same-origin",
    });
    if (res.ok) setTd(await res.json());
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    await fetch("/platform-api/dashboard/teams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, managerEmail }),
    });
    setBusy(false);
    setName("");
    setManagerEmail("");
    load();
  }
  async function remove(id: string) {
    if (!confirm("Excluir este time? Os colaboradores ficam sem time.")) return;
    await fetch("/platform-api/dashboard/teams/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    load();
  }
  return (
    <div className="page-stack">
      {canManage && (
        <article className="card">
          <div className="card-head">
            <div>
              <h2>Novo time</h2>
              <p>Agrupe colaboradores e defina um gestor responsável.</p>
            </div>
          </div>
          <div className="invite-form">
            <input
              placeholder="Nome do time (ex.: Vendas)"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <select
              value={managerEmail}
              onChange={(e) => setManagerEmail(e.target.value)}
            >
              <option value="">Sem gestor</option>
              {td?.managers.map((m) => (
                <option key={m.email} value={m.email}>
                  {m.name || m.email} · {ROLE_SHORT[m.role] || m.role}
                </option>
              ))}
            </select>
            <button
              className="btn"
              onClick={create}
              disabled={busy || !name.trim()}
            >
              {busy ? "Criando…" : "Criar time"}
            </button>
          </div>
        </article>
      )}
      <div className="section-summary">
        <strong>{td?.teams.length ?? 0} time(s)</strong>
        <span>
          Cada gestor enxerga apenas os colaboradores dos times sob sua
          responsabilidade.
        </span>
      </div>
      {td && td.teams.length === 0 ? (
        <State text="Nenhum time criado ainda." />
      ) : (
        <div className="team-grid">
          {td?.teams.map((t) => (
            <article className="card team-card" key={t.id}>
              <div className="card-head">
                <div>
                  <h2>{t.name}</h2>
                  <p>
                    {t.managerName || t.managerEmail
                      ? `Gestor: ${t.managerName || t.managerEmail}`
                      : "Sem gestor definido"}
                  </p>
                </div>
                <span className="pill offline">{t.memberCount} membro(s)</span>
              </div>
              <div className="team-members">
                {t.members.length ? (
                  t.members.map((m) => (
                    <span className="member-chip" key={m.id}>
                      <span className="avatar tiny">{initials(m.name)}</span>
                      {m.name}
                    </span>
                  ))
                ) : (
                  <State text="Sem colaboradores. Atribua em Pessoas → Editar." />
                )}
              </div>
              {canManage && (
                <div className="team-actions">
                  <button
                    className="btn ghost danger"
                    onClick={() => remove(t.id)}
                  >
                    Excluir time
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
function Devices({ d }: { d: Data }) {
  return (
    <div className="page-stack">
      <div className="section-summary">
        <strong>{d.devices.length} dispositivo(s) real(is)</strong>
        <span>
          Inventário criado automaticamente pela telemetria do agente.
        </span>
      </div>
      <div className="device-grid">
        {d.devices.map((x) => (
          <DeviceCard d={x} key={x.id} />
        ))}
      </div>
      {d.devices.map((x) => (
        <Gallery device={x} person={d.person.name} tenantId={d.tenant.id} key={`g-${x.id}`} />
      ))}
    </div>
  );
}
function DeviceCard({ d }: { d: Device }) {
  return (
    <article className="device-card">
      <div className="device-icon">⌘</div>
      <div>
        <h3>{d.name}</h3>
        <p>
          {d.platform} · {d.id}
        </p>
      </div>
      <span className={`pill ${d.status}`}>{d.status}</span>
      <dl>
        <div>
          <dt>Sincronização</dt>
          <dd>{date(d.lastSeen)}</dd>
        </div>
        <div>
          <dt>Monitorado</dt>
          <dd>{duration(d.trackedSeconds)}</dd>
        </div>
        <div>
          <dt>Teclas</dt>
          <dd>{d.presses.toLocaleString("pt-BR")}</dd>
        </div>
        <div>
          <dt>Cliques</dt>
          <dd>{d.clicks.toLocaleString("pt-BR")}</dd>
        </div>
      </dl>
    </article>
  );
}
function Activities({ d }: { d: Data }) {
  return (
    <div className="page-stack">
      <div className="metrics compact">
        <Metric
          label="Monitorado"
          value={duration(d.summary.trackedSeconds)}
          note={labels[d.period]}
        />
        <Metric
          label="Ativo"
          value={duration(d.summary.activeSeconds)}
          note="Com interação"
        />
        <Metric
          label="Ocioso"
          value={duration(d.summary.idleSeconds)}
          note="Sem interação"
        />
        <Metric
          label="URLs"
          value={String(d.urls.length)}
          note={duration(d.summary.webSeconds)}
        />
      </div>
      <article className="card">
        <div className="card-head">
          <div>
            <h2>URLs e sites acessados</h2>
            <p>Tempo por página, domínio e classificação.</p>
          </div>
        </div>
        {d.urls.length ? (
          <UrlTable urls={d.urls} />
        ) : (
          <div className="onboarding">
            <strong>Coleta de URL ainda não está ativa neste Mac</strong>
            <p>
              O servidor já aceita telemetria web. Instale o coletor/extensão
              gerenciada do navegador para que URLs e tempo por página apareçam
              aqui.
            </p>
          </div>
        )}
      </article>
      <article className="card">
        <h2>Uso por aplicativo</h2>
        <AppTable apps={d.apps} />
      </article>
      <article className="card">
        <h2>Atividade recente</h2>
        <div className="recent-list">
          {d.recent.map((x, i) => (
            <div key={`${x.timestamp}-${i}`}>
              <Glyph domain={appDomain(x.app)} label={x.app} kind="app" />
              <div>
                <strong>{x.app}</strong>
                <small>{x.title || "Sem título"}</small>
              </div>
              <time>
                {duration(x.duration)} · {date(x.timestamp)}
              </time>
            </div>
          ))}
        </div>
      </article>
    </div>
  );
}
function AppTable({ apps }: { apps: App[] }) {
  return (
    <div className="app-table">
      <div className="app-row head">
        <span>Aplicativo</span>
        <span>Classificação</span>
        <span>Tempo</span>
        <span>Participação</span>
      </div>
      {apps.length ? (
        apps.map((a) => (
          <div className="app-row" key={a.name}>
            <span>
              <Glyph domain={appDomain(a.name)} label={a.name} kind="app" />
              <strong>{a.name}</strong>
            </span>
            <span>
              <em className={`classification ${a.classification}`}>
                {classLabel[a.classification]}
              </em>
            </span>
            <span>{a.duration}</span>
            <span className="share">
              <span className="track">
                <b style={{ width: `${Math.min(100, a.share)}%` }} />
              </span>
              {a.share}%
            </span>
          </div>
        ))
      ) : (
        <State text="Sem aplicativos neste período." />
      )}
    </div>
  );
}
function UrlTable({ urls }: { urls: UrlUsage[] }) {
  return (
    <div className="url-table">
      <div className="url-row head">
        <span>Site / página</span>
        <span>Classificação</span>
        <span>Tempo</span>
        <span>% web</span>
      </div>
      {urls.map((u) => (
        <div className="url-row" key={u.url}>
          <span>
            <Glyph domain={u.domain} label={u.domain} kind="site" />
            <span className="site-text">
              <strong>{u.domain}</strong>
              <small>{u.title || u.url}</small>
            </span>
          </span>
          <span>
            <em className={`classification ${u.classification}`}>
              {classLabel[u.classification]}
            </em>
          </span>
          <span>{u.duration}</span>
          <span>{u.share}%</span>
        </div>
      ))}
    </div>
  );
}
function Reports({
  d,
  period,
  start,
  end,
  tenant,
}: {
  d: Data;
  period: Period;
  start: string;
  end: string;
  tenant: string;
}) {
  const q = new URLSearchParams({ period, tenant });
  if (period === "custom") {
    q.set("start", start);
    q.set("end", end);
  }
  return (
    <div className="page-stack">
      <div className="report-hero">
        <div>
          <span>RELATÓRIO OPERACIONAL</span>
          <h2>{d.tenant.name}</h2>
          <p>
            {new Date(d.range.start).toLocaleDateString("pt-BR")} —{" "}
            {new Date(d.range.end).toLocaleDateString("pt-BR")}
          </p>
        </div>
        <div>
          <a href={`/platform-api/dashboard/export.csv?${q}`}>Exportar CSV</a>
          <a href={`/platform-api/dashboard/export.json?${q}`}>Exportar JSON</a>
        </div>
      </div>
      <div className="metrics">
        <Metric
          label="Monitorado"
          value={duration(d.summary.trackedSeconds)}
          note={labels[d.period]}
        />
        <Metric
          label="Produtivo"
          value={duration(d.summary.productiveSeconds)}
          note={`${d.summary.focusScore}%`}
        />
        <Metric
          label="Ocioso"
          value={duration(d.summary.idleSeconds)}
          note="Sem interação"
        />
        <Metric
          label="Web"
          value={duration(d.summary.webSeconds)}
          note={`${d.summary.urlCount} URLs`}
        />
      </div>
      <div className="grid-bottom">
        <article className="card">
          <h2>Aplicativos para análise</h2>
          <AppTable apps={d.apps.slice(0, 10)} />
        </article>
        <article className="card">
          <h2>Sites principais</h2>
          {d.urls.length ? (
            <UrlTable urls={d.urls.slice(0, 10)} />
          ) : (
            <State text="Aguardando telemetria web." />
          )}
        </article>
      </div>
    </div>
  );
}
function Gallery({ device, person, tenantId }: { device: Device; person: string; tenantId: string }) {
  const [items, setItems] = useState<Shot[]>([]);
  useEffect(() => {
    fetch(`/platform-api/dashboard/screenshots?tenant=${encodeURIComponent(tenantId)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((x) =>
        setItems((x.items || []).filter((i: Shot) => i.device === device.id)),
      )
      .catch(() => setItems([]));
  }, [device.id, tenantId]);
  return (
    <section className="linked-gallery">
      <div className="gallery-toolbar">
        <div>
          <strong>Capturas de {person}</strong>
          <span>
            {device.name} · {items.length} registros
          </span>
        </div>
        <span className="linked-badge">Vinculadas ao colaborador e host</span>
      </div>
      {items.length ? (
        <div className="real-gallery">
          {items.map((i) => (
            <a href={i.url} target="_blank" key={i.id}>
              <article>
                <img src={i.url} alt="Captura de atividade" />
                <div>
                  <strong>{i.app || "Aplicativo não identificado"}</strong>
                  <span>
                    {person} · {date(i.capturedAt)}
                  </span>
                </div>
              </article>
            </a>
          ))}
        </div>
      ) : (
        <State text="Nenhuma captura vinculada a este dispositivo." />
      )}
    </section>
  );
}
function Installers({ d }: { d: Data }) {
  const [token, setToken] = useState(""),
    [busy, setBusy] = useState(false);
  async function generate() {
    setBusy(true);
    const r = await fetch("/platform-api/dashboard/enrollments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId: d.tenant.id }),
    });
    const x = await r.json();
    setToken(x.token || "");
    setBusy(false);
  }
  return (
    <div className="page-stack">
      <div className="section-summary">
        <strong>Distribuição vinculada a {d.tenant.name}</strong>
        <span>
          O pacote recebe tenant e token de provisionamento; o dispositivo
          começa a enviar após instalar.
        </span>
      </div>
      <div className="install-grid">
        <article className="install-card">
          <span className="os-badge apple">
            <OsLogo os="apple" />
          </span>
          <h2>macOS individual</h2>
          <p>Para enviar um link ao colaborador e instalar com assistente.</p>
          <a className="download" href="/downloads/TimeWatcher-macOS.pkg">
            Baixar .pkg
          </a>
        </article>
        <article className="install-card">
          <span className="os-badge windows">
            <OsLogo os="windows" />
          </span>
          <h2>Windows individual</h2>
          <p>Instalação com interface para o usuário final.</p>
          <a className="download" href="/downloads/TimeWatcher-Windows.msi">
            Baixar .msi
          </a>
        </article>
        <article className="install-card ready">
          <span className="os-badge">
            <OsLogo os="deploy" />
          </span>
          <h2>Implantação em massa</h2>
          <p>
            Use o mesmo pacote com parâmetros silenciosos em Intune, GPO ou RMM.
          </p>
          <button onClick={generate}>
            {busy ? "Gerando…" : "Gerar token por 7 dias"}
          </button>
        </article>
      </div>
      {token && (
        <article className="card enrollment">
          <h2>Token temporário do tenant</h2>
          <p>
            Use apenas no canal seguro da equipe de TI. Ele expira em 7 dias.
          </p>
          <code>{token}</code>
          <pre>{`SERVER_URL=https://timewatcher.32-193-139-223.sslip.io TENANT_ID=${d.tenant.id} ENROLLMENT_TOKEN=${token}`}</pre>
        </article>
      )}
      <article className="card">
        <h2>Parâmetros para administração de TI</h2>
        <dl className="settings-list">
          <div>
            <dt>macOS</dt>
            <dd>installer -pkg TimeWatcher-macOS.pkg -target /</dd>
          </div>
          <div>
            <dt>Windows</dt>
            <dd>
              msiexec /i TimeWatcher-Windows.msi /qn TENANT_ID=…
              ENROLLMENT_TOKEN=…
            </dd>
          </div>
          <div>
            <dt>Chrome/Edge</dt>
            <dd>Implantar também o coletor web por política gerenciada</dd>
          </div>
        </dl>
      </article>
    </div>
  );
}
const ROLE_LABEL: Record<string, string> = {
  super_admin: "Super admin · Synova",
  org_admin: "Admin da organização",
  manager: "Gestor",
  employee: "Colaborador",
};
function persist(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}
function Settings({ d, prefs }: { d: Data; prefs: Prefs }) {
  const setPeriod = (v: Period) => {
    prefs.setPeriod(v);
    persist("tw.period", v);
  };
  const setDensity = (v: "comfortable" | "compact") => {
    prefs.setDensity(v);
    persist("tw.density", v);
  };
  const setCollapsed = (v: boolean) => {
    prefs.setCollapsed(v);
    persist("tw.collapsed", v ? "1" : "0");
  };
  return (
    <div className="settings-grid">
      <article className="card">
        <h2>Conta</h2>
        <dl className="settings-list">
          <div>
            <dt>Nome</dt>
            <dd>{d.viewer.name}</dd>
          </div>
          <div>
            <dt>Usuário</dt>
            <dd>{d.viewer.username}</dd>
          </div>
          <div>
            <dt>Perfil</dt>
            <dd>{ROLE_LABEL[d.viewer.role] || d.viewer.role}</dd>
          </div>
          <div>
            <dt>Empresa</dt>
            <dd>{d.tenant.name}</dd>
          </div>
        </dl>
      </article>
      <article className="card">
        <h2>Preferências</h2>
        <p className="settings-copy">Salvas neste navegador.</p>
        <div className="pref-list">
          <div className="pref-row">
            <div>
              <strong>Período padrão</strong>
              <span>Filtro aplicado ao abrir o painel</span>
            </div>
            <select
              value={prefs.period === "custom" ? "today" : prefs.period}
              onChange={(e) => setPeriod(e.target.value as Period)}
            >
              <option value="today">Hoje</option>
              <option value="7d">7 dias</option>
              <option value="30d">30 dias</option>
            </select>
          </div>
          <div className="pref-row">
            <div>
              <strong>Densidade</strong>
              <span>Espaçamento da interface</span>
            </div>
            <div className="seg">
              <button
                className={prefs.density === "comfortable" ? "on" : ""}
                onClick={() => setDensity("comfortable")}
              >
                Confortável
              </button>
              <button
                className={prefs.density === "compact" ? "on" : ""}
                onClick={() => setDensity("compact")}
              >
                Compacto
              </button>
            </div>
          </div>
          <div className="pref-row">
            <div>
              <strong>Menu lateral</strong>
              <span>Estado padrão da barra de navegação</span>
            </div>
            <div className="seg">
              <button
                className={!prefs.collapsed ? "on" : ""}
                onClick={() => setCollapsed(false)}
              >
                Expandido
              </button>
              <button
                className={prefs.collapsed ? "on" : ""}
                onClick={() => setCollapsed(true)}
              >
                Recolhido
              </button>
            </div>
          </div>
        </div>
      </article>
      <article className="card">
        <h2>Coleta</h2>
        <dl className="settings-list">
          <div>
            <dt>Aplicativos/janelas</dt>
            <dd>Ativo</dd>
          </div>
          <div>
            <dt>URLs e sites</dt>
            <dd>{d.summary.urlCount ? "Ativo" : "Aguardando coletor web"}</dd>
          </div>
          <div>
            <dt>Capturas de tela</dt>
            <dd>
              {d.summary.screenshotCount ? "Ativo" : "Sob consentimento"}
            </dd>
          </div>
        </dl>
      </article>
      <article className="card">
        <h2>Privacidade</h2>
        <p className="settings-copy">
          Não coletamos o conteúdo digitado. URLs, títulos, tempos e capturas
          autorizadas ficam vinculados ao colaborador e ao host dentro do
          tenant.
        </p>
      </article>
      <article className="card">
        <h2>Governança</h2>
        <p className="settings-copy">
          Synova administra tenants. O admin da organização gerencia pessoas,
          ativos, jornadas e relatórios apenas da própria empresa.
        </p>
      </article>
    </div>
  );
}
function Users({ d }: { d: Data }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [list, setList] = useState<{
    accounts: { email: string; name?: string; role: string; status?: string }[];
    invites: { email: string; role: string; expiresAt: string }[];
  } | null>(null);
  const me = d.viewer.username;
  const load = useCallback(() => {
    fetch("/platform-api/dashboard/invites", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then(setList)
      .catch(() => {});
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  async function post(path: string, body: object) {
    const r = await fetch(`/platform-api/dashboard/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(body),
    });
    return r.ok ? r.json() : null;
  }
  const invite = async () => {
    if (!email.includes("@")) return;
    setBusy(true);
    setLink("");
    setCopied(false);
    const x = await post("invites", { email, role });
    if (x) {
      setLink(x.inviteUrl || "");
      setEmail("");
      load();
    }
    setBusy(false);
  };
  async function updateUser(target: string, patch: object) {
    await post("users", { email: target, ...patch });
    load();
  }
  async function removeUser(target: string) {
    if (!confirm(`Remover ${target}? A conta perde o acesso imediatamente.`))
      return;
    await post("users/delete", { email: target });
    load();
  }
  async function resend(target: string) {
    const x = await post("invites/resend", { email: target });
    if (x?.inviteUrl) {
      setLink(x.inviteUrl);
      setCopied(false);
    }
  }
  async function revoke(target: string) {
    await post("invites/revoke", { email: target });
    load();
  }
  return (
    <div className="page-stack">
      <div className="section-summary">
        <strong>Convide pessoas para {d.tenant.name}</strong>
        <span>
          Acesso é apenas por convite. A pessoa recebe um link, define a senha e
          já entra — não há cadastro aberto.
        </span>
      </div>
      <article className="card">
        <div className="card-head">
          <div>
            <h2>Convidar usuário</h2>
            <p>Gera um magic link de 7 dias para definir a senha.</p>
          </div>
        </div>
        <div className="invite-form">
          <input
            type="email"
            placeholder="email@empresa.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="member">Membro</option>
            <option value="manager">Gestor</option>
            <option value="admin">Administrador</option>
          </select>
          <button
            className="btn"
            onClick={invite}
            disabled={busy || !email.includes("@")}
          >
            {busy ? "Gerando…" : "Gerar convite"}
          </button>
        </div>
        {link && (
          <div className="invite-link">
            <span>Magic link — envie para a pessoa:</span>
            <div className="invite-link-row">
              <code>{link}</code>
              <button
                className="btn ghost"
                onClick={() => {
                  navigator.clipboard?.writeText(link);
                  setCopied(true);
                }}
              >
                {copied ? "Copiado" : "Copiar"}
              </button>
            </div>
          </div>
        )}
      </article>
      <div className="account-grid">
        <article className="card">
          <div className="card-head">
            <div>
              <h2>Contas</h2>
              <p>{list?.accounts.length || 0} usuário(s)</p>
            </div>
          </div>
          <div className="user-list">
            {list?.accounts.length ? (
              list.accounts.map((a) => (
                <div className="user-row" key={a.email}>
                  <div>
                    <strong>{a.name || a.email}</strong>
                    <small>{a.email}</small>
                  </div>
                  <div className="row-actions">
                    <span
                      className={`pill ${a.status === "disabled" ? "offline" : a.role === "member" ? "offline" : "online"}`}
                    >
                      {a.status === "disabled"
                        ? "Inativo"
                        : ROLE_SHORT[a.role] || a.role}
                    </span>
                    {a.email === me ? (
                      <em className="row-self">você</em>
                    ) : (
                      <>
                        <select
                          value={a.role}
                          disabled={a.role === "super_admin"}
                          onChange={(e) =>
                            updateUser(a.email, { role: e.target.value })
                          }
                        >
                          <option value="member">Membro</option>
                          <option value="manager">Gestor</option>
                          <option value="org_admin">Administrador</option>
                          {a.role === "super_admin" && (
                            <option value="super_admin">Super admin</option>
                          )}
                        </select>
                        <button
                          className="btn ghost"
                          onClick={() =>
                            updateUser(a.email, {
                              status:
                                a.status === "disabled" ? "active" : "disabled",
                            })
                          }
                        >
                          {a.status === "disabled" ? "Reativar" : "Desativar"}
                        </button>
                        <button
                          className="btn ghost danger"
                          onClick={() => removeUser(a.email)}
                        >
                          Remover
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <State text="Nenhuma conta ainda." />
            )}
          </div>
        </article>
        <article className="card">
          <div className="card-head">
            <div>
              <h2>Convites pendentes</h2>
              <p>{list?.invites.length || 0}</p>
            </div>
          </div>
          <div className="user-list">
            {list?.invites.length ? (
              list.invites.map((i) => (
                <div className="user-row" key={i.email}>
                  <div>
                    <strong>{i.email}</strong>
                    <small>expira {date(i.expiresAt)}</small>
                  </div>
                  <div className="row-actions">
                    <span className="pill offline">
                      {ROLE_SHORT[i.role] || i.role}
                    </span>
                    <button
                      className="btn ghost"
                      onClick={() => resend(i.email)}
                    >
                      Reenviar
                    </button>
                    <button
                      className="btn ghost danger"
                      onClick={() => revoke(i.email)}
                    >
                      Revogar
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <State text="Sem convites pendentes." />
            )}
          </div>
        </article>
      </div>
    </div>
  );
}
function Account({ d, prefs }: { d: Data; prefs: Prefs }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [nameDraft, setNameDraft] = useState(prefs.displayName || d.viewer.name);
  const [nameSaved, setNameSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mfa, setMfa] = useState(() => {
    try {
      return localStorage.getItem("tw.mfa") === "1";
    } catch {
      return false;
    }
  });
  const [notif, setNotif] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem("tw.notif") || "{}");
    } catch {
      return {};
    }
  });
  const initials =
    (prefs.displayName || d.viewer.name || "TW")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase() || "TW";
  const setNotifKey = (k: string, v: boolean) => {
    const next = { ...notif, [k]: v };
    setNotif(next);
    persist("tw.notif", JSON.stringify(next));
  };
  const toggleMfa = (v: boolean) => {
    setMfa(v);
    persist("tw.mfa", v ? "1" : "0");
  };
  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const blob = await processAvatarBlob(file);
      const r = await fetch(AVATAR_URL, {
        method: "POST",
        headers: { "Content-Type": "image/jpeg" },
        credentials: "same-origin",
        body: blob,
      });
      if (r.ok) prefs.setAvatar(`${AVATAR_URL}?v=${Date.now()}`);
    } catch {}
    setBusy(false);
  };
  const removePhoto = async () => {
    setBusy(true);
    try {
      await fetch(AVATAR_URL, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        credentials: "same-origin",
        body: "",
      });
    } catch {}
    prefs.setAvatar(null);
    setBusy(false);
  };
  return (
    <div className="account">
      <article className="card account-profile">
        <div className="profile-head">
          <div className="profile-avatar">
            <Avatar src={prefs.avatar} initials={initials} className="xl" />
            <button
              type="button"
              className="avatar-edit"
              onClick={() => fileRef.current?.click()}
              aria-label="Enviar foto de perfil"
            >
              <Icon name="camera" />
            </button>
          </div>
          <div className="profile-meta">
            <h2>{prefs.displayName || d.viewer.name}</h2>
            <p>
              {ACCOUNT_ROLE[d.viewer.role] || d.viewer.role} · {d.tenant.name}
            </p>
            <div className="profile-actions">
              <button
                type="button"
                className="btn"
                onClick={() => fileRef.current?.click()}
                disabled={busy}
              >
                {busy ? "Enviando…" : "Enviar foto"}
              </button>
              {prefs.avatar && (
                <button
                  type="button"
                  className="btn ghost"
                  onClick={removePhoto}
                  disabled={busy}
                >
                  Remover
                </button>
              )}
            </div>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={onFile}
          />
        </div>
      </article>
      <div className="account-grid">
        <article className="card">
          <h2>Perfil</h2>
          <div className="field">
            <label>Nome de exibição</label>
            <div className="field-row">
              <input
                value={nameDraft}
                onChange={(e) => {
                  setNameDraft(e.target.value);
                  setNameSaved(false);
                }}
                placeholder="Seu nome"
              />
              <button
                type="button"
                className="btn"
                onClick={() => {
                  prefs.setDisplayName(nameDraft.trim());
                  setNameSaved(true);
                }}
              >
                Salvar
              </button>
            </div>
            <span className="hint">
              {nameSaved
                ? "Salvo neste navegador."
                : "Aparece na barra lateral e no menu."}
            </span>
          </div>
          <dl className="settings-list">
            <div>
              <dt>E-mail / usuário</dt>
              <dd>{d.viewer.username}</dd>
            </div>
            <div>
              <dt>Perfil de acesso</dt>
              <dd>{ACCOUNT_ROLE[d.viewer.role] || d.viewer.role}</dd>
            </div>
            <div>
              <dt>Empresa</dt>
              <dd>{d.tenant.name}</dd>
            </div>
          </dl>
        </article>
        <article className="card">
          <h2>Segurança</h2>
          <div className="pref-row">
            <div>
              <strong>Autenticação em duas etapas (MFA)</strong>
              <span>Camada extra de proteção ao entrar</span>
            </div>
            <Toggle on={mfa} onChange={toggleMfa} label="MFA" />
          </div>
          {mfa && (
            <div className="mfa-box">
              <span className="tag demo">Demonstração</span>
              <p>Escaneie no app autenticador ou use a chave manual:</p>
              <code>JBSW Y3DP EHPK 3PXP</code>
              <p className="hint">
                A ativação real de MFA entra em uma próxima versão.
              </p>
            </div>
          )}
          <div className="pref-row">
            <div>
              <strong>Senha</strong>
              <span>Autenticação gerenciada pela organização</span>
            </div>
            <button type="button" className="btn ghost" disabled>
              Trocar senha
            </button>
          </div>
          <div className="pref-row">
            <div>
              <strong>Sessão atual</strong>
              <span>Este navegador</span>
            </div>
            <span className="pill online">Ativa</span>
          </div>
        </article>
        <article className="card">
          <h2>Aparência</h2>
          <div className="pref-list">
            <div className="pref-row">
              <div>
                <strong>Densidade</strong>
                <span>Espaçamento da interface</span>
              </div>
              <div className="seg">
                <button
                  className={prefs.density === "comfortable" ? "on" : ""}
                  onClick={() => {
                    prefs.setDensity("comfortable");
                    persist("tw.density", "comfortable");
                  }}
                >
                  Confortável
                </button>
                <button
                  className={prefs.density === "compact" ? "on" : ""}
                  onClick={() => {
                    prefs.setDensity("compact");
                    persist("tw.density", "compact");
                  }}
                >
                  Compacto
                </button>
              </div>
            </div>
            <div className="pref-row">
              <div>
                <strong>Menu lateral</strong>
                <span>Estado padrão da barra</span>
              </div>
              <div className="seg">
                <button
                  className={!prefs.collapsed ? "on" : ""}
                  onClick={() => {
                    prefs.setCollapsed(false);
                    persist("tw.collapsed", "0");
                  }}
                >
                  Expandido
                </button>
                <button
                  className={prefs.collapsed ? "on" : ""}
                  onClick={() => {
                    prefs.setCollapsed(true);
                    persist("tw.collapsed", "1");
                  }}
                >
                  Recolhido
                </button>
              </div>
            </div>
            <div className="pref-row">
              <div>
                <strong>Período padrão</strong>
                <span>Filtro aplicado ao abrir o painel</span>
              </div>
              <select
                value={prefs.period === "custom" ? "today" : prefs.period}
                onChange={(e) => {
                  prefs.setPeriod(e.target.value as Period);
                  persist("tw.period", e.target.value);
                }}
              >
                <option value="today">Hoje</option>
                <option value="7d">7 dias</option>
                <option value="30d">30 dias</option>
              </select>
            </div>
          </div>
        </article>
        <article className="card">
          <h2>Notificações</h2>
          <p className="settings-copy">Preferências salvas neste navegador.</p>
          <div className="pref-list">
            <div className="pref-row">
              <div>
                <strong>Agente offline</strong>
                <span>Quando um dispositivo para de enviar</span>
              </div>
              <Toggle
                on={!!notif.offline}
                onChange={(v) => setNotifKey("offline", v)}
                label="Agente offline"
              />
            </div>
            <div className="pref-row">
              <div>
                <strong>Ociosidade longa</strong>
                <span>Períodos extensos sem interação</span>
              </div>
              <Toggle
                on={!!notif.idle}
                onChange={(v) => setNotifKey("idle", v)}
                label="Ociosidade longa"
              />
            </div>
            <div className="pref-row">
              <div>
                <strong>Desvio de jornada</strong>
                <span>Início ou término fora do previsto</span>
              </div>
              <Toggle
                on={!!notif.schedule}
                onChange={(v) => setNotifKey("schedule", v)}
                label="Desvio de jornada"
              />
            </div>
          </div>
        </article>
      </div>
    </div>
  );
}
