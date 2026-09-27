/** Opens a satellite in its own browser window, so several can be watched side by side. */
export function openSatelliteWindow(satId: string, tab?: string) {
  const q = new URLSearchParams({ sat: satId, win: '1', ...(tab ? { tab } : {}) });
  const w = window.open(`${window.location.pathname}#/satellite?${q}`, `vyuh-sat-${satId}`, 'popup=yes,width=1440,height=900');
  if (w) w.focus();
}
