/**
 * Light source - focused white light beam
 * Simulates a collimated light source (like a laser or focused spotlight)
 */

import * as THREE from 'three';
import { Ray, RayBundle } from '../optics/ray';
import { getSpectrumSamples, WHITE_LIGHT } from '../optics/spectrum';

export interface LightSourceConfig {
  position: THREE.Vector3;
  direction: THREE.Vector3;
  beamWidth: number;      // Width of the beam in cm
  intensity: number;      // 0-1
  wavelengthSamples: number; // How many spectral samples for dispersion
}

/**
 * White light source that can be traced through optical elements
 */
export class LightSource {
  config: LightSourceConfig;
  mesh: THREE.Group;
  
  // Cached ray bundle for tracing
  private rayBundle: RayBundle | null = null;
  
  constructor(config: Partial<LightSourceConfig> = {}) {
    this.config = {
      position: new THREE.Vector3(-20, 5, 0),
      direction: new THREE.Vector3(1, 0, 0).normalize(),
      beamWidth: 0.5,
      intensity: 1,
      wavelengthSamples: 12,
      ...config
    };
    
    this.mesh = this.createMesh();
  }
  
  /**
   * Create visual representation of the light source
   */
  private createMesh(): THREE.Group {
    const group = new THREE.Group();
    
    // Light housing (cylindrical)
    const housingGeometry = new THREE.CylinderGeometry(1.5, 1.5, 4, 16);
    const housingMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a1a1a,
      metalness: 0.8,
      roughness: 0.3
    });
    const housing = new THREE.Mesh(housingGeometry, housingMaterial);
    housing.rotation.z = Math.PI / 2;
    
    // Lens (front of the light)
    const lensGeometry = new THREE.CircleGeometry(1.2, 32);
    const lensMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffee,
      emissive: 0xffffdd,
      emissiveIntensity: 0.5,
      transparent: true,
      opacity: 0.9
    });
    const lens = new THREE.Mesh(lensGeometry, lensMaterial);
    lens.position.x = 2;
    lens.rotation.y = Math.PI / 2;
    
    // Point light for glow effect
    const pointLight = new THREE.PointLight(0xffffee, 0.5, 10);
    pointLight.position.x = 2;
    
    group.add(housing);
    group.add(lens);
    group.add(pointLight);
    
    group.position.copy(this.config.position);
    
    // Point the group toward the direction
    const target = this.config.position.clone().add(this.config.direction);
    group.lookAt(target);
    
    return group;
  }
  
  /**
   * Generate rays for tracing through the optical system
   * Returns a bundle of rays at different wavelengths
   */
  generateRays(): RayBundle {
    if (this.rayBundle) {
      return this.rayBundle;
    }
    
    const samples = getSpectrumSamples(this.config.wavelengthSamples);
    const bundle = new RayBundle();
    
    // Main beam center
    const origin = this.config.position.clone();
    origin.add(this.config.direction.clone().multiplyScalar(3)); // Start from lens position
    
    for (const sample of samples) {
      bundle.add(new Ray(
        origin.clone(),
        this.config.direction.clone(),
        sample.wavelength,
        this.config.intensity / samples.length
      ));
    }
    
    this.rayBundle = bundle;
    return bundle;
  }
  
  /**
   * Get a single white light ray (for visualization before dispersion)
   */
  getWhiteRay(): Ray {
    const origin = this.config.position.clone();
    origin.add(this.config.direction.clone().multiplyScalar(3));
    
    return new Ray(
      origin,
      this.config.direction.clone(),
      WHITE_LIGHT.wavelength,
      this.config.intensity
    );
  }
  
  /**
   * Invalidate cached rays (call when config changes)
   */
  invalidate(): void {
    this.rayBundle = null;
  }
  
  /**
   * Set position
   */
  setPosition(position: THREE.Vector3): void {
    this.config.position.copy(position);
    this.mesh.position.copy(position);
    this.invalidate();
  }
  
  /**
   * Set direction
   */
  setDirection(direction: THREE.Vector3): void {
    this.config.direction.copy(direction.normalize());
    const target = this.config.position.clone().add(this.config.direction.multiplyScalar(10));
    this.mesh.lookAt(target);
    this.invalidate();
  }
  
  /**
   * Export specs for blueprint
   */
  getSpecs(): object {
    return {
      type: 'Collimated White Light Source',
      position: {
        x: `${this.config.position.x.toFixed(2)} cm`,
        y: `${this.config.position.y.toFixed(2)} cm`,
        z: `${this.config.position.z.toFixed(2)} cm`
      },
      direction: {
        x: this.config.direction.x.toFixed(3),
        y: this.config.direction.y.toFixed(3),
        z: this.config.direction.z.toFixed(3)
      },
      beamWidth: `${this.config.beamWidth} cm`,
      spectralSamples: this.config.wavelengthSamples
    };
  }
}

