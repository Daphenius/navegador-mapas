// Testes da transição no envio (simulados). Rodar na pasta do módulo:  node --test
// Cobrem os três modos (nativa, tela do módulo, desligada) e as falhas da nativa: sem tipo válido,
// tipo que o Foundry não conhece e view() recusando a animação. Em todos esses casos o jogador
// tem de ver alguma transição. Testar no Foundry real continua sendo com o autor.
import { test } from "node:test";
import assert from "node:assert/strict";
import { montarFoundry, criarCena, enviados } from "./simulador.mjs";

montarFoundry();
const viagem = await import("../scripts/viagem.js");
const nucleo = await import("../scripts/nucleo.js");
const { registrarSocket } = await import("../scripts/socket.js");

// Mapa de destino com o que a troca usa: view(), miniatura e transição própria
function cenaViagem(id, { transition = null, recusar = false, flags = {} } = {}) {
  const cena = criarCena(id);
  cena.thumb = `thumb-${id}.webp`;
  cena.transition = transition ?? { type: null, duration: null };
  cena.getFlag = (m, k) => flags[k] ?? null;
  cena.views = []; // opções de cada view() chamado
  cena.view = async (opcoes) => {
    cena.views.push(opcoes ?? null);
    if (recusar && opcoes?.transition) throw new Error("transição recusada (simulada)");
    canvas.scene = cena;
    for (const fn of [...ganchos.values()]) fn(canvas);
  };
  return cena;
}

// Ganchos de verdade (o canvasReady avisa que o mapa novo desenhou) e um document mínimo
const ganchos = new Map();
let telas = [];   // telas do módulo colocadas na página
let registros = []; // o que saiu no console (warn/debug)
function preparar({ cenas, config = {}, tipos = { fade: { id: "fade", label: "Fade" }, swirl: { id: "swirl", label: "Swirl" } }, jogador = false }) {
  const m = montarFoundry({ cenas, config: { transicaoNativaTipo: "fade", transicaoNativaDuracao: 1500, transicaoTempo: 1, ...config } });
  ganchos.clear(); telas = []; registros = [];
  let n = 0;
  globalThis.Hooks = {
    on: (nome, fn) => { ganchos.set(++n, fn); return n; },
    once: (nome, fn) => { const id = ++n; ganchos.set(id, (...a) => { ganchos.delete(id); fn(...a); }); return id; },
    off: (nome, id) => ganchos.delete(id)
  };
  globalThis.CONFIG = tipos ? { Canvas: { sceneTransitions: tipos } } : {};
  globalThis.document = {
    createElement: () => ({ className: "", innerHTML: "", offsetHeight: 0, classList: { add() {}, remove() {} }, remove() {}, addEventListener() {} }),
    body: { appendChild: el => telas.push(el) }
  };
  canvas.scene = cenas[0];
  if (jogador) {
    const u = { id: "u1", name: "Jogador", isGM: false, active: true };
    m.users.push(u);
    game.user = u;
  }
  return m;
}
const comConsole = async fn => {
  const orig = { warn: console.warn, debug: console.debug };
  console.warn = (...a) => registros.push(["warn", a.join(" ")]);
  console.debug = (...a) => registros.push(["debug", a.join(" ")]);
  try { return await fn(); } finally { Object.assign(console, orig); }
};
const ir = (id, opcoes = { transicao: true }) => comConsole(() => viagem.irPara(id, opcoes));
const avisou = trecho => registros.some(([tipo, msg]) => tipo === "warn" && msg.includes(trecho));

// ---------- Modo nativa
test("nativa: usa a transição padrão das configurações e não mostra a tela do módulo", async () => {
  const A = cenaViagem("A"), B = cenaViagem("B");
  preparar({ cenas: [A, B], config: { transicao: "nativa", transicaoNativaTipo: "swirl", transicaoNativaDuracao: 2000 } });
  await ir("B");
  assert.deepEqual(B.views, [{ transition: { type: "swirl", duration: 2000 } }]);
  assert.equal(telas.length, 0);
  assert.equal(canvas.scene.id, "B");
});

