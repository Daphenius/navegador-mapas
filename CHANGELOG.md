# Changelog

## v4.0.0

### Mudança importante
- **Os gatilhos e o comportamento de Região "Portal" saíram do Navegador.** Agora eles vivem no módulo separado **Objetos Vivos** (`objetos-vivos`), com uma interface nova.
- Se você criou gatilhos ou portais na v3.x, eles deixam de funcionar. Comportamentos "Portal" antigos podem aparecer como inválidos nas regiões: é só apagá-los.

### Mantido
- Toda a janela de mapas: pastas, favoritos, recentes, etiquetas, notas, grupos, ponto de chegada, tela de transição, música por mapa e memória.
- A função `api.portal(token, sceneId, regiaoUuid)`, que leva um token e os jogadores donos dele para outro mapa. O Objetos Vivos usa ela na ação "Levar a outro mapa".

## v3.3.0

### Novidades
- O módulo passa a se chamar **Navegador de Mundos (Em testes)**, com aviso no README: ainda não está completo e pode ter erros.
- Novos gatilhos de porta: **ao destrancar**, **ao tentar abrir trancada** (quando um jogador clica numa porta trancada) e **ao ser revelada** (porta secreta que vira porta comum).
- Novo gatilho para qualquer parede: **ao alguém atravessar**. Uma parede que não bloqueia movimento vira um fio de armadilha invisível.
- Os eventos ficaram mais claros: "Ao abrir", "Ao fechar", "Ao trancar"... (em inglês "When opens", "When closes"...), sem a palavra "porta".
- O gatilho de parede agora se chama "Parede", e o aviso de "não é porta" só aparece quando um evento de porta está marcado.

## v3.2.0

Primeira versão publicada. O módulo passa a se chamar **Navegador de Mundos** (o id continua `navegador-mapas`).

### Novidades
- **Gatilhos** em portas, tiles, luzes, sons, notas, desenhos e regiões. Disparam quando um token entra ou sai, com clique, quando uma porta abre, fecha ou é trancada, quando luz ou som liga ou desliga, quando um tile aparece ou some, no início ou fim do turno e no início ou fim do combate. Têm filtro de quem dispara, limite de usos, confirmação do mestre e 12 ações: efeito sonoro, esperar, portas, mostrar/esconder, escuridão, levar para outro mapa, chat, diário, imagem, câmera, música e outro gatilho.
- **Portais**: comportamento de Região que leva o token e o jogador dono dele para outro mapa.
- **Ponto de chegada** por mapa, e tokens que não se empilham ao chegar.
- **Favoritos e mapas recentes** no topo da janela.
- **Grupos salvos** de jogadores.
- **Notas do mestre e etiquetas com cores** nos mapas, com filtro.
- **Mudar a ordem dos mapas** arrastando um sobre o outro.
- **Tela de transição** com o nome do mapa enquanto ele carrega.
- **Música por mapa**: só para quem entra ou para todos, usando as playlists nativas.
- **Aviso de jogador sem token**, com botão para colocar o token.
- O jogador abre direto no último mapa ao recarregar (sem carregar o mapa ativo antes).
- Textos em **português e inglês**.

### Correções
- O pré-carregamento de um mapa não libera mais o envio para outro mapa por engano.
- Jogador que desconecta no meio do envio não fica com o ícone de "carregando" travado.
- Quando o módulo não responde no navegador de um jogador, o envio não espera mais 2 minutos.
- O Esc limpa a seleção sem fechar a janela.
- Ao excluir um mapa, quem estava marcado para entrar nele perde a marcação.
