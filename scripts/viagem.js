// Navegador de Mundos — viagem: troca de mapa do jogador, transição, música,
// casas livres, portais, ponto de chegada e o "último mapa" de cada jogador

import { ID, t, esc, cfg, emitir, souMestreAtivo, estado, enfileirar, esperarCanvas, esperarCena } from "./nucleo.js";

const ENTRADA_TRANSICAO_MS = 550;       // tempo do escurecimento antes de trocar o mapa (acompanha o CSS)
const SAIDA_TRANSICAO_MS = 700;         // tempo do clareamento antes de tirar a tela do DOM
const SEGURANCA_TRANSICAO_MS = 90_000;  // se algo travar, a tela some sozinha depois disso
const LIMITE_TROCA_MS = 80_000;         // espera máxima pelo mapa novo terminar de desenhar (menor que a segurança)
const PAN_CHEGADA_MS = 600;             // duração do movimento da câmera até o token ao chegar
const FADE_MUSICA_MS = 1500;            // a música local abaixa aos poucos antes de parar
const ESPERA_FAIXAS_MS = 10_000;        // quanto o jogador espera o mestre mandar as faixas da playlist
const TRAVA_MUSICA_TODOS_MS = 3000;     // evita disparar a mesma playlist duas vezes num envio em grupo
const RESERVA_CASA_MS = 5000;           // casa reservada para um token que está chegando (envio em grupo)
const RAIO_BUSCA_CASAS = 8;             // até quantas casas de distância procurar uma casa livre
const TRAVA_PEDIDO_PORTAL_MS = 3000;    // ignora pedidos repetidos de portal para o mesmo token
const FOLGA_PORTAL_MS = 2000;           // depois de um portal, o mesmo token fica esse tempo sem outro

// Tela de transição: nome do mapa (o nome que os jogadores veem) enquanto ele carrega
const telas = new WeakMap(); // tela -> { inicio, seguranca } (sem pendurar propriedades no elemento)
// Textos da tela: cada mapa pode ter título, comentário e texto de carregamento próprios
// (em "Nota, etiquetas e música"). Em branco, usa o nome do mapa e o texto padrão das configurações.
export function textosTransicao(cena, mudar = {}) {
  const f = { ...(cena.getFlag(ID, "transicao") ?? {}), ...mudar };
  const limpo = v => (typeof v === "string" ? v.trim() : "");
  return {
    titulo: limpo(f.titulo) || cena.navName || cena.name,
    comentario: limpo(f.comentario),
    carregando: f.semCarregando ? "" : (limpo(f.carregando) || limpo(cfg("transicaoTexto")) || t("Transicao.Carregando"))
  };
}

async function mostrarTransicao(cena, mudar = {}) {
  const modo = cfg("transicao");
  if (modo === "off" && !mudar.previa) return null;
  const tx = textosTransicao(cena, mudar);
  const el = document.createElement("div");
  el.className = "nm-transicao";
  const fundo = modo !== "nome" && cena.thumb
    ? `<div class="nm-transicao-fundo" style="background-image:url('${esc(cena.thumb)}')"></div>` : "";
  el.innerHTML = `${fundo}
    <div class="nm-transicao-nome">${esc(tx.titulo)}</div>
    <div class="nm-transicao-linha"></div>
    ${tx.comentario ? `<div class="nm-transicao-comentario">${esc(tx.comentario)}</div>` : ""}
    ${tx.carregando ? `<div class="nm-transicao-sub">${esc(tx.carregando)}</div>` : ""}`;
  document.body.appendChild(el);
  telas.set(el, { inicio: Date.now(), seguranca: setTimeout(() => el.remove(), SEGURANCA_TRANSICAO_MS) });
  // Força o navegador a calcular a tela escondida e só então liga o escurecimento.
  // (Antes dependia de requestAnimationFrame, que não roda com a aba do Foundry em segundo plano:
  // a tela ficava transparente e o jogador via o mapa trocar sem a transição.)
  void el.offsetHeight;
  el.classList.add("visivel", "ativa"); // "ativa" fica até o fim: o nome não some de repente na saída
  await new Promise(r => setTimeout(r, ENTRADA_TRANSICAO_MS));
  return el;
}

