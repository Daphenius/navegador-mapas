// Navegador de Mundos — Gatilhos
// QUANDO algo acontece (token entra/sai, clique, porta, luz, turno, combate), SE quem
// disparou passa no filtro, FAZ uma lista de ações.
// Um gatilho pode morar em qualquer coisa do mapa, menos tokens:
//   portas (paredes), tiles, luzes, sons, notas, desenhos e regiões (comportamento).
// Nos objetos fica nas flags; na região é um comportamento "Gatilho".
// Quem executa é sempre o mestre ativo (tem permissão para tudo); efeitos que
// precisam aparecer na tela de alguém (som, imagem, diário, câmera) vão por socket.

import { ID, SOCKET, t, esc, emitir, comparar, souMestreAtivo, esperarAnimacao, executarPortal, centroDaRegiao } from "./navegador.js";

const TIPO = `${ID}.gatilho`;
const PARA = ["disparou", "mapa", "todos", "mestre"];
const CENA = ["combateInicio", "combateFim"];
const AREA = ["entrar", "sair", "clique", "turnoInicio", "turnoFim"];

// O que pode disparar o gatilho em cada tipo de objeto
const EVENTOS = {
  RegionBehavior: [...AREA, "portaAbre", "portaFecha", "portaTranca", ...CENA],
  Wall:           ["portaAbre", "portaFecha", "portaTranca", ...CENA],
  Tile:           [...AREA, "mostrar", "esconder", ...CENA],
  Drawing:        [...AREA, ...CENA],
  AmbientLight:   [...AREA, "ligar", "desligar", ...CENA],
  AmbientSound:   [...AREA, "ligar", "desligar", ...CENA],
  Note:           ["clique", ...CENA]
};
const CONFIGS = { Wall: "WallConfig", Tile: "TileConfig", Drawing: "DrawingConfig", AmbientLight: "AmbientLightConfig", AmbientSound: "AmbientSoundConfig", Note: "NoteConfig" };
const COLECOES = { Wall: "walls", Tile: "tiles", Drawing: "drawings", AmbientLight: "lights", AmbientSound: "sounds", Note: "notes" };

// Ações: campos de cada uma (tipo do campo e valor inicial)
const ACOES = {
  mover:        { icone: "fa-door-open",       campos: { destino: ["cena", ""], regiao: ["regiaoDestino", ""], quem: ["opcao", "token", ["token", "jogadores"]] } },
  som:          { icone: "fa-volume-high",     campos: { arquivo: ["audio", ""], volume: ["faixa", 0.8], para: ["para", "mapa"] } },
  musica:       { icone: "fa-music",           campos: { playlist: ["playlist", ""], modo: ["opcao", "tocar", ["tocar", "parar", "pararTodas"]] } },
  chat:         { icone: "fa-comment",         campos: { texto: ["textoLongo", ""], como: ["opcao", "narrador", ["narrador", "sussurro", "soMestre"]] } },
  diario:       { icone: "fa-book-open",       campos: { diario: ["diario", ""], para: ["para", "disparou"] } },
  imagem:       { icone: "fa-image",           campos: { arquivo: ["imagem", ""], titulo: ["texto", ""], para: ["para", "disparou"] } },
  camera:       { icone: "fa-video",           campos: { regiao: ["regiaoAqui", ""], zoom: ["numero", 0], para: ["para", "disparou"] } },
  portas:       { icone: "fa-door-closed",     campos: { portas: ["portas", []], estado: ["opcao", "abrir", ["abrir", "fechar", "trancar", "destrancar", "alternar"]] } },
  visibilidade: { icone: "fa-eye-low-vision",  campos: { alvos: ["selecao", []], estado: ["opcao", "mostrar", ["mostrar", "esconder", "alternar"]] } },
  escuridao:    { icone: "fa-moon",            campos: { valor: ["faixa", 1], duracao: ["numero", 2] } },
  gatilho:      { icone: "fa-bolt",            campos: { alvos: ["gatilhos", []], estado: ["opcao", "executar", ["executar", "ativar", "desativar", "alternar"]] } },
  esperar:      { icone: "fa-hourglass-half",  campos: { segundos: ["numero", 1] } }
};

const padrao = tipoDoc => ({
  quando: [tipoDoc === "Wall" ? "portaAbre" : tipoDoc === "Note" ? "clique" : "entrar"],
  quem: "todos", ator: "", distancia: 1, portas: [], usos: 0, usados: 0, confirmar: false, acoes: []
});
const cfgDe = doc => ({ ...padrao(doc?.documentName), ...foundry.utils.deepClone(doc?.getFlag(ID, "gatilho") ?? {}) });
const novaAcao = tipo => ({ tipo, ...Object.fromEntries(Object.entries(ACOES[tipo].campos).map(([k, [, v]]) => [k, foundry.utils.deepClone(v)])) });

const ehRegiao = doc => doc?.documentName === "RegionBehavior";
const ehGatilho = doc => ehRegiao(doc) ? doc.type === TIPO : !!doc && doc.documentName in EVENTOS && !!doc.getFlag(ID, "gatilho");
const nomeTipo = doc => t(`Gat.Doc.${doc.documentName}`);

// Dados comuns a qualquer gatilho, more ele onde morar
function infoDe(doc) {
  if (ehRegiao(doc)) return { cena: doc.parent?.parent ?? null, regiao: doc.parent ?? null, ativo: !doc.disabled, nome: doc.name };
  const c = doc.getFlag(ID, "gatilho") ?? {};
  return { cena: doc.parent ?? null, regiao: null, ativo: c.ativo !== false, nome: c.nome || nomeTipo(doc) };
}
const rotulo = doc => ehRegiao(doc) ? `${doc.parent?.name} › ${doc.name}` : `${nomeTipo(doc)} › ${infoDe(doc).nome}`;

function gatilhosDe(cena) {
  const lista = [];
  if (!cena) return lista;
  for (const r of cena.regions ?? []) for (const b of r.behaviors ?? []) if (b.type === TIPO) lista.push(b);
  for (const col of Object.values(COLECOES)) for (const d of cena[col] ?? []) if (d.getFlag(ID, "gatilho")) lista.push(d);
  return lista;
}

// Geometria: área de cada objeto
const pxPorUnidade = cena => cena.dimensions.size / (cena.dimensions.distance || cena.grid?.distance || 5);
function girar(p, cx, cy, graus) {
  const r = -(graus ?? 0) * Math.PI / 180;
  if (!r) return p;
  const dx = p.x - cx, dy = p.y - cy;
  return { x: cx + dx * Math.cos(r) - dy * Math.sin(r), y: cy + dx * Math.sin(r) + dy * Math.cos(r) };
}
function dentroPoligono(pts, p) {
  let d = false;
  for (let i = 0, j = pts.length - 2; i < pts.length; j = i, i += 2) {
    const [xi, yi, xj, yj] = [pts[i], pts[i + 1], pts[j], pts[j + 1]];
    if ((yi > p.y) !== (yj > p.y) && p.x < (xj - xi) * (p.y - yi) / (yj - yi) + xi) d = !d;
  }
  return d;
}

