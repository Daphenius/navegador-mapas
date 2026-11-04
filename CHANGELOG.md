# Changelog

## v4.7.0

### Novidade: Central de Configurações
- As opções do módulo saíram da lista comprida do Foundry e ganharam uma janela própria, simples, em três abas: **Geral** (jogadores e ponto de chegada), **Transição** e **Barras e abas**. Ela abre em *Configurar Definições > Navegador de Mundos > Abrir a Central de Configurações* (só o mestre).
- Interruptores, listas e barras deslizantes com o valor ao lado. Opções que dependem de outra ficam apagadas, com o motivo escrito (por exemplo, a transição nativa padrão só vale quando o tipo escolhido é a nativa).
- Nada é gravado até clicar em **Salvar alterações**. O rodapé mostra quantas mudanças estão pendentes, e fechar a janela com mudanças não salvas pergunta antes.
- As configurações são as mesmas de antes, com os mesmos valores: nada precisa ser refeito. A janela acompanha o tema claro ou escuro do Foundry.

Também traz as correções da terceira revisão externa (4/11/2026), no envio com a transição nativa.

### Correções
- **Jogador sem nenhuma transição no modo "Transição nativa do Foundry"**: quando a nativa não podia ser usada, o mapa trocava seco, sem animação nenhuma. A tela do módulo era chamada como reserva, mas ela mesma se recusava a aparecer porque o modo escolhido era "nativa". Agora a tela do módulo (título, comentário e miniatura) entra no lugar sempre que:
  - nem o mapa nem as configurações têm um tipo de transição que este Foundry conheça;
  - o Foundry recusa a animação na hora da troca (antes o mapa trocava sem nada).
- **Tipos de transição conferidos com o Foundry**: a lista agora vem do registro oficial do Foundry 14 (`CONFIG.Canvas.sceneTransitions`); se ele não existir, das opções do campo do mapa, como antes. Um tipo que não está na lista não é mais mandado para o Foundry: se o problema é o tipo do mapa, vale a transição padrão das configurações; se é a padrão, vale a tela do módulo.
- Quando a troca de mapa falha, o módulo para de esperar o mapa desenhar na hora (ficava com um gancho pendurado por até 80 segundos).

### Diagnóstico
- O console do jogador (F12) passa a dizer o que aconteceu, sempre começando com `navegador-mapas | transição:`. Aviso quando a nativa não pôde ser usada, com o motivo (mapa sem transição, tipo desconhecido, recusada pelo Foundry), e uma linha de depuração com o tipo, a duração e de onde ela veio quando foi usada.

### Não mudou
- Tela do módulo nos modos "Nome com a miniatura" e "Só o nome", modo "Desligada", prévia, API, transferência de tokens, música e permissões.
- **Ver** e **Ativar** no menu do mapa continuam sendo os comandos do próprio Foundry. A transição do Navegador aparece para o jogador que é enviado (ou passa por um portal), não para o mestre.

### Por dentro
- 21 testes novos (56 no total): 6 da Central de Configurações (nenhuma opção perdida, registro igual, validação, textos nas duas línguas) e 15 para os modos nativa, tela do módulo e desligada, incluindo as falhas da nativa e o caminho do socket que o jogador recebe (envio individual, grupo e portal chegam pelo mesmo caminho). 8 deles falhavam na v4.6.0.

## v4.6.0

### Novidades
- **Transição nativa do Foundry no envio**: nova opção "Transição nativa do Foundry" em *Tela de transição* (passa a ser o padrão em mundos que nunca mexeram nessa opção). Quando o mestre envia um jogador ou ele passa por um portal, o mapa troca com a animação do próprio Foundry 14:
  - a do mapa de destino, se ele tiver uma em *Configurar mapa > Transition Animation* (toca mesmo com "Active Only" marcado);
  - se o mapa não tiver, a **Transição nativa padrão** escolhida nas configurações do módulo, com a duração definida lá.
- A lista de transições é lida do próprio Foundry, então novos tipos aparecem sozinhos.
- A tela própria do módulo (título, comentário e texto de carregamento) continua disponível nas opções "Nome com a miniatura" e "Só o nome". O botão de prévia continua mostrando essa tela.

