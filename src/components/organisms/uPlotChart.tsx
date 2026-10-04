import type uPlot from 'uplot';

/**
 * Paints the warning/critical bands behind the series (FR-S05-03) directly on
 * uPlot's canvas — cheaper and sharper than a second filled series, and it
 * follows the y-scale exactly instead of drifting from it.
 */
export function bandsPlugin(lowSoft?: number, hiSoft?: number, lowHard?: number, hiHard?: number): uPlot.Plugin {
  return {
    hooks: {
      draw: [(u) => {
        const { ctx } = u;
        const left = u.bbox.left, top = u.bbox.top, width = u.bbox.width, height = u.bbox.height;
        const y = (v: number) => top + height * (1 - (v - u.scales.y.min!) / (u.scales.y.max! - u.scales.y.min!));
        const clampY = (v: number) => Math.max(top, Math.min(top + height, v));

        ctx.save();
        // Critical zones: below lowHard, above hiHard.
        ctx.fillStyle = 'rgba(255, 107, 107, 0.08)';
        if (lowHard != null) ctx.fillRect(left, clampY(y(lowHard)), width, clampY(top + height) - clampY(y(lowHard)));
        if (hiHard != null) ctx.fillRect(left, clampY(top), width, clampY(y(hiHard)) - clampY(top));
        // Warning zones: between soft and hard on each side.
        ctx.fillStyle = 'rgba(245, 196, 81, 0.07)';
        if (lowSoft != null) ctx.fillRect(left, clampY(y(lowSoft)), width, clampY(y(lowHard ?? lowSoft)) - clampY(y(lowSoft)));
        if (hiSoft != null) ctx.fillRect(left, clampY(y(hiHard ?? hiSoft)), width, clampY(y(hiSoft)) - clampY(y(hiHard ?? hiSoft)));
        ctx.restore();
      }],
    },
  };
}
