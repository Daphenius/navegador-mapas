// Navegador de Mundos — estilo da tela de transição.
// Como na v3.2.0, o estilo da tela é colocado na página pelo próprio módulo (uma tag <style>), em vez de
// vir do arquivo styles/navegador.css. Assim ele não depende de como o Foundry carrega os estilos dos
// módulos. As regras da tela, do nome, da linha e do "Carregando" são as mesmas da v3.2.0; o comentário
// do mapa (4.5.2) e a entrada imediata (4.10.0) vêm depois.

export const ID_ESTILO_TELA = "nm-estilo-transicao";

export const CSS_TELA = `
.nm-transicao { position: fixed; inset: 0; z-index: 2147483000; background: #000; overflow: hidden;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  opacity: 0; transition: opacity .5s ease; pointer-events: all; }
.nm-transicao.visivel { opacity: 1; }
.nm-transicao-fundo { position: absolute; inset: -30px; background: center/cover no-repeat; filter: blur(14px) brightness(.35); }
.nm-transicao-nome { position: relative; padding: 0 30px; text-align: center; color: #f3e9d2; font-size: clamp(36px, 6vw, 72px);
  font-family: "Modesto Condensed", "Signika", serif; letter-spacing: 2px; text-shadow: 0 0 24px #000, 0 0 6px #000;
  animation: nm-surgir 1.4s ease both; }
.nm-transicao-linha { position: relative; width: min(420px, 60vw); height: 1px; margin: 14px 0 10px;
  background: linear-gradient(90deg, transparent, #f3e9d2aa, transparent); animation: nm-surgir 1.4s .2s ease both; }
.nm-transicao-sub { position: relative; color: #ddd; opacity: .7; font-size: 15px; letter-spacing: 3px; text-transform: uppercase;
  animation: nm-pulsar 1.6s ease-in-out infinite; }
@keyframes nm-surgir { from { opacity: 0; transform: translateY(8px); letter-spacing: 8px; } to { opacity: 1; transform: none; } }
@keyframes nm-pulsar { 50% { opacity: .3; } }
.nm-transicao-comentario { position: relative; max-width: min(720px, 80vw); margin: 0 0 14px; padding: 0 30px; text-align: center;
  color: #e8dfc9; font-size: clamp(16px, 2vw, 22px); font-style: italic; line-height: 1.4; white-space: pre-line;
  text-shadow: 0 0 12px #000, 0 0 4px #000; animation: nm-surgir 1.4s .4s ease both; }
.nm-transicao.imediata { transition: none; }
`;

// Põe o estilo na página (uma vez só). Chamado ao carregar o módulo e de novo antes de cada tela,
// para o caso de algo ter tirado a tag da página.
export function injetarEstiloTela() {
  try {
    if (document.getElementById(ID_ESTILO_TELA)) return;
    const st = document.createElement("style");
    st.id = ID_ESTILO_TELA;
    st.textContent = CSS_TELA;
    document.head.appendChild(st);
  } catch { /* sem página (testes): nada a fazer */ }
}