## v4.5.2

### Novidades
- **Textos da tela de transição por mapa**: em "Nota, etiquetas e música" há uma parte nova, "Tela de transição", com **Título** (em branco: o nome do mapa), **Comentário** abaixo do título (aceita mais de uma linha), **Texto de carregamento** e a opção de não mostrar texto de carregamento. O botão **Ver prévia** mostra a tela para o mestre com o que está no formulário, sem trocar de mapa.
- **Texto de carregamento padrão** (nova configuração): troca o "Carregando" de todos os mapas que não têm um texto próprio.
- **Tempo mínimo da transição** (nova configuração, padrão 3 segundos): mesmo que o mapa carregue rápido, a tela fica esse tempo depois de escurecer, e a animação aparece inteira. Se o mapa demorar mais, ela fica até ele terminar.
- A animação ficou mais cuidada: o nome e a linha só começam a surgir quando a tela já está escurecendo (antes podiam rodar com a tela ainda transparente), a miniatura ao fundo faz uma leve aproximação e, na saída, o nome some junto com a tela, sem desaparecer de repente.

### Correções
- **Tela de transição (carregando)**: voltou a aparecer quando o mestre envia um jogador ou quando ele passa por um portal.
  - Ela dependia de um recurso do navegador que fica parado quando a aba do Foundry está em segundo plano. Nesses casos a tela era criada, mas ficava transparente, e o jogador via o mapa trocar sem transição.
  - A tela também podia sumir antes da hora: o módulo via o mapa antigo ainda "pronto" e liberava a tela enquanto o novo ainda carregava. Agora ela espera o mapa de destino terminar de desenhar (até 80 segundos; se travar, some sozinha em 90).

## v4.5.1

Correções a partir da segunda revisão externa (2/11/2026).

### Correções
- **Dois envios rápidos do mesmo personagem para mapas diferentes** (por exemplo, para B e logo em seguida para C) não deixam mais um token em cada mapa. Um envio mais novo substitui o que ainda estava esperando, e cada transferência procura o token onde o módulo o deixou por último, não na origem antiga. No fim fica um token só, no último destino.
- **Token maior que o mapa** (por exemplo, um 3x3 num mapa de 2x2 casas) não é mais criado saindo pela borda. A transferência para antes de criar qualquer coisa, o token continua onde estava e o mestre é avisado.

### Por dentro
- 4 testes novos (35 no total), que reproduzem os dois casos e falhavam na v4.5.0.

## v4.5.0

### Novidade: área de chegada
- Nova configuração do mundo, **Tamanho da área de chegada** (0 a 5). O mestre escolhe quantos anéis de casas em volta da bandeira formam a área onde os tokens chegam. Na grade hexagonal, 1 = 7 hexágonos, 2 = 19, 3 = 37. Na quadrada, 1 = 9 quadrados, 2 = 25.
- Cada token que chega ocupa um hexágono (ou quadrado) da área, do centro para fora. Com a área cheia, os próximos ficam na casa livre mais perto e o mestre é avisado.
- O mestre vê a área inteira desenhada no mapa, com a casa da bandeira mais forte. Mudar a configuração redesenha na hora.
- O padrão é 0, que é igual a antes: só a casa da bandeira, e os outros tokens nas casas livres mais próximas.
- A busca de casa livre agora anda em anéis de verdade na grade hexagonal (antes usava um "quadrado" de casas, que no hexágono ficava torto).

Correções a partir de uma revisão externa do código (2/11/2026).

### Correções
- **Levar token a outro mapa sem duplicar.** Se o Foundry não conseguir apagar o token no mapa de origem, a cópia criada no destino é desfeita e o mestre é avisado. Se nem isso der certo, aparece um aviso fixo dizendo qual token ficou em quais dois mapas, para você apagar um deles à mão. Nesses casos o portal não segue como se tivesse dado certo.
- **Dois jogadores com o mesmo personagem** enviados juntos (em grupo ou "puxar todos") não criam mais dois tokens. O personagem é levado uma vez só, e os dois jogadores vão para o mapa.
- **Respostas atrasadas não bagunçam o envio seguinte.** Cada envio agora tem um identificador próprio, e só a resposta daquele envio conclui ou cancela o "entrando em...". Antes, uma confirmação atrasada de um envio anterior podia marcar o jogador como já chegado ao mapa novo.
- **Tokens grandes não saem mais do mapa.** A casa de chegada é escolhida de modo que o token inteiro caiba na área do mapa, e não só o centro dele. Sem casa livre por perto, o mestre recebe um aviso.
- **Música ao trocar de mapa.** Quando o jogador entra num mapa com outra música, a anterior para na hora, sem esperar o mestre mandar as faixas novas. Se o mestre não responder em 10 segundos, fica em silêncio. Se a playlist do mapa foi apagada, o mestre avisa na hora e a música não começa.

