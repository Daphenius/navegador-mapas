// Navegador de Mundos — janela: enviar jogadores, pré-carregar e respostas dos jogadores

import { ID, TEMPO_PRECARGA, t, cfg, emitir } from "./nucleo.js";
import { moverTokenDoJogador, tocarParaTodos } from "./viagem.js";

export const Envio = Base => class extends Base {
  // Enviar jogadores
  ping() {
    this.pingFeito = false;
    emitir({ acao: "ping" });
    clearTimeout(this._tPing);
    this._tPing = setTimeout(() => { this.pingFeito = true; this.atualizar("jogadores"); }, 2500);
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
    if (game.scenes.has(sceneId)) this.lembrarRecente(sceneId); // uma vez só, não uma por jogador
    this.atualizar();
    await Promise.all(userIds.map(id => this.enviar(id, sceneId, opcoes)));
  }

  // semToken: o token já foi levado (portal)
  async enviar(userId, sceneId, { semToken = false } = {}) {
    const user = game.users.get(userId);
    const cena = game.scenes.get(sceneId);
    if (!user || !cena) return;

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
    // Se o jogador não confirmar a chegada a tempo, o "entrando..." some e o mestre é avisado
    this.esperar(user.id, cena.id, TEMPO_PRECARGA).then(chegou => {
      if (chegou || this.estados.get(user.id) !== est) return;
      this.estados.delete(user.id);
      ui.notifications.warn(t("Aviso.SemChegada", { nome: user.name, mapa: cena.name }));
      this.atualizar();
    });
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

  aoSocket(data) {
    if (!data?.userId) return;
    this.receptores.add(data.userId);
    if (data.acao === "pong") return this.atualizar("jogadores");
    if (data.acao !== "status") return;

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
      this.esperas.get(`${data.userId}:${data.sceneId}`)?.(true);
      setTimeout(() => { if (this.estados.get(data.userId) === est) { this.estados.delete(data.userId); this.atualizar(); } }, 1500);
    }
    if (data.estado === "erro") {
      this.estados.delete(data.userId);
      this.esperas.get(`${data.userId}:${data.sceneId}`)?.(false);
      ui.notifications.error(t("Aviso.ErroCarregar", { nome: user?.name }));
    }
    this.atualizar();
  }
};
