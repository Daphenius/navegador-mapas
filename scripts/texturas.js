// Navegador de Mundos — texturas: pré-carregar um mapa antes de o jogador entrar nele.
// A liberação de memória fica com o próprio Foundry (ver CHANGELOG da v4.3.0).

import { enfileirar, esperarCanvas } from "./nucleo.js";

export function precarregarLocal(sceneId) {
  return enfileirar(async () => {
    const cena = game.scenes.get(sceneId);
    if (!cena || canvas.scene?.id === cena.id) return;
    await esperarCanvas();
    await game.scenes.preload(sceneId);
  });
}
