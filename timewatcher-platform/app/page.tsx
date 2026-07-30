"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Period = "today" | "7d" | "30d";
type SectionName = "Visão geral" | "Pessoas" | "Dispositivos" | "Atividades" | "Capturas" | "Instaladores" | "Configurações";
type Device = { id:string; name:string; platform:string; lastSeen:string; status:"online"|"offline"; trackedSeconds:number; activeSeconds:number; presses:number; clicks:number };
type AppUsage = { name:string; seconds:number; duration:string; classification:"productive"|"neutral"|"unproductive"; share:number };
type DashboardData = {
  tenant:{id:string;name:string}; period:Period; generatedAt:string;
  person:{id:string;name:string;role:string;deviceCount:number;status:"online"|"offline";trackedSeconds:number;activeSeconds:number;idleSeconds:number;productiveSeconds:number;focusScore:number};
  summary:{trackedSeconds:number;activeSeconds:number;idleSeconds:number;productiveSeconds:number;neutralSeconds:number;unproductiveSeconds:number;focusScore:number;deviceCount:number;onlineDeviceCount:number;screenshotCount:number;lastSeen:string|null};
  devices:Device[]; apps:AppUsage[]; timeline:{hour:number;label:string;seconds:number}[];
  recent:{timestamp:string;duration:number;app:string;title:string}[]; input:{presses:number;clicks:number};
};
type Screenshot = {id:string;capturedAt:string;size:number;url:string;app?:string;title?:string;device?:string};

const nav: {name:SectionName; icon:string}[] = [
  {name:"Visão geral",icon:"◫"},{name:"Pessoas",icon:"P"},{name:"Dispositivos",icon:"D"},
  {name:"Atividades",icon:"A"},{name:"Capturas",icon:"C"},{name:"Instaladores",icon:"↓"},{name:"Configurações",icon:"⚙"},
];
const periodLabels:Record<Period,string> = {today:"Hoje","7d":"Últimos 7 dias","30d":"Últimos 30 dias"};
const classLabels = {productive:"Produtivo",neutral:"Neutro",unproductive:"Não produtivo"};

function duration(seconds:number) {
  const total=Math.max(0,Math.round(seconds)); const h=Math.floor(total/3600); const m=Math.floor((total%3600)/60); const s=total%60;
  return h ? `${h}h ${String(m).padStart(2,"0")}m` : `${m}m ${String(s).padStart(2,"0")}s`;
}
function localDate(value:string|null) { return value ? new Date(value).toLocaleString("pt-BR",{dateStyle:"short",timeStyle:"short"}) : "Sem sincronização"; }

export default function Dashboard() {
  const [active,setActive]=useState<SectionName>("Visão geral");
  const [period,setPeriod]=useState<Period>("today");
  const [data,setData]=useState<DashboardData|null>(null);
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(true);
  const load=useCallback(async()=>{
    try { setError(""); const response=await fetch(`/platform-api/dashboard/data?period=${period}`,{credentials:"same-origin",cache:"no-store"}); if(!response.ok) throw new Error(); setData(await response.json()); }
    catch { setError("Não foi possível carregar os dados enviados pelo agente."); }
    finally { setLoading(false); }
  },[period]);
  useEffect(()=>{ setLoading(true); load(); const timer=setInterval(load,30000); return()=>clearInterval(timer); },[load]);
  const tenant=data?.tenant.name || "TimeWatcher";
  return <main className="app-shell">
    <aside className="sidebar">
      <div className="brand"><img src="/timewatcher-logo.png" alt=""/><div><strong>TimeWatcher</strong><span>Inteligência do tempo</span></div></div>
      <div className="tenant-picker"><span className="tenant-mark">{tenant[0]}</span><div><strong>{tenant}</strong><small>Ambiente da empresa</small></div></div>
      <nav aria-label="Navegação principal">{nav.map(item=><button key={item.name} className={active===item.name?"active":""} onClick={()=>setActive(item.name)}><span>{item.icon}</span>{item.name}{item.name==="Dispositivos"&&<b>{data?.summary.deviceCount??"—"}</b>}</button>)}</nav>
      <div className="sidebar-foot"><div className="avatar">JK</div><div><strong>{data?.person.name||"Juan Kleber"}</strong><span>Admin da plataforma</span></div></div>
    </aside>
    <section className="workspace">
      <header><div><p className="eyebrow">{tenant} · {active}</p><h1>{active}</h1><p>{subtitle(active)}</p></div><div className="header-actions"><button className="refresh-button" onClick={load}>↻ Atualizar</button></div></header>
      <div className="toolbar"><div className={`live ${data?.summary.onlineDeviceCount?"":"offline"}`}><i/> {data?.summary.onlineDeviceCount?"Agente conectado":"Agente sem sincronização recente"}{data?.summary.lastSeen&&` · ${localDate(data.summary.lastSeen)}`}</div><select value={period} onChange={e=>setPeriod(e.target.value as Period)} aria-label="Período"><option value="today">Hoje</option><option value="7d">Últimos 7 dias</option><option value="30d">Últimos 30 dias</option></select></div>
      {loading&&!data?<StateCard text="Carregando dados reais da sua máquina…"/>:error&&!data?<StateCard text={error}/>:data&&<Content active={active} data={data} onNavigate={setActive}/>}
    </section>
  </main>;
}