test("nativa: a transição própria do mapa tem prioridade sobre a padrão", async () => {
  const A = cenaViagem("A"), B = cenaViagem("B", { transition: { type: "swirl", duration: 800 } });
  preparar({ cenas: [A, B], config: { transicao: "nativa" } });
  await ir("B");
  assert.deepEqual(B.views, [{ transition: { type: "swirl", duration: 800 } }]);
  assert.equal(telas.length, 0);
});

test("nativa: tipo do mapa que o Foundry não conhece cai para a padrão das configurações", async () => {
  const A = cenaViagem("A"), B = cenaViagem("B", { transition: { type: "inventada", duration: 800 } });
  preparar({ cenas: [A, B], config: { transicao: "nativa" } });
  await ir("B");
  assert.deepEqual(B.views, [{ transition: { type: "fade", duration: 1500 } }]);
  assert.equal(telas.length, 0);
});

// ---------- Falhas da nativa (o defeito da v4.6.0: o jogador ficava sem nenhuma transição)
test("nativa sem tipo válido: a tela do módulo entra no lugar e o motivo vai para o console", async () => {
  const A = cenaViagem("A"), B = cenaViagem("B", { flags: { transicao: { titulo: "Porto Velho", comentario: "Cheiro de sal" } } });
  preparar({ cenas: [A, B], config: { transicao: "nativa", transicaoNativaTipo: "antiga" } });
  await ir("B");
  assert.equal(telas.length, 1, "tela do módulo mostrada");
  assert.ok(telas[0].innerHTML.includes("Porto Velho") && telas[0].innerHTML.includes("Cheiro de sal"), "com título e comentário do mapa");
  assert.ok(telas[0].innerHTML.includes("thumb-B.webp"), "com a miniatura");
  assert.deepEqual(B.views, [null], "troca normal, sem pedir animação ao Foundry");
  assert.ok(avisou("nativa indisponível") && avisou('"antiga"'));
  assert.equal(canvas.scene.id, "B");
});

test("nativa com a configuração 'nenhuma': a tela do módulo entra no lugar", async () => {
  const A = cenaViagem("A"), B = cenaViagem("B");
  preparar({ cenas: [A, B], config: { transicao: "nativa", transicaoNativaTipo: "none" } });
  await ir("B");
  assert.equal(telas.length, 1);
  assert.ok(avisou("nativa indisponível"));
});

test("nativa recusada pelo Foundry (view lança erro): tela do módulo e troca normal", async () => {
  const A = cenaViagem("A"), B = cenaViagem("B", { recusar: true });
  preparar({ cenas: [A, B], config: { transicao: "nativa" } });
  await ir("B");
  assert.equal(B.views.length, 2, "tentou com a animação e depois sem");
  assert.deepEqual(B.views[1], null);
  assert.equal(telas.length, 1, "tela do módulo mostrada antes da segunda tentativa");
  assert.ok(avisou("recusou a nativa"));
  assert.equal(canvas.scene.id, "B");
});

test("sem registro de transições no Foundry: o tipo escolhido é tentado e, se recusado, a tela do módulo aparece", async () => {
  const A = cenaViagem("A"), B = cenaViagem("B", { recusar: true });
  preparar({ cenas: [A, B], config: { transicao: "nativa" }, tipos: null });
  await ir("B");
  assert.deepEqual(B.views[0], { transition: { type: "fade", duration: 1500 } });
  assert.equal(telas.length, 1);
});

// ---------- Tela do módulo e desligada (não podem mudar)
test("modo 'fundo': tela do módulo com miniatura, título e comentário; nada de nativa", async () => {
  const A = cenaViagem("A"), B = cenaViagem("B", { transition: { type: "swirl", duration: 800 }, flags: { transicao: { titulo: "Cidadela", comentario: "Sinos ao longe" } } });
  preparar({ cenas: [A, B], config: { transicao: "fundo" } });
  await ir("B");
  assert.equal(telas.length, 1);
  for (const parte of ["Cidadela", "Sinos ao longe", "thumb-B.webp", "Carregando"]) assert.ok(telas[0].innerHTML.includes(parte), parte);
  assert.deepEqual(B.views, [null]);
});

