// Navegador de Mundos — socket: canal entre mestre e jogadores, sempre conferindo o remetente real.
// O servidor do Foundry acrescenta o id de quem mandou DEPOIS dos argumentos emitidos (é nisso que o
// socketlib também se apoia). O módulo sempre emite um argumento só, então a mensagem válida chega
// como (dados, idDoRemetente). Se chegar com mais argumentos, alguém tentou empurrar um id falso
// na 2ª posição, e a mensagem é descartada. O userId dentro dos dados nunca vale como prova.

import { ID, SOCKET, t, esc, cfg, emitir, souMestreAtivo, estado } from "./nucleo.js";
import { precarregarLocal } from "./texturas.js";
import { irPara, executarPortal, faixasDoMapa, aoReceberFaixas } from "./viagem.js";

// Mensagens que o mestre manda para os jogadores (outro mestre conectado só ignora)
const PARA_JOGADORES = new Set(["ping", "precarregar", "puxar", "faixas"]);

// Pedidos que partem de um jogador (API usada numa macro, ou uma mensagem escrita à mão no console):
// ir sozinho para um mapa ("pedir-envio") ou levar o próprio token ("portal"). O socket prova quem
// pediu, mas não que o mestre queira aquele destino. Por isso vale a regra do mundo:
//   perguntar (padrão): o mestre recebe uma pergunta e decide;  permitir: vai direto;  recusar: nunca.
// Um pedido por jogador de cada vez: enquanto a pergunta está aberta, os outros pedidos dele são descartados.
const perguntasAbertas = new Set();
export async function autorizarPedido(remetente, cena) {
  if (remetente.isGM) return true;
  let regra = "perguntar";
  try { regra = cfg("pedidosJogadores") ?? "perguntar"; } catch { /* sem a configuração, pergunta */ }
  if (regra === "permitir") return true;
  if (regra !== "perguntar") {
    console.warn(`${ID} | pedido de ${remetente.name} para ir a "${cena.name}" recusado (pedidos de jogadores desligados)`);
    return false;
  }
  if (perguntasAbertas.has(remetente.id)) return false;
  perguntasAbertas.add(remetente.id);
  try {
    return !!(await foundry.applications.api.DialogV2.confirm({
      window: { title: t("Pedido.Titulo") },
      content: `<p>${t("Pedido.Pergunta", { nome: esc(remetente.name), mapa: esc(cena.name) })}</p>`,
      rejectClose: false
    }));
  } catch (err) {
    console.warn(`${ID} | não consegui perguntar ao mestre sobre o pedido de ${remetente.name}`, err);
    return false;
  } finally { perguntasAbertas.delete(remetente.id); }
}

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
          // O destino e o "confirmar" vêm do jogador: quem decide é a regra do mestre, não a mensagem
          const destino = game.scenes.get(data.sceneId);
          if (!destino || !(await autorizarPedido(remetente, destino))) return;
          executarPortal({ ...data, confirmar: false });
          return;
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
        const destino = souMestreAtivo() ? game.scenes.get(data.sceneId) : null;
        if (!destino || !(await autorizarPedido(remetente, destino))) return;
        estado.app.enviarVarios(ids, destino.id);
        return;
      }
      // status/pong só contam para quem realmente mandou
      if (data.userId !== senderId) return console.warn(`${ID} | "${data.acao}" ignorado: usuário declarado diferente do remetente`);
      estado.app?.aoSocket(data);
    } else aoReceberJogador(data, senderId);
  });
}
