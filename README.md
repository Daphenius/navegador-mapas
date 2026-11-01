# Navegador de Mundos (Em testes)

## Sobre como este módulo foi feito

Sei que parte da comunidade não gosta de módulos produzidos com IA, então prefiro ser transparente: este foi desenvolvido com ajuda de IA. Não sou programador.

Tudo começou quando um amigo me disse: “cara, ficou muito mais simples, é só fazer uma macro do que você quer”. Fiz a macro para a minha mesa, fui adaptando conforme a necessidade dos jogos e, no fim, ela virou um módulo. Uso nas minhas próprias sessões e resolvi compartilhar caso seja útil para mais alguém.

Se encontrar bugs ou tiver sugestões, abra uma issue. Todo retorno é bem-vindo.

> [!WARNING]
> **Módulo em testes.** Ainda não está completo e pode ter muitos erros e vícios de IA. Use com cuidado, faça backup do mundo antes de instalar e, se algo der errado, abra uma issue.

---

Um navegador de mapas para o mestre do **Foundry VTT**. Ele organiza os mapas em pastas, favoritos, etiquetas e grupos e permite deixar cada jogador num mapa diferente (como a *Player Page* do Roll20), com ponto de chegada, tela de transição e música por mapa.

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
- **O jogador volta ao último mapa** em que estava ao recarregar (F5), sem carregar o mapa ativo antes. Atenção: **ativar um mapa** (menu ⋮ → "Ativar mapa") vale para a mesa toda e apaga o "último mapa" guardado dos jogadores que estão offline — quando eles conectarem, entram no mapa ativo, não no que estavam antes.
- **Aviso de jogador sem token**: aparece quando um jogador está num mapa sem o token dele, com um botão para colocar o token ali.
- Indicador de quem está em cada mapa, inclusive dentro de pastas fechadas.

### Ponto de chegada
No menu ⋮ do mapa, use **Definir ponto de chegada** e clique no lugar. Os tokens chegam ali e nas casas ao redor, respeitando a grade do mapa (quadrada ou hexagonal) e o tamanho de cada token. Só o mestre vê a bandeirinha laranja que marca o ponto.

### Música por mapa
Em **Nota, etiquetas e música**, escolha uma playlist nativa do Foundry para o mapa:
- **Só quem entrar no mapa**: toca no navegador de quem está naquele mapa e para quando a pessoa sai.
- **Todos**: o mestre toca a playlist para a mesa inteira.

A lista de faixas é lida da playlist na hora de tocar. Para jogadores que **não têm permissão de ver a playlist**, o módulo usa uma cópia das faixas guardada no mapa quando você salvou os detalhes: se mudar as faixas depois, abra **Nota, etiquetas e música** de novo e salve, para a cópia atualizar.

### Objetos interativos e gatilhos
Os gatilhos e portais que existiam até a v3.3 saíram deste módulo. Agora ficam no módulo **[Objetos Vivos](https://github.com/Daphenius/objetos-vivos)**, que transforma tiles, portas e paredes em objetos com ações. Com o Navegador ativo, o Objetos Vivos ganha a ação "Levar a outro mapa".

### Memória
- **Liberar memória**: tira da memória os mapas em que ninguém está, no mestre e nos jogadores. O aviso mostra quantos MB foram liberados quando o Foundry informa esse número; se não informar, mostra só em quantos navegadores a limpeza foi feita.
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
api.portal(token, sceneId, regiaoUuid);       // leva um token (e os jogadores donos dele) para outro mapa
```

## English

**World Navigator** *(in testing — not complete yet and may contain many bugs and AI quirks)* is a GM map browser for Foundry VTT. It has folders, favorites, tags and saved player groups. You can send each player to a different map by dragging their portrait (like Roll20's Player Page), with arrival points, a transition screen and per-map music. Triggers and interactive objects now live in the separate **Living Objects** (objetos-vivos) module. The interface is translated into English. Tested on Foundry VTT v14 with the D&D 5e system.

## Licença

[MIT](LICENSE) © Daphenius