test("modo 'nome': tela do módulo sem a miniatura", async () => {
  const A = cenaViagem("A"), B = cenaViagem("B");
  preparar({ cenas: [A, B], config: { transicao: "nome" } });
  await ir("B");
  assert.equal(telas.length, 1);
  assert.ok(telas[0].innerHTML.includes("Mapa B") && !telas[0].innerHTML.includes("thumb-B.webp"));
});

test("modo 'off': troca sem tela e sem animação pedida", async () => {
  const A = cenaViagem("A"), B = cenaViagem("B");
  preparar({ cenas: [A, B], config: { transicao: "off" } });
  await ir("B");
  assert.equal(telas.length, 0);
  assert.deepEqual(B.views, [null]);
  assert.equal(canvas.scene.id, "B");
});

test("troca sem transição pedida (voltar ao último mapa ao entrar): nada aparece, mesmo no modo nativa", async () => {
  const A = cenaViagem("A"), B = cenaViagem("B");
  preparar({ cenas: [A, B], config: { transicao: "nativa" } });
  await ir("B", {});
  assert.equal(telas.length, 0);
  assert.deepEqual(B.views, [null]);
});

test("a segunda tentativa também falha: a tela some, e o erro chega a quem chamou", async () => {
  const A = cenaViagem("A"), B = cenaViagem("B");
  B.view = async () => { throw new Error("mapa não abre"); };
  preparar({ cenas: [A, B], config: { transicao: "nativa" } });
  await assert.rejects(ir("B"), /mapa não abre/);
  assert.equal(telas.length, 1);
  assert.equal(canvas.scene.id, "A");
});

// ---------- Caminho real do jogador: envio individual, grupo e portal chegam todos como "puxar"
test("socket 'puxar' no jogador: no modo nativa sem tipo válido, mostra a tela e confirma a chegada", async () => {
  const A = cenaViagem("A"), B = cenaViagem("B");
  preparar({ cenas: [A, B], config: { transicao: "nativa", transicaoNativaTipo: "antiga" }, jogador: true });
  registrarSocket();
  await comConsole(async () => {
    globalThis.__socket({ acao: "puxar", userIds: ["u1", "u2"], sceneId: "B", op: "op1" }, "gm");
    for (let i = 0; i < 200 && !enviados.some(e => e.acao === "status"); i++) await new Promise(r => setTimeout(r, 20));
  });
  assert.equal(telas.length, 1);
  assert.deepEqual(enviados.find(e => e.acao === "status"), { acao: "status", userId: "u1", sceneId: "B", op: "op1", estado: "chegou" });
});

test("socket 'puxar' de quem não é mestre: ignorado, sem troca e sem tela", async () => {
  const A = cenaViagem("A"), B = cenaViagem("B");
  const m = preparar({ cenas: [A, B], config: { transicao: "fundo" }, jogador: true });
  m.users.push({ id: "u2", name: "Outro", isGM: false, active: true });
  registrarSocket();
  globalThis.__socket({ acao: "puxar", userIds: ["u1"], sceneId: "B", op: "op1" }, "u2");
  await new Promise(r => setTimeout(r, 50));
  assert.equal(telas.length, 0);
  assert.equal(canvas.scene.id, "A");
});

// ---------- Lista de tipos
test("tipos nativos vêm do registro do Foundry (CONFIG.Canvas.sceneTransitions)", () => {
  preparar({ cenas: [cenaViagem("A")], tipos: { fade: { id: "fade", label: "Fade" }, dots: { id: "dots", label: "Dots" } } });
  assert.deepEqual(nucleo.tiposTransicaoNativa(), { fade: "Fade", dots: "Dots" });
});

// ---------- 4.9.0: modo "Transição personalizada"
const propria = await import("../scripts/transicao-propria.js");
class FiltroFalso { static get defaultUniforms() { return {}; } set type(v) {} }
const tiposComBase = () => ({ fade: { id: "fade", label: "Fade", filterType: "fade", filterClass: FiltroFalso } });

