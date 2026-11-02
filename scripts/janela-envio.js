// Navegador de Mundos — janela: enviar jogadores, pré-carregar e respostas dos jogadores

import { ID, TEMPO_PRECARGA, t, cfg, emitir } from "./nucleo.js";
import { moverTokenDoJogador, tocarParaTodos } from "./viagem.js";

const ESPERA_PING_MS = 2500;   // tempo para os jogadores responderem ao "o módulo está aí?"
const MOSTRA_CHEGOU_MS = 1500; // o "chegou" fica um instante no retrato antes de sumir

export const Envio = Base => class extends Base {
  // Enviar jogadores
  ping() {
    this.pingFeito = false;
    emitir({ acao: "ping" });
    clearTimeout(this._tPing);
    this._tPing = setTimeout(() => { this.pingFeito = true; this.atualizar("jogadores"); }, ESPERA_PING_MS);
  }

  // Cada envio (ou pré-carregamento) tem um identificador próprio, a "operação".
  // O jogador devolve esse identificador nas respostas, e só a resposta da operação
  // certa conclui, cancela ou limpa o estado dela: respostas atrasadas de um envio
  // anterior (mesmo para o mesmo mapa) são ignoradas.
  // fase: "pre" (pré-carregamento) ou "chegada"
  _chaveEspera(userId, op, fase) { return `${userId}:${op}:${fase}`; }

  // Espera a resposta de um jogador para uma operação
  esperar(userId, op, fase, ms) {
    const chave = this._chaveEspera(userId, op, fase);
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
      ? moverTokenDoJogador(user, cena, origemId).catch(err => {
        console.error(err);
        if (!err?.avisado) ui.notifications.error(t("Aviso.ErroToken", { nome: user.name }));
      })
      : null;

    if (!user.active) {
      ui.notifications.info(t("Aviso.Offline", { nome: user.name, mapa: cena.name }));
      return this.atualizar();
    }

    // Se o módulo não respondeu no navegador dele, não adianta esperar o pré-carregamento
    const semModulo = this.pingFeito && !this.receptores.has(user.id);
    if (semModulo) ui.notifications.warn(t("Aviso.SemModulo", { nome: user.name }));
    const pre = cfg("precarregar") && !semModulo && !this.precarregados.get(cena.id)?.has(user.id) && user.viewedScene !== cena.id;
    const op = foundry.utils.randomID();
    const est = { sceneId: cena.id, envio: true, estado: pre ? "precarregando" : "indo", op };
    this.estados.set(user.id, est);
    this.atualizar();

    if (pre) {
      emitir({ acao: "precarregar", userIds: [user.id], sceneId: cena.id, op });
      const ok = await this.esperar(user.id, op, "pre", TEMPO_PRECARGA);
      if (!user.active || this.estados.get(user.id) !== est) return;
      if (!ok) console.warn(`${ID} | sem resposta do pré-carregamento de ${user.name}; enviando mesmo assim`);
      est.estado = "indo";
      this.atualizar();
    }
    await token; // o token já está no mapa quando ele chega
    if (this.estados.get(user.id) !== est) return;
    emitir({ acao: "puxar", userIds: [user.id], sceneId: cena.id, op });
    // Se o jogador não confirmar a chegada a tempo, o "entrando..." some e o mestre é avisado
    this.esperar(user.id, op, "chegada", TEMPO_PRECARGA).then(chegou => {
      if (chegou || this.estados.get(user.id) !== est) return;
      this.estados.delete(user.id);
      ui.notifications.warn(t("Aviso.SemChegada", { nome: user.name, mapa: cena.name }));
      this.atualizar();
    });
  }

  precarregarTodos(cena) {
    const ids = game.users.filter(u => !u.isGM && u.active && !this.precarregados.get(cena.id)?.has(u.id)).map(u => u.id);
    if (!ids.length) return ui.notifications.info(t("Aviso.TodosPreCarregados"));
    const op = foundry.utils.randomID();
    for (const id of ids) if (!this.estados.get(id)?.envio) this.estados.set(id, { sceneId: cena.id, envio: false, estado: "precarregando", op });
    emitir({ acao: "precarregar", userIds: ids, sceneId: cena.id, op });
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
    // Só a resposta da operação em andamento (mesmo identificador e mesmo mapa) mexe no estado
    const est = this.estados.get(data.userId);
    const daOperacao = !!est && typeof data.op === "string" && est.op === data.op && est.sceneId === data.sceneId;
    const responder = (fase, ok) => { if (typeof data.op === "string") this.esperas.get(this._chaveEspera(data.userId, data.op, fase))?.(ok); };

    if (data.estado === "pronto" || data.estado === "erro-pre") {
      // O mapa ficou mesmo carregado no navegador dele, venha de qual operação vier
      if (data.estado === "pronto" && game.scenes.has(data.sceneId)) {
        const set = this.precarregados.get(data.sceneId) ?? new Set();
        set.add(data.userId);
        this.precarregados.set(data.sceneId, set);
      }
      responder("pre", data.estado === "pronto");
      if (daOperacao) {
        if (data.estado === "erro-pre") ui.notifications.warn(t("Aviso.ErroPreCarregar", { nome: user?.name }));
        if (!est.envio) this.estados.delete(data.userId);
      }
    }
    if (data.estado === "chegou" && daOperacao) {
      est.estado = "chegou";
      responder("chegada", true);
      setTimeout(() => { if (this.estados.get(data.userId) === est) { this.estados.delete(data.userId); this.atualizar(); } }, MOSTRA_CHEGOU_MS);
    }
    if (data.estado === "erro" && daOperacao) {
      this.estados.delete(data.userId);
      responder("chegada", false);
      ui.notifications.error(t("Aviso.ErroCarregar", { nome: user?.name }));
    }
    this.atualizar();
  }
};