function subtitle(active:SectionName){ const map:Record<SectionName,string>={"Visão geral":"Entenda como o tempo está sendo usado, com dados enviados pelo agente.",Pessoas:"Tempo e atividade por colaborador, sem informações financeiras.",Dispositivos:"Inventário e saúde dos computadores que enviam dados.",Atividades:"Aplicativos, janelas, períodos ativos e ociosidade.",Capturas:"Capturas periódicas autorizadas pelo usuário.",Instaladores:"Distribuição do agente por sistema operacional.",Configurações:"Políticas de coleta, classificação e privacidade."}; return map[active]; }
function StateCard({text}:{text:string}){return <div className="state-card">{text}</div>}
function Content({active,data,onNavigate}:{active:SectionName;data:DashboardData;onNavigate:(v:SectionName)=>void}){
  if(active==="Visão geral") return <Overview data={data} onNavigate={onNavigate}/>;
  if(active==="Pessoas") return <People data={data}/>;
  if(active==="Dispositivos") return <Devices data={data}/>;
  if(active==="Atividades") return <Activities data={data}/>;
  if(active==="Capturas") return <ScreenshotGallery/>;
  if(active==="Instaladores") return <Installers data={data}/>;
  return <Settings data={data}/>;
}

function Overview({data,onNavigate}:{data:DashboardData;onNavigate:(v:SectionName)=>void}){
  const s=data.summary; const total=s.productiveSeconds+s.neutralSeconds+s.unproductiveSeconds||1;
  const top=data.apps.slice(0,5); const max=Math.max(...data.timeline.map(x=>x.seconds),1);
  return <>
    <div className="metrics">
      <Metric label="Tempo monitorado" value={duration(s.trackedSeconds)} note={periodLabels[data.period]} />
      <Metric label="Tempo ativo" value={duration(s.activeSeconds)} note={`${duration(s.idleSeconds)} em ociosidade`} />
      <Metric label="Tempo produtivo" value={duration(s.productiveSeconds)} note={`${s.focusScore}% do tempo monitorado`} />
      <Metric label="Dispositivos" value={String(s.deviceCount)} note={`${s.onlineDeviceCount} conectado agora`} />
    </div>
    <div className="grid-main">
      <article className="card activity"><div className="card-head"><div><h2>Atividade ao longo do período</h2><p>Tempo monitorado por hora</p></div></div><div className="bar-chart">{data.timeline.length?data.timeline.map(item=><div className="bar-column" key={item.hour}><span style={{height:`${Math.max(5,item.seconds/max*100)}%`}} title={duration(item.seconds)}/><small>{item.label}</small></div>):<StateCard text="Ainda não há atividade neste período."/>}</div></article>
      <article className="card distribution"><div className="card-head"><div><h2>Distribuição do tempo</h2><p>Classificação dos aplicativos</p></div></div><div className="donut-wrap"><div className="donut real" style={{background:`conic-gradient(var(--violet) 0 ${s.productiveSeconds/total*100}%,var(--cyan) ${s.productiveSeconds/total*100}% ${(s.productiveSeconds+s.neutralSeconds)/total*100}%,#e3e7ef ${(s.productiveSeconds+s.neutralSeconds)/total*100}% 100%)`}}><div><strong>{s.focusScore}%</strong><span>produtivo</span></div></div><ul><li><i className="c1"/><span>Produtivo</span><strong>{duration(s.productiveSeconds)}</strong></li><li><i className="c2"/><span>Neutro</span><strong>{duration(s.neutralSeconds)}</strong></li><li><i className="c3"/><span>Não produtivo</span><strong>{duration(s.unproductiveSeconds)}</strong></li></ul></div></article>
    </div>
    <div className="grid-bottom">
      <article className="card"><div className="card-head"><div><h2>Aplicativos mais usados</h2><p>Dados reais do dispositivo</p></div><button className="text-button" onClick={()=>onNavigate("Atividades")}>Ver todos →</button></div><AppTable apps={top}/></article>
      <article className="card"><div className="card-head"><div><h2>Sua máquina</h2><p>Último estado recebido</p></div><button className="text-button" onClick={()=>onNavigate("Dispositivos")}>Detalhes →</button></div>{data.devices.map(device=><DeviceCard device={device} key={device.id}/>)}</article>
    </div>
  </>;
}
function Metric({label,value,note}:{label:string;value:string;note:string}){return <article className="metric"><div><span>{label}</span><strong>{value}</strong><small>{note}</small></div></article>}