test("personalizada: o envio pede ao Foundry a transição do módulo, com a duração dela", async () => {
  const A = cenaViagem("A"), B = cenaViagem("B", { transition: { type: "fade", duration: 800 } });
  preparar({ cenas: [A, B], tipos: tiposComBase(), config: { transicao: "propria", transicaoPropriaDuracao: 2500 } });
  assert.equal(propria.registrarTransicaoPropria(), true);
  await ir("B");
  assert.deepEqual(B.views, [{ transition: { type: "nmPropria", duration: 2500 } }], "vale a personalizada, não a do mapa");
  assert.equal(telas.length, 0);
  assert.equal(canvas.scene.id, "B");
});

test("personalizada que o Foundry não aceitou registrar: a tela do módulo entra no lugar, com o motivo no console", async () => {
  const A = cenaViagem("A"), B = cenaViagem("B");
  preparar({ cenas: [A, B], tipos: null, config: { transicao: "propria" } });
  await comConsole(async () => propria.registrarTransicaoPropria());
  await ir("B");
  assert.equal(telas.length, 1, "tela do módulo mostrada");
  assert.deepEqual(B.views, [null]);
  assert.ok(avisou("nativa indisponível") && avisou("registro de transições"));
});

test("personalizada recusada pelo Foundry na troca: a tela do módulo entra e o mapa troca", async () => {
  const A = cenaViagem("A"), B = cenaViagem("B", { recusar: true });
  preparar({ cenas: [A, B], tipos: tiposComBase(), config: { transicao: "propria" } });
  propria.registrarTransicaoPropria();
  await ir("B");
  assert.equal(telas.length, 1);
  assert.equal(canvas.scene.id, "B");
});

// ---------- 4.10.0: a tela aparece em toda troca de mapa, venha de onde vier
// (Ver/Ativar do Foundry, portais, botões de outros módulos: nada disso passa pelo envio do Navegador)
function trocaPorFora({ config = {}, jogador = true, thumbB = true } = {}) {
  const A = cenaViagem("A"), B = cenaViagem("B", { flags: { transicao: { comentario: "Cheiro de sal" } } });
  if (!thumbB) { B.thumb = null; B.background = { src: "fundo-B.webp" }; }
  preparar({ cenas: [A, B], config: { transicao: "fundo", transicaoSempre: true, transicaoMestre: true, transicaoTempo: 1, ...config }, jogador });
  viagem.zerarTrocaDeMapa();
  canvas.scene = A; viagem.aoMapaPronto(canvas);   // o jogador já estava no mapa A
  return { A, B };
}
const outroMapa = async B => { canvas.scene = B; viagem.aoIniciarMapa(canvas); const naTela = telas.length; viagem.aoMapaPronto(canvas); return naTela; };

test("toda troca: mapa trocado por fora do Navegador mostra a tela, com a miniatura, o nome e Carregando", async () => {
  const { B } = trocaPorFora();
  assert.equal(await outroMapa(B), 1, "a tela entra quando o Foundry começa a montar o mapa novo");
  const html = telas[0].innerHTML;
  assert.ok(html.includes("thumb-B.webp") && html.includes("Mapa B") && html.includes("Carregando") && html.includes("Cheiro de sal"));
  assert.equal(telas[0].className, "nm-transicao imediata", "aparece de uma vez: o mapa já está trocando");
});

test("toda troca: a primeira carga e o mesmo mapa redesenhado não mostram a tela", async () => {
  const { A } = trocaPorFora();
  assert.equal(await outroMapa(A), 0, "mesmo mapa");
  viagem.zerarTrocaDeMapa();
  assert.equal(await outroMapa(A), 0, "primeira carga");
});

test("toda troca: mapa sem miniatura usa a imagem de fundo dele", async () => {
  const { B } = trocaPorFora({ thumbB: false });
  await outroMapa(B);
  assert.ok(telas[0].innerHTML.includes("fundo-B.webp"));
});

