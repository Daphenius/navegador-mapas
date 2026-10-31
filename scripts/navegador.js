// Navegador de Mundos — Foundry VTT v14
// Aba de mapas com pastas e envio de cada jogador para um mapa diferente
// (estilo Player Page do Roll20). Abre pelo botão na navegação de cenas,
// pela ferramenta de tokens ou com Shift+M.

const ID = "navegador-mapas";
const SOCKET = `module.${ID}`;
const TIPO_PORTAL = `${ID}.portal`;
const TEMPO_PRECARGA = 120_000;
const MAX_RECENTES = 6;

const t = (chave, dados) => dados ? game.i18n.format(`NM.${chave}`, dados) : game.i18n.localize(`NM.${chave}`);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const corDe = c => c?.css ?? (c ? String(c) : "");
const imgDe = u => u.character?.img || u.avatar || "icons/svg/mystery-man.svg";
const emitir = data => game.socket.emit(SOCKET, data);
const cfg = chave => game.settings.get(ID, chave);
const navEl = () => ui.nav?.element ?? document.getElementById("scene-navigation");
const souMestreAtivo = () => game.user === game.users.activeGM;
const comparar = (a, b) => a.localeCompare(b, game.i18n.lang);
const ordenar = (lista, modo) => lista.slice().sort((a, b) =>
  modo === "m" ? (a.sort - b.sort) || comparar(a.name, b.name) : comparar(a.name, b.name));

// Etiquetas dos mapas: guardadas em minúsculas; cor escolhida pelo mestre ou tirada do nome
const etiquetasDe = s => s?.getFlag(ID, "etiquetas") ?? [];
function corEtiqueta(tag) {
  const cores = cfg("coresEtiquetas") ?? {};
  if (cores[tag]) return cores[tag];
  let h = 0;
  for (const c of tag) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h}, 55%, 42%)`;
}

// Estilo
const CSS = `
.navegador-mapas .window-content { padding: 0; }
.nm-root { display: flex; height: 100%; }
.nm-root h3 { margin: 0; font-size: 13px; text-transform: uppercase; opacity: .75; border: none; white-space: nowrap; }
.nm-root h4 { margin: 0 0 6px; font-size: 11px; text-transform: uppercase; opacity: .6; border: none; }

.nm-lateral { width: 250px; flex: none; padding: 10px; border-right: 1px solid rgba(128,128,128,.35);
  overflow-y: auto; display: flex; flex-direction: column; gap: 6px; }
.nm-lista-jog { display: flex; flex-direction: column; gap: 6px; }
.nm-jogador { display: flex; gap: 8px; align-items: center; padding: 6px; border-radius: 8px; cursor: grab;
  border: 1px solid rgba(128,128,128,.3); user-select: none; }
