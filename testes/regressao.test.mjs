// Testes de regressão (simulados). Rodar na pasta do módulo:  node --test
// Cobrem os achados da revisão de 2/11/2026: transferência com falha, envio simultâneo do mesmo
// personagem, respostas fora de ordem, tokens grandes na borda, música enquanto espera as faixas
// e remetente forjado no socket. Testar no Foundry real continua sendo com o autor.
import { test } from "node:test";
import assert from "node:assert/strict";
import { montarFoundry, criarCena, criarAtor, adicionarToken, avisos, enviados, tocados, parados } from "./simulador.mjs";

montarFoundry();
const viagem = await import("../scripts/viagem.js");
const { Envio } = await import("../scripts/janela-envio.js");
const { registrarSocket } = await import("../scripts/socket.js");

// Cada teste começa sem as casas reservadas pelos anteriores
const preparar = opcoes => { viagem.reservas.clear(); return montarFoundry(opcoes); };

const jogador = (id, ator, viewedScene) => ({ id, name: `Jogador ${id}`, isGM: false, active: true, viewedScene, character: ator, getFlag: () => null });
const deAtor = (cena, ator) => cena.tokens.contents.filter(t => t.actorId === ator.id).length;

// ---------- 1. Transferência com falha
test("transferência normal: um token só, no destino", async () => {
  const A = criarCena("A"), B = criarCena("B"), ator = criarAtor("x");
  adicionarToken(A, { actorId: "x" });
  preparar({ cenas: [A, B] });
  await viagem.moverTokenDoJogador(jogador("u1", ator, "A"), B, "A");
  assert.equal(deAtor(A, ator), 0);
  assert.equal(deAtor(B, ator), 1);
});

test("falha ao criar no destino: o original fica, nada no destino", async () => {
  const A = criarCena("A"), B = criarCena("B"), ator = criarAtor("x");
  adicionarToken(A, { actorId: "x" });
  B.falhas.criar = true;
  preparar({ cenas: [A, B] });
  await assert.rejects(viagem.moverTokenDoJogador(jogador("u1", ator, "A"), B, "A"));
  assert.equal(deAtor(A, ator), 1);
  assert.equal(deAtor(B, ator), 0);
});

test("falha ao apagar o original: a cópia é desfeita e o mestre é avisado", async () => {
  const A = criarCena("A"), B = criarCena("B"), ator = criarAtor("x");
  adicionarToken(A, { actorId: "x" }).falhaApagar = true;
  preparar({ cenas: [A, B] });
  const err = await viagem.moverTokenDoJogador(jogador("u1", ator, "A"), B, "A").catch(e => e);
  assert.equal(err?.avisado, true, "o erro sai marcado para não repetir o aviso");
  assert.equal(deAtor(A, ator), 1, "só o original");
  assert.equal(deAtor(B, ator), 0, "cópia desfeita");
  assert.ok(avisos.some(a => a.tipo === "error" && a.msg.includes("Mapa A") && a.msg.includes("Mapa B")));
});

test("falha ao apagar o original e ao desfazer: aviso permanente com origem, destino e token", async () => {
  const A = criarCena("A"), B = criarCena("B"), ator = criarAtor("x");
  adicionarToken(A, { actorId: "x", name: "Herói x" }).falhaApagar = true;
  B.falhas.apagarNovos = true;
  preparar({ cenas: [A, B] });
  const err = await viagem.moverTokenDoJogador(jogador("u1", ator, "A"), B, "A").catch(e => e);
  assert.equal(err?.avisado, true);
  const aviso = avisos.find(a => a.tipo === "error");
  assert.ok(aviso.opcoes?.permanent, "aviso não some sozinho");
  for (const parte of ["Herói x", "Mapa A", "Mapa B"]) assert.ok(aviso.msg.includes(parte), `aviso cita ${parte}`);
});

// ---------- 2. Envio simultâneo do mesmo personagem
test("dois jogadores com o mesmo personagem enviados juntos: um token só", async () => {
  const A = criarCena("A"), B = criarCena("B"), ator = criarAtor("x");
  adicionarToken(A, { actorId: "x" });
  preparar({ cenas: [A, B] });
  await Promise.all([viagem.moverTokenDoJogador(jogador("u1", ator, "A"), B, "A"), viagem.moverTokenDoJogador(jogador("u2", ator, "A"), B, "A")]);
  assert.equal(deAtor(B, ator), 1);
  assert.equal(deAtor(A, ator), 0);
  assert.equal(B.criados, 1);
});

