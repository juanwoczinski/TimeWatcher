"use client";

import { useCallback, useEffect, useState } from "react";

type Period = "today" | "7d" | "30d" | "custom";
type Section =
  | "Visão geral"
  | "Empresas"
  | "Pessoas"
  | "Dispositivos"
  | "Atividades"
  | "Relatórios"
  | "Instaladores"
  | "Configurações";
type Role = "super_admin" | "org_admin" | "manager" | "employee";
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
const baseNav: { name: Section; icon: string }[] = [
  { name: "Visão geral", icon: "◫" },
  { name: "Empresas", icon: "E" },
  { name: "Pessoas", icon: "P" },
  { name: "Dispositivos", icon: "D" },
  { name: "Atividades", icon: "A" },
  { name: "Relatórios", icon: "R" },
  { name: "Instaladores", icon: "↓" },
  { name: "Configurações", icon: "⚙" },
];
const desc: Record<Section, string> = {
  "Visão geral": "Produtividade, aderência e uso do tempo com dados reais.",
  Empresas: "Governança multiempresa controlada pela Synova.",
  Pessoas: "Jornada, atividade, ativos e capturas por colaborador.",
  Dispositivos: "Inventário e saúde dos computadores vinculados.",
  Atividades: "Aplicativos, URLs, janelas, atividade e ociosidade.",
  Relatórios: "Filtros e exportações para análise operacional.",
  Instaladores: "Distribuição individual ou em massa vinculada ao tenant.",
  Configurações: "Políticas de coleta, classificação e privacidade.",
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

export default function Dashboard() {
  const [active, setActive] = useState<Section>("Visão geral"),
    [period, setPeriod] = useState<Period>("today"),
    [start, setStart] = useState(""),
    [end, setEnd] = useState(""),
    [tenant, setTenant] = useState(""),
    [data, setData] = useState<Data | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
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
  const nav = baseNav.filter(
    (n) => n.name !== "Empresas" || data?.viewer.role === "super_admin",
  );
  const tenantName = data?.tenant.name || "TimeWatcher";
  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <img src="/timewatcher-logo.png" alt="" />
          <div>
            <strong>TimeWatcher</strong>
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
            >
              <span>{n.icon}</span>
              {n.name}
              {n.name === "Dispositivos" && (
                <b>{data?.summary.deviceCount ?? "—"}</b>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="avatar">TW</div>
          <div>
            <strong>{data?.viewer.name || "TimeWatcher"}</strong>
            <span>
              {data?.viewer.role === "super_admin"
                ? "Super admin Synova"
                : "Admin da organização"}
            </span>
          </div>
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
}: {
  active: Section;
  data: Data;
  setActive: (v: Section) => void;
  period: Period;
  start: string;
  end: string;
  tenant: string;
  reload: () => void;
}) {
  if (active === "Visão geral") return <Overview d={data} go={setActive} />;
  if (active === "Empresas") return <Companies d={data} reload={reload} />;
  if (active === "Pessoas") return <People d={data} reload={reload} />;
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
  return <Settings d={data} />;
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
function People({ d, reload }: { d: Data; reload: () => void }) {
  const p = d.person,
    [schedule, setSchedule] = useState(
      p.scheduleId || d.schedules[0]?.id || "",
    );
  async function apply() {
    await fetch("/platform-api/dashboard/people/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        personIds: d.people.map((x) => x.id),
        scheduleId: schedule,
      }),
    });
    reload();
  }
  const device = d.devices[0];
  return (
    <div className="page-stack">
      <article className="card data-card">
        <div className="card-head">
          <div>
            <h2>{p.name}</h2>
            <p>{p.role} · dados dos ativos atribuídos</p>
          </div>
          <span className={`pill ${p.status}`}>{p.status}</span>
        </div>
        <div className="person-detail">
          <div className="avatar large">JK</div>
          <div>
            <h3>{p.name}</h3>
            <p>{p.deviceCount} dispositivo(s)</p>
          </div>
          <dl>
            <div>
              <dt>Monitorado</dt>
              <dd>{duration(p.trackedSeconds)}</dd>
            </div>
            <div>
              <dt>Ativo</dt>
              <dd>{duration(p.activeSeconds)}</dd>
            </div>
            <div>
              <dt>Ocioso</dt>
              <dd>{duration(p.idleSeconds)}</dd>
            </div>
            <div>
              <dt>Produtivo</dt>
              <dd>{duration(p.productiveSeconds)}</dd>
            </div>
          </dl>
        </div>
      </article>
      <article className="card schedule-control">
        <div>
          <h2>Jornada de trabalho</h2>
          <p>
            O admin da organização pode aplicar individualmente ou em massa.
          </p>
        </div>
        <select value={schedule} onChange={(e) => setSchedule(e.target.value)}>
          {d.schedules.map((s) => (
            <option value={s.id} key={s.id}>
              {s.name} · {s.start}–{s.end}
            </option>
          ))}
        </select>
        <button className="primary" onClick={apply}>
          Aplicar aos selecionados ({d.people.length})
        </button>
      </article>
      <article className="card">
        <h2>Aplicativos do colaborador</h2>
        <AppTable apps={d.apps} />
      </article>
      {device && <Gallery device={device} person={p.name} tenantId={d.tenant.id} />}
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
              <span className="app-dot" />
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
              <i>{a.name.slice(0, 2).toUpperCase()}</i>
              <strong>{a.name}</strong>
            </span>
            <span>
              <em className={`classification ${a.classification}`}>
                {classLabel[a.classification]}
              </em>
            </span>
            <span>{a.duration}</span>
            <span className="share">
              <b style={{ width: `${a.share}%` }} />
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
            <strong>{u.domain}</strong>
            <small>{u.title || u.url}</small>
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
          <span>PKG</span>
          <h2>macOS individual</h2>
          <p>Para enviar um link ao colaborador e instalar com assistente.</p>
          <a className="download" href="/downloads/TimeWatcher-macOS.pkg">
            Baixar PKG
          </a>
        </article>
        <article className="install-card">
          <span>MSI</span>
          <h2>Windows individual</h2>
          <p>Instalação com interface para o usuário final.</p>
          <a className="download" href="/downloads/TimeWatcher-Windows.msi">
            Baixar MSI
          </a>
        </article>
        <article className="install-card ready">
          <span>TI</span>
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
function Settings({ d }: { d: Data }) {
  return (
    <div className="settings-grid">
      <article className="card">
        <h2>Escopo</h2>
        <dl className="settings-list">
          <div>
            <dt>Empresa</dt>
            <dd>{d.tenant.name}</dd>
          </div>
          <div>
            <dt>Perfil</dt>
            <dd>{d.viewer.role}</dd>
          </div>
          <div>
            <dt>Aplicativos/janelas</dt>
            <dd>Ativo</dd>
          </div>
          <div>
            <dt>URLs</dt>
            <dd>{d.summary.urlCount ? "Ativo" : "Aguardando coletor web"}</dd>
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
