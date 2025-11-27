/**
 * Refraction physics - Snell's law and dispersion calculations
 * Physically accurate optics for prism simulation
 */

import * as THREE from 'three';
import { Ray } from './ray';

/**
 * Glass material types with their optical properties
 * Sellmeier coefficients for accurate dispersion calculation
 */
export interface GlassMaterial {
  name: string;
  // Sellmeier coefficients (B1, B2, B3, C1, C2, C3)
  // n²(λ) = 1 + B1λ²/(λ²-C1) + B2λ²/(λ²-C2) + B3λ²/(λ²-C3)
  sellmeier: {
    B1: number; B2: number; B3: number;
    C1: number; C2: number; C3: number;
  };
  // Approximate refractive index at 589nm (sodium D-line) for reference
  nD: number;
}

/**
 * Real glass material library
 */
export const GLASS_MATERIALS: Record<string, GlassMaterial> = {
  // BK7 - Common optical glass, good for general use
  BK7: {
    name: 'BK7 (Borosilicate Crown)',
    sellmeier: {
      B1: 1.03961212, B2: 0.231792344, B3: 1.01046945,
      C1: 0.00600069867, C2: 0.0200179144, C3: 103.560653
    },
    nD: 1.5168
  },
  
  // SF11 - High dispersion flint glass, dramatic rainbow spread
  SF11: {
    name: 'SF11 (Dense Flint)',
    sellmeier: {
      B1: 1.73759695, B2: 0.313747346, B3: 1.89878101,
      C1: 0.013188707, C2: 0.0623068142, C3: 155.23629
    },
    nD: 1.7847
  },
  
  // F2 - Flint glass, moderate dispersion
  F2: {
    name: 'F2 (Flint)',
    sellmeier: {
      B1: 1.34533359, B2: 0.209073176, B3: 0.937357162,
      C1: 0.00997743871, C2: 0.0470450767, C3: 111.886764
    },
    nD: 1.6200
  },
  
  // N-BK7 - Modern BK7 equivalent
  NBK7: {
    name: 'N-BK7 (Modern Borosilicate)',
    sellmeier: {
      B1: 1.03961212, B2: 0.231792344, B3: 1.01046945,
      C1: 0.00600069867, C2: 0.0200179144, C3: 103.560653
    },
    nD: 1.5168
  }
};

/**
 * Calculate refractive index using Sellmeier equation
 * This is the physically accurate way to model dispersion
 * 
 * @param wavelength Wavelength in nanometers
 * @param material Glass material properties
 * @returns Refractive index at given wavelength
 */
export function sellmeierIndex(wavelength: number, material: GlassMaterial): number {
  // Convert wavelength from nm to micrometers (Sellmeier uses μm)
  const λ = wavelength / 1000;
  const λ2 = λ * λ;
  
  const { B1, B2, B3, C1, C2, C3 } = material.sellmeier;
  
  const n2 = 1 +
    (B1 * λ2) / (λ2 - C1) +
    (B2 * λ2) / (λ2 - C2) +
    (B3 * λ2) / (λ2 - C3);
  
  return Math.sqrt(n2);
}

/**
 * Simplified Cauchy equation for quick calculations
 * n(λ) = A + B/λ² + C/λ⁴
 * Less accurate than Sellmeier but faster
 */
export function cauchyIndex(wavelength: number, A: number, B: number, C: number = 0): number {
  const λ = wavelength / 1000; // Convert to micrometers
  return A + B / (λ * λ) + C / Math.pow(λ, 4);
}

/**
 * Apply Snell's law to calculate refracted ray direction
 * 
 * n1 * sin(θ1) = n2 * sin(θ2)
 * 
 * @param incident Incident ray direction (normalized)
 * @param normal Surface normal (pointing into the medium the ray is entering)
 * @param n1 Refractive index of incident medium
 * @param n2 Refractive index of transmission medium
 * @returns Refracted direction, or null if total internal reflection
 */
export function snellRefract(
  incident: THREE.Vector3,
  normal: THREE.Vector3,
  n1: number,
  n2: number
): THREE.Vector3 | null {
  const ratio = n1 / n2;
  const cosI = -normal.dot(incident);
  const sin2T = ratio * ratio * (1 - cosI * cosI);
  
  // Total internal reflection check
  if (sin2T > 1) {
    return null;
  }
  
  const cosT = Math.sqrt(1 - sin2T);
  
  // Refracted direction
  const refracted = incident.clone()
    .multiplyScalar(ratio)
    .add(normal.clone().multiplyScalar(ratio * cosI - cosT));
  
  return refracted.normalize();
}

/**
 * Calculate Fresnel reflection coefficient (unpolarized light approximation)
 * Returns the fraction of light that is reflected
 */
export function fresnelReflectance(
  cosI: number,
  n1: number,
  n2: number
): number {
  const ratio = n1 / n2;
  const sin2T = ratio * ratio * (1 - cosI * cosI);
  
  if (sin2T > 1) {
    return 1; // Total internal reflection
  }
  
  const cosT = Math.sqrt(1 - sin2T);
  
  // Fresnel equations for s and p polarization
  const Rs = Math.pow((n1 * cosI - n2 * cosT) / (n1 * cosI + n2 * cosT), 2);
  const Rp = Math.pow((n1 * cosT - n2 * cosI) / (n1 * cosT + n2 * cosI), 2);
  
  // Average for unpolarized light
  return (Rs + Rp) / 2;
}

/**
 * Calculate reflection direction
 */