test("personagens diferentes enviados juntos: cada um é transferido", async () => {
  const A = criarCena("A"), B = criarCena("B"), x = criarAtor("x"), y = criarAtor("y");
  adicionarToken(A, { actorId: "x" }); adicionarToken(A, { actorId: "y" });
  preparar({ cenas: [A, B] });
  await Promise.all([viagem.moverTokenDoJogador(jogador("u1", x, "A"), B, "A"), viagem.moverTokenDoJogador(jogador("u2", y, "A"), B, "A")]);
  assert.equal(deAtor(B, x), 1); assert.equal(deAtor(B, y), 1); assert.equal(A.tokens.contents.length, 0);
});

// ---------- 4. Tokens grandes na borda
const dentroDoMapa = (cena, tk) => tk.x >= 0 && tk.y >= 0
  && tk.x + tk.width * 100 <= cena.dimensions.sceneWidth && tk.y + tk.height * 100 <= cena.dimensions.sceneHeight;

test("token 2x2 num mapa 200x200: fica inteiro dentro", async () => {
  const B = criarCena("B", { largura: 200, altura: 200 }), ator = criarAtor("g", { width: 2, height: 2 });
  preparar({ cenas: [B] });
  await viagem.moverTokenDoJogador(jogador("u1", ator, null), B, null);
  const tk = B.tokens.contents[0];
  assert.deepEqual([tk.x, tk.y], [0, 0]);
});

for (const [nome, chegada] of [["esquerda", { x: 0, y: 400 }], ["direita", { x: 900, y: 400 }], ["topo", { x: 400, y: 0 }], ["base", { x: 400, y: 900 }]]) {
  for (const n of [1, 2, 3]) {
    test(`token ${n}x${n} com chegada na borda ${nome}: dentro do mapa e sem encostar em outro`, async () => {
      const B = criarCena("B", { chegada }), atores = [1, 2, 3].map(i => criarAtor(`${nome}${n}${i}`, { width: n, height: n }));
      preparar({ cenas: [B] });
      for (const a of atores) await viagem.moverTokenDoJogador(jogador(`u${a.id}`, a, null), B, null);
      const tks = B.tokens.contents;
      assert.equal(tks.length, 3);
      for (const tk of tks) assert.ok(dentroDoMapa(B, tk), `${tk.x},${tk.y} fora do mapa`);
      for (let i = 0; i < tks.length; i++) for (let j = i + 1; j < tks.length; j++) {
        const a = tks[i], b = tks[j];
        const sobrepoe = a.x < b.x + b.width * 100 && b.x < a.x + a.width * 100 && a.y < b.y + b.height * 100 && b.y < a.y + a.height * 100;
        assert.ok(!sobrepoe, "tokens sobrepostos");
      }
    });
  }
}

test("mapa sem espaço: avisa o mestre e mantém o token dentro do mapa", async () => {
  const B = criarCena("B", { largura: 200, altura: 200 }), ator = criarAtor("g", { width: 2, height: 2 });
  adicionarToken(B, { actorId: "outro", x: 0, y: 0, width: 2, height: 2 });
  preparar({ cenas: [B] });
  await viagem.moverTokenDoJogador(jogador("u1", ator, null), B, null);
  const tk = B.tokens.contents.find(t => t.actorId === "g");
  assert.ok(dentroDoMapa(B, tk));
  assert.ok(avisos.some(a => a.tipo === "warn" && a.msg.includes("Mapa B")));
});

// ---------- 3. Respostas fora de ordem
function janelaDeTeste() {
  const J = Envio(class { atualizar() {} });
  return Object.assign(new J(), { estados: new Map(), esperas: new Map(), precarregados: new Map(), receptores: new Set() });
}

test("confirmação atrasada do mapa A não conclui o envio atual para B", () => {
  preparar({ cenas: [criarCena("A"), criarCena("B")] });
  const j = janelaDeTeste();
  const est = { sceneId: "B", envio: true, estado: "indo", op: "op-B" };
  j.estados.set("u1", est);
  j.aoSocket({ acao: "status", userId: "u1", sceneId: "A", op: "op-A", estado: "chegou" });
  assert.equal(j.estados.get("u1"), est); assert.equal(est.estado, "indo");
  j.aoSocket({ acao: "status", userId: "u1", sceneId: "B", op: "op-A", estado: "erro" });
  assert.equal(j.estados.get("u1"), est, "erro de outra operação não apaga o estado");
  j.aoSocket({ acao: "status", userId: "u1", sceneId: "B", estado: "chegou" });
  assert.equal(est.estado, "indo", "resposta sem identificador não vale");
  j.aoSocket({ acao: "status", userId: "u1", sceneId: "B", op: "op-B", estado: "chegou" });
  assert.equal(est.estado, "chegou");
});

