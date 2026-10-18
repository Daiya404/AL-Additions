export interface TierConfig {
  min: number;
  max: number;
  label: string;
  color: string;
  textColor: string;
}

export const DEFAULT_TIERS: TierConfig[] = [
  { min: 95, max: 100, label: 'S+', color: '#FFD700', textColor: '#000000' },
  { min: 85, max: 94.9, label: 'S', color: '#ff7f00', textColor: '#FFFFFF' },
  { min: 75, max: 84.9, label: 'A', color: '#aa00ff', textColor: '#FFFFFF' },
  { min: 65, max: 74.9, label: 'B', color: '#007fff', textColor: '#FFFFFF' },
  { min: 55, max: 64.9, label: 'C', color: '#00aa00', textColor: '#FFFFFF' },
  { min: 41, max: 54.9, label: 'D', color: '#aaaaaa', textColor: '#FFFFFF' },
  { min: 0, max: 40.9, label: 'F', color: '#666666', textColor: '#FFFFFF' }
];

export function getTier(rating: number, tiers: TierConfig[]): TierConfig | null {
  if (rating <= 0 || !Number.isFinite(rating)) return null;
  for (const tier of tiers) {
    if (rating >= tier.min && rating <= tier.max) {
      return tier;
    }
  }
  // Tolerant match for floating precision boundary gaps (e.g. 94.95 between 94.9 and 95)
  for (const tier of tiers) {
    if (rating >= tier.min - 0.05 && rating <= tier.max + 0.05) {
      return tier;
    }
  }
  return null;
}

const NAMED_COLORS = new Set([
  'black', 'white', 'gray', 'grey', 'silver', 'red', 'maroon', 'yellow', 'olive',
  'lime', 'green', 'aqua', 'cyan', 'teal', 'blue', 'navy', 'fuchsia', 'magenta',
  'purple', 'orange', 'gold', 'pink', 'brown', 'transparent'
]);

export function isValidColor(color: string): boolean {
  if (typeof color !== 'string') return false;
  const s = color.trim();
  if (!s) return false;

  // Hex: #RGB, #RGBA, #RRGGBB, #RRGGBBAA
  if (/^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(s)) return true;

  // Functional CSS: rgb(), rgba(), hsl(), hsla()
  if (/^(rgb|hsl)a?\(\s*[\d.%\s,/+-]+\s*\)$/i.test(s)) return true;

  // Named colors
  if (NAMED_COLORS.has(s.toLowerCase())) return true;

  // Browser CSS.supports if available
  if (typeof CSS !== 'undefined' && typeof CSS.supports === 'function') {
    try {
      if (CSS.supports('color', s)) return true;
    } catch (_) {}
  }

  // Fallback via Option style
  if (typeof Option !== 'undefined') {
    try {
      const opt = new Option();
      opt.style.color = s;
      return !!opt.style.color;
    } catch (_) {}
  }

  return false;
}

export function normalizeHexColor(color: string): string {
  const s = (color || '').trim();
  const m3 = s.match(/^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/);
  if (m3) {
    return `#${m3[1]}${m3[1]}${m3[2]}${m3[2]}${m3[3]}${m3[3]}`.toLowerCase();
  }
  if (/^#[0-9a-fA-F]{6}$/.test(s)) {
    return s.toLowerCase();
  }
  return s;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
  tiers?: TierConfig[];
}

export function validateTiers(input: any): ValidationResult {
  if (!Array.isArray(input)) {
    return { valid: false, error: 'Tiers configuration must be an array.' };
  }
  if (input.length === 0) {
    return { valid: false, error: 'At least one tier must be defined.' };
  }

  const validated: TierConfig[] = [];

  for (let i = 0; i < input.length; i++) {
    const item = input[i];
    const idx = i + 1;
    if (!item || typeof item !== 'object') {
      return { valid: false, error: `Tier #${idx} is invalid (must be an object).` };
    }

    const label = typeof item.label === 'string' ? item.label.trim() : '';
    if (!label) {
      return { valid: false, error: `Tier #${idx} must have a non-empty label.` };
    }
    if (label.length > 20) {
      return { valid: false, error: `Tier "${label}" label is too long (maximum 20 characters).` };
    }

    const min = typeof item.min === 'number' ? item.min : parseFloat(item.min);
    if (!Number.isFinite(min)) {
      return { valid: false, error: `Tier "${label}" has an invalid min score (must be a number).` };
    }
    if (min < 0 || min > 100) {
      return { valid: false, error: `Tier "${label}" min score (${min}) must be between 0 and 100.` };
    }

    const max = typeof item.max === 'number' ? item.max : parseFloat(item.max);
    if (!Number.isFinite(max)) {
      return { valid: false, error: `Tier "${label}" has an invalid max score (must be a number).` };
    }
    if (max < 0 || max > 100) {
      return { valid: false, error: `Tier "${label}" max score (${max}) must be between 0 and 100.` };
    }

    if (min > max) {
      return {
        valid: false,
        error: `Tier "${label}" min score (${min}) cannot be greater than max score (${max}).`
      };
    }

    const color = typeof item.color === 'string' ? item.color.trim() : '';
    if (!isValidColor(color)) {
      return {
        valid: false,
        error: `Tier "${label}" has an invalid badge color: "${item.color}". Must be a valid hex or CSS color.`
      };
    }

    const textColor = typeof item.textColor === 'string' ? item.textColor.trim() : '';
    if (!isValidColor(textColor)) {
      return {
        valid: false,
        error: `Tier "${label}" has an invalid text color: "${item.textColor}". Must be a valid hex or CSS color.`
      };
    }

    validated.push({
      label,
      min: Math.round(min * 100) / 100,
      max: Math.round(max * 100) / 100,
      color: normalizeHexColor(color),
      textColor: normalizeHexColor(textColor)
    });
  }

  return { valid: true, tiers: validated };
}

