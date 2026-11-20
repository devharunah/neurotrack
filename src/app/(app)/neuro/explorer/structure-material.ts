import { Color, type IUniform, MeshStandardMaterial } from "three";

/** Warm neutral tissue tone for the stage (docs/planning/05). */
export const TISSUE_COLOR = "#d6c0bb";
const RIM_COLOR = "#9fc4ff";
const GHOST_COLOR = "#8fb4e8";

/**
 * Per-structure animation targets, damped every frame:
 * - highlight: selected (takes the item colour, gentle emissive lift, brighter rim)
 * - hover: pointer is over it
 * - dim: something else is selected, so this recedes
 * - ghost: drawn as a see-through fresnel outline (deep mode cortex)
 * - ghostTint: how much of the item colour a ghost carries (the prefrontal cortex in deep mode)
 */
export interface StructureUniforms {
  uHighlight: IUniform<number>;
  uHover: IUniform<number>;
  uDim: IUniform<number>;
  uGhost: IUniform<number>;
  uGhostTint: IUniform<number>;
  /** Scales the ghost's opacity: inner structures (brainstem) are fainter than the cortex. */
  uGhostStrength: IUniform<number>;
  uAo: IUniform<number>;
  uItemColor: IUniform<Color>;
  uRimColor: IUniform<Color>;
  uGhostColor: IUniform<Color>;
}

const DECLARATIONS = /* glsl */ `
uniform float uHighlight;
uniform float uHover;
uniform float uDim;
uniform float uGhost;
uniform float uGhostTint;
uniform float uGhostStrength;
uniform float uAo;
uniform vec3 uItemColor;
uniform vec3 uRimColor;
uniform vec3 uGhostColor;
`;

/** Replaces `diffuseColor *= vColor`: base colour, hover/selection/dim, then baked AO. */
const COLOR = /* glsl */ `
float bakedAo = 1.0;
#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
  bakedAo = vColor.r;
#endif
vec3 base = mix( diffuseColor.rgb, uItemColor, uHighlight * 0.8 );
base = mix( base, base * 1.15 + 0.03, uHover * ( 1.0 - uHighlight ) );
float luma = dot( base, vec3( 0.299, 0.587, 0.114 ) );
base = mix( base, vec3( luma ) * 0.5, uDim * 0.8 );
diffuseColor.rgb = base * mix( 1.0, bakedAo, uAo );
`;

const EMISSIVE = /* glsl */ `
totalEmissiveRadiance += uItemColor * ( uHighlight * 0.16 + uHover * 0.05 );
`;

/** Fresnel rim, then the ghost look, just before the fragment is written. */
const OUTPUT = /* glsl */ `
float facing = abs( dot( normalize( normal ), normalize( vViewPosition ) ) );
float fresnel = pow( 1.0 - clamp( facing, 0.0, 1.0 ), 2.4 );
// Buried surfaces (sulcal walls, low baked AO) fade out of the ghost so only the outer
// silhouette of the brain stays visible.
float exposed = smoothstep( 0.35, 0.85, bakedAo );
outgoingLight += uRimColor * fresnel * ( 0.16 + 0.45 * uHighlight ) * ( 1.0 - 0.7 * uDim );
vec3 ghostTone = mix( uGhostColor, uItemColor, uGhostTint );
vec3 ghostLight = ghostTone * ( 0.12 + 0.9 * fresnel );
float ghostAlpha = ( 0.02 + 0.32 * pow( fresnel, 1.4 ) ) * exposed * ( 1.0 + 1.6 * uGhostTint )
  * uGhostStrength + 0.25 * uHighlight;
outgoingLight = mix( outgoingLight, ghostLight, uGhost );
diffuseColor.a = mix( diffuseColor.a, clamp( ghostAlpha, 0.0, 1.0 ), uGhost );
#include <opaque_fragment>
`;

export interface StructureMaterial {
  material: MeshStandardMaterial;
  uniforms: StructureUniforms;
}

/**
 * One material per model node, so each structure animates on its own. They all share one
 * compiled program (same shader source); only the uniform values differ.
 */
export function createStructureMaterial(): StructureMaterial {
  const uniforms: StructureUniforms = {
    uHighlight: { value: 0 },
    uHover: { value: 0 },
    uDim: { value: 0 },
    uGhost: { value: 0 },
    uGhostTint: { value: 0 },
    uGhostStrength: { value: 1 },
    uAo: { value: 0.72 },
    uItemColor: { value: new Color(TISSUE_COLOR) },
    uRimColor: { value: new Color(RIM_COLOR) },
    uGhostColor: { value: new Color(GHOST_COLOR) },
  };
  // Always transparent so the structures/ghost switch never needs a recompile; with alpha 1
  // and depth writes on, a solid structure renders exactly like an opaque one.
  const material = new MeshStandardMaterial({
    color: TISSUE_COLOR,
    roughness: 0.62,
    metalness: 0,
    vertexColors: true,
    transparent: true,
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${DECLARATIONS}`)
      .replace("#include <color_fragment>", COLOR)
      .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>\n${EMISSIVE}`)
      .replace("#include <opaque_fragment>", OUTPUT);
  };
  material.customProgramCacheKey = () => "neurotrack-brain-structure-v1";
  return { material, uniforms };
}