test("dois envios seguidos ao mesmo mapa: só a resposta do segundo vale", async () => {
  preparar({ cenas: [criarCena("B")] });
  const j = janelaDeTeste();
  const primeira = j.esperar("u1", "op-1", "chegada", 1000);
  const segunda = j.esperar("u1", "op-2", "chegada", 1000);
  const est = { sceneId: "B", envio: true, estado: "indo", op: "op-2" };
  j.estados.set("u1", est);
  j.aoSocket({ acao: "status", userId: "u1", sceneId: "B", op: "op-1", estado: "erro" });
  assert.equal(j.estados.get("u1"), est);
  j.aoSocket({ acao: "status", userId: "u1", sceneId: "B", op: "op-2", estado: "chegou" });
  assert.equal(await segunda, true);
  j.esquecer?.("u1"); // solta a espera antiga
  assert.equal(await primeira, false);
});

// ---------- 5. Música enquanto espera as faixas
test("trocar de A para B sem acesso à playlist: a música de A para antes da resposta; só B toca", async () => {
  const A = criarCena("A", { musica: { modo: "local", playlist: "pA" } }), B = criarCena("B", { musica: { modo: "local", playlist: "pB" } });
  const { users } = preparar({ cenas: [A, B] });
  const eu = jogador("u1", null, "A"); users.push(eu); game.user = eu;
  canvas.scene = A; viagem.atualizarMusicaLocal();
  viagem.aoReceberFaixas({ sceneId: "A", playlist: "pA", sons: [{ path: "a.ogg" }] });
  await new Promise(r => setTimeout(r, 5));
  assert.deepEqual(tocados, ["a.ogg"]);
  canvas.scene = B; viagem.atualizarMusicaLocal();
  assert.deepEqual(parados, ["a.ogg"], "A começou a abaixar (fade) sem esperar a resposta");
  assert.ok(enviados.some(d => d.acao === "pedir-musica" && d.sceneId === "B"));
  viagem.aoReceberFaixas({ sceneId: "A", playlist: "pA", sons: [{ path: "a.ogg" }] }); // resposta velha
  viagem.aoReceberFaixas({ sceneId: "B", playlist: "pB", sons: [{ path: "b.ogg" }] });
  await new Promise(r => setTimeout(r, 5));
  assert.deepEqual(tocados, ["a.ogg", "b.ogg"]);
});

test("mestre não responde: silêncio depois do prazo, e uma resposta tardia não toca mais", async () => {
  // playlist própria deste teste, para não depender da música que o teste anterior deixou tocando
  const A = criarCena("A", { musica: { modo: "local", playlist: "pZ" } });
  const { users } = preparar({ cenas: [A] });
  const eu = jogador("u1", null, "A"); users.push(eu); game.user = eu; canvas.scene = A;
  const real = globalThis.setTimeout, pendentes = [];
  globalThis.setTimeout = (fn, ms, ...r) => ms >= 10_000 ? (pendentes.push(fn), 0) : real(fn, ms, ...r);
  try { viagem.atualizarMusicaLocal(); } finally { globalThis.setTimeout = real; }
  pendentes.forEach(fn => fn()); // passa o prazo
  assert.ok(enviados.some(d => d.acao === "pedir-musica"), "pediu as faixas ao mestre");
  viagem.aoReceberFaixas({ sceneId: "A", playlist: "pZ", sons: [{ path: "tarde.ogg" }] });
  await new Promise(r => setTimeout(r, 5));
  assert.deepEqual(tocados, []);
});