async function esconderTransicao(el) {
  const dados = el && telas.get(el);
  if (!dados) return;
  // Mesmo que o mapa carregue rápido, a animação roda inteira: a tela fica pelo menos o tempo
  // escolhido nas configurações, contado a partir do momento em que ela termina de escurecer.
  const minimo = ENTRADA_TRANSICAO_MS + Math.max(1, Number(cfg("transicaoTempo")) || 3) * 1000;
  const falta = minimo - (Date.now() - dados.inicio);
  if (falta > 0) await new Promise(r => setTimeout(r, falta));
  clearTimeout(dados.seguranca);
  telas.delete(el);
  el.classList.remove("visivel");
  setTimeout(() => el.remove(), SAIDA_TRANSICAO_MS);
}

// Prévia para o mestre (botão em "Nota, etiquetas e música"): mostra a tela com os textos do
// formulário, sem trocar de mapa. Um clique na tela fecha antes da hora.
export async function previaTransicao(cena, mudar = {}) {
  const tela = await mostrarTransicao(cena, { ...mudar, previa: true });
  if (!tela) return;
  await new Promise(r => {
    const tm = setTimeout(r, Math.max(1, Number(cfg("transicaoTempo")) || 3) * 1000);
    tela.addEventListener("click", () => { clearTimeout(tm); r(); }, { once: true });
  });
  esconderTransicao(tela);
}

// Ao chegar, seleciona o token do jogador e centraliza a câmera nele
function focarToken() {
  try {
    const char = game.user.character;
    const tokens = canvas.tokens?.placeables ?? [];
    const tk = (char && tokens.find(x => x.document.actorId === char.id && x.isOwner)) ?? tokens.find(x => x.isOwner && x.actor?.hasPlayerOwner);
    if (!tk) return;
    tk.control({ releaseOthers: true });
    canvas.animatePan({ x: tk.center.x, y: tk.center.y, duration: PAN_CHEGADA_MS });
  } catch (err) { console.warn(`${ID} |`, err); }
}

