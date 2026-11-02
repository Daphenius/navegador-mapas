// Foundry de mentira, só com o que os testes precisam. NÃO substitui testar no Foundry real:
// serve para pegar regressões de lógica (concorrência, falhas, respostas fora de ordem).
import fs from "node:fs";

const raiz = new URL("..", import.meta.url).pathname;
const lang = JSON.parse(fs.readFileSync(`${raiz}lang/pt-BR.json`, "utf8"));
const texto = k => k.split(".").reduce((o, p) => o?.[p], lang) ?? k;

export const avisos = [];   // { tipo, msg, opcoes }
export const enviados = []; // mensagens emitidas pelo socket
export const tocados = [];  // músicas iniciadas
export const parados = [];  // músicas paradas
let seq = 0;
const tick = () => new Promise(r => setTimeout(r, 0));

// Grade quadrada simples (mesmos métodos que o módulo usa da grade do Foundry)
class Grade {
  constructor({ size }) { this.size = this.sizeX = this.sizeY = size; this.isHexagonal = false; this.isGridless = false; }
  getOffset({ x, y }) { return { i: Math.floor(y / this.size), j: Math.floor(x / this.size) }; }
  getTopLeftPoint({ i, j }) { return { x: j * this.size, y: i * this.size }; }
  getCenterPoint({ i, j }) { return { x: (j + 0.5) * this.size, y: (i + 0.5) * this.size }; }
}

// Grade hexagonal "pontuda" em coordenadas axiais (i = linha r, j = coluna q), com o mesmo
// contrato da grade do Foundry: vizinhança de 6, centro, canto e conversão de ponto para casa.
class GradeHex {
  constructor({ size }) { this.r = size / 2; this.sizeX = Math.sqrt(3) * this.r; this.sizeY = 2 * this.r; this.isHexagonal = true; this.isGridless = false; this.ox = this.sizeX; this.oy = this.sizeY; }
  getCenterPoint({ i, j }) { return { x: this.ox + this.sizeX * (j + i / 2), y: this.oy + 1.5 * this.r * i }; }
  getTopLeftPoint(o) { const c = this.getCenterPoint(o); return { x: c.x - this.sizeX / 2, y: c.y - this.sizeY / 2 }; }
  getOffset({ x, y }) {
    const px = x - this.ox, py = y - this.oy;
    const q = (Math.sqrt(3) / 3 * px - py / 3) / this.r, r = (2 / 3 * py) / this.r;
    let rq = Math.round(q), rr = Math.round(r), rs = Math.round(-q - r);
    const dq = Math.abs(rq - q), dr = Math.abs(rr - r), ds = Math.abs(rs + q + r);
    if (dq > dr && dq > ds) rq = -rr - rs; else if (dr > ds) rr = -rq - rs;
    return { i: rr, j: rq };
  }
  getAdjacentOffsets({ i, j }) { return [[0, 1], [0, -1], [1, 0], [-1, 0], [1, -1], [-1, 1]].map(([a, b]) => ({ i: i + a, j: j + b })); }
  distancia(a, b) { return (Math.abs(a.j - b.j) + Math.abs(a.j + a.i - b.j - b.i) + Math.abs(a.i - b.i)) / 2; }
}

export function criarCena(id, { largura = 1000, altura = 1000, tam = 100, chegada = null, musica = null, hex = false } = {}) {
  const tokens = [];
  const cena = {
    id, name: `Mapa ${id}`, tokens: { get contents() { return tokens; }, some: f => tokens.some(f), find: f => tokens.find(f) },
    dimensions: { size: tam, sceneX: 0, sceneY: 0, sceneWidth: largura, sceneHeight: altura },
    grid: hex ? new GradeHex({ size: tam }) : new Grade({ size: tam }),
    falhas: { criar: false, apagarNovos: false },
    criados: 0,
    getFlag: (m, k) => ({ chegada, musica })[k] ?? null,
    async createEmbeddedDocuments(tipo, lista) {
      await tick();
      if (cena.falhas.criar) throw new Error("falha simulada ao criar");
      cena.criados += lista.length;
      return lista.map(d => adicionarToken(cena, d));
    }
  };
  return cena;
}

export function adicionarToken(cena, d) {
  const tk = {
    id: `t${++seq}`, parent: cena, name: d.name ?? "Token", actorId: d.actorId ?? null,
    x: d.x ?? 0, y: d.y ?? 0, width: d.width ?? 1, height: d.height ?? 1,
    falhaApagar: cena.falhas.apagarNovos,
    toObject() { return { _id: tk.id, name: tk.name, actorId: tk.actorId, x: tk.x, y: tk.y, width: tk.width, height: tk.height }; },
    async delete() {
      await tick();
      if (tk.falhaApagar) throw new Error("falha simulada ao apagar");
      const i = cena.tokens.contents.indexOf(tk);
      if (i >= 0) cena.tokens.contents.splice(i, 1);
    }
  };
  cena.tokens.contents.push(tk);
  return tk;
}

export function criarAtor(id, { width = 1, height = 1 } = {}) {
  return {
    id, name: `Herói ${id}`, prototypeToken: { width, height },
    async getTokenDocument(dados) { return { toObject: () => ({ ...dados, actorId: id, name: `Herói ${id}`, width, height }) }; },
    testUserPermission: () => true
  };
}

const lista = arr => Object.assign(arr, { get: id => arr.find(x => x.id === id), has: id => arr.some(x => x.id === id) });

export function montarFoundry({ cenas = [], usuarios = [], config = {} } = {}) {
  const gm = { id: "gm", name: "Mestre", isGM: true, active: true };
  const users = lista([gm, ...usuarios]);
  users.activeGM = gm;
  avisos.length = enviados.length = tocados.length = parados.length = 0;
  Object.assign(globalThis, {
    Hooks: { on: () => 1, once: () => 1, off() {} },
    CONST: { PLAYLIST_MODES: { SHUFFLE: 1 } },
    ui: { notifications: Object.fromEntries(["info", "warn", "error"].map(tipo => [tipo, (msg, opcoes) => avisos.push({ tipo, msg, opcoes })])) },
    foundry: {
      canvas: { Canvas: class { draw() {} } },
      grid: { SquareGrid: Grade },
      utils: { randomID: () => `op${++seq}`, deepClone: structuredClone, hasProperty: () => false },
      applications: { api: { ApplicationV2: class {}, HandlebarsApplicationMixin: B => class extends B {} } },
      audio: { AudioHelper: { play: async o => { tocados.push(o.src); return { stop() {}, fade: () => parados.push(o.src), addEventListener() {} }; } } }
    },
    game: {
      user: gm, users, scenes: lista(cenas), playlists: lista([]),
      settings: { get: (m, k) => config[k] ?? null },
      i18n: { lang: "pt-BR", localize: k => texto(k), format: (k, d) => texto(k).replace(/\{(\w+)\}/g, (_, n) => d[n]) },
      socket: { emit: (canal, d) => enviados.push(d), on: (canal, fn) => { globalThis.__socket = fn; } }
    },
    canvas: { scene: null, ready: true, loading: false }
  });
  return { gm, users };
}
