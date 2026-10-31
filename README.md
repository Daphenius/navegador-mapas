# Navegador de Mundos

## Sobre como este módulo foi feito

Sei que parte da comunidade não gosta de módulos produzidos com IA, então prefiro ser transparente: este foi desenvolvido com ajuda de IA. Não sou programador.

Tudo começou quando um amigo me disse: “cara, ficou muito mais simples, é só fazer uma macro do que você quer”. Fiz a macro para a minha mesa, fui adaptando conforme a necessidade dos jogos e, no fim, ela virou um módulo. Uso nas minhas próprias sessões e resolvi compartilhar caso seja útil para mais alguém.

Se encontrar bugs ou tiver sugestões, abra uma issue. Todo retorno é bem-vindo.

---

Um navegador de mapas para o mestre do **Foundry VTT**. Ele organiza os mapas em pastas, favoritos e grupos, permite deixar cada jogador num mapa diferente (como a *Player Page* do Roll20) e cria portais e gatilhos para o mundo reagir aos jogadores.

> **Testado no Foundry VTT v14 com o sistema D&D 5e**, nas minhas próprias sessões.
> Textos em português (Brasil) e inglês.

## Instalação

No Foundry, vá em **Configuração → Módulos → Instalar Módulo** e cole este link no campo *URL do Manifesto*:

```
https://github.com/Daphenius/navegador-mapas/releases/latest/download/module.json
```

Depois, ative o módulo no mundo em **Gerenciar Módulos**.

## Como abrir

Só o mestre usa o Navegador. Abra de qualquer um destes jeitos:
- pelo botão ao lado da barra de navegação de cenas;
- pela ferramenta na barra de controles de tokens;
- pelo atalho **Shift+M**.

## Funcionalidades

### Mapas e organização
- **Pastas e subpastas** de mapas. Arraste mapas e pastas para organizar e arraste um mapa sobre outro para mudar a ordem.
- **Favoritos** (estrela no cartão) e **mapas recentes** numa faixa no topo.
- **Etiquetas com cores** (combate, cidade, masmorra...) que viram filtros. O botão direito na etiqueta muda a cor.
- **Nota do mestre** em cada mapa, visível só na janela do mestre.
- Busca por nome do mapa, pasta, nota ou etiqueta.
- Gerar miniatura, duplicar, ativar, tirar da navegação e excluir, tudo pelo menu ⋮ ou pelo botão direito.

### Jogadores em mapas diferentes
- **Arraste o retrato de um jogador** até um mapa para mandar só ele para lá. Use Ctrl para selecionar vários.
- **Grupos salvos** ("Grupo A", "Grupo B") para quando a party se divide. Arraste o grupo até o mapa.
- **Pré-carregamento**: o mapa carrega no navegador do jogador antes da troca.
- **Levar o token junto**: o token do personagem vai para o **ponto de chegada** do mapa (veja abaixo), e vários tokens enviados juntos não se empilham.
- **Tela de transição**: o jogador vê o nome do mapa (o nome que os jogadores enxergam) sobre a miniatura desfocada enquanto o mapa carrega.
- **O jogador volta ao último mapa** em que estava ao recarregar (F5), sem carregar o mapa ativo antes.
- **Aviso de jogador sem token**: aparece quando um jogador está num mapa sem o token dele, com um botão para colocar o token ali.
- Indicador de quem está em cada mapa, inclusive dentro de pastas fechadas.

### Ponto de chegada
No menu ⋮ do mapa, use **Definir ponto de chegada** e clique no lugar. Os tokens chegam ali e nas casas ao redor. Só o mestre vê a bandeirinha laranja que marca o ponto.

### Música por mapa
Em **Nota, etiquetas e música**, escolha uma playlist nativa do Foundry para o mapa:
- **Só quem entrar no mapa**: toca no navegador de quem está naquele mapa e para quando a pessoa sai.
- **Todos**: o mestre toca a playlist para a mesa inteira.

### Portais
Em uma Região, adicione o comportamento **Portal (Navegador de Mundos)**. Escolha o mapa de destino e, se quiser, uma região de chegada e a confirmação do mestre. Quando o token entra na região, ele vai para o outro mapa com vida e efeitos, e o jogador dono vai junto.

### Gatilhos
Coloque um gatilho em **portas, tiles, luzes, sons, notas, desenhos e regiões** (tokens não). Abra a configuração do objeto e use a seção **Gatilho (Navegador de Mundos)**. Nas regiões, adicione o comportamento **Gatilho**.

**Quando dispara** (depende do objeto):
- token entra ou sai da área, ou clica nela (com distância máxima);
- porta abre, fecha ou é trancada;
- luz ou som é ligado ou desligado; tile aparece ou some;
- clique no alfinete da nota;
- início ou fim do turno de um token dentro da área;
- combate começa ou termina no mapa.

**Quem pode disparar:** qualquer um, só jogadores, só NPCs ou um personagem específico. Também dá para limitar o número de usos e pedir confirmação do mestre.

**Ações, em ordem:**

| Ação | O que faz |
|---|---|
| Efeito sonoro | Som curto (porta, botão, alavanca) para quem disparou, para o mapa ou para todos |
| Esperar | Pausa entre uma ação e outra |
| Portas | Abrir, fechar, trancar, destrancar ou alternar |
| Mostrar / esconder | Tiles, tokens, luzes, sons, notas e desenhos |
| Escuridão | Muda a escuridão do mapa, com animação |
| Levar para outro mapa | O token que disparou ou todos os jogadores, com a tela de transição |
| Mensagem no chat | Narração, sussurro ou só para o mestre. Aceita `{token}`, `{jogador}` e `{mapa}` |
| Abrir diário | Diário ou página na tela de quem precisa ver |
| Mostrar imagem | Imagem numa janela na tela de quem precisa ver |
| Mover a câmera | Leva a câmera até uma região |
| Música | Tocar ou parar uma playlist |
| Outro gatilho | Executar agora, ativar, desativar ou alternar |

Os gatilhos são executados pelo mestre conectado. Sem mestre online, eles não disparam.

### Memória
- **Liberar memória**: tira da memória os mapas em que ninguém está, no mestre e nos jogadores.
- Opção para descarregar automaticamente o mapa anterior ao trocar.

## Configurações do módulo
Em **Configurar Definições → Navegador de Mundos**:
- jogadores voltam ao último mapa;
- tela de transição (com fundo, só o nome ou desligada);
- descarregar automaticamente o mapa anterior;
- ocultar a barra de navegação de cenas para o mestre e/ou para os jogadores;
- ocultar a aba Cenas da barra lateral.

## API para macros

```js
const api = game.modules.get("navegador-mapas").api;
api.abrir();                                  // abre a janela (mestre)
api.enviar(userId, sceneId);                  // envia um ou vários jogadores (lista de ids) para um mapa
api.portal(token, sceneId, regiaoUuid);       // leva um token para outro mapa, como um portal
api.dispararGatilho(uuid);                    // executa o gatilho de um objeto ou região
api.editarGatilho(uuid);                      // abre o editor do gatilho
```

## English

**World Navigator** is a GM map browser for Foundry VTT. It has folders, favorites, tags and saved player groups. You can send each player to a different map by dragging their portrait (like Roll20's Player Page), with arrival points, a transition screen, per-map music, portals, and triggers on doors, tiles, lights, sounds, notes, drawings and regions. The interface is translated into English. Tested on Foundry VTT v14 with the D&D 5e system.

## Licença

[MIT](LICENSE) © Daphenius
