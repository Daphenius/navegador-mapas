// Navegador de Mundos — Foundry VTT v14
// Aba de mapas com pastas e envio de cada jogador para um mapa diferente
// (estilo Player Page do Roll20). Abre pelo botão na navegação de cenas
// ou com Shift+M.
//
// Este arquivo só liga as peças: init, ready e ganchos do Foundry.
//   nucleo.js        constantes, configurações e utilitários
//   texturas.js      pré-carregar mapas
//   viagem.js        troca de mapa, transição, música, casas livres, portais, ponto de chegada
//   socket.js        canal entre mestre e jogadores
//   janela*.js       janela do mestre (desenho, edição, envio)
//   barra.js         botão na navegação de cenas e opções de ocultar
//   central*.js      Central de Configurações (janela das opções do módulo)
//   api.js           API para macros e outros módulos

import { ID, cfg, souMestreAtivo, esperarCanvas, estado, registrarConfig } from "./nucleo.js";
import {
  irPara, gravarLugar, liberarGravacao, desenharChegada, atualizarMusicaLocal,
  limparFixasOffline, interceptarPrimeiroDesenho, reservas
} from "./viagem.js";
import { registrarSocket } from "./socket.js";
import { abrir, NavegadorMapas, TEMPLATES } from "./janela.js";
import { injetarBotaoNav, aplicarOcultarNav } from "./barra.js";
import { criarApi } from "./api.js";
import { registrarCentral } from "./central.js";
import { registrarTransicaoPropria } from "./transicao-propria.js";

Hooks.once("init", () => {
  foundry.applications.handlebars.loadTemplates(Object.values(TEMPLATES));
  interceptarPrimeiroDesenho();
  registrarTransicaoPropria(); // antes das configurações, para aparecer nas listas de transição
  registrarCentral();
  registrarConfig({ aoMudarNav: aplicarOcultarNav, aoAtalho: abrir, aoMudarArea: desenharChegada });
});

Hooks.on("renderSceneNavigation", () => injetarBotaoNav());

Hooks.on("updateScene", (cena, mudancas) => {
  if (mudancas.active === true && souMestreAtivo()) limparFixasOffline();
  if (cena.id === canvas.scene?.id && foundry.utils.hasProperty(mudancas, `flags.${ID}`)) {
    desenharChegada();
    atualizarMusicaLocal();
  }
});

// Mapa excluído: quem estava "marcado" para entrar nele perde a marcação
Hooks.on("deleteScene", async cena => {
  // Em todos os navegadores: solta o que ficou guardado sobre esse mapa
  reservas.delete(cena.id);
  if (!souMestreAtivo()) return;
  estado.app?.precarregados.delete(cena.id);
  for (const u of game.users.filter(u => u.getFlag(ID, "cena") === cena.id)) await u.unsetFlag(ID, "cena").catch(console.error);
});

const PING_APOS_CONEXAO_MS = 4000; // dá tempo do módulo carregar no navegador de quem acabou de entrar
Hooks.on("userConnected", (user, conectado) => {
  const app = estado.app;
  if (!game.user.isGM || !app) return;
  app.esquecer(user.id);
  if (conectado) setTimeout(() => app.rendered && app.ping(), PING_APOS_CONEXAO_MS);
});

Hooks.on("canvasReady", () => {
  gravarLugar();
  desenharChegada();
  atualizarMusicaLocal();
  if (game.user.isGM) estado.app?.lembrarRecente(canvas.scene?.id);
  // Se abriu direto no último mapa, avisa os outros onde o jogador está
  else if (canvas.scene && game.user.viewedScene !== canvas.scene.id) {
    try { game.user.broadcastActivity({ sceneId: canvas.scene.id }); }
    catch (err) { console.warn(`${ID} | não consegui avisar em que mapa o jogador está`, err); }
  }
});

Hooks.once("ready", () => {
  if (game.user.isGM) estado.app = new NavegadorMapas(); // existe mesmo fechada: recebe respostas e portais
  registrarSocket();
  game.modules.get(ID).api = criarApi();

  injetarBotaoNav();
  aplicarOcultarNav();

  if (!game.user.isGM) {
    // Leva o jogador ao último mapa visitado (normalmente já abriu direto nele)
    const fixa = cfg("lembrarLugar") ? game.user.getFlag(ID, "cena") : null;
    if (fixa && game.scenes.get(fixa)) irPara(fixa).finally(liberarGravacao);
    else esperarCanvas().then(liberarGravacao);
  }
});
