import { Game } from './game';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const boot = document.getElementById('boot')!;
const bootStatus = document.getElementById('boot-status')!;
const game = new Game();
(window as any).game = game;
import('./audio').then((m) => { (window as any).audio = m.audio; });
// debugging handles for the browser console and automated tests
import('@babylonjs/core').then((B) => { (window as any).BABYLON = B; });

game.start(canvas, (s) => { bootStatus.textContent = s; })
  .then(() => { boot.classList.add('done'); canvas.focus(); })
  .catch((e) => { console.error(e); bootStatus.textContent = `Failed to start: ${e?.message ?? e}`; });