// Ponto dentro de uma região (pelos formatos dela; buracos contam como fora)
function pontoNaRegiao(regiao, p) {
  const dentro = s => {
    if (s.type === "rectangle") {
      const q = girar(p, s.x + s.width / 2, s.y + s.height / 2, s.rotation);
      return q.x >= s.x && q.x <= s.x + s.width && q.y >= s.y && q.y <= s.y + s.height;
    }
    if (s.type === "circle") return Math.hypot(p.x - s.x, p.y - s.y) <= s.radius;
    if (s.type === "ellipse") {
      const q = girar(p, s.x, s.y, s.rotation);
      return ((q.x - s.x) / s.radiusX) ** 2 + ((q.y - s.y) / s.radiusY) ** 2 <= 1;
    }
    if (s.type === "polygon") return dentroPoligono(s.points ?? [], p);
    return false;
  };
  const formas = regiao?.shapes ?? [];
  if (formas.some(s => s.hole && dentro(s))) return false;
  return formas.some(s => !s.hole && dentro(s));
}

function naArea(doc, p) {
  switch (doc.documentName) {
    case "RegionBehavior": return pontoNaRegiao(doc.parent, p);
    case "Tile": {
      const q = girar(p, doc.x + doc.width / 2, doc.y + doc.height / 2, doc.rotation);
      return q.x >= doc.x && q.x <= doc.x + doc.width && q.y >= doc.y && q.y <= doc.y + doc.height;
    }
    case "Drawing": {
      const s = doc.shape ?? {};
      const q = girar(p, doc.x + (s.width ?? 0) / 2, doc.y + (s.height ?? 0) / 2, doc.rotation);
      const lx = q.x - doc.x, ly = q.y - doc.y;
      if (s.type === "e") return ((lx - s.width / 2) / (s.width / 2)) ** 2 + ((ly - s.height / 2) / (s.height / 2)) ** 2 <= 1;
      if (s.type === "p" || s.type === "f") return dentroPoligono(s.points ?? [], { x: lx, y: ly });
      return lx >= 0 && lx <= s.width && ly >= 0 && ly <= s.height;
    }
    case "AmbientLight": {
      const raio = Math.max(doc.config?.dim ?? 0, doc.config?.bright ?? 0) * pxPorUnidade(doc.parent);
      return Math.hypot(p.x - doc.x, p.y - doc.y) <= raio;
    }
    case "AmbientSound": return Math.hypot(p.x - doc.x, p.y - doc.y) <= (doc.radius ?? 0) * pxPorUnidade(doc.parent);
    default: return false;
  }
}

async function centroDe(doc) {
  switch (doc?.documentName) {
    case "RegionBehavior": return centroDaRegiao(doc.parent?.uuid);
    case "Wall": return { x: (doc.c[0] + doc.c[2]) / 2, y: (doc.c[1] + doc.c[3]) / 2 };
    case "Tile": return { x: doc.x + doc.width / 2, y: doc.y + doc.height / 2 };
    case "Drawing": return { x: doc.x + (doc.shape?.width ?? 0) / 2, y: doc.y + (doc.shape?.height ?? 0) / 2 };
    default: return doc ? { x: doc.x, y: doc.y } : null;
  }
}

const centroToken = (tk, x = tk.x, y = tk.y) => {
  const gs = tk.parent.dimensions.size;
  return { x: x + (tk.width ?? 1) * gs / 2, y: y + (tk.height ?? 1) * gs / 2 };
};

// Quem recebe um efeito na tela
function alvos(para, ctx) {
  const ativos = game.users.filter(u => u.active);
  if (para === "todos") return ativos.map(u => u.id);
  if (para === "mestre") return ativos.filter(u => u.isGM).map(u => u.id);
  if (para === "mapa") return ativos.filter(u => u.viewedScene === ctx.cena.id).map(u => u.id);
  // "disparou": donos do token (jogadores) ou quem fez a ação
  const ids = new Set();
  const ator = ctx.token?.actor;
  if (ator) for (const u of ativos) if (!u.isGM && ator.testUserPermission(u, "OWNER")) ids.add(u.id);
  if (!ids.size && ctx.userId && game.users.get(ctx.userId)?.active) ids.add(ctx.userId);
  return [...ids];
}

// Token do personagem de quem fez a ação (ex.: quem abriu a porta)
function tokenDoUsuario(userId, cena) {
  const u = game.users.get(userId);
  if (!u || u.isGM || !u.character || !cena) return null;
  return cena.tokens.find(tk => tk.actorId === u.character.id) ?? null;
}

// Efeitos na tela de quem precisa ver/ouvir
function efeito(ids, dados) {
  if (!ids.length) return;
  if (ids.includes(game.user.id)) aplicarEfeito(dados);
  const outros = ids.filter(id => id !== game.user.id);
  if (outros.length) emitir({ acao: "efeito", userIds: outros, efeito: dados });
}

async function aplicarEfeito(e) {
  try {
    if (e.tipo === "som") await foundry.audio.AudioHelper.play({ src: e.src, volume: e.volume ?? 0.8, loop: false, channel: "environment" }, false);
    else if (e.tipo === "imagem") {
      const IP = foundry.applications.apps?.ImagePopout ?? globalThis.ImagePopout;
      new IP({ src: e.src, window: { title: e.titulo || "" } }).render({ force: true });
    } else if (e.tipo === "diario") (await fromUuid(e.uuid))?.sheet?.render(true);
    else if (e.tipo === "camera" && canvas.scene?.id === e.cena) {
      canvas.animatePan({ x: e.x, y: e.y, scale: e.zoom || undefined, duration: 900 });
    }
  } catch (err) { console.warn(`${ID} | efeito do gatilho falhou`, err); }
}

// Texto do chat: {token}, {jogador}, {mapa}
const preencher = (texto, ctx) => String(texto ?? "")
  .replaceAll("{token}", ctx.token?.name ?? "")
  .replaceAll("{jogador}", game.users.get(ctx.userId)?.name ?? "")
  .replaceAll("{mapa}", ctx.cena.navName || ctx.cena.name);