test("toda troca: desligada, só para o mestre desligada e nos modos nativa/desligada não mostra", async () => {
  for (const [config, jogador] of [[{ transicaoSempre: false }, true], [{ transicaoMestre: false }, false], [{ transicao: "nativa" }, true], [{ transicao: "off" }, true]]) {
    const { B } = trocaPorFora({ config, jogador });
    assert.equal(await outroMapa(B), 0, JSON.stringify(config));
  }
  const { B } = trocaPorFora({ jogador: false });
  assert.equal(await outroMapa(B), 1, "o mestre vê, com a opção ligada");
});

test("toda troca: sem o aviso de início do Foundry, a tela entra quando o mapa fica pronto", async () => {
  const { B } = trocaPorFora();
  canvas.scene = B; viagem.aoMapaPronto(canvas);
  assert.equal(telas.length, 1);
});

test("toda troca: no envio do Navegador a tela aparece uma vez só", async () => {
  const { B } = trocaPorFora();
  // o view() do mapa dispara os mesmos avisos do Foundry no meio do envio
  const ver = B.view;
  B.view = async o => { canvas.scene = B; viagem.aoIniciarMapa(canvas); await ver(o); viagem.aoMapaPronto(canvas); };
  await ir("B");
  assert.equal(telas.length, 1, "só a tela do envio");
  assert.equal(canvas.scene.id, "B");
});

// ---------- Auditoria de 4/11/2026: trocas rápidas de mapa
test("toda troca: duas trocas seguidas deixam uma tela só, a do mapa que abriu", async () => {
  const { B } = trocaPorFora();
  const C = cenaViagem("C");
  const removidas = [];
  const criar = document.createElement;
  document.createElement = () => { const el = criar(); el.remove = () => removidas.push(el); return el; };
  canvas.scene = B; viagem.aoIniciarMapa(canvas);          // começou a abrir B...
  canvas.scene = C; viagem.aoIniciarMapa(canvas);          // ...e o mapa mudou de novo antes de B ficar pronto
  assert.equal(telas.length, 2);
  assert.deepEqual(removidas, [telas[0]], "a tela de B saiu na hora");
  assert.ok(telas[1].innerHTML.includes("Mapa C"), "na frente fica o nome do mapa que está abrindo");
  viagem.aoMapaPronto(canvas);
  viagem.zerarTrocaDeMapa();
});

test("toda troca: tela de um mapa que não chegou a abrir não fica na frente de outro", async () => {
  const { A, B } = trocaPorFora();
  const removidas = [];
  const criar = document.createElement;
  document.createElement = () => { const el = criar(); el.remove = () => removidas.push(el); return el; };
  canvas.scene = B; viagem.aoIniciarMapa(canvas);
  canvas.scene = A; viagem.aoMapaPronto(canvas);           // a troca foi cancelada: quem ficou pronto foi o mapa A
  assert.deepEqual(removidas, [telas[0]]);
});

// ---------- 4.12.0: o estilo da tela volta a ser posto na página pelo módulo, como na v3.2.0
test("estilo da tela: o módulo põe na página uma vez só, com as regras da v3.2.0", async () => {
  const { injetarEstiloTela, CSS_TELA, ID_ESTILO_TELA } = await import("../scripts/tela-estilo.js");
  const cabeca = [];
  globalThis.document = {
    getElementById: id => cabeca.find(e => e.id === id) ?? null,
    createElement: () => ({}), head: { appendChild: e => cabeca.push(e) }
  };
  injetarEstiloTela(); injetarEstiloTela();
  assert.equal(cabeca.length, 1);
  assert.equal(cabeca[0].id, ID_ESTILO_TELA);
  for (const regra of [".nm-transicao.visivel { opacity: 1; }", "filter: blur(14px) brightness(.35)", "animation: nm-surgir 1.4s ease both", "@keyframes nm-pulsar"])
    assert.ok(cabeca[0].textContent.includes(regra), regra);
  assert.equal(cabeca[0].textContent, CSS_TELA);
  // e o arquivo de estilos do módulo não repete essas regras (uma fonte só)
  const fs = await import("node:fs");
  const arquivo = fs.readFileSync(new URL("../styles/navegador.css", import.meta.url), "utf8");
  assert.equal(/\.nm-transicao[ .{-]/.test(arquivo), false);
});