// ---------- Socket: remetente forjado
test("socket: mensagem com id extra (remetente forjado) é descartada", async () => {
  const B = criarCena("B");
  const { users } = preparar({ cenas: [B] });
  users.push(jogador("u2", null, "B"));
  const pedidos = [];
  const { estado } = await import("../scripts/nucleo.js");
  estado.app = { enviarVarios: (ids, s) => pedidos.push([ids, s]), aoSocket() {} };
  registrarSocket();
  // u2 tenta se passar pelo mestre: emite (dados, "gm") e o servidor acrescenta "u2"
  await __socket({ acao: "pedir-envio", userIds: ["u1", "u3"], sceneId: "B" }, "gm", "u2");
  assert.equal(pedidos.length, 0);
  // pedido de u2 com a lista de outros jogadores: só vale para ele mesmo (com os pedidos aceitos sem pergunta)
  game.settings.get = (m, k) => (k === "pedidosJogadores" ? "permitir" : undefined);
  await __socket({ acao: "pedir-envio", userIds: ["u1", "u3"], sceneId: "B" }, "u2");
  assert.deepEqual(pedidos, [[["u2"], "B"]]);
});

// ---------- Auditoria de 4/11/2026: o jogador escolhia o próprio destino sem o mestre saber
// Antes, qualquer jogador podia mandar { acao: "pedir-envio", sceneId } pelo socket (ou pela API) e o
// mestre ativo o enviava na hora, para qualquer mapa do mundo. O mesmo valia para "portal", em que até
// o "confirmar" vinha na mensagem do jogador.
async function pedidoDeJogador({ regra, resposta = true } = {}) {
  const B = criarCena("B");
  const { users } = preparar({ cenas: [B] });
  users.push(jogador("u2", null, "A"));
  const pedidos = [], perguntas = [], portais = [];
  const { estado } = await import("../scripts/nucleo.js");
  estado.app = { enviarVarios: (ids, s, o) => { pedidos.push([ids, s]); if (o?.semToken) portais.push(s); }, aoSocket() {} };
  game.settings.get = (m, k) => (k === "pedidosJogadores" ? regra : undefined);
  foundry.applications.api.DialogV2 = { confirm: async o => { perguntas.push(o.content); return typeof resposta === "function" ? resposta() : resposta; } };
  registrarSocket();
  return { pedidos, perguntas, portais, B };
}

test("pedido de envio de um jogador: por padrão o mestre é perguntado, e só vai se ele aceitar", async () => {
  let r = await pedidoDeJogador({ regra: undefined, resposta: false });
  await __socket({ acao: "pedir-envio", sceneId: "B" }, "u2");
  assert.equal(r.perguntas.length, 1, "o mestre recebe a pergunta");
  assert.ok(r.perguntas[0].includes("Jogador u2") && r.perguntas[0].includes("Mapa B"));
  assert.deepEqual(r.pedidos, [], "recusado: ninguém é enviado");
  r = await pedidoDeJogador({ regra: "perguntar", resposta: true });
  await __socket({ acao: "pedir-envio", sceneId: "B" }, "u2");
  assert.deepEqual(r.pedidos, [[["u2"], "B"]], "aceito: só quem pediu");
});

test("pedido de envio de um jogador: 'recusar sempre' nem pergunta; 'aceitar sempre' vai direto", async () => {
  const aviso = console.warn; console.warn = () => {};
  let r = await pedidoDeJogador({ regra: "recusar" });
  await __socket({ acao: "pedir-envio", sceneId: "B" }, "u2");
  console.warn = aviso;
  assert.deepEqual([r.perguntas.length, r.pedidos.length], [0, 0]);
  r = await pedidoDeJogador({ regra: "permitir" });
  await __socket({ acao: "pedir-envio", sceneId: "B" }, "u2");
  assert.deepEqual([r.perguntas.length, r.pedidos.length], [0, 1]);
});

test("pedido de envio: vários pedidos do mesmo jogador abrem uma pergunta só", async () => {
  let soltar;
  const r = await pedidoDeJogador({ regra: "perguntar", resposta: () => new Promise(ok => { soltar = () => ok(true); }) });
  const primeiro = __socket({ acao: "pedir-envio", sceneId: "B" }, "u2");
  await __socket({ acao: "pedir-envio", sceneId: "B" }, "u2");
  await __socket({ acao: "pedir-envio", sceneId: "B" }, "u2");
  assert.equal(r.perguntas.length, 1);
  soltar(); await primeiro;
  assert.equal(r.pedidos.length, 1);
});

test("pedido de envio vindo do mestre (outro mestre conectado) não é perguntado", async () => {
  const r = await pedidoDeJogador({ regra: "perguntar", resposta: false });
  await __socket({ acao: "pedir-envio", userIds: ["u2"], sceneId: "B" }, "gm");
  assert.deepEqual([r.perguntas.length, r.pedidos.length], [0, 1]);
});

