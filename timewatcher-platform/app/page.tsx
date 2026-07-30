"use client";

import { useEffect, useMemo, useState } from "react";

const nav = ["Visão geral", "Pessoas", "Dispositivos", "Capturas", "Instaladores", "Configurações"];
const initials: Record<string, string> = { "Visão geral": "◫", Pessoas: "P", Dispositivos: "D", Capturas: "C", Instaladores: "↓", Configurações: "⚙" };
const people = [
  { name: "Ana Martins", team: "Produto", device: "ANA-MBP-14", status: "Online", focus: "6h 42m", score: 91 },
  { name: "Carlos Nunes", team: "Engenharia", device: "CARLOS-WIN", status: "Online", focus: "7h 08m", score: 94 },
  { name: "Julia Costa", team: "Operações", device: "JULIA-MBP", status: "Pausa", focus: "5h 51m", score: 83 },
  { name: "Rafael Souza", team: "Comercial", device: "RAFAEL-WIN", status: "Offline", focus: "4h 37m", score: 76 },
];

const captures = [
  { user: "Ana Martins", app: "Figma", time: "há 2 min", tone: "cyan" },
  { user: "Carlos Nunes", app: "Visual Studio Code", time: "há 4 min", tone: "violet" },
  { user: "Julia Costa", app: "Google Chrome", time: "há 6 min", tone: "amber" },
  { user: "Rafael Souza", app: "HubSpot", time: "há 11 min", tone: "blue" },
];

export default function Dashboard() {
  const [active, setActive] = useState("Visão geral");
  const [tenant, setTenant] = useState("Synova Tecnologia");
  const [range, setRange] = useState("Hoje");
  const online = useMemo(() => people.filter((p) => p.status === "Online").length, []);

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><img src="/timewatcher-logo.png" alt="" /><div><strong>TimeWatcher</strong><span>Work intelligence</span></div></div>
        <div className="tenant-picker"><span className="tenant-mark">S</span><select value={tenant} onChange={(e) => setTenant(e.target.value)} aria-label="Empresa"><option>Synova Tecnologia</option><option>Orbe Logística</option><option>Norte Labs</option></select><small>Plano Business</small></div>
        <nav aria-label="Navegação principal">{nav.map((item) => <button key={item} className={active === item ? "active" : ""} onClick={() => setActive(item)}><span>{initials[item]}</span>{item}{item === "Dispositivos" && <b>12</b>}</button>)}</nav>
        <div className="sidebar-foot"><div className="avatar">JK</div><div><strong>Juan Kleber</strong><span>Admin da plataforma</span></div><button aria-label="Menu da conta">•••</button></div>
      </aside>

      <section className="workspace">
        <header><div><p className="eyebrow">{tenant} · {active}</p><h1>{active}</h1><p>{active === "Visão geral" ? "Acompanhe a operação sem perder o contexto humano." : `Gerencie ${active.toLowerCase()} com isolamento por empresa.`}</p></div><div className="header-actions"><button className="icon-button" aria-label="Notificações">●<i /></button><button className="primary">+ Adicionar colaborador</button></div></header>
        {active === "Visão geral" ? <Overview online={online} range={range} setRange={setRange} /> : <Section active={active} />}
      </section>
    </main>
  );
}

function Overview({ online, range, setRange }: { online: number; range: string; setRange: (v: string) => void }) {
  return <>
    <div className="toolbar"><div className="live"><i /> Dados atualizados agora</div><select value={range} onChange={(e) => setRange(e.target.value)} aria-label="Período"><option>Hoje</option><option>Últimos 7 dias</option><option>Últimos 30 dias</option></select></div>
    <div className="metrics">
      <Metric label="Colaboradores ativos" value="11" note={`${online} online agora`} trend="+8%" />
      <Metric label="Tempo produtivo" value="68h 24m" note="média de 6h 13m" trend="+12%" />
      <Metric label="Foco médio" value="87%" note="acima da meta de 80%" trend="+4,2%" />
      <Metric label="Dispositivos" value="12" note="11 protegidos · 1 atenção" trend="92%" />
    </div>
    <div className="grid-main">
      <article className="card activity"><div className="card-head"><div><h2>Atividade ao longo do dia</h2><p>Tempo ativo, foco e pausas da equipe</p></div><div className="legend"><span className="focus">Foco</span><span className="active-time">Ativo</span><span className="away">Pausa</span></div></div><div className="chart"><div className="y-labels"><span>100%</span><span>75%</span><span>50%</span><span>25%</span><span>0%</span></div><div className="plot"><div className="grid-lines"><i/><i/><i/><i/><i/></div><div className="area area-a"/><div className="area area-b"/><div className="chart-labels"><span>08h</span><span>10h</span><span>12h</span><span>14h</span><span>16h</span><span>18h</span></div></div></div></article>
      <article className="card distribution"><div className="card-head"><div><h2>Distribuição do tempo</h2><p>Classificação automática</p></div><button>•••</button></div><div className="donut-wrap"><div className="donut"><div><strong>87%</strong><span>produtivo</span></div></div><ul><li><i className="c1"/><span>Produtivo</span><strong>68h 24m</strong></li><li><i className="c2"/><span>Neutro</span><strong>7h 18m</strong></li><li><i className="c3"/><span>Não produtivo</span><strong>3h 02m</strong></li></ul></div></article>
    </div>
    <div className="grid-bottom">
      <article className="card team"><div className="card-head"><div><h2>Equipe hoje</h2><p>Presença e desempenho por colaborador</p></div><button className="text-button">Ver todos →</button></div><div className="table"><div className="row table-head"><span>Colaborador</span><span>Status</span><span>Tempo em foco</span><span>Índice</span></div>{people.map((p) => <div className="row" key={p.name}><span className="person"><i>{p.name.split(" ").map(n=>n[0]).join("")}</i><span><strong>{p.name}</strong><small>{p.team} · {p.device}</small></span></span><span><em className={`status ${p.status.toLowerCase()}`}>{p.status}</em></span><span>{p.focus}</span><span className="score"><b style={{width:`${p.score}%`}}/><strong>{p.score}</strong></span></div>)}</div></article>
      <article className="card recent"><div className="card-head"><div><h2>Capturas recentes</h2><p>Visíveis conforme a política da empresa</p></div><button className="text-button">Galeria →</button></div><div className="capture-grid">{captures.map((c) => <div className={`capture ${c.tone}`} key={c.user}><div className="fake-screen"><span>{c.app.slice(0,2).toUpperCase()}</span><i/><i/><i/></div><div><strong>{c.user}</strong><span>{c.app} · {c.time}</span></div></div>)}</div></article>
    </div>
  </>;
}

