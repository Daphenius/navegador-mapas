// Navegador de Mundos — Central de Configurações.
// Janela própria (ApplicationV2 + Handlebars) com as configurações do módulo organizadas em abas.
// Ela só lê e grava pelas APIs oficiais (game.settings.get/set): nome, dica, tipo, opções e onChange
// vêm do registro original de cada configuração (nucleo.js).
//
// O que o mestre muda fica em "pendentes" e só é gravado em "Salvar alterações", uma configuração
// por vez e só as que mudaram. Se outra janela mudou a mesma configuração enquanto a Central estava
// aberta, pergunta antes de gravar por cima.

import { ID, t, esc } from "./nucleo.js";
import { ABAS_CENTRAL, CHAVES_CENTRAL, opcoesDe, conferirValor } from "./central-mapa.js";

const { ApplicationV2, DialogV2, HandlebarsApplicationMixin } = foundry.applications.api;

const RAIZ = `modules/${ID}/templates`;
const LARGURA_ESTREITA = 620; // abaixo disso as abas vão para o alto e os campos ficam em uma coluna
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const localizar = s => (s ? game.i18n.localize(String(s)) : "");
const registro = chave => game.settings.settings.get(`${ID}.${chave}`);
const nomeDe = chave => localizar(registro(chave)?.name) || chave;

