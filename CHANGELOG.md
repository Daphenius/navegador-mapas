# Changelog

## v4.2.0

### Por dentro
- O código, que era um arquivo único de quase 1.800 linhas, foi dividido por assunto. Nenhum arquivo passa de 600 linhas:
  - `nucleo.js`: constantes, configurações e utilitários;
  - `texturas.js`: pré-carregar mapas e liberar memória;
  - `viagem.js`: troca de mapa, tela de transição, música, casas livres, portais e ponto de chegada;
  - `socket.js`: mensagens entre mestre e jogadores (com a conferência do remetente real);
  - `janela.js`, `janela-edicao.js` e `janela-envio.js`: a janela do mestre;
  - `barra.js`: botão na navegação de cenas e opções de ocultar;
  - `api.js`: a API para macros e outros módulos, agora documentada;
  - `navegador.js`: só liga as peças (init, ready e ganchos).
- Nada muda no uso: mesmas funções, mesmas configurações, mesma API.

## v4.1.0

### Desempenho
- A janela do Navegador agora é desenhada em partes separadas (jogadores, busca, lista de mapas e opções). Quando algo muda, só a parte afetada é redesenhada, em vez da janela inteira.
- Criar ou apagar tokens de NPC e mover tokens não redesenha mais a janela. Só o token do personagem de um jogador entrando ou saindo de um mapa atualiza o aviso "sem token".
- Mudar o nome de um mapa ou de um personagem atualiza só o que mostra esse nome.
- A lista de jogadores e a lista de mapas lembram onde você estava rolando depois de atualizar.

### Por dentro
- O visual saiu do código e foi para um arquivo próprio (`styles/navegador.css`), carregado pelo Foundry.
- O conteúdo da janela agora vem de templates (`templates/*.hbs`), que escapam nomes de mapas, jogadores e grupos automaticamente.
- As opções "Pré-carregar" e "Levar o token" ficam fixas embaixo da lista de jogadores, sem rolar junto.
- Tirado o código de compatibilidade com versões antigas do Foundry (o mínimo continua sendo o v14).

## v4.0.3

### Correções
- **Levar a outro mapa** voltou a funcionar: o token não era transferido e aparecia o erro "destino.tokens.flatMap is not a function" (o Foundry v14 não tem essa função na lista de tokens do mapa). Isso afetava o portal e a ação "Levar a outro mapa" do Objetos Vivos.

## v4.0.2

### Segurança
- As mensagens entre jogadores e mestre agora são conferidas pelo remetente real. Um jogador não consegue mais mandar outro jogador para um mapa, mudar o "último mapa" de outra pessoa, usar o portal com um token que não é dele nem se passar por outro jogador nas respostas. Só o mestre consegue puxar um jogador para um mapa.

### Correções
- **Grade hexagonal**: o ponto de chegada e as casas ao redor agora seguem a grade do mapa (quadrada ou hexagonal), e tokens grandes (2x2 etc.) não caem em cima de outros. A bandeirinha do ponto de chegada desenha o formato da casa.
- Se um jogador não confirmar que chegou ao mapa em até 2 minutos, o "entrando em..." dele some e o mestre recebe um aviso, em vez de ficar girando para sempre.
- "Liberar memória" não mostra mais "NaN MB": quando o Foundry não informa quantos MB foram liberados, o aviso diz só em quantos navegadores a limpeza foi feita.
- O módulo deixou de apagar notificações do Foundry por conta própria (as barras de "100%").
- Enviar um grupo grava a lista de mapas recentes uma vez só, em vez de uma vez por jogador.
- Ao excluir um mapa, o módulo solta o que guardava sobre ele (casas reservadas e registro de texturas).
- Erros que antes eram engolidos em silêncio agora aparecem no console (F12) com uma explicação.
- Tirado código que dependia de "níveis" de mapa, que não existem no Foundry.

### Outros
- README explica que ativar um mapa apaga o "último mapa" dos jogadores offline, e como funciona a cópia das faixas de música para jogadores sem acesso à playlist.
- Automação de release reescrita no formato explícito, `.gitignore` novo e link do README no module.json.

## v4.0.1

- Saiu o botão do Navegador da barra de ferramentas de tokens (à esquerda). O Navegador continua abrindo pelo botão ao lado da navegação de cenas e pelo atalho **Shift+M**.

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
