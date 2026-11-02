// Navegador de Mundos — janela do mestre (ApplicationV2 + Handlebars, desenhada em partes).
// As ações de edição ficam em janela-edicao.js e as de envio em janela-envio.js.

import { ID, MAX_RECENTES, t, esc, corDe, imgDe, cfg, comparar, ordenar, etiquetasDe, corEtiqueta, estado } from "./nucleo.js";
import { Edicao } from "./janela-edicao.js";
import { Envio } from "./janela-envio.js";

// Templates da janela (carregados no init; pasta e cena também viram partials)
export const TEMPLATES = Object.fromEntries(["jogadores", "topo", "lista", "rodape", "pasta", "cena"]
  .map(n => [n, `modules/${ID}/templates/${n}.hbs`]));
const ESPERA_REDESENHO = 60; // ms juntando mudanças seguidas num redesenho só

// Abre a janela (só o mestre)
export function abrir() {
  if (!game.user.isGM) return ui.notifications.warn(t("Aviso.SoMestre"));
  estado.app ??= new NavegadorMapas();
  estado.app.render({ force: true });
}

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
export class NavegadorMapas extends Envio(Edicao(HandlebarsApplicationMixin(ApplicationV2))) {
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

  static PARTS = {
    jogadores: { template: TEMPLATES.jogadores, scrollable: [""] },
    topo: { template: TEMPLATES.topo },
    lista: { template: TEMPLATES.lista, scrollable: [""] },
    rodape: { template: TEMPLATES.rodape }
  };