// O que cada ação faz (roda no mestre ativo)
const EXECUTAR = {
  async mover(a, ctx) {
    const destino = game.scenes.get(a.destino);
    if (!destino) return;
    const tokens = a.quem === "jogadores"
      ? ctx.cena.tokens.filter(tk => tk.actor?.hasPlayerOwner)
      : [ctx.token].filter(Boolean);
    for (const tk of tokens) {
      await esperarAnimacao(tk);
      await executarPortal({ tokenUuid: tk.uuid, sceneId: destino.id, regiaoUuid: a.regiao || null, confirmar: false });
    }
  },
  async som(a, ctx) {
    if (a.arquivo) efeito(alvos(a.para, ctx), { tipo: "som", src: a.arquivo, volume: Number(a.volume) || 0.8 });
  },
  async musica(a) {
    if (a.modo === "pararTodas") { for (const p of game.playlists.playing ?? []) await p.stopAll(); return; }
    const pl = game.playlists.get(a.playlist);
    if (!pl) return;
    if (a.modo === "parar") await pl.stopAll();
    else if (!pl.playing) await pl.playAll();
  },
  async chat(a, ctx) {
    if (!a.texto?.trim()) return;
    const whisper = a.como === "sussurro" ? alvos("disparou", ctx) : a.como === "soMestre" ? game.users.filter(u => u.isGM).map(u => u.id) : [];
    await CONFIG.ChatMessage.documentClass.create({
      content: `<div class="nm-narracao">${preencher(a.texto, ctx)}</div>`,
      speaker: { alias: t("Gat.Narrador") },
      whisper
    });
  },
  async diario(a, ctx) {
    const doc = a.diario ? await fromUuid(a.diario) : null;
    if (!doc) return;
    const ids = alvos(a.para, ctx);
    // Dá permissão de observador a quem vai ver, se ainda não tiver
    const entrada = doc.parent ?? doc; // página → diário
    const NIVEL = CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
    const dar = {};
    for (const id of ids) { const u = game.users.get(id); if (u && !u.isGM && !entrada.testUserPermission(u, NIVEL)) dar[id] = NIVEL; }
    if (Object.keys(dar).length) await entrada.update({ ownership: dar });
    efeito(ids, { tipo: "diario", uuid: doc.uuid });
  },
  async imagem(a, ctx) {
    if (a.arquivo) efeito(alvos(a.para, ctx), { tipo: "imagem", src: a.arquivo, titulo: a.titulo });
  },
  async camera(a, ctx) {
    const c = a.regiao ? await centroDaRegiao(a.regiao) : await centroDe(ctx.fonte);
    if (c) efeito(alvos(a.para, ctx), { tipo: "camera", cena: ctx.cena.id, x: c.x, y: c.y, zoom: Number(a.zoom) || 0 });
  },
  async portas(a, ctx) {
    const S = CONST.WALL_DOOR_STATES;
    const mud = (a.portas ?? []).map(id => ctx.cena.walls.get(id)).filter(Boolean).map(w => {
      const ds = { abrir: S.OPEN, fechar: S.CLOSED, trancar: S.LOCKED, destrancar: S.CLOSED }[a.estado]
        ?? (w.ds === S.OPEN ? S.CLOSED : S.OPEN);
      return { _id: w.id, ds };
    });
    // nmGatilho: mudança feita por um gatilho não dispara outros gatilhos (evita loop)
    if (mud.length) await ctx.cena.updateEmbeddedDocuments("Wall", mud, { nmGatilho: true });
  },
  async visibilidade(a) {
    for (const uuid of a.alvos ?? []) {
      const doc = await fromUuid(uuid);
      if (!doc || !("hidden" in doc)) continue;
      const hidden = a.estado === "mostrar" ? false : a.estado === "esconder" ? true : !doc.hidden;
      if (doc.hidden !== hidden) await doc.update({ hidden }, { nmGatilho: true });
    }
  },
  async escuridao(a, ctx) {
    const valor = Math.min(1, Math.max(0, Number(a.valor) || 0));
    await ctx.cena.update({ "environment.darknessLevel": valor }, { animateDarkness: Math.max(0, Number(a.duracao) || 0) * 1000 });
  },
  async gatilho(a, ctx) {
    for (const uuid of a.alvos ?? []) {
      const alvo = await fromUuid(uuid);
      if (!ehGatilho(alvo)) continue;
      if (a.estado === "executar") {
        await executarGatilho(alvo, { evento: "outro", tokenUuid: ctx.token?.uuid, userId: ctx.userId, forcar: true, profundidade: ctx.profundidade + 1 });
        continue;
      }
      const ativo = a.estado === "ativar" ? true : a.estado === "desativar" ? false : !infoDe(alvo).ativo;
      if (ehRegiao(alvo)) await alvo.update({ disabled: !ativo });
      else await alvo.setFlag(ID, "gatilho.ativo", ativo);
    }
  },
  async esperar(a) {
    await new Promise(r => setTimeout(r, Math.max(0, Number(a.segundos) || 0) * 1000));
  }
};

function passaFiltro(c, token, userId) {
  if (c.quem === "todos") return true;
  const doJogador = token ? !!token.actor?.hasPlayerOwner : !game.users.get(userId)?.isGM;
  if (c.quem === "jogadores") return doJogador;
  if (c.quem === "npcs") return !!token && !doJogador;
  if (c.quem === "ator") return !!token && !!c.ator && (token.actor?.uuid === c.ator || `Actor.${token.actorId}` === c.ator);
  return true;
}

// Executa um gatilho (só no mestre)
const recentes = new Map();
async function executarGatilho(doc, { evento, tokenUuid = null, userId = null, forcar = false, profundidade = 0 }) {
  if (!game.user.isGM || !ehGatilho(doc) || profundidade > 5) return;
  const c = cfgDe(doc);
  const info = infoDe(doc);
  if (!forcar && (!info.ativo || !c.quando.includes(evento))) return;
  if (!info.cena) return;
  // Sem token (porta, nota, luz...): vale o personagem de quem fez a ação
  const token = (tokenUuid ? await fromUuid(tokenUuid) : null) ?? tokenDoUsuario(userId, info.cena);
  if (!forcar && !passaFiltro(c, token, userId)) return;

  // O mesmo evento chegando duas vezes seguidas conta uma só
  const chave = `${doc.uuid}|${evento}|${token?.uuid}`;
  if (Date.now() - (recentes.get(chave) ?? 0) < 1500) return;
  recentes.set(chave, Date.now());

  if (!forcar && c.usos > 0 && (c.usados ?? 0) >= c.usos) return;
  if (c.confirmar && !forcar) {
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: t("Gat.Confirmar") },
      content: `<p>${t("Gat.Pergunta", { gatilho: esc(info.nome), quem: esc(token?.name ?? game.users.get(userId)?.name ?? "—") })}</p>`,
      rejectClose: false
    });
    if (!ok) return;
  }
  if (c.usos > 0) await doc.setFlag(ID, "gatilho.usados", (c.usados ?? 0) + 1);

  const ctx = { evento, token, userId, cena: info.cena, regiao: info.regiao, fonte: doc, profundidade };
  for (const a of c.acoes ?? []) {
    try { await EXECUTAR[a.tipo]?.(a, ctx); }
    catch (err) { console.error(`${ID} | ação "${a.tipo}" do gatilho "${info.nome}" falhou`, err); ui.notifications.error(t("Gat.ErroAcao", { gatilho: info.nome, acao: t(`Gat.Acao.${a.tipo}`) })); }
  }
}

// Leva o evento até o mestre ativo
function despachar(doc, evento, tokenUuid = null, userId = game.user.id) {
  if (souMestreAtivo()) return executarGatilho(doc, { evento, tokenUuid, userId });
  if (!game.users.activeGM) return;
  emitir({ acao: "gatilho", uuid: doc.uuid, evento, tokenUuid, userId });
}

function dispararNoMapa(cena, evento, dados = {}, filtro = () => true) {
  for (const doc of gatilhosDe(cena)) if (filtro(doc)) executarGatilho(doc, { evento, ...dados });
}

