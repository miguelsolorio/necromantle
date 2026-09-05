import { Engine, WebGPUEngine, type AbstractEngine } from '@babylonjs/core';
import type { QualityTier } from './platform';

export type Backend = 'webgpu' | 'webgl2';
export interface EngineInfo { engine: AbstractEngine; backend: Backend }

/**
 * WebGPU first, WebGL2 fallback. `?webgl=1` forces the fallback for comparison.
 * `adaptToDeviceRatio` stays off on both paths: the backbuffer matches CSS pixels, which is the right cost on a
 * 3× phone screen, and `ThirdPersonCamera.project` already reads the hardware scaling level. The low tier also
 * drops hardware MSAA; the post pipeline's FXAA covers it.
 */
export async function createEngine(canvas: HTMLCanvasElement, tier: QualityTier = 'high'): Promise<EngineInfo> {
  const params = new URLSearchParams(location.search);
  const antialias = tier === 'high';
  if (!params.has('webgl')) {
    try {
      if (await WebGPUEngine.IsSupportedAsync) {
        const engine = new WebGPUEngine(canvas, { antialias, adaptToDeviceRatio: false, powerPreference: 'high-performance' });
        await engine.initAsync();
        return { engine, backend: 'webgpu' };
      }
    } catch (e) {
      console.warn('[engine] WebGPU init failed, falling back to WebGL2', e);
    }
  }
  const engine = new Engine(canvas, antialias, { adaptToDeviceRatio: false, powerPreference: 'high-performance', stencil: true });
  return { engine, backend: 'webgl2' };
}
