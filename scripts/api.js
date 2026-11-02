// Navegador de Mundos — API para macros e outros módulos.
// Fica em game.modules.get("navegador-mapas").api depois do "ready".
// O Gazua da Mesa e o Objetos Vivos usam api.portal na ação "Levar a outro mapa".

import { t, emitir, estado } from "./nucleo.js";
import { abrir } from "./janela.js";
import { esperarAnimacao, pedirPortal } from "./viagem.js";

/**
 * Monta o objeto da API.
 * @returns {{ abrir: Function, enviar: Function, portal: Function }}
 */
export function criarApi() {
  return {
    /**
     * Abre a janela do Navegador (só o mestre; para jogadores mostra um aviso).
     * @returns {void}
     */
    abrir,

    /**
     * Envia jogadores para um mapa, com pré-carregamento, token e tela de transição
     * conforme as opções da janela. O mestre pode enviar qualquer jogador;
     * um jogador só consegue pedir para si mesmo (o mestre ativo faz o envio).
     * @param {string|string[]} userIds  Id de um usuário ou lista de ids.
     * @param {string} sceneId           Id do mapa (cena) de destino.
     * @returns {Promise<void>|void}
     */
    enviar: (userIds, sceneId) => {
      const ids = [userIds].flat().filter(Boolean);
      if (!game.scenes.has(sceneId)) return ui.notifications.warn(t("Aviso.MapaNaoExiste"));
      if (game.user.isGM) return estado.app.enviarVarios(ids, sceneId);
      emitir({ acao: "pedir-envio", userIds: [game.user.id], sceneId });
    },

    /**
     * Leva um token, e os jogadores donos dele, para outro mapa (com a tela de transição).
     * Espera a animação de movimento do token terminar antes. Um jogador só pode
     * levar um token que é dele; o pedido passa pelo mestre ativo.
     * @param {Token|TokenDocument} token  Token no canvas ou o documento dele.
     * @param {string} sceneId              Id do mapa de destino.
     * @param {string|null} [regiaoUuid]    UUID de uma Região do destino: o token chega
     *                                      no centro dela (sem ela, no ponto de chegada do mapa).
     * @returns {Promise<void>}
     */
    portal: async (token, sceneId, regiaoUuid = null) => {
      const doc = token?.document ?? token;
      if (!doc?.uuid || !game.scenes.has(sceneId)) return;
      await esperarAnimacao(doc);
      return pedirPortal({ tokenUuid: doc.uuid, sceneId, regiaoUuid, confirmar: false });
    }
  };
}