export function reflect(incident: THREE.Vector3, normal: THREE.Vector3): THREE.Vector3 {
  return incident.clone().sub(
    normal.clone().multiplyScalar(2 * incident.dot(normal))
  ).normalize();
}

/**
 * Refract a ray through a surface
 * Handles the full physics: wavelength-dependent refraction, fresnel losses
 */
export function refractRay(
  ray: Ray,
  hitPoint: THREE.Vector3,
  surfaceNormal: THREE.Vector3,
  fromMaterial: GlassMaterial | null, // null = air
  toMaterial: GlassMaterial | null,   // null = air
  entering: boolean
): Ray | null {
  const n1 = fromMaterial ? sellmeierIndex(ray.wavelength, fromMaterial) : 1.0003; // Air
  const n2 = toMaterial ? sellmeierIndex(ray.wavelength, toMaterial) : 1.0003;
  
  // Orient normal based on whether we're entering or exiting
  const normal = entering ? surfaceNormal.clone() : surfaceNormal.clone().negate();
  
  const refractedDir = snellRefract(ray.direction, normal, n1, n2);
  
  if (!refractedDir) {
    // Total internal reflection - could return reflected ray instead
    return null;
  }
  
  // Calculate intensity loss from Fresnel reflection
  const cosI = Math.abs(normal.dot(ray.direction));
  const reflectance = fresnelReflectance(cosI, n1, n2);
  const transmittance = 1 - reflectance;
  
  // Create refracted ray with reduced intensity
  // Use larger offset to avoid self-intersection issues with raycaster
  return new Ray(
    hitPoint.clone().add(refractedDir.clone().multiplyScalar(0.05)),
    refractedDir,
    ray.wavelength,
    ray.intensity * transmittance
  );
}

/**
 * Get the critical angle for total internal reflection
 * Only valid when going from higher to lower refractive index
 */
export function criticalAngle(n1: number, n2: number): number | null {
  if (n1 <= n2) {
    return null; // No total internal reflection possible
  }
  return Math.asin(n2 / n1);
}

/**
 * Calculate the angular dispersion for a prism
 * This tells us how much the output angle changes per wavelength
 */
export function angularDispersion(
  prismAngle: number, // Apex angle in radians
  _incidentAngle: number,
  material: GlassMaterial,
  wavelength: number
): number {
  const n = sellmeierIndex(wavelength, material);
  const dnDλ = sellmeierDerivative(wavelength, material);
  
  // Approximate angular dispersion
  // dθ/dλ = (dn/dλ) * (2 * sin(A/2)) / sqrt(1 - n² * sin²(A/2))
  const A = prismAngle;
  const sinHalfA = Math.sin(A / 2);
  const denominator = Math.sqrt(1 - n * n * sinHalfA * sinHalfA);
  
  return dnDλ * (2 * sinHalfA) / denominator;
}

/**
 * Calculate derivative of refractive index with respect to wavelength
 * Useful for dispersion calculations
 */
function sellmeierDerivative(wavelength: number, material: GlassMaterial): number {
  // Numerical derivative
  const h = 0.1; // nm
  const n1 = sellmeierIndex(wavelength - h, material);
  const n2 = sellmeierIndex(wavelength + h, material);
  return (n2 - n1) / (2 * h);
}

/**
 * Calculate the deviation angle for a ray passing through a prism
 * at minimum deviation (symmetric path through prism)
 * 
 * @param prismAngle Apex angle of prism in radians (60° = π/3 for equilateral)
 * @param wavelength Wavelength in nm
 * @param material Glass material
 * @returns Deviation angle in radians
 */
export function calculateDeviation(
  prismAngle: number,
  wavelength: number,
  material: GlassMaterial
): number {
  const n = sellmeierIndex(wavelength, material);
  
  // At minimum deviation: sin((A + D)/2) = n * sin(A/2)
  // where A = prism angle, D = deviation angle
  // Solving for D: D = 2 * arcsin(n * sin(A/2)) - A
  const sinHalfA = Math.sin(prismAngle / 2);
  const sinHalfAPlusD = n * sinHalfA;
  
  // Check for total internal reflection (sin > 1)
  if (sinHalfAPlusD > 1) {
    return Math.PI; // Total internal reflection
  }
  
  const halfAPlusD = Math.asin(sinHalfAPlusD);
  const deviation = 2 * halfAPlusD - prismAngle;
  
  return deviation;
}

/**
 * Calculate the angular spread between two wavelengths through a prism
 * This tells us how far apart the colors will be
 */
export function calculateDispersionSpread(
  prismAngle: number,
  wavelength1: number,
  wavelength2: number,
  material: GlassMaterial
): number {
  const dev1 = calculateDeviation(prismAngle, wavelength1, material);
  const dev2 = calculateDeviation(prismAngle, wavelength2, material);
  return Math.abs(dev2 - dev1);
}

/**
 * Get dispersion data for key wavelengths
 * Useful for positioning director prisms
 */
export interface DispersionData {
  wavelength: number;
  refractiveIndex: number;
  deviation: number;  // radians
  deviationDeg: number;
}

export function getDispersionTable(
  prismAngle: number,
  material: GlassMaterial,
  wavelengths: number[] = [400, 450, 490, 535, 580, 620, 680]
): DispersionData[] {
  return wavelengths.map(wavelength => {
    const n = sellmeierIndex(wavelength, material);
    const deviation = calculateDeviation(prismAngle, wavelength, material);
    return {
      wavelength,
      refractiveIndex: n,
      deviation,
      deviationDeg: deviation * 180 / Math.PI
    };
  });
}

