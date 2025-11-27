/**
 * Light beam visualization
 * Renders traced rays as beautiful glowing beams
 */

import * as THREE from 'three';
import { Ray } from '../optics/ray';
import { wavelengthToRGB, WHITE_LIGHT } from '../optics/spectrum';

export interface BeamSegment {
  start: THREE.Vector3;
  end: THREE.Vector3;
  wavelength: number;
  intensity: number;
}

/**
 * Manages visual representation of light beams
 */
export class LightBeamRenderer {
  private group: THREE.Group;
  private beamMeshes: THREE.Mesh[] = [];
  private glowMeshes: THREE.Mesh[] = [];
  
  // Shared materials for different wavelengths
  private materials: Map<number, THREE.MeshBasicMaterial> = new Map();
  private glowMaterials: Map<number, THREE.MeshBasicMaterial> = new Map();
  
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'light-beams';
  }
  
  getGroup(): THREE.Group {
    return this.group;
  }
  
  /**
   * Clear all beams
   */
  clear(): void {
    for (const mesh of this.beamMeshes) {
      mesh.geometry.dispose();
      this.group.remove(mesh);
    }
    for (const mesh of this.glowMeshes) {
      mesh.geometry.dispose();
      this.group.remove(mesh);
    }
    this.beamMeshes = [];
    this.glowMeshes = [];
  }
  
  /**
   * Get or create material for a wavelength
   */
  private getMaterial(wavelength: number, forGlow: boolean = false): THREE.MeshBasicMaterial {
    const cache = forGlow ? this.glowMaterials : this.materials;
    
    if (cache.has(wavelength)) {
      return cache.get(wavelength)!;
    }
    
    let color: THREE.Color;
    if (wavelength === WHITE_LIGHT.wavelength) {
      color = new THREE.Color(WHITE_LIGHT.hex);
    } else {
      const rgb = wavelengthToRGB(wavelength);
      color = new THREE.Color(rgb.r / 255, rgb.g / 255, rgb.b / 255);
    }
    
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: forGlow ? 0.15 : 0.9,
      side: THREE.DoubleSide,
      depthWrite: !forGlow
    });
    
    cache.set(wavelength, material);
    return material;
  }
  
  /**
   * Add a beam segment
   */
  addBeam(segment: BeamSegment): void {
    const { start, end, wavelength, intensity } = segment;
    
    const direction = end.clone().sub(start);
    const length = direction.length();
    
    if (length < 0.01) return;
    
    direction.normalize();
    
    // Core beam (thin cylinder)
    const coreRadius = 0.08;
    const coreGeometry = new THREE.CylinderGeometry(coreRadius, coreRadius, length, 8);
    coreGeometry.rotateX(Math.PI / 2);
    
    const coreMaterial = this.getMaterial(wavelength, false);
    const coreMesh = new THREE.Mesh(coreGeometry, coreMaterial);
    
    // Position at midpoint
    const midpoint = start.clone().add(end).multiplyScalar(0.5);
    coreMesh.position.copy(midpoint);
    
    // Orient along direction
    coreMesh.lookAt(end);
    
    this.group.add(coreMesh);
    this.beamMeshes.push(coreMesh);
    
    // Glow (larger, more transparent cylinder)
    const glowRadius = 0.25 * (1 + intensity * 0.5);
    const glowGeometry = new THREE.CylinderGeometry(glowRadius, glowRadius, length, 8);
    glowGeometry.rotateX(Math.PI / 2);
    
    const glowMaterial = this.getMaterial(wavelength, true);
    const glowMesh = new THREE.Mesh(glowGeometry, glowMaterial);
    glowMesh.position.copy(midpoint);
    glowMesh.lookAt(end);
    
    this.group.add(glowMesh);
    this.glowMeshes.push(glowMesh);
  }
  
  /**
   * Add the white light beam from source to splitter
   */
  addWhiteBeam(start: THREE.Vector3, end: THREE.Vector3): void {
    this.addBeam({
      start,
      end,
      wavelength: WHITE_LIGHT.wavelength,
      intensity: 1
    });
  }
  
  /**
   * Render a complete ray path (multiple segments)
   */
  renderRayPath(points: THREE.Vector3[], wavelength: number, intensity: number = 1): void {
    for (let i = 0; i < points.length - 1; i++) {
      this.addBeam({
        start: points[i],
        end: points[i + 1],
        wavelength,
        intensity
      });
    }
  }
  
  /**
   * Batch render multiple rays
   */
  renderRays(rays: { ray: Ray; endPoint: THREE.Vector3 }[]): void {
    for (const { ray, endPoint } of rays) {
      this.addBeam({
        start: ray.origin,
        end: endPoint,
        wavelength: ray.wavelength,
        intensity: ray.intensity
      });
    }
  }
  
  /**
   * Dispose all resources
   */
  dispose(): void {
    this.clear();
    
    for (const material of this.materials.values()) {
      material.dispose();
    }
    for (const material of this.glowMaterials.values()) {
      material.dispose();
    }
    
    this.materials.clear();
    this.glowMaterials.clear();
  }
}

/**
 * Create endpoint visualization (where beams hit the backdrop)
 */
export class BeamEndpoints {
  private group: THREE.Group;
  private pointMeshes: THREE.Mesh[] = [];
  
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'beam-endpoints';
  }
  
  getGroup(): THREE.Group {
    return this.group;
  }
  
  clear(): void {
    for (const mesh of this.pointMeshes) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      this.group.remove(mesh);
    }
    this.pointMeshes = [];
  }
  
  /**
   * Add an endpoint (where a beam hits a surface)
   */
  addEndpoint(position: THREE.Vector3, wavelength: number, intensity: number = 1): void {
    const rgb = wavelengthToRGB(wavelength);
    const color = new THREE.Color(rgb.r / 255, rgb.g / 255, rgb.b / 255);
    
    // Glowing disc
    const geometry = new THREE.CircleGeometry(0.5 * intensity, 32);
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide
    });
    
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(position);
    mesh.position.x += 0.01; // Slight offset to avoid z-fighting with backdrop
    mesh.rotation.y = Math.PI / 2; // Face the viewer (assuming backdrop is on +X)
    
    this.group.add(mesh);
    this.pointMeshes.push(mesh);
  }
  
  dispose(): void {
    this.clear();
  }
}

