/**
 * Device and quality flags decided once at boot, before the engine exists.
 * URL overrides for testing: `?touch=1|0` forces the touch layer on or off (the desktop Browser pane only
 * emulates touch below 768 px wide), `?quality=low|high` forces the render tier, `?dev=1` opens the dev panel.
 */
const params = new URLSearchParams(location.search);
const mq = (q: string) => typeof matchMedia === 'function' && matchMedia(q).matches;
const touchParam = params.get('touch');
/** Primary pointer is a finger. Hybrid laptops (fine primary pointer, touch screen) stay on mouse controls. */
const touch = touchParam !== null ? touchParam !== '0' : mq('(pointer: coarse)') || (!mq('(pointer: fine)') && navigator.maxTouchPoints > 0);
const shortEdge = Math.min(screen.width || innerWidth, screen.height || innerHeight);
const ios = /iP(hone|ad|od)/.test(navigator.platform) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export type QualityTier = 'low' | 'high';
export type QualitySetting = 'auto' | QualityTier;

export const PLATFORM = {
  touch,
  /** Touch device with a short screen edge: phone-sized layouts and the low render tier by default. */
  phone: touch && shortEdge < 800,
  ios,
  dev: params.has('dev'),
  /** Filled by `resolveTier` once the saved settings are known. */
  tier: 'high' as QualityTier,
};

/** Render tier: URL override, then the saved setting, then phones low and everything else high. */
export function resolveTier(saved: QualitySetting | undefined): QualityTier {
  const q = params.get('quality');
  const tier: QualityTier = q === 'low' || q === 'high' ? q : saved === 'low' || saved === 'high' ? saved : PLATFORM.phone ? 'low' : 'high';
  PLATFORM.tier = tier;
  document.documentElement.classList.toggle('lowq', tier === 'low');
  return tier;
}

const html = document.documentElement;
html.classList.toggle('touch', PLATFORM.touch);
html.classList.toggle('phone', PLATFORM.phone);
html.classList.toggle('ios', PLATFORM.ios);