// Comportamento de Região (as regiões avisam sozinhas quando um token entra/sai)
function registrarComportamento() {
  const Base = foundry.data?.regionBehaviors?.RegionBehaviorType;
  const EV = CONST.REGION_EVENTS ?? {};
  if (!Base) return false;
  const pares = [[EV.TOKEN_MOVE_IN ?? EV.TOKEN_ENTER, "entrar"], [EV.TOKEN_MOVE_OUT ?? EV.TOKEN_EXIT, "sair"],
    [EV.TOKEN_TURN_START, "turnoInicio"], [EV.TOKEN_TURN_END, "turnoFim"]].filter(([k]) => k);

  class GatilhoNavegador extends Base {
    static defineSchema() { return {}; }
    static events = Object.fromEntries(pares.map(([ev, nome]) => [ev, async function (event) {
      if (!event.user?.isSelf) return;
      if (!cfgDe(this.parent).quando.includes(nome)) return;
      despachar(this.parent, nome, event.data?.token?.uuid ?? null, event.user.id);
    }]));
  }
  CONFIG.RegionBehavior.dataModels[TIPO] = GatilhoNavegador;
  CONFIG.RegionBehavior.typeIcons[TIPO] = "fa-solid fa-bolt";
  if (CONFIG.RegionBehavior.typeLabels) CONFIG.RegionBehavior.typeLabels[TIPO] = "NM.Gat.Nome";
  return true;
}

// Tokens entrando/saindo da área de tiles, desenhos, luzes e sons (as regiões já avisam sozinhas)
const posicoes = new Map(); // tokenUuid -> { x, y } (último centro conhecido)
function lembrarPosicoes(cena) {
  for (const tk of cena?.tokens ?? []) posicoes.set(tk.uuid, centroToken(tk));
}

function aoMoverToken(tk, mud) {
  if (!("x" in mud || "y" in mud)) return;
  const antes = posicoes.get(tk.uuid);
  const agora = centroToken(tk);
  posicoes.set(tk.uuid, agora);
  if (!antes || !souMestreAtivo()) return;
  for (const doc of gatilhosDe(tk.parent)) {
    if (ehRegiao(doc)) continue;
    const q = cfgDe(doc).quando;
    if (!q.includes("entrar") && !q.includes("sair")) continue;
    const a = naArea(doc, antes), b = naArea(doc, agora);
    if (!a && b) executarGatilho(doc, { evento: "entrar", tokenUuid: tk.uuid });
    else if (a && !b) executarGatilho(doc, { evento: "sair", tokenUuid: tk.uuid });
  }
}

// Turnos: o token da vez está dentro da área de algum objeto?
const vezAnterior = new Map(); // combatId -> tokenUuid
async function aoMudarTurno(combate, mud) {
  if (!("turn" in mud || "round" in mud) || !souMestreAtivo()) return;
  const cena = combate.scene;
  const anterior = vezAnterior.get(combate.id);
  const atual = combate.combatant?.token ?? null;
  vezAnterior.set(combate.id, atual?.uuid ?? null);
  const naVez = (tk, evento) => {
    if (!tk) return;
    const p = centroToken(tk);
    dispararNoMapa(cena, evento, { tokenUuid: tk.uuid }, doc => !ehRegiao(doc) && naArea(doc, p));
  };
  if (anterior && anterior !== atual?.uuid) naVez(await fromUuid(anterior), "turnoFim");
  naVez(atual, "turnoInicio");
}

// Clique: o jogador clica no mapa (o mestre dispara com Alt+clique)
function ligarCliques() {
  const view = canvas.app?.view ?? canvas.app?.canvas;
  if (!view || view._nmCliques) return;
  view._nmCliques = true;
  let ini = null;
  view.addEventListener("pointerdown", ev => { ini = ev.button === 0 ? { x: ev.clientX, y: ev.clientY, t: Date.now() } : null; });
  view.addEventListener("pointerup", ev => {
    const i = ini;
    ini = null;
    if (!i || ev.button !== 0 || Math.hypot(ev.clientX - i.x, ev.clientY - i.y) > 6 || Date.now() - i.t > 500) return;
    if (document.body.classList.contains("nm-escolhendo") || (game.user.isGM && !ev.altKey)) return;
    cliqueNoMapa(ev.clientX, ev.clientY);
  });
}

function cliqueNoMapa(cx, cy) {
  const lista = gatilhosDe(canvas.scene).filter(d => d.documentName !== "Note" && infoDe(d).ativo && cfgDe(d).quando.includes("clique")
    && !(d.documentName === "Tile" && d.hidden)); // tile escondido não é clicável
  if (!lista.length) return;
  const p = canvas.canvasCoordinatesFromClient?.({ x: cx, y: cy }) ?? canvas.stage.worldTransform.applyInverse({ x: cx, y: cy });
  const gs = canvas.dimensions.size;
  // Token do jogador mais perto do clique
  const meus = canvas.tokens.placeables.filter(tk => tk.isOwner && (game.user.isGM ? tk.controlled : true));
  let perto = null, dist = Infinity;
  for (const tk of meus) { const d = Math.hypot(tk.center.x - p.x, tk.center.y - p.y) / gs; if (d < dist) { dist = d; perto = tk; } }
  for (const doc of lista) {
    if (!naArea(doc, p)) continue;
    const c = cfgDe(doc);
    if (!game.user.isGM && c.distancia > 0 && dist > c.distancia + 0.5) { ui.notifications.info(t("Gat.Longe")); continue; }
    despachar(doc, "clique", perto?.document.uuid ?? null);
  }
}

// Editor do gatilho
const CSS = `
.nm-editor-gatilho .window-content { padding: 0; }
.nm-gat { display: flex; flex-direction: column; gap: 10px; padding: 10px; }
.nm-gat section { border: 1px solid rgba(128,128,128,.3); border-radius: 8px; padding: 8px 10px; }
.nm-gat h4 { margin: 0 0 8px; font-size: 12px; text-transform: uppercase; opacity: .75; border: none; display: flex; align-items: center; gap: 6px; }
.nm-gat .origem { font-size: 12px; opacity: .8; display: flex; align-items: center; gap: 6px; }
.nm-gat .linha { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; flex-wrap: wrap; }
.nm-gat .linha > label:first-child { flex: 0 0 130px; font-weight: bold; font-size: 12px; }
.nm-gat .linha input[type=text], .nm-gat .linha select, .nm-gat .linha textarea { flex: 1; min-width: 120px; }
.nm-gat .linha input[type=number] { width: 70px; flex: none; }
.nm-gat .marcas { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 4px 10px; }
.nm-gat .marcas label { display: flex; align-items: center; gap: 6px; font-size: 12px; }
.nm-gat .sub { margin: 6px 0 0 4px; padding-left: 10px; border-left: 2px solid #ff8c1a55; }
.nm-gat .dica { font-size: 11px; opacity: .65; margin: 2px 0 0; }
.nm-gat .peq { width: auto; flex: none; height: 24px; min-height: 0; padding: 0 8px; line-height: 22px; font-size: 12px; }
.nm-gat .acao { border: 1px solid rgba(128,128,128,.35); border-radius: 6px; margin-bottom: 8px; background: rgba(0,0,0,.12); }
.nm-gat .acao-cab { display: flex; align-items: center; gap: 6px; padding: 4px 6px; background: rgba(255,140,26,.15); border-radius: 6px 6px 0 0; }
.nm-gat .acao-cab strong { flex: 1; }
.nm-gat .acao-cab .num { opacity: .5; font-size: 11px; }
.nm-gat .acao-corpo { padding: 6px 8px 2px; }
.nm-gat .icone-btn { width: 24px; height: 22px; min-height: 0; padding: 0; line-height: 20px; flex: none; }
.nm-gat .lista-gat label { display: flex; gap: 6px; align-items: center; font-size: 12px; }
.nm-gat .contagem { font-size: 12px; opacity: .8; }
.nm-gat textarea { min-height: 54px; resize: vertical; }
.nm-gat [data-drop] { border-style: dashed; }
.nm-gat footer { display: flex; gap: 8px; }
.nm-gat footer button { flex: 1; }
.nm-narracao { font-style: italic; }
fieldset.nm-gat-secao { border: 1px solid #ff8c1a88; border-radius: 6px; margin: 8px 0; padding: 6px 10px; }
fieldset.nm-gat-secao legend { padding: 0 6px; font-weight: bold; }
fieldset.nm-gat-secao .resumo { font-size: 12px; opacity: .85; margin: 0 0 6px; }
fieldset.nm-gat-secao .botoes { display: flex; gap: 6px; }
fieldset.nm-gat-secao .botoes button { flex: 1; }
`;
function injetarEstilo() {
  if (document.getElementById("nm-estilo-gatilho")) return;
  const st = document.createElement("style");
  st.id = "nm-estilo-gatilho";
  st.textContent = CSS;
  document.head.appendChild(st);
}

