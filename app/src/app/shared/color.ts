export type PaletteName = 'viridis' | 'magma' | 'inferno' | 'plasma' | 'gray';

type Stop = [number, number, number];
type Stops = Stop[];

const VIRIDIS: Stops = [
  [68,1,84], [72,35,116], [64,67,135], [52,94,141], [41,120,142],
  [32,144,140], [53,183,121], [110,206,88], [181,222,43], [253,231,37]
];

const MAGMA: Stops = [
  [0,0,3], [28,16,68], [79,18,123], [129,37,129], [181,54,122],
  [229,80,100], [252,120,88], [253,161,92], [252,204,138], [252,253,191]
];

const INFERNO: Stops = [
  [0,0,4], [31,12,72], [85,15,109], [136,34,106], [186,54,85],
  [227,89,51], [249,140,10], [252,191,53], [252,235,164], [252,255,204]
];

const PLASMA: Stops = [
  [13,8,135], [63,0,135], [110,0,134], [158,33,120], [201,70,93],
  [236,120,58], [248,170,27], [247,213,52], [240,248,77], [240,249,170]
];

const GRAY: Stops = [
  [0,0,0], [255,255,255]
];

const PALETTES: Record<PaletteName, Stops> = {
  viridis: VIRIDIS, magma: MAGMA, inferno: INFERNO, plasma: PLASMA, gray: GRAY
};

function lerp(a: number, b: number, t: number) { return a*(1-t) + b*t; }
function sampleStops(stops: Stops, t: number): Stop {
  const n = stops.length - 1;
  if (t <= 0) return stops[0];
  if (t >= 1) return stops[n];
  const x = t * n;
  const i = Math.floor(x);
  const f = x - i;
  const a = stops[i], b = stops[i+1];
  return [
    Math.round(lerp(a[0], b[0], f)),
    Math.round(lerp(a[1], b[1], f)),
    Math.round(lerp(a[2], b[2], f)),
  ];
}

/** Construye LUT 256*3 con gamma aplicado sobre el eje de intensidad. */
export function buildLUT(palette: PaletteName, gamma: number): Uint8Array {
  const stops = PALETTES[palette];
  const lut = new Uint8Array(256 * 3);
  const g = Math.max(0.1, Math.min(5, gamma || 1));
  for (let i = 0; i < 256; i++) {
    const v = i / 255;
    const vv = Math.pow(v, g);
    const [r, c, b] = sampleStops(stops, vv);
    const j = i * 3;
    lut[j] = r; lut[j+1] = c; lut[j+2] = b;
  }
  return lut;
}
