import { Game } from './game';
import { PLATFORM } from './core/platform';
import { resetZoom } from './input/touch';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const boot = document.getElementById('boot')!;
const bootStatus = document.getElementById('boot-status')!;
if (PLATFORM.touch) resetZoom(); // a reload should never come back mid-pinch
if (new URLSearchParams(location.search).has('probe')) import('./ui/probe').then((m) => m.startProbe());
const game = new Game();
(window as any).game = game;
import('./audio').then((m) => { (window as any).audio = m.audio; });
// debugging handles for the browser console and automated tests
import('@babylonjs/core').then((B) => { (window as any).BABYLON = B; });

game.start(canvas, (s) => { bootStatus.textContent = s; })
  .then(() => { boot.classList.add('done'); canvas.focus(); })
  .catch((e) => { console.error(e); bootStatus.textContent = `Failed to start: ${e?.message ?? e}`; });