test("portal pedido por um jogador: o 'confirmar: false' da mensagem não dispensa o mestre", async () => {
  const r = await pedidoDeJogador({ regra: "perguntar", resposta: false });
  const A = criarCena("A"), ator = criarAtor("x");
  const tk = adicionarToken(A, { actorId: "x" });
  tk.actor = { testUserPermission: u => u.id === "u2" };
  globalThis.fromUuid = async () => tk;
  await __socket({ acao: "portal", tokenUuid: "Scene.A.Token.t", sceneId: "B", confirmar: false }, "u2");
  await new Promise(ok => setTimeout(ok, 5));
  assert.equal(r.perguntas.length, 1, "o mestre é perguntado");
  assert.equal(tk.parent.id, "A", "recusado: o token não saiu do mapa");
  assert.equal(r.B.criados, 0);
});


// ---------- Área de chegada (configuração do mundo)
async function chegarVarios(cena, n, config) {
  preparar({ cenas: [cena], config });
  for (let k = 0; k < n; k++) {
    const a = criarAtor(`area${k}`);
    await viagem.moverTokenDoJogador(jogador(`ua${k}`, a, null), cena, null);
  }
  return cena.tokens.contents;
}

test("hexagonal, área 1: 7 tokens ocupam os 7 hexágonos da área, um em cada", async () => {
  const B = criarCena("B", { hex: true, largura: 2000, altura: 2000 });
  const centro = B.grid.getOffset({ x: 1000, y: 1000 });
  const canto = B.grid.getTopLeftPoint(centro);
  B.getFlag = (m, k) => k === "chegada" ? { x: canto.x, y: canto.y } : null;
  const tks = await chegarVarios(B, 7, { areaChegada: 1 });
  const casas = tks.map(tk => B.grid.getOffset({ x: tk.x + B.grid.sizeX / 2, y: tk.y + B.grid.sizeY / 2 }));
  assert.equal(new Set(casas.map(o => `${o.i},${o.j}`)).size, 7, "cada token num hexágono diferente");
  for (const o of casas) assert.ok(B.grid.distancia(o, centro) <= 1, `hexágono ${o.i},${o.j} fora da área`);
  assert.ok(!avisos.some(a => a.tipo === "warn"), "área não estava cheia");
});

test("hexagonal, área 1 cheia: o 8º token fica no anel seguinte e o mestre é avisado", async () => {
  const B = criarCena("B", { hex: true, largura: 2000, altura: 2000 });
  const centro = B.grid.getOffset({ x: 1000, y: 1000 });
  const canto = B.grid.getTopLeftPoint(centro);
  B.getFlag = (m, k) => k === "chegada" ? { x: canto.x, y: canto.y } : null;
  const tks = await chegarVarios(B, 8, { areaChegada: 1 });
  const ultimo = tks.at(-1);
  const o = B.grid.getOffset({ x: ultimo.x + B.grid.sizeX / 2, y: ultimo.y + B.grid.sizeY / 2 });
  assert.equal(B.grid.distancia(o, centro), 2);
  assert.ok(avisos.some(a => a.tipo === "warn" && a.msg.includes("cheia")));
});

test("hexagonal, área 2: 19 tokens, 19 hexágonos diferentes dentro da área", async () => {
  const B = criarCena("B", { hex: true, largura: 3000, altura: 3000 });
  const centro = B.grid.getOffset({ x: 1500, y: 1500 });
  const canto = B.grid.getTopLeftPoint(centro);
  B.getFlag = (m, k) => k === "chegada" ? { x: canto.x, y: canto.y } : null;
  const tks = await chegarVarios(B, 19, { areaChegada: 2 });
  const casas = tks.map(tk => B.grid.getOffset({ x: tk.x + B.grid.sizeX / 2, y: tk.y + B.grid.sizeY / 2 }));
  assert.equal(new Set(casas.map(o => `${o.i},${o.j}`)).size, 19);
  for (const o of casas) assert.ok(B.grid.distancia(o, centro) <= 2);
});

