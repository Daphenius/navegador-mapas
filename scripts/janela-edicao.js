// Navegador de Mundos — janela: menus e edição (grupos, mapas, pastas, favoritos, detalhes, ponto de chegada)

import { ID, MAX_RECENTES, t, esc, cfg, comparar, ordenar, etiquetasDe, pedirTexto, esperarCanvas } from "./nucleo.js";
import { escolherPontoNoCanvas } from "./viagem.js";

export const Edicao = Base => class extends Base {
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
    this.atualizar("jogadores");
  }

  async renomearGrupo(grupoId) {
    const grupos = this.grupos;
    const g = grupos.find(x => x.id === grupoId);
    if (!g) return;
    const nome = await pedirTexto(t("Grupo.Renomear"), t("Grupo.Nome"), g.nome);
    if (!nome) return;
    g.nome = nome;
    await game.settings.set(ID, "grupos", grupos);
    this.atualizar("jogadores");
  }

  async excluirGrupo(grupoId) {
    await game.settings.set(ID, "grupos", this.grupos.filter(x => x.id !== grupoId));
    this.atualizar("jogadores");
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
    this.atualizar("lista");
  }

  lembrarRecente(sceneId) {
    if (!sceneId) return;
    const atual = cfg("recentes") ?? [];
    if (atual[0] === sceneId) return; // já é o mais recente: não grava de novo
    const lista = atual.filter(id => id !== sceneId && game.scenes.has(id));
    lista.unshift(sceneId);
    game.settings.set(ID, "recentes", lista.slice(0, MAX_RECENTES + 6));
    this.atualizar("lista");
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
    this.atualizar("lista");
  }

  // Ponto de chegada
  async definirChegada(cena) {
    if (canvas.scene?.id !== cena.id) { await cena.view(); await esperarCanvas(); }
    await this.minimize();
    ui.notifications.info(t("Chegada.Clique"));
    const ponto = await escolherPontoNoCanvas();
    await this.maximize();
    if (!ponto) return ui.notifications.info(t("Chegada.Cancelado"));
    const tl = canvas.grid.getTopLeftPoint(ponto);
    await cena.setFlag(ID, "chegada", { x: Math.round(tl.x), y: Math.round(tl.y) });
    ui.notifications.info(t("Chegada.Definido", { mapa: cena.name }));
  }
};
