/**
 * Color helpers.
 *
 * Note: Keep these lightweight (no deps) so they can be used in screens/components.
 */

/**
 * Converts a hex color (e.g. "#RRGGBB" or "#RGB") to an rgba() string.
 * If the input is not a supported hex, returns it unchanged.
 */
export const hexToRgba = (hexOrColor: string, alpha: number): string => {
  const c = (hexOrColor ?? '').trim();

  if (/^#([0-9a-fA-F]{3})$/.test(c)) {
    const r = Number.parseInt(c[1] + c[1], 16);
    const g = Number.parseInt(c[2] + c[2], 16);
    const b = Number.parseInt(c[3] + c[3], 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  if (/^#([0-9a-fA-F]{6})$/.test(c)) {
    const r = Number.parseInt(c.slice(1, 3), 16);
    const g = Number.parseInt(c.slice(3, 5), 16);
    const b = Number.parseInt(c.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  return hexOrColor;
};

export const withAlpha = hexToRgba;
