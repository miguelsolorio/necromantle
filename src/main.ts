import { Game } from './game';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const boot = document.getElementById('boot')!;
const bootStatus = document.getElementById('boot-status')!;
const game = new Game();
(window as any).game = game;

game.start(canvas, (s) => { bootStatus.textContent = s; })
  .then(() => { bootStatus.textContent = `${game.backend} · click to play`; boot.classList.add('done'); canvas.focus(); })
  .catch((e) => { console.error(e); bootStatus.textContent = `Failed to start: ${e?.message ?? e}`; });
