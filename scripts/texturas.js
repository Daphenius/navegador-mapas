// Navegador de Mundos — texturas: pré-carregar mapas e liberar memória

import { ID, enfileirar, esperarCanvas } from "./nucleo.js";

// Descarregar mapas da memória
export const TL = foundry.canvas.TextureLoader;

// O cache de texturas não expõe a lista de chaves; guardamos cada uma ao entrar
// para poder excluir da limpeza tudo que não pertence ao mapa descarregado.
// Sem esse registro não dá para descarregar com segurança (a limpeza tiraria o mapa em uso também).
export const chavesCache = new Set();
export let cacheRastreado = false;
if (typeof TL?.prototype?.setCache === "function") {
  const original = TL.prototype.setCache;
  TL.prototype.setCache = function (src, asset) {
    chavesCache.add(src);
    return original.call(this, src, asset);
  };
  cacheRastreado = true;
} else console.warn(`${ID} | TextureLoader#setCache não encontrado; "liberar memória" fica desativado`);

// Uso de memória das texturas: não é API pública, então só usamos se existir e for um número
export function memoriaTexturas() {
  try {
    const v = TL.approximateTotalMemoryUsage;
    const n = typeof v === "function" ? v.call(TL) : v;
    return Number.isFinite(n) ? n : null;
  } catch { return null; }
}

export const EXT_MIDIA = /\.(webp|png|jpe?g|gif|svg|avif|bmp|tiff?|webm|mp4|m4v|ogv|ogg)(\?.*)?$/i;
export const normalizar = src => {
  try { src = decodeURIComponent(String(src)); } catch { src = String(src); }
  return src.replace(/^https?:\/\/[^/]+/i, "").replace(/^\/+/, "").replace(/\?.*$/, "");
};

// Imagens e vídeos usados por um mapa (níveis, tiles, tokens, notas, desenhos)
export function fontesDaCena(cena) {
  const fontes = new Set();
  if (!cena) return fontes;
  const vistos = new WeakSet();
  const varrer = (v, chave) => {
    if (chave === "thumb") return; // a miniatura fica para a janela
    if (typeof v === "string") { if (EXT_MIDIA.test(v)) fontes.add(v); }
    else if (v && typeof v === "object" && !vistos.has(v)) {
      vistos.add(v);
      if (Array.isArray(v)) v.forEach(x => varrer(x));
      else for (const [k, x] of Object.entries(v)) varrer(x, k);
    }
  };
  varrer(cena.toObject?.() ?? cena);
  return fontes;
}

// Tira da memória deste navegador as texturas de um mapa (sceneId = null: todos os mapas fora de uso)
export function descarregarLocal(sceneId) {
  return enfileirar(async () => {
    const loader = TL.loader;
    if (!loader || !cacheRastreado || typeof loader.expireCache !== "function") return { bytes: 0, motivo: "sem-suporte" };
    await esperarCanvas();

    const atual = canvas.scene;
    if (sceneId && atual?.id === sceneId) return { bytes: 0, motivo: "em-uso" };

    const alvo = new Set();
    const cenas = sceneId ? [game.scenes.get(sceneId)] : game.scenes.filter(s => s.id !== atual?.id);
    for (const s of cenas) for (const f of fontesDaCena(s)) alvo.add(normalizar(f));
    // O que o mapa atual também usa fica (ex.: token do personagem)
    for (const f of fontesDaCena(atual)) alvo.delete(normalizar(f));
    if (!alvo.size) return { bytes: 0, motivo: "nada" };

    const exclude = new Set();
    for (const k of chavesCache) if (!alvo.has(normalizar(k))) exclude.add(k);

    // CACHE_TTL negativo faz tudo que não foi excluído contar como expirado
    const antes = memoriaTexturas();
    const ttl = TL.CACHE_TTL;
    try {
      TL.CACHE_TTL = -1;
      await loader.expireCache({ exclude });
    } finally {
      TL.CACHE_TTL = ttl;
    }
    for (const k of [...chavesCache]) if (alvo.has(normalizar(k))) chavesCache.delete(k);
    const depois = memoriaTexturas();
    // bytes = null: o Foundry não informou quanto foi liberado
    return { bytes: antes !== null && depois !== null ? Math.max(0, antes - depois) : null };
  });
}

export const mb = bytes => `${(bytes / 1048576).toFixed(bytes >= 10485760 ? 0 : 1)} MB`;

export function precarregarLocal(sceneId) {
  return enfileirar(async () => {
    const cena = game.scenes.get(sceneId);
    if (!cena || canvas.scene?.id === cena.id) return;
    await esperarCanvas();
    await game.scenes.preload(sceneId);
  });
}

// Mapa excluído: solta o registro das texturas dele (as que o mapa atual não usa)
export function esquecerTexturasDe(cena) {
  try {
    const emUso = new Set([...fontesDaCena(canvas.scene)].map(normalizar));
    const fontes = new Set([...fontesDaCena(cena)].map(normalizar));
    for (const k of [...chavesCache]) { const n = normalizar(k); if (fontes.has(n) && !emUso.has(n)) chavesCache.delete(k); }
  } catch (err) { console.warn(`${ID} | não consegui limpar o registro de texturas do mapa excluído`, err); }
}
