import { AbstractMesh, CascadedShadowGenerator, Color3, Color4, DefaultRenderingPipeline, DirectionalLight, GlowLayer, HemisphericLight, ImageProcessingConfiguration, InstancedMesh, Mesh, MeshBuilder, Scene, SSAO2RenderingPipeline, StandardMaterial, TargetCamera, Vector3 } from '@babylonjs/core';
import { PALETTE } from "@/content/palette";
import { Textures } from "./textures";
import type { Backend } from '@/core/engine';

export interface RenderRig {
  moon: DirectionalLight;
  hemi: HemisphericLight;
  shadows: CascadedShadowGenerator;
  pipeline: DefaultRenderingPipeline;
  glow: GlowLayer;
  ssao: SSAO2RenderingPipeline | null;
  addCaster(mesh: AbstractMesh): void;
  addGlow(mesh: AbstractMesh): void;
  setFov(deg: number): void;
  /** 0 = normal night, 1 = arcane storm: the moon and fill turn violet, fog brightens (rule R-17). */
  setStormTint(k: number): void;
  /** Per-level fog colour and density (the storm tint blends from this base). */
  setFog(color: Color3, density: number): void;
  setMoon(boost: number): void;
  /** Screen-space ambient occlusion is off by default (per-draw cost on WebGPU); the dev panel toggles it. */
  setSsao(on: boolean): void;
}

/**
 * Lighting per reference rules R-08/R-15/R-16/R-18: one cool key, tinted fog, warm locals added by the world,
 * bloom with a high threshold, ACES tone mapping with a little extra contrast, vignette, no depth of field.
 */
