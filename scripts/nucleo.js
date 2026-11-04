// Navegador de Mundos — núcleo: constantes, configurações e utilitários usados por todos os arquivos

export const ID = "navegador-mapas";
export const SOCKET = `module.${ID}`;
export const TEMPO_PRECARGA = 120_000;     // espera máxima pelo pré-carregamento e pela confirmação de chegada
export const MAX_RECENTES = 6;            // mapas recentes mostrados na faixa
export const MAX_RECENTES_GUARDADOS = 12;  // guarda mais do que mostra: favoritos e mapas excluídos saem sem esvaziar a faixa

export const t = (chave, dados) => dados ? game.i18n.format(`NM.${chave}`, dados) : game.i18n.localize(`NM.${chave}`);
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const corDe = c => c?.css ?? (c ? String(c) : "");
export const imgDe = u => u.character?.img || u.avatar || "icons/svg/mystery-man.svg";
export const emitir = data => game.socket.emit(SOCKET, data);
export const cfg = chave => game.settings.get(ID, chave);
export const navEl = () => ui.nav.element;
export const souMestreAtivo = () => game.user === game.users.activeGM;
export const comparar = (a, b) => a.localeCompare(b, game.i18n.lang);
export const ordenar = (lista, modo) => lista.slice().sort((a, b) =>
  modo === "m" ? (a.sort - b.sort) || comparar(a.name, b.name) : comparar(a.name, b.name));