  // Redesenha só as partes que mudaram; mudanças seguidas viram um desenho só.
  // Sem argumentos: jogadores e lista.
  _pend = new Set();
  atualizar(...partes) {
    for (const p of partes.length ? partes : ["jogadores", "lista"]) this._pend.add(p);
    if (this._tAtual) return;
    this._tAtual = setTimeout(() => {
      this._tAtual = null;
      const parts = [...this._pend];
      this._pend.clear();
      if (this.rendered && parts.length) this.render({ parts });
    }, ESPERA_REDESENHO);
  }

  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);
    if (partId === "jogadores") Object.assign(context, this._ctxJogadores());
    else if (partId === "lista") Object.assign(context, this._ctxLista());
    else if (partId === "topo") context.filtro = this.filtro;
    else if (partId === "rodape") Object.assign(context, { precarregar: cfg("precarregar"), levarToken: cfg("levarToken") });
    return context;
  }

  _marcarSelecao() {
    if (!this.element) return;
    this.element.querySelectorAll(".nm-jogador").forEach(c => c.classList.toggle("sel", this.selecionados.has(c.dataset.user)));
    const info = this.element.querySelector(".nm-sel-info");
    if (!info) return;
    info.hidden = this.selecionados.size < 2;
    const qtd = info.querySelector(".nm-sel-qtd");
    if (qtd) qtd.textContent = this.selecionados.size;
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
    this.atualizar("lista");
    await game.settings.set(ID, "pastasFechadas", [...s]);
  }

  // Jogador online, com personagem, num mapa sem o token dele
  _semToken(u) {
    if (!u.active || !u.character || this.estados.get(u.id)?.envio) return false;
    const cena = game.scenes.get(u.viewedScene);
    return !!cena && !cena.tokens.some(tk => tk.actorId === u.character.id);
  }

  // Parte "jogadores": lista de jogadores e grupos salvos
  // (os textos vão crus: o Handlebars escapa tudo que usa {{ }})
  _ctxJogadores() {
    const nomeCena = id => game.scenes.get(id)?.name ?? "—";
    const jogadores = this._jogadores().map(u => {
      const e = this.estados.get(u.id);
      const fixa = u.getFlag(ID, "cena");
      let subIcone = "fa-location-dot", subTexto = nomeCena(u.active ? u.viewedScene : fixa);
      if (e?.estado === "precarregando") [subIcone, subTexto] = ["fa-spinner fa-spin", t("Jog.PreCarregando", { mapa: nomeCena(e.sceneId) })];
      else if (e?.estado === "indo") [subIcone, subTexto] = ["fa-spinner fa-spin", t("Jog.Entrando", { mapa: nomeCena(e.sceneId) })];
      else if (!u.active && fixa) [subIcone, subTexto] = ["fa-thumbtack", t("Jog.VaiEntrar", { mapa: nomeCena(fixa) })];

      let selo = null;
      if (u.active && this.receptores.has(u.id)) selo = { icone: "fa-plug", classe: "nm-ok", dica: t("Jog.ModuloOk") };
      else if (u.active && this.pingFeito) selo = { icone: "fa-triangle-exclamation", classe: "nm-alerta", dica: t("Jog.ModuloSemResposta") };

      return {
        id: u.id, nome: u.name, img: imgDe(u), cor: corDe(u.color), online: u.active,
        sel: this.selecionados.has(u.id), perdido: this._semToken(u),
        personagem: u.character?.name ?? t("Jog.SemPersonagem"), subIcone, subTexto, selo
      };
    });
    const grupos = this.grupos.map(g => {
      const us = g.users.map(id => game.users.get(id)).filter(Boolean);
      return {
        id: g.id, nome: g.nome, dica: us.map(u => u.name).join(", ") || "—",
        avatares: us.slice(0, 5).map(u => ({ img: imgDe(u), cor: corDe(u.color) }))
      };
    });
    const n = this.selecionados.size;
    return {
      jogadores, grupos, variosSelecionados: n >= 2,
      // o número fica num <span> para a seleção poder mudar sem redesenhar a parte
      textoSelecionados: t("Jog.Selecionados", { n: `<span class="nm-sel-qtd">${n}</span>` })
    };
  }

  // Grupos salvos
  get grupos() { return foundry.utils.deepClone(cfg("grupos") ?? []); }

  _membros(grupoId) {
    const g = this.grupos.find(x => x.id === grupoId);
    return g ? g.users.filter(id => game.users.get(id)) : [];
  }

  // Mapas
  _lugar(u) {
    const e = this.estados.get(u.id);
    if (e?.envio) return e.sceneId;
    return u.active ? u.viewedScene : null;
  }

  _ctxCena(s, ctx, compacta = false) {
    const pre = this.precarregados.get(s.id)?.size ?? 0;
    const etiquetas = etiquetasDe(s).map(e => ({ nome: e, cor: corEtiqueta(e) }));
    const nota = s.getFlag(ID, "nota") || "";
    const musica = s.getFlag(ID, "musica");
    const presentes = (ctx.porCena.get(s.id) ?? []).map(u => {
      const e = this.estados.get(u.id);
      const indo = !!e?.envio && e.estado !== "chegou";
      const perdido = !indo && this._semToken(u);
      const dica = `${u.name}${indo ? ` (${t("Mapa.Carregando")})` : perdido ? ` (${t("Jog.SemToken")})` : ""}`;
      return { img: imgDe(u), cor: corDe(u.color), indo, perdido, dica };
    });
    return {
      id: s.id, nome: s.name, thumb: s.thumb, ativa: s.active, minha: ctx.minha === s.id, compacta,
      fav: ctx.favs.has(s.id), precarregando: ctx.precarregando.has(s.id),
      pre, preDica: pre ? t("Mapa.PreCarregado", { n: pre }) : "",
      chegada: !!s.getFlag(ID, "chegada"),
      musicaDica: musica?.playlist ? t(musica.modo === "todos" ? "Mapa.MusicaTodos" : "Mapa.MusicaLocal") : "",
      foraNav: !s.navigation,
      etiquetas, nota, mostrarInfo: !compacta && (etiquetas.length > 0 || !!nota),
      presentes
    };
  }

  // Parte "lista": filtro de etiquetas, favoritos, recentes e a árvore de pastas e mapas
  _ctxLista() {
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
    for (const u of this._jogadores()) {
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

    // null = a pasta não tem nada que bata com a busca
    const montarPasta = (p, mostrarTudo = false) => {
      const nomeBate = !!f && !sel.size && p.name.toLowerCase().includes(f);
      const tudo = mostrarTudo || nomeBate || !filtrando;
      const aberta = filtrando || !fechadas.has(p.id);
      // Pasta fechada não monta o conteúdo
      let subs = [], cenas = [];
      if (aberta) {
        subs = ordenar(subpastas.get(p.id) ?? [], p.sorting).map(sp => montarPasta(sp, tudo && filtrando)).filter(Boolean);
        cenas = ordenar(cenasDe.get(p.id) ?? [], p.sorting).filter(s => tudo || bate(s)).map(s => this._ctxCena(s, ctx));
        if (filtrando && !tudo && !subs.length && !cenas.length) return null;
      }
      const r = resumir(p);
      return {
        id: p.id, nome: p.name, cor: corDe(p.color) || "#777", aberta, total: r.total,
        presentes: aberta ? [] : r.jogadores.map(u => ({ img: imgDe(u), cor: corDe(u.color), nome: u.name })),
        subpastas: subs, cenas, vazia: aberta && !subs.length && !cenas.length
      };
    };

    // Favoritos e recentes (somem durante a busca)
    let favoritos = [], recentes = [];
    if (!filtrando) {
      favoritos = [...ctx.favs].map(id => game.scenes.get(id)).filter(Boolean).map(s => this._ctxCena(s, ctx, true));
      recentes = (cfg("recentes") ?? []).filter(id => !ctx.favs.has(id)).map(id => game.scenes.get(id)).filter(Boolean)
        .slice(0, MAX_RECENTES).map(s => this._ctxCena(s, ctx, true));
    }

    const pastas = ordenar(subpastas.get(null) ?? [], "a").map(p => montarPasta(p)).filter(Boolean);
    const cenas = ordenar(cenasDe.get(null) ?? [], "m").filter(s => !filtrando || bate(s)).map(s => this._ctxCena(s, ctx));
    return {
      etiquetas: [...todasEtq].sort(comparar).map(e => ({ nome: e, cor: corEtiqueta(e), on: sel.has(e) })),
      filtrandoEtq: sel.size > 0,
      favoritos, recentes, pastas, cenas,
      vazio: pastas.length || cenas.length ? "" : t(filtrando ? "Mapa.NenhumEncontrado" : "Mapa.NenhumCriado")
    };
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
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
        return this.atualizar("lista");
      }
      const alvoAcao = ev.target.closest("[data-acao]");
      const acao = alvoAcao?.dataset.acao;
      if (acao === "novo-mapa") this.criarMapa(null);
      else if (acao === "nova-pasta") this.criarPasta(null);
      else if (acao === "limpar-sel") { this.selecionados.clear(); this._marcarSelecao(); }
      else if (acao === "salvar-grupo") this.salvarGrupo();
      else if (acao === "limpar-etq") { this.filtroEtq.clear(); this.atualizar("lista"); }
      else if (acao === "colocar-token") this.colocarToken(alvoAcao.dataset.user);
      else if (acao === "liberar") this.descarregar(null);
      else if (acao === "recolher") {
        game.settings.set(ID, "pastasFechadas", game.folders.filter(p => p.type === "Scene").map(p => p.id));
        this.atualizar("lista");
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
      this._tBusca = setTimeout(() => this.atualizar("lista"), 150);
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

  _onFirstRender(context, options) {
    super._onFirstRender?.(context, options);
    this._ouvirEventos();
    const CAMPOS_CENA = ["name", "navName", "thumb", "folder", "active", "navigation", "sort", "flags"];
    const CAMPOS_PASTA = ["name", "color", "folder", "sort", "sorting"];
    // Token ou ator de algum jogador? (tokens de NPC e movimento de tokens não redesenham nada)
    const deJogador = actorId => !!actorId && game.users.some(u => !u.isGM && u.character?.id === actorId);
    const ganchos = {
      // A lista também mostra os retratos dos jogadores nos cartões dos mapas
      updateUser: u => { if (!u.isGM) this.atualizar(); },
      userConnected: () => this.atualizar(),
      createScene: () => this.atualizar("lista"),
      // O nome do mapa aparece também embaixo de cada jogador
      deleteScene: () => this.atualizar(),
      updateScene: (s, mud) => {
        if ("name" in mud) this.atualizar();
        else if (CAMPOS_CENA.some(k => k in mud)) this.atualizar("lista");
      },
      createFolder: p => { if (p.type === "Scene") this.atualizar("lista"); },
      deleteFolder: p => { if (p.type === "Scene") this.atualizar("lista"); },
      updateFolder: (p, mud) => { if (p.type === "Scene" && CAMPOS_PASTA.some(k => k in mud)) this.atualizar("lista"); },
      // Token do personagem entrou ou saiu: muda o aviso "sem token" (na lateral e no cartão do mapa)
      createToken: tk => { if (deJogador(tk.actorId)) this.atualizar(); },
      deleteToken: tk => { if (deJogador(tk.actorId)) this.atualizar(); },
      updateActor: (a, mud) => {
        if (!deJogador(a.id)) return;
        if ("img" in mud) this.atualizar(); // retrato aparece nos cartões também
        else if ("name" in mud) this.atualizar("jogadores");
      },
      canvasReady: () => this.atualizar("lista")
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

  _onClose(options) {
    super._onClose?.(options);
    for (const [h, id] of this._ganchos ?? []) Hooks.off(h, id);
    this._ganchos = null;
    clearTimeout(this._tAtual);
    this._tAtual = null;
    this._pend.clear();
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
}
