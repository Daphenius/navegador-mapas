// Testes da Central de Configurações (simulados). Rodar na pasta do módulo:  node --test
// Conferem que nenhuma configuração se perdeu ao sair da lista padrão do Foundry, que o registro
// de cada uma continua o mesmo e que a validação segue o tipo, as opções e a faixa do registro.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { montarFoundry } from "./simulador.mjs";

montarFoundry();
const nucleo = await import("../scripts/nucleo.js");
const { ABAS_CENTRAL, CHAVES_CENTRAL, conferirValor } = await import("../scripts/central-mapa.js");
const propria = await import("../scripts/transicao-propria.js");

// Filtro de transição de mentira, com o mesmo contrato do filtro do Foundry (TextureTransitionFilter)
class FiltroFalso {
  static get defaultUniforms() { return { progress: 0, type: 1, targetTexture: null }; }
  static _createFragmentShader() { return "programa do Foundry"; }
  static create() { const f = new this(); f.uniforms = { ...this.defaultUniforms }; f.programa = this._createFragmentShader(); return f; }
  get type() { return ["fade", "swirl"][this.uniforms.type]; }
  set type(tipo) { if (!["fade", "swirl"].includes(tipo)) throw new Error("Invalid texture transition type"); this.uniforms.type = ["fade", "swirl"].indexOf(tipo); }
}

function registrar({ comNativa = true } = {}) {
  montarFoundry();
  globalThis.CONFIG = comNativa ? { Canvas: { sceneTransitions: { fade: { id: "fade", label: "Fade", filterType: "fade", filterClass: FiltroFalso } } } } : {};
  if (comNativa) propria.registrarTransicaoPropria();
  globalThis.foundry.documents = { Scene: { schema: { getField: () => null } } };
  const registros = new Map();
  game.settings.register = (m, chave, dados) => registros.set(chave, dados);
  game.keybindings = { register() {} };
  nucleo.registrarConfig({ aoMudarNav() {}, aoAtalho() {}, aoMudarArea() {} });
  return registros;
}

test("toda configuração com nome está na Central e saiu da lista padrão do Foundry", () => {
  const registros = registrar();
  const comNome = [...registros].filter(([, d]) => d.name).map(([k]) => k).sort();
  assert.deepEqual(comNome, [...CHAVES_CENTRAL].sort(), "nenhuma opção ficou sem lugar na Central");
  for (const k of CHAVES_CENTRAL) assert.equal(registros.get(k).config, false, `${k} fora da lista padrão`);
});

test("o registro continua o mesmo: escopo do mundo, tipo, padrão e onChange", () => {
  const registros = registrar();
  for (const k of CHAVES_CENTRAL) assert.equal(registros.get(k).scope, "world", k);
  assert.equal(registros.get("transicao").default, "nativa");
  assert.equal(registros.get("transicaoTempo").default, 3);
  assert.equal(registros.get("areaChegada").type, Number);
  for (const k of ["areaChegada", "ocultarNavMestre", "ocultarNavJogadores", "ocultarAbaCenas"])
    assert.equal(typeof registros.get(k).onChange, "function", `${k} mantém o onChange`);
});

test("Foundry sem transição nativa: as opções dela não são registradas e o padrão é a tela do módulo", () => {
  const registros = registrar({ comNativa: false });
  assert.equal(registros.has("transicaoNativaTipo"), false);
  assert.equal(registros.get("transicao").default, "fundo");
  assert.equal("nativa" in registros.get("transicao").choices, false);
});

test("cada configuração aparece uma vez só, e as dependências apontam para chaves da Central", () => {
  const campos = ABAS_CENTRAL.flatMap(a => a.secoes.flatMap(s => s.campos));
  assert.equal(campos.length, CHAVES_CENTRAL.size);
  for (const c of campos.filter(c => c.depende)) assert.ok(CHAVES_CENTRAL.has(c.depende.chave), c.chave);
  const nativa = campos.find(c => c.chave === "transicaoNativaTipo").depende, tela = campos.find(c => c.chave === "transicaoTempo").depende;
  assert.deepEqual(["nativa", "fundo", "nome", "off"].map(nativa.quando), [true, false, false, false]);
  assert.deepEqual(["nativa", "fundo", "nome", "off"].map(tela.quando), [true, true, true, false]);
});