test("quadrada, área 1: 9 tokens nos 9 quadrados em volta da bandeira (diagonais incluídas)", async () => {
  const B = criarCena("B", { chegada: { x: 500, y: 500 } });
  const tks = await chegarVarios(B, 9, { areaChegada: 1 });
  const casas = new Set(tks.map(tk => `${tk.x},${tk.y}`));
  assert.equal(casas.size, 9);
  for (const tk of tks) assert.ok(Math.abs(tk.x - 500) <= 100 && Math.abs(tk.y - 500) <= 100, `${tk.x},${tk.y} fora da área`);
});

test("área 0 (padrão): igual a antes, tokens em volta da bandeira e sem aviso de área cheia", async () => {
  const B = criarCena("B", { chegada: { x: 500, y: 500 } });
  const tks = await chegarVarios(B, 3, {});
  assert.deepEqual([tks[0].x, tks[0].y], [500, 500]);
  assert.ok(!avisos.some(a => a.msg.includes("cheia")));
});

test("casasDaArea: 1, 7 e 19 hexágonos para áreas 0, 1 e 2", () => {
  const B = criarCena("B", { hex: true, largura: 3000, altura: 3000 });
  const canto = B.grid.getTopLeftPoint(B.grid.getOffset({ x: 1500, y: 1500 }));
  B.getFlag = (m, k) => k === "chegada" ? { x: canto.x, y: canto.y } : null;
  for (const [raio, total] of [[0, 1], [1, 7], [2, 19]]) {
    preparar({ cenas: [B], config: { areaChegada: raio } });
    assert.equal(viagem.casasDaArea(B).length, total);
  }
});

// ---------- Segunda revisão (2/11/2026)
test("dois envios rápidos para destinos diferentes: um token só, no último destino", async () => {
  const A = criarCena("A"), B = criarCena("B"), C = criarCena("C"), ator = criarAtor("x");
  adicionarToken(A, { actorId: "x" });
  preparar({ cenas: [A, B, C] });
  const u = jogador("u1", ator, "A");
  // o segundo envio sai antes do primeiro terminar, ainda achando que a origem é A
  const r = await Promise.allSettled([viagem.moverTokenDoJogador(u, B, "A"), viagem.moverTokenDoJogador(u, C, "A")]);
  assert.ok(r.every(x => x.status === "fulfilled"));
  assert.equal(deAtor(A, ator) + deAtor(B, ator) + deAtor(C, ator), 1, "um token do personagem no total");
  assert.equal(deAtor(C, ator), 1, "no destino do último envio");
});

test("dois envios rápidos, o primeiro já em andamento: o segundo leva o token de onde ele está agora", async () => {
  const A = criarCena("A"), B = criarCena("B"), C = criarCena("C"), ator = criarAtor("y");
  adicionarToken(A, { actorId: "y" });
  preparar({ cenas: [A, B, C] });
  const u = jogador("u1", ator, "A");
  const primeiro = viagem.moverTokenDoJogador(u, B, "A");
  await new Promise(r => setTimeout(r, 0)); // o primeiro já começou a criar em B
  await Promise.all([primeiro, viagem.moverTokenDoJogador(u, C, "A")]);
  assert.equal(deAtor(A, ator) + deAtor(B, ator) + deAtor(C, ator), 1);
  assert.equal(deAtor(C, ator), 1);
});

test("token maior que o mapa: a transferência para, o original fica e o mestre é avisado", async () => {
  const A = criarCena("A"), B = criarCena("B", { largura: 200, altura: 200 }), ator = criarAtor("g", { width: 3, height: 3 });
  adicionarToken(A, { actorId: "g", width: 3, height: 3 });
  preparar({ cenas: [A, B] });
  const err = await viagem.moverTokenDoJogador(jogador("u1", ator, "A"), B, "A").catch(e => e);
  assert.equal(err?.avisado, true);
  assert.equal(deAtor(A, ator), 1, "original preservado");
  assert.equal(B.tokens.contents.length, 0, "nada criado no mapa pequeno");
  assert.ok(avisos.some(a => a.tipo === "error" && a.msg.includes("Mapa B")));
});

test("token novo (sem token antigo) maior que o mapa: não é criado", async () => {
  const B = criarCena("B", { largura: 200, altura: 200 }), ator = criarAtor("h", { width: 3, height: 3 });
  preparar({ cenas: [B] });
  const err = await viagem.moverTokenDoJogador(jogador("u1", ator, null), B, null).catch(e => e);
  assert.equal(err?.avisado, true);
  assert.equal(B.tokens.contents.length, 0);
});