function opcoes(lista, atual, rotuloDe = v => v) {
  return lista.map(v => `<option value="${esc(v)}" ${v === atual ? "selected" : ""}>${esc(rotuloDe(v))}</option>`).join("");
}

function nomeDoc(uuid) {
  try { const d = fromUuidSync(uuid); return d?.name || d?.text || (d ? t(`Gat.Doc.${d.documentName}`) : uuid); } catch { return uuid; }
}

function criarEditor() {
  const Base = foundry.applications.api.DocumentSheetV2;

  return class EditorGatilho extends Base {
    static DEFAULT_OPTIONS = {
      classes: ["navegador-mapas", "nm-editor-gatilho"],
      position: { width: 640, height: 760 },
      window: { icon: "fa-solid fa-bolt", resizable: true },
      form: { handler: EditorGatilho._salvar, submitOnChange: false, closeOnSubmit: true }
    };

    get title() { return t("Gat.Titulo", { nome: infoDe(this.document).nome }); }
    get tipoDoc() { return this.document.documentName; }
    get cena() { return infoDe(this.document).cena; }

    _estado() {
      if (!this.dados) {
        const info = infoDe(this.document);
        this.dados = { ...cfgDe(this.document), nome: info.nome, ativo: info.ativo };
      }
      return this.dados;
    }

    async _renderHTML() {
      const d = this._estado();
      const eventos = EVENTOS[this.tipoDoc] ?? [];
      const tem = q => d.quando.includes(q);
      const div = document.createElement("div");
      div.className = "nm-gat";
      div.innerHTML = `
        <section>
          <p class="origem"><i class="fa-solid fa-location-dot"></i> ${t("Gat.Origem", { tipo: esc(t(`Gat.Doc.${this.tipoDoc}`)), mapa: esc(this.cena?.name ?? "—") })}</p>
          <div class="linha"><label>${t("Gat.Campo.Nome")}</label><input type="text" data-geral="nome" value="${esc(d.nome)}"></div>
          <div class="linha"><label>${t("Gat.Campo.Ativo")}</label><input type="checkbox" data-geral="ativo" ${d.ativo ? "checked" : ""}></div>
          <div class="linha"><label>${t("Gat.Campo.Usos")}</label><input type="number" min="0" step="1" data-geral="usos" value="${d.usos}">
            <span class="contagem">${t("Gat.Usados", { n: d.usados ?? 0 })}</span>
            ${d.usados ? `<button type="button" class="peq" data-a="zerar"><i class="fa-solid fa-rotate-left"></i> ${t("Gat.Zerar")}</button>` : ""}</div>
          <p class="dica">${t("Gat.UsosDica")}</p>
          <div class="linha"><label>${t("Gat.Campo.Confirmar")}</label><input type="checkbox" data-geral="confirmar" ${d.confirmar ? "checked" : ""}></div>
        </section>

        <section>
          <h4><i class="fa-solid fa-bolt"></i> ${t("Gat.Quando")}</h4>
          <div class="marcas">${eventos.map(q => `<label><input type="checkbox" data-quando="${q}" ${tem(q) ? "checked" : ""}> ${t(`Gat.Evento.${q}`)}</label>`).join("")}</div>
          ${this.tipoDoc === "Wall" && !(this.document.door > 0) ? `<p class="dica">⚠ ${t("Gat.NaoEPorta")}</p>` : ""}
          ${tem("entrar") || tem("sair") ? `<p class="dica">${t(ehRegiao(this.document) ? "Gat.AreaRegiao" : `Gat.Area.${this.tipoDoc}`)}</p>` : ""}
          ${tem("clique") && this.tipoDoc !== "Note" ? `<div class="sub"><div class="linha"><label>${t("Gat.Campo.Distancia")}</label>
              <input type="number" min="0" step="1" data-geral="distancia" value="${d.distancia}"></div>
            <p class="dica">${t("Gat.DistanciaDica")}</p></div>` : ""}
          ${tem("clique") && this.tipoDoc === "Note" ? `<p class="dica">${t("Gat.NotaDica")}</p>` : ""}
          ${ehRegiao(this.document) && (tem("portaAbre") || tem("portaFecha") || tem("portaTranca")) ? `<div class="sub"><div class="linha"><label>${t("Gat.Campo.Portas")}</label>
              <span class="contagem">${d.portas.length ? t("Gat.PortasN", { n: d.portas.length }) : t("Gat.QualquerPorta")}</span>
              <button type="button" class="peq" data-a="portas-add"><i class="fa-solid fa-plus"></i> ${t("Gat.UsarSelecionadas")}</button>
              ${d.portas.length ? `<button type="button" class="peq" data-a="portas-limpar">${t("Gat.Limpar")}</button>` : ""}</div>
            <p class="dica">${t("Gat.PortasDica")}</p></div>` : ""}
          ${tem("turnoInicio") || tem("turnoFim") ? `<p class="dica">${t("Gat.TurnoDica")}</p>` : ""}
        </section>

        <section>
          <h4><i class="fa-solid fa-filter"></i> ${t("Gat.Quem")}</h4>
          <div class="linha"><label>${t("Gat.Campo.Quem")}</label>
            <select data-geral="quem" data-rerender>${opcoes(["todos", "jogadores", "npcs", "ator"], d.quem, v => t(`Gat.Quem_${v}`))}</select></div>
          ${d.quem === "ator" ? `<div class="linha"><label>${t("Gat.Campo.Ator")}</label>
            <input type="text" data-geral="ator" data-drop="Actor" value="${esc(d.ator)}" placeholder="${esc(t("Gat.ArrasteAtor"))}">
            ${d.ator ? `<span class="contagem">${esc(nomeDoc(d.ator))}</span>` : ""}</div>` : ""}
        </section>

        <section>
          <h4><i class="fa-solid fa-list-check"></i> ${t("Gat.Acoes")}</h4>
          ${d.acoes.length ? d.acoes.map((a, i) => this._htmlAcao(a, i)).join("") : `<p class="dica">${t("Gat.SemAcoes")}</p>`}
          <div class="linha"><select data-a="nova"><option value="">${t("Gat.Adicionar")}</option>
            ${Object.keys(ACOES).map(k => `<option value="${k}">${esc(t(`Gat.Acao.${k}`))}</option>`).join("")}</select></div>
        </section>

        <footer><button type="submit"><i class="fa-solid fa-floppy-disk"></i> ${t("Gat.Salvar")}</button></footer>`;
      return div;
    }

    _replaceHTML(result, content) {
      const rolagem = content.scrollTop;
      content.replaceChildren(result);
      content.scrollTop = rolagem;
    }

    _htmlAcao(a, i) {
      const def = ACOES[a.tipo];
      if (!def) return "";
      const linhas = Object.entries(def.campos).map(([campo, [tipo, , escolhas]]) => this._htmlCampo(a, campo, tipo, escolhas)).join("");
      const ultimo = i === this.dados.acoes.length - 1;
      return `<div class="acao" data-i="${i}">
          <div class="acao-cab"><span class="num">${i + 1}</span><i class="fa-solid ${def.icone}"></i>
            <strong>${t(`Gat.Acao.${a.tipo}`)}</strong>
            <button type="button" class="icone-btn" data-a="subir" ${i ? "" : "disabled"}><i class="fa-solid fa-arrow-up"></i></button>
            <button type="button" class="icone-btn" data-a="descer" ${ultimo ? "disabled" : ""}><i class="fa-solid fa-arrow-down"></i></button>
            <button type="button" class="icone-btn" data-a="remover"><i class="fa-solid fa-trash"></i></button></div>
          <div class="acao-corpo">${linhas}<p class="dica">${t(`Gat.AcaoDica.${a.tipo}`)}</p></div>
        </div>`;
    }

    _htmlCampo(a, campo, tipo, escolhas) {
      const v = a[campo];
      const rot = `<label>${t(`Gat.Campo.${campo}`)}</label>`;
      const attr = `data-campo="${campo}"`;
      const cenas = () => game.scenes.contents.slice().sort((x, y) => comparar(x.name, y.name));
      const regioes = cena => (cena?.regions?.contents ?? []).slice().sort((x, y) => comparar(x.name, y.name));
      let campoHtml;
      switch (tipo) {
        case "cena":
          campoHtml = `<select ${attr} data-rerender><option value="">—</option>${cenas().map(s => `<option value="${s.id}" ${s.id === v ? "selected" : ""}>${esc(s.name)}</option>`).join("")}</select>`;
          break;
        case "regiaoDestino":
        case "regiaoAqui": {
          const cena = tipo === "regiaoAqui" ? this.cena : game.scenes.get(a.destino);
          const vazio = t(tipo === "regiaoAqui" ? "Gat.EsteObjeto" : "Gat.PontoChegada");
          campoHtml = `<select ${attr}><option value="">${esc(vazio)}</option>${regioes(cena).map(r => `<option value="${r.uuid}" ${r.uuid === v ? "selected" : ""}>${esc(r.name)}</option>`).join("")}</select>`;
          break;
        }
        case "opcao":
          campoHtml = `<select ${attr}>${opcoes(escolhas, v, x => t(`Gat.Opc.${x}`))}</select>`;
          break;
        case "para":
          campoHtml = `<select ${attr}>${opcoes(PARA, v, x => t(`Gat.Para.${x}`))}</select>`;
          break;
        case "audio":
        case "imagem":
          campoHtml = `<input type="text" ${attr} value="${esc(v)}" placeholder="${esc(t("Gat.Arquivo"))}">
            <button type="button" class="icone-btn" data-a="arquivo" data-tipo="${tipo === "audio" ? "audio" : "image"}" data-campo-alvo="${campo}"><i class="fa-solid fa-file-import"></i></button>
            ${tipo === "audio" ? `<button type="button" class="icone-btn" data-a="ouvir" data-tooltip="${esc(t("Gat.Ouvir"))}"><i class="fa-solid fa-play"></i></button>` : ""}`;
          break;
        case "faixa":
          campoHtml = `<input type="range" min="0" max="1" step="0.05" ${attr} value="${Number(v) || 0}"><span class="contagem">${Math.round((Number(v) || 0) * 100)}%</span>`;
          break;
        case "numero":
          campoHtml = `<input type="number" min="0" step="0.5" ${attr} value="${Number(v) || 0}">`;
          break;
        case "texto":
          campoHtml = `<input type="text" ${attr} value="${esc(v)}">`;
          break;
        case "textoLongo":
          campoHtml = `<textarea ${attr}>${esc(v)}</textarea>`;
          break;
        case "playlist":
          campoHtml = `<select ${attr}><option value="">—</option>${game.playlists.contents.slice().sort((x, y) => comparar(x.name, y.name)).map(p => `<option value="${p.id}" ${p.id === v ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select>`;
          break;
        case "diario": {
          const op = [];
          for (const j of game.journal.contents.slice().sort((x, y) => comparar(x.name, y.name))) {
            op.push(`<option value="${j.uuid}" ${j.uuid === v ? "selected" : ""}>${esc(j.name)}</option>`);
            for (const p of j.pages?.contents ?? []) op.push(`<option value="${p.uuid}" ${p.uuid === v ? "selected" : ""}>&nbsp;&nbsp;↳ ${esc(p.name)}</option>`);
          }
          campoHtml = `<select ${attr}><option value="">—</option>${op.join("")}</select>`;
          break;
        }
        case "portas":
          campoHtml = `<span class="contagem">${t("Gat.PortasN", { n: v.length })}</span>
            <button type="button" class="peq" data-a="portas-add"><i class="fa-solid fa-plus"></i> ${t("Gat.UsarSelecionadas")}</button>
            ${v.length ? `<button type="button" class="peq" data-a="portas-limpar">${t("Gat.Limpar")}</button>` : ""}`;
          break;
        case "selecao":
          campoHtml = `<span class="contagem" data-tooltip="${esc(v.map(nomeDoc).join(", "))}">${t("Gat.ObjetosN", { n: v.length })}</span>
            <button type="button" class="peq" data-a="sel-add"><i class="fa-solid fa-plus"></i> ${t("Gat.UsarSelecionados")}</button>
            ${v.length ? `<button type="button" class="peq" data-a="sel-limpar">${t("Gat.Limpar")}</button>` : ""}`;
          break;
        case "gatilhos": {
          const outros = gatilhosDe(this.cena).filter(g => g.uuid !== this.document.uuid);
          campoHtml = outros.length
            ? `<div class="lista-gat">${outros.map(g => `<label><input type="checkbox" data-gat="${g.uuid}" ${v.includes(g.uuid) ? "checked" : ""}> ${esc(rotulo(g))}</label>`).join("")}</div>`
            : `<span class="dica">${t("Gat.SemOutros")}</span>`;
          break;
        }
        default: campoHtml = "";
      }
      return `<div class="linha">${rot}${campoHtml}</div>`;
    }

    _onFirstRender(context, options) {
      super._onFirstRender?.(context, options);
      injetarEstilo();
      const el = this.element;
      const valor = alvo => alvo.type === "checkbox" ? alvo.checked : alvo.type === "number" || alvo.type === "range" ? Number(alvo.value) : alvo.value;

      const aoMudar = ev => {
        const alvo = ev.target;
        const d = this.dados;
        if (alvo.dataset.geral) {
          d[alvo.dataset.geral] = valor(alvo);
          if (alvo.dataset.rerender !== undefined && ev.type === "change") this.render();
          return;
        }
        if (alvo.dataset.quando && ev.type === "change") {
          const q = alvo.dataset.quando;
          d.quando = alvo.checked ? [...new Set([...d.quando, q])] : d.quando.filter(x => x !== q);
          return this.render();
        }
        const i = alvo.closest("[data-i]")?.dataset.i;
        if (i === undefined) return;
        const a = d.acoes[Number(i)];
        if (alvo.dataset.gat && ev.type === "change") {
          a.alvos = alvo.checked ? [...new Set([...a.alvos, alvo.dataset.gat])] : a.alvos.filter(x => x !== alvo.dataset.gat);
          return;
        }
        if (!alvo.dataset.campo) return;
        a[alvo.dataset.campo] = valor(alvo);
        if (alvo.type === "range") alvo.nextElementSibling.textContent = `${Math.round(Number(alvo.value) * 100)}%`;
        if (alvo.dataset.rerender !== undefined && ev.type === "change") {
          if (alvo.dataset.campo === "destino") a.regiao = "";
          this.render();
        }
      };
      el.addEventListener("input", aoMudar);
      el.addEventListener("change", ev => {
        if (ev.target.dataset.a === "nova") {
          if (ev.target.value) { this.dados.acoes.push(novaAcao(ev.target.value)); this.render(); }
          return;
        }
        aoMudar(ev);
      });

      el.addEventListener("click", ev => {
        const btn = ev.target.closest("button[data-a]");
        if (!btn) return;
        ev.preventDefault();
        this._botao(btn);
      });

      // Arrastar um ator da barra lateral para o campo
      el.addEventListener("dragover", ev => { if (ev.target.dataset?.drop) ev.preventDefault(); });
      el.addEventListener("drop", ev => {
        const campo = ev.target.dataset?.drop ? ev.target : null;
        if (!campo) return;
        ev.preventDefault();
        try {
          const dados = JSON.parse(ev.dataTransfer.getData("text/plain"));
          if (dados.type !== campo.dataset.drop || !dados.uuid) return ui.notifications.warn(t("Gat.SoAtor"));
          this.dados.ator = dados.uuid;
          this.render();
        } catch {}
      });
    }

    _noMapa() {
      if (canvas.scene?.id === this.cena?.id) return true;
      ui.notifications.warn(t("Gat.AbraOMapa", { mapa: this.cena?.name ?? "?" }));
      return false;
    }

    async _botao(btn) {
      const d = this.dados;
      const i = btn.closest("[data-i]")?.dataset.i;
      const a = i !== undefined ? d.acoes[Number(i)] : null;
      const lista = a ?? d; // portas: da ação ou do evento
      switch (btn.dataset.a) {
        case "zerar": d.usados = 0; break;
        case "subir": if (i > 0) [d.acoes[i - 1], d.acoes[i]] = [d.acoes[i], d.acoes[i - 1]]; break;
        case "descer": if (i < d.acoes.length - 1) [d.acoes[+i + 1], d.acoes[i]] = [d.acoes[i], d.acoes[+i + 1]]; break;
        case "remover": d.acoes.splice(Number(i), 1); break;
        case "portas-add": {
          if (!this._noMapa()) return;
          const ids = (canvas.walls?.controlled ?? []).filter(w => w.document.door > 0).map(w => w.document.id);
          if (!ids.length) return ui.notifications.warn(t("Gat.SelecionePortas"));
          lista.portas = [...new Set([...(lista.portas ?? []), ...ids])];
          break;
        }
        case "portas-limpar": lista.portas = []; break;
        case "sel-add": {
          if (!this._noMapa()) return;
          const camadas = [canvas.tiles, canvas.tokens, canvas.lighting, canvas.sounds, canvas.drawings, canvas.notes];
          const uuids = camadas.flatMap(c => c?.controlled ?? []).map(o => o.document.uuid);
          if (!uuids.length) return ui.notifications.warn(t("Gat.SelecioneObjetos"));
          a.alvos = [...new Set([...a.alvos, ...uuids])];
          break;
        }
        case "sel-limpar": a.alvos = []; break;
        case "arquivo": {
          const FP = foundry.applications.apps?.FilePicker?.implementation ?? globalThis.FilePicker;
          const campo = btn.dataset.campoAlvo;
          new FP({ type: btn.dataset.tipo, current: a[campo] || "", callback: caminho => { a[campo] = caminho; this.render(); } }).render(true);
          return;
        }
        case "ouvir":
          if (a?.arquivo) foundry.audio.AudioHelper.play({ src: a.arquivo, volume: Number(a.volume) || 0.8, loop: false, channel: "environment" }, false);
          return;
        default: return;
      }
      this.render();
    }

    static async _salvar() {
      const { nome, ativo, ...gatilho } = this.dados;
      const dados = { ...padrao(this.tipoDoc), ...gatilho, distancia: Number(gatilho.distancia) || 0, usos: Math.max(0, Math.floor(Number(gatilho.usos) || 0)) };
      if (ehRegiao(this.document)) {
        await this.document.update({ name: nome?.trim() || this.document.name, disabled: !ativo, [`flags.${ID}.gatilho`]: dados });
      } else {
        await this.document.update({ [`flags.${ID}.gatilho`]: { ...dados, nome: nome?.trim() || "", ativo } });
      }
      this.dados = null;
      atualizarSecoes(this.document);
    }
  };
}

let Editor = null;
function abrirEditor(doc) {
  if (!doc?.id) return ui.notifications.warn(t("Gat.SalvePrimeiro"));
  Editor ??= criarEditor();
  const id = `${ID}-gatilho-${doc.documentName}-${doc.id}`;
  const existente = foundry.applications.instances?.get?.(id);
  if (existente) return existente.render({ force: true });
  new Editor({ document: doc, id }).render({ force: true });
}

// Seção "Gatilho" dentro da configuração de portas, tiles, luzes, sons, notas e desenhos
function resumo(doc) {
  if (!doc.getFlag(ID, "gatilho")) return t("Gat.Nenhum");
  const c = cfgDe(doc), info = infoDe(doc);
  const quando = c.quando.map(q => t(`Gat.Evento.${q}`)).join(", ") || "—";
  return `${info.ativo ? t("Gat.Ativo") : t("Gat.Desativado")} · ${quando} · ${t("Gat.AcoesN", { n: c.acoes.length })}`;
}

function atualizarSecoes(doc) {
  for (const el of document.querySelectorAll(`.nm-gat-secao[data-uuid="${doc.uuid}"] .resumo`)) el.textContent = resumo(doc);
  for (const el of document.querySelectorAll(`.nm-gat-secao[data-uuid="${doc.uuid}"] [data-a="remover"]`)) el.hidden = !doc.getFlag(ID, "gatilho");
}

function injetarSecao(app, html) {
  const doc = app.document;
  if (!game.user.isGM || !doc || !(doc.documentName in CONFIGS)) return;
  const raiz = html instanceof HTMLElement ? html : html?.[0];
  if (!raiz || raiz.querySelector(".nm-gat-secao")) return;
  injetarEstilo();
  const fs = document.createElement("fieldset");
  fs.className = "nm-gat-secao";
  fs.dataset.uuid = doc.uuid ?? "";
  const salvo = !!doc.id;
  fs.innerHTML = `<legend><i class="fa-solid fa-bolt"></i> ${t("Gat.Secao")}</legend>
    <p class="resumo">${esc(salvo ? resumo(doc) : t("Gat.SalvePrimeiro"))}</p>
    ${salvo ? `<div class="botoes">
      <button type="button" data-a="editar"><i class="fa-solid fa-pen-to-square"></i> ${t("Gat.Configurar")}</button>
      <button type="button" data-a="remover" ${doc.getFlag(ID, "gatilho") ? "" : "hidden"}><i class="fa-solid fa-trash"></i> ${t("Gat.Remover")}</button>
    </div>` : ""}`;
  fs.addEventListener("click", async ev => {
    const btn = ev.target.closest("button[data-a]");
    if (!btn) return;
    ev.preventDefault();
    if (btn.dataset.a === "editar") return abrirEditor(doc);
    const ok = await foundry.applications.api.DialogV2.confirm({ window: { title: t("Gat.Remover") }, content: `<p>${t("Gat.RemoverPergunta")}</p>`, rejectClose: false });
    if (ok) { await doc.unsetFlag(ID, "gatilho"); atualizarSecoes(doc); }
  });
  const form = raiz.matches?.("form") ? raiz : raiz.querySelector("form") ?? raiz;
  const rodape = form.querySelector(":scope > footer, footer.form-footer, footer.sheet-footer");
  rodape ? rodape.before(fs) : form.append(fs);
  app.setPosition?.({ height: "auto" });
}

// Registro
Hooks.once("init", () => {
  if (!registrarComportamento()) console.warn(`${ID} | esta versão não tem Comportamentos de Região; gatilhos de região desligados`);
  try {
    Editor = criarEditor();
    const DSC = foundry.applications.apps?.DocumentSheetConfig ?? globalThis.DocumentSheetConfig;
    DSC.registerSheet(foundry.documents.RegionBehavior ?? globalThis.RegionBehavior, ID, Editor, {
      types: [TIPO], makeDefault: true, label: "NM.Gat.Editor"
    });
  } catch (err) { console.warn(`${ID} | não consegui registrar o editor de gatilhos de região; use o botão na configuração`, err); }
});

for (const nome of Object.values(CONFIGS)) Hooks.on(`render${nome}`, injetarSecao);

// Se a configuração padrão do comportamento abrir mesmo assim, ganha um botão para o editor
Hooks.on("renderRegionBehaviorConfig", (sheet, html) => {
  const b = sheet.document;
  if (b?.type !== TIPO) return;
  const raiz = html instanceof HTMLElement ? html : html?.[0];
  if (!raiz || raiz.querySelector(".nm-abrir-editor")) return;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "nm-abrir-editor";
  btn.innerHTML = `<i class="fa-solid fa-bolt"></i> ${t("Gat.AbrirEditor")}`;
  btn.addEventListener("click", () => { abrirEditor(b); sheet.close(); });
  (raiz.querySelector(".window-content, form") ?? raiz).prepend(btn);
});

Hooks.on("canvasReady", () => { ligarCliques(); lembrarPosicoes(canvas.scene); });
Hooks.on("createToken", tk => posicoes.set(tk.uuid, centroToken(tk)));
Hooks.on("deleteToken", tk => posicoes.delete(tk.uuid));
Hooks.on("updateToken", aoMoverToken);
Hooks.on("updateCombat", aoMudarTurno);

// Portas: o gatilho da própria porta, e regiões que escolheram essa porta
Hooks.on("updateWall", (parede, mud, op, userId) => {
  if (!("ds" in mud) || op?.nmGatilho || !souMestreAtivo()) return;
  const S = CONST.WALL_DOOR_STATES;
  const evento = { [S.OPEN]: "portaAbre", [S.CLOSED]: "portaFecha", [S.LOCKED]: "portaTranca" }[mud.ds];
  if (!evento) return;
  if (parede.getFlag(ID, "gatilho")) executarGatilho(parede, { evento, userId });
  for (const b of gatilhosDe(parede.parent)) {
    if (!ehRegiao(b)) continue;
    const c = cfgDe(b);
    if (!c.quando.includes(evento) || (c.portas.length && !c.portas.includes(parede.id))) continue;
    executarGatilho(b, { evento, userId });
  }
});

// Luzes, sons e tiles ligando/desligando (mostrar/esconder)
for (const [nome, sim, nao] of [["AmbientLight", "desligar", "ligar"], ["AmbientSound", "desligar", "ligar"], ["Tile", "esconder", "mostrar"]]) {
  Hooks.on(`update${nome}`, (doc, mud, op, userId) => {
    if (!("hidden" in mud) || op?.nmGatilho || !souMestreAtivo() || !doc.getFlag(ID, "gatilho")) return;
    executarGatilho(doc, { evento: mud.hidden ? sim : nao, userId });
  });
}

// Nota: clique no alfinete (o diário abre normalmente)
Hooks.on("activateNote", note => {
  const doc = note?.document;
  if (doc?.getFlag(ID, "gatilho") && cfgDe(doc).quando.includes("clique")) despachar(doc, "clique");
});

// Combate começando (no mestre que clicou em começar) e terminando
Hooks.on("combatStart", combate => { if (game.user.isGM) dispararNoMapa(combate.scene, "combateInicio", { userId: game.user.id }); });
Hooks.on("deleteCombat", (combate, op, userId) => {
  vezAnterior.delete(combate.id);
  if (combate.started && souMestreAtivo()) dispararNoMapa(combate.scene, "combateFim", { userId });
});

Hooks.once("ready", () => {
  // Posição de todos os tokens, para saber quem entrou/saiu das áreas
  if (game.user.isGM) for (const cena of game.scenes) lembrarPosicoes(cena);

  game.socket.on(SOCKET, async data => {
    if (data?.acao === "efeito") {
      if (data.userIds?.includes(game.user.id)) aplicarEfeito(data.efeito);
    } else if (data?.acao === "gatilho" && souMestreAtivo()) {
      const doc = await fromUuid(data.uuid);
      if (doc) executarGatilho(doc, { evento: data.evento, tokenUuid: data.tokenUuid, userId: data.userId });
    }
  });
  const api = game.modules.get(ID).api ?? {};
  // Dispara um gatilho por macro: api.dispararGatilho(uuidDoObjetoOuComportamento)
  api.dispararGatilho = async (uuid, tokenUuid = null) => {
    const doc = await fromUuid(uuid);
    if (!ehGatilho(doc)) return ui.notifications.warn(t("Gat.NaoEncontrado"));
    if (souMestreAtivo()) return executarGatilho(doc, { evento: "outro", tokenUuid, userId: game.user.id, forcar: true });
    emitir({ acao: "gatilho", uuid, evento: "clique", tokenUuid, userId: game.user.id });
  };
  api.editarGatilho = async uuid => abrirEditor(await fromUuid(uuid));
});
