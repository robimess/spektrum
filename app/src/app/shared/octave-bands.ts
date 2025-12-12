export type Fraction = 1 | 2 | 3;

export interface BandDef {
  fc: number;
  fl: number;
  fu: number;
  i0: number;
  w: Float32Array;
  label: string;
}

export function buildBands(sampleRate: number, fftSize: number, fraction: Fraction): BandDef[] {
  const nyq = sampleRate / 2;
  const binHz = sampleRate / fftSize;
  const centers = [31.5,40,50,63,80,100,125,160,200,250,315,400,500,630,800,1000,1250,1600,2000,2500,3150,4000,5000,6300,8000,10000,12500,16000];
  const bands: BandDef[] = [];
  const k = 1 / (2 * fraction);

  for (const fc of centers) {
    if (fc >= nyq * 0.98) break;
    const fl = fc / Math.pow(2, k);
    const fu = fc * Math.pow(2, k);
    if (fu <= 20 || fl >= nyq) continue;

    const i0 = Math.max(0, Math.floor(fl / binHz));
    const i1 = Math.min(fftSize / 2 - 1, Math.ceil(fu / binHz));
    const w = new Float32Array(i1 - i0 + 1);

    const leftW  = Math.max(1, (fc - fl) / binHz);
    const rightW = Math.max(1, (fu - fc) / binHz);
    const mid = fc / binHz - i0;
    for (let i = 0; i < w.length; i++) {
      const pos = i;
      const val = pos <= mid ? (pos / leftW) : ((w.length - 1 - pos) / rightW);
      w[i] = Math.max(0, Math.min(1, val));
    }
    let sum = 0; for (let i = 0; i < w.length; i++) sum += w[i];
    if (sum === 0) continue;
    for (let i = 0; i < w.length; i++) w[i] /= sum;

    bands.push({ fc, fl, fu, i0, w, label: `${Math.round(fc)} Hz` });
  }
  return bands;
}

export function projectToBands(magLin: Float32Array, bands: BandDef): number {
  let acc = 0; const { i0, w } = bands;
  for (let i = 0; i < w.length; i++) acc += (magLin[i0 + i] ?? 0) * w[i];
  return acc;
}
