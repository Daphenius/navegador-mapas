// Navegador de Mundos — mapa da Central de Configurações.
// Só diz ONDE cada configuração aparece (aba, seção) e de qual outra ela depende.
// Nome, dica, tipo, padrão, opções e onChange continuam vindo do registro original
// (registrarConfig em nucleo.js): esta lista não é uma segunda fonte de verdade.
//   chave    id da configuração em game.settings (nunca renomear: os valores salvos ficam)
//   depende  { chave, quando(valor), texto } — o campo fica desligado enquanto a condição não vale

const soNativa = { chave: "transicao", quando: v => v === "nativa", texto: "Central.DependeNativa" };
const comTela = { chave: "transicao", quando: v => v !== "off", texto: "Central.DependeTela" };

export const ABAS_CENTRAL = [
  {
    id: "geral", rotulo: "Central.Aba.Geral", icone: "fa-compass", lema: "Central.Lema.Geral",
    secoes: [
      { id: "jogadores", titulo: "Central.Secao.Jogadores", icone: "fa-users", campos: [{ chave: "lembrarLugar" }] },
      { id: "chegada", titulo: "Central.Secao.Chegada", icone: "fa-flag", campos: [{ chave: "areaChegada" }] }
    ]
  },
  {
    id: "transicao", rotulo: "Central.Aba.Transicao", icone: "fa-wand-magic-sparkles", lema: "Central.Lema.Transicao",
    secoes: [
      { id: "modo", titulo: "Central.Secao.Modo", icone: "fa-shuffle", campos: [{ chave: "transicao" }] },
      { id: "nativa", titulo: "Central.Secao.Nativa", icone: "fa-film", campos: [
        { chave: "transicaoNativaTipo", depende: soNativa },
        { chave: "transicaoNativaDuracao", depende: soNativa }
      ] },
      { id: "propria", titulo: "Central.Secao.Propria", icone: "fa-palette", nota: "Central.NotaPropria",
        botao: { acao: "testarTransicao", rotulo: "Central.Testar", icone: "fa-play" }, campos: [
        { chave: "transicaoPropriaEstilo" },
        { chave: "transicaoPropriaCor", cor: true },
        { chave: "transicaoPropriaDirecao", depende: { chave: "transicaoPropriaEstilo", quando: v => v === "cortina", texto: "Central.DependeCortina" } },
        { chave: "transicaoPropriaSuave", depende: { chave: "transicaoPropriaEstilo", quando: v => v !== "veu", texto: "Central.DependeBorda" } },
        { chave: "transicaoPropriaBrilho", depende: { chave: "transicaoPropriaEstilo", quando: v => v !== "veu", texto: "Central.DependeBorda" } }
      ] },
      { id: "tela", titulo: "Central.Secao.Tela", icone: "fa-image", campos: [
        { chave: "transicaoTexto", depende: comTela },
        { chave: "transicaoTempo", depende: comTela }
      ] }
    ]
  },
  {
    id: "interface", rotulo: "Central.Aba.Interface", icone: "fa-eye-slash", lema: "Central.Lema.Interface",
    secoes: [
      { id: "barra", titulo: "Central.Secao.Barra", icone: "fa-bars", campos: [{ chave: "ocultarNavMestre" }, { chave: "ocultarNavJogadores" }] },
      { id: "lateral", titulo: "Central.Secao.Lateral", icone: "fa-table-columns", campos: [{ chave: "ocultarAbaCenas" }] }
    ]
  }
];

export const CHAVES_CENTRAL = new Set(ABAS_CENTRAL.flatMap(a => a.secoes.flatMap(s => s.campos.map(c => c.chave))));

// Opções de uma configuração de lista (o registro pode guardar uma função)
export const opcoesDe = def => (typeof def?.choices === "function" ? def.choices() : def?.choices) ?? null;

// Confere um valor contra o registro (tipo, opções, faixa).
// Devolve "" se está certo, ou o código do erro: "tipo", "numero", "min", "max", "opcao".
export function conferirValor(def, valor) {
  if (def.type === Boolean) return typeof valor === "boolean" ? "" : "tipo";
  if (def.type === Number) {
    if (!Number.isFinite(valor)) return "numero";
    if (def.range?.min != null && valor < def.range.min) return "min";
    if (def.range?.max != null && valor > def.range.max) return "max";
    return "";
  }
  const opcoes = opcoesDe(def);
  if (opcoes && Object.keys(opcoes).length) return String(valor) in opcoes ? "" : "opcao";
  if (typeof valor !== "string") return "tipo";
  // configuração de cor: só "#rrggbb"
  if (/^#[0-9a-f]{6}$/i.test(String(def.default ?? ""))) return /^#[0-9a-f]{6}$/i.test(valor) ? "" : "opcao";
  return "";
}