export function irPara(sceneId, { transicao = false } = {}) {
  return enfileirar(async () => {
    const cena = game.scenes.get(sceneId);
    if (!cena) return;
    await esperarCanvas();
    if (canvas.scene?.id === cena.id) return;
    const tela = transicao ? await mostrarTransicao(cena).catch(err => { console.warn(`${ID} | tela de transição`, err); return null; }) : null;
    try {
      const desenhou = esperarCena(cena.id, LIMITE_TROCA_MS); // antes do view(), para não perder o aviso
      await cena.view();
      await desenhou;
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
// As faixas são sempre lidas da playlist na hora de tocar. Jogador sem acesso à
// playlist pede ao mestre, que lê as faixas atuais e manda só para ele.
let musicaLocal = null;
function faixasDaPlaylist(pl) {
  return {
    sons: pl.sounds.contents.filter(s => s.path).sort((a, b) => a.sort - b.sort).map(s => ({ path: s.path, volume: s.volume ?? 0.5 })),
    aleatorio: pl.mode === CONST.PLAYLIST_MODES.SHUFFLE
  };
}

// Mestre: faixas atuais da música "local" de um mapa (null se não houver)
// (playlist apagada: responde com a lista vazia, para o jogador não ficar esperando)
export function faixasDoMapa(sceneId) {
  const m = game.scenes.get(sceneId)?.getFlag(ID, "musica");
  if (m?.modo !== "local" || !m.playlist) return null;
  const pl = game.playlists.get(m.playlist);
  return { playlist: m.playlist, ...(pl ? faixasDaPlaylist(pl) : { sons: [], aleatorio: false }) };
}

// Pedido de faixas ao mestre que ainda não foi respondido (só vale o mais recente)
let pedidoFaixas = null; // { sceneId, playlist, tm }
function cancelarPedidoFaixas() {
  clearTimeout(pedidoFaixas?.tm);
  pedidoFaixas = null;
}

// Jogador: resposta do mestre com as faixas (só vale se ele ainda está naquele mapa)
export function aoReceberFaixas(data) {
  if (pedidoFaixas?.sceneId !== data.sceneId || pedidoFaixas.playlist !== data.playlist) return;
  cancelarPedidoFaixas();
  const m = canvas.scene?.id === data.sceneId ? canvas.scene.getFlag(ID, "musica") : null;
  if (m?.modo !== "local" || m.playlist !== data.playlist || !Array.isArray(data.sons)) return;
  const sons = data.sons.filter(s => typeof s?.path === "string")
    .map(s => ({ path: s.path, volume: Number.isFinite(s.volume) ? s.volume : 0.5 }));
  tocarLocal(m, { sons, aleatorio: !!data.aleatorio });
}

async function tocarLocal(m, { sons, aleatorio }) {
  if (musicaLocal?.playlist === m.playlist) return;
  pararLocal();
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
  try { som.fade?.(0, { duration: FADE_MUSICA_MS }); setTimeout(() => som.stop?.(), FADE_MUSICA_MS + 100); }
  catch { som.stop?.(); }
}

export function atualizarMusicaLocal() {
  if (game.user.isGM) return;
  const cena = canvas.scene;
  const m = cena?.getFlag(ID, "musica");
  if (m?.modo !== "local" || !m.playlist) { cancelarPedidoFaixas(); return pararLocal(); }
  if (musicaLocal?.playlist === m.playlist) return;
  if (pedidoFaixas?.sceneId === cena.id && pedidoFaixas.playlist === m.playlist) return; // já pediu, esperando
  // Mapa com outra música: a anterior para já, sem esperar as faixas novas
  cancelarPedidoFaixas();
  pararLocal();
  const pl = game.playlists.get(m.playlist);
  if (pl) return tocarLocal(m, faixasDaPlaylist(pl));
  // Cópia das faixas que as versões até a 4.3 guardavam no mapa (só quando não há outra fonte)
  const copiaAntiga = () => { if (m.sons?.length) tocarLocal(m, { sons: m.sons, aleatorio: !!m.aleatorio }); };
  if (!game.users.activeGM) return copiaAntiga();
  // Sem acesso à playlist: pede as faixas ao mestre; sem resposta a tempo, fica em silêncio (ou usa a cópia antiga)
  const pedido = pedidoFaixas = { sceneId: cena.id, playlist: m.playlist };
  pedido.tm = setTimeout(() => {
    if (pedidoFaixas !== pedido) return;
    pedidoFaixas = null;
    console.warn(`${ID} | o mestre não mandou as faixas da música de "${cena.name}"`);
    if (canvas.scene?.id === cena.id) copiaAntiga();
  }, ESPERA_FAIXAS_MS);
  emitir({ acao: "pedir-musica", sceneId: cena.id });
}

const tocandoAgora = new Set();
export async function tocarParaTodos(cena) {
  const m = cena?.getFlag(ID, "musica");
  if (m?.modo !== "todos" || !m.playlist || tocandoAgora.has(cena.id)) return;
  const pl = game.playlists.get(m.playlist);
  if (!pl || pl.playing) return;
  tocandoAgora.add(cena.id);
  setTimeout(() => tocandoAgora.delete(cena.id), TRAVA_MUSICA_TODOS_MS);
  try {
    if (m.pararOutras) for (const p of game.playlists.playing ?? []) if (p !== pl) await p.stopAll();
    await pl.playAll();
  } catch (err) { console.warn(`${ID} | não consegui tocar a playlist`, err); }
}

// Tokens: ponto de chegada e casas livres
export const reservas = new Map(); // sceneId -> Set("col,lin") reservadas por alguns segundos

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

// Casas em volta de uma casa, em anéis (raio 0 = a própria casa, raio 1 = as vizinhas...).
// Hexagonal: os vizinhos que a própria grade informa (anéis de 6, 12, 18 hexágonos).
// Quadrada: as 8 casas em volta, diagonais incluídas (anéis quadrados de 8, 16...), qualquer que
// seja a regra de diagonal do mundo. Devolve [{ o: {i, j}, raio }] do centro para fora.
function casasEmAneis(grid, o0, raioMax) {
  const chave = o => `${o.i},${o.j}`;
  const vizinhas = grid.isHexagonal ? o => grid.getAdjacentOffsets(o)
    : o => [-1, 0, 1].flatMap(di => [-1, 0, 1].map(dj => ({ i: o.i + di, j: o.j + dj }))).filter(x => x.i !== o.i || x.j !== o.j);
  const vistas = new Set([chave(o0)]);
  const lista = [{ o: { i: o0.i, j: o0.j }, raio: 0 }];
  for (let k = 0; k < lista.length; k++) {
    const { o, raio } = lista[k];
    if (raio >= raioMax) continue;
    for (const v of vizinhas(o)) {
      const n = { i: v.i, j: v.j };
      if (vistas.has(chave(n))) continue;
      vistas.add(chave(n));
      lista.push({ o: n, raio: raio + 1 });
    }
  }
  return lista;
}

// Grade usada para a área de chegada (sem grade, vale uma grade quadrada do tamanho configurado)
const gradeDe = cena => cena.grid.isGridless ? new foundry.grid.SquareGrid({ size: cena.dimensions.size }) : cena.grid;

// Raio da área de chegada escolhido pelo mestre (0 = só a casa da bandeira)
const raioDaArea = () => Math.max(0, Math.min(5, Math.round(Number(cfg("areaChegada")) || 0)));

// Casas da área de chegada de um mapa (vazio se o mapa não tem bandeira)
export function casasDaArea(cena) {
  const chegada = cena?.getFlag(ID, "chegada");
  if (!chegada) return [];
  const grid = gradeDe(cena);
  const o0 = grid.getOffset({ x: chegada.x + grid.sizeX / 2, y: chegada.y + grid.sizeY / 2 });
  return casasEmAneis(grid, o0, raioDaArea());
}

// Casa livre mais perto do ponto (ponto de chegada do mapa, ou o centro), do centro para fora.
// Com bandeira, primeiro as casas da área de chegada (uma casa por token); com a área cheia,
// a casa livre mais próxima fora dela, e o mestre é avisado.
// Usa a grade do mapa (quadrada ou hexagonal); sem grade, vale uma grade quadrada do tamanho configurado.
// width/height: tamanho do token em casas, para ele não cair em cima de outro.
function vagaLivre(destino, centro = null, { width = 1, height = 1, nome = "" } = {}) {
  const d = destino.dimensions;
  const grid = gradeDe(destino);
  const hex = grid.isHexagonal;
  const chegada = destino.getFlag(ID, "chegada");
  // A bandeirinha guarda o canto da casa; passamos para o centro dela para achar a casa certa em qualquer grade
  const ref = centro ?? (chegada ? { x: chegada.x + grid.sizeX / 2, y: chegada.y + grid.sizeY / 2 }
    : { x: d.sceneX + d.sceneWidth / 2, y: d.sceneY + d.sceneHeight / 2 });
  const o0 = grid.getOffset(ref);
  const chave = o => `${o.i},${o.j}`;
  const res = reservas.get(destino.id) ?? new Set();
  reservas.set(destino.id, res);

  // Casas que um token ocupa: todas as casas que o retângulo dele toca, amostrado a cada meia casa.
  // Na grade quadrada é exato; na hexagonal é um pouco folgado (prefere deixar espaço a encostar).
  const casasDe = (x, y, w, h) => {
    const larg = Math.max(1, w) * grid.sizeX, alt = Math.max(1, h) * grid.sizeY;
    const px = grid.sizeX / 2, py = grid.sizeY / 2;
    const casas = new Set();
    for (let yy = y + py / 2; yy < y + alt; yy += py) for (let xx = x + px / 2; xx < x + larg; xx += px)
      casas.add(chave(grid.getOffset({ x: xx, y: yy })));
    return [...casas];
  };
  const ocupadas = new Set(destino.tokens.contents.flatMap(tk => casasDe(tk.x, tk.y, tk.width ?? 1, tk.height ?? 1)));
  const larg = Math.max(1, width) * grid.sizeX, alt = Math.max(1, height) * grid.sizeY;
  // Token maior que o próprio mapa: não há onde pôr. Para antes de criar qualquer coisa (o original fica).
  if (larg > d.sceneWidth + 1 || alt > d.sceneHeight + 1) {
    ui.notifications.error(t("Aviso.TokenNaoCabe", { token: nome, mapa: destino.name }));
    throw Object.assign(new Error(`${nome} não cabe em "${destino.name}"`), { avisado: true });
  }
  // O token inteiro (não só o centro da casa) precisa caber dentro da área do mapa
  const cabe = p => p.x >= d.sceneX && p.y >= d.sceneY
    && p.x + larg <= d.sceneX + d.sceneWidth + 1 && p.y + alt <= d.sceneY + d.sceneHeight + 1;
  // Posição do token quando a casa é a primeira dele (na hexagonal, centrado na casa)
  const posicao = o => {
    if (!hex) return grid.getTopLeftPoint(o);
    const c = grid.getCenterPoint(o);
    return { x: c.x - larg / 2, y: c.y - alt / 2 };
  };

  // A área de chegada só vale para a bandeira (num portal com Região, o token vai para o centro dela)
  const raioArea = !centro && chegada ? raioDaArea() : 0;
  for (const { o, raio } of casasEmAneis(grid, o0, raioArea + RAIO_BUSCA_CASAS)) {
    const p = posicao(o);
    if (!cabe(p)) continue;
    const casas = casasDe(p.x, p.y, width, height);
    if (casas.some(k => ocupadas.has(k) || res.has(k))) continue;
    // Reserva as casas: vários tokens enviados juntos não caem no mesmo lugar
    for (const k of casas) { res.add(k); setTimeout(() => res.delete(k), RESERVA_CASA_MS); }
    if (raioArea > 0 && raio > raioArea) ui.notifications.warn(t("Aviso.AreaCheia", { mapa: destino.name }));
    return { x: Math.round(p.x), y: Math.round(p.y) };
  }
  // Nenhuma casa livre perto: fica no ponto de referência, empurrado para dentro do mapa, e o mestre é avisado
  ui.notifications.warn(t("Aviso.SemCasaLivre", { mapa: destino.name }));
  const p = posicao(o0);
  const limitar = (v, min, max) => Math.max(min, Math.min(v, Math.max(min, max)));
  return {
    x: Math.round(limitar(p.x, d.sceneX, d.sceneX + d.sceneWidth - larg)),
    y: Math.round(limitar(p.y, d.sceneY, d.sceneY + d.sceneHeight - alt))
  };
}

// Leva um token existente para outro mapa (mantém vida, efeitos e configurações dele)
// Cria a cópia no destino e só então apaga o original. Se apagar o original falhar,
// desfaz a cópia; se até isso falhar, avisa o mestre (fica um token em cada mapa).
// Em qualquer falha lança um erro com .avisado = true (quem chamou não repete o aviso).
async function moverTokenPara(tokenDoc, destino, centro = null) {
  const origem = tokenDoc.parent;
  const dados = tokenDoc.toObject();
  for (const k of Object.keys(dados)) if (k.startsWith("_")) delete dados[k];
  Object.assign(dados, vagaLivre(destino, centro, { width: tokenDoc.width, height: tokenDoc.height, nome: tokenDoc.name }));
  const [novo] = await destino.createEmbeddedDocuments("Token", [dados]);
  if (!origem || origem.id === destino.id) return novo;
  try {
    await tokenDoc.delete();
  } catch (errApagar) {
    console.error(`${ID} | não consegui apagar ${tokenDoc.name} em "${origem.name}"`, errApagar);
    const nomes = { token: tokenDoc.name, origem: origem.name, destino: destino.name };
    try {
      await novo?.delete();
      ui.notifications.error(t("Aviso.TransferenciaDesfeita", nomes));
    } catch (errDesfazer) {
      console.error(`${ID} | não consegui desfazer a cópia de ${tokenDoc.name} em "${destino.name}"`, errDesfazer);
      ui.notifications.error(t("Aviso.TokenDuplicado", nomes), { permanent: true });
    }
    throw Object.assign(new Error(`Transferência de ${tokenDoc.name} falhou`), { avisado: true });
  }
  return novo;
}

// Token do personagem do jogador no mapa de destino
// Uma transferência por personagem de cada vez, e só a mais nova vale:
// - dois jogadores com o mesmo personagem enviados juntos: o segundo encontra o token já no destino;
// - dois envios rápidos para mapas diferentes: o que ainda esperava na fila é substituído pelo mais
//   novo, e quem roda procura o token onde o módulo o deixou por último (não na origem antiga).
const filaPorAtor = new Map();   // actorId -> promessa da última transferência na fila
const pedidoPorAtor = new Map(); // actorId -> número do pedido mais recente
const ondeLevei = new Map();     // actorId -> sceneId para onde o módulo levou o token por último
export function moverTokenDoJogador(user, destino, origemId = user.viewedScene ?? user.getFlag(ID, "cena")) {
  const ator = user.character;
  if (!ator) return Promise.resolve();
  const pedido = (pedidoPorAtor.get(ator.id) ?? 0) + 1;
  pedidoPorAtor.set(ator.id, pedido);
  const anterior = filaPorAtor.get(ator.id) ?? Promise.resolve();
  const vez = anterior.catch(() => {}).then(() => {
    if (pedidoPorAtor.get(ator.id) !== pedido) return; // substituído por um envio mais novo
    return transferirPersonagem(ator, destino, origemId);
  });
  filaPorAtor.set(ator.id, vez);
  vez.catch(() => {}).finally(() => {
    if (filaPorAtor.get(ator.id) !== vez) return;
    filaPorAtor.delete(ator.id);
    pedidoPorAtor.delete(ator.id);
  });
  return vez;
}

async function transferirPersonagem(ator, destino, origemId) {
  if (destino.tokens.some(tk => tk.actorId === ator.id)) return;
  // Onde o token está agora: primeiro onde o módulo o deixou por último, depois a origem informada
  let antigo = null;
  for (const id of new Set([ondeLevei.get(ator.id), origemId])) {
    const cena = id && id !== destino.id ? game.scenes.get(id) : null;
    antigo = cena?.tokens.find(tk => tk.actorId === ator.id) ?? null;
    if (antigo) break;
  }
  if (antigo) {
    const novo = await moverTokenPara(antigo, destino);
    ondeLevei.set(ator.id, destino.id);
    return novo;
  }

  const proto = ator.prototypeToken;
  const dados = vagaLivre(destino, null, { width: proto?.width ?? 1, height: proto?.height ?? 1, nome: proto?.name || ator.name });
  const novo = await ator.getTokenDocument(dados, { parent: destino });
  await destino.createEmbeddedDocuments("Token", [novo.toObject()]);
  ondeLevei.set(ator.id, destino.id);
}

// Deixa a animação do movimento terminar antes de sumir com o token
export async function esperarAnimacao(tokenDoc) {
  try {
    const nome = tokenDoc?.object?.animationName;
    if (nome) await foundry.canvas.animation.CanvasAnimation.getAnimation(nome)?.promise;
  } catch (err) { console.warn(`${ID} | não consegui esperar a animação do token`, err); }
}

// Levar um token (e os jogadores donos dele) para outro mapa — usado pela API (ex.: Objetos Vivos)
const emPortal = new Set();
export function pedirPortal(dados) {
  if (emPortal.has(dados.tokenUuid)) return;
  emPortal.add(dados.tokenUuid);
  setTimeout(() => emPortal.delete(dados.tokenUuid), TRAVA_PEDIDO_PORTAL_MS);
  if (souMestreAtivo()) return executarPortal(dados);
  if (!game.users.activeGM) return ui.notifications.warn(t("Portal.SemMestre"));
  emitir({ acao: "portal", ...dados });
}

const portaisEmCurso = new Set();
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
    if (!err?.avisado) ui.notifications.error(t("Portal.Erro"));
  } finally {
    setTimeout(() => portaisEmCurso.delete(tokenUuid), FOLGA_PORTAL_MS);
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

let marcador = null;
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
    // Área de chegada: cada casa no formato da grade (quadrado ou hexágono); a da bandeira mais forte.
    // Sem grade, quadrados do tamanho configurado.
    for (const { o, raio } of casasDaArea(canvas.scene)) {
      const vertices = grid.isGridless ? [] : grid.getVertices(o);
      g.lineStyle(raio ? 2 : 3, 0xff8c1a, raio ? 0.6 : 0.9).beginFill(0xff8c1a, raio ? 0.08 : 0.15);
      if (vertices.length) g.drawPolygon(vertices.flatMap(v => [v.x, v.y]));
      else g.drawRect(o.j * gs, o.i * gs, gs, gs);
      g.endFill();
    }
    // bandeirinha, no canto da casa da bandeira
    g.lineStyle(3, 0xffffff, 0.95).moveTo(p.x + gs * 0.35, p.y + gs * 0.8).lineTo(p.x + gs * 0.35, p.y + gs * 0.2);
    g.lineStyle(0).beginFill(0xff8c1a, 1)
      .drawPolygon([p.x + gs * 0.35, p.y + gs * 0.2, p.x + gs * 0.72, p.y + gs * 0.32, p.x + gs * 0.35, p.y + gs * 0.45]).endFill();
    g.eventMode = "none";
    canvas.controls.addChild(g);
    marcador = g;
  } catch (err) { console.warn(`${ID} | não consegui desenhar o ponto de chegada`, err); }
}

// "Ativar mapa" leva a mesa toda, inclusive quem está offline: o Foundry já puxa quem está
// conectado, e aqui apagamos o "último mapa" dos offline para eles entrarem no mapa ativo.
// (Enviar pelo Navegador continua valendo para cada jogador: só "ativar" passa por cima.)
export async function limparFixasOffline() {
  const offline = game.users.filter(u => !u.isGM && !u.active && u.getFlag(ID, "cena"));
  await Promise.all(offline.map(u => u.unsetFlag(ID, "cena").catch(console.error)));
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
