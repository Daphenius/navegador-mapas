// Navegador de Mundos — transição própria, registrada entre as transições nativas do Foundry 14.
// O Foundry guarda as transições de mapa em CONFIG.Canvas.sceneTransitions: cada uma tem um nome, uma
// duração padrão e um filtro (o programa da placa de vídeo que mistura o mapa antigo com o novo).
// Aqui entra mais uma, "Personalizada (Navegador de Mundos)", com um filtro nosso, feito em cima do
// filtro do próprio Foundry (mesmas texturas e o mesmo "progress" de 0 a 1). O estilo, a cor, a direção,
// a suavidade e o brilho vêm das configurações do módulo, lidas cada vez que a transição toca.

import { ID } from "./nucleo.js";

export const TIPO_PROPRIO = "nmPropria";
export const ESTILOS = ["cortina", "iris", "dissolver", "veu"];
export const DIRECOES = { direita: 0, baixo: 90, esquerda: 180, cima: 270, diagonal: 45 };
export const PADRAO_PROPRIA = { estilo: "cortina", cor: "#f0a03c", direcao: "direita", suave: 35, brilho: 60 };

// Como ficou o registro no Foundry: { ok, motivo }. A Central mostra isto, para o mestre saber se a
// transição está disponível e, se não estiver, por quê.
let estado = { ok: false, motivo: "ainda não registrada" };
export const estadoPropria = () => ({ ...estado });

// O nome que aparece nas listas (o mestre pode trocar na Central)
export function nomeProprio() {
  let nome = "";
  try { nome = String(game.settings.get(ID, "transicaoPropriaNome") ?? "").trim(); } catch { /* ainda não registrada */ }
  if (nome) return nome;
  try { return game.i18n.localize("NM.Transicao.Propria"); } catch { return "Personalizada (Navegador de Mundos)"; }
}

// Valores em teste na Central (ainda não salvos): valem no lugar dos gravados enquanto existirem
let previa = null;
export function definirPrevia(valores) { previa = valores ? { ...valores } : null; }

const ler = (chave, padrao) => { try { const v = game.settings.get(ID, chave); return v ?? padrao; } catch { return padrao; } };
export function opcoesProprias() {
  const salvo = {
    estilo: ler("transicaoPropriaEstilo", PADRAO_PROPRIA.estilo), cor: ler("transicaoPropriaCor", PADRAO_PROPRIA.cor),
    direcao: ler("transicaoPropriaDirecao", PADRAO_PROPRIA.direcao), suave: ler("transicaoPropriaSuave", PADRAO_PROPRIA.suave),
    brilho: ler("transicaoPropriaBrilho", PADRAO_PROPRIA.brilho)
  };
  return { ...salvo, ...(previa ?? {}) };
}

export function corParaRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? "").trim());
  const n = parseInt(m ? m[1] : PADRAO_PROPRIA.cor.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
const faixa = (v, min, max, padrao) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : padrao; };

// O que o filtro recebe (os "uniforms" do programa da placa de vídeo), a partir das opções
export function uniformesProprios(o = opcoesProprias()) {
  const estilo = ESTILOS.indexOf(o.estilo);
  return {
    nmEstilo: estilo < 0 ? 0 : estilo,
    nmCor: corParaRgb(o.cor),
    nmAngulo: ((DIRECOES[o.direcao] ?? 0) * Math.PI) / 180,
    nmSuave: 0.01 + (faixa(o.suave, 0, 100, PADRAO_PROPRIA.suave) / 100) * 0.6,
    nmBrilho: faixa(o.brilho, 0, 100, PADRAO_PROPRIA.brilho) / 100
  };
}

// O programa da transição. Usa só o que o filtro do Foundry já entrega: a imagem do mapa antigo
// (uSampler), a do mapa novo (targetTexture) e o progresso de 0 a 1.
export function programaProprio(precisao = "mediump") {
  return `
    precision ${precisao} float;
    uniform float progress;
    uniform sampler2D uSampler;
    uniform sampler2D targetTexture;
    uniform vec4 tintAlpha;
    uniform mat3 targetUVMatrix;
    uniform float opaque;
    uniform vec4 backgroundColor;
    uniform int nmEstilo;
    uniform vec3 nmCor;
    uniform float nmAngulo;
    uniform float nmSuave;
    uniform float nmBrilho;

    varying vec2 vTextureCoord;
    varying vec2 vFilterCoord;

    float nmDentro(in vec2 uv) {
      return step(3.5, step(0.0, uv.x) + step(0.0, uv.y) + step(uv.x, 1.0) + step(uv.y, 1.0));
    }
    vec4 nmAntigo() { return texture2D(uSampler, vTextureCoord); }
    vec4 nmNovo() { return texture2D(targetTexture, (targetUVMatrix * vec3(vFilterCoord, 1.0)).xy) * nmDentro(vFilterCoord); }
    float nmAcaso(in vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

    /* Quanto do mapa novo aparece em cada ponto (0 = só o antigo, 1 = só o novo) */
    float nmMascara() {
      vec2 uv = vFilterCoord;
      float p = progress * (1.0 + nmSuave);
      float d;
      if ( nmEstilo == 1 ) {
        d = distance(uv, vec2(0.5)) / 0.7072;
      } else if ( nmEstilo == 2 ) {
        d = nmAcaso(floor(uv * vec2(192.0, 108.0)));
      } else {
        vec2 dir = vec2(cos(nmAngulo), sin(nmAngulo));
        d = dot(uv - 0.5, dir) / (abs(dir.x) + abs(dir.y)) + 0.5;
      }
      return 1.0 - smoothstep(p - nmSuave, p, d);
    }

    void main() {
      vec4 antigo = nmAntigo();
      vec4 novo = nmNovo();
      vec4 result;
      if ( nmEstilo == 3 ) {
        /* Véu: o mapa antigo some na cor escolhida e o novo surge dela */
        vec4 veu = vec4(nmCor, 1.0);
        result = progress < 0.5 ? mix(antigo, veu, progress * 2.0) : mix(veu, novo, (progress - 0.5) * 2.0);
      } else {
        float m = nmMascara();
        result = mix(antigo, novo, m);
        /* Brilho na borda entre os dois mapas, na cor escolhida */
        float borda = m * (1.0 - m) * 4.0;
        result.rgb += nmCor * borda * nmBrilho * result.a;
      }
      result *= tintAlpha;
      if ( opaque > 0.5 ) {
        vec4 bg = backgroundColor;
        result.rgb = result.rgb + (bg.rgb * bg.a) * (1.0 - result.a);
        result.a = 1.0;
      }
      gl_FragColor = result;
    }
    `;
}

