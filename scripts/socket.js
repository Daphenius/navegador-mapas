// Navegador de Mundos — socket: canal entre mestre e jogadores, sempre conferindo o remetente real.
// O servidor do Foundry acrescenta o id de quem mandou DEPOIS dos argumentos emitidos (é nisso que o
// socketlib também se apoia). O módulo sempre emite um argumento só, então a mensagem válida chega
// como (dados, idDoRemetente). Se chegar com mais argumentos, alguém tentou empurrar um id falso
// na 2ª posição, e a mensagem é descartada. O userId dentro dos dados nunca vale como prova.

import { ID, SOCKET, emitir, souMestreAtivo, estado } from "./nucleo.js";
import { precarregarLocal } from "./texturas.js";
import { irPara, executarPortal, faixasDoMapa, aoReceberFaixas } from "./viagem.js";

// Mensagens que o mestre manda para os jogadores (outro mestre conectado só ignora)
const PARA_JOGADORES = new Set(["ping", "precarregar", "puxar", "faixas"]);

// senderId: quem mandou de verdade (vem do socket). Só o mestre pode comandar o jogador.
async function aoReceberJogador(data, senderId) {
  // (as respostas dos outros jogadores também chegam aqui; só o que vem do mestre vale)
  if (!game.users.get(senderId)?.isGM) return;
  // Devolve o identificador da operação, para o mestre saber a qual envio a resposta pertence
  const status = estado => emitir({ acao: "status", userId: game.user.id, sceneId: data.sceneId, op: data.op, estado });
  if (data.acao === "ping") return emitir({ acao: "pong", userId: game.user.id });
  if (!data.userIds?.includes(game.user.id)) return;
  if (data.acao === "faixas") return aoReceberFaixas(data);

  if (data.acao === "precarregar") {
    try { await precarregarLocal(data.sceneId); status("pronto"); }
    catch (err) { console.error(err); status("erro-pre"); }
  }
  if (data.acao === "puxar") {
    try { await irPara(data.sceneId, { transicao: true }); status("chegou"); }
    catch (err) { console.error(err); status("erro"); }
  }
}

export function registrarSocket() {
  game.socket.on(SOCKET, async (data, ...resto) => {
    if (!data?.acao || resto.length !== 1 || typeof resto[0] !== "string") return;
    const senderId = resto[0];
    const remetente = game.users.get(senderId);
    if (!remetente) return;
    if (game.user.isGM) {
      if (data.acao === "gravar") {
        // Só grava o "último mapa" do próprio remetente
        if (souMestreAtivo() && game.scenes.has(data.sceneId)) remetente.setFlag(ID, "cena", data.sceneId).catch(console.error);
        return;
      }
      if (data.acao === "portal") {
        if (!souMestreAtivo()) return;
        // Jogador só pode levar um token que é dele
        if (!remetente.isGM) {
          const tk = typeof data.tokenUuid === "string" ? await fromUuid(data.tokenUuid).catch(() => null) : null;
          if (!tk?.actor?.testUserPermission(remetente, "OWNER"))
            return console.warn(`${ID} | portal ignorado: ${remetente.name} não é dono do token ${data.tokenUuid}`);
        }
        executarPortal(data);
        return;
      }
      if (data.acao === "pedir-musica") {
        // Jogador sem acesso à playlist do mapa: manda as faixas atuais só para ele
        const f = souMestreAtivo() ? faixasDoMapa(data.sceneId) : null;
        if (f) emitir({ acao: "faixas", userIds: [remetente.id], sceneId: data.sceneId, ...f });
        return;
      }
      if (PARA_JOGADORES.has(data.acao)) return;
      if (data.acao === "pedir-envio") {
        // Jogador só pede para si mesmo; o mestre pode pedir para qualquer um
        const ids = remetente.isGM ? (data.userIds ?? []) : [remetente.id];
        if (souMestreAtivo() && game.scenes.has(data.sceneId)) estado.app.enviarVarios(ids, data.sceneId);
        return;
      }
      // status/pong só contam para quem realmente mandou
      if (data.userId !== senderId) return console.warn(`${ID} | "${data.acao}" ignorado: usuário declarado diferente do remetente`);
      estado.app?.aoSocket(data);
    } else aoReceberJogador(data, senderId);
  });
}
