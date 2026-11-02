// Navegador de Mundos — núcleo: constantes, configurações e utilitários usados por todos os arquivos

export const ID = "navegador-mapas";
export const SOCKET = `module.${ID}`;
export const TEMPO_PRECARGA = 120_000;
export const MAX_RECENTES = 6;

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
export function esperarCanvas(limite = 30_000) {
  if (canvas.ready && !canvas.loading) return Promise.resolve();
  return new Promise(resolve => {
    // Se o tempo vencer, tira o gancho para ele não ficar pendurado
    const tm = setTimeout(() => { Hooks.off("canvasReady", id); resolve(); }, limite);
    const id = Hooks.once("canvasReady", () => { clearTimeout(tm); setTimeout(resolve, 300); });
  });
}

export let fila = Promise.resolve();
export function enfileirar(fn) {
  const p = fila.then(fn, fn);
  fila = p.catch(() => {});
  return p;
}

// Configurações e atalho (chamado no init). aoMudarNav: reaplica as opções de ocultar
export function registrarConfig({ aoMudarNav, aoAtalho }) {
  const reg = (chave, dados) => game.settings.register(ID, chave, dados);
  reg("lembrarLugar", {
    name: "NM.Config.LembrarLugar.Nome", hint: "NM.Config.LembrarLugar.Dica",
    scope: "world", config: true, type: Boolean, default: true
  });
  reg("transicao", {
    name: "NM.Config.Transicao.Nome", hint: "NM.Config.Transicao.Dica",
    scope: "world", config: true, type: String, default: "fundo",
    choices: { fundo: "NM.Config.Transicao.Fundo", nome: "NM.Config.Transicao.SoNome", off: "NM.Config.Transicao.Off" }
  });
  reg("liberarAnterior", {
    name: "NM.Config.LiberarAnterior.Nome", hint: "NM.Config.LiberarAnterior.Dica",
    scope: "world", config: true, type: Boolean, default: false
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
