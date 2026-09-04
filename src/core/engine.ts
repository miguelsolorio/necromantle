import { Engine, WebGPUEngine, type AbstractEngine } from '@babylonjs/core';

export type Backend = 'webgpu' | 'webgl2';
export interface EngineInfo { engine: AbstractEngine; backend: Backend }

/** WebGPU first, WebGL2 fallback. `?webgl=1` forces the fallback for comparison. */
export async function createEngine(canvas: HTMLCanvasElement): Promise<EngineInfo> {
  const params = new URLSearchParams(location.search);
  if (!params.has('webgl')) {
    try {
      if (await WebGPUEngine.IsSupportedAsync) {
        const engine = new WebGPUEngine(canvas, { antialias: true, adaptToDeviceRatio: false, powerPreference: 'high-performance' });
        await engine.initAsync();
        return { engine, backend: 'webgpu' };
      }
    } catch (e) {
      console.warn('[engine] WebGPU init failed, falling back to WebGL2', e);
    }
  }
  const engine = new Engine(canvas, true, { adaptToDeviceRatio: false, powerPreference: 'high-performance', stencil: true });
  return { engine, backend: 'webgl2' };
}