test("validação segue o registro: tipo, faixa e opções", () => {
  const r = registrar();
  assert.equal(conferirValor(r.get("lembrarLugar"), true), "");
  assert.equal(conferirValor(r.get("lembrarLugar"), "sim"), "tipo");
  assert.equal(conferirValor(r.get("areaChegada"), 3), "");
  assert.equal(conferirValor(r.get("areaChegada"), 9), "max");
  assert.equal(conferirValor(r.get("transicaoTempo"), 0.5), "min");
  assert.equal(conferirValor(r.get("transicaoTempo"), NaN), "numero");
  assert.equal(conferirValor(r.get("transicao"), "fundo"), "");
  assert.equal(conferirValor(r.get("transicao"), "inventada"), "opcao");
  assert.equal(conferirValor(r.get("transicaoTexto"), "Viajando..."), "");
});

test("todos os textos da Central existem em português e em inglês", () => {
  const usados = new Set(["Central.Titulo", "Central.Menu.Nome", "Central.Menu.Botao", "Central.Menu.Dica"]);
  for (const a of ABAS_CENTRAL) {
    usados.add(a.rotulo).add(a.lema);
    for (const s of a.secoes) {
      usados.add(s.titulo); if (s.nota) usados.add(s.nota); if (s.botao) usados.add(s.botao.rotulo);
      for (const c of s.campos) if (c.depende) usados.add(c.depende.texto);
    }
  }
  const codigo = fs.readFileSync(new URL("../scripts/central.js", import.meta.url), "utf8");
  for (const m of codigo.matchAll(/\bt\("(Central\.[\w.]+)"/g)) usados.add(m[1]);
  for (const lingua of ["pt-BR", "en"]) {
    const lang = JSON.parse(fs.readFileSync(new URL(`../lang/${lingua}.json`, import.meta.url), "utf8")).NM;
    for (const chave of usados) assert.equal(typeof chave.split(".").reduce((o, p) => o?.[p], lang), "string", `${lingua}: NM.${chave}`);
  }
});

// ---------- 4.8.0: transição personalizada no registro nativo do Foundry
test("transição personalizada: entra no registro do Foundry e nas listas do módulo", () => {
  const registros = registrar();
  const def = CONFIG.Canvas.sceneTransitions.nmPropria;
  assert.deepEqual([def.id, def.filterType, def.defaultDuration], ["nmPropria", "nmPropria", 1500]);
  assert.deepEqual(propria.estadoPropria(), { ok: true, motivo: "" });
  assert.ok(def.filterClass.prototype instanceof FiltroFalso, "o filtro é feito em cima do filtro do Foundry");
  assert.ok("nmPropria" in registros.get("transicaoNativaTipo").choices(), "aparece em Transição nativa padrão");
  assert.ok("propria" in registros.get("transicao").choices, "e como tipo de transição, logo na primeira opção da aba");
  assert.equal(registros.get("transicaoNativaTipo").default, "fade", "o padrão continua sendo a do Foundry");
  assert.equal(propria.registrarTransicaoPropria(), true, "registrar de novo não duplica nem dá erro");
});

test("transição personalizada: o filtro aceita o nosso tipo sem erro e usa o nosso programa", () => {
  registrar();
  const Filtro = CONFIG.Canvas.sceneTransitions.nmPropria.filterClass;
  const f = Filtro.create();
  f.type = "nmPropria";              // o filtro do Foundry recusaria um tipo que não conhece
  assert.equal(f.type, "nmPropria");
  assert.equal(f.uniforms.type, 0, "por dentro fica no tipo simples do Foundry");
  assert.match(f.programa, /nmMascara/);
  assert.match(f.programa, /uniform float progress;/);
  assert.match(f.programa, /uniform sampler2D targetTexture;/);
});

test("transição personalizada: as opções da Central viram os valores do filtro", () => {
  registrar();
  const cfg = { transicaoPropriaEstilo: "iris", transicaoPropriaCor: "#ff8000", transicaoPropriaDirecao: "esquerda", transicaoPropriaSuave: 0, transicaoPropriaBrilho: 100 };
  game.settings.get = (m, k) => cfg[k];
  const u = CONFIG.Canvas.sceneTransitions.nmPropria.filterClass.defaultUniforms;
  assert.equal(u.nmEstilo, 1);
  assert.deepEqual(u.nmCor.map(v => Math.round(v * 255)), [255, 128, 0]);
  assert.ok(Math.abs(u.nmAngulo - Math.PI) < 1e-9);
  assert.ok(Math.abs(u.nmSuave - 0.01) < 1e-9, "suavidade 0 = corte seco");
  assert.equal(u.nmBrilho, 1);
  assert.equal(u.progress, 0, "mantém o que o filtro do Foundry já tinha");
  // valores em teste na Central valem por cima dos salvos, e saem ao terminar
  propria.definirPrevia({ estilo: "veu" });
  assert.equal(propria.uniformesProprios().nmEstilo, 3);
  propria.definirPrevia(null);
  assert.equal(propria.uniformesProprios().nmEstilo, 1);
  // valores estranhos não quebram
  assert.deepEqual(propria.uniformesProprios({ estilo: "x", cor: "azul", direcao: "?", suave: "a", brilho: 900 }).nmEstilo, 0);
  assert.equal(propria.uniformesProprios({ brilho: 900 }).nmBrilho, 1);
});

test("transição personalizada: Foundry sem transições nativas não registra nada", () => {
  const registros = registrar({ comNativa: false });
  const aviso = console.warn; console.warn = () => {};
  assert.equal(propria.registrarTransicaoPropria(), false);
  console.warn = aviso;
  assert.equal(propria.estadoPropria().ok, false);
  assert.match(propria.estadoPropria().motivo, /registro de transições/, "a Central mostra o motivo");
  assert.equal(registros.has("transicaoPropriaEstilo"), true, "as opções continuam na Central, com o aviso");
});

test("transição personalizada: o nome é o que o mestre escolher, lido na hora", () => {
  registrar();
  const def = CONFIG.Canvas.sceneTransitions.nmPropria;
  const cfg = {};
  game.settings.get = (m, k) => cfg[k];
  game.i18n.localize = k => (k === "NM.Transicao.Propria" ? "Personalizada (Navegador de Mundos)" : k);
  assert.equal(def.label, "Personalizada (Navegador de Mundos)", "em branco: o nome padrão");
  cfg.transicaoPropriaNome = "  Névoa do Viajante ";
  assert.equal(def.label, "Névoa do Viajante");
  assert.equal(nucleo.tiposTransicaoNativa().nmPropria, "Névoa do Viajante", "e é o nome que aparece nas listas do módulo");
});

test("transição personalizada: registro protegido contra mudanças é trocado por uma cópia", () => {
  montarFoundry();
  const protegido = Object.freeze({ fade: { id: "fade", label: "Fade", filterType: "fade", filterClass: FiltroFalso } });
  globalThis.CONFIG = { Canvas: { sceneTransitions: protegido } };
  assert.equal(propria.registrarTransicaoPropria(), true);
  assert.ok(CONFIG.Canvas.sceneTransitions.nmPropria && CONFIG.Canvas.sceneTransitions.fade, "a nossa e as do Foundry");
  // nem o registro nem o lugar dele podem ser mudados: não registra, e diz por quê
  globalThis.CONFIG = { Canvas: Object.freeze({ sceneTransitions: protegido }) };
  const aviso = console.warn; console.warn = () => {};
  assert.equal(propria.registrarTransicaoPropria(), false);
  console.warn = aviso;
  assert.match(propria.estadoPropria().motivo, /não deixou acrescentar/);
});

test("transição personalizada: cor só aceita #rrggbb; direção e brilho dependem do estilo", () => {
  const r = registrar();
  assert.equal(conferirValor(r.get("transicaoPropriaCor"), "#12abEF"), "");
  assert.equal(conferirValor(r.get("transicaoPropriaCor"), "vermelho"), "opcao");
  assert.equal(conferirValor(r.get("transicaoPropriaEstilo"), "iris"), "");
  assert.equal(conferirValor(r.get("transicaoPropriaSuave"), 120), "max");
  const campos = ABAS_CENTRAL.flatMap(a => a.secoes.flatMap(s => s.campos));
  const dir = campos.find(c => c.chave === "transicaoPropriaDirecao").depende, brilho = campos.find(c => c.chave === "transicaoPropriaBrilho").depende;
  assert.deepEqual(["cortina", "iris", "dissolver", "veu"].map(dir.quando), [true, false, false, false]);
  assert.deepEqual(["cortina", "iris", "dissolver", "veu"].map(brilho.quando), [true, true, true, false]);
});

test("transição personalizada: teste na Central avisa quando não há mapa ou recipiente, e toca quando há", async () => {
  registrar();
  globalThis.canvas = { ready: false };
  assert.equal(await propria.testarTransicao(), "sem-mapa");
  globalThis.canvas = { ready: true, app: { stage: { children: [] } } };
  assert.equal(await propria.testarTransicao(), "sem-recipiente");
  const chamadas = [];
  globalThis.canvas = { ready: true, transition: { run: async o => { chamadas.push(o); } } };
  assert.equal(await propria.testarTransicao("nmPropria", 800), "");
  assert.deepEqual(chamadas, [{ fromBlack: true, duration: 800, transitionType: "nmPropria" }]);
  globalThis.canvas = { ready: true, transition: { run: async () => { throw new Error("recusado"); } } };
  const aviso = console.warn; console.warn = () => {};
  assert.equal(await propria.testarTransicao(), "erro");
  console.warn = aviso;
});
