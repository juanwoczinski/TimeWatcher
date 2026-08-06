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
type ViewScope = "self" | "default";
type Section =
  | "Visão geral"
  | "Empresas"
  | "Pessoas"
  | "OUs"
  | "Alertas"
  | "Operações"
  | "Intelligence"
  | "Dispositivos"
  | "Atividades"
  | "Relatórios"
  | "Instaladores"
  | "Acessos"
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
  accessRole?: Role | null;
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
  inputSeconds: number;
  webSeconds: number;
  appSeconds: number;
  version?: string | null;
  updateRequested?: boolean;
  updateStatus?: string | null;
  targetVersion?: string | null;
  lastUpdateCheckAt?: string | null;
  lastUpdatedAt?: string | null;
  updateError?: string | null;
  assignedPersonId?: string | null;
  personName?: string | null;
  personEmail?: string | null;
  inventory?: Record<string, string>;
  observedIp?: string | null;
  signals?: Record<string, string>;
  software?: string[];
};
type Schedule = {
  id: string;
  tenantId: string;
  name: string;
  start: string;
  end: string;
  breakMinutes: number;
  weekdays: number[];
  timezone?: string;
  holidays?: string[];
  exceptions?: Record<string, { off?: boolean; start?: string; end?: string }>;
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
  expectedSeconds?: number;
  scheduledActiveSeconds?: number;
  scheduledProductiveSeconds?: number;
  scheduleAdherence?: number;
  productivityIndex?: number;
  outsideScheduleSeconds?: number;
  inputSeconds?: number;
  webSeconds?: number;
  appSeconds?: number;
  expectedSeconds?: number;
  scheduleAdherence?: number;
  productivityIndex?: number;
  scheduledActiveSeconds?: number;
  scheduledProductiveSeconds?: number;
  outsideScheduleSeconds?: number;
  scheduleName?: string | null;
};
type Data = {
  viewer: { username: string; name: string; role: Role; tenantId: string; onboardingCompletedAt?: string | null };
  tenant: Tenant;
  tenants: Tenant[];
  period: Period;
  range: { start: string; end: string };
  generatedAt: string;
  scope?: ViewScope;
  selfLink?: { linked: boolean; host?: string | null; candidates: { host: string; name: string }[] };
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
    inputSeconds: number;
    lastSeen: string | null;
    expectedSeconds?: number;
    scheduleAdherence?: number;
    productivityIndex?: number;
    scheduledActiveSeconds?: number;
    scheduledProductiveSeconds?: number;
    outsideScheduleSeconds?: number;
  };
  devices: Device[];
  agentFleet?: {
    total: number;
    policy: { enabled: boolean; rolloutPercent: number; checkIntervalMinutes: number; channel: string };
    releases: Record<string, { version: string; url: string; sha256: string; publishedAt?: string }>;
    distribution: Record<string, number>;
    statuses: Record<string, number>;
  };
  apps: App[];
  urls: UrlUsage[];
  domains: {
    domain: string;
    seconds: number;
    duration: string;
    classification: string;
  }[];
  timeline: { hour: number; label: string; seconds: number }[];
  interactionTimeline: { hour: number; label: string; presses: number; clicks: number; seconds: number }[];
  webTimeline: { hour: number; label: string; seconds: number; productiveSeconds: number }[];
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
  { name: "Operações", icon: "alerts" },
  { name: "Intelligence", icon: "intelligence" },
  { name: "Dispositivos", icon: "devices" },
  { name: "Atividades", icon: "activity" },
  { name: "Relatórios", icon: "reports" },
  { name: "Instaladores", icon: "installers" },
  { name: "Acessos", icon: "userplus" },
  { name: "Faturamento", icon: "billing" },
  { name: "Configurações", icon: "settings" },
];
const desc: Record<Section, string> = {
  "Visão geral": "Produtividade, aderência e uso do tempo com dados reais.",
  Empresas: "Governança multiempresa controlada pela Synova.",
  Pessoas: "Jornada, atividade, ativos e capturas por colaborador.",
  OUs: "Unidades organizacionais (com hierarquia pai/filha) e o gestor de cada uma.",
  Alertas: "Agente offline, ociosidade longa e desvios de jornada.",
  Operações: "Logs, métricas de ingestão, saúde dos serviços e alertas operacionais.",
  Intelligence: "Pergunte sobre a operação e receba síntese apoiada nos dados.",
  Dispositivos: "Inventário e saúde dos computadores vinculados.",
  Atividades: "Aplicativos, URLs, janelas, atividade e ociosidade.",
  Relatórios: "Filtros e exportações para análise operacional.",
  Instaladores: "Distribuição individual ou em massa vinculada ao tenant.",
  Acessos: "Contas de login na plataforma e papéis. O cadastro de colaboradores fica em Pessoas.",
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
  const [phase, setPhase] = useState<
    "loading" | "login" | "setpw" | "resetpw" | "app"
  >("loading");
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [resetToken, setResetToken] = useState<string | null>(null);
  useEffect(() => {
    let invite: string | null = null;
    let reset: string | null = null;
    try {
      const q = new URL(window.location.href).searchParams;
      invite = q.get("invite");
      reset = q.get("reset");
    } catch {}
    if (invite) {
      setInviteToken(invite);
      setPhase("setpw");
      return;
    }
    if (reset) {
      setResetToken(reset);
      setPhase("resetpw");
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
      mode={
        phase === "setpw" ? "setpw" : phase === "resetpw" ? "reset" : "login"
      }
      token={phase === "resetpw" ? resetToken : inviteToken}
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
    [scope, setScope] = useState<ViewScope>("default"),
    [data, setData] = useState<Data | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [refreshing, setRefreshing] = useState(false),
    [tourOpen, setTourOpen] = useState(false);
  const requestSequence = useRef(0);
  const tourChecked = useRef(false);
  const [collapsed, setCollapsed] = useState(false);
  const [density, setDensity] = useState<"comfortable" | "compact">(
    "comfortable",
  );
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const load = useCallback(async (forceRefresh = false) => {
    const sequence = ++requestSequence.current;
    try {
      setError("");
      const q = new URLSearchParams({ period });
      q.set("scope", scope);
      if (period === "custom" && start && end) {
        q.set("start", start);
        q.set("end", end);
      }
      if (tenant) q.set("tenant", tenant);
      if (forceRefresh) q.set("refresh", "1");
      const r = await fetch(`/platform-api/dashboard/data?${q}`, {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!r.ok) throw Error();
      const next = await r.json();
      if (sequence !== requestSequence.current) return;
      setData(next);
      if (!tenant) setTenant(next.tenant.id);
    } catch {
      setError("Não foi possível carregar os dados enviados pelo agente.");
    } finally {
      setLoading(false);
    }
  }, [period, start, end, tenant, scope]);
  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  }, [load]);
  useEffect(() => {
    setLoading(true);
    load();
    const t = setInterval(() => load(), 30000);
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
  useEffect(() => {
    if (data && !tourChecked.current) {
      tourChecked.current = true;
      if (!data.viewer.onboardingCompletedAt) setTourOpen(true);
    }
  }, [data]);
  const finishTour = async () => {
    setTourOpen(false);
    try {
      await fetch("/platform-api/dashboard/me/onboarding-complete", { method: "POST", credentials: "same-origin" });
    } catch {}
  };
  const isAdmin =
    data?.viewer.role === "super_admin" || data?.viewer.role === "org_admin";
  const isMember =
    data?.viewer.role === "member" || data?.viewer.role === "employee";
  const nav = baseNav.filter((n) => {
    if (isMember) return n.name === "Visão geral" || n.name === "Atividades";
    if (n.name === "Empresas") return data?.viewer.role === "super_admin";
    if (n.name === "Acessos" || n.name === "Faturamento") return isAdmin;
    if (n.name === "OUs" || n.name === "Alertas" || n.name === "Operações" || n.name === "Intelligence")
      return isAdmin || data?.viewer.role === "manager";
    return true;
  });
  const tenantName = data?.tenant.name || "TimeWatcher";
  const shownName = displayName || data?.viewer.name || "TimeWatcher";
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
            <strong>TimeWatcher</strong>
            <span>Inteligência do tempo</span>
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
          <button className="refresh-button" onClick={refresh} disabled={refreshing}>
            {refreshing ? "↻ Atualizando…" : "↻ Atualizar"}
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
            {data?.generatedAt && ` · painel atualizado ${date(data.generatedAt)}`}
          </div>
          <div className="filters">
            {data && data.viewer.role !== "member" && data.viewer.role !== "employee" && (
              <div className="scope-switch" role="group" aria-label="Escopo do painel">
                <button className={scope === "self" ? "active" : ""} onClick={() => setScope("self")}>Minha visão</button>
                <button className={scope === "default" ? "active" : ""} onClick={() => setScope("default")}>{data.viewer.role === "manager" ? "Meu time" : "Organização"}</button>
              </div>
            )}
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
              scope={scope}
              reload={load}
              prefs={prefs}
            />
          )
        )}
      </section>
      {data && <ChatWidget d={data} go={setActive} />}
      {data && tourOpen && <FirstLoginTour d={data} onFinish={finishTour} onNavigate={setActive} />}
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
  scope,
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
  scope: ViewScope;
  reload: () => void;
  prefs: Prefs;
}) {
  if (active === "Visão geral") return <Overview d={data} go={setActive} reload={reload} />;
  if (active === "Empresas") return <Companies d={data} reload={reload} />;
  if (active === "Pessoas") return <People d={data} reload={reload} />;
  if (active === "OUs") return <Teams d={data} />;
  if (active === "Alertas") return <Alerts d={data} />;
  if (active === "Operações") return <Operations d={data} />;
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
        scope={scope} reload={reload}
      />
    );
  if (active === "Instaladores") return <Installers d={data} />;
  if (active === "Acessos") return <Users d={data} />;
  if (active === "Faturamento") return <Billing d={data} />;
  if (active === "Minha conta") return <Account d={data} prefs={prefs} />;
  return <Settings d={data} prefs={prefs} />;
}
function State({ text }: { text: string }) {
  return <div className="state-card">{text}</div>;
}
function FirstLoginTour({ d, onFinish, onNavigate }: { d: Data; onFinish: () => void; onNavigate: (section: Section) => void }) {
  const [step, setStep] = useState(0);
  const personalNeedsLink = !d.selfLink?.linked;
  const steps = [
    { menu: "Visão geral" as Section, title: `Conheça a visão geral`, text: "Acompanhe tempo ativo, foco, jornada e alertas da operação em um único lugar." },
    { menu: "Pessoas" as Section, title: "Pessoas e dispositivos", text: personalNeedsLink ? "Aqui você também confirma o dispositivo que pertence a você e mantém a identidade da telemetria correta." : "Cadastre colaboradores, vincule dispositivos e atribua jornadas por pessoa." },
    { menu: "Atividades" as Section, title: "Atividades detalhadas", text: "Investigue aplicações, URLs, cliques, teclado e histórico por período — sempre a partir da coleta real." },
    { menu: "Relatórios" as Section, title: "Relatórios e fechamento", text: "Visualize o relatório na tela, exporte quando precisar e programe entregas. Admins fecham o mês com rastreabilidade." },
  ];
  const current = steps[step];
  const next = () => { if (step + 1 >= steps.length) return onFinish(); const following = step + 1; setStep(following); onNavigate(steps[following].menu); };
  return <div className="tour-backdrop" role="dialog" aria-modal="false" aria-label="Guia inicial"><section className="tour-modal"><span>GUIA RÁPIDO · {step + 1}/{steps.length}</span><div className="tour-menu-name">{current.menu}</div><h2>{current.title}</h2><p>{current.text}</p><div className="tour-progress">{steps.map((_, i)=><i key={i} className={i <= step ? "on" : ""}/>)}</div><footer><button onClick={onFinish}>Encerrar</button><button className="primary" onClick={next}>{step + 1 < steps.length ? "Próximo" : "Concluir"}</button></footer></section></div>;
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
function TrendCard({ period }: { period: Period }) {
  const [series, setSeries] = useState<TrendPoint[] | null>(null);
  const days = period === "today" ? 7 : period === "7d" ? 7 : 30;
  useEffect(() => {
    fetch(`/platform-api/dashboard/trends?days=${days}`, {
      credentials: "same-origin",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((x) => setSeries(x?.series || null))
      .catch(() => {});
  }, [days]);
  if (!series) return null;
  const max = Math.max(...series.map((p) => p.trackedSeconds), 1);
  return (
    <article className="card trend-card">
      <div className="card-head">
        <div>
          <h2>Tendência · {days} dias</h2>
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
function MicroInsights({ d }: { d: Data }) {
  const interactionMax = Math.max(...d.interactionTimeline.map((p) => p.presses + p.clicks), 1);
  const webMax = Math.max(...d.webTimeline.map((p) => p.seconds), 1);
  const domainRows = d.domains.slice(0, 5);
  return <section className="micro-dashboard">
    <article className="card heatmap-card"><div className="card-head"><div><h2>Mapa de calor de interação</h2><p>Teclas e cliques por hora. Passe o mouse para detalhar.</p></div></div><div className="heatmap-hours">{d.interactionTimeline.map((p) => { const total = p.presses + p.clicks; const level = Math.min(4, Math.ceil(total / interactionMax * 4)); return <div className={`heat-cell l${level}`} key={p.hour} title={`${p.label}h · ${p.presses} teclas · ${p.clicks} cliques · ${duration(p.seconds)} de atividade`}><b>{p.label}</b><span>{total ? total.toLocaleString("pt-BR") : "—"}</span></div>; })}</div><div className="chart-legend"><span>Menos interação</span><i className="l1"/><i className="l2"/><i className="l3"/><i className="l4"/><span>Mais interação</span></div></article>
    <article className="card input-chart-card"><div className="card-head"><div><h2>Cliques × teclado por horário</h2><p>Volume de interações de entrada no período.</p></div></div><div className="interaction-bars">{d.interactionTimeline.map((p) => <div className="interaction-col" key={p.hour} title={`${p.label}h · ${p.clicks} cliques / ${p.presses} teclas`}><span className="clicks" style={{height:`${Math.max(1, p.clicks / interactionMax * 100)}%`}}/><span className="presses" style={{height:`${Math.max(1, p.presses / interactionMax * 100)}%`}}/><small>{p.hour % 3 === 0 ? p.label : ""}</small></div>)}</div><div className="chart-legend"><i className="clicks"/><span>Cliques</span><i className="presses"/><span>Teclas</span></div></article>
    <article className="card web-chart-card"><div className="card-head"><div><h2>Uso web e foco por hora</h2><p>Tempo em URLs; trecho roxo indica uso produtivo.</p></div></div><div className="web-bars">{d.webTimeline.map((p) => <div className="web-col" key={p.hour} title={`${p.label}h · ${duration(p.seconds)} web · ${duration(p.productiveSeconds)} produtivo`}><span style={{height:`${Math.max(1, p.seconds / webMax * 100)}%`}}><b style={{height:`${p.seconds ? Math.min(100, p.productiveSeconds / p.seconds * 100) : 0}%`}}/></span><small>{p.hour % 3 === 0 ? p.label : ""}</small></div>)}</div></article>
    <article className="card domains-card"><div className="card-head"><div><h2>Domínios que mais consomem tempo</h2><p>Distribuição do uso de URLs.</p></div></div><div className="domain-list">{domainRows.length ? domainRows.map((x) => <div key={x.domain}><span><b>{x.domain}</b><small>{x.classification === "productive" ? "Produtivo" : x.classification === "unproductive" ? "Não produtivo" : "Neutro"}</small></span><em><i style={{width:`${Math.min(100, x.seconds / Math.max(domainRows[0].seconds, 1) * 100)}%`}}/></em><strong>{x.duration}</strong></div>) : <State text="Ainda não há URLs no período." />}</div></article>
  </section>;
}
type AnalyticsPerson = DirPerson & { webSeconds: number; inputSeconds: number; appSeconds: number };
type AnalyticsTeam = { id: string; name: string; people: number; trackedSeconds: number; activeSeconds: number; productiveSeconds: number; webSeconds: number; inputSeconds: number; presses: number; clicks: number; focusScore: number };
function ProductivityAnalytics({ d }: { d: Data }) {
  const [report, setReport] = useState<{ people: AnalyticsPerson[]; teams: AnalyticsTeam[] } | null>(null);
  const selfOnly = d.viewer.role === "member" || d.viewer.role === "employee";
  const managerView = d.viewer.role === "manager";
  useEffect(() => {
    const q = new URLSearchParams({ period: d.period, scope: d.scope || "default" });
    fetch(`/platform-api/dashboard/analytics?${q}`, { credentials: "same-origin", cache: "no-store" })
      .then((r) => r.ok ? r.json() : null).then(setReport).catch(() => {});
  }, [d.period, d.generatedAt]);
  if (!report) return <State text="Calculando produtividade por pessoa e equipe…" />;
  return <div className="analytics-grid">
    <article className="card analytics-card"><div className="card-head"><div><h2>{selfOnly ? "Meu detalhamento de produtividade" : managerView ? "Produtividade do meu time" : "Produtividade por colaborador"}</h2><p>Tempo produtivo, entradas de teclado/mouse e uso web.</p></div></div><div className="analytics-list">{report.people.slice(0, selfOnly ? 1 : 6).map((p) => <div className="analytics-row" key={p.id}><span><b>{p.name}</b><small>{p.device}</small></span><span title="Interação de teclado e mouse">⌨ {duration(p.inputSeconds || 0)} · {p.presses.toLocaleString("pt-BR")} teclas</span><span title="Tempo em URLs">◉ {duration(p.webSeconds || 0)}</span><strong>{p.focusScore}%</strong></div>)}</div></article>
    <article className="card analytics-card"><div className="card-head"><div><h2>{selfOnly ? "Meu ritmo de trabalho" : "Comparativo entre equipes"}</h2><p>{selfOnly ? "Interações e uso de aplicações no período selecionado." : "Índice de produtividade com base no tempo real."}</p></div></div><div className="analytics-list">{selfOnly ? <><div className="analytics-row"><span><b>Aplicações</b><small>tempo de janelas ativas</small></span><span>⌨ {duration(d.summary.inputSeconds)}</span><span>◉ {duration(d.summary.webSeconds)}</span><strong>{duration(d.summary.activeSeconds)}</strong></div><div className="analytics-row"><span><b>Jornada</b><small>tempo observado dentro da jornada</small></span><span>Meta {duration(d.summary.expectedSeconds || 0)}</span><span>Ativo {duration(d.summary.scheduledActiveSeconds || 0)}</span><strong>{Math.round(d.summary.scheduleAdherence || 0)}%</strong></div></> : report.teams.length ? report.teams.slice(0, 6).map((t) => <div className="analytics-row team" key={t.id}><span><b>{t.name}</b><small>{t.people} pessoa(s) · {duration(t.activeSeconds)} ativo</small></span><span>⌨ {duration(t.inputSeconds)}</span><span>◉ {duration(t.webSeconds)}</span><strong>{t.focusScore}%</strong></div>) : <State text="Atribua pessoas a uma OU para comparar equipes." />}</div></article>
  </div>;
}
function TeamCollectionVisibility({ d, go }: { d: Data; go: (section: Section) => void }) {
  const [people, setPeople] = useState<DirPerson[]>([]);
  const canSeeTeam = d.viewer.role === "super_admin" || d.viewer.role === "org_admin" || d.viewer.role === "manager";
  useEffect(() => {
    if (!canSeeTeam) return;
    const q = new URLSearchParams({ period: d.period, scope: d.scope || "default" });
    fetch(`/platform-api/dashboard/people?${q}`, { credentials: "same-origin", cache: "no-store" }).then(r => r.ok ? r.json() : null).then(x => setPeople(x?.people || [])).catch(() => setPeople([]));
  }, [canSeeTeam, d.period, d.scope, d.generatedAt]);
  if (!canSeeTeam) return null;
  return <article className="card team-collection"><div className="card-head"><div><h2>Coleta por colaborador</h2><p>Quem está conectado, em qual host e qual atividade lidera o período.</p></div><button className="text-button" onClick={() => go("Pessoas")}>Ver pessoas →</button></div>{people.length ? <div className="team-collection-list">{people.slice(0, 8).map(person => <div key={person.id}><span className="avatar tiny">{initials(person.name)}</span><span><b>{person.name}</b><small>{person.device} · sessão {person.sessionUser || "não identificada"} · {person.status}</small></span><span><small>Principal atividade</small><b>{person.topUrls?.[0]?.domain || person.topApps?.[0]?.name || "Sem dados"}</b></span><strong>{duration(person.activeSeconds)} ativo</strong></div>)}</div> : <State text="Aguardando dados de colaboradores." />}</article>;
}
function SelfDeviceLink({ d, reload }: { d: Data; reload: () => void }) {
  const [host, setHost] = useState(d.selfLink?.candidates[0]?.host || "");
  const [saving, setSaving] = useState(false); const [message, setMessage] = useState("");
  const link = async () => {
    if (!host) return; setSaving(true); setMessage("");
    const r = await fetch("/platform-api/dashboard/me/link-device", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ host }) });
    const body = await r.json().catch(() => ({})); setSaving(false);
    if (!r.ok) return setMessage(body.error === "device_assigned" ? `Este dispositivo já está associado a ${body.person}. Transfira-o em Dispositivos.` : "Não foi possível vincular este dispositivo.");
    setMessage("Dispositivo vinculado. Carregando seus dados reais…"); reload();
  };
  return <article className="card self-link-card"><div><span>CONFIGURAÇÃO NECESSÁRIA</span><h2>Vincule o seu dispositivo ao seu perfil</h2><p>A visão pessoal usa exclusivamente a telemetria do host associado ao seu login. Nenhum dado de outro colaborador será exibido.</p></div>{d.selfLink?.candidates.length ? <div className="self-link-actions"><select value={host} onChange={(e) => setHost(e.target.value)}>{d.selfLink.candidates.map((item) => <option value={item.host} key={item.host}>{item.name}</option>)}</select><button className="primary" disabled={saving} onClick={link}>{saving ? "Vinculando…" : "Vincular meu dispositivo"}</button></div> : <p className="muted">Nenhum dispositivo elegível está conectado. Instale o agente e aguarde a primeira sincronização.</p>}{message && <small>{message}</small>}</article>;
}
function Overview({ d, go, reload }: { d: Data; go: (s: Section) => void; reload: () => void }) {
  const s = d.summary,
    total = s.productiveSeconds + s.neutralSeconds + s.unproductiveSeconds || 1,
    max = Math.max(...d.timeline.map((x) => x.seconds), 1);
  const selfOnly = d.scope === "self" || d.viewer.role === "member" || d.viewer.role === "employee";
  const managerView = d.viewer.role === "manager" && !selfOnly;
  return (
    <>
      <div className="dashboard-context">
        <div><span>{selfOnly ? "MEU PAINEL" : managerView ? "MEU TIME" : "VISÃO DA ORGANIZAÇÃO"}</span><h2>{selfOnly ? "Seu desempenho no período selecionado" : managerView ? "Produtividade das equipes sob sua gestão" : "Produtividade e operação da organização"}</h2></div>
        <p>{selfOnly ? "Use este painel para acompanhar jornada, foco, aplicações e URLs do seu dispositivo." : managerView ? "Os dados abaixo incluem apenas pessoas e OUs atribuídas à sua gestão." : "Filtros de período e empresa são aplicados em todas as métricas."}</p>
      </div>
      {selfOnly && !d.selfLink?.linked && <SelfDeviceLink d={d} reload={reload} />}
      <div className="metrics dense-metrics">
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
        <Metric
          label="Teclado e mouse"
          value={duration(s.inputSeconds)}
          note={`${d.input.presses.toLocaleString("pt-BR")} teclas · ${d.input.clicks.toLocaleString("pt-BR")} cliques`}
        />
        <Metric
          label="Aderência à jornada"
          value={`${Math.round(s.scheduleAdherence || 0)}%`}
          note={`${duration(s.scheduledActiveSeconds || 0)} dentro de ${duration(s.expectedSeconds || 0)}`}
        />
      </div>
      <TrendCard period={d.period} />
      <MicroInsights d={d} />
      <ProductivityAnalytics d={d} />
      {!selfOnly && <TeamCollectionVisibility d={d} go={go} />}
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
  sessionUser?: string | null;
  observedIp?: string | null;
  inventory?: Record<string, string>;
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
  counts: { people: number; online: number; withDevice?: number; withoutDevice?: number; withAccess?: number };
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
function Pager({
  page,
  pageCount,
  total,
  onPage,
}: {
  page: number;
  pageCount: number;
  total: number;
  onPage: (p: number) => void;
}) {
  if (pageCount <= 1) return null;
  return (
    <div className="pager">
      <span className="pager-info">
        Página {page + 1} de {pageCount} · {total} no total
      </span>
      <div className="pager-btns">
        <button
          className="btn ghost"
          disabled={page === 0}
          onClick={() => onPage(page - 1)}
        >
          ← Anterior
        </button>
        <button
          className="btn ghost"
          disabled={page >= pageCount - 1}
          onClick={() => onPage(page + 1)}
        >
          Próxima →
        </button>
      </div>
    </div>
  );
}
const PEOPLE_PER_PAGE = 12;
function People({ d, reload }: { d: Data; reload: () => void }) {
  const [dir, setDir] = useState<Directory | null>(null);
  const [loadError, setLoadError] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [invite, setInvite] = useState<{
    email: string;
    url: string;
    emailSent?: boolean;
  } | null>(null);
  const canEdit =
    d.viewer.role === "super_admin" || d.viewer.role === "org_admin";

  const load = useCallback(async () => {
    setLoadError("");
    const query = new URLSearchParams({ period: d.period, scope: d.scope || "default", tenant: d.tenant.id });
    try {
      const res = await fetch(`/platform-api/dashboard/people?${query}`, { credentials: "same-origin", cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      setDir(await res.json());
    } catch { setLoadError("Não foi possível carregar o diretório agora."); }
  }, [d.period, d.scope, d.tenant.id, d.generatedAt]);
  useEffect(() => {
    load();
  }, [load]);

  const teamName = (id: string | null) =>
    (id && dir?.teams.find((t) => t.id === id)?.name) || "Sem time";
  const scheduleName = (id: string | null) => (id && dir?.schedules.find((s) => s.id === id)?.name) || "Sem jornada";
  const accessLabel: Record<string, string> = { super_admin: "Super admin", org_admin: "Admin da organização", manager: "Gestor", member: "Colaborador", employee: "Colaborador" };
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
  useEffect(() => {
    setPage(0);
  }, [q]);
  const pageCount = Math.max(1, Math.ceil(people.length / PEOPLE_PER_PAGE));
  const safePage = Math.min(page, pageCount - 1);
  const shown = people.slice(
    safePage * PEOPLE_PER_PAGE,
    safePage * PEOPLE_PER_PAGE + PEOPLE_PER_PAGE,
  );

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
    if (x?.inviteUrl)
      setInvite({ email, url: x.inviteUrl, emailSent: !!x.emailSent });
  }

  return (
    <div className="page-stack">
      <section className="directory-overview">
        <div><span className="eyebrow">DIRETÓRIO DA ORGANIZAÇÃO</span><h2>Pessoas, acesso e vínculo operacional</h2><p>Colaboradores são identidades da organização; dispositivos e telemetria aparecem vinculados ao perfil.</p></div>
        <div className="directory-kpis"><span><strong>{dir?.counts.people ?? "—"}</strong>Total</span><span><strong>{dir?.counts.online ?? "—"}</strong>Online</span><span><strong>{dir?.counts.withDevice ?? "—"}</strong>Com dispositivo</span><span><strong>{dir?.counts.withoutDevice ?? "—"}</strong>Sem dispositivo</span></div>
      </section>
      <div className="people-toolbar directory-toolbar">
        <input
          className="people-search"
          placeholder="Buscar por pessoa, e-mail, cargo, OU ou dispositivo…"
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
          <span>
            {invite.emailSent
              ? `Acesso concedido a ${invite.email} — convite enviado por e-mail. Link de backup:`
              : `Acesso concedido a ${invite.email} — envie o magic link:`}
          </span>
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
        loadError ? <div className="load-error"><strong>{loadError}</strong><button className="btn ghost" onClick={load}>Tentar novamente</button></div> : <State text="Carregando diretório…" />
      ) : people.length === 0 ? (
        <State
          text={
            canEdit
              ? "Nenhuma pessoa ainda — cadastre a primeira."
              : "Nenhuma pessoa neste período."
          }
        />
      ) : (
        <>
          <div className="table-wrap">
            <table className="data-table people-table">
              <thead>
                <tr>
                  <th>Pessoa</th>
                  <th>Cargo e acesso</th>
                  <th>OU e jornada</th>
                  <th>Dispositivo</th>
                  <th>Status</th>
                  <th className="num">Monitorado</th>
                  <th className="num">Foco</th>
                  <th>Visto</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((person) => (
                  <tr
                    key={person.id}
                    className={selected === person.id ? "sel" : ""}
                    onClick={() =>
                      setSelected(selected === person.id ? null : person.id)
                    }
                  >
                    <td className="cell-person">
                      <span className="avatar tiny">
                        {initials(person.name)}
                      </span>
                      <span className="cell-person-meta">
                        <strong>{person.name}</strong>
                        <small>{person.email || "Sem e-mail vinculado"}</small>
                      </span>
                    </td>
                    <td><strong className="table-primary">{person.title || "Colaborador"}</strong><small className="table-sub">{person.accessRole ? accessLabel[person.accessRole] || person.accessRole : "Sem acesso à console"}</small></td>
                    <td><strong className="table-primary">{teamName(person.teamId)}</strong><small className="table-sub">{scheduleName(person.scheduleId)}</small></td>
                    <td><strong className="table-primary">{person.host ? person.device : "Não vinculado"}</strong><small className="table-sub">{person.host ? person.platform : "Aguardando agente"}</small></td>
                    <td>
                      <span className={`pill ${person.status}`}>
                        {person.status}
                      </span>
                    </td>
                    <td className="num">{duration(person.trackedSeconds)}</td>
                    <td className="num">{person.focusScore}%</td>
                    <td>{date(person.lastSeen)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager
            page={safePage}
            pageCount={pageCount}
            total={people.length}
            onPage={setPage}
          />
        </>
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
              {current.accessRole && <span className="access-tag">{accessLabel[current.accessRole] || current.accessRole}</span>}
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
                {current.sessionUser ? ` · sessão: ${current.sessionUser}` : ""}
                {current.observedIp ? ` · IP: ${current.observedIp}` : ""}
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
              <div>
                <dt>Jornada esperada</dt>
                <dd>{duration(current.expectedSeconds || 0)}</dd>
              </div>
              <div>
                <dt>Índice na jornada</dt>
                <dd>{Math.round(current.productivityIndex || 0)}%</dd>
              </div>
              <div>
                <dt>Aderência</dt>
                <dd>{Math.round(current.scheduleAdherence || 0)}%</dd>
              </div>
              <div>
                <dt>Teclado e mouse</dt>
                <dd>{duration(current.inputSeconds || 0)}</dd>
              </div>
              <div>
                <dt>URLs</dt>
                <dd>{duration(current.webSeconds || 0)}</dd>
              </div>
              <div>
                <dt>Teclas / cliques</dt>
                <dd>{current.presses.toLocaleString("pt-BR")} / {current.clicks.toLocaleString("pt-BR")}</dd>
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
  pool: { essential: number; intelligence: number };
  used: { essential: number; intelligence: number };
  status: string;
  cycleStart: string | null;
  prices: { essential: number; intelligence: number };
  monthlyTotal: number;
  pricingEditable: boolean;
  poolEditable: boolean;
  features: { intelligence: boolean };
  plans: { id: string; name: string; price: number; features: string[] }[];
  limits: { people: number; devices: number; retentionDays: number };
};
const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
function Billing({ d }: { d: Data }) {
  void d;
  const [b, setB] = useState<BillingData | null>(null);
  const [essential, setEssential] = useState("");
  const [intelligence, setIntelligence] = useState("");
  const [peopleLimit, setPeopleLimit] = useState("");
  const [deviceLimit, setDeviceLimit] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const load = useCallback(async () => {
    const r = await fetch("/platform-api/dashboard/billing", {
      credentials: "same-origin",
    });
    if (r.ok) {
      const x: BillingData = await r.json();
      setB(x);
      setEssential(String(x.pool.essential));
      setIntelligence(String(x.pool.intelligence));
      setPeopleLimit(String(x.limits.people)); setDeviceLimit(String(x.limits.devices));
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
  const bar = (used: number, pool: number) =>
    Math.min(100, pool ? (used / pool) * 100 : 0);
  return (
    <div className="page-stack">
      <div className="section-summary">
        <strong>{brl(b.monthlyTotal)}/mês</strong>
        <span>
          Pool: {b.pool.essential} Essential + {b.pool.intelligence} Intelligence
          · em uso {b.used.essential}/{b.used.intelligence} ·{" "}
          {b.status === "active" ? "assinatura ativa" : "em avaliação (trial)"}.
        </span>
      </div>
      <article className="card">
        <div className="card-head">
          <div>
            <h2>Licenças contratadas (pool)</h2>
            <p>
              {b.poolEditable
                ? "Só o super admin define os pools."
                : "Definido pela Synova."}{" "}
              Os admins atribuem as licenças por pessoa em Pessoas.
            </p>
          </div>
          {saved && <span className="saved-flag">Salvo ✓</span>}
        </div>
        <div className="pool-grid">
          {(["essential", "intelligence"] as const).map((k) => (
            <div className="pool-item" key={k}>
              <div className="pool-label">
                <span className={`lic-tag ${k}`}>
                  {k === "essential" ? "Essential" : "Intelligence · IA"}
                </span>
                <span className="pool-price">{brl(b.prices[k])}/assento</span>
              </div>
              <div className="seats-bar">
                <b
                  className={b.used[k] > b.pool[k] ? "over" : ""}
                  style={{ width: `${bar(b.used[k], b.pool[k])}%` }}
                />
              </div>
              <div className="pool-usage">
                {b.used[k]} de {b.pool[k]} em uso
                {b.used[k] > b.pool[k] ? " · acima do contratado" : ""}
              </div>
              {b.poolEditable && (
                <input
                  type="number"
                  min={0}
                  value={k === "essential" ? essential : intelligence}
                  onChange={(e) =>
                    k === "essential"
                      ? setEssential(e.target.value)
                      : setIntelligence(e.target.value)
                  }
                />
              )}
            </div>
          ))}
        </div>
        {b.poolEditable && (
          <button
            className="primary"
            disabled={busy}
            onClick={() =>
              update({
                pool: {
                  essential: Number(essential) || 0,
                  intelligence: Number(intelligence) || 0,
                },
              })
            }
          >
            {busy ? "Salvando…" : "Salvar pools"}
          </button>
        )}
      </article>
      {b.poolEditable && <article className="card inline-form"><div><h2>Limites do tenant</h2><p>Controle de capacidade contratada e retenção.</p></div><label>Pessoas<input type="number" min="0" value={peopleLimit} onChange={e => setPeopleLimit(e.target.value)} /></label><label>Dispositivos<input type="number" min="0" value={deviceLimit} onChange={e => setDeviceLimit(e.target.value)} /></label><button className="primary" onClick={() => update({ limits: { people: Number(peopleLimit) || 0, devices: Number(deviceLimit) || 0, retentionDays: b.limits.retentionDays } })}>Salvar limites</button></article>}
      <div className="plan-grid">
        {b.plans.map((pl) => (
          <article
            className={`card plan-card${pl.id === "intelligence" && b.features.intelligence ? " current" : ""}`}
            key={pl.id}
          >
            <div className="plan-head">
              <h2>{pl.name}</h2>
              <span className="pill offline">
                {b.used[pl.id as "essential" | "intelligence"]} em uso
              </span>
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
          </article>
        ))}
      </div>
      <article
        className={`card gate-card${b.features.intelligence ? " unlocked" : ""}`}
      >
        <div className="card-head">
          <div>
            <h2>TimeWatcher Intelligence (IA)</h2>
            <p>
              {b.features.intelligence
                ? `Ativo — ${b.pool.intelligence} licença(s) Intelligence no pool.`
                : "Sem licenças Intelligence no pool."}
            </p>
          </div>
          <span
            className={`pill ${b.features.intelligence ? "online" : "offline"}`}
          >
            {b.features.intelligence ? "Ativo" : "Bloqueado"}
          </span>
        </div>
        <p className="settings-copy">
          A IA analisa apenas pessoas com licença Intelligence atribuída; quem usa
          o chat/IA são admins e gestores.
          {b.poolEditable && !b.features.intelligence
            ? " Adicione licenças Intelligence ao pool para habilitar."
            : ""}
        </p>
      </article>
      {b.pricingEditable && (
        <PriceEditor
          prices={b.prices}
          busy={busy}
          onSave={(prices) => update({ prices })}
        />
      )}
      <p className="billing-note">
        Cobrança administrada pela Synova. O super admin define os pools de
        licença; os admins atribuem por pessoa.
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
          <h2>TimeWatcher Intelligence (IA)</h2>
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
        <strong>TimeWatcher Intelligence</strong>
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
        {open ? (
          "×"
        ) : (
          <img src="/timewatcher-logo.png" alt="" className="chat-fab-logo" />
        )}
      </button>
      {open && (
        <div className="chat-widget">
          <div className="chat-widget-head">
            <div>
              <strong>Assistente TimeWatcher</strong>
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
function Operations({ d }: { d: Data }) {
  const [op, setOp] = useState<any>(null);
  useEffect(() => { fetch("/platform-api/dashboard/operations", { credentials: "same-origin", cache: "no-store" }).then(r => r.ok ? r.json() : null).then(setOp).catch(() => {}); }, []);
  if (!op) return <State text="Carregando saúde operacional…" />;
  return <div className="page-stack">
    <div className="section-summary"><strong>Saúde operacional</strong><span>Ingestão, armazenamento, agentes e trilha administrativa em tempo real.</span></div>
    <div className="metric-grid"><Metric label="Buckets ativos" value={String(op.ingest.buckets)} note={`${op.ingest.hosts} dispositivos identificados`} /><Metric label="Serviço de ingestão" value="Online" note="API recebendo eventos" /><Metric label="Alertas abertos" value={String(op.alerts.counts.total)} note={`${op.alerts.counts.critical} críticos`} /></div>
    <article className="card"><div className="card-head"><div><h2>Prontidão para produção</h2><p>Controles avaliados com base no inventário e nas configurações reais do tenant.</p></div></div><div className="activity-feed">{(op.readiness?.checks || []).map((item: any) => <div className="activity-row" key={item.id}><span className={`pill ${item.ok ? "online" : "offline"}`}>{item.ok ? "OK" : "Pendente"}</span><span className="activity-what"><strong>{item.label}</strong><small>{item.detail}</small></span></div>)}</div></article>
    <article className="card"><div className="card-head"><div><h2>Logs administrativos</h2><p>Últimas ações administrativas auditadas</p></div></div><div className="activity-feed">{(op.audit || []).map((e: any, i: number) => <div className="activity-row" key={i}><span className="activity-time">{date(e.ts)}</span><span className="activity-what"><strong>{e.action}</strong> · {e.actor}</span><span className="activity-dur">OK</span></div>)}</div></article>
  </div>;
}
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
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
        <div className="ou-tree card">
          {ordered.map(({ team, depth }) => {
            const isOpen = open.has(team.id);
            const outside = (td?.people || []).filter(
              (p) => p.teamId !== team.id,
            );
            return (
              <div className="ou-node" key={team.id}>
                <button
                  className={`ou-row${isOpen ? " open" : ""}`}
                  style={{ paddingLeft: `${16 + depth * 22}px` }}
                  onClick={() => toggle(team.id)}
                  aria-expanded={isOpen}
                >
                  <span className="ou-caret" aria-hidden>
                    <Icon name="chevron" />
                  </span>
                  <span className="ou-ico" aria-hidden>
                    <Icon name="teams" />
                  </span>
                  <span className="ou-name">{team.name}</span>
                  <span className="ou-manager">
                    {team.managerName || team.managerEmail || "Sem gestor"}
                  </span>
                  <span className="ou-count">{team.memberCount}</span>
                </button>
                {isOpen && (
                  <div
                    className="ou-body"
                    style={{ paddingLeft: `${38 + depth * 22}px` }}
                  >
                    {team.members.length ? (
                      <ul className="ou-members">
                        {team.members.map((m) => (
                          <li key={m.id}>
                            <span className="avatar tiny">
                              {initials(m.name)}
                            </span>
                            <span className="ou-member-name">{m.name}</span>
                            {canManage && (
                              <button
                                className="ou-member-x"
                                title="Remover da OU"
                                onClick={() => assign(m.id, null)}
                              >
                                Remover
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="ou-empty">Sem pessoas nesta OU.</p>
                    )}
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
                  </div>
                )}
              </div>
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
  const [q, setQ] = useState(""); const [statusFilter, setStatusFilter] = useState("all"); const [page, setPage] = useState(0); const [selected, setSelected] = useState<string | null>(null); const [directory, setDirectory] = useState<Directory | null>(null);
  const [releasePlatform, setReleasePlatform] = useState("macos"); const [releaseVersion, setReleaseVersion] = useState(""); const [releaseUrl, setReleaseUrl] = useState(""); const [releaseSha, setReleaseSha] = useState("");
  const canManage =
    d.viewer.role === "super_admin" || d.viewer.role === "org_admin";
  useEffect(() => { const query = new URLSearchParams({ period: d.period, scope: d.scope || "default", tenant: d.tenant.id }); fetch(`/platform-api/dashboard/people?${query}`, { credentials: "same-origin", cache: "no-store" }).then(r => r.ok ? r.json() : null).then(setDirectory).catch(() => setDirectory(null)); }, [d.period, d.scope, d.tenant.id, d.generatedAt]);
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
  async function remove(host: string) {
    if (!confirm(`Remover ${host} da plataforma? O agente será bloqueado e o vínculo do colaborador será apagado. O histórico não será exibido.`)) return;
    setBusy(host);
    await fetch("/platform-api/dashboard/devices/delete", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ host }) });
    setBusy(""); reload();
  }
  async function updatePolicy(patch: object) {
    await fetch("/platform-api/dashboard/agent-update-policy", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ ...(d.agentFleet?.policy || {}), ...patch }) }); reload();
  }
  async function updateAll() {
    if (!confirm("Solicitar a atualização de todos os agentes desatualizados deste tenant?")) return;
    const response = await fetch("/platform-api/dashboard/agent-update-all", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: "{}" });
    const result = await response.json(); alert(`${result.requested || 0} agente(s) receberam a solicitação.`); reload();
  }
  async function publishRelease() {
    const response = await fetch("/platform-api/dashboard/agent-releases", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ platform: releasePlatform, version: releaseVersion, url: releaseUrl, sha256: releaseSha }) });
    if (!response.ok) { alert("Informe versão, URL HTTPS e SHA-256 válido com 64 caracteres."); return; }
    setReleaseVersion(""); setReleaseUrl(""); setReleaseSha(""); reload();
  }
  const filtered = d.devices.filter((device) => `${device.name} ${device.id} ${device.personName || ""} ${device.inventory?.sessionUser || ""} ${device.observedIp || ""}`.toLowerCase().includes(q.trim().toLowerCase()) && (statusFilter === "all" || (statusFilter === "online" ? !device.blocked && device.health === "online" : statusFilter === "attention" ? device.blocked || device.health !== "online" || ["failed", "permission_required", "outdated"].includes(device.updateStatus || "") : true)));
  const perPage = 20; const pages = Math.max(1, Math.ceil(filtered.length / perPage)); const safePage = Math.min(page, pages - 1); const shown = filtered.slice(safePage * perPage, safePage * perPage + perPage); const current = d.devices.find((device) => device.id === selected) || null;
  useEffect(() => setPage(0), [q]);
  const onlineCount = d.devices.filter(x => !x.blocked && x.health === "online").length;
  const linkedCount = d.devices.filter(x => x.personName).length;
  const attentionCount = d.devices.filter(x => x.blocked || x.health !== "online" || ["failed", "permission_required", "outdated"].includes(x.updateStatus || "")).length;
  return (
    <div className="page-stack">
      <section className="device-commandbar"><div><span className="eyebrow">INVENTÁRIO E TELEMETRIA</span><h2>Dispositivos da organização</h2><p>Abra um equipamento para investigar identidade, coleta, inventário e versão do agente.</p></div><div className="device-command-metrics"><span><strong>{d.devices.length}</strong>Total</span><span><strong>{onlineCount}</strong>Online</span><span><strong>{linkedCount}</strong>Vinculados</span><span className={attentionCount ? "attention" : ""}><strong>{attentionCount}</strong>Atenção</span></div></section>
      {canManage && <details className="fleet-disclosure"><summary><span><strong>Configuração do parque</strong><small>{d.agentFleet?.statuses?.current || 0} atualizado(s) · canal estável {Object.keys(d.agentFleet?.distribution || {}).join(", ") || "não publicado"}</small></span><b>Gerenciar versões e atualização automática</b></summary><div className="fleet-disclosure-body"><div className="fleet-policy"><label><input type="checkbox" checked={d.agentFleet?.policy?.enabled ?? true} onChange={e => updatePolicy({ enabled: e.target.checked })} /> Atualização automática</label><label>Rollout <input type="number" min="0" max="100" value={d.agentFleet?.policy?.rolloutPercent ?? 100} onChange={e => updatePolicy({ rolloutPercent: Number(e.target.value) })} />%</label><label>Consulta a cada <select value={d.agentFleet?.policy?.checkIntervalMinutes ?? 60} onChange={e => updatePolicy({ checkIntervalMinutes: Number(e.target.value) })}><option value="15">15 min</option><option value="60">1 hora</option><option value="360">6 horas</option><option value="1440">24 horas</option></select></label><button className="btn ghost" onClick={updateAll}>Atualizar desatualizados</button></div>{d.viewer.role === "super_admin" && <div className="release-form"><select value={releasePlatform} onChange={e => setReleasePlatform(e.target.value)}><option value="macos">macOS</option><option value="windows">Windows</option></select><input placeholder="Versão (ex.: 0.4.0)" value={releaseVersion} onChange={e => setReleaseVersion(e.target.value)} /><input placeholder="URL HTTPS do pacote" value={releaseUrl} onChange={e => setReleaseUrl(e.target.value)} /><input placeholder="SHA-256" value={releaseSha} onChange={e => setReleaseSha(e.target.value)} /><button className="btn ghost" onClick={publishRelease}>Publicar estável</button></div>}</div></details>}
      <div className="device-toolbar"><input className="people-search" placeholder="Buscar equipamento, pessoa, sessão ou IP…" value={q} onChange={(e) => setQ(e.target.value)} /><div className="device-filter" aria-label="Filtrar dispositivos"><button className={statusFilter === "all" ? "active" : ""} onClick={() => setStatusFilter("all")}>Todos <i>{d.devices.length}</i></button><button className={statusFilter === "online" ? "active" : ""} onClick={() => setStatusFilter("online")}>Online <i>{onlineCount}</i></button><button className={statusFilter === "attention" ? "active" : ""} onClick={() => setStatusFilter("attention")}>Atenção <i>{attentionCount}</i></button></div></div>
      <section className="device-list" aria-label="Lista de dispositivos">{shown.length ? shown.map((x) => { const signals = Object.keys(x.signals || {}).length; return <button type="button" className={`device-row${selected === x.id ? " selected" : ""}`} key={x.id} onClick={() => setSelected(selected === x.id ? null : x.id)}><span className="device-os-icon">{x.platform === "macOS" ? "⌘" : "▣"}</span><span className="device-row-identity"><strong>{x.name}</strong><small>{x.inventory?.model || x.platform} · {x.inventory?.sessionUser || "sem sessão"}</small></span><span className="device-row-owner"><small>Responsável</small><strong>{x.personName || "Não vinculado"}</strong></span><span className="device-row-signal"><small>Coleta</small><strong>{signals}/6 sinais</strong><i><b style={{ width: `${signals / 6 * 100}%` }} /></i></span><span className="device-row-agent"><small>Agente</small><strong>v{x.version || "—"}</strong><em>{x.updateStatus === "current" ? "Atualizado" : x.updateStatus || "Não gerenciado"}</em></span><span className="device-row-seen"><small>Último sinal</small><strong>{date(x.lastSeen)}</strong></span><span className={`pill ${x.blocked ? "offline" : x.health === "online" ? "online" : "offline"}`}>{x.blocked ? "Revogado" : HEALTH_LABEL[x.health || x.status]}</span><span className="device-row-arrow">→</span></button>; }) : <State text="Nenhum dispositivo corresponde aos filtros." />}</section><Pager page={safePage} pageCount={pages} total={filtered.length} onPage={setPage} />
      {current && <DeviceDetail d={current} person={directory?.people.find(p => p.host === current.id) || null} canManage={canManage} busy={busy === current.id} onToggleBlock={() => toggleBlock(current.id, !current.blocked)} onRemove={() => remove(current.id)} onUpdated={reload} onClose={() => setSelected(null)} />}
    </div>
  );
}
function DeviceDetail({
  d,
  person,
  canManage,
  busy,
  onToggleBlock,
  onRemove,
  onUpdated,
  onClose,
}: {
  d: Device;
  person: DirPerson | null;
  canManage: boolean;
  busy: boolean;
  onToggleBlock: () => void;
  onRemove: () => void;
  onUpdated: () => void;
  onClose: () => void;
}) {
  const health = d.blocked ? "offline" : d.health || d.status;
  const [name, setName] = useState(d.name);
  const [tab, setTab] = useState<"overview" | "collection" | "inventory" | "software" | "manage">("overview");
  const signalLabels: Record<string, string> = { window: "Aplicativos e janelas", afk: "Atividade/ociosidade", input: "Teclado e mouse", web: "URLs e navegador", screenshots: "Capturas de tela", heartbeat: "Saúde do agente" };
  async function update(patch: object) { const response = await fetch("/platform-api/dashboard/devices/update", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ host: d.id, ...patch }) }); if (!response.ok) { const result = await response.json(); alert(result.error === "stable_release_not_published" ? `Publique primeiro uma versão estável para ${result.platform}.` : "Não foi possível atualizar o dispositivo."); return; } onUpdated(); }
  return (
    <article className={`card device-detail device-workspace${d.blocked ? " blocked" : ""}`}>
      <div className="device-icon">{d.platform === "macOS" ? "⌘" : "▣"}</div>
      <div><span className="eyebrow">DETALHE DO EQUIPAMENTO</span><h3>{d.name}</h3><p>{d.inventory?.model || d.platform} · {d.personName || "sem responsável"} · host {d.id}</p></div>
      <div className="head-actions"><button className="btn ghost" onClick={onClose}>Fechar</button><span className={`pill ${d.blocked ? "offline" : health === "online" ? "online" : "offline"}`}>
        {d.blocked ? "revogado" : HEALTH_LABEL[health] || d.status}
      </span></div>
      <nav className="device-tabs"><button className={tab === "overview" ? "active" : ""} onClick={() => setTab("overview")}>Visão geral</button><button className={tab === "collection" ? "active" : ""} onClick={() => setTab("collection")}>Coleta</button><button className={tab === "inventory" ? "active" : ""} onClick={() => setTab("inventory")}>Inventário</button><button className={tab === "software" ? "active" : ""} onClick={() => setTab("software")}>Softwares</button>{canManage && <button className={tab === "manage" ? "active" : ""} onClick={() => setTab("manage")}>Gerenciar</button>}</nav>
      {tab === "overview" && <div className="device-panel"><div className="device-summary-grid"><div><span>Responsável</span><strong>{d.personName || "Não vinculado"}</strong><small>{d.personEmail || d.inventory?.sessionUser || "Sem identidade"}</small></div><div><span>Última sincronização</span><strong>{date(d.lastSeen)}</strong><small>{d.health === "online" ? "Recebendo dados agora" : "Coleta interrompida"}</small></div><div><span>Uso monitorado</span><strong>{duration(person?.trackedSeconds || 0)}</strong><small>{duration(person?.activeSeconds || 0)} ativo</small></div><div><span>Web e interação</span><strong>{duration(person?.webSeconds || 0)}</strong><small>{(person?.presses || 0).toLocaleString("pt-BR")} teclas · {(person?.clicks || 0).toLocaleString("pt-BR")} cliques</small></div></div><div className="device-health-callout"><span className={`health-orb ${health}`}/><div><strong>{health === "online" ? "Equipamento coletando normalmente" : "Equipamento precisa de atenção"}</strong><p>{Object.keys(d.signals || {}).length} de 6 tipos de sinal identificados · agente v{d.version || "desconhecida"} · {d.updateStatus === "current" ? "versão atual" : d.updateStatus || "versão não gerenciada"}</p></div></div></div>}
      {tab === "collection" && <div className="device-panel"><div className="collection-grid">{Object.entries(signalLabels).map(([key, label]) => { const timestamp = d.signals?.[key]; return <div className={timestamp ? "ok" : "missing"} key={key}><span className="signal-dot"/><div><strong>{label}</strong><small>{timestamp ? `Último envio ${date(timestamp)}` : "Nenhum sinal no período"}</small></div><em>{timestamp ? "Ativo" : "Pendente"}</em></div>; })}</div><div className="collection-notes"><strong>Integridade da coleta</strong><p>Os horários representam o último dado recebido por sensor. Ausência de um sinal pode indicar permissão do sistema operacional, navegador sem atividade ou módulo desativado.</p></div></div>}
      {tab === "inventory" && <div className="device-panel"><dl className="inventory-grid"><div><dt>Hostname</dt><dd>{d.id}</dd></div><div><dt>Usuário da sessão</dt><dd>{d.inventory?.sessionUser || "Não identificado"}</dd></div><div><dt>IP público observado</dt><dd>{d.observedIp || "—"}</dd></div><div><dt>IP local</dt><dd>{d.inventory?.localIp || "—"}</dd></div><div><dt>Sistema operacional</dt><dd>{d.inventory?.os || d.platform} {d.inventory?.osVersion}</dd></div><div><dt>Modelo</dt><dd>{d.inventory?.model || "Aguardando inventário"}</dd></div><div><dt>Arquitetura</dt><dd>{d.inventory?.architecture || "—"}</dd></div><div><dt>Memória</dt><dd>{d.inventory?.memoryGB ? `${d.inventory.memoryGB} GB` : "—"}</dd></div></dl></div>}
      {tab === "software" && <div className="device-panel device-software"><div className="software-head"><div><strong>Softwares instalados</strong><p>Inventário informado pelo agente para diagnóstico e conformidade.</p></div><span>{d.software?.length || 0} itens</span></div>{d.software?.length ? <div className="software-grid">{d.software.map(item => <span key={item}>{item}</span>)}</div> : <State text="Aguardando o próximo inventário de software." />}</div>}
      {tab === "manage" && canManage && (
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
          <div className="device-inline-edit"><input value={name} onChange={e => setName(e.target.value)} /><button className="btn ghost" onClick={() => update({ name })}>Renomear</button><button className="btn ghost" onClick={() => update({ requestUpdate: true })}>{d.updateRequested ? "Atualização solicitada" : "Solicitar atualização"}</button><button className="btn ghost danger" disabled={busy} onClick={onRemove}>Remover agente</button></div>
          <div className={`device-update-state ${d.updateStatus || "unmanaged"}`}><strong>Atualização remota</strong><span>Atual: {d.version || "desconhecida"}</span><span>Alvo: {d.targetVersion || "não publicado"}</span><span>Estado: {d.updateStatus || "não gerenciado"}</span><span>Consulta: {d.lastUpdateCheckAt ? date(d.lastUpdateCheckAt) : "aguardando"}</span>{d.updateError && <em>{d.updateError}</em>}</div>
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
              Abra Safari, Chrome, Edge, Brave, Arc ou Vivaldi com o TimeWatcher
              Agent ativo. URLs, títulos, tempo por página e classificação de
              produtividade aparecerão aqui automaticamente.
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
  const pageSize = 10;
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(urls.length / pageSize));
  const safePage = Math.min(page, pages);
  const visible = urls.slice((safePage - 1) * pageSize, safePage * pageSize);
  useEffect(() => setPage(1), [urls.length]);
  return (
    <div>
      <div className="url-table">
        <div className="url-row head">
          <span>Site / página</span>
          <span>Classificação</span>
          <span>Tempo</span>
          <span>% web</span>
        </div>
        {visible.map((u) => (
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
      {pages > 1 && (
        <nav className="table-pagination" aria-label="Paginação de URLs">
          <span>{urls.length} URLs · página {safePage} de {pages}</span>
          <div>
            <button disabled={safePage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Anterior</button>
            <button disabled={safePage === pages} onClick={() => setPage((value) => Math.min(pages, value + 1))}>Próxima</button>
          </div>
        </nav>
      )}
    </div>
  );
}
function Reports({
  d,
  period,
  start,
  end,
  tenant,
  scope,
  reload,
}: {
  d: Data;
  period: Period;
  start: string;
  end: string;
  tenant: string;
  scope: ViewScope;
  reload: () => void;
}) {
  const q = new URLSearchParams({ period, tenant, scope });
  const [previewOpen, setPreviewOpen] = useState(false);
  const [selectedReport, setSelectedReport] = useState("executive");
  const personal = scope === "self" || d.viewer.role === "member" || d.viewer.role === "employee";
  const manager = d.viewer.role === "manager" && !personal;
  const topProductive = d.apps.find((app) => app.classification === "productive");
  const topDomain = d.domains[0];
  if (period === "custom") {
    q.set("start", start);
    q.set("end", end);
  }
  const defaultReports = [
    { id: "executive", title: "Resumo executivo", detail: "Produtividade, jornada e utilização no período.", value: `${d.summary.focusScore}%` },
    { id: "productivity", title: "Produtividade por período", detail: "Tempo produtivo, neutro e não produtivo.", value: duration(d.summary.productiveSeconds) },
    { id: "journey", title: "Aderência à jornada", detail: "Tempo previsto, ativo, atrasos e banco de horas.", value: `${Math.round(d.summary.scheduleAdherence || 0)}%` },
    { id: "applications", title: "Aplicações mais usadas", detail: "Ranking e classificação dos aplicativos.", value: d.apps[0]?.duration || "—" },
    { id: "web", title: "Sites e URLs acessados", detail: "Tempo por domínio, página e classificação.", value: `${d.summary.urlCount} URLs` },
    { id: "interaction", title: "Interações de teclado e mouse", detail: "Cliques, teclas e horários de maior atividade.", value: `${d.input.presses + d.input.clicks}` },
    { id: "idle", title: "Ociosidade e intervalos", detail: "Tempo sem interação e impacto na jornada.", value: duration(d.summary.idleSeconds) },
    { id: "focus", title: "Foco e concentração", detail: "Aplicações produtivas e composição do tempo.", value: `${d.summary.focusScore}%` },
    { id: "devices", title: "Saúde dos dispositivos", detail: "Agentes, última sincronização e versão.", value: `${d.summary.onlineDeviceCount}/${d.summary.deviceCount}` },
    { id: "screens", title: "Evidências de atividade", detail: "Quantidade de capturas autorizadas no período.", value: `${d.summary.screenshotCount}` },
  ];
  const chosen = defaultReports.find((item) => item.id === selectedReport) || defaultReports[0];
  return (
    <div className="page-stack">
      <div className="report-hero">
        <div>
          <span>{personal ? "RELATÓRIO PESSOAL" : manager ? "RELATÓRIO DO TIME" : "RELATÓRIO EXECUTIVO"}</span>
          <h2>{personal ? "Meu resumo de produtividade" : d.tenant.name}</h2>
          <p>
            {new Date(d.range.start).toLocaleDateString("pt-BR")} —{" "}
            {new Date(d.range.end).toLocaleDateString("pt-BR")}
          </p>
        </div>
        <div>
          <button className="report-preview-button" onClick={() => setPreviewOpen(true)}>Visualizar relatório</button>
          <a href={`/platform-api/dashboard/export.csv?${q}`}>Exportar CSV</a>
          <a href={`/platform-api/dashboard/export.json?${q}`}>Exportar JSON</a>
        </div>
      </div>
      <section className="default-reports"><div className="default-reports-head"><div><span>RELATÓRIOS PADRÃO</span><h2>Escolha uma análise para o período selecionado</h2><p>Os 10 relatórios abaixo são calculados com os dados reais do filtro atual.</p></div><button className="text-button" onClick={() => setPreviewOpen(true)}>Abrir {chosen.title} →</button></div><div className="report-template-grid">{defaultReports.map((item) => <button key={item.id} className={selectedReport === item.id ? "selected" : ""} onClick={() => { setSelectedReport(item.id); setPreviewOpen(true); }}><span>{item.title}</span><b>{item.value}</b><small>{item.detail}</small></button>)}</div></section>
      <div className="metrics dense-metrics">
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
        <Metric label="Interações" value={`${d.input.presses.toLocaleString("pt-BR")} / ${d.input.clicks.toLocaleString("pt-BR")}`} note="teclas / cliques" />
        <Metric label="Jornada" value={`${Math.round(d.summary.scheduleAdherence || 0)}%`} note={`${duration(d.summary.scheduledActiveSeconds || 0)} dentro da jornada`} />
      </div>
      <div className="report-insight-grid">
        <article className="card report-insight"><span>SINAL DE FOCO</span><h2>{topProductive?.name || "Sem classificação produtiva"}</h2><p>{topProductive ? `${topProductive.duration} no principal aplicativo produtivo.` : "Defina classificações para transformar o uso em indicador."}</p></article>
        <article className="card report-insight"><span>MAIOR CONSUMO WEB</span><h2>{topDomain?.domain || "Sem URLs"}</h2><p>{topDomain ? `${topDomain.duration} · ${topDomain.classification === "productive" ? "produtivo" : topDomain.classification === "unproductive" ? "não produtivo" : "neutro"}.` : "Aguardando telemetria do navegador."}</p></article>
        <article className="card report-insight"><span>QUALIDADE DA JORNADA</span><h2>{duration(d.summary.idleSeconds)} ocioso</h2><p>{d.schedule ? `${d.schedule.name}: ${d.schedule.start}–${d.schedule.end}.` : "Sem jornada atribuída ao escopo."}</p></article>
      </div>
      {(d.viewer.role === "super_admin" || d.viewer.role === "org_admin") && <div className="report-admin-grid"><ReportScheduling d={d} /><MonthlyClosing d={d} reload={reload} /></div>}
      <div className="grid-bottom report-breakdown">
        <article className="card">
          <div className="card-head"><div><h2>Composição do tempo</h2><p>Aplicações que explicam o período selecionado.</p></div></div>
          <AppTable apps={d.apps.slice(0, 6)} />
        </article>
        <article className="card">
          <div className="card-head"><div><h2>Uso web para decisão</h2><p>Principais domínios — a lista integral fica em Atividades.</p></div></div>
          {d.urls.length ? (
            <UrlTable urls={d.urls.slice(0, 5)} />
          ) : (
            <State text="Aguardando telemetria web." />
          )}
        </article>
      </div>
      {previewOpen && <ReportPreview d={d} personal={personal} manager={manager} report={chosen} onClose={() => setPreviewOpen(false)} />}
    </div>
  );
}
function ReportPreview({ d, personal, manager, report, onClose }: { d: Data; personal: boolean; manager: boolean; report: { title: string; detail: string }; onClose: () => void }) {
  const reportTitle = report.title === "Resumo executivo" ? (personal ? "Relatório pessoal de produtividade" : manager ? "Relatório do time" : "Relatório executivo") : report.title;
  const [contributors, setContributors] = useState<DirPerson[]>([]);
  useEffect(() => { const q = new URLSearchParams({ period: d.period, scope: d.scope || "default" }); fetch(`/platform-api/dashboard/people?${q}`, {credentials:"same-origin", cache:"no-store"}).then(r => r.ok ? r.json() : null).then(x => setContributors(x?.people || [])).catch(() => setContributors([])); }, [d.period, d.scope, d.generatedAt]);
  return <div className="report-preview-backdrop" role="dialog" aria-modal="true" aria-label="Prévia do relatório"><section className="report-preview"><header><div><span>TIMEWATCHER · RELATÓRIO RENDERIZADO</span><h2>{reportTitle}</h2><p>{report.detail} · {d.tenant.name} · {new Date(d.range.start).toLocaleDateString("pt-BR")} — {new Date(d.range.end).toLocaleDateString("pt-BR")}</p></div><div><button onClick={() => window.print()}>Imprimir / PDF</button><button className="close-preview" onClick={onClose}>Fechar</button></div></header><div className="preview-kpis"><div><span>Monitorado</span><b>{duration(d.summary.trackedSeconds)}</b></div><div><span>Ativo</span><b>{duration(d.summary.activeSeconds)}</b></div><div><span>Produtivo</span><b>{duration(d.summary.productiveSeconds)}</b></div><div><span>Produtividade</span><b>{d.summary.focusScore}%</b></div><div><span>Jornada</span><b>{Math.round(d.summary.scheduleAdherence || 0)}%</b></div></div><div className="preview-columns"><article><h3>Aplicações principais</h3>{d.apps.length ? d.apps.slice(0, 8).map(x => <div className="preview-row" key={x.name}><span>{x.name}<small>{x.classification === "productive" ? "Produtivo" : x.classification === "unproductive" ? "Não produtivo" : "Neutro"}</small></span><b>{x.duration}</b></div>) : <p>Sem aplicações no período.</p>}</article><article><h3>Sites e URLs principais</h3>{d.urls.length ? d.urls.slice(0, 8).map(x => <div className="preview-row" key={x.url}><span>{x.domain}<small>{x.title || x.classification}</small></span><b>{x.duration}</b></div>) : <p>Sem URLs no período.</p>}</article></div>{contributors.length > 0 && <article className="preview-contributors"><h3>Colaboradores que geraram atividades</h3>{contributors.slice(0, 15).map(person => <div className="preview-row" key={person.id}><span><b>{person.name}</b><small>{person.device} · sessão {person.sessionUser || "não identificada"} · {person.topUrls?.[0]?.domain || person.topApps?.[0]?.name || "sem atividade"}</small></span><b>{duration(person.activeSeconds)} ativo</b></div>)}</article>}<footer>Dados gerados em {date(d.generatedAt)} · fonte: agentes vinculados e telemetria autorizada.</footer></section></div>;
}
function ReportScheduling({ d }: { d: Data }) {
  const [items, setItems] = useState<{id: string; email: string; frequency: string; deliveryStatus?: string; lastSentAt?: string}[]>([]);
  const [email, setEmail] = useState(d.viewer.username); const [frequency, setFrequency] = useState("weekly"); const [notice, setNotice] = useState("");
  const load = useCallback(() => fetch("/platform-api/dashboard/report-schedules", { credentials: "same-origin" }).then(r => r.ok ? r.json() : null).then(x => setItems(x?.schedules || [])).catch(() => {}), []);
  useEffect(() => { load(); }, [load]);
  const create = async () => { const r = await fetch("/platform-api/dashboard/report-schedules", { method: "POST", headers: {"Content-Type":"application/json"}, credentials: "same-origin", body: JSON.stringify({ email, frequency, period: "7d" }) }); setNotice(r.ok ? "Agendamento salvo. O relatório será enviado por link seguro quando o provedor de e-mail estiver configurado." : "Não foi possível salvar o agendamento."); if (r.ok) load(); };
  return <article className="card report-admin"><h2>Relatórios agendados</h2><p>Entrega por e-mail de link seguro; a telemetria permanece na plataforma.</p><div className="inline-form"><input type="email" value={email} onChange={e=>setEmail(e.target.value)} /><select value={frequency} onChange={e=>setFrequency(e.target.value)}><option value="daily">Diário</option><option value="weekly">Semanal</option><option value="monthly">Mensal</option></select><button className="primary" onClick={create}>Agendar</button></div>{notice && <small>{notice}</small>}<div className="activity-feed">{items.length ? items.map(x=><div className="activity-row" key={x.id}><span className="activity-what"><strong>{x.frequency === "daily" ? "Diário" : x.frequency === "weekly" ? "Semanal" : "Mensal"}</strong> · {x.email}</span><span className="activity-dur">{x.deliveryStatus === "waiting_mail_provider" ? "Aguardando e-mail" : x.lastSentAt ? `Enviado ${date(x.lastSentAt)}` : "Programado"}</span></div>) : <span className="muted">Nenhum agendamento ativo.</span>}</div></article>;
}
function MonthlyClosing({ d, reload }: { d: Data; reload: () => void }) {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7)); const [state, setState] = useState<{preview?: any; closing?: any} | null>(null); const [notice, setNotice] = useState("");
  const load = useCallback(() => fetch(`/platform-api/dashboard/monthly-closing?month=${month}`, {credentials:"same-origin"}).then(r=>r.ok?r.json():null).then(setState).catch(()=>setState(null)), [month]);
  useEffect(()=>{load();},[load]);
  const close = async (action?: string) => { const r = await fetch("/platform-api/dashboard/monthly-closing", {method:"POST",headers:{"Content-Type":"application/json"},credentials:"same-origin",body:JSON.stringify({month,action})}); setNotice(r.ok ? (action ? "Mês reaberto para ajustes." : "Mês fechado com snapshot auditável.") : "Não foi possível atualizar o fechamento."); if(r.ok){load();reload();} };
  const x = state?.closing || state?.preview;
  return <article className="card report-admin"><h2>Fechamento mensal</h2><p>Consolida jornada, banco de horas, atrasos e produtividade a partir da telemetria real.</p><div className="inline-form"><input type="month" value={month} onChange={e=>setMonth(e.target.value)} />{state?.closing ? <button onClick={()=>close("reopen")}>Reabrir</button> : <button className="primary" onClick={()=>close()}>Fechar mês</button>}</div>{x && <div className="closing-stats"><span><b>{duration(x.activeSeconds || 0)}</b> ativo</span><span><b>{duration(x.expectedSeconds || 0)}</b> previsto</span><span><b>{duration(x.bankSeconds || 0)}</b> banco</span><span><b>{Math.round(x.scheduleAdherence || 0)}%</b> aderência</span></div>}{notice && <small>{notice}</small>}</article>;
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
      <ScheduleAdmin d={d} />
      {(d.viewer.role === "super_admin" || d.viewer.role === "org_admin") && <ScimProvisioning d={d} />}
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
function ScimProvisioning({ d }: { d: Data }) {
  const [token, setToken] = useState(""); const [busy, setBusy] = useState(false);
  const create = async () => { setBusy(true); const r = await fetch("/platform-api/dashboard/scim/tokens", {method:"POST",headers:{"Content-Type":"application/json"},credentials:"same-origin",body:JSON.stringify({name:"Google / Microsoft Entra SCIM"})}); const x = await r.json().catch(()=>({})); setToken(x.token || ""); setBusy(false); };
  return <article className="card"><div className="card-head"><div><h2>Provisionamento SCIM</h2><p>Sincronize pessoas de Google Workspace ou Microsoft Entra ID via padrão SCIM 2.0.</p></div><button className="primary" disabled={busy} onClick={create}>{busy ? "Gerando…" : "Gerar token SCIM"}</button></div><p className="settings-copy">Configure no seu IdP o endpoint <code>https://timewatcher.32-193-139-223.sslip.io/scim/v2</code>. Usuários criados ou desativados no IdP são refletidos no cadastro da organização.</p>{token && <div className="invite-link"><strong>Token SCIM — copie agora; ele não será mostrado novamente.</strong><code>{token}</code></div>}</article>;
}
function ScheduleAdmin({ d }: { d: Data }) {
  const [name, setName] = useState(""); const [start, setStart] = useState("09:00"); const [end, setEnd] = useState("18:00"); const [tz, setTz] = useState("America/Sao_Paulo"); const [holidays, setHolidays] = useState(""); const [shifts, setShifts] = useState(""); const [tolerance, setTolerance] = useState("0"); const [bankHours, setBankHours] = useState(false); const [approvalRequired, setApprovalRequired] = useState(true); const [saved, setSaved] = useState(false);
  async function save() { if (!name.trim()) return; const parsedShifts = shifts.split(/[,\n]/).map(x => x.trim()).filter(Boolean).map(x => { const [a,b] = x.split("-").map(v => v.trim()); return { start: a, end: b, breakMinutes: 0 }; }).filter(x => /^\d\d:\d\d$/.test(x.start) && /^\d\d:\d\d$/.test(x.end)); await fetch("/platform-api/dashboard/schedules", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ name, start, end, timezone: tz, holidays: holidays.split(/[,\n]/).map(x => x.trim()).filter(Boolean), shifts: parsedShifts, toleranceMinutes: Number(tolerance) || 0, bankHours, approvalRequired, weekdays: [1,2,3,4,5], breakMinutes: 60 }) }); setName(""); setSaved(true); setTimeout(() => setSaved(false), 2000); }
  return <article className="card"><div className="card-head"><div><h2>Jornadas da empresa</h2><p>Fuso, turnos, feriados, tolerância, banco de horas e aprovações.</p></div>{saved && <span className="saved-flag">Salvo ✓</span>}</div><div className="person-edit"><label>Nome<input value={name} onChange={e => setName(e.target.value)} placeholder="Comercial · São Paulo" /></label><label>Início<input type="time" value={start} onChange={e => setStart(e.target.value)} /></label><label>Fim<input type="time" value={end} onChange={e => setEnd(e.target.value)} /></label><label>Fuso horário<input value={tz} onChange={e => setTz(e.target.value)} /></label><label>Feriados (AAAA-MM-DD)<input value={holidays} onChange={e => setHolidays(e.target.value)} placeholder="2026-09-07, 2026-12-25" /></label><label>Turnos (08:00-12:00, 13:00-17:00)<input value={shifts} onChange={e => setShifts(e.target.value)} /></label><label>Tolerância (min)<input type="number" min="0" value={tolerance} onChange={e => setTolerance(e.target.value)} /></label><label><input type="checkbox" checked={bankHours} onChange={e => setBankHours(e.target.checked)} /> Banco de horas</label><label><input type="checkbox" checked={approvalRequired} onChange={e => setApprovalRequired(e.target.checked)} /> Aprovar exceções</label><button className="primary" onClick={save}>Criar jornada</button></div><div className="activity-feed">{d.schedules.map(s => <div className="activity-row" key={s.id}><span className="activity-what"><strong>{s.name}</strong> · {s.start}–{s.end} · {s.timezone || "America/Sao_Paulo"}</span><span className="activity-dur">{(s.holidays || []).length} feriado(s)</span></div>)}</div></article>;
}
function Users({ d }: { d: Data }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [mailed, setMailed] = useState(false);
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
      setMailed(!!x.emailSent);
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
      setMailed(!!x.emailSent);
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
        <strong>Acessos à plataforma · {d.tenant.name}</strong>
        <span>
          Quem pode fazer login e com qual papel. O cadastro de colaboradores é
          em Pessoas (e o acesso também pode ser concedido lá).
        </span>
      </div>
      <article className="card">
        <div className="card-head">
          <div>
            <h2>Convidar acesso direto</h2>
            <p>
              Magic link de 7 dias. Útil para convidar um admin sem cadastrar
              como pessoa.
            </p>
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
            <span>
              {mailed
                ? "Convite enviado por e-mail. Link de backup:"
                : "Magic link — envie para a pessoa:"}
            </span>
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