function People({data}:{data:DashboardData}){const p=data.person;return <div className="page-stack"><article className="card data-card"><div className="card-head"><div><h2>Colaboradores monitorados</h2><p>Registros vinculados a esta empresa</p></div><span className={`pill ${p.status}`}>{p.status==="online"?"Online":"Offline"}</span></div><div className="person-detail"><div className="avatar large">JK</div><div><h3>{p.name}</h3><p>{p.role} · {p.deviceCount} dispositivo</p></div><dl><div><dt>Monitorado</dt><dd>{duration(p.trackedSeconds)}</dd></div><div><dt>Ativo</dt><dd>{duration(p.activeSeconds)}</dd></div><div><dt>Ocioso</dt><dd>{duration(p.idleSeconds)}</dd></div><div><dt>Produtivo</dt><dd>{duration(p.productiveSeconds)}</dd></div></dl></div></article><article className="card"><h2>Aplicativos do colaborador</h2><AppTable apps={data.apps}/></article></div>}
function Devices({data}:{data:DashboardData}){return <div className="page-stack"><div className="section-summary"><strong>{data.devices.length} dispositivo encontrado</strong><span>Inventário criado automaticamente pelos dados do agente</span></div><div className="device-grid">{data.devices.map(device=><DeviceCard device={device} key={device.id}/>)}</div></div>}
function DeviceCard({device}:{device:Device}){return <article className="device-card"><div className="device-icon">⌘</div><div><h3>{device.name}</h3><p>{device.platform} · {device.id}</p></div><span className={`pill ${device.status}`}>{device.status==="online"?"Conectado":"Offline"}</span><dl><div><dt>Última sincronização</dt><dd>{localDate(device.lastSeen)}</dd></div><div><dt>Tempo monitorado</dt><dd>{duration(device.trackedSeconds)}</dd></div><div><dt>Teclas</dt><dd>{device.presses.toLocaleString("pt-BR")}</dd></div><div><dt>Cliques</dt><dd>{device.clicks.toLocaleString("pt-BR")}</dd></div></dl></article>}
function Activities({data}:{data:DashboardData}){return <div className="page-stack"><div className="metrics compact"><Metric label="Tempo monitorado" value={duration(data.summary.trackedSeconds)} note={periodLabels[data.period]}/><Metric label="Ativo" value={duration(data.summary.activeSeconds)} note="Uso com atividade"/><Metric label="Ocioso" value={duration(data.summary.idleSeconds)} note="Sem interação"/><Metric label="Aplicativos" value={String(data.apps.length)} note="Detectados no período"/></div><article className="card"><div className="card-head"><div><h2>Uso por aplicativo</h2><p>Classificação baseada nas regras atuais</p></div></div><AppTable apps={data.apps}/></article><article className="card"><h2>Atividade recente</h2><div className="recent-list">{data.recent.map((item,index)=><div key={`${item.timestamp}-${index}`}><span className="app-dot"/><div><strong>{item.app}</strong><small>{item.title||"Sem título de janela"}</small></div><time>{duration(item.duration)} · {localDate(item.timestamp)}</time></div>)}</div></article></div>}
function AppTable({apps}:{apps:AppUsage[]}){return <div className="app-table"><div className="app-row head"><span>Aplicativo</span><span>Classificação</span><span>Tempo</span><span>Participação</span></div>{apps.length?apps.map(app=><div className="app-row" key={app.name}><span><i>{app.name.slice(0,2).toUpperCase()}</i><strong>{app.name}</strong></span><span><em className={`classification ${app.classification}`}>{classLabels[app.classification]}</em></span><span>{app.duration}</span><span className="share"><b style={{width:`${app.share}%`}}/>{app.share}%</span></div>):<StateCard text="Nenhum aplicativo no período selecionado."/>}</div>}