export class CentralConfig extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "navegador-mapas-central",
    classes: ["nm-central"],
    window: { title: "NM.Central.Titulo", icon: "fa-solid fa-map-location-dot", resizable: true },
    position: { width: 820, height: 600 },
    actions: { aba: CentralConfig.#aba, salvar: CentralConfig.#salvar, cancelar: CentralConfig.#cancelar }
  };

  static PARTS = {
    abas: { template: `${RAIZ}/central-abas.hbs` },
    corpo: { template: `${RAIZ}/central-corpo.hbs`, scrollable: [".nm-cc-corpo"] },
    rodape: { template: `${RAIZ}/central-rodape.hbs` }
  };

  aba = ABAS_CENTRAL[0].id;
  originais = new Map(); // valores de quando a janela abriu
  pendentes = new Map(); // mudanças ainda não salvas
  #ganchos = [];
  #salvando = false;
  #ouvindo = false;

  // Só uma Central por vez: o menu do Foundry cria a janela com new, então devolve a que já está aberta
  constructor(options = {}) {
    const aberta = foundry.applications.instances.get("navegador-mapas-central");
    if (aberta instanceof CentralConfig) return aberta;
    super(options);
  }

  // ---------- dados
  #carregarOriginais() {
    this.originais.clear();
    for (const chave of CHAVES_CENTRAL) {
      if (!registro(chave)) continue; // ex.: transição nativa num Foundry sem ela
      try { this.originais.set(chave, foundry.utils.deepClone(game.settings.get(ID, chave))); }
      catch (err) { console.warn(`${ID} | Central: não li ${chave}`, err); }
    }
  }

  valor(chave) { return this.pendentes.has(chave) ? this.pendentes.get(chave) : this.originais.get(chave); }

  #campo(item) {
    const def = registro(item.chave);
    if (!def) return null;
    const valor = this.valor(item.chave);
    const opcoes = opcoesDe(def);
    let tipo = "texto";
    if (def.type === Boolean) tipo = "booleano";
    else if (opcoes && Object.keys(opcoes).length) tipo = "lista";
    else if (def.type === Number) tipo = def.range ? "faixa" : "numero";
    const falta = item.depende && !item.depende.quando(this.valor(item.depende.chave));
    return {
      chave: item.chave, nome: nomeDe(item.chave), dica: localizar(def.hint), valor,
      booleano: tipo === "booleano", lista: tipo === "lista", faixa: tipo === "faixa", numero: tipo === "numero",
      opcoes: tipo === "lista" ? Object.entries(opcoes).map(([k, r]) => ({ valor: k, rotulo: localizar(r), selecionado: String(valor) === k })) : [],
      min: def.range?.min, max: def.range?.max, passo: def.range?.step ?? "any",
      alterado: this.pendentes.has(item.chave),
      desligado: !!falta, depende: falta ? t(item.depende.texto) : ""
    };
  }

  #secoes(aba) {
    return aba.secoes.map(s => {
      const campos = s.campos.map(c => this.#campo(c)).filter(Boolean);
      return campos.length ? { titulo: t(s.titulo), icone: s.icone, campos } : null;
    }).filter(Boolean);
  }

  async _prepareContext() {
    if (!this.originais.size) this.#carregarOriginais();
    const abas = ABAS_CENTRAL.filter(a => this.#secoes(a).length);
    if (!abas.some(a => a.id === this.aba)) this.aba = abas[0]?.id;
    const aba = abas.find(a => a.id === this.aba);
    const pendentesDa = a => a.secoes.flatMap(s => s.campos).filter(c => this.pendentes.has(c.chave)).length;
    return {
      abas: abas.map(a => ({ id: a.id, rotulo: t(a.rotulo), icone: a.icone, ativa: a.id === this.aba, pendentes: pendentesDa(a) })),
      aba: aba ? { rotulo: t(aba.rotulo), icone: aba.icone, lema: t(aba.lema) } : null,
      secoes: aba ? this.#secoes(aba) : [],
      pendentes: this.pendentes.size,
      salvando: this.#salvando,
      textos: {
        modulo: t("Titulo"), salvar: t("Central.Salvar"), cancelar: t("Central.Cancelar"),
        semMudancas: t("Central.SemMudancas"), mudancas: t("Central.Mudancas", { n: this.pendentes.size })
      }
    };
  }

  // ---------- interação
  _onRender(context, options) {
    super._onRender?.(context, options);
    if (this.#ouvindo) return;
    this.#ouvindo = true;
    const el = this.element;
    el.addEventListener("change", ev => this.#mudou(ev));
    el.addEventListener("input", ev => {
      if (ev.target?.type !== "range") return;
      const saida = el.querySelector(`output[data-saida="${ev.target.dataset.chave}"]`);
      if (saida) saida.textContent = ev.target.value;
    });
  }

  _onPosition(position) {
    super._onPosition?.(position);
    this.element?.classList.toggle("nm-cc-estreita", (position?.width ?? this.position.width) < LARGURA_ESTREITA);
  }

  _onFirstRender(context, options) {
    super._onFirstRender?.(context, options);
    // Mudança feita por outra janela ou outro mestre: atualiza o que não está pendente aqui
    const externo = chave => {
      const [ns, k] = String(chave ?? "").split(".");
      if (ns !== ID || !CHAVES_CENTRAL.has(k) || this.#salvando || this.pendentes.has(k)) return;
      try { this.originais.set(k, foundry.utils.deepClone(game.settings.get(ID, k))); } catch { return; }
      this.render({ parts: ["corpo"] });
    };
    this.#ganchos.push(
      ["updateSetting", Hooks.on("updateSetting", doc => externo(doc?.key))],
      ["createSetting", Hooks.on("createSetting", doc => externo(doc?.key))]
    );
  }

  _onClose(options) {
    for (const [gancho, id] of this.#ganchos) Hooks.off(gancho, id);
    this.#ganchos = [];
    this.#ouvindo = false;
    return super._onClose?.(options);
  }

  static lerCampo(alvo, def) {
    if (def.type === Boolean) return !!alvo.checked;
    if (def.type === Number) return alvo.value === "" ? NaN : Number(alvo.value);
    return String(alvo.value);
  }

  #mudou(ev) {
    const alvo = ev.target;
    const chave = alvo?.dataset?.chave;
    const def = chave && registro(chave);
    if (!def) return;
    const v = CentralConfig.lerCampo(alvo, def);
    if (igual(v, this.originais.get(chave))) this.pendentes.delete(chave);
    else this.pendentes.set(chave, v);
    // Campos que dependem deste mudam de estado: redesenha o corpo; senão, só as abas e o rodapé
    const temDependentes = ABAS_CENTRAL.some(a => a.secoes.some(s => s.campos.some(c => c.depende?.chave === chave)));
    this.render({ parts: temDependentes ? ["abas", "corpo", "rodape"] : ["abas", "rodape"] });
    if (!temDependentes) alvo.closest(".nm-cc-campo")?.classList.toggle("alterado", this.pendentes.has(chave));
  }

  static #erro(chave, valor) {
    const def = registro(chave);
    const codigo = def ? conferirValor(def, valor) : "tipo";
    if (!codigo) return "";
    const nome = nomeDe(chave);
    if (codigo === "numero") return t("Central.Erro.Numero", { nome });
    if (codigo === "min") return t("Central.Erro.Min", { nome, min: def.range.min });
    if (codigo === "max") return t("Central.Erro.Max", { nome, max: def.range.max });
    return t("Central.Erro.Invalido", { nome });
  }

  // ---------- ações
  static #aba(ev, alvo) { this.aba = alvo.dataset.aba; this.render({ parts: ["abas", "corpo"] }); }

  static async #cancelar() {
    this.pendentes.clear();
    await this.close({ force: true });
  }

  static async #salvar() {
    if (this.#salvando || !this.pendentes.size) return;
    // 1. confere tudo antes de gravar qualquer coisa
    const erros = [...this.pendentes].map(([k, v]) => CentralConfig.#erro(k, v)).filter(Boolean);
    if (erros.length) return ui.notifications.warn(erros.join(" · "));
    // 2. configurações mudadas por fora desde que a Central abriu
    const conflitos = [...this.pendentes.keys()].filter(k => {
      try { return !igual(game.settings.get(ID, k), this.originais.get(k)); } catch { return false; }
    });
    let pular = new Set();
    if (conflitos.length) {
      const gravar = await DialogV2.confirm({
        window: { title: t("Central.Conflito.Titulo") },
        content: `<p>${t("Central.Conflito.Texto")}</p><ul>${conflitos.map(k => `<li>${esc(nomeDe(k))}</li>`).join("")}</ul><p>${t("Central.Conflito.Pergunta")}</p>`
      });
      if (!gravar) pular = new Set(conflitos);
    }
    // 3. grava uma por vez (cada set dispara o onChange original daquela configuração)
    this.#salvando = true;
    this.render({ parts: ["rodape"] });
    const gravadas = [], falhas = [];
    for (const [k, v] of this.pendentes) {
      if (pular.has(k)) continue;
      try { await game.settings.set(ID, k, v); gravadas.push(k); this.originais.set(k, foundry.utils.deepClone(v)); }
      catch (err) { falhas.push(nomeDe(k)); console.error(`${ID} | Central: não gravei ${k}`, err); }
    }
    for (const k of gravadas) this.pendentes.delete(k);
    for (const k of pular) {
      this.pendentes.delete(k);
      try { this.originais.set(k, foundry.utils.deepClone(game.settings.get(ID, k))); } catch { /* fica o valor antigo */ }
    }
    this.#salvando = false;
    if (falhas.length) ui.notifications.error(t("Central.Falhou", { lista: falhas.join(", ") }));
    else if (gravadas.length) ui.notifications.info(t("Central.Salvo", { n: gravadas.length }));
    this.render({ parts: ["abas", "corpo", "rodape"] });
  }

  // Fechar com alterações não salvas pergunta antes (Cancelar fecha direto)
  async close(options = {}) {
    if (this.pendentes.size && !options.force && !this.#salvando) {
      const ok = await DialogV2.confirm({
        window: { title: t("Central.NaoSalvo.Titulo") },
        content: `<p>${t("Central.NaoSalvo.Texto", { n: this.pendentes.size })}</p>`
      });
      if (!ok) return this;
      this.pendentes.clear();
    }
    this.originais.clear();
    return super.close(options);
  }
}

// Registra o botão da Central nas configurações do Foundry (só o mestre: todas as opções são do mundo)
export function registrarCentral() {
  game.settings.registerMenu(ID, "central", {
    name: "NM.Central.Menu.Nome", label: "NM.Central.Menu.Botao", hint: "NM.Central.Menu.Dica",
    icon: "fa-solid fa-map-location-dot", type: CentralConfig, restricted: true
  });
}