// Cria o filtro em cima do filtro de transição do Foundry e põe a transição no registro oficial.
// Chamado no init, antes de registrar as configurações. Devolve true se registrou; o resultado
// (e o motivo, se falhou) fica em estadoPropria().
export function registrarTransicaoPropria() {
  const falhou = motivo => { estado = { ok: false, motivo }; console.warn(`${ID} | transição: a personalizada não foi registrada (${motivo})`); return false; };
  try {
    const registro = globalThis.CONFIG?.Canvas?.sceneTransitions;
    if (!registro || typeof registro !== "object") return falhou("este Foundry não tem o registro de transições (CONFIG.Canvas.sceneTransitions)");
    if (registro[TIPO_PROPRIO]) { estado = { ok: true, motivo: "" }; return true; }
    const modelo = registro.fade ?? Object.values(registro).find(v => typeof v?.filterClass === "function");
    const Base = modelo?.filterClass;
    if (typeof Base !== "function") return falhou("as transições do Foundry não têm um filtro para servir de base");

    class FiltroTransicaoNM extends Base {
      // O Foundry escolhe a animação pelo "type" do filtro. A nossa não está na lista interna dele:
      // por dentro o filtro fica no tipo simples (sem margem extra) e o desenho é o do nosso programa.
      get type() { return TIPO_PROPRIO; }
      set type(_tipo) { super.type = modelo.filterType ?? "fade"; }

      static get defaultUniforms() { return { ...super.defaultUniforms, type: 0, ...uniformesProprios() }; }

      static _createFragmentShader() {
        return programaProprio(globalThis.PIXI?.Program?.defaultFragmentPrecision ?? "mediump");
      }
    }

    const definicao = { id: TIPO_PROPRIO, filterClass: FiltroTransicaoNM, filterType: TIPO_PROPRIO, defaultDuration: 1500 };
    // o nome é lido na hora, então a troca feita na Central aparece sem recarregar
    Object.defineProperty(definicao, "label", { enumerable: true, get: nomeProprio });
    // 1ª tentativa: acrescentar no registro. Se ele for protegido contra mudanças, troca o registro
    // inteiro por uma cópia com a nossa transição a mais.
    try { registro[TIPO_PROPRIO] = definicao; } catch { /* registro protegido */ }
    if (CONFIG.Canvas.sceneTransitions[TIPO_PROPRIO] !== definicao) {
      try { CONFIG.Canvas.sceneTransitions = { ...registro, [TIPO_PROPRIO]: definicao }; } catch { /* também protegido */ }
    }
    if (CONFIG.Canvas.sceneTransitions?.[TIPO_PROPRIO] !== definicao) return falhou("o Foundry não deixou acrescentar uma transição ao registro dele");
    estado = { ok: true, motivo: "" };
    return true;
  } catch (err) {
    console.warn(`${ID} | transição:`, err);
    return falhou(String(err?.message ?? err));
  }
}

// Acha o recipiente de transições do Foundry (o que toca a animação entre dois mapas)
function recipienteDeTransicao() {
  const Classe = foundry.canvas?.TransitionContainer;
  const serve = v => v && typeof v.run === "function" && (!Classe || v instanceof Classe);
  for (const nome of ["transition", "transitions", "sceneTransition", "transitionContainer"]) if (serve(canvas?.[nome])) return canvas[nome];
  if (!Classe) return null;
  const visitar = (no, fundo) => {
    if (!no) return null;
    if (no instanceof Classe) return no;
    if (fundo <= 0) return null;
    for (const filho of no.children ?? []) { const achou = visitar(filho, fundo - 1); if (achou) return achou; }
    return null;
  };
  return visitar(canvas?.app?.stage ?? canvas?.stage, 3);
}

// Toca a transição no mapa aberto, sem trocar de mapa (o Foundry sai do preto e volta ao mapa).
// Devolve "" se tocou, ou o motivo de não ter tocado.
export async function testarTransicao(tipo = TIPO_PROPRIO, duracao = 1500) {
  if (!canvas?.ready) return "sem-mapa";
  const recipiente = recipienteDeTransicao();
  if (!recipiente) return "sem-recipiente";
  try {
    await recipiente.run({ fromBlack: true, duration: duracao, transitionType: tipo });
    return "";
  } catch (err) {
    console.warn(`${ID} | transição: o teste falhou`, err);
    return "erro";
  }
}
