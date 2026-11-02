// Navegador de Mundos — socket: canal entre mestre e jogadores, sempre conferindo o remetente real
// (o 2º argumento do callback; o userId dentro dos dados não vale como prova)

import { ID, SOCKET, emitir, souMestreAtivo, estado } from "./nucleo.js";
import { precarregarLocal, descarregarLocal } from "./texturas.js";
import { irPara, executarPortal } from "./viagem.js";

// senderId: quem mandou de verdade (vem do socket). Só o mestre pode comandar o jogador.
export async function aoReceberJogador(data, senderId) {
  // (as respostas dos outros jogadores também chegam aqui; só o que vem do mestre vale)
  if (!game.users.get(senderId)?.isGM) return;
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

export function registrarSocket() {
  game.socket.on(SOCKET, async (data, senderId) => {
    if (!data?.acao) return;
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