function ScreenshotGallery(){const[items,setItems]=useState<Screenshot[]>([]);const[loading,setLoading]=useState(true);useEffect(()=>{fetch("/platform-api/dashboard/screenshots",{credentials:"same-origin",cache:"no-store"}).then(r=>r.ok?r.json():Promise.reject()).then(d=>setItems(d.items||[])).catch(()=>setItems([])).finally(()=>setLoading(false))},[]);return <div className="gallery-page"><div className="gallery-toolbar"><div><strong>{items.length} capturas recebidas</strong><span>Clique em uma imagem para ampliar</span></div></div>{loading?<StateCard text="Carregando capturas…"/>:items.length?<div className="real-gallery">{items.map(item=><a href={item.url} target="_blank" rel="noreferrer" key={item.id}><article><img src={item.url} alt={`Captura de ${item.app||"atividade"}`} loading="lazy"/><div><strong>{item.app||"Aplicativo não identificado"}</strong><span>{item.device?.replace(".local","")||"MacBook Pro de Juan"}</span><span>{localDate(item.capturedAt)} · {(item.size/1024).toFixed(0)} KB</span></div></article></a>)}</div>:<StateCard text="Nenhuma captura recebida. Verifique a permissão de Gravação da Tela no macOS."/>}</div>}
function Installers({data}:{data:DashboardData}){return <div className="install-grid"><article className="install-card ready"><span>macOS</span><h2>Agente em execução</h2><p>{data.devices[0]?.name||"Nenhum Mac conectado"}</p><strong>{data.devices[0]?.status==="online"?"Coletando dados agora":"Última sincronização: "+localDate(data.summary.lastSeen)}</strong></article><article className="install-card"><span>PKG</span><h2>Instalador corporativo macOS</h2><p>Empacotamento e assinatura Developer ID fazem parte da próxima entrega.</p><button disabled>Em preparação</button></article><article className="install-card"><span>MSI</span><h2>Instalação em massa Windows</h2><p>Será distribuído por Intune, GPO ou RMM com token da empresa.</p><button disabled>Em preparação</button></article></div>}
function Settings({data}:{data:DashboardData}){return <div className="settings-grid"><article className="card"><h2>Coleta atual</h2><dl className="settings-list"><div><dt>Empresa</dt><dd>{data.tenant.name}</dd></div><div><dt>Aplicativos e janelas</dt><dd>Ativo</dd></div><div><dt>Atividade/ociosidade</dt><dd>Ativo</dd></div><div><dt>Teclado e mouse</dt><dd>Somente contagens</dd></div><div><dt>Capturas</dt><dd>Periódicas e autorizadas</dd></div></dl></article><article className="card"><h2>Classificação inicial</h2><p className="settings-copy">ChatGPT, Codex, Terminal, VS Code, Xcode, Figma, Notion, Slack, Zoom e Meet são produtivos. Redes sociais e entretenimento são não produtivos. Os demais começam como neutros.</p></article><article className="card"><h2>Privacidade</h2><p className="settings-copy">Não coletamos conteúdo digitado. A plataforma recebe contagens de interação, aplicativos, títulos de janela, tempo e capturas autorizadas. Retenção e acesso por perfil serão configuráveis.</p></article></div>}
