"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import { AuthScreen } from "./auth-screen";

type Period = "today" | "7d" | "30d" | "custom";
type Section =
  | "Visão geral"
  | "Empresas"
  | "Pessoas"
  | "OUs"
  | "Alertas"
  | "Intelligence"
  | "Dispositivos"
  | "Atividades"
  | "Relatórios"
  | "Instaladores"
  | "Usuários"
  | "Faturamento"
  | "Configurações"
  | "Minha conta";
type Role = "super_admin" | "org_admin" | "manager" | "employee";
type IconName =
  | "overview"
  | "companies"
  | "people"
  | "teams"
  | "alerts"
  | "intelligence"
  | "devices"
  | "activity"
  | "reports"
  | "installers"
  | "settings"
  | "billing"
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
  health?: "online" | "stale" | "offline";
  client?: string | null;
  blocked?: boolean;
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
  { name: "OUs", icon: "teams" },
  { name: "Alertas", icon: "alerts" },
  { name: "Intelligence", icon: "intelligence" },
  { name: "Dispositivos", icon: "devices" },
  { name: "Atividades", icon: "activity" },
  { name: "Relatórios", icon: "reports" },
  { name: "Instaladores", icon: "installers" },
  { name: "Usuários", icon: "userplus" },
  { name: "Faturamento", icon: "billing" },
  { name: "Configurações", icon: "settings" },
];
const desc: Record<Section, string> = {
  "Visão geral": "Produtividade, aderência e uso do tempo com dados reais.",
  Empresas: "Governança multiempresa controlada pela Synova.",
  Pessoas: "Jornada, atividade, ativos e capturas por colaborador.",
  OUs: "Unidades organizacionais (com hierarquia pai/filha) e o gestor de cada uma.",
  Alertas: "Agente offline, ociosidade longa e desvios de jornada.",
  Intelligence: "Pergunte sobre a operação e receba síntese apoiada nos dados.",
  Dispositivos: "Inventário e saúde dos computadores vinculados.",
  Atividades: "Aplicativos, URLs, janelas, atividade e ociosidade.",
  Relatórios: "Filtros e exportações para análise operacional.",
  Instaladores: "Distribuição individual ou em massa vinculada ao tenant.",
  Usuários: "Convites e contas de acesso da sua empresa.",
  Faturamento: "Plano, assentos e cobrança por licença.",
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
    case "alerts":
      return (
        <svg {...p}>
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
      );
    case "intelligence":
      return (
        <svg {...p}>
          <path d="M11 3l1.8 4.6L17.5 9.4 12.8 11.2 11 16l-1.8-4.8L4.5 9.4l4.7-1.8z" />
          <path d="M18 14l.9 2.2 2.1.9-2.1.9L18 20l-.9-2-2.1-.9 2.1-.9z" />
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
    case "billing":
      return (
        <svg {...p}>
          <rect x="2" y="5" width="20" height="14" rx="2" />
          <path d="M2 10h20M6 15h4" />
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
    if (n.name === "Usuários" || n.name === "Faturamento") return isAdmin;
    if (n.name === "OUs" || n.name === "Alertas" || n.name === "Intelligence")
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
      {data && <ChatWidget d={data} go={setActive} />}
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
  if (active === "OUs") return <Teams d={data} />;
  if (active === "Alertas") return <Alerts d={data} />;
  if (active === "Intelligence") return <Intelligence d={data} go={setActive} />;
  if (active === "Dispositivos") return <Devices d={data} reload={reload} />;
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
  if (active === "Faturamento") return <Billing d={data} />;
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
type TrendPoint = {
  date: string;
  trackedSeconds: number;
  activeSeconds: number;
  productiveSeconds: number;
  focusScore: number;
};
function TrendCard() {
  const [series, setSeries] = useState<TrendPoint[] | null>(null);
  useEffect(() => {
    fetch("/platform-api/dashboard/trends?days=14", {
      credentials: "same-origin",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((x) => setSeries(x?.series || null))
      .catch(() => {});
  }, []);
  if (!series) return null;
  const max = Math.max(...series.map((p) => p.trackedSeconds), 1);
  return (
    <article className="card trend-card">
      <div className="card-head">
        <div>
          <h2>Tendência · 14 dias</h2>
          <p>Tempo monitorado por dia (produtivo destacado) · pré-agregado</p>
        </div>
      </div>
      <div className="trend-bars">
        {series.map((p) => (
          <div
            className="trend-col"
            key={p.date}
            title={`${p.date}: ${duration(p.trackedSeconds)} · ${p.focusScore}% foco`}
          >
            <span
              className="trend-track"
              style={{ height: `${Math.max(3, (p.trackedSeconds / max) * 100)}%` }}
            >
              <b
                style={{
                  height: `${p.trackedSeconds ? (p.productiveSeconds / p.trackedSeconds) * 100 : 0}%`,
                }}
              />
            </span>
            <small>{p.date.slice(8, 10)}</small>
          </div>
        ))}
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
      <TrendCard />
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
type DirActivity = {
  timestamp: string | null;
  kind: "app" | "url";
  app: string;
  title: string;
  url?: string;
  duration: string;
};
type DirPerson = {
  id: string;
  host: string | null;
  name: string;
  title: string;
  teamId: string | null;
  scheduleId: string | null;
  email?: string | null;
  licenseType?: "essential" | "intelligence" | null;
  registered?: boolean;
  hasTelemetry?: boolean;
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
  topUrls?: {
    url: string;
    domain: string;
    title: string;
    duration: string;
    classification: App["classification"];
  }[];
  recentActivity?: DirActivity[];
};
type Directory = {
  tenant: Tenant;
  people: DirPerson[];
  schedules: Schedule[];
  teams: { id: string; name: string }[];
  counts: { people: number; online: number };
};
const LICENSE_LABEL: Record<string, string> = {
  essential: "Essential",
  intelligence: "Intelligence · IA",
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
  const [adding, setAdding] = useState(false);
  const [invite, setInvite] = useState<{ email: string; url: string } | null>(
    null,
  );
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
      (person.host || "").toLowerCase().includes(t) ||
      (person.email || "").toLowerCase().includes(t) ||
      teamName(person.teamId).toLowerCase().includes(t)
    );
  });
  const current = people.find((person) => person.id === selected) || null;

  async function post(path: string, body: object) {
    const r = await fetch(`/platform-api/dashboard/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(body),
    });
    return r.ok ? r.json() : null;
  }
  async function save(person: DirPerson, patch: Partial<DirPerson>) {
    setSaving(true);
    await post("people", { id: person.id, host: person.host, ...patch });
    setSaving(false);
    setEditing(null);
    await load();
    reload();
  }
  async function create(payload: Partial<DirPerson>) {
    setSaving(true);
    const created = await post("people", payload);
    setSaving(false);
    setAdding(false);
    await load();
    if (created?.id) setSelected(created.id);
  }
  async function remove(id: string) {
    if (!confirm("Remover esta pessoa do cadastro?")) return;
    await post("people/delete", { id });
    setSelected(null);
    load();
  }
  async function grantAccess(email: string, role: string) {
    const x = await post("invites", { email, role });
    if (x?.inviteUrl) setInvite({ email, url: x.inviteUrl });
  }

  return (
    <div className="page-stack">
      <div className="people-toolbar">
        <div className="section-summary">
          <strong>{dir?.counts.people ?? 0} pessoa(s)</strong>
          <span>
            {dir?.counts.online ?? 0} online agora · cadastro + telemetria do
            agente por colaborador.
          </span>
        </div>
        <input
          className="people-search"
          placeholder="Buscar por nome, e-mail, dispositivo ou time…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {canEdit && (
          <button
            className="primary people-add-btn"
            onClick={() => setAdding((a) => !a)}
          >
            {adding ? "Fechar" : "+ Cadastrar pessoa"}
          </button>
        )}
      </div>
      {adding && canEdit && (
        <PersonCreate
          teams={dir?.teams || []}
          saving={saving}
          onCreate={create}
        />
      )}
      {invite && (
        <div className="invite-link">
          <span>Acesso concedido a {invite.email} — envie o magic link:</span>
          <div className="invite-link-row">
            <code>{invite.url}</code>
            <button
              className="btn ghost"
              onClick={() => {
                navigator.clipboard?.writeText(invite.url);
              }}
            >
              Copiar
            </button>
            <button className="btn ghost" onClick={() => setInvite(null)}>
              Fechar
            </button>
          </div>
        </div>
      )}
      {!dir ? (
        <State text="Carregando pessoas…" />
      ) : people.length === 0 ? (
        <State
          text={
            canEdit
              ? "Nenhuma pessoa ainda — cadastre a primeira."
              : "Nenhuma pessoa neste período."
          }
        />
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
              <div className="person-tags">
                {person.licenseType ? (
                  <span
                    className={`lic-tag ${person.licenseType}`}
                    title="Licença"
                  >
                    {LICENSE_LABEL[person.licenseType]}
                  </span>
                ) : (
                  <span className="lic-tag none">Sem licença</span>
                )}
                {!person.hasTelemetry && (
                  <span className="lic-tag idle">Sem telemetria</span>
                )}
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
                {current.email ? ` · ${current.email}` : ""}
              </p>
            </div>
            <div className="head-actions">
              {current.licenseType && (
                <span className={`lic-tag ${current.licenseType}`}>
                  {LICENSE_LABEL[current.licenseType]}
                </span>
              )}
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
              onGrantAccess={(role) =>
                current.email ? grantAccess(current.email, role) : undefined
              }
              onRemove={() => remove(current.id)}
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
          {current.topUrls && current.topUrls.length > 0 && (
            <div className="person-apps">
              <h3>Sites mais acessados</h3>
              {current.topUrls.map((u) => (
                <div className="app-row" key={u.url}>
                  <span>
                    <Glyph domain={u.domain} label={u.domain} kind="site" />
                    <strong>{u.domain}</strong>
                  </span>
                  <span>
                    <em className={`classification ${u.classification}`}>
                      {classLabel[u.classification]}
                    </em>
                  </span>
                  <span>{u.duration}</span>
                </div>
              ))}
            </div>
          )}
          {current.recentActivity && current.recentActivity.length > 0 && (
            <div className="person-apps">
              <h3>Atividade recente</h3>
              <div className="activity-feed">
                {current.recentActivity.slice(0, 14).map((it, i) => (
                  <div className="activity-row" key={i}>
                    <span className="activity-time">{date(it.timestamp)}</span>
                    <span className="activity-what">
                      {it.kind === "url" ? it.url || it.title : it.app}
                    </span>
                    <span className="activity-dur">{it.duration}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
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
function PersonCreate({
  teams,
  saving,
  onCreate,
}: {
  teams: { id: string; name: string }[];
  saving: boolean;
  onCreate: (payload: Partial<DirPerson>) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [title, setTitle] = useState("");
  const [teamId, setTeamId] = useState("");
  const [licenseType, setLicenseType] = useState("");
  return (
    <article className="card person-create">
      <div className="card-head">
        <div>
          <h2>Cadastrar pessoa</h2>
          <p>O agente se vincula depois pelo dispositivo.</p>
        </div>
      </div>
      <div className="person-edit">
        <label>
          Nome
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          E-mail
          <input value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Cargo
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label>
          OU
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
          Licença
          <select
            value={licenseType}
            onChange={(e) => setLicenseType(e.target.value)}
          >
            <option value="">Sem licença</option>
            <option value="essential">Essential</option>
            <option value="intelligence">Intelligence · IA</option>
          </select>
        </label>
        <button
          className="primary"
          disabled={saving || !name.trim()}
          onClick={() =>
            onCreate({
              name,
              email: email || null,
              title: title || null,
              teamId: teamId || null,
              licenseType: (licenseType || null) as DirPerson["licenseType"],
            })
          }
        >
          {saving ? "Cadastrando…" : "Cadastrar"}
        </button>
      </div>
    </article>
  );
}
function PersonEditor({
  person,
  teams,
  schedules,
  saving,
  onSave,
  onGrantAccess,
  onRemove,
}: {
  person: DirPerson;
  teams: { id: string; name: string }[];
  schedules: Schedule[];
  saving: boolean;
  onSave: (patch: Partial<DirPerson>) => void;
  onGrantAccess: (role: string) => void;
  onRemove: () => void;
}) {
  const [name, setName] = useState(person.name);
  const [title, setTitle] = useState(person.title);
  const [email, setEmail] = useState(person.email || "");
  const [teamId, setTeamId] = useState(person.teamId || "");
  const [scheduleId, setScheduleId] = useState(person.scheduleId || "");
  const [licenseType, setLicenseType] = useState(person.licenseType || "");
  const [accessRole, setAccessRole] = useState("member");
  return (
    <>
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
          E-mail
          <input value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          OU
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
        <label>
          Licença
          <select
            value={licenseType}
            onChange={(e) => setLicenseType(e.target.value)}
          >
            <option value="">Sem licença</option>
            <option value="essential">Essential</option>
            <option value="intelligence">Intelligence · IA</option>
          </select>
        </label>
        <button
          className="primary"
          disabled={saving}
          onClick={() =>
            onSave({
              name,
              title,
              email: email || null,
              teamId: teamId || null,
              scheduleId: scheduleId || null,
              licenseType: (licenseType || null) as DirPerson["licenseType"],
            })
          }
        >
          {saving ? "Salvando…" : "Salvar"}
        </button>
      </div>
      <div className="person-edit-actions">
        <div className="grant-access">
          <span>Conceder acesso à plataforma:</span>
          <select
            value={accessRole}
            onChange={(e) => setAccessRole(e.target.value)}
          >
            <option value="member">Membro (vê só o próprio)</option>
            <option value="manager">Gestor</option>
            <option value="admin">Administrador</option>
          </select>
          <button
            className="btn ghost"
            disabled={!email.trim()}
            onClick={() => onGrantAccess(accessRole)}
          >
            Gerar convite
          </button>
        </div>
        <button className="btn ghost danger" onClick={onRemove}>
          Remover pessoa
        </button>
      </div>
    </>
  );
}
type BillingData = {
  plan: string;
  seats: number;
  usedSeats: number;
  status: string;
  cycleStart: string | null;
  prices: { essential: number; intelligence: number };
  monthlyTotal: number;
  pricingEditable: boolean;
  features: { intelligence: boolean };
  plans: { id: string; name: string; price: number; features: string[] }[];
};
const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
function Billing({ d }: { d: Data }) {
  void d;
  const [b, setB] = useState<BillingData | null>(null);
  const [seats, setSeats] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const load = useCallback(async () => {
    const r = await fetch("/platform-api/dashboard/billing", {
      credentials: "same-origin",
    });
    if (r.ok) {
      const x: BillingData = await r.json();
      setB(x);
      setSeats(String(x.seats));
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  async function update(patch: object) {
    setBusy(true);
    await fetch("/platform-api/dashboard/billing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(patch),
    });
    setBusy(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    load();
  }
  if (!b) return <State text="Carregando faturamento…" />;
  const over = b.usedSeats > b.seats;
  return (
    <div className="page-stack">
      <div className="section-summary">
        <strong>
          Plano {b.plan === "intelligence" ? "Intelligence" : "Essential"} ·{" "}
          {brl(b.monthlyTotal)}/mês
        </strong>
        <span>
          {b.seats} assento(s) licenciado(s) · {b.usedSeats} em uso ·{" "}
          {b.status === "active" ? "assinatura ativa" : "em avaliação (trial)"}.
        </span>
      </div>
      <div className="plan-grid">
        {b.plans.map((pl) => (
          <article
            className={`card plan-card${b.plan === pl.id ? " current" : ""}`}
            key={pl.id}
          >
            <div className="plan-head">
              <h2>{pl.name}</h2>
              {b.plan === pl.id && <span className="pill online">Atual</span>}
            </div>
            <p className="plan-price">
              {brl(pl.price)}
              <span>/assento·mês</span>
            </p>
            <ul className="plan-features">
              {pl.features.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
            <button
              className={b.plan === pl.id ? "btn ghost" : "primary"}
              disabled={busy || b.plan === pl.id}
              onClick={() => update({ plan: pl.id })}
            >
              {b.plan === pl.id ? "Plano atual" : `Mudar para ${pl.name}`}
            </button>
          </article>
        ))}
      </div>
      <article className="card">
        <div className="card-head">
          <div>
            <h2>Assentos</h2>
            <p>Uma licença por colaborador monitorado.</p>
          </div>
          {saved && <span className="saved-flag">Salvo ✓</span>}
        </div>
        <div className="seats-row">
          <div className="seats-usage">
            <div className="seats-bar">
              <b
                className={over ? "over" : ""}
                style={{
                  width: `${Math.min(100, b.seats ? (b.usedSeats / b.seats) * 100 : 0)}%`,
                }}
              />
            </div>
            <span>
              {b.usedSeats} de {b.seats} assentos em uso
              {over ? " · acima do contratado" : ""}
            </span>
          </div>
          <div className="seats-edit">
            <input
              type="number"
              min={0}
              value={seats}
              onChange={(e) => setSeats(e.target.value)}
            />
            <button
              className="btn"
              disabled={busy}
              onClick={() => update({ seats: Number(seats) || 0 })}
            >
              Atualizar
            </button>
          </div>
        </div>
      </article>
      <article className={`card gate-card${b.features.intelligence ? " unlocked" : ""}`}>
        <div className="card-head">
          <div>
            <h2>TeamWatcher Intelligence (IA)</h2>
            <p>
              {b.features.intelligence
                ? "Incluído no seu plano."
                : "Disponível no plano Intelligence."}
            </p>
          </div>
          <span className={`pill ${b.features.intelligence ? "online" : "offline"}`}>
            {b.features.intelligence ? "Ativo" : "Bloqueado"}
          </span>
        </div>
        <p className="settings-copy">
          Perguntas em linguagem natural, resumos automáticos e recomendações por
          evidências.{" "}
          {b.features.intelligence
            ? "Os recursos de IA chegam na Fase 2."
            : "Faça upgrade para habilitar."}
        </p>
        {!b.features.intelligence && (
          <button
            className="primary"
            disabled={busy}
            onClick={() => update({ plan: "intelligence" })}
          >
            Fazer upgrade — {brl(b.prices.intelligence)}/assento
          </button>
        )}
      </article>
      {b.pricingEditable && (
        <PriceEditor
          prices={b.prices}
          busy={busy}
          onSave={(prices) => update({ prices })}
        />
      )}
      <p className="billing-note">
        Cobrança administrada pela Synova. A integração com gateway de pagamento é
        ativada na contratação — este painel controla plano e licenças.
      </p>
    </div>
  );
}
function PriceEditor({
  prices,
  onSave,
  busy,
}: {
  prices: { essential: number; intelligence: number };
  onSave: (p: { essential: number; intelligence: number }) => void;
  busy: boolean;
}) {
  const [e, setE] = useState(String(prices.essential));
  const [i, setI] = useState(String(prices.intelligence));
  return (
    <article className="card">
      <div className="card-head">
        <div>
          <h2>Preços (Synova)</h2>
          <p>Valor por assento/mês de cada plano.</p>
        </div>
      </div>
      <div className="price-edit">
        <label>
          Essential
          <input
            type="number"
            value={e}
            onChange={(ev) => setE(ev.target.value)}
          />
        </label>
        <label>
          Intelligence
          <input
            type="number"
            value={i}
            onChange={(ev) => setI(ev.target.value)}
          />
        </label>
        <button
          className="btn"
          disabled={busy}
          onClick={() =>
            onSave({ essential: Number(e) || 0, intelligence: Number(i) || 0 })
          }
        >
          Salvar preços
        </button>
      </div>
    </article>
  );
}
type IntelAnswer = {
  intent: string;
  answer: string;
  suggestions: string[];
};
const INTENT_LABEL: Record<string, string> = {
  top_time: "Concentração de tempo",
  idle: "Ociosidade",
  off_schedule: "Aderência à jornada",
  week_change: "Variação semanal",
  recommendations: "Recomendações",
  summary: "Panorama",
};
type Digest = { kind: string; period: string; text: string; generatedAt: string };
type ChatMsg = { role: "user" | "ai"; text: string; intent?: string };
function parseInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|`(.+?)`/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[1]) nodes.push(<strong key={k++}>{m[1]}</strong>);
    else if (m[2]) nodes.push(<code key={k++}>{m[2]}</code>);
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}
function MarkdownText({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  text.split("\n").forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    if (/^[-*•]\s+/.test(line) || /^\d+[).]\s+/.test(line)) {
      const content = line.replace(/^[-*•]\s+/, "").replace(/^\d+[).]\s+/, "");
      blocks.push(
        <div className="md-li" key={i}>
          <span className="md-bullet">•</span>
          <span>{parseInline(content)}</span>
        </div>,
      );
    } else if (/^#{1,6}\s+/.test(line)) {
      blocks.push(
        <p className="md-h" key={i}>
          {parseInline(line.replace(/^#{1,6}\s+/, ""))}
        </p>,
      );
    } else {
      blocks.push(
        <p className="md-p" key={i}>
          {parseInline(line)}
        </p>,
      );
    }
  });
  return <>{blocks}</>;
}
function GateCard({ go }: { go: (s: Section) => void }) {
  return (
    <article className="card gate-card">
      <div className="card-head">
        <div>
          <h2>TeamWatcher Intelligence (IA)</h2>
          <p>Disponível no plano Intelligence.</p>
        </div>
        <span className="pill offline">Bloqueado</span>
      </div>
      <p className="settings-copy">
        Perguntas em linguagem natural, resumos automáticos e recomendações por
        evidências. Faça upgrade para habilitar.
      </p>
      <button className="primary" onClick={() => go("Faturamento")}>
        Ver planos
      </button>
    </article>
  );
}
function IntelChat({
  go,
  variant,
}: {
  go: (s: Section) => void;
  variant: "page" | "widget";
}) {
  const [locked, setLocked] = useState(false);
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);
  const ask = useCallback(async (question: string, fromUser: boolean) => {
    const text = question.trim();
    setBusy(true);
    if (fromUser && text) {
      setMsgs((prev) => [...prev, { role: "user", text }]);
      setQ("");
    }
    const r = await fetch(
      `/platform-api/dashboard/intelligence?q=${encodeURIComponent(text)}`,
      { credentials: "same-origin" },
    );
    setBusy(false);
    if (r.status === 403) {
      setLocked(true);
      return;
    }
    if (r.ok) {
      const x: IntelAnswer = await r.json();
      setLocked(false);
      setMsgs((prev) => [...prev, { role: "ai", text: x.answer, intent: x.intent }]);
      if (x.suggestions) setSuggestions(x.suggestions);
    }
  }, []);
  useEffect(() => {
    ask("", false);
  }, [ask]);
  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs, busy]);
  if (locked) return <GateCard go={go} />;
  return (
    <div className={`intel-chat ${variant}`}>
      <div className="intel-thread" ref={threadRef}>
        {msgs.map((mm, i) =>
          mm.role === "user" ? (
            <div className="chat-row user" key={i}>
              <div className="chat-bubble user">{mm.text}</div>
            </div>
          ) : (
            <div className="chat-row ai" key={i}>
              <div className="intel-ai">IA</div>
              <div className="chat-bubble ai">
                {mm.intent && (
                  <div className="intel-badge">
                    {INTENT_LABEL[mm.intent] || "Análise"}
                  </div>
                )}
                <MarkdownText text={mm.text} />
              </div>
            </div>
          ),
        )}
        {busy && (
          <div className="chat-row ai">
            <div className="intel-ai">IA</div>
            <div className="chat-bubble ai typing">Pensando…</div>
          </div>
        )}
      </div>
      {suggestions.length > 0 && (
        <div className="intel-suggestions">
          {suggestions.map((s) => (
            <button
              key={s}
              className="intel-chip"
              disabled={busy}
              onClick={() => ask(s, true)}
            >
              {s}
            </button>
          ))}
        </div>
      )}
      <div className="intel-ask">
        <input
          value={q}
          placeholder="Pergunte algo sobre a operação…"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && q.trim() && !busy) ask(q, true);
          }}
        />
        <button
          className="primary"
          disabled={busy || !q.trim()}
          onClick={() => ask(q, true)}
        >
          Enviar
        </button>
      </div>
    </div>
  );
}
function Intelligence({ d, go }: { d: Data; go: (s: Section) => void }) {
  void d;
  const [digests, setDigests] = useState<Digest[]>([]);
  useEffect(() => {
    fetch("/platform-api/dashboard/digests", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((x) => setDigests(x?.digests || []))
      .catch(() => {});
  }, []);
  return (
    <div className="page-stack">
      <div className="section-summary">
        <strong>TeamWatcher Intelligence</strong>
        <span>
          Pergunte sobre a operação em linguagem natural — a síntese é apoiada nos
          dados reais do período.
        </span>
      </div>
      <article className="card intel-panel">
        <IntelChat go={go} variant="page" />
      </article>
      {digests.length > 0 && (
        <div className="digest-section">
          <div className="digest-head">Resumos automáticos</div>
          <div className="digest-list">
            {digests.map((dg) => (
              <article className="card digest-card" key={dg.kind + dg.period}>
                <div className="digest-meta">
                  <span
                    className={`pill ${dg.kind === "daily" ? "online" : "offline"}`}
                  >
                    {dg.kind === "daily" ? "Diário" : "Semanal"}
                  </span>
                  <span>{dg.period}</span>
                </div>
                <MarkdownText text={dg.text} />
              </article>
            ))}
          </div>
        </div>
      )}
      <p className="billing-note">
        A IA organiza evidências a partir dos dados do período; a decisão continua
        humana.
      </p>
    </div>
  );
}
function ChatWidget({ d, go }: { d: Data; go: (s: Section) => void }) {
  const [open, setOpen] = useState(false);
  const canUse =
    d.viewer.role === "super_admin" ||
    d.viewer.role === "org_admin" ||
    d.viewer.role === "manager";
  if (!canUse) return null;
  return (
    <>
      <button
        className={`chat-fab${open ? " open" : ""}`}
        onClick={() => setOpen((o) => !o)}
        aria-label="Assistente IA"
      >
        {open ? "×" : "IA"}
      </button>
      {open && (
        <div className="chat-widget">
          <div className="chat-widget-head">
            <div>
              <strong>Assistente TeamWatcher</strong>
              <span>Pergunte sobre a operação</span>
            </div>
            <button
              className="chat-widget-close"
              onClick={() => setOpen(false)}
              aria-label="Fechar"
            >
              ×
            </button>
          </div>
          <IntelChat go={go} variant="widget" />
        </div>
      )}
    </>
  );
}
type AlertRow = {
  id: string;
  type: string;
  severity: "critical" | "warning" | "info";
  personId: string;
  personName: string;
  device?: string;
  message: string;
  at: string;
};
const ALERT_LABEL: Record<string, string> = {
  agent_offline: "Agente offline",
  long_idle: "Ociosidade longa",
  low_adherence: "Baixa aderência",
};
function Alerts({ d }: { d: Data }) {
  void d;
  const [ad, setAd] = useState<{
    alerts: AlertRow[];
    counts: { total: number; critical: number; warning: number };
  } | null>(null);
  const load = useCallback(async () => {
    const r = await fetch("/platform-api/dashboard/alerts", {
      credentials: "same-origin",
    });
    if (r.ok) setAd(await r.json());
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  return (
    <div className="page-stack">
      <div className="section-summary">
        <strong>{ad?.counts.total ?? 0} alerta(s) ativo(s)</strong>
        <span>
          {ad?.counts.critical ?? 0} crítico(s) · {ad?.counts.warning ?? 0} de
          atenção · recalculado a cada abertura, sobre a jornada de cada pessoa.
        </span>
      </div>
      {ad && ad.alerts.length === 0 ? (
        <State text="Tudo tranquilo — nenhum alerta no momento." />
      ) : (
        <div className="alert-list">
          {ad?.alerts.map((a) => (
            <article className={`alert-row ${a.severity}`} key={a.id}>
              <span className="alert-dot" />
              <div className="alert-body">
                <strong>
                  {a.personName}
                  <em>{ALERT_LABEL[a.type] || a.type}</em>
                </strong>
                <p>{a.message}</p>
              </div>
              <span className="alert-time">{date(a.at)}</span>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
type TeamRow = {
  id: string;
  name: string;
  tenantId: string;
  parentId: string | null;
  managerEmail: string | null;
  managerName: string | null;
  memberCount: number;
  members: { id: string; name: string; host: string | null }[];
};
type TeamsData = {
  teams: TeamRow[];
  managers: { email: string; name?: string; role: string }[];
  people: { id: string; name: string; teamId: string | null }[];
};
function orderOUs(teams: TeamRow[]): { team: TeamRow; depth: number }[] {
  const byParent: Record<string, TeamRow[]> = {};
  teams.forEach((t) => {
    const key = t.parentId || "__root__";
    (byParent[key] ||= []).push(t);
  });
  const out: { team: TeamRow; depth: number }[] = [];
  const seen = new Set<string>();
  const walk = (parent: string, depth: number) => {
    (byParent[parent] || [])
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((t) => {
        if (seen.has(t.id)) return;
        seen.add(t.id);
        out.push({ team: t, depth });
        walk(t.id, depth + 1);
      });
  };
  walk("__root__", 0);
  teams.forEach((t) => {
    if (!seen.has(t.id)) {
      seen.add(t.id);
      out.push({ team: t, depth: 0 });
    }
  });
  return out;
}
function Teams({ d }: { d: Data }) {
  const [td, setTd] = useState<TeamsData | null>(null);
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
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
  async function post(path: string, body: object) {
    await fetch(`/platform-api/dashboard/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(body),
    });
  }
  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    await post("teams", { name, parentId: parentId || null, managerEmail });
    setBusy(false);
    setName("");
    setParentId("");
    setManagerEmail("");
    load();
  }
  async function remove(id: string) {
    if (
      !confirm(
        "Excluir esta OU? As filhas sobem de nível e as pessoas ficam sem OU.",
      )
    )
      return;
    await post("teams/delete", { id });
    load();
  }
  async function assign(personId: string, ouId: string | null) {
    await post("people", { id: personId, teamId: ouId });
    load();
  }
  const ordered = td ? orderOUs(td.teams) : [];
  return (
    <div className="page-stack">
      {canManage && (
        <article className="card">
          <div className="card-head">
            <div>
              <h2>Nova unidade (OU)</h2>
              <p>
                Monte a hierarquia da organização e defina o gestor de cada OU.
              </p>
            </div>
          </div>
          <div className="invite-form">
            <input
              placeholder="Nome da OU (ex.: Comercial)"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <select
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
            >
              <option value="">OU raiz (sem pai)</option>
              {ordered.map(({ team, depth }) => (
                <option key={team.id} value={team.id}>
                  {"— ".repeat(depth)}
                  {team.name}
                </option>
              ))}
            </select>
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
              {busy ? "Criando…" : "Criar OU"}
            </button>
          </div>
        </article>
      )}
      <div className="section-summary">
        <strong>{td?.teams.length ?? 0} unidade(s) organizacional(is)</strong>
        <span>
          O gestor de uma OU enxerga também as OUs filhas. Atribua pessoas aqui
          ou em Pessoas → Editar.
        </span>
      </div>
      {td && td.teams.length === 0 ? (
        <State text="Nenhuma OU criada ainda." />
      ) : (
        <div className="ou-tree">
          {ordered.map(({ team, depth }) => {
            const outside = (td?.people || []).filter(
              (p) => p.teamId !== team.id,
            );
            return (
              <article
                className="card ou-card"
                key={team.id}
                style={{ marginLeft: `${depth * 26}px` }}
              >
                {depth > 0 && <span className="ou-branch" />}
                <div className="card-head">
                  <div>
                    <h2>{team.name}</h2>
                    <p>
                      {team.managerName || team.managerEmail
                        ? `Gestor: ${team.managerName || team.managerEmail}`
                        : "Sem gestor definido"}
                    </p>
                  </div>
                  <span className="pill offline">
                    {team.memberCount} pessoa(s)
                  </span>
                </div>
                <div className="team-members">
                  {team.members.length ? (
                    team.members.map((m) => (
                      <span className="member-chip" key={m.id}>
                        <span className="avatar tiny">{initials(m.name)}</span>
                        {m.name}
                        {canManage && (
                          <button
                            className="chip-x"
                            title="Remover da OU"
                            onClick={() => assign(m.id, null)}
                          >
                            ×
                          </button>
                        )}
                      </span>
                    ))
                  ) : (
                    <span className="ou-empty">Sem pessoas nesta OU.</span>
                  )}
                </div>
                {canManage && (
                  <div className="ou-actions">
                    <select
                      value=""
                      onChange={(e) => {
                        if (e.target.value) assign(e.target.value, team.id);
                      }}
                    >
                      <option value="">+ Adicionar pessoa…</option>
                      {outside.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    <button
                      className="btn ghost danger"
                      onClick={() => remove(team.id)}
                    >
                      Excluir OU
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
const HEALTH_LABEL: Record<string, string> = {
  online: "Saudável",
  stale: "Sinal atrasado",
  offline: "Sem sinal",
};
function Devices({ d, reload }: { d: Data; reload: () => void }) {
  const [busy, setBusy] = useState("");
  const canManage =
    d.viewer.role === "super_admin" || d.viewer.role === "org_admin";
  async function toggleBlock(host: string, block: boolean) {
    if (block && !confirm(`Revogar o acesso de ${host}? O agente para de enviar dados até ser reativado.`)) return;
    setBusy(host);
    await fetch(`/platform-api/dashboard/devices/${block ? "block" : "unblock"}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ host }),
    });
    setBusy("");
    reload();
  }
  return (
    <div className="page-stack">
      <div className="section-summary">
        <strong>{d.devices.length} dispositivo(s) real(is)</strong>
        <span>
          Inventário criado automaticamente pela telemetria do agente ·
          saúde e revogação de acesso por dispositivo.
        </span>
      </div>
      <div className="device-grid">
        {d.devices.map((x) => (
          <DeviceCard
            d={x}
            key={x.id}
            canManage={canManage}
            busy={busy === x.id}
            onToggleBlock={() => toggleBlock(x.id, !x.blocked)}
          />
        ))}
      </div>
      {d.devices
        .filter((x) => !x.blocked)
        .map((x) => (
          <Gallery
            device={x}
            person={d.person.name}
            tenantId={d.tenant.id}
            key={`g-${x.id}`}
          />
        ))}
    </div>
  );
}
function DeviceCard({
  d,
  canManage,
  busy,
  onToggleBlock,
}: {
  d: Device;
  canManage: boolean;
  busy: boolean;
  onToggleBlock: () => void;
}) {
  const health = d.blocked ? "offline" : d.health || d.status;
  return (
    <article className={`device-card${d.blocked ? " blocked" : ""}`}>
      <div className="device-icon">⌘</div>
      <div>
        <h3>{d.name}</h3>
        <p>
          {d.platform} · {d.client || "agente"} · {d.id}
        </p>
      </div>
      <span className={`pill ${d.blocked ? "offline" : health === "online" ? "online" : "offline"}`}>
        {d.blocked ? "revogado" : HEALTH_LABEL[health] || d.status}
      </span>
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
      {canManage && (
        <div className="device-actions">
          <button
            className={d.blocked ? "btn" : "btn ghost danger"}
            disabled={busy}
            onClick={onToggleBlock}
          >
            {busy
              ? "…"
              : d.blocked
                ? "Reativar acesso"
                : "Revogar acesso"}
          </button>
        </div>
      )}
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
type PolicyData = {
  retentionDays: number;
  retentionEditable: boolean;
  classification: {
    productive: string[];
    unproductive: string[];
    neutral: string[];
  };
  defaults: { productive: string[]; unproductive: string[] };
};
function Policies({ d }: { d: Data }) {
  const canEdit =
    d.viewer.role === "super_admin" || d.viewer.role === "org_admin";
  const [pol, setPol] = useState<PolicyData | null>(null);
  const [prod, setProd] = useState("");
  const [unprod, setUnprod] = useState("");
  const [neutral, setNeutral] = useState("");
  const [days, setDays] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const load = useCallback(async () => {
    const r = await fetch("/platform-api/dashboard/policies", {
      credentials: "same-origin",
    });
    if (!r.ok) return;
    const p: PolicyData = await r.json();
    setPol(p);
    setProd(p.classification.productive.join(", "));
    setUnprod(p.classification.unproductive.join(", "));
    setNeutral(p.classification.neutral.join(", "));
    setDays(String(p.retentionDays));
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  if (!canEdit) return null;
  const parse = (s: string) =>
    s
      .split(/[\n,]/)
      .map((x) => x.trim())
      .filter(Boolean);
  async function save() {
    setBusy(true);
    const body: {
      classification: { productive: string[]; unproductive: string[]; neutral: string[] };
      retentionDays?: number;
    } = {
      classification: {
        productive: parse(prod),
        unproductive: parse(unprod),
        neutral: parse(neutral),
      },
    };
    if (pol?.retentionEditable) body.retentionDays = Number(days) || 0;
    await fetch("/platform-api/dashboard/policies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(body),
    });
    setBusy(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2200);
    load();
  }
  return (
    <article className="card policy-card">
      <h2>Políticas de classificação e retenção</h2>
      <p className="settings-copy">
        Defina como aplicativos e sites entram na conta de produtividade — vale
        para todas as telas. Uma palavra por linha ou separadas por vírgula
        (correspondência por trecho, ex.: “youtube”).
      </p>
      <div className="policy-fields">
        <label className="policy-field productive">
          <span>Produtivo</span>
          <textarea
            value={prod}
            onChange={(e) => setProd(e.target.value)}
            placeholder="figma, notion, github"
          />
        </label>
        <label className="policy-field unproductive">
          <span>Improdutivo</span>
          <textarea
            value={unprod}
            onChange={(e) => setUnprod(e.target.value)}
            placeholder="instagram, tiktok, jogos.com"
          />
        </label>
        <label className="policy-field neutral">
          <span>Neutro (força)</span>
          <textarea
            value={neutral}
            onChange={(e) => setNeutral(e.target.value)}
            placeholder="opcional"
          />
        </label>
      </div>
      {pol && (
        <p className="settings-hint">
          Padrões da plataforma já cobrem {pol.defaults.productive.slice(0, 5).join(", ")}… (produtivo) e{" "}
          {pol.defaults.unproductive.slice(0, 5).join(", ")}… (improdutivo). Suas
          regras têm prioridade.
        </p>
      )}
      <div className="retention-row">
        <div>
          <strong>Retenção de capturas (LGPD)</strong>
          <span>Capturas mais antigas que o limite são apagadas diariamente.</span>
        </div>
        <div className="retention-input">
          <input
            type="number"
            min={0}
            max={3650}
            value={days}
            onChange={(e) => setDays(e.target.value)}
            disabled={!pol?.retentionEditable}
          />
          <span>dias{pol && !pol.retentionEditable ? " · definido pela Synova" : ""}</span>
        </div>
      </div>
      <div className="policy-actions">
        <button className="primary" onClick={save} disabled={busy}>
          {busy ? "Salvando…" : "Salvar políticas"}
        </button>
        {saved && <span className="saved-flag">Salvo ✓</span>}
      </div>
    </article>
  );
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
      <Policies d={d} />
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
