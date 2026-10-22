/**
 * Module unique de calcul et de formatage des grands nombres.
 *
 * Les valeurs sont des `number` JavaScript (double précision, jusqu'à ~1e308),
 * ce qui couvre largement l'objectif de 1e30 du cahier des charges. Tout calcul
 * de croissance passe par ce module pour pouvoir changer de représentation plus
 * tard sans toucher au reste du code.
 */

/** Suffixes courts (échelle courte) : K = 1e3, M = 1e6, B = 1e9, etc. */
const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];

/** Espace insécable entre le nombre et son suffixe. */
const NBSP = ' ';

/** Petite marge pour compenser les erreurs d'arrondi binaire (4,35 × 10 = 43,4999…). */
const EPSILON = 1e-9;

/** base × growth^n, protégé contre les valeurs non finies. */
export function grow(base: number, growth: number, n: number): number {
  const v = base * Math.pow(growth, n);
  return Number.isFinite(v) ? v : Number.MAX_VALUE;
}

/**
 * Somme de `count` termes d'une suite géométrique commençant à base × growth^start :
 * coût total pour acheter `count` niveaux d'une amélioration déjà achetée `start` fois.
 */
export function geometricSum(base: number, growth: number, start: number, count: number): number {
  if (count <= 0) return 0;
  const first = grow(base, growth, start);
  if (growth === 1) return first * count;
  const v = (first * (Math.pow(growth, count) - 1)) / (growth - 1);
  return Number.isFinite(v) ? v : Number.MAX_VALUE;
}

/**
 * Nombre maximal de niveaux achetables avec `budget`, l'amélioration ayant déjà
 * été achetée `start` fois.
 */
export function maxAffordable(base: number, growth: number, start: number, budget: number): number {
  const first = grow(base, growth, start);
  if (!(budget >= first)) return 0;
  if (growth === 1) return Math.floor(budget / first);
  let n = Math.floor(Math.log((budget * (growth - 1)) / first + 1) / Math.log(growth));
  // Correction des arrondis du logarithme.
  while (n > 0 && geometricSum(base, growth, start, n) > budget) n--;
  while (geometricSum(base, growth, start, n + 1) <= budget) n++;
  return n;
}

/** Tronque à `decimals` décimales (jamais d'arrondi vers le haut : 999 999 → « 999,9 K »). */
function truncate(value: number, decimals: number): number {
  const f = Math.pow(10, decimals);
  return Math.floor(value * f + EPSILON) / f;
}

function frenchDecimal(value: number, decimals: number): string {
  const t = truncate(value, decimals);
  const s = t.toFixed(decimals).replace(/\.?0+$/, '');
  return s.replace('.', ',');
}

/**
 * Formateur unique des nombres affichés.
 * - < 1 000 : entier (« 999 »), une décimale sous 10 si non entier (« 2,5 »).
 * - ≥ 1 000 : une décimale et un suffixe (« 1,2 K », « 3,4 M », « 5,6 B »).
 * - au-delà des suffixes connus : notation scientifique (« 1,2e36 »).
 */
export function formatNumber(value: number): string {
  if (Number.isNaN(value)) return '0';
  if (!Number.isFinite(value)) return value < 0 ? '-∞' : '∞';
  if (value < 0) return '-' + formatNumber(-value);

  if (value < 1000) {
    if (value < 10 && !Number.isInteger(value)) return frenchDecimal(value, 1);
    return String(Math.floor(value + EPSILON));
  }

  let tier = Math.floor(Math.log10(value) / 3 + EPSILON);
  let scaled = value / Math.pow(1000, tier);
  // Garde-fou si log10 a sous-estimé ou surestimé à la frontière.
  if (scaled >= 1000) {
    tier++;
    scaled /= 1000;
  } else if (scaled < 1) {
    tier--;
    scaled *= 1000;
  }

  if (tier < SUFFIXES.length) {
    return frenchDecimal(scaled, 1) + NBSP + SUFFIXES[tier];
  }

  const exp = Math.floor(Math.log10(value) + EPSILON);
  let mantissa = value / Math.pow(10, exp);
  let e = exp;
  if (mantissa >= 10) {
    mantissa /= 10;
    e++;
  }
  return frenchDecimal(mantissa, 1) + 'e' + e;
}
