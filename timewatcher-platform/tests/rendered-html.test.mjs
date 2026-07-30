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

test("server-renders a valid TeamWatcher HTML document", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>TeamWatcher — Work Intelligence<\/title>/i);
  assert.doesNotMatch(html, /Ana Martins|Carlos Nunes|Orbe Logística|Norte Labs/);
});

test("auth-gated app wires the protected platform API", async () => {
  const [page, auth, layout] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/auth-screen.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(page, /platform-api\/auth\/me/);
  assert.match(page, /platform-api\/dashboard\/data/);
  assert.match(page, /platform-api\/dashboard\/people\/schedule/);
  assert.match(page, /URLs e sites acessados/);
  assert.match(page, /setInterval\(load,\s*30000\)/);
  assert.doesNotMatch(page, /const people\s*=|const captures\s*=/);
  assert.match(auth, /platform-api\/auth\/login/);
  assert.match(auth, /platform-api\/auth\/accept-invite/);
  assert.match(layout, /title:\s*"TeamWatcher — Work Intelligence"/);
});
