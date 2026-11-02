// Navegador de Mundos — viagem: troca de mapa do jogador, transição, música,
// casas livres, portais, ponto de chegada e o "último mapa" de cada jogador

import { ID, t, esc, cfg, emitir, souMestreAtivo, estado, enfileirar, esperarCanvas } from "./nucleo.js";

// Tela de transição: nome do mapa (o nome que os jogadores veem) enquanto ele carrega
export async function mostrarTransicao(cena) {
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

export async function esconderTransicao(el) {
  if (!el) return;
  const falta = 1600 - (Date.now() - el._inicio); // fica tempo suficiente para ler o nome
  if (falta > 0) await new Promise(r => setTimeout(r, falta));
  clearTimeout(el._seguranca);
  el.classList.remove("visivel");
  setTimeout(() => el.remove(), 700);
}

// Ao chegar, seleciona o token do jogador e centraliza a câmera nele
export function focarToken() {
  try {
    const char = game.user.character;
    const tokens = canvas.tokens?.placeables ?? [];
    const tk = (char && tokens.find(x => x.document.actorId === char.id && x.isOwner)) ?? tokens.find(x => x.isOwner && x.actor?.hasPlayerOwner);
    if (!tk) return;
    tk.control({ releaseOthers: true });
    canvas.animatePan({ x: tk.center.x, y: tk.center.y, duration: 600 });
  } catch (err) { console.warn(`${ID} |`, err); }
}

export function irPara(sceneId, { transicao = false } = {}) {
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
    focarToken();
  });
}

// O jogador sempre volta para o último mapa em que esteve
let podeGravar = false;
// Depois que o jogador chegou ao mapa inicial, o "último mapa" pode ser gravado
export function liberarGravacao() { podeGravar = true; gravarLugar(); }
export async function gravarLugar() {
  if (game.user.isGM || !podeGravar) return;
  const id = canvas.scene?.id;
  if (!id || game.user.getFlag(ID, "cena") === id) return;
  try { await game.user.setFlag(ID, "cena", id); }
  catch { emitir({ acao: "gravar", userId: game.user.id, sceneId: id }); } // sem permissão, o mestre grava
}

// Música do mapa
// "local": só quem está no mapa ouve (toca no navegador dele).
// "todos": o mestre toca a playlist nativa para a mesa inteira.
export let musicaLocal = null;
export function sonsDaMusica(m) {
  const pl = game.playlists.get(m.playlist);
  if (pl) return { sons: pl.sounds.contents.filter(s => s.path).sort((a, b) => a.sort - b.sort)
    .map(s => ({ path: s.path, volume: s.volume ?? 0.5 })), aleatorio: pl.mode === CONST.PLAYLIST_MODES.SHUFFLE };
  return { sons: m.sons ?? [], aleatorio: !!m.aleatorio }; // cópia guardada no mapa (jogador sem acesso à playlist)
}

