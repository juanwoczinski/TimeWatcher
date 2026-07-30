import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(new Request("http://localhost/", { headers: { accept: "text/html" } }), {
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
  }, { waitUntil() {}, passThroughOnException() {} });
}

test("server-renders the TimeWatcher product shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>TimeWatcher — Work Intelligence<\/title>/i);
  assert.match(html, /Inteligência do tempo/);
  assert.match(html, /Visão geral/);
  assert.match(html, /Pessoas/);
  assert.match(html, /Dispositivos/);
  assert.match(html, /Atividades/);
  assert.match(html, /Relatórios/);
  assert.doesNotMatch(html, />Capturas<\/button>/);
  assert.match(html, /Carregando dados reais da sua máquina/);
  assert.doesNotMatch(html, /Ana Martins|Carlos Nunes|Orbe Logística|Norte Labs/);
});

test("loads operational data from the protected platform API", async () => {
  const [page, layout] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(page, /platform-api\/dashboard\/data/);
  assert.match(page, /platform-api\/dashboard\/screenshots/);
  assert.match(page, /platform-api\/dashboard\/export\.csv/);
  assert.match(page, /platform-api\/dashboard\/people\/schedule/);
  assert.match(page, /URLs e sites acessados/);
  assert.match(page, /setInterval\(load,\s*30000\)/);
  assert.doesNotMatch(page, /const people\s*=|const captures\s*=/);
  assert.match(layout, /title:\s*"TimeWatcher — Work Intelligence"/);
});