// Etiquetas dos mapas: guardadas em minúsculas; cor escolhida pelo mestre ou tirada do nome
export const etiquetasDe = s => s?.getFlag(ID, "etiquetas") ?? [];
export function corEtiqueta(tag) {
  const cores = cfg("coresEtiquetas") ?? {};
  if (cores[tag]) return cores[tag];
  let h = 0;
  for (const c of tag) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h}, 55%, 42%)`;
}

// Estado compartilhado entre os arquivos: a janela do mestre (existe mesmo fechada)
export const estado = { app: null };

// Pequenos diálogos
export async function pedirTexto(titulo, rotulo, valor = "") {
  const r = await foundry.applications.api.DialogV2.prompt({
    window: { title: titulo },
    content: `<div class="form-group"><label>${esc(rotulo)}</label><input type="text" name="valor" value="${esc(valor)}" autofocus></div>`,
    ok: { label: t("Geral.Salvar"), icon: "fa-solid fa-check", callback: (ev, botao) => botao.form.elements.valor.value },
    rejectClose: false
  });
  return typeof r === "string" ? r.trim() : null;
}

// Jogador: fila de carregamento, troca de mapa, último mapa visitado
const LIMITE_CANVAS_MS = 30_000;  // espera máxima pelo mapa terminar de carregar
const FOLGA_CANVAS_MS = 300;      // folga depois do canvasReady para o mapa assentar
export function esperarCanvas(limite = LIMITE_CANVAS_MS) {
  if (canvas.ready && !canvas.loading) return Promise.resolve();
  return new Promise(resolve => {
    // Se o tempo vencer, tira o gancho para ele não ficar pendurado
    const tm = setTimeout(() => { Hooks.off("canvasReady", id); resolve(); }, limite);
    const id = Hooks.once("canvasReady", () => { clearTimeout(tm); setTimeout(resolve, FOLGA_CANVAS_MS); });
  });
}

// Espera o mapa CERTO terminar de desenhar. Registra o gancho antes da troca, então pega o
// canvasReady mesmo que o Foundry termine de desenhar antes do cena.view() devolver.
// (esperarCanvas sozinho podia ver o mapa antigo ainda "pronto" e liberar cedo demais.)
export function esperarCena(sceneId, limite = LIMITE_CANVAS_MS) {
  return new Promise(resolve => {
    let id = null;
    const tm = setTimeout(() => { Hooks.off("canvasReady", id); resolve(false); }, limite);
    id = Hooks.on("canvasReady", c => {
      if ((c?.scene ?? canvas.scene)?.id !== sceneId) return;
      Hooks.off("canvasReady", id);
      clearTimeout(tm);
      setTimeout(() => resolve(true), FOLGA_CANVAS_MS);
    });
  });
}

let fila = Promise.resolve();
export function enfileirar(fn) {
  const p = fila.then(fn, fn);
  fila = p.catch(() => {});
  return p;
}

// Transição nativa do Foundry 14 (a mesma de "Configurar mapa" > Transition Animation).
// Os tipos são lidos do próprio Foundry, para não depender de nomes fixos.
export function tiposTransicaoNativa() {
  try {
    const campo = foundry.documents.Scene.schema.getField("transition.type");
    let ch = campo?.choices;
    if (typeof ch === "function") ch = ch();
    if (Array.isArray(ch)) ch = Object.fromEntries(ch.map(k => [k, k]));
    if (!ch || typeof ch !== "object") return {};
    // alguns campos guardam { valor: { label } } em vez de { valor: "rótulo" }
    return Object.fromEntries(Object.entries(ch).map(([k, v]) => [k, typeof v === "string" ? v : (v?.label ?? k)]));
  } catch { return {}; }
}
export const ehNenhuma = tipo => !tipo || /^none$/i.test(tipo);

// Configurações e atalho (chamado no init). aoMudarNav: reaplica as opções de ocultar
export function registrarConfig({ aoMudarNav, aoAtalho, aoMudarArea }) {
  const reg = (chave, dados) => game.settings.register(ID, chave, dados);
  reg("lembrarLugar", {
    name: "NM.Config.LembrarLugar.Nome", hint: "NM.Config.LembrarLugar.Dica",
    scope: "world", config: true, type: Boolean, default: true
  });
  const tipos = tiposTransicaoNativa();
  const temNativa = Object.keys(tipos).some(k => !ehNenhuma(k));
  reg("transicao", {
    name: "NM.Config.Transicao.Nome", hint: "NM.Config.Transicao.Dica",
    scope: "world", config: true, type: String, default: temNativa ? "nativa" : "fundo",
    choices: {
      ...(temNativa ? { nativa: "NM.Config.Transicao.Nativa" } : {}),
      fundo: "NM.Config.Transicao.Fundo", nome: "NM.Config.Transicao.SoNome", off: "NM.Config.Transicao.Off"
    }
  });
  if (temNativa) {
    const padrao = Object.keys(tipos).find(k => /fade/i.test(k)) ?? Object.keys(tipos).find(k => !ehNenhuma(k));
    reg("transicaoNativaTipo", {
      name: "NM.Config.TransicaoNativaTipo.Nome", hint: "NM.Config.TransicaoNativaTipo.Dica",
      scope: "world", config: true, type: String, default: padrao,
      choices: Object.fromEntries(Object.entries(tipos).filter(([k]) => !ehNenhuma(k)))
    });
    reg("transicaoNativaDuracao", {
      name: "NM.Config.TransicaoNativaDuracao.Nome", hint: "NM.Config.TransicaoNativaDuracao.Dica",
      scope: "world", config: true, type: Number, default: 1500,
      range: { min: 250, max: 10000, step: 250 }
    });
  }
  reg("transicaoTexto", {
    name: "NM.Config.TransicaoTexto.Nome", hint: "NM.Config.TransicaoTexto.Dica",
    scope: "world", config: true, type: String, default: ""
  });
  reg("transicaoTempo", {
    name: "NM.Config.TransicaoTempo.Nome", hint: "NM.Config.TransicaoTempo.Dica",
    scope: "world", config: true, type: Number, default: 3,
    range: { min: 1, max: 8, step: 0.5 }
  });
  reg("areaChegada", {
    name: "NM.Config.AreaChegada.Nome", hint: "NM.Config.AreaChegada.Dica",
    scope: "world", config: true, type: Number, default: 0,
    range: { min: 0, max: 5, step: 1 }, onChange: aoMudarArea
  });
  reg("ocultarNavMestre", {
    name: "NM.Config.OcultarNavMestre.Nome", hint: "NM.Config.OcultarNavMestre.Dica",
    scope: "world", config: true, type: Boolean, default: false, onChange: aoMudarNav
  });
  reg("ocultarNavJogadores", {
    name: "NM.Config.OcultarNavJogadores.Nome", hint: "NM.Config.OcultarNavJogadores.Dica",
    scope: "world", config: true, type: Boolean, default: false, onChange: aoMudarNav
  });
  reg("ocultarAbaCenas", {
    name: "NM.Config.OcultarAbaCenas.Nome", hint: "NM.Config.OcultarAbaCenas.Dica",
    scope: "world", config: true, type: Boolean, default: false, onChange: aoMudarNav
  });
  reg("coresEtiquetas", { scope: "world", config: false, type: Object, default: {} });
  reg("precarregar", { scope: "client", config: false, type: Boolean, default: true });
  reg("levarToken", { scope: "client", config: false, type: Boolean, default: false });
  reg("pastasFechadas", { scope: "client", config: false, type: Array, default: [] });
  reg("favoritos", { scope: "client", config: false, type: Array, default: [] });
  reg("recentes", { scope: "client", config: false, type: Array, default: [] });
  reg("grupos", { scope: "client", config: false, type: Array, default: [] });

  game.keybindings.register(ID, "abrir", {
    name: "NM.Atalho.Abrir",
    editable: [{ key: "KeyM", modifiers: ["Shift"] }],
    restricted: true,
    onDown: () => { aoAtalho(); return true; }
  });
}
