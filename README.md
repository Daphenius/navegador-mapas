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
- **Transição nativa**: ao enviar um jogador, o mapa troca com a animação de transição do próprio Foundry 14 (a do mapa de destino ou uma padrão escolhida nas configurações). Se a nativa não puder ser usada, a tela própria do módulo entra no lugar, e o motivo fica registrado no console (F12).
- **Tela de transição própria** (opcional): o jogador vê o nome do mapa (o nome que os jogadores enxergam) sobre a miniatura desfocada enquanto o mapa carrega. Em **Nota, etiquetas e música** de cada mapa dá para trocar o título, escrever um comentário que aparece abaixo dele e mudar (ou tirar) o texto de carregamento, com um botão de prévia. A tela fica um tempo mínimo (configurável) para a animação aparecer inteira mesmo quando o mapa carrega rápido.
- **O jogador volta ao último mapa** em que estava ao entrar ou recarregar (F5), sem carregar o mapa ativo antes. A única exceção é **"Ativar mapa"** (menu ⋮), que leva a mesa toda: quem está conectado vai na hora, e quem está offline entra no mapa ativo quando conectar. Enviar jogadores pelo Navegador nunca mexe no último mapa dos outros.
- **Aviso de jogador sem token**: aparece quando um jogador está num mapa sem o token dele, com um botão para colocar o token ali.
- Indicador de quem está em cada mapa, inclusive dentro de pastas fechadas.

### Ponto de chegada
No menu ⋮ do mapa, use **Definir ponto de chegada** e clique no lugar.

**Área de chegada:** em *Configurar Definições → Navegador de Mundos → Tamanho da área de chegada*, o mestre escolhe quantos anéis de casas em volta da bandeira formam a área (de 0 a 5). Cada token que chega ocupa uma casa da área, do centro para fora:

| Tamanho | Grade hexagonal | Grade quadrada |
|---|---|---|
| 0 (padrão) | só o hexágono da bandeira | só o quadrado da bandeira |
| 1 | 7 hexágonos | 9 quadrados |
| 2 | 19 hexágonos | 25 quadrados |
| 3 | 37 hexágonos | 49 quadrados |

O mestre vê a área desenhada em laranja, com a casa da bandeira mais forte. Com a área cheia, os próximos tokens ficam na casa livre mais perto, fora dela, e o mestre recebe um aviso. A área vale só para a bandeira: num portal com Região, o token vai para o centro da Região.

Os tokens chegam nas casas livres, sem sair da área do mapa e sem cair em cima de outro token. Isso vale para tokens de qualquer tamanho na grade quadrada. Na grade hexagonal, o módulo usa o retângulo do token, o que às vezes deixa uma casa a mais de folga. Esse caso ainda não foi testado a fundo no Foundry. Se não houver casa livre por perto, o token fica no ponto de chegada e o mestre recebe um aviso. Um token maior que o próprio mapa não é levado: ele continua onde estava, e o mestre é avisado. Só o mestre vê a bandeirinha laranja que marca o ponto.

### Música por mapa
Em **Nota, etiquetas e música**, escolha uma playlist nativa do Foundry para o mapa:
- **Só quem entrar no mapa**: toca no navegador de quem está naquele mapa e para quando a pessoa sai.
- **Todos**: o mestre toca a playlist para a mesa inteira.

No modo "só quem entrar no mapa", a lista de faixas é lida da playlist quando a música começa, ou seja, quando o jogador entra no mapa. Se você mudar as faixas depois, a mudança vale da próxima vez que a música começar. Jogadores que **não têm permissão de ver a playlist** também ouvem: o navegador deles pede as faixas ao mestre conectado. Se o mestre não responder em 10 segundos, fica em silêncio. No modo "todos", quem toca é a própria playlist do Foundry, então qualquer mudança vale na hora.

### Objetos interativos e gatilhos
Os gatilhos e portais que existiam até a v3.3 saíram deste módulo. Agora ficam no módulo **[Objetos Vivos](https://github.com/Daphenius/objetos-vivos)**, que transforma tiles, portas e paredes em objetos com ações. Com o Navegador ativo, o Objetos Vivos ganha a ação "Levar a outro mapa".

### Memória
O Navegador **pré-carrega** o mapa no navegador do jogador antes da troca. Quem tira da memória os mapas que ficaram sem uso é o próprio Foundry, sozinho, como em qualquer mundo.

## Configurações do módulo
Em **Configurar Definições → Navegador de Mundos → Abrir a Central de Configurações** (só o mestre). A Central é uma janela própria, em três abas (Geral, Transição, Barras e abas), e só grava o que mudou quando você clica em **Salvar alterações**:
- jogadores voltam ao último mapa;
- transição (nativa do Foundry, tela própria com fundo, só o nome ou desligada), transição nativa padrão e duração, texto de carregamento padrão e tempo mínimo da tela;
- tamanho da área de chegada em volta da bandeira (0 a 5 anéis de casas);
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

## Testes

A pasta `testes/` tem testes automáticos da lógica (transferência de tokens, envios simultâneos, respostas fora de ordem, casas livres, área de chegada, música, socket, transição no envio e Central de Configurações), rodando num Foundry simulado. Para rodar, na pasta do módulo: `node --test`. Eles não substituem testar no Foundry real e não vão no pacote do módulo.

## Licença

[MIT](LICENSE) © Daphenius