### Segurança
- O socket agora descarta mensagens com argumentos a mais. Antes, um jogador podia emitir uma mensagem com um id falso de remetente na segunda posição e se passar pelo mestre, porque o Foundry acrescenta o id verdadeiro **depois** dos argumentos enviados.

### Textos corrigidos
- A v4.4.0 dizia que mudar a playlist "vale na hora" no modo "só quem entrar". Na verdade, as faixas são lidas quando a música começa. O README agora explica isso direito.
- A v4.0.2 dizia que tokens grandes nunca caem em cima de outros. Isso vale na grade quadrada. Na hexagonal o cálculo agora usa o retângulo do token e é folgado, mas ainda não foi testado a fundo no Foundry. O README diz isso.

### Por dentro
- Nova pasta `testes/` com 31 testes automáticos (Foundry simulado, `node --test`). Eles cobrem transferências com falha, envios simultâneos, respostas fora de ordem, tokens de vários tamanhos nas quatro bordas, mapa sem espaço, música, remetente forjado e a área de chegada (numa grade hexagonal simulada). 14 dos testes de correção falhavam na v4.4.0.

## v4.4.0

### Música por mapa
- As faixas agora são sempre lidas da playlist **na hora de tocar**. Mudou a playlist? Vale na hora, sem precisar salvar os detalhes do mapa de novo.
- Jogadores sem permissão de ver a playlist continuam ouvindo: o navegador deles pede as faixas ao mestre conectado, que manda só para quem pediu.
- O módulo não guarda mais uma cópia das faixas no mapa. A cópia antiga, que ficava desatualizada, é apagada quando você salva os detalhes do mapa. Enquanto isso não acontece, ela só é usada se não houver mestre conectado.

### "Ativar mapa" e o último mapa do jogador
- O comportamento continua o mesmo, mas agora o código, a configuração e o README dizem a mesma coisa: o jogador sempre volta ao último mapa, **exceto** depois de "Ativar mapa", que leva a mesa toda. Quem estava offline entra no mapa ativo quando conectar.
- Os jogadores offline são atualizados todos de uma vez, e um erro em um deles não impede os outros.

### Por dentro
- Os tempos e limites que estavam soltos no código (trava da música, portais, reservas de casa, tela de transição, ping, busca etc.) viraram constantes com nome e uma linha explicando cada uma.
- A tela de transição não pendura mais dados no próprio elemento da página.
- Quando há mais de um mestre conectado, as mensagens enviadas aos jogadores não geram mais avisos no console do outro mestre.
- Cada arquivo só exporta o que os outros realmente usam.

## v4.3.0

### Removido: "Liberar memória"
- Saíram o botão de vassoura da janela, a opção "Descarregar da memória" do menu do mapa e a configuração "Descarregar automaticamente o mapa anterior".
- **Por quê:** para tirar da memória só as texturas de um mapa, o módulo precisava mexer em partes internas do Foundry: trocava uma função do carregador de texturas para anotar o que entrava, mudava o prazo de validade do cache e lia um contador de memória que não é oficial. Isso pode quebrar sem aviso em qualquer atualização do Foundry. A parte oficial do Foundry só sabe descartar o que está sem uso há algum tempo, sem escolher o mapa, e é exatamente o que o Foundry já faz sozinho. Um botão que só repetisse isso não valeria a pena.
- O **pré-carregamento** continua igual: o mapa carrega no navegador do jogador antes da troca.
- Se você tinha marcado "Descarregar automaticamente o mapa anterior", não precisa fazer nada: a opção some das configurações.

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