function Metric({ label, value, note, trend }: { label: string; value: string; note: string; trend: string }) { return <article className="metric"><div><span>{label}</span><strong>{value}</strong><small>{note}</small></div><b>{trend}</b></article>; }

function Section({ active }: { active: string }) {
  if (active === "Capturas") return <ScreenshotGallery />;
  const configs: Record<string, { title: string; text: string; action: string }[]> = {
    Pessoas: [{title:"Colaboradores",text:"Perfis, equipes, cargos e políticas atribuídas.",action:"Gerenciar pessoas"},{title:"Papéis e acesso",text:"Admin da plataforma, admin da empresa, gestor e colaborador.",action:"Configurar papéis"},{title:"Convites pendentes",text:"3 convites aguardando primeiro acesso.",action:"Reenviar convites"}],
    Dispositivos: [{title:"12 dispositivos",text:"11 saudáveis e 1 dispositivo sem sincronizar há 2 horas.",action:"Abrir inventário"},{title:"Políticas",text:"Capture tela a cada 60 minutos, apps e tempo de inatividade.",action:"Editar política"},{title:"Ativos",text:"Atribua notebook, desktop e estação a um colaborador.",action:"Atribuir ativo"}],
    Capturas: [{title:"Galeria protegida",text:"Capturas segmentadas por empresa, colaborador e dispositivo.",action:"Abrir galeria"},{title:"Retenção",text:"30 dias com exclusão automática e trilha de auditoria.",action:"Configurar retenção"},{title:"Privacidade",text:"Mascaramento, pausa do colaborador e horários permitidos.",action:"Revisar regras"}],
    Instaladores: [{title:"macOS Apple Silicon",text:"Pacote .pkg assinado e pré-configurado para esta empresa.",action:"Baixar .pkg"},{title:"Windows 64-bit",text:"MSI silencioso para Intune, GPO, RMM ou instalação manual.",action:"Baixar .msi"},{title:"Token de provisionamento",text:"Expira em 24h e vincula novos dispositivos à empresa correta.",action:"Gerar novo token"}],
    Configurações: [{title:"Empresa",text:"Marca, domínio, fuso horário e política de dados.",action:"Editar empresa"},{title:"Segurança",text:"MFA, sessões, chaves de API e auditoria administrativa.",action:"Abrir segurança"},{title:"Integrações",text:"Webhooks, exportação e diretórios corporativos.",action:"Ver integrações"}],
  };
  return <div className="section-grid">{configs[active]?.map((item) => <article className="feature-card" key={item.title}><div className="feature-icon">{initials[active]}</div><h2>{item.title}</h2><p>{item.text}</p><button>{item.action} →</button></article>)}</div>;
}

function ScreenshotGallery() {
  const [items, setItems] = useState<{id:string;capturedAt:string;size:number;url:string}[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch("/platform-api/dashboard/screenshots", { credentials: "same-origin" })
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((data) => setItems(data.items || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);
  return <div className="gallery-page"><div className="gallery-toolbar"><div><strong>{items.length || "—"} capturas recentes</strong><span>Protegidas, auditáveis e segmentadas por empresa</span></div><button>Política de captura</button></div>{loading ? <div className="gallery-empty">Carregando capturas protegidas…</div> : items.length ? <div className="real-gallery">{items.map((item) => <article key={item.id}><img src={item.url} alt={`Captura ${item.id}`} loading="lazy"/><div><strong>MacBook Pro de Juan</strong><span>{new Date(item.capturedAt).toLocaleString("pt-BR")} · {(item.size/1024).toFixed(0)} KB</span></div></article>)}</div> : <div className="gallery-empty"><strong>Nenhuma captura disponível neste ambiente.</strong><span>Na AWS, as capturas aparecem aqui após o primeiro ciclo do agente.</span></div>}</div>;
}
