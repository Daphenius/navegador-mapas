// Navegador de Mundos — barra de navegação de cenas: botão do Navegador e opções de ocultar

import { t, cfg, navEl } from "./nucleo.js";
import { abrir } from "./janela.js";

// Navegação de cenas: botão e opções de ocultar
export function injetarBotaoNav() {
  const nav = navEl();
  if (!nav) return;
  nav.classList.add("nm-nav");
  if (!game.user?.isGM || nav.querySelector(".nm-nav-botao")) return;
  const b = document.createElement("button");
  b.type = "button";
  b.className = "nm-nav-botao ui-control icon fa-solid fa-map-location-dot";
  b.dataset.tooltip = t("Nav.Botao");
  b.setAttribute("aria-label", t("Titulo"));
  b.addEventListener("click", ev => { ev.preventDefault(); ev.stopPropagation(); abrir(); });

  // Encaixa o botão ao lado do ▼ para não empurrar o nome do mapa para outra linha
  const expandir = nav.querySelector('[data-action="toggleExpand"]');
  if (expandir?.parentElement) {
    const grupo = document.createElement("span");
    grupo.className = "nm-nav-grupo";
    expandir.replaceWith(grupo);
    grupo.append(b, expandir);
    return;
  }
  // Sem o ▼: botão flutuando ao lado da barra
  if (getComputedStyle(nav).position === "static") nav.style.position = "relative";
  b.classList.add("nm-nav-flutuante");
  nav.append(b);
}

export function aplicarOcultarNav() {
  if (!game.user) return;
  document.body.classList.toggle("nm-ocultar-nav-mestre", game.user.isGM && cfg("ocultarNavMestre"));
  document.body.classList.toggle("nm-ocultar-nav-jogador", !game.user.isGM && cfg("ocultarNavJogadores"));

  const ocultarAba = !!cfg("ocultarAbaCenas");
  document.body.classList.toggle("nm-ocultar-aba-cenas", ocultarAba);
  // Se a aba Cenas estava aberta, volta para o Chat
  if (ocultarAba && ui.sidebar?.tabGroups.primary === "scenes") ui.sidebar.changeTab("chat", "primary");
}
