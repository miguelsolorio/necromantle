import { Color3 } from '@babylonjs/core/Maths/math.color';
import { MaterialPluginBase } from '@babylonjs/core/Materials/materialPluginBase';
import { MaterialDefines } from '@babylonjs/core/Materials/materialDefines';
import type { Material } from '@babylonjs/core/Materials/material';
import type { UniformBuffer } from '@babylonjs/core/Materials/uniformBuffer';
import type { Nullable } from '@babylonjs/core/types';

class RimDefines extends MaterialDefines { RIMLIGHT = false; }

/**
 * Fresnel rim light for characters (reference rule R-07 / R-20: the hero and the horde must read as
 * silhouettes against a mid-value ground). Injects a view-angle emissive term into the PBR fragment
 * shader just before the final colour write, in both GLSL (WebGL2) and WGSL (WebGPU) flavours.
 */
export class RimLightPlugin extends MaterialPluginBase {
  color = new Color3(0.45, 0.6, 1.0);
  power = 3;
  strength = 0.6;
  private _enabled = true;

  constructor(material: Material) {
    super(material, 'RimLight', 250, { RIMLIGHT: false }, true, true);
  }

  get isEnabled(): boolean { return this._enabled; }
  set isEnabled(v: boolean) { if (this._enabled === v) return; this._enabled = v; this.markAllDefinesAsDirty(); this._enable(v); }

  override isCompatible(): boolean { return true; }
  override getClassName(): string { return 'RimLightPlugin'; }

  override prepareDefines(defines: RimDefines): void { defines.RIMLIGHT = this._enabled; }

  override getUniforms(): { ubo: { name: string; size: number; type: string }[]; fragment: string } {
    return {
      ubo: [{ name: 'rimColor', size: 3, type: 'vec3' }, { name: 'rimParams', size: 2, type: 'vec2' }],
      fragment: '#ifdef RIMLIGHT\nuniform vec3 rimColor;\nuniform vec2 rimParams;\n#endif',
    };
  }

  override bindForSubMesh(ubo: UniformBuffer): void {
    if (!this._enabled) return;
    ubo.updateColor3('rimColor', this.color);
    ubo.updateFloat2('rimParams', this.power, this.strength);
  }

  override getCustomCode(shaderType: string, shaderLanguage?: number): Nullable<{ [pointName: string]: string }> {
    if (shaderType !== 'fragment') return null;
    if (shaderLanguage === 1) {
      return {
        CUSTOM_FRAGMENT_BEFORE_FRAGCOLOR: `#ifdef RIMLIGHT
var rimNdV: f32 = 1.0 - saturate(dot(normalW, viewDirectionW));
var rimTerm: f32 = pow(rimNdV, uniforms.rimParams.x) * uniforms.rimParams.y;
finalColor = vec4f(finalColor.rgb + uniforms.rimColor * rimTerm, finalColor.a);
#endif`,
      };
    }
    return {
      CUSTOM_FRAGMENT_BEFORE_FRAGCOLOR: `#ifdef RIMLIGHT
float rimNdV = 1.0 - clamp(dot(normalW, viewDirectionW), 0.0, 1.0);
float rimTerm = pow(rimNdV, rimParams.x) * rimParams.y;
finalColor.rgb += rimColor * rimTerm;
#endif`,
    };
  }
}

/** Attach (or fetch) the rim plugin on a material. Returns null when the material is not PBR-based. */
export function addRim(material: Material, color: Color3, strength = 0.6, power = 3): RimLightPlugin | null {
  if (material.getClassName() !== 'PBRMaterial' && material.getClassName() !== 'PBRMetallicRoughnessMaterial') return null;
  const existing = material.pluginManager?.getPlugin('RimLight') as RimLightPlugin | null | undefined;
  const plugin = existing ?? new RimLightPlugin(material);
  plugin.color = color; plugin.strength = strength; plugin.power = power;
  return plugin;
}