export function setupRendering(scene: Scene, camera: TargetCamera, backend: Backend): RenderRig {
  let baseFog = PALETTE.fog.clone();
  let moonBoost = 1;
  scene.clearColor = new Color4(PALETTE.fog.r, PALETTE.fog.g, PALETTE.fog.b, 1);
  scene.ambientColor = new Color3(0.12, 0.13, 0.2);
  scene.fogMode = Scene.FOGMODE_EXP2;
  scene.fogDensity = 0.011;
  scene.fogColor = PALETTE.fog.clone();
  scene.collisionsEnabled = true;

  const moon = new DirectionalLight("moon", new Vector3(-0.42, -0.72, -0.55).normalize(), scene);
  moon.diffuse = PALETTE.moon.clone();
  moon.specular = PALETTE.moon.scale(0.25);
  moon.intensity = 1.9;
  moon.shadowMinZ = 1; moon.shadowMaxZ = 90;
  moon.renderPriority = 100;

  const hemi = new HemisphericLight('hemi', new Vector3(0.2, 1, 0.1), scene);
  hemi.diffuse = new Color3(0.34, 0.4, 0.62);
  hemi.groundColor = new Color3(0.2, 0.13, 0.1);
  hemi.specular = Color3.Black();
  hemi.intensity = 0.8;
  hemi.renderPriority = 95;

  const shadows = new CascadedShadowGenerator(1536, moon);
  shadows.numCascades = 2;
  shadows.lambda = 0.85;
  shadows.shadowMaxZ = 70;
  shadows.stabilizeCascades = true;
  shadows.filteringQuality = CascadedShadowGenerator.QUALITY_MEDIUM;
  shadows.usePercentageCloserFiltering = true;
  shadows.bias = 0.004;
  shadows.normalBias = 0.02;
  shadows.darkness = 0.45;

  // Sky: a gradient dome plus a moon disc. No HDRI dependency.
  const sky = MeshBuilder.CreateSphere('sky', { diameter: 900, segments: 12, sideOrientation: 1 }, scene);
  const skyMat = new StandardMaterial("skyMat", scene);
  skyMat.emissiveTexture = Textures.sky(scene);
  skyMat.diffuseColor = Color3.Black(); skyMat.specularColor = Color3.Black();
  skyMat.backFaceCulling = false;
  skyMat.disableLighting = true;
  sky.material = skyMat;
  sky.applyFog = false;
  sky.isPickable = false;
  sky.infiniteDistance = true;
  sky.metadata = { sky: true };

  const moonDisc = MeshBuilder.CreateDisc('moonDisc', { radius: 22, tessellation: 40 }, scene);
  const moonMat = new StandardMaterial('moonMat', scene);
  moonMat.emissiveColor = new Color3(0.95, 0.95, 0.9);
  moonMat.disableLighting = true;
  moonDisc.material = moonMat;
  moonDisc.position = moon.direction.scale(-420);
  moonDisc.lookAt(Vector3.Zero());
  moonDisc.applyFog = false;
  moonDisc.isPickable = false;
  moonDisc.infiniteDistance = true;

  // Glow only renders meshes registered through addGlow(); a full emissive pass over the scene costs ~200 draws.
  const glow = new GlowLayer("glow", scene, { blurKernelSize: 48, mainTextureSamples: 1, mainTextureRatio: 0.5 });
  glow.intensity = 0.7;
  glow.addIncludedOnlyMesh(moonDisc);

  const pipeline = new DefaultRenderingPipeline('pp', true, scene, [camera]);
  pipeline.samples = 4;
  pipeline.fxaaEnabled = true;
  pipeline.bloomEnabled = true;
  pipeline.bloomThreshold = 0.82;
  pipeline.bloomWeight = 0.28;
  pipeline.bloomKernel = 72;
  pipeline.bloomScale = 0.5;
  pipeline.imageProcessingEnabled = true;
  pipeline.imageProcessing.toneMappingEnabled = true;
  pipeline.imageProcessing.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
  pipeline.imageProcessing.exposure = 1.45;
  pipeline.imageProcessing.contrast = 1.18;
  pipeline.imageProcessing.vignetteEnabled = true;
  pipeline.imageProcessing.vignetteWeight = 2.2;
  pipeline.imageProcessing.vignetteStretch = 0.6;
  pipeline.imageProcessing.vignetteColor = new Color4(0.02, 0.01, 0.04, 1);
  pipeline.sharpenEnabled = true;
  pipeline.sharpen.edgeAmount = 0.22;
  pipeline.sharpen.colorAmount = 1;

  let ssao: SSAO2RenderingPipeline | null = null;
  try {
    ssao = new SSAO2RenderingPipeline('ssao', scene, { ssaoRatio: 0.6, blurRatio: 1 }, [], true);
    ssao.radius = 1.6; ssao.totalStrength = 0.9; ssao.expensiveBlur = false; ssao.samples = 12; ssao.maxZ = 60;
  } catch (e) {
    console.warn('[render] SSAO unavailable on', backend, e);
  }

  return {
    moon, hemi, shadows, pipeline, glow, ssao,
    addCaster: (mesh) => shadows.addShadowCaster(mesh, true),
    addGlow: (mesh) => { if (mesh instanceof Mesh) glow.addIncludedOnlyMesh(mesh); else if (mesh instanceof InstancedMesh) glow.addIncludedOnlyMesh(mesh.sourceMesh); },
    setFov: (deg) => { camera.fov = (deg * Math.PI) / 180; },
    setStormTint: (k) => {
      moon.diffuse = Color3.Lerp(PALETTE.moon, PALETTE.arcane, k * 0.8); moon.intensity = 1.9 * moonBoost + k * 1.2;
      hemi.diffuse = Color3.Lerp(new Color3(0.34, 0.4, 0.62), PALETTE.arcane, k * 0.6); hemi.intensity = 0.8 + k * 0.6;
      scene.fogColor = Color3.Lerp(baseFog, new Color3(0.25, 0.16, 0.42), k);
    },
    setSsao: (on) => { if (!ssao) return; const pm = scene.postProcessRenderPipelineManager; if (on) pm.attachCamerasToRenderPipeline('ssao', camera); else pm.detachCamerasFromRenderPipeline('ssao', camera); },
    setMoon: (boost) => { moonBoost = boost; moon.intensity = 1.9 * boost; hemi.intensity = 0.8 * (0.7 + 0.3 * boost); },
    setFog: (color, density) => { baseFog = color.clone(); scene.fogColor = color.clone(); scene.fogDensity = density; scene.clearColor = new Color4(color.r, color.g, color.b, 1); },
  };
}