export async function tocarLocal(m) {
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

export function pararLocal() {
  const som = musicaLocal?.som;
  musicaLocal = null;
  if (!som) return;
  try { som.fade?.(0, { duration: 1500 }); setTimeout(() => som.stop?.(), 1600); }
  catch { som.stop?.(); }
}

export function atualizarMusicaLocal() {
  if (game.user.isGM) return;
  const m = canvas.scene?.getFlag(ID, "musica");
  if (m?.modo === "local" && m.playlist) tocarLocal(m);
  else pararLocal();
}

export const tocandoAgora = new Set();
export async function tocarParaTodos(cena) {
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

// Tokens: ponto de chegada e casas livres
export const reservas = new Map(); // sceneId -> Set("col,lin") reservadas por alguns segundos

// Centro de uma Região (pelos formatos dela), em qualquer mapa
export async function centroDaRegiao(uuid) {
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

// Casa livre mais perto do ponto (ponto de chegada do mapa, ou o centro), em espiral.
// Usa a grade do mapa (quadrada ou hexagonal); sem grade, vale uma grade quadrada do tamanho configurado.
// width/height: tamanho do token em casas, para ele não cair em cima de outro.
export function vagaLivre(destino, centro = null, { width = 1, height = 1 } = {}) {
  const d = destino.dimensions;
  const gs = d.size;
  const grid = destino.grid.isGridless ? new foundry.grid.SquareGrid({ size: gs }) : destino.grid;
  const hex = grid.isHexagonal;
  const chegada = destino.getFlag(ID, "chegada");
  // A bandeirinha guarda o canto da casa; passamos para o centro dela para achar a casa certa em qualquer grade
  const ref = centro ?? (chegada ? { x: chegada.x + grid.sizeX / 2, y: chegada.y + grid.sizeY / 2 }
    : { x: d.sceneX + d.sceneWidth / 2, y: d.sceneY + d.sceneHeight / 2 });
  const o0 = grid.getOffset(ref);
  const chave = o => `${o.i},${o.j}`;
  const res = reservas.get(destino.id) ?? new Set();
  reservas.set(destino.id, res);

  // Casas que um token ocupa (na grade quadrada, todas as dele; na hexagonal, a do centro)
  const casasDe = (x, y, w, h) => {
    if (hex) return [chave(grid.getOffset({ x: x + w * grid.sizeX / 2, y: y + h * grid.sizeY / 2 }))];
    const casas = [];
    for (let i = 0; i < Math.max(1, Math.ceil(h)); i++) for (let j = 0; j < Math.max(1, Math.ceil(w)); j++)
      casas.push(chave(grid.getOffset({ x: x + (j + 0.5) * gs, y: y + (i + 0.5) * gs })));
    return casas;
  };
  const ocupadas = new Set(destino.tokens.contents.flatMap(tk => casasDe(tk.x, tk.y, tk.width ?? 1, tk.height ?? 1)));
  const dentro = p => p.x >= d.sceneX && p.y >= d.sceneY && p.x <= d.sceneX + d.sceneWidth && p.y <= d.sceneY + d.sceneHeight;
  // Posição do token quando a casa é a primeira dele (na hexagonal, centrado na casa)
  const posicao = o => {
    if (!hex) return grid.getTopLeftPoint(o);
    const c = grid.getCenterPoint(o);
    return { x: c.x - width * grid.sizeX / 2, y: c.y - height * grid.sizeY / 2 };
  };

  for (let raio = 0; raio <= 8; raio++) {
    for (let di = -raio; di <= raio; di++) for (let dj = -raio; dj <= raio; dj++) {
      if (Math.max(Math.abs(di), Math.abs(dj)) !== raio) continue;
      const o = { i: o0.i + di, j: o0.j + dj };
      if (!dentro(grid.getCenterPoint(o))) continue;
      const p = posicao(o);
      const casas = casasDe(p.x, p.y, width, height);
      if (casas.some(k => ocupadas.has(k) || res.has(k))) continue;
      // Reserva as casas: vários tokens enviados juntos não caem no mesmo lugar
      for (const k of casas) { res.add(k); setTimeout(() => res.delete(k), 5000); }
      return { x: Math.round(p.x), y: Math.round(p.y) };
    }
  }
  const p = posicao(o0);
  return { x: Math.round(p.x), y: Math.round(p.y) };
}

// Leva um token existente para outro mapa (mantém vida, efeitos e configurações dele)
export async function moverTokenPara(tokenDoc, destino, centro = null) {
  const origem = tokenDoc.parent;
  const dados = tokenDoc.toObject();
  for (const k of Object.keys(dados)) if (k.startsWith("_")) delete dados[k];
  Object.assign(dados, vagaLivre(destino, centro, { width: tokenDoc.width, height: tokenDoc.height }));
  const [novo] = await destino.createEmbeddedDocuments("Token", [dados]);
  if (origem && origem.id !== destino.id) await tokenDoc.delete();
  return novo;
}

// Token do personagem do jogador no mapa de destino
export async function moverTokenDoJogador(user, destino, origemId = user.viewedScene ?? user.getFlag(ID, "cena")) {
  const ator = user.character;
  if (!ator || destino.tokens.some(tk => tk.actorId === ator.id)) return;
  const origem = game.scenes.get(origemId);
  const antigo = origem && origem.id !== destino.id ? origem.tokens.find(tk => tk.actorId === ator.id) : null;
  if (antigo) return moverTokenPara(antigo, destino);

  const proto = ator.prototypeToken;
  const dados = vagaLivre(destino, null, { width: proto?.width ?? 1, height: proto?.height ?? 1 });
  const novo = await ator.getTokenDocument(dados, { parent: destino });
  await destino.createEmbeddedDocuments("Token", [novo.toObject()]);
}

// Deixa a animação do movimento terminar antes de sumir com o token
export async function esperarAnimacao(tokenDoc) {
  try {
    const nome = tokenDoc?.object?.animationName;
    if (nome) await foundry.canvas.animation.CanvasAnimation.getAnimation(nome)?.promise;
  } catch (err) { console.warn(`${ID} | não consegui esperar a animação do token`, err); }
}

// Levar um token (e os jogadores donos dele) para outro mapa — usado pela API (ex.: Objetos Vivos)
export const emPortal = new Set();
export function pedirPortal(dados) {
  if (emPortal.has(dados.tokenUuid)) return;
  emPortal.add(dados.tokenUuid);
  setTimeout(() => emPortal.delete(dados.tokenUuid), 3000);
  if (souMestreAtivo()) return executarPortal(dados);
  if (!game.users.activeGM) return ui.notifications.warn(t("Portal.SemMestre"));
  emitir({ acao: "portal", ...dados });
}

export const portaisEmCurso = new Set();
export async function executarPortal({ tokenUuid, sceneId, regiaoUuid, confirmar }) {
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
    if (jogadores.length) await estado.app.enviarVarios(jogadores.map(u => u.id), cena.id, { semToken: true });
    else tocarParaTodos(cena);
  } catch (err) {
    console.error(err);
    ui.notifications.error(t("Portal.Erro"));
  } finally {
    setTimeout(() => portaisEmCurso.delete(tokenUuid), 2000);
  }
}

// Ponto de chegada: escolher com um clique no mapa e mostrar a bandeirinha para o mestre
export function escolherPontoNoCanvas() {
  return new Promise(resolve => {
    const view = document.getElementById("board"); // o <canvas> do mapa
    if (!view) return resolve(null);
    const ac = new AbortController();
    const op = { capture: true, signal: ac.signal };
    document.body.classList.add("nm-escolhendo");
    const fim = v => { ac.abort(); document.body.classList.remove("nm-escolhendo"); resolve(v); };
    document.addEventListener("pointerdown", ev => {
      if (ev.target !== view) return;
      ev.stopPropagation(); ev.preventDefault();
      if (ev.button !== 0) return fim(null); // botão direito cancela
      const p = canvas.canvasCoordinatesFromClient({ x: ev.clientX, y: ev.clientY });
      fim({ x: p.x, y: p.y });
    }, op);
    document.addEventListener("keydown", ev => { if (ev.key === "Escape") { ev.stopPropagation(); fim(null); } }, op);
  });
}

export let marcador = null;
export function desenharChegada() {
  try { marcador?.destroy({ children: true }); } catch (err) { console.warn(`${ID} | não consegui apagar o marcador anterior`, err); }
  marcador = null;
  if (!game.user.isGM || !canvas.ready) return;
  const p = canvas.scene?.getFlag(ID, "chegada");
  if (!p) return;
  try {
    const gs = canvas.dimensions.size;
    const grid = canvas.grid;
    const g = new PIXI.Graphics();
    // Contorno da casa de chegada no formato da grade (quadrado ou hexágono); sem grade, um quadrado
    const vertices = grid.isGridless ? [] : grid.getVertices(grid.getOffset({ x: p.x + grid.sizeX / 2, y: p.y + grid.sizeY / 2 }));
    g.lineStyle(3, 0xff8c1a, 0.9).beginFill(0xff8c1a, 0.15);
    if (vertices.length) g.drawPolygon(vertices.flatMap(v => [v.x - p.x, v.y - p.y]));
    else g.drawRect(0, 0, gs, gs);
    g.endFill();
    // bandeirinha
    g.lineStyle(3, 0xffffff, 0.95).moveTo(gs * 0.35, gs * 0.8).lineTo(gs * 0.35, gs * 0.2);
    g.lineStyle(0).beginFill(0xff8c1a, 1).drawPolygon([gs * 0.35, gs * 0.2, gs * 0.72, gs * 0.32, gs * 0.35, gs * 0.45]).endFill();
    g.position.set(p.x, p.y);
    g.eventMode = "none";
    canvas.controls.addChild(g);
    marcador = g;
  } catch (err) { console.warn(`${ID} | não consegui desenhar o ponto de chegada`, err); }
}

export async function limparFixasOffline() {
  // Ativar um mapa vale também para quem está offline
  for (const u of game.users.filter(u => !u.isGM && !u.active && u.getFlag(ID, "cena"))) await u.unsetFlag(ID, "cena");
}

// Carregamento duplo: ao entrar no jogo, o jogador já abre direto no último mapa
// em vez de carregar o mapa ativo e depois trocar. Vale só para o primeiro desenho.
export function interceptarPrimeiroDesenho() {
  const Canvas = foundry.canvas.Canvas;
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
