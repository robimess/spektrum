export async function loadSpektrumWasm() {
  const url = '/assets/spektrum/spektrum_wasm.js';
  const mod = await import(/* @vite-ignore */ url);
  await mod.default();
  return mod;
}
