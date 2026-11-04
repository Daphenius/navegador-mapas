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

function registrar({ comNativa = true } = {}) {
  montarFoundry();
  globalThis.CONFIG = comNativa ? { Canvas: { sceneTransitions: { fade: { id: "fade", label: "Fade" } } } } : {};
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
    for (const s of a.secoes) { usados.add(s.titulo); for (const c of s.campos) if (c.depende) usados.add(c.depende.texto); }
  }
  const codigo = fs.readFileSync(new URL("../scripts/central.js", import.meta.url), "utf8");
  for (const m of codigo.matchAll(/\bt\("(Central\.[\w.]+)"/g)) usados.add(m[1]);
  for (const lingua of ["pt-BR", "en"]) {
    const lang = JSON.parse(fs.readFileSync(new URL(`../lang/${lingua}.json`, import.meta.url), "utf8")).NM;
    for (const chave of usados) assert.equal(typeof chave.split(".").reduce((o, p) => o?.[p], lang), "string", `${lingua}: NM.${chave}`);
  }
});