.nm-jogador:hover { background: rgba(128,128,128,.15); }
.nm-jogador.sel { outline: 2px solid #ff8c1a; background: rgba(255,140,26,.15); }
.nm-jogador.offline { opacity: .55; }
.nm-jogador.perdido { border-color: #ffb020; }
.nm-avatar { position: relative; width: 46px; height: 46px; flex: none; border: 2px solid; border-radius: 50%; }
.nm-avatar img { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; border: none; }
.nm-status { position: absolute; right: -2px; bottom: -2px; width: 12px; height: 12px; border-radius: 50%; border: 2px solid #222; }
.nm-status.on { background: #3fbf5f; } .nm-status.off { background: #888; }
.nm-info { min-width: 0; flex: 1; }
.nm-nome { font-weight: bold; }
.nm-ok { color: #3fbf5f; font-size: 11px; } .nm-alerta { color: #ffb020; font-size: 11px; }
.nm-sub { font-size: 11px; opacity: .8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.nm-acao-mini { width: auto; height: 20px; min-height: 0; margin-top: 3px; padding: 0 6px; line-height: 18px; font-size: 11px; }
.nm-opcoes { margin-top: auto; padding-top: 8px; display: flex; flex-direction: column; gap: 4px; font-size: 12px; }
.nm-opcoes label { display: flex; align-items: center; gap: 6px; }
.nm-dica { font-size: 11px; opacity: .65; margin: 4px 0 0; }

.nm-grupos { display: flex; flex-direction: column; gap: 4px; }
.nm-grupo { display: flex; align-items: center; gap: 6px; padding: 4px 6px; border-radius: 6px; cursor: grab;
  border: 1px dashed rgba(128,128,128,.45); user-select: none; }
.nm-grupo:hover { background: rgba(128,128,128,.15); }
.nm-grupo-avatares { display: flex; flex: none; }
.nm-grupo-avatares img { width: 22px; height: 22px; border-radius: 50%; border: 2px solid; object-fit: cover; margin-right: -7px; background: #222; }
.nm-grupo-nome { margin-left: 8px; font-weight: bold; font-size: 12px; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.nm-principal { flex: 1; padding: 10px; overflow-y: auto; }
.nm-principal.alvo { outline: 2px dashed #ff8c1a; outline-offset: -4px; }
.nm-topo { display: flex; gap: 6px; align-items: center; margin-bottom: 8px; }
.nm-topo input { flex: 1; min-width: 80px; }
.nm-btn-topo { flex: none; width: auto; height: 28px; min-height: 0; padding: 0 8px; line-height: 26px; white-space: nowrap; }

.nm-filtro-etq { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; margin-bottom: 8px; font-size: 11px; }
.nm-filtro-etq a { cursor: pointer; text-decoration: underline; opacity: .7; margin-left: 4px; }
.nm-etq { display: inline-block; padding: 0 6px; border-radius: 9px; font-size: 10px; line-height: 16px; color: #fff;
  background: var(--c); white-space: nowrap; }
.nm-etq.filtro { cursor: pointer; opacity: .45; font-size: 11px; line-height: 18px; padding: 0 8px; user-select: none; }
.nm-etq.filtro.on { opacity: 1; box-shadow: 0 0 0 2px #fff inset; }

.nm-faixa { margin-bottom: 10px; padding-bottom: 8px; border-bottom: 1px solid rgba(128,128,128,.25); }

.nm-pasta { margin-bottom: 6px; }
.nm-pasta-cab { display: flex; align-items: center; gap: 6px; padding: 4px 4px 4px 8px; border-radius: 6px;
  background: rgba(0,0,0,.3); border-left: 4px solid var(--cor, #777); cursor: pointer; user-select: none; }
.nm-pasta-cab:hover { background: rgba(128,128,128,.2); }
.nm-pasta.alvo > .nm-pasta-cab { outline: 2px dashed #ff8c1a; }
.nm-pasta-nome { flex: 1; font-weight: bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.nm-pasta-qtd { font-size: 11px; opacity: .6; }
.nm-pasta-presentes { display: flex; gap: 2px; }
.nm-pasta-presentes img { width: 18px; height: 18px; border-radius: 50%; border: 1px solid; object-fit: cover; }
.nm-pasta-corpo { display: none; margin: 6px 0 4px 8px; padding-left: 10px; border-left: 1px dashed rgba(128,128,128,.35); }
.nm-pasta.aberta > .nm-pasta-corpo { display: block; }
.nm-vazia { font-size: 11px; opacity: .5; font-style: italic; padding: 2px 0 6px; }

.nm-grade { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 10px; margin-bottom: 8px; }
.nm-grade.compacta { grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px; margin-bottom: 0; }
.nm-cena { border: 1px solid rgba(128,128,128,.35); border-radius: 8px; overflow: hidden; cursor: pointer;
  transition: transform .15s, box-shadow .15s; user-select: none; }
.nm-cena:hover { transform: translateY(-2px); box-shadow: 0 3px 10px rgba(0,0,0,.35); }
.nm-cena.ativa { border-color: #3fbf5f; }
.nm-cena.alvo { outline: 3px dashed #ff8c1a; transform: scale(1.03); }
.nm-cena.antes { box-shadow: -5px 0 0 #ff8c1a; }
.nm-cena.depois { box-shadow: 5px 0 0 #ff8c1a; }
.nm-thumb { position: relative; height: 105px; background: #333 center/cover no-repeat; }
.nm-cena.compacta .nm-thumb { height: 64px; }
.nm-thumb-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; border: none; pointer-events: none; }
.nm-sem-thumb { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 26px; opacity: .25; }
.nm-tag { position: absolute; top: 5px; left: 5px; background: #3fbf5f; color: #fff; font-size: 10px;
  padding: 1px 6px; border-radius: 4px; font-weight: bold; }
.nm-tag-eu { left: auto; right: 5px; background: #2b6cd4; }
.nm-pre { position: absolute; top: 5px; right: 5px; background: rgba(0,0,0,.65); color: #fff; font-size: 10px; padding: 1px 6px; border-radius: 4px; }
.nm-cena.minha .nm-pre { top: 26px; }
.nm-presentes { position: absolute; bottom: 4px; left: 4px; right: 4px; display: flex; flex-wrap: wrap; gap: 3px; }
.nm-mini { position: relative; width: 26px; height: 26px; }
.nm-mini img { width: 26px; height: 26px; border-radius: 50%; border: 2px solid; object-fit: cover; background: #222; }
.nm-mini.indo img { opacity: .45; }
.nm-mini.perdido img { border-style: dashed; }
.nm-mini i { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 12px; }
.nm-mini.perdido i { inset: auto -3px -3px auto; font-size: 11px; color: #ffb020; text-shadow: 0 0 3px #000; }
.nm-rodape { display: flex; align-items: center; gap: 4px; padding: 5px 4px 5px 8px; }
.nm-cena-nome { flex: 1; font-weight: bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.nm-icone { font-size: 10px; opacity: .55; }
.nm-menu-btn, .nm-estrela { flex: none; width: 24px; height: 24px; min-height: 0; padding: 0; line-height: 24px; }
.nm-estrela { background: none; border: none; opacity: .35; }
.nm-estrela.on { opacity: 1; color: #ffc531; }
.nm-cena:hover .nm-estrela { opacity: 1; }
.nm-info-cena { display: flex; flex-wrap: wrap; gap: 3px; align-items: center; padding: 0 8px 6px; min-width: 0; }
.nm-nota { flex-basis: 100%; font-size: 11px; opacity: .75; font-style: italic; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.nm-vazio { opacity: .6; font-style: italic; }

.nm-menu { position: fixed; z-index: 100001; min-width: 250px; padding: 4px; border-radius: 8px;
  background: #1d1b22; color: #eee; border: 1px solid rgba(255,255,255,.15); box-shadow: 0 6px 20px rgba(0,0,0,.5); }
.nm-menu-item { padding: 6px 10px; border-radius: 5px; cursor: pointer; font-size: 13px; }
.nm-menu-item i { width: 18px; text-align: center; margin-right: 6px; opacity: .85; }
.nm-menu-item:hover { background: rgba(255,140,26,.25); }
.nm-menu-item.perigo { color: #ff7a7a; }
.nm-menu-sep { height: 1px; margin: 4px 6px; background: rgba(255,255,255,.12); }

.nm-fantasma { position: fixed; z-index: 100000; pointer-events: none; opacity: .9; }
.nm-fantasma.grupo { display: flex; align-items: center; }
.nm-fantasma.grupo img { position: relative; width: 42px; height: 42px; border-radius: 50%; border: 2px solid; object-fit: cover; background: #222; margin-right: -18px; }
.nm-fantasma.grupo .nm-qtd { position: relative; z-index: 20; margin-left: 22px; background: #ff8c1a; color: #fff; font-weight: bold;
  font-size: 12px; padding: 1px 7px; border-radius: 10px; }
.nm-sel-info[hidden] { display: none !important; }
.nm-sel-info { font-size: 11px; color: #ff8c1a; display: flex; justify-content: space-between; align-items: center; gap: 6px; }
.nm-sel-info a { cursor: pointer; text-decoration: underline; }
.nm-fantasma.etiqueta { padding: 4px 10px; background: #1d1b22; color: #fff; border-radius: 6px; border: 1px solid #ff8c1a; font-size: 12px; }

.nm-form .form-group { margin-bottom: 8px; }
.nm-form textarea { width: 100%; min-height: 60px; resize: vertical; }
.nm-form .hint { font-size: 11px; opacity: .7; margin: 2px 0 0; }

.nm-nav-botao { flex: none; width: var(--control-size, 32px); height: var(--control-size, 32px);
  display: inline-flex; align-items: center; justify-content: center; cursor: pointer; pointer-events: all; }
.nm-nav-grupo { display: inline-flex; align-items: center; gap: 4px; flex: none; }
.nm-nav-flutuante { position: absolute; top: 0; left: 100%; margin-left: 6px; }
body.nm-ocultar-nav-mestre :is(#scene-navigation, .nm-nav) > :not(.nm-nav-botao, .nm-nav-grupo) { display: none !important; }
body.nm-ocultar-nav-mestre .nm-nav-grupo > :not(.nm-nav-botao) { display: none !important; }
body.nm-ocultar-nav-mestre .nm-nav-flutuante { position: static; margin-left: 0; }
body.nm-ocultar-nav-jogador :is(#scene-navigation, .nm-nav) { display: none !important; }

body.nm-ocultar-aba-cenas #sidebar-tabs [data-tab="scenes"],
body.nm-ocultar-aba-cenas #sidebar-tabs li:has(> [data-tab="scenes"]),
body.nm-ocultar-aba-cenas #sidebar #scenes { display: none !important; }

body.nm-escolhendo #board { cursor: crosshair !important; }

.nm-transicao { position: fixed; inset: 0; z-index: 2147483000; background: #000; overflow: hidden;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  opacity: 0; transition: opacity .5s ease; pointer-events: all; }
.nm-transicao.visivel { opacity: 1; }
.nm-transicao-fundo { position: absolute; inset: -30px; background: center/cover no-repeat; filter: blur(14px) brightness(.35); }
.nm-transicao-nome { position: relative; padding: 0 30px; text-align: center; color: #f3e9d2; font-size: clamp(36px, 6vw, 72px);
  font-family: "Modesto Condensed", "Signika", serif; letter-spacing: 2px; text-shadow: 0 0 24px #000, 0 0 6px #000;
  animation: nm-surgir 1.4s ease both; }
.nm-transicao-linha { position: relative; width: min(420px, 60vw); height: 1px; margin: 14px 0 10px;
  background: linear-gradient(90deg, transparent, #f3e9d2aa, transparent); animation: nm-surgir 1.4s .2s ease both; }
.nm-transicao-sub { position: relative; color: #ddd; opacity: .7; font-size: 15px; letter-spacing: 3px; text-transform: uppercase;
  animation: nm-pulsar 1.6s ease-in-out infinite; }
@keyframes nm-surgir { from { opacity: 0; transform: translateY(8px); letter-spacing: 8px; } to { opacity: 1; transform: none; } }
@keyframes nm-pulsar { 50% { opacity: .3; } }
`;
function injetarEstilo() {
  if (document.getElementById("nm-estilo")) return;
  const st = document.createElement("style");
  st.id = "nm-estilo";
  st.textContent = CSS;
  document.head.appendChild(st);
}

let app = null;
function abrir() {
  if (!game.user.isGM) return ui.notifications.warn(t("Aviso.SoMestre"));
  injetarEstilo();
  app ??= new NavegadorMapas();
  app.render({ force: true });
}

// Pequenos diálogos
async function pedirTexto(titulo, rotulo, valor = "") {
  const r = await foundry.applications.api.DialogV2.prompt({
    window: { title: titulo },
    content: `<div class="form-group"><label>${esc(rotulo)}</label><input type="text" name="valor" value="${esc(valor)}" autofocus></div>`,
    ok: { label: t("Geral.Salvar"), icon: "fa-solid fa-check", callback: (ev, botao) => botao.form.elements.valor.value },
    rejectClose: false
  });
  return typeof r === "string" ? r.trim() : null;
}

// Jogador: fila de carregamento, troca de mapa, último mapa visitado
function esperarCanvas(limite = 30_000) {
  if (canvas.ready && !canvas.loading) return Promise.resolve();
  return new Promise(resolve => {
    const tm = setTimeout(resolve, limite);
    Hooks.once("canvasReady", () => { clearTimeout(tm); setTimeout(resolve, 300); });
  });
}

let fila = Promise.resolve();
function enfileirar(fn) {
  const p = fila.then(fn, fn);
  fila = p.catch(() => {});
  return p;
}

// Descarregar mapas da memória
const TL = foundry.canvas.TextureLoader;

// O cache de texturas não expõe a lista de chaves; guardamos cada uma ao entrar
// para poder excluir da limpeza tudo que não pertence ao mapa descarregado.
const chavesCache = new Set();
{
  const original = TL.prototype.setCache;
  TL.prototype.setCache = function (src, asset) {
    chavesCache.add(src);
    return original.call(this, src, asset);
  };
}

const EXT_MIDIA = /\.(webp|png|jpe?g|gif|svg|avif|bmp|tiff?|webm|mp4|m4v|ogv|ogg)(\?.*)?$/i;
const normalizar = src => {
  try { src = decodeURIComponent(String(src)); } catch { src = String(src); }
  return src.replace(/^https?:\/\/[^/]+/i, "").replace(/^\/+/, "").replace(/\?.*$/, "");
};

// Imagens e vídeos usados por um mapa (níveis, tiles, tokens, notas, desenhos)
function fontesDaCena(cena) {
  const fontes = new Set();
  if (!cena) return fontes;
  const vistos = new WeakSet();
  const varrer = (v, chave) => {
    if (chave === "thumb") return; // a miniatura fica para a janela
    if (typeof v === "string") { if (EXT_MIDIA.test(v)) fontes.add(v); }
    else if (v && typeof v === "object" && !vistos.has(v)) {
      vistos.add(v);
      if (Array.isArray(v)) v.forEach(x => varrer(x));
      else for (const [k, x] of Object.entries(v)) varrer(x, k);
    }
  };
  varrer(cena.toObject?.() ?? cena);
  return fontes;
}

// Tira da memória deste navegador as texturas de um mapa (sceneId = null: todos os mapas fora de uso)
function descarregarLocal(sceneId) {
  return enfileirar(async () => {
    const loader = TL.loader;
    if (!loader) return { bytes: 0, motivo: "sem-suporte" };
    await esperarCanvas();

    const atual = canvas.scene;
    if (sceneId && atual?.id === sceneId) return { bytes: 0, motivo: "em-uso" };

    const alvo = new Set();
    const cenas = sceneId ? [game.scenes.get(sceneId)] : game.scenes.filter(s => s.id !== atual?.id);
    for (const s of cenas) for (const f of fontesDaCena(s)) alvo.add(normalizar(f));
    // O que o mapa atual também usa fica (ex.: token do personagem)
    for (const f of fontesDaCena(atual)) alvo.delete(normalizar(f));
    if (!alvo.size) return { bytes: 0, motivo: "nada" };

    const exclude = new Set();
    for (const k of chavesCache) if (!alvo.has(normalizar(k))) exclude.add(k);

    // CACHE_TTL negativo faz tudo que não foi excluído contar como expirado
    const antes = TL.approximateTotalMemoryUsage;
    const ttl = TL.CACHE_TTL;
    try {
      TL.CACHE_TTL = -1;
      await loader.expireCache({ exclude });
    } finally {
      TL.CACHE_TTL = ttl;
    }
    for (const k of [...chavesCache]) if (alvo.has(normalizar(k))) chavesCache.delete(k);
    return { bytes: Math.max(0, antes - TL.approximateTotalMemoryUsage) };
  });
}

const mb = bytes => `${(bytes / 1048576).toFixed(bytes >= 10485760 ? 0 : 1)} MB`;

function limparBarras(atraso = 1500) {
  setTimeout(() => {
    if (canvas.loading) return;
    document.querySelectorAll("#notifications > *, #notifications li").forEach(n => {
      if (/^\s*(99|100)\s*%/.test(n.textContent ?? "")) n.remove();
    });
  }, atraso);
}

function precarregarLocal(sceneId) {
  return enfileirar(async () => {
    const cena = game.scenes.get(sceneId);
    if (!cena || canvas.scene?.id === cena.id) return;
    await esperarCanvas();
    await game.scenes.preload(sceneId);
    limparBarras();
  });
}

// Tela de transição: nome do mapa (o nome que os jogadores veem) enquanto ele carrega
async function mostrarTransicao(cena) {
  const modo = cfg("transicao");
  if (modo === "off") return null;
  const el = document.createElement("div");
  el.className = "nm-transicao";
  const fundo = modo === "fundo" && cena.thumb
    ? `<div class="nm-transicao-fundo" style="background-image:url('${esc(cena.thumb)}')"></div>` : "";
  el.innerHTML = `${fundo}
    <div class="nm-transicao-nome">${esc(cena.navName || cena.name)}</div>
    <div class="nm-transicao-linha"></div>
    <div class="nm-transicao-sub">${esc(t("Transicao.Carregando"))}</div>`;
  document.body.appendChild(el);
  el._inicio = Date.now();
  el._seguranca = setTimeout(() => el.remove(), 90_000);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add("visivel")));
  await new Promise(r => setTimeout(r, 550));
  return el;
}

async function esconderTransicao(el) {
  if (!el) return;
  const falta = 1600 - (Date.now() - el._inicio); // fica tempo suficiente para ler o nome
  if (falta > 0) await new Promise(r => setTimeout(r, falta));
  clearTimeout(el._seguranca);
  el.classList.remove("visivel");
  setTimeout(() => el.remove(), 700);
}

// Ao chegar, seleciona o token do jogador e centraliza a câmera nele
function focarToken() {
  try {
    const char = game.user.character;
    const tokens = canvas.tokens?.placeables ?? [];
    const tk = (char && tokens.find(x => x.document.actorId === char.id && x.isOwner)) ?? tokens.find(x => x.isOwner && x.actor?.hasPlayerOwner);
    if (!tk) return;
    tk.control({ releaseOthers: true });
    canvas.animatePan({ x: tk.center.x, y: tk.center.y, duration: 600 });
  } catch (err) { console.warn(`${ID} |`, err); }
}

function irPara(sceneId, { transicao = false } = {}) {
  return enfileirar(async () => {
    const cena = game.scenes.get(sceneId);
    if (!cena) return;
    await esperarCanvas();
    if (canvas.scene?.id === cena.id) return;
    const tela = transicao ? await mostrarTransicao(cena) : null;
    try {
      await cena.view();
      await esperarCanvas();
    } finally {
      esconderTransicao(tela);
    }
    limparBarras();
    focarToken();
  });
}

// O jogador sempre volta para o último mapa em que esteve
let podeGravar = false;
async function gravarLugar() {
  if (game.user.isGM || !podeGravar) return;
  const id = canvas.scene?.id;
  if (!id || game.user.getFlag(ID, "cena") === id) return;
  try { await game.user.setFlag(ID, "cena", id); }
  catch { emitir({ acao: "gravar", userId: game.user.id, sceneId: id }); } // sem permissão, o mestre grava
}

// Música do mapa
// "local": só quem está no mapa ouve (toca no navegador dele).
// "todos": o mestre toca a playlist nativa para a mesa inteira.
let musicaLocal = null;
function sonsDaMusica(m) {
  const pl = game.playlists.get(m.playlist);
  if (pl) return { sons: pl.sounds.contents.filter(s => s.path).sort((a, b) => a.sort - b.sort)
    .map(s => ({ path: s.path, volume: s.volume ?? 0.5 })), aleatorio: pl.mode === CONST.PLAYLIST_MODES.SHUFFLE };
  return { sons: m.sons ?? [], aleatorio: !!m.aleatorio }; // cópia guardada no mapa (jogador sem acesso à playlist)
}

async function tocarLocal(m) {
  if (musicaLocal?.playlist === m.playlist) return;
  pararLocal();
  const { sons, aleatorio } = sonsDaMusica(m);
  if (!sons.length) return;
  const atual = musicaLocal = { playlist: m.playlist, som: null, indice: aleatorio ? Math.floor(Math.random() * sons.length) : 0 };
  const tocar = async () => {
    if (musicaLocal !== atual) return;
    const faixa = sons[atual.indice % sons.length];
    const som = await foundry.audio.AudioHelper.play({ src: faixa.path, volume: faixa.volume, loop: sons.length === 1, channel: "music" }, false);
    if (musicaLocal !== atual) return som?.stop?.();
    atual.som = som;
    // Mais de uma faixa: ao terminar, vai para a próxima (ou outra aleatória)
    if (sons.length > 1) som?.addEventListener?.("end", () => {
      atual.indice = aleatorio ? Math.floor(Math.random() * sons.length) : atual.indice + 1;
      tocar();
    }, { once: true });
  };
  await tocar().catch(err => console.warn(`${ID} | não consegui tocar a música do mapa`, err));
}

function pararLocal() {
  const som = musicaLocal?.som;
  musicaLocal = null;
  if (!som) return;
  try { som.fade?.(0, { duration: 1500 }); setTimeout(() => som.stop?.(), 1600); }
  catch { som.stop?.(); }
}

function atualizarMusicaLocal() {
  if (game.user.isGM) return;
  const m = canvas.scene?.getFlag(ID, "musica");
  if (m?.modo === "local" && m.playlist) tocarLocal(m);
  else pararLocal();
}

const tocandoAgora = new Set();
async function tocarParaTodos(cena) {
  const m = cena?.getFlag(ID, "musica");
  if (m?.modo !== "todos" || !m.playlist || tocandoAgora.has(cena.id)) return;
  const pl = game.playlists.get(m.playlist);
  if (!pl || pl.playing) return;
  tocandoAgora.add(cena.id);
  setTimeout(() => tocandoAgora.delete(cena.id), 3000);
  try {
    if (m.pararOutras) for (const p of game.playlists.playing ?? []) if (p !== pl) await p.stopAll();
    await pl.playAll();
  } catch (err) { console.warn(`${ID} | não consegui tocar a playlist`, err); }
}

async function aoReceberJogador(data) {
  const status = estado => emitir({ acao: "status", userId: game.user.id, sceneId: data.sceneId, estado });
  if (data.acao === "ping") return emitir({ acao: "pong", userId: game.user.id });
  if (!data.userIds?.includes(game.user.id)) return;

  if (data.acao === "precarregar") {
    try { await precarregarLocal(data.sceneId); status("pronto"); }
    catch (err) { console.error(err); status("erro-pre"); }
  }
  if (data.acao === "puxar") {
    try { await irPara(data.sceneId, { transicao: true }); status("chegou"); }
    catch (err) { console.error(err); status("erro"); }
  }
  if (data.acao === "descarregar") {
    try {
      const r = await descarregarLocal(data.sceneId);
      emitir({ acao: "status", userId: game.user.id, sceneId: data.sceneId, estado: "descarregado", bytes: r.bytes, motivo: r.motivo });
    } catch (err) { console.error(err); }
  }
}

// Tokens: ponto de chegada e casas livres
const reservas = new Map(); // sceneId -> Set("col,lin") reservadas por alguns segundos

// Centro de uma Região (pelos formatos dela), em qualquer mapa
async function centroDaRegiao(uuid) {
  const r = uuid ? await fromUuid(uuid) : null;
  if (!r) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const inclui = (x, y) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
  for (const s of r.shapes ?? []) {
    if (s.hole) continue;
    if (s.type === "rectangle") { inclui(s.x, s.y); inclui(s.x + s.width, s.y + s.height); }
    else if (s.type === "ellipse") { inclui(s.x - s.radiusX, s.y - s.radiusY); inclui(s.x + s.radiusX, s.y + s.radiusY); }
    else if (s.type === "circle") { inclui(s.x - s.radius, s.y - s.radius); inclui(s.x + s.radius, s.y + s.radius); }
    else if (s.type === "polygon") for (let i = 0; i < (s.points?.length ?? 0); i += 2) inclui(s.points[i], s.points[i + 1]);
    else if (Number.isFinite(s.x) && Number.isFinite(s.y)) inclui(s.x, s.y);
  }
  return Number.isFinite(x0) ? { x: (x0 + x1) / 2, y: (y0 + y1) / 2 } : null;
}

// Casa livre mais perto do ponto (ponto de chegada do mapa, ou o centro), em espiral
function vagaLivre(destino, centro = null) {
  const d = destino.dimensions;
  const gs = d.size;
  const ref = centro ?? destino.getFlag(ID, "chegada") ?? { x: d.sceneX + d.sceneWidth / 2, y: d.sceneY + d.sceneHeight / 2 };
  const cx = Math.floor(ref.x / gs) * gs;
  const cy = Math.floor(ref.y / gs) * gs;
  const res = reservas.get(destino.id) ?? new Set();
  reservas.set(destino.id, res);
  const ocupadas = new Set(destino.tokens.map(tk => `${Math.round(tk.x / gs)},${Math.round(tk.y / gs)}`));
  const dentro = (x, y) => x >= d.sceneX && y >= d.sceneY && x + gs <= d.sceneX + d.sceneWidth && y + gs <= d.sceneY + d.sceneHeight;
  for (let raio = 0; raio <= 8; raio++) {
    for (let dy = -raio; dy <= raio; dy++) for (let dx = -raio; dx <= raio; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== raio) continue;
      const x = cx + dx * gs, y = cy + dy * gs;
      const k = `${Math.round(x / gs)},${Math.round(y / gs)}`;
      if (ocupadas.has(k) || res.has(k) || !dentro(x, y)) continue;
      // Reserva a casa: vários tokens enviados juntos não caem no mesmo lugar
      res.add(k);
      setTimeout(() => res.delete(k), 5000);
      return { x, y };
    }
  }
  return { x: cx, y: cy };
}

// Leva um token existente para outro mapa (mantém vida, efeitos e configurações dele)
async function moverTokenPara(tokenDoc, destino, centro = null) {
  const origem = tokenDoc.parent;
  const dados = tokenDoc.toObject();
  for (const k of Object.keys(dados)) if (k.startsWith("_")) delete dados[k];
  Object.assign(dados, vagaLivre(destino, centro));
  delete dados.level;
  if (destino.initialLevel) dados.level = destino.initialLevel.id;
  const [novo] = await destino.createEmbeddedDocuments("Token", [dados]);
  if (origem && origem.id !== destino.id) await tokenDoc.delete();
  return novo;
}

// Token do personagem do jogador no mapa de destino
async function moverTokenDoJogador(user, destino, origemId = user.viewedScene ?? user.getFlag(ID, "cena")) {
  const ator = user.character;
  if (!ator || destino.tokens.some(tk => tk.actorId === ator.id)) return;
  const origem = game.scenes.get(origemId);
  const antigo = origem && origem.id !== destino.id ? origem.tokens.find(tk => tk.actorId === ator.id) : null;
  if (antigo) return moverTokenPara(antigo, destino);

  const dados = vagaLivre(destino);
  if (destino.initialLevel) dados.level = destino.initialLevel.id;
  const novo = await ator.getTokenDocument(dados, { parent: destino });
  await destino.createEmbeddedDocuments("Token", [novo.toObject()]);
}

// Deixa a animação do movimento terminar antes de sumir com o token
async function esperarAnimacao(tokenDoc) {
  try {
    const nome = tokenDoc?.object?.animationName;
    const CA = foundry.canvas?.animation?.CanvasAnimation ?? globalThis.CanvasAnimation;
    if (nome && CA) await CA.getAnimation(nome)?.promise;
  } catch {}
}

// Portais: um token entra numa Região com o comportamento "Portal" e vai para outro mapa
const emPortal = new Set();
function pedirPortal(dados) {
  if (emPortal.has(dados.tokenUuid)) return;
  emPortal.add(dados.tokenUuid);
  setTimeout(() => emPortal.delete(dados.tokenUuid), 3000);
  if (souMestreAtivo()) return executarPortal(dados);
  if (!game.users.activeGM) return ui.notifications.warn(t("Portal.SemMestre"));
  emitir({ acao: "portal", ...dados });
}

const portaisEmCurso = new Set();
async function executarPortal({ tokenUuid, sceneId, regiaoUuid, confirmar }) {
  if (portaisEmCurso.has(tokenUuid)) return;
  portaisEmCurso.add(tokenUuid);
  try {
    const tokenDoc = await fromUuid(tokenUuid);
    const cena = game.scenes.get(sceneId);
    if (!tokenDoc || !cena || tokenDoc.parent?.id === cena.id) return;
    const ator = tokenDoc.actor;
    const jogadores = game.users.filter(u => !u.isGM &&
      (u.character?.id === tokenDoc.actorId || (ator && ator.testUserPermission(u, "OWNER"))));

    if (confirmar) {
      const ok = await foundry.applications.api.DialogV2.confirm({
        window: { title: t("Portal.Nome") },
        content: `<p>${t("Portal.Pergunta", { token: esc(tokenDoc.name), mapa: esc(cena.name) })}</p>`,
        rejectClose: false
      });
      if (!ok) return;
    }
    await moverTokenPara(tokenDoc, cena, await centroDaRegiao(regiaoUuid));
    if (jogadores.length) await app.enviarVarios(jogadores.map(u => u.id), cena.id, { semToken: true });
    else tocarParaTodos(cena);
  } catch (err) {
    console.error(err);
    ui.notifications.error(t("Portal.Erro"));
  } finally {
    setTimeout(() => portaisEmCurso.delete(tokenUuid), 2000);
  }
}

function registrarPortal() {
  const Base = foundry.data?.regionBehaviors?.RegionBehaviorType;
  const EV = CONST.REGION_EVENTS;
  if (!Base || !EV?.TOKEN_MOVE_IN) return console.warn(`${ID} | esta versão não tem Comportamentos de Região; portais desligados`);
  const f = foundry.data.fields;

  class PortalNavegador extends Base {
    static LOCALIZATION_PREFIXES = ["NM.Portal"];

    static defineSchema() {
      return {
        destino: new f.DocumentUUIDField({ type: "Scene" }),
        regiao: new f.DocumentUUIDField({ type: "Region" }),
        confirmar: new f.BooleanField({ initial: false })
      };
    }

    static async _aoEntrar(event) {
      if (!event.user?.isSelf || !this.destino) return;
      const tokenDoc = event.data?.token;
      if (!tokenDoc) return;
      const cena = await fromUuid(this.destino);
      if (!cena || cena.id === tokenDoc.parent?.id) return;
      await esperarAnimacao(tokenDoc);
      pedirPortal({ tokenUuid: tokenDoc.uuid, sceneId: cena.id, regiaoUuid: this.regiao || null, confirmar: !!this.confirmar });
    }

    static events = { [EV.TOKEN_MOVE_IN]: this._aoEntrar };
  }

  CONFIG.RegionBehavior.dataModels[TIPO_PORTAL] = PortalNavegador;
  CONFIG.RegionBehavior.typeIcons[TIPO_PORTAL] = "fa-solid fa-dungeon";
  if (CONFIG.RegionBehavior.typeLabels) CONFIG.RegionBehavior.typeLabels[TIPO_PORTAL] = "NM.Portal.Nome";
}

// Ponto de chegada: escolher com um clique no mapa e mostrar a bandeirinha para o mestre
function escolherPontoNoCanvas() {
  return new Promise(resolve => {
    const view = canvas.app?.view ?? canvas.app?.canvas;
    if (!view) return resolve(null);
    const ac = new AbortController();
    const op = { capture: true, signal: ac.signal };
    document.body.classList.add("nm-escolhendo");
    const fim = v => { ac.abort(); document.body.classList.remove("nm-escolhendo"); resolve(v); };
    document.addEventListener("pointerdown", ev => {
      if (ev.target !== view) return;
      ev.stopPropagation(); ev.preventDefault();
      if (ev.button !== 0) return fim(null); // botão direito cancela
      const p = canvas.canvasCoordinatesFromClient?.({ x: ev.clientX, y: ev.clientY })
        ?? canvas.stage.worldTransform.applyInverse({ x: ev.clientX, y: ev.clientY });
      fim({ x: p.x, y: p.y });
    }, op);
    document.addEventListener("keydown", ev => { if (ev.key === "Escape") { ev.stopPropagation(); fim(null); } }, op);
  });
}

let marcador = null;
function desenharChegada() {
  try { marcador?.destroy({ children: true }); } catch {}
  marcador = null;
  if (!game.user.isGM || !canvas.ready || !globalThis.PIXI) return;
  const p = canvas.scene?.getFlag(ID, "chegada");
  if (!p) return;
  try {
    const gs = canvas.dimensions.size;
    const g = new PIXI.Graphics();
    g.lineStyle(3, 0xff8c1a, 0.9).beginFill(0xff8c1a, 0.15).drawRect(0, 0, gs, gs).endFill();
    // bandeirinha
    g.lineStyle(3, 0xffffff, 0.95).moveTo(gs * 0.35, gs * 0.8).lineTo(gs * 0.35, gs * 0.2);
    g.lineStyle(0).beginFill(0xff8c1a, 1).drawPolygon([gs * 0.35, gs * 0.2, gs * 0.72, gs * 0.32, gs * 0.35, gs * 0.45]).endFill();
    g.position.set(p.x, p.y);
    g.eventMode = "none";
    (canvas.controls ?? canvas.interface).addChild(g);
    marcador = g;
  } catch (err) { console.warn(`${ID} | não consegui desenhar o ponto de chegada`, err); }
}

// Janela do mestre
class NavegadorMapas extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "navegador-mapas-app",
    classes: ["navegador-mapas"],
    window: { title: "NM.Titulo", icon: "fa-solid fa-map-location-dot", resizable: true },
    position: { width: 1000, height: 720 }
  };

  selecionados = new Set();   // jogadores selecionados (Ctrl+clique para vários)
  filtro = "";
  filtroEtq = new Set();      // etiquetas marcadas no filtro
  estados = new Map();        // userId -> { sceneId, envio, estado }
  receptores = new Set();
  pingFeito = false;
  precarregados = new Map();  // sceneId -> Set(userId)
  esperas = new Map();        // "userId:sceneId" -> função que resolve a espera

  // Redesenha só a lista que mudou; mudanças seguidas viram um redesenho só
  atualizar(partes = { jogadores: true, mapas: true }) {
    this._pend ??= {};
    if (partes.jogadores) this._pend.jogadores = true;
    if (partes.mapas) this._pend.mapas = true;
    if (this._tAtual) return;
    this._tAtual = setTimeout(() => { this._tAtual = null; this._redesenhar(); }, 60);
  }

  _redesenhar() {
    const p = this._pend;
    this._pend = null;
    if (!p || !this.rendered || !this.element) return;
    const jogadores = this._jogadores();
    if (p.jogadores) {
      const lista = this.element.querySelector(".nm-lista-jog");
      if (lista) lista.innerHTML = this._htmlJogadores(jogadores);
      const grupos = this.element.querySelector(".nm-grupos");
      if (grupos) grupos.innerHTML = this._htmlGrupos();
      this._marcarSelecao();
    }
    if (p.mapas) {
      const mapas = this.element.querySelector(".nm-mapas");
      if (mapas) mapas.innerHTML = this._htmlMapas(jogadores);
    }
  }

  _marcarSelecao() {
    if (!this.element) return;
    this.element.querySelectorAll(".nm-jogador").forEach(c => c.classList.toggle("sel", this.selecionados.has(c.dataset.user)));
    const info = this.element.querySelector(".nm-sel-info");
    if (!info) return;
    info.hidden = this.selecionados.size < 2;
    info.querySelector(".nm-sel-qtd").textContent = this.selecionados.size;
  }

  _jogadores() {
    return game.users.filter(u => !u.isGM)
      .sort((a, b) => (b.active - a.active) || comparar(a.name, b.name));
  }

  get fechadas() { return new Set(cfg("pastasFechadas") ?? []); }
  async definirFechada(folderId, fechada) {
    const s = this.fechadas;
    if (s.has(folderId) === fechada) return;
    fechada ? s.add(folderId) : s.delete(folderId);
    this.atualizar({ mapas: true });
    await game.settings.set(ID, "pastasFechadas", [...s]);
  }

  // Jogador online, com personagem, num mapa sem o token dele
  _semToken(u) {
    if (!u.active || !u.character || this.estados.get(u.id)?.envio) return false;
    const cena = game.scenes.get(u.viewedScene);
    return !!cena && !cena.tokens.some(tk => tk.actorId === u.character.id);
  }

  // Jogadores
  _htmlJogadores(jogadores) {
    if (!jogadores.length) return `<p class="nm-vazio">${t("Jog.Nenhum")}</p>`;
    const nomeCena = id => esc(game.scenes.get(id)?.name ?? "—");
    return jogadores.map(u => {
      const e = this.estados.get(u.id);
      const fixa = u.getFlag(ID, "cena");
      let sub = `<i class="fa-solid fa-location-dot"></i> ${nomeCena(u.active ? u.viewedScene : fixa)}`;
      if (e?.estado === "precarregando") sub = `<i class="fa-solid fa-spinner fa-spin"></i> ${t("Jog.PreCarregando", { mapa: nomeCena(e.sceneId) })}`;
      else if (e?.estado === "indo") sub = `<i class="fa-solid fa-spinner fa-spin"></i> ${t("Jog.Entrando", { mapa: nomeCena(e.sceneId) })}`;
      else if (!u.active && fixa) sub = `<i class="fa-solid fa-thumbtack"></i> ${t("Jog.VaiEntrar", { mapa: nomeCena(fixa) })}`;

      let selo = "";
      if (u.active && this.receptores.has(u.id)) selo = `<i class="fa-solid fa-plug nm-ok" data-tooltip="${esc(t("Jog.ModuloOk"))}"></i>`;
      else if (u.active && this.pingFeito) selo = `<i class="fa-solid fa-triangle-exclamation nm-alerta" data-tooltip="${esc(t("Jog.ModuloSemResposta"))}"></i>`;
      const perdido = this._semToken(u);

      return `
        <div class="nm-jogador ${this.selecionados.has(u.id) ? "sel" : ""} ${u.active ? "" : "offline"} ${perdido ? "perdido" : ""}" data-user="${u.id}">
          <div class="nm-avatar" style="border-color:${corDe(u.color)}">
            <img src="${esc(imgDe(u))}" draggable="false" decoding="async">
            <span class="nm-status ${u.active ? "on" : "off"}"></span>
          </div>
          <div class="nm-info">
            <div class="nm-nome">${esc(u.name)} ${selo}
              ${perdido ? `<i class="fa-solid fa-person-circle-question nm-alerta" data-tooltip="${esc(t("Jog.SemToken"))}"></i>` : ""}</div>
            <div class="nm-sub">${esc(u.character?.name ?? t("Jog.SemPersonagem"))}</div>
            <div class="nm-sub">${sub}</div>
            ${perdido ? `<button type="button" class="nm-acao-mini" data-acao="colocar-token" data-user="${u.id}"><i class="fa-solid fa-street-view"></i> ${t("Jog.ColocarToken")}</button>` : ""}
          </div>
        </div>`;
    }).join("");
  }

  // Grupos salvos
  get grupos() { return foundry.utils.deepClone(cfg("grupos") ?? []); }

  _htmlGrupos() {
    const grupos = this.grupos;
    if (!grupos.length) return `<p class="nm-dica">${t("Grupo.Vazio")}</p>`;
    return grupos.map(g => {
      const us = g.users.map(id => game.users.get(id)).filter(Boolean);
      return `<div class="nm-grupo" data-grupo="${g.id}" data-tooltip="${esc(us.map(u => u.name).join(", ") || "—")}">
          <span class="nm-grupo-avatares">${us.slice(0, 5).map(u => `<img src="${esc(imgDe(u))}" style="border-color:${corDe(u.color)}" draggable="false">`).join("")}</span>
          <span class="nm-grupo-nome">${esc(g.nome)}</span>
        </div>`;
    }).join("");
  }

  _membros(grupoId) {
    const g = this.grupos.find(x => x.id === grupoId);
    return g ? g.users.filter(id => game.users.get(id)) : [];
  }

  async salvarGrupo(grupoId = null) {
    const ids = [...this.selecionados];
    if (!ids.length) return ui.notifications.warn(t("Grupo.SemSelecao"));
    const grupos = this.grupos;
    if (grupoId) {
      const g = grupos.find(x => x.id === grupoId);
      if (g) g.users = ids;
    } else {
      const nome = await pedirTexto(t("Grupo.Novo"), t("Grupo.Nome"), t("Grupo.Padrao", { n: grupos.length + 1 }));
      if (!nome) return;
      grupos.push({ id: foundry.utils.randomID(), nome, users: ids });
    }
    await game.settings.set(ID, "grupos", grupos);
    this.atualizar({ jogadores: true });
  }

  async renomearGrupo(grupoId) {
    const grupos = this.grupos;
    const g = grupos.find(x => x.id === grupoId);
    if (!g) return;
    const nome = await pedirTexto(t("Grupo.Renomear"), t("Grupo.Nome"), g.nome);
    if (!nome) return;
    g.nome = nome;
    await game.settings.set(ID, "grupos", grupos);
    this.atualizar({ jogadores: true });
  }

  async excluirGrupo(grupoId) {
    await game.settings.set(ID, "grupos", this.grupos.filter(x => x.id !== grupoId));
    this.atualizar({ jogadores: true });
  }

  // Mapas
  _lugar(u) {
    const e = this.estados.get(u.id);
    if (e?.envio) return e.sceneId;
    return u.active ? u.viewedScene : null;
  }

  _htmlCena(s, ctx, compacta = false) {
    const aqui = ctx.porCena.get(s.id) ?? [];
    const pre = this.precarregados.get(s.id)?.size ?? 0;
    const minha = ctx.minha === s.id;
    const fav = ctx.favs.has(s.id);
    const etqs = etiquetasDe(s);
    const nota = s.getFlag(ID, "nota");
    const musica = s.getFlag(ID, "musica");
    const info = !compacta && (etqs.length || nota)
      ? `<div class="nm-info-cena">
          ${etqs.map(e => `<span class="nm-etq" style="--c:${corEtiqueta(e)}">${esc(e)}</span>`).join("")}
          ${nota ? `<span class="nm-nota" data-tooltip="${esc(nota)}">${esc(nota)}</span>` : ""}
        </div>` : "";
    return `
      <div class="nm-cena ${s.active ? "ativa" : ""} ${minha ? "minha" : ""} ${compacta ? "compacta" : ""}" data-scene="${s.id}" ${compacta ? `data-faixa="1"` : ""}>
        <div class="nm-thumb">
          ${s.thumb ? `<img class="nm-thumb-img" src="${esc(s.thumb)}" loading="lazy" decoding="async" draggable="false">`
            : `<div class="nm-sem-thumb" data-tooltip="${esc(t("Mapa.SemMiniatura"))}"><i class="fa-solid fa-image"></i></div>`}
          ${s.active ? `<span class="nm-tag">${t("Mapa.Ativa")}</span>` : ""}
          ${minha ? `<span class="nm-tag nm-tag-eu" data-tooltip="${esc(t("Mapa.VoceAqui"))}"><i class="fa-solid fa-eye"></i></span>` : ""}
          ${ctx.precarregando.has(s.id) ? `<span class="nm-pre" data-tooltip="${esc(t("Mapa.PreCarregando"))}"><i class="fa-solid fa-spinner fa-spin"></i></span>`
            : pre ? `<span class="nm-pre" data-tooltip="${esc(t("Mapa.PreCarregado", { n: pre }))}"><i class="fa-solid fa-download"></i> ${pre}</span>` : ""}
          <div class="nm-presentes">
            ${aqui.map(u => {
              const e = this.estados.get(u.id);
              const indo = e?.envio && e.estado !== "chegou";
              const perdido = !indo && this._semToken(u);
              const dica = `${u.name}${indo ? ` (${t("Mapa.Carregando")})` : perdido ? ` (${t("Jog.SemToken")})` : ""}`;
              return `<span class="nm-mini ${indo ? "indo" : ""} ${perdido ? "perdido" : ""}" data-tooltip="${esc(dica)}">
                        <img src="${esc(imgDe(u))}" style="border-color:${corDe(u.color)}" draggable="false">
                        ${indo ? `<i class="fa-solid fa-spinner fa-spin"></i>` : perdido ? `<i class="fa-solid fa-circle-question"></i>` : ""}
                      </span>`;
            }).join("")}
          </div>
        </div>
        <div class="nm-rodape">
          <span class="nm-cena-nome" title="${esc(s.name)}">${esc(s.name)}</span>
          ${s.getFlag(ID, "chegada") ? `<i class="fa-solid fa-flag nm-icone" data-tooltip="${esc(t("Mapa.TemChegada"))}"></i>` : ""}
          ${musica?.playlist ? `<i class="fa-solid fa-music nm-icone" data-tooltip="${esc(t(musica.modo === "todos" ? "Mapa.MusicaTodos" : "Mapa.MusicaLocal"))}"></i>` : ""}
          ${s.navigation ? "" : `<i class="fa-solid fa-eye-slash nm-icone" data-tooltip="${esc(t("Mapa.ForaNav"))}"></i>`}
          <button type="button" class="nm-estrela ${fav ? "on" : ""}" data-tooltip="${esc(t(fav ? "Mapa.Desfavoritar" : "Mapa.Favoritar"))}"><i class="fa-${fav ? "solid" : "regular"} fa-star"></i></button>
          <button type="button" class="nm-menu-btn" data-tooltip="${esc(t("Mapa.Opcoes"))}"><i class="fa-solid fa-ellipsis-vertical"></i></button>
        </div>
        ${info}
      </div>`;
  }

  _htmlMapas(jogadores) {
    const f = this.filtro.trim().toLowerCase();
    const sel = this.filtroEtq;
    const filtrando = !!f || sel.size > 0;
    const fechadas = this.fechadas;
    const bate = s => {
      if (sel.size && !etiquetasDe(s).some(e => sel.has(e))) return false;
      if (!f) return true;
      return s.name.toLowerCase().includes(f) || (s.navName ?? "").toLowerCase().includes(f)
        || String(s.getFlag(ID, "nota") ?? "").toLowerCase().includes(f) || etiquetasDe(s).some(e => e.includes(f));
    };

    const ctx = { porCena: new Map(), precarregando: new Set(), minha: canvas.scene?.id, favs: new Set(cfg("favoritos") ?? []) };
    for (const u of jogadores) {
      const l = this._lugar(u);
      if (!l) continue;
      if (!ctx.porCena.has(l)) ctx.porCena.set(l, []);
      ctx.porCena.get(l).push(u);
    }
    for (const e of this.estados.values()) if (e.estado === "precarregando") ctx.precarregando.add(e.sceneId);

    const subpastas = new Map();
    for (const p of game.folders) {
      if (p.type !== "Scene") continue;
      const pai = p.folder?.id ?? null;
      if (!subpastas.has(pai)) subpastas.set(pai, []);
      subpastas.get(pai).push(p);
    }
    const cenasDe = new Map();
    const todasEtq = new Set();
    for (const s of game.scenes) {
      const pai = s.folder?.id ?? null;
      if (!cenasDe.has(pai)) cenasDe.set(pai, []);
      cenasDe.get(pai).push(s);
      for (const e of etiquetasDe(s)) todasEtq.add(e);
    }

    // Total de mapas e jogadores dentro de cada pasta, contando subpastas
    const resumo = new Map();
    const resumir = p => {
      if (resumo.has(p.id)) return resumo.get(p.id);
      const r = { total: 0, jogadores: [] };
      for (const s of cenasDe.get(p.id) ?? []) { r.total++; r.jogadores.push(...(ctx.porCena.get(s.id) ?? [])); }
      for (const sp of subpastas.get(p.id) ?? []) { const x = resumir(sp); r.total += x.total; r.jogadores.push(...x.jogadores); }
      resumo.set(p.id, r);
      return r;
    };

    const grade = (cenas, compacta = false) => cenas.length
      ? `<div class="nm-grade ${compacta ? "compacta" : ""}">${cenas.map(s => this._htmlCena(s, ctx, compacta)).join("")}</div>` : "";

    const htmlPasta = (p, mostrarTudo = false) => {
      const nomeBate = !!f && !sel.size && p.name.toLowerCase().includes(f);
      const tudo = mostrarTudo || nomeBate || !filtrando;
      const aberta = filtrando || !fechadas.has(p.id);

      // Pasta fechada não monta o conteúdo
      let corpo = "";
      if (aberta) {
        const subs = ordenar(subpastas.get(p.id) ?? [], p.sorting).map(sp => htmlPasta(sp, tudo && filtrando)).filter(Boolean);
        const cenas = ordenar(cenasDe.get(p.id) ?? [], p.sorting).filter(s => tudo || bate(s));
        if (filtrando && !tudo && !subs.length && !cenas.length) return "";
        corpo = `<div class="nm-pasta-corpo">${subs.join("")}${grade(cenas)}${!subs.length && !cenas.length ? `<div class="nm-vazia">${t("Pasta.Vazia")}</div>` : ""}</div>`;
      }

      const r = resumir(p);
      const dentro = aberta ? [] : r.jogadores;
      return `
        <div class="nm-pasta ${aberta ? "aberta" : ""}" data-folder="${p.id}">
          <div class="nm-pasta-cab" style="--cor:${corDe(p.color) || "#777"}">
            <i class="fa-solid ${aberta ? "fa-folder-open" : "fa-folder"}"></i>
            <span class="nm-pasta-nome">${esc(p.name)}</span>
            <span class="nm-pasta-presentes">${dentro.map(u => `<img src="${esc(imgDe(u))}" style="border-color:${corDe(u.color)}" data-tooltip="${esc(u.name)}" draggable="false">`).join("")}</span>
            <span class="nm-pasta-qtd">${r.total}</span>
            <button type="button" class="nm-menu-btn" data-tooltip="${esc(t("Pasta.Opcoes"))}"><i class="fa-solid fa-ellipsis-vertical"></i></button>
          </div>
          ${corpo}
        </div>`;
    };

    // Etiquetas para filtrar
    const etqs = [...todasEtq].sort(comparar);
    const barraEtq = etqs.length ? `<div class="nm-filtro-etq">
        ${etqs.map(e => `<span class="nm-etq filtro ${sel.has(e) ? "on" : ""}" data-etq="${esc(e)}" style="--c:${corEtiqueta(e)}" data-tooltip="${esc(t("Etq.DicaFiltro"))}">${esc(e)}</span>`).join("")}
        ${sel.size ? `<a data-acao="limpar-etq">${t("Geral.Limpar")}</a>` : ""}
      </div>` : "";

    // Favoritos e recentes (somem durante a busca)
    let faixa = "";
    if (!filtrando) {
      const favs = [...ctx.favs].map(id => game.scenes.get(id)).filter(Boolean);
      const recentes = (cfg("recentes") ?? []).filter(id => !ctx.favs.has(id)).map(id => game.scenes.get(id)).filter(Boolean).slice(0, MAX_RECENTES);
      if (favs.length) faixa += `<div class="nm-faixa"><h4><i class="fa-solid fa-star"></i> ${t("Faixa.Favoritos")}</h4>${grade(favs, true)}</div>`;
      if (recentes.length) faixa += `<div class="nm-faixa"><h4><i class="fa-solid fa-clock-rotate-left"></i> ${t("Faixa.Recentes")}</h4>${grade(recentes, true)}</div>`;
    }

    const raizPastas = ordenar(subpastas.get(null) ?? [], "a").map(p => htmlPasta(p)).filter(Boolean).join("");
    const raizCenas = ordenar(cenasDe.get(null) ?? [], "m").filter(s => !filtrando || bate(s));
    const arvore = raizPastas + grade(raizCenas);
    return barraEtq + faixa + (arvore || `<p class="nm-vazio">${filtrando ? t("Mapa.NenhumEncontrado") : t("Mapa.NenhumCriado")}</p>`);
  }

  async _renderHTML() {
    const jogadores = this._jogadores();
    const div = document.createElement("div");
    div.className = "nm-root";
    div.innerHTML = `
      <aside class="nm-lateral">
        <h3><i class="fa-solid fa-users"></i> ${t("Jog.Titulo")}</h3>
        <div class="nm-sel-info" hidden>
          <span><i class="fa-solid fa-users"></i> ${t("Jog.Selecionados", { n: `<span class="nm-sel-qtd">0</span>` })}</span>
          <span><a data-acao="salvar-grupo">${t("Grupo.SalvarSelecao")}</a> · <a data-acao="limpar-sel">${t("Geral.Limpar")}</a></span>
        </div>
        <div class="nm-lista-jog">${this._htmlJogadores(jogadores)}</div>
        <h3 style="margin-top:8px"><i class="fa-solid fa-people-group"></i> ${t("Grupo.Titulo")}</h3>
        <div class="nm-grupos">${this._htmlGrupos()}</div>
        <div class="nm-opcoes">
          <label><input type="checkbox" name="precarregar" ${cfg("precarregar") ? "checked" : ""}> ${t("Opcao.Precarregar")}</label>
          <label><input type="checkbox" name="levarToken" ${cfg("levarToken") ? "checked" : ""}> ${t("Opcao.LevarToken")}</label>
          <p class="nm-dica">${t("Dica.Geral")}</p>
        </div>
      </aside>
      <section class="nm-principal" data-folder="">
        <div class="nm-topo">
          <h3><i class="fa-solid fa-map"></i> ${t("Mapa.Titulo")}</h3>
          <input type="search" name="filtro" placeholder="${esc(t("Mapa.Buscar"))}" value="${esc(this.filtro)}">
          <button type="button" class="nm-btn-topo" data-acao="novo-mapa"><i class="fa-solid fa-map"></i> ${t("Mapa.Criar")}</button>
          <button type="button" class="nm-btn-topo" data-acao="nova-pasta"><i class="fa-solid fa-folder-plus"></i> ${t("Pasta.Criar")}</button>
          <button type="button" class="nm-btn-topo" data-acao="recolher" data-tooltip="${esc(t("Pasta.RecolherTodas"))}"><i class="fa-solid fa-folder-tree"></i></button>
          <button type="button" class="nm-btn-topo" data-acao="liberar" data-tooltip="${esc(t("Memoria.LiberarDica"))}"><i class="fa-solid fa-broom"></i></button>
        </div>
        <div class="nm-mapas">${this._htmlMapas(jogadores)}</div>
      </section>`;
    return div;
  }

  _replaceHTML(result, content) {
    content.replaceChildren(result);
  }

  _onRender() {
    this._marcarSelecao();
  }

  // Eventos (delegados na janela; o elemento raiz dura até fechar)
  _ouvirEventos() {
    const el = this.element;
    this._ac = new AbortController();
    const op = { signal: this._ac.signal };

    el.addEventListener("pointerdown", ev => {
      if (ev.button !== 0 || ev.target.closest(".nm-menu-btn, input, button, a, label, .nm-etq.filtro")) return;
      const jog = ev.target.closest(".nm-jogador");
      if (jog) return this._pegarJogador(ev, jog);
      const grupo = ev.target.closest(".nm-grupo");
      if (grupo) return this._pegarGrupo(ev, grupo);
      const cena = ev.target.closest(".nm-cena");
      if (cena) return this._pegarCena(ev, cena);
      const cab = ev.target.closest(".nm-pasta-cab");
      if (cab) return this._pegarPasta(ev, cab);
    }, op);

    el.addEventListener("click", ev => {
      const btn = ev.target.closest(".nm-menu-btn");
      if (btn) {
        ev.stopPropagation();
        const cena = btn.closest(".nm-cena");
        if (cena) return this._abrirMenu(btn, this._itensCena(game.scenes.get(cena.dataset.scene)), `cena:${cena.dataset.scene}`);
        const pasta = btn.closest(".nm-pasta");
        if (pasta) return this._abrirMenu(btn, this._itensPasta(game.folders.get(pasta.dataset.folder)), `pasta:${pasta.dataset.folder}`);
      }
      const estrela = ev.target.closest(".nm-estrela");
      if (estrela) return this.alternarFavorito(estrela.closest(".nm-cena").dataset.scene);
      const etq = ev.target.closest(".nm-etq.filtro");
      if (etq) {
        const e = etq.dataset.etq;
        this.filtroEtq.has(e) ? this.filtroEtq.delete(e) : this.filtroEtq.add(e);
        return this.atualizar({ mapas: true });
      }
      const alvoAcao = ev.target.closest("[data-acao]");
      const acao = alvoAcao?.dataset.acao;
      if (acao === "novo-mapa") this.criarMapa(null);
      else if (acao === "nova-pasta") this.criarPasta(null);
      else if (acao === "limpar-sel") { this.selecionados.clear(); this._marcarSelecao(); }
      else if (acao === "salvar-grupo") this.salvarGrupo();
      else if (acao === "limpar-etq") { this.filtroEtq.clear(); this.atualizar({ mapas: true }); }
      else if (acao === "colocar-token") this.colocarToken(alvoAcao.dataset.user);
      else if (acao === "liberar") this.descarregar(null);
      else if (acao === "recolher") {
        game.settings.set(ID, "pastasFechadas", game.folders.filter(p => p.type === "Scene").map(p => p.id));
        this.atualizar({ mapas: true });
      }
    }, op);

    el.addEventListener("dblclick", ev => {
      const cena = ev.target.closest(".nm-cena");
      if (cena && !ev.target.closest("button")) game.scenes.get(cena.dataset.scene)?.view();
    }, op);

    // Botão direito = mesmo menu do ⋮, aberto no cursor
    el.addEventListener("contextmenu", ev => {
      const cena = ev.target.closest(".nm-cena");
      const cab = ev.target.closest(".nm-pasta-cab");
      const grupo = ev.target.closest(".nm-grupo");
      const etq = ev.target.closest(".nm-etq.filtro");
      if (!cena && !cab && !grupo && !etq) return;
      ev.preventDefault(); ev.stopPropagation();
      const ponto = { x: ev.clientX, y: ev.clientY };
      if (etq) return this.escolherCorEtiqueta(etq.dataset.etq);
      if (grupo) return this._abrirMenu(ponto, this._itensGrupo(grupo.dataset.grupo), `grupo:${grupo.dataset.grupo}`);
      if (cena) return this._abrirMenu(ponto, this._itensCena(game.scenes.get(cena.dataset.scene)), `cena:${cena.dataset.scene}`);
      const id = cab.closest(".nm-pasta").dataset.folder;
      this._abrirMenu(ponto, this._itensPasta(game.folders.get(id)), `pasta:${id}`);
    }, op);

    el.addEventListener("change", ev => {
      const nome = ev.target.name;
      if (nome === "precarregar" || nome === "levarToken") game.settings.set(ID, nome, ev.target.checked);
    }, op);

    el.addEventListener("input", ev => {
      if (ev.target.name !== "filtro") return;
      this.filtro = ev.target.value;
      clearTimeout(this._tBusca);
      this._tBusca = setTimeout(() => this.atualizar({ mapas: true }), 150);
    }, op);
  }

  _pegarJogador(ev, card) {
    const userId = card.dataset.user;
    const ctrl = ev.ctrlKey || ev.metaKey;
    // Arrastar um jogador selecionado leva o grupo; um não selecionado vai sozinho
    const grupo = () => this.selecionados.has(userId) ? [...this.selecionados] : [userId];
    this._arrastar(ev, {
      fantasma: () => this._fantasmaJogadores(grupo()),
      alvo: debaixo => debaixo.closest(".nm-cena"),
      clique: () => {
        const s = this.selecionados;
        if (ctrl) s.has(userId) ? s.delete(userId) : s.add(userId);
        else if (s.size === 1 && s.has(userId)) s.clear();
        else { s.clear(); s.add(userId); }
        this._marcarSelecao();
      },
      soltar: alvo => {
        const ids = grupo();
        this.selecionados.clear();
        this.enviarVarios(ids, alvo.dataset.scene);
      }
    });
  }

  _pegarGrupo(ev, el) {
    const membros = () => this._membros(el.dataset.grupo);
    this._arrastar(ev, {
      fantasma: () => this._fantasmaJogadores(membros()),
      alvo: debaixo => debaixo.closest(".nm-cena"),
      // Clique: seleciona quem é do grupo
      clique: () => { this.selecionados = new Set(membros()); this._marcarSelecao(); },
      soltar: alvo => this.enviarVarios(membros(), alvo.dataset.scene)
    });
  }

  _pegarCena(ev, card) {
    const cena = game.scenes.get(card.dataset.scene);
    if (!cena) return;
    this._arrastar(ev, {
      fantasma: () => this._etiqueta(`<i class="fa-solid fa-map"></i> ${esc(cena.name)}`),
      alvo: debaixo => {
        if (debaixo.closest(".nm-faixa, .nm-filtro-etq")) return null;
        const outro = debaixo.closest(".nm-cena");
        if (outro) return outro.dataset.scene === cena.id ? null : outro;
        return debaixo.closest(".nm-pasta") ?? debaixo.closest(".nm-principal");
      },
      lado: true,
      clique: () => {
        if (!this.selecionados.size) return;
        const ids = [...this.selecionados];
        this.selecionados.clear();
        this.enviarVarios(ids, cena.id);
      },
      soltar: (alvo, depois) => alvo.classList.contains("nm-cena")
        ? this.reordenar(cena, game.scenes.get(alvo.dataset.scene), depois)
        : this.moverCena(cena, alvo.dataset.folder || null)
    });
  }

  _pegarPasta(ev, cab) {
    const pastaEl = cab.closest(".nm-pasta");
    const pasta = game.folders.get(pastaEl.dataset.folder);
    if (!pasta) return;
    this._arrastar(ev, {
      fantasma: () => this._etiqueta(`<i class="fa-solid fa-folder"></i> ${esc(pasta.name)}`),
      alvo: debaixo => {
        if (debaixo.closest(".nm-faixa, .nm-filtro-etq")) return null;
        const a = debaixo.closest(".nm-pasta") ?? debaixo.closest(".nm-principal");
        return a === pastaEl ? null : a;
      },
      clique: () => { if (!this.filtro.trim() && !this.filtroEtq.size) this.definirFechada(pasta.id, pastaEl.classList.contains("aberta")); },
      soltar: alvo => this.moverPasta(pasta, alvo.dataset.folder || null)
    });
  }

  _onFirstRender() {
    this._ouvirEventos();
    const CAMPOS_CENA = ["name", "navName", "thumb", "folder", "active", "navigation", "sort", "flags"];
    const CAMPOS_PASTA = ["name", "color", "folder", "sort", "sorting"];
    const ambos = { jogadores: true, mapas: true };
    const ganchos = {
      updateUser: u => { if (!u.isGM) this.atualizar(ambos); },
      userConnected: () => this.atualizar(ambos),
      createScene: () => this.atualizar({ mapas: true }),
      deleteScene: () => this.atualizar(ambos),
      updateScene: (s, mud) => { if (CAMPOS_CENA.some(k => k in mud)) this.atualizar(ambos); },
      createFolder: p => { if (p.type === "Scene") this.atualizar({ mapas: true }); },
      deleteFolder: p => { if (p.type === "Scene") this.atualizar({ mapas: true }); },
      updateFolder: (p, mud) => { if (p.type === "Scene" && CAMPOS_PASTA.some(k => k in mud)) this.atualizar({ mapas: true }); },
      createToken: () => this.atualizar(ambos),
      deleteToken: () => this.atualizar(ambos),
      updateActor: () => this.atualizar({ jogadores: true }),
      canvasReady: () => this.atualizar({ mapas: true })
    };
    this._ganchos = Object.entries(ganchos).map(([h, fn]) => [h, Hooks.on(h, fn)]);

    // Esc limpa a seleção quando não há menu aberto
    // (captura + stopPropagation: senão o Esc do Foundry fecha a janela junto)
    document.addEventListener("keydown", ev => {
      if (ev.key !== "Escape" || this._menu || !this.selecionados.size) return;
      if (ev.target.closest?.("input, textarea, select")) return;
      ev.stopPropagation();
      this.selecionados.clear();
      this._marcarSelecao();
    }, { signal: this._ac.signal, capture: true });
    this.ping();
  }

  _onClose() {
    for (const [h, id] of this._ganchos ?? []) Hooks.off(h, id);
    this._ganchos = null;
    clearTimeout(this._tAtual);
    this._tAtual = null;
    this._pend = null;
    this._ac?.abort();
    this._ac = null;
    this._fecharMenu();
  }

  // Arrastar
  _fantasmaJogadores(ids) {
    const d = document.createElement("div");
    d.className = "nm-fantasma grupo";
    const users = ids.map(id => game.users.get(id)).filter(Boolean);
    d.innerHTML = users.slice(0, 4).map((u, i) =>
      `<img src="${esc(imgDe(u))}" style="border-color:${corDe(u.color)};z-index:${10 - i}">`).join("")
      + (users.length > 1 ? `<span class="nm-qtd">${users.length}</span>` : "");
    return d;
  }

  _etiqueta(html) {
    const d = document.createElement("div");
    d.className = "nm-fantasma etiqueta";
    d.innerHTML = html;
    return d;
  }

  // lado: ao soltar sobre outro mapa, indica se fica antes ou depois dele
  _arrastar(ev, { fantasma: criar, alvo: acharAlvo, clique, soltar, lado = false }) {
    if (ev.button !== 0) return;
    ev.stopPropagation();
    const x0 = ev.clientX, y0 = ev.clientY;
    let fantasma = null, alvo = null, depois = false;
    const limpar = el => el?.classList.remove("alvo", "antes", "depois");

    const mover = e => {
      if (!fantasma) {
        if (Math.hypot(e.clientX - x0, e.clientY - y0) < 6) return;
        fantasma = criar();
        document.body.appendChild(fantasma);
      }
      fantasma.style.left = `${e.clientX + 10}px`;
      fantasma.style.top = `${e.clientY + 10}px`;
      const debaixo = document.elementFromPoint(e.clientX, e.clientY);
      const novo = debaixo && this.element.contains(debaixo) ? acharAlvo(debaixo) : null;
      if (novo !== alvo) { limpar(alvo); alvo = novo; }
      if (!alvo) return;
      if (lado && alvo.classList.contains("nm-cena")) {
        const r = alvo.getBoundingClientRect();
        depois = e.clientX > r.left + r.width / 2;
        alvo.classList.toggle("depois", depois);
        alvo.classList.toggle("antes", !depois);
      } else alvo.classList.add("alvo");
    };
    const fim = () => {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", fim);
      limpar(alvo);
      if (!fantasma) return clique?.();
      fantasma.remove();
      if (alvo) Promise.resolve(soltar(alvo, depois)).catch(err => { console.error(err); ui.notifications.error(err.message ?? String(err)); });
    };
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", fim);
  }

  // Menus
  _itensCena(cena) {
    if (!cena) return [];
    const fav = (cfg("favoritos") ?? []).includes(cena.id);
    const chegada = cena.getFlag(ID, "chegada");
    return [
      ["fa-eye", t("Menu.Ver"), () => cena.view()],
      ["fa-bullseye", t("Menu.Ativar"), () => cena.activate()],
      ["fa-users", t("Menu.PuxarTodos"), () => this.puxarTodos(cena)],
      ["fa-download", t("Menu.Precarregar"), () => this.precarregarTodos(cena)],
      ["fa-eraser", t("Menu.Descarregar"), () => this.descarregar(cena)],
      "-",
      ["fa-star", t(fav ? "Mapa.Desfavoritar" : "Mapa.Favoritar"), () => this.alternarFavorito(cena.id)],
      ["fa-note-sticky", t("Menu.Detalhes"), () => this.editarDetalhes(cena)],
      ["fa-flag", t(chegada ? "Menu.MudarChegada" : "Menu.DefinirChegada"), () => this.definirChegada(cena)],
      chegada && ["fa-flag-checkered", t("Menu.RemoverChegada"), () => cena.unsetFlag(ID, "chegada")],
      "-",
      ["fa-gear", t("Menu.Configurar"), () => cena.sheet.render({ force: true })],
      [cena.navigation ? "fa-eye-slash" : "fa-compass", t(cena.navigation ? "Menu.TirarNav" : "Menu.MostrarNav"),
        () => cena.update({ navigation: !cena.navigation })],
      ["fa-image", t("Menu.Miniatura"), () => this.gerarMiniatura(cena)],
      ["fa-copy", t("Menu.Duplicar"), () => cena.clone({ name: t("Menu.NomeCopia", { nome: cena.name }), active: false }, { save: true })],
      "-",
      ["fa-trash", t("Menu.Excluir"), () => cena.deleteDialog(), "perigo"]
    ].filter(Boolean);
  }

  _itensPasta(pasta) {
    if (!pasta) return [];
    const aberta = !this.fechadas.has(pasta.id);
    return [
      ["fa-map", t("Pasta.CriarMapaAqui"), () => this.criarMapa(pasta.id)],
      ["fa-folder-plus", t("Pasta.CriarSub"), () => this.criarPasta(pasta.id)],
      ["fa-pen-to-square", t("Pasta.Editar"), () => pasta.sheet.render({ force: true })],
      [aberta ? "fa-folder" : "fa-folder-open", t(aberta ? "Pasta.Recolher" : "Pasta.Expandir"), () => this.definirFechada(pasta.id, aberta)],
      "-",
      ["fa-trash", t("Pasta.Excluir"), () => pasta.deleteDialog(), "perigo"]
    ];
  }

  _itensGrupo(grupoId) {
    return [
      ["fa-users", t("Grupo.Selecionar"), () => { this.selecionados = new Set(this._membros(grupoId)); this._marcarSelecao(); }],
      this.selecionados.size && ["fa-user-pen", t("Grupo.UsarSelecao"), () => this.salvarGrupo(grupoId)],
      ["fa-pen", t("Grupo.Renomear"), () => this.renomearGrupo(grupoId)],
      "-",
      ["fa-trash", t("Grupo.Excluir"), () => this.excluirGrupo(grupoId), "perigo"]
    ].filter(Boolean);
  }

  // ancora: botão ⋮ (abre embaixo dele) ou { x, y } do clique direito
  _abrirMenu(ancora, itens, chave) {
    if (!itens.length) return;
    const noCursor = !(ancora instanceof HTMLElement);
    // Segundo clique no mesmo ⋮ só fecha
    if (!noCursor && chave && this._fechadoEm?.chave === chave && Date.now() - this._fechadoEm.t < 400) {
      this._fechadoEm = null;
      return;
    }
    this._fecharMenu();
    const menu = document.createElement("div");
    menu.className = "nm-menu";
    menu.innerHTML = itens.map((it, i) => it === "-" ? `<div class="nm-menu-sep"></div>`
      : `<div class="nm-menu-item ${it[3] ?? ""}" data-i="${i}"><i class="fa-solid ${it[0]}"></i> ${esc(it[1])}</div>`).join("");
    document.body.appendChild(menu);

    const larg = menu.offsetWidth, alt = menu.offsetHeight;
    if (noCursor) {
      const { x, y } = ancora;
      menu.style.left = `${Math.max(4, x + larg + 4 > window.innerWidth ? x - larg : x)}px`;
      menu.style.top = `${Math.max(4, y + alt + 4 > window.innerHeight ? y - alt : y)}px`;
    } else {
      const r = ancora.getBoundingClientRect();
      menu.style.left = `${Math.max(4, Math.min(r.right - larg, window.innerWidth - larg - 4))}px`;
      menu.style.top = `${r.bottom + alt + 4 > window.innerHeight ? Math.max(4, r.top - alt - 4) : r.bottom + 4}px`;
    }

    menu.addEventListener("click", ev => {
      const item = ev.target.closest(".nm-menu-item");
      if (!item) return;
      this._fecharMenu();
      Promise.resolve(itens[item.dataset.i][2]()).catch(err => { console.error(err); ui.notifications.error(err.message ?? String(err)); });
    });
    // Captura: fecha também quando o clique cai em outro cartão ou ⋮
    this._fora = ev => {
      if (menu.contains(ev.target)) return;
      this._fechadoEm = { chave, t: Date.now() };
      this._fecharMenu();
    };
    this._esc = ev => { if (ev.key === "Escape") { ev.stopPropagation(); this._fecharMenu(); } };
    document.addEventListener("pointerdown", this._fora, true);
    document.addEventListener("keydown", this._esc, true);
    this._menu = menu;
  }

  _fecharMenu() {
    this._menu?.remove(); this._menu = null;
    if (this._fora) document.removeEventListener("pointerdown", this._fora, true);
    if (this._esc) document.removeEventListener("keydown", this._esc, true);
    this._fora = this._esc = null;
  }

  // Mapas e pastas
  criarMapa(folderId) {
    return foundry.documents.Scene.implementation.createDialog(folderId ? { folder: folderId } : {});
  }

  async criarPasta(parentId) {
    if (parentId) await this.definirFechada(parentId, false);
    return foundry.documents.Folder.implementation.createDialog({ type: "Scene", folder: parentId ?? null });
  }

  async moverCena(cena, folderId) {
    if ((cena.folder?.id ?? null) === folderId) return;
    await cena.update({ folder: folderId });
    if (folderId) await this.definirFechada(folderId, false);
  }

  // Coloca o mapa antes/depois de outro (e na pasta dele, se for outra)
  async reordenar(cena, alvo, depois) {
    if (!cena || !alvo || cena === alvo) return;
    const pastaId = alvo.folder?.id ?? null;
    const pasta = pastaId ? game.folders.get(pastaId) : null;
    const irmas = ordenar(game.scenes.filter(s => (s.folder?.id ?? null) === pastaId && s.id !== cena.id), pasta?.sorting ?? "m");
    irmas.splice(irmas.indexOf(alvo) + (depois ? 1 : 0), 0, cena);

    const passo = CONST.SORT_INTEGER_DENSITY ?? 100000;
    const mudancas = [];
    irmas.forEach((s, i) => {
      const u = { _id: s.id };
      if (s.sort !== (i + 1) * passo) u.sort = (i + 1) * passo;
      if (s === cena && (cena.folder?.id ?? null) !== pastaId) u.folder = pastaId;
      if (Object.keys(u).length > 1) mudancas.push(u);
    });
    // Pasta em ordem alfabética passa para ordem manual, senão a mudança não aparece
    if (pasta?.sorting === "a") {
      await pasta.update({ sorting: "m" });
      ui.notifications.info(t("Ordem.Manual", { pasta: pasta.name }));
    }
    if (mudancas.length) await foundry.documents.Scene.implementation.updateDocuments(mudancas);
  }

  async moverPasta(pasta, destinoId) {
    if ((pasta.folder?.id ?? null) === destinoId) return;
    // impede mover a pasta para dentro de si mesma ou de uma subpasta
    for (let p = game.folders.get(destinoId); p; p = p.folder) {
      if (p.id === pasta.id) return ui.notifications.warn(t("Pasta.DentroDelaMesma"));
    }
    try { await pasta.update({ folder: destinoId }); }
    catch (err) { ui.notifications.error(t("Pasta.ErroMover", { erro: err.message ?? err })); }
  }

  async gerarMiniatura(cena) {
    ui.notifications.info(t("Miniatura.Gerando", { mapa: cena.name }));
    const dados = await cena.createThumbnail();
    await cena.update({ thumb: dados.thumb }, { diff: false });
    ui.notifications.info(t("Miniatura.Pronta", { mapa: cena.name }));
  }

  // Favoritos e recentes
  async alternarFavorito(sceneId) {
    const favs = cfg("favoritos") ?? [];
    await game.settings.set(ID, "favoritos", favs.includes(sceneId) ? favs.filter(id => id !== sceneId) : [...favs, sceneId]);
    this.atualizar({ mapas: true });
  }

  lembrarRecente(sceneId) {
    if (!sceneId) return;
    const lista = (cfg("recentes") ?? []).filter(id => id !== sceneId && game.scenes.has(id));
    lista.unshift(sceneId);
    game.settings.set(ID, "recentes", lista.slice(0, MAX_RECENTES + 6));
    this.atualizar({ mapas: true });
  }

  // Nota, etiquetas e música
  async editarDetalhes(cena) {
    const m = cena.getFlag(ID, "musica") ?? {};
    const playlists = game.playlists.contents.slice().sort((a, b) => comparar(a.name, b.name));
    const op = (v, rotulo, atual) => `<option value="${esc(v)}" ${v === atual ? "selected" : ""}>${esc(rotulo)}</option>`;
    const content = `<div class="nm-form">
        <div class="form-group stacked"><label>${t("Detalhes.Nota")}</label>
          <textarea name="nota" placeholder="${esc(t("Detalhes.NotaExemplo"))}">${esc(cena.getFlag(ID, "nota") ?? "")}</textarea>
          <p class="hint">${t("Detalhes.NotaDica")}</p></div>
        <div class="form-group stacked"><label>${t("Detalhes.Etiquetas")}</label>
          <input type="text" name="etiquetas" value="${esc(etiquetasDe(cena).join(", "))}" placeholder="${esc(t("Detalhes.EtiquetasExemplo"))}">
          <p class="hint">${t("Detalhes.EtiquetasDica")}</p></div>
        <div class="form-group"><label>${t("Detalhes.Musica")}</label>
          <select name="playlist">${op("", `— ${t("Detalhes.Nenhuma")} —`, m.playlist ?? "")}${playlists.map(p => op(p.id, p.name, m.playlist)).join("")}</select></div>
        <div class="form-group"><label>${t("Detalhes.TocarPara")}</label>
          <select name="modo">${op("local", t("Detalhes.ModoLocal"), m.modo ?? "local")}${op("todos", t("Detalhes.ModoTodos"), m.modo)}</select></div>
        <div class="form-group"><label>${t("Detalhes.PararOutras")}</label><input type="checkbox" name="pararOutras" ${m.pararOutras ? "checked" : ""}></div>
        <p class="hint">${t("Detalhes.MusicaDica")}</p>
      </div>`;
    const r = await foundry.applications.api.DialogV2.prompt({
      window: { title: t("Detalhes.Titulo", { mapa: cena.name }) },
      position: { width: 480 },
      content,
      ok: {
        label: t("Geral.Salvar"), icon: "fa-solid fa-check",
        callback: (ev, botao) => {
          const f = botao.form.elements;
          return { nota: f.nota.value, etiquetas: f.etiquetas.value, playlist: f.playlist.value, modo: f.modo.value, pararOutras: f.pararOutras.checked };
        }
      },
      rejectClose: false
    });
    if (!r || typeof r !== "object") return;

    const etiquetas = [...new Set(r.etiquetas.split(",").map(s => s.trim().toLowerCase()).filter(Boolean))];
    const flags = { nota: r.nota.trim(), etiquetas };
    const pl = game.playlists.get(r.playlist);
    // Guarda também a lista das faixas: o jogador pode não ter acesso à playlist
    flags.musica = pl ? {
      playlist: pl.id, modo: r.modo, pararOutras: r.pararOutras, aleatorio: pl.mode === CONST.PLAYLIST_MODES.SHUFFLE,
      sons: pl.sounds.contents.filter(s => s.path).sort((a, b) => a.sort - b.sort).map(s => ({ path: s.path, volume: s.volume ?? 0.5 }))
    } : null;
    await cena.update({ [`flags.${ID}`]: flags });
  }

  async escolherCorEtiqueta(tag) {
    const atual = cfg("coresEtiquetas")?.[tag];
    const r = await foundry.applications.api.DialogV2.prompt({
      window: { title: t("Etq.Cor", { etq: tag }) },
      content: `<div class="form-group"><label>${t("Etq.EscolhaCor")}</label><input type="color" name="cor" value="${esc(atual ?? "#8a5a2b")}"></div>`,
      ok: { label: t("Geral.Salvar"), icon: "fa-solid fa-check", callback: (ev, botao) => botao.form.elements.cor.value },
      rejectClose: false
    });
    if (typeof r !== "string") return;
    await game.settings.set(ID, "coresEtiquetas", { ...(cfg("coresEtiquetas") ?? {}), [tag]: r });
    this.atualizar({ mapas: true });
  }

  // Ponto de chegada
  async definirChegada(cena) {
    if (canvas.scene?.id !== cena.id) { await cena.view(); await esperarCanvas(); }
    await this.minimize?.();
    ui.notifications.info(t("Chegada.Clique"));
    const ponto = await escolherPontoNoCanvas();
    await this.maximize?.();
    if (!ponto) return ui.notifications.info(t("Chegada.Cancelado"));
    const gs = canvas.dimensions.size;
    const tl = canvas.grid.getTopLeftPoint?.(ponto) ?? { x: Math.floor(ponto.x / gs) * gs, y: Math.floor(ponto.y / gs) * gs };
    await cena.setFlag(ID, "chegada", { x: Math.round(tl.x), y: Math.round(tl.y) });
    ui.notifications.info(t("Chegada.Definido", { mapa: cena.name }));
  }

  // Enviar jogadores
  ping() {
    this.pingFeito = false;
    emitir({ acao: "ping" });
    clearTimeout(this._tPing);
    this._tPing = setTimeout(() => { this.pingFeito = true; this.atualizar({ jogadores: true }); }, 2500);
  }

  // Espera a resposta de pré-carregamento de um jogador para um mapa específico
  esperar(userId, sceneId, ms) {
    const chave = `${userId}:${sceneId}`;
    this.esperas.get(chave)?.(false); // um envio novo para o mesmo mapa substitui o anterior
    return new Promise(resolve => {
      const fim = ok => {
        clearTimeout(tm);
        if (this.esperas.get(chave) === fim) this.esperas.delete(chave);
        resolve(ok);
      };
      const tm = setTimeout(() => fim(false), ms);
      this.esperas.set(chave, fim);
    });
  }

  // Jogador saiu: some o "carregando..." e as esperas dele
  esquecer(userId) {
    this.estados.delete(userId);
    this.receptores.delete(userId);
    for (const set of this.precarregados.values()) set.delete(userId);
    for (const [chave, fim] of [...this.esperas]) if (chave.startsWith(`${userId}:`)) fim(false);
    this.atualizar();
  }

  async enviarVarios(userIds, sceneId, opcoes = {}) {
    this.atualizar();
    await Promise.all(userIds.map(id => this.enviar(id, sceneId, opcoes)));
  }

  // semToken: o token já foi levado (portal)
  async enviar(userId, sceneId, { semToken = false } = {}) {
    const user = game.users.get(userId);
    const cena = game.scenes.get(sceneId);
    if (!user || !cena) return;

    this.lembrarRecente(cena.id);
    tocarParaTodos(cena);
    const origemId = user.viewedScene ?? user.getFlag(ID, "cena"); // antes de marcar o destino
    user.setFlag(ID, "cena", cena.id).catch(console.error);
    const token = !semToken && cfg("levarToken") && user.character
      ? moverTokenDoJogador(user, cena, origemId).catch(err => { console.error(err); ui.notifications.error(t("Aviso.ErroToken", { nome: user.name })); })
      : null;

    if (!user.active) {
      ui.notifications.info(t("Aviso.Offline", { nome: user.name, mapa: cena.name }));
      return this.atualizar();
    }

    // Se o módulo não respondeu no navegador dele, não adianta esperar o pré-carregamento
    const semModulo = this.pingFeito && !this.receptores.has(user.id);
    if (semModulo) ui.notifications.warn(t("Aviso.SemModulo", { nome: user.name }));
    const pre = cfg("precarregar") && !semModulo && !this.precarregados.get(cena.id)?.has(user.id) && user.viewedScene !== cena.id;
    const est = { sceneId: cena.id, envio: true, estado: pre ? "precarregando" : "indo" };
    this.estados.set(user.id, est);
    this.atualizar();

    if (pre) {
      emitir({ acao: "precarregar", userIds: [user.id], sceneId: cena.id });
      const ok = await this.esperar(user.id, cena.id, TEMPO_PRECARGA);
      if (!user.active || this.estados.get(user.id) !== est) return;
      if (!ok) console.warn(`${ID} | sem resposta do pré-carregamento de ${user.name}; enviando mesmo assim`);
      est.estado = "indo";
      this.atualizar();
    }
    await token; // o token já está no mapa quando ele chega
    if (this.estados.get(user.id) !== est) return;
    emitir({ acao: "puxar", userIds: [user.id], sceneId: cena.id });
  }

  precarregarTodos(cena) {
    const ids = game.users.filter(u => !u.isGM && u.active && !this.precarregados.get(cena.id)?.has(u.id)).map(u => u.id);
    if (!ids.length) return ui.notifications.info(t("Aviso.TodosPreCarregados"));
    for (const id of ids) if (!this.estados.get(id)?.envio) this.estados.set(id, { sceneId: cena.id, envio: false, estado: "precarregando" });
    emitir({ acao: "precarregar", userIds: ids, sceneId: cena.id });
    ui.notifications.info(t("Aviso.PreCarregandoPara", { mapa: cena.name, n: ids.length }));
    this.atualizar();
  }

  async puxarTodos(cena) {
    await this.enviarVarios(game.users.filter(u => !u.isGM).map(u => u.id), cena.id);
    ui.notifications.info(t("Aviso.TodosEnviados", { mapa: cena.name }));
  }

  async colocarToken(userId) {
    const user = game.users.get(userId);
    const cena = game.scenes.get(user?.viewedScene);
    if (!user?.character || !cena) return;
    await moverTokenDoJogador(user, cena);
    ui.notifications.info(t("Aviso.TokenColocado", { nome: user.name, mapa: cena.name }));
  }

  // Descarrega um mapa (cena = null: todos os fora de uso) no mestre e nos jogadores.
  // Quem está dentro do mapa não é afetado.
  async descarregar(cena) {
    const sceneId = cena?.id ?? null;
    const nome = cena ? `"${cena.name}"` : t("Memoria.SemNinguem");
    const online = game.users.filter(u => !u.isGM && u.active).map(u => u.id);

    // Soma o que cada navegador liberou e mostra uma notificação só
    if (this._descarga) this._fimDescarga();
    const d = this._descarga = { nome, bytes: 0, pessoas: 0, emUso: [], faltam: new Set([game.user.id, ...online]) };
    d.t = setTimeout(() => this._fimDescarga(d), 8000);

    if (sceneId) this.precarregados.delete(sceneId);
    else for (const id of [...this.precarregados.keys()]) if (id !== canvas.scene?.id) this.precarregados.delete(id);

    if (online.length) emitir({ acao: "descarregar", userIds: online, sceneId });

    const r = await descarregarLocal(sceneId);
    if (r.motivo === "sem-suporte") ui.notifications.warn(t("Memoria.SemSuporte"));
    this._aoDescarregado({ userId: game.user.id, bytes: r.bytes, motivo: r.motivo }, d);
    this.atualizar({ mapas: true });
  }

  _aoDescarregado(data, d = this._descarga) {
    if (!d || !d.faltam.has(data.userId)) return;
    d.faltam.delete(data.userId);
    if (data.motivo === "em-uso") d.emUso.push(data.userId === game.user.id ? t("Memoria.Voce") : (game.users.get(data.userId)?.name ?? "?"));
    else if (data.motivo !== "sem-suporte") { d.bytes += data.bytes ?? 0; d.pessoas++; }
    if (!d.faltam.size) this._fimDescarga(d);
  }

  _fimDescarga(d = this._descarga) {
    if (!d || d.fim) return;
    d.fim = true;
    clearTimeout(d.t);
    if (this._descarga === d) this._descarga = null;
    let msg = d.pessoas
      ? t("Memoria.Liberada", { alvo: d.nome, mb: mb(d.bytes), n: d.pessoas })
      : t("Memoria.Nada", { alvo: d.nome });
    if (d.emUso.length) msg += ` ${t("Memoria.EmUso", { nomes: d.emUso.join(", ") })}`;
    if (d.faltam.size) msg += ` ${t("Memoria.SemResposta", { nomes: [...d.faltam].map(id => game.users.get(id)?.name).join(", ") })}`;
    ui.notifications.info(msg);
  }

  aoSocket(data) {
    if (!data?.userId) return;
    this.receptores.add(data.userId);
    if (data.acao === "pong") return this.atualizar({ jogadores: true });
    if (data.acao !== "status") return;
    if (data.estado === "descarregado") return this._aoDescarregado(data);

    const user = game.users.get(data.userId);
    const est = this.estados.get(data.userId);

    if (data.estado === "pronto" || data.estado === "erro-pre") {
      if (data.estado === "pronto") {
        const set = this.precarregados.get(data.sceneId) ?? new Set();
        set.add(data.userId);
        this.precarregados.set(data.sceneId, set);
      } else ui.notifications.warn(t("Aviso.ErroPreCarregar", { nome: user?.name }));
      this.esperas.get(`${data.userId}:${data.sceneId}`)?.(data.estado === "pronto");
      if (est && !est.envio) this.estados.delete(data.userId);
    }
    if (data.estado === "chegou" && est) {
      est.estado = "chegou";
      setTimeout(() => { if (this.estados.get(data.userId) === est) { this.estados.delete(data.userId); this.atualizar(); } }, 1500);
    }
    if (data.estado === "erro") {
      this.estados.delete(data.userId);
      ui.notifications.error(t("Aviso.ErroCarregar", { nome: user?.name }));
    }
    this.atualizar();
  }
}

// Navegação de cenas: botão e opções de ocultar
function injetarBotaoNav() {
  const nav = navEl();
  if (!nav) return;
  nav.classList.add("nm-nav");
  if (!game.user?.isGM || nav.querySelector(".nm-nav-botao")) return;
  const b = document.createElement("button");
  b.type = "button";
  b.className = "nm-nav-botao ui-control icon fa-solid fa-map-location-dot";
  b.dataset.tooltip = t("Nav.Botao");
  b.setAttribute("aria-label", t("Titulo"));
  b.addEventListener("click", ev => { ev.preventDefault(); ev.stopPropagation(); abrir(); });

  // Encaixa o botão ao lado do ▼ para não empurrar o nome do mapa para outra linha
  const expandir = nav.querySelector('[data-action="toggleExpand"]');
  if (expandir?.parentElement) {
    const grupo = document.createElement("span");
    grupo.className = "nm-nav-grupo";
    expandir.replaceWith(grupo);
    grupo.append(b, expandir);
    return;
  }
  // Sem o ▼: botão flutuando ao lado da barra
  if (getComputedStyle(nav).position === "static") nav.style.position = "relative";
  b.classList.add("nm-nav-flutuante");
  nav.append(b);
}

function aplicarOcultarNav() {
  if (!game.user) return;
  document.body.classList.toggle("nm-ocultar-nav-mestre", game.user.isGM && cfg("ocultarNavMestre"));
  document.body.classList.toggle("nm-ocultar-nav-jogador", !game.user.isGM && cfg("ocultarNavJogadores"));

  const ocultarAba = !!cfg("ocultarAbaCenas");
  document.body.classList.toggle("nm-ocultar-aba-cenas", ocultarAba);
  // Se a aba Cenas estava aberta, volta para o Chat
  if (ocultarAba && ui.sidebar?.tabGroups.primary === "scenes") ui.sidebar.changeTab("chat", "primary");
}

async function limparFixasOffline() {
  // Ativar um mapa vale também para quem está offline
  for (const u of game.users.filter(u => !u.isGM && !u.active && u.getFlag(ID, "cena"))) await u.unsetFlag(ID, "cena");
}

// Carregamento duplo: ao entrar no jogo, o jogador já abre direto no último mapa
// em vez de carregar o mapa ativo e depois trocar. Vale só para o primeiro desenho.
function interceptarPrimeiroDesenho() {
  const Canvas = foundry.canvas?.Canvas;
  if (!Canvas?.prototype?.draw) return;
  const original = Canvas.prototype.draw;
  Canvas.prototype.draw = function (scene, ...resto) {
    Canvas.prototype.draw = original;
    try {
      if (game.user && !game.user.isGM && cfg("lembrarLugar")) {
        const fixa = game.scenes.get(game.user.getFlag(ID, "cena"));
        if (fixa && fixa.id !== scene?.id) scene = fixa;
      }
    } catch (err) { console.warn(`${ID} | não consegui abrir direto no último mapa`, err); }
    return original.call(this, scene, ...resto);
  };
}

// Registro
Hooks.once("init", () => {
  injetarEstilo();
  registrarPortal();
  interceptarPrimeiroDesenho();

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
    scope: "world", config: true, type: Boolean, default: false, onChange: aplicarOcultarNav
  });
  reg("ocultarNavJogadores", {
    name: "NM.Config.OcultarNavJogadores.Nome", hint: "NM.Config.OcultarNavJogadores.Dica",
    scope: "world", config: true, type: Boolean, default: false, onChange: aplicarOcultarNav
  });
  reg("ocultarAbaCenas", {
    name: "NM.Config.OcultarAbaCenas.Nome", hint: "NM.Config.OcultarAbaCenas.Dica",
    scope: "world", config: true, type: Boolean, default: false, onChange: aplicarOcultarNav
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
    onDown: () => { abrir(); return true; }
  });
});

Hooks.on("getSceneControlButtons", controls => {
  if (!game.user.isGM || !controls.tokens) return;
  controls.tokens.tools.navegadorMapas = {
    name: "navegadorMapas", title: "NM.Titulo", icon: "fa-solid fa-map-location-dot",
    button: true, order: 100, onChange: () => abrir()
  };
});

Hooks.on("renderSceneNavigation", () => injetarBotaoNav());

Hooks.on("updateScene", (cena, mudancas) => {
  if (mudancas.active === true && souMestreAtivo()) limparFixasOffline();
  if (cena.id === canvas.scene?.id && foundry.utils.hasProperty(mudancas, `flags.${ID}`)) {
    desenharChegada();
    atualizarMusicaLocal();
  }
});

// Mapa excluído: quem estava "marcado" para entrar nele perde a marcação
Hooks.on("deleteScene", async cena => {
  if (!souMestreAtivo()) return;
  app?.precarregados.delete(cena.id);
  for (const u of game.users.filter(u => u.getFlag(ID, "cena") === cena.id)) await u.unsetFlag(ID, "cena").catch(console.error);
});

Hooks.on("userConnected", (user, conectado) => {
  if (!game.user.isGM || !app) return;
  app.esquecer(user.id);
  if (conectado) setTimeout(() => app.rendered && app.ping(), 4000);
});

// Opção: descarregar o mapa anterior ao trocar de mapa
let cenaAnterior = null;
Hooks.on("canvasReady", () => {
  limparBarras();
  gravarLugar();
  desenharChegada();
  atualizarMusicaLocal();
  if (game.user.isGM) app?.lembrarRecente(canvas.scene?.id);
  // Se abriu direto no último mapa, avisa os outros onde o jogador está
  else if (canvas.scene && game.user.viewedScene !== canvas.scene.id) {
    try { game.user.broadcastActivity?.({ sceneId: canvas.scene.id }); } catch {}
  }
  const anterior = cenaAnterior;
  cenaAnterior = canvas.scene?.id ?? null;
  if (anterior && anterior !== cenaAnterior && cfg("liberarAnterior")) {
    setTimeout(() => {
      // ...a menos que a pessoa já tenha voltado para ele
      if (canvas.scene?.id !== anterior) descarregarLocal(anterior).catch(err => console.warn(`${ID} | falha ao descarregar o mapa anterior`, err));
    }, 3000);
  }
});

Hooks.once("ready", () => {
  if (game.user.isGM) app = new NavegadorMapas(); // existe mesmo fechada: recebe respostas e portais

  game.socket.on(SOCKET, data => {
    if (!data?.acao) return;
    if (game.user.isGM) {
      if (data.acao === "gravar") {
        if (souMestreAtivo() && game.scenes.has(data.sceneId))
          game.users.get(data.userId)?.setFlag(ID, "cena", data.sceneId).catch(console.error);
        return;
      }
      if (data.acao === "portal") { if (souMestreAtivo()) executarPortal(data); return; }
      if (data.acao === "pedir-envio") {
        if (souMestreAtivo() && game.scenes.has(data.sceneId)) app.enviarVarios(data.userIds ?? [], data.sceneId);
        return;
      }
      app?.aoSocket(data);
    } else aoReceberJogador(data);
  });

  // API para macros e outros módulos (ex.: Monk's Active Tiles → "Executar macro")
  game.modules.get(ID).api = {
    abrir,
    // userIds: um id ou uma lista. Jogador só pode pedir para si mesmo.
    enviar: (userIds, sceneId) => {
      const ids = [userIds].flat().filter(Boolean);
      if (!game.scenes.has(sceneId)) return ui.notifications.warn(t("Aviso.MapaNaoExiste"));
      if (game.user.isGM) return app.enviarVarios(ids, sceneId);
      emitir({ acao: "pedir-envio", userIds: [game.user.id], sceneId });
    },
    portal: (token, sceneId, regiaoUuid = null) => {
      const doc = token?.document ?? token;
      if (doc?.uuid && game.scenes.has(sceneId)) pedirPortal({ tokenUuid: doc.uuid, sceneId, regiaoUuid, confirmar: false });
    }
  };

  injetarBotaoNav();
  aplicarOcultarNav();

  if (!game.user.isGM) {
    // Leva o jogador ao último mapa visitado (normalmente já abriu direto nele)
    const fixa = cfg("lembrarLugar") ? game.user.getFlag(ID, "cena") : null;
    const liberar = () => { podeGravar = true; gravarLugar(); };
    if (fixa && game.scenes.get(fixa)) irPara(fixa).finally(liberar);
    else esperarCanvas().then(liberar);
  }
  limparBarras(3000);
});

// Usado pelos gatilhos (scripts/gatilhos.js)
export { ID, SOCKET, t, esc, emitir, cfg, comparar, souMestreAtivo, esperarAnimacao, executarPortal, centroDaRegiao, esperarCanvas };
