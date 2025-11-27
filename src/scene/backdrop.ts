/**
 * Backdrop / projection surface
 * Where the light beams ultimately land and create the visual pattern
 * Includes color mixing visualization when multiple beams overlap
 */

import * as THREE from 'three';
import { wavelengthToRGB, mixColors, getColorGroupForWavelength, COLOR_GROUPS } from '../optics/spectrum';

export interface BackdropConfig {
  position: THREE.Vector3;
  width: number;   // cm
  height: number;  // cm
  color: number;
}

/**
 * Represents a beam endpoint on the backdrop for color mixing
 */
export interface BeamEndpointData {
  position: THREE.Vector3;
  wavelength: number;
  intensity: number;
  colorGroup: string | null;  // 'warm', 'green', 'cool', or null
}

/**
 * Backdrop surface for projecting light
 */
export class Backdrop {
  config: BackdropConfig;
  mesh: THREE.Mesh;
  
  constructor(config: Partial<BackdropConfig> = {}) {
    this.config = {
      position: new THREE.Vector3(30, 0, 0),
      width: 60,
      height: 50,
      color: 0x0a0a0a,
      ...config
    };
    
    this.mesh = this.createMesh();
  }
  
  private createMesh(): THREE.Mesh {
    const geometry = new THREE.PlaneGeometry(this.config.height, this.config.width);
    
    const material = new THREE.MeshStandardMaterial({
      color: this.config.color,
      roughness: 0.9,
      metalness: 0,
      side: THREE.DoubleSide
    });
    
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(this.config.position);
    mesh.rotation.y = -Math.PI / 2; // Face toward the prisms
    
    return mesh;
  }
  
  /**
   * Get the plane equation for ray intersection
   */
  getPlane(): { normal: THREE.Vector3; point: THREE.Vector3 } {
    // Determine plane normal based on position - face toward the center
    const normalX = this.config.position.x > 0 ? -1 : 1;
    return {
      normal: new THREE.Vector3(normalX, 0, 0),
      point: this.config.position.clone()
    };
  }
  
  /**
   * Check if a point is within the backdrop bounds
   */
  isWithinBounds(point: THREE.Vector3): boolean {
    const local = point.clone().sub(this.config.position);
    return (
      Math.abs(local.y) <= this.config.height / 2 &&
      Math.abs(local.z) <= this.config.width / 2
    );
  }
  
  /**
   * Export specs for blueprint
   */
  getSpecs(): object {
    return {
      type: 'Projection Backdrop',
      position: {
        x: `${this.config.position.x.toFixed(2)} cm`,
        y: `${this.config.position.y.toFixed(2)} cm`,
        z: `${this.config.position.z.toFixed(2)} cm`
      },
      dimensions: {
        width: `${this.config.width} cm`,
        height: `${this.config.height} cm`
      }
    };
  }
}

/**
 * Target zone - the "secret garden" convergence point
 * Shows special effects when all three color groups converge (white light!)
 */
export class TargetZone {
  position: THREE.Vector3;
  radius: number;
  mesh: THREE.Mesh;
  innerGlow: THREE.Mesh | null = null;
  
  // Visual state
  private glowIntensity: number = 0;
  private pulsePhase: number = 0;
  private isWhiteLight: boolean = false;
  private whiteGlowPhase: number = 0;
  
  constructor(position: THREE.Vector3, radius: number = 3) {
    this.position = position.clone();
    this.radius = radius;
    this.mesh = this.createMesh();
    this.createInnerGlow();
  }
  
  private createMesh(): THREE.Mesh {
    // Subtle ring to indicate target area
    const geometry = new THREE.RingGeometry(this.radius - 0.2, this.radius, 64);
    
    const material = new THREE.MeshBasicMaterial({
      color: 0x333333,
      transparent: true,
      opacity: 0.15,
      side: THREE.DoubleSide
    });
    
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(this.position);
    mesh.position.x -= 0.01; // Slight offset in front of backdrop
    mesh.rotation.y = Math.PI / 2;
    
    return mesh;
  }
  
  private createInnerGlow(): void {
    // Inner glow disc for white light effect
    const geometry = new THREE.CircleGeometry(this.radius * 0.8, 64);
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide
    });
    
    this.innerGlow = new THREE.Mesh(geometry, material);
    this.innerGlow.position.copy(this.position);
    this.innerGlow.position.x -= 0.02;
    this.innerGlow.rotation.y = Math.PI / 2;
    this.mesh.add(this.innerGlow);
  }
  
  /**
   * Check if a point is within the target zone
   */
  containsPoint(point: THREE.Vector3): boolean {
    const dx = point.y - this.position.y;
    const dz = point.z - this.position.z;
    return Math.sqrt(dx * dx + dz * dz) <= this.radius;
  }
  
  /**
   * Calculate how centered a point is (0 = edge, 1 = center)
   */
  getCenteredness(point: THREE.Vector3): number {
    const dx = point.y - this.position.y;
    const dz = point.z - this.position.z;
    const distance = Math.sqrt(dx * dx + dz * dz);
    return Math.max(0, 1 - distance / this.radius);
  }
  
  /**
   * Update visual state based on convergence
   */
  setConvergence(convergence: number, isWhiteLight: boolean = false): void {
    this.glowIntensity = convergence;
    this.isWhiteLight = isWhiteLight;
    
    const material = this.mesh.material as THREE.MeshBasicMaterial;
    material.opacity = 0.1 + convergence * 0.4;
    
    if (isWhiteLight) {
      // VICTORY! White light recombined - brilliant white glow
      material.color.setRGB(1, 1, 1);
      material.opacity = 0.6;
      
      if (this.innerGlow) {
        const innerMat = this.innerGlow.material as THREE.MeshBasicMaterial;
        innerMat.opacity = 0.9;
        innerMat.color.setRGB(1, 0.98, 0.95); // Warm white
      }
    } else if (convergence > 0.5) {
      // Getting close - golden glow
      const t = (convergence - 0.5) * 2;
      material.color.setRGB(
        0.3 + t * 0.5,
        0.3 + t * 0.3,
        0.2
      );
      
      if (this.innerGlow) {
        const innerMat = this.innerGlow.material as THREE.MeshBasicMaterial;
        innerMat.opacity = t * 0.3;
        innerMat.color.setRGB(0.9, 0.8, 0.6);
      }
    } else {
      // Normal state
      material.color.setRGB(0.2, 0.2, 0.2);
      
      if (this.innerGlow) {
        const innerMat = this.innerGlow.material as THREE.MeshBasicMaterial;
        innerMat.opacity = 0;
      }
    }
  }
  
  /**
   * Animation update
   */
  update(deltaTime: number): void {
    if (this.isWhiteLight) {
      // Spectacular pulsing white glow for victory state
      this.whiteGlowPhase += deltaTime * 3;
      const pulse = Math.sin(this.whiteGlowPhase) * 0.15 + 1;
      this.mesh.scale.setScalar(pulse);
      
      // Inner glow pulses opposite phase
      if (this.innerGlow) {
        const innerPulse = Math.sin(this.whiteGlowPhase + Math.PI) * 0.1 + 1;
        this.innerGlow.scale.setScalar(innerPulse);
        
        // Shimmer effect on opacity
        const innerMat = this.innerGlow.material as THREE.MeshBasicMaterial;
        innerMat.opacity = 0.7 + Math.sin(this.whiteGlowPhase * 2) * 0.3;
      }
    } else if (this.glowIntensity > 0.7) {
      // Gentle pulse when near solution
      this.pulsePhase += deltaTime * 2;
      const pulse = Math.sin(this.pulsePhase) * 0.08 + 1;
      this.mesh.scale.setScalar(pulse);
    } else {
      this.mesh.scale.setScalar(1);
      if (this.innerGlow) {
        this.innerGlow.scale.setScalar(1);
      }
    }
  }
  
  /**
   * Export specs for blueprint
   */
  getSpecs(): object {
    return {
      type: 'Target Convergence Zone',
      position: {
        y: `${this.position.y.toFixed(2)} cm`,
        z: `${this.position.z.toFixed(2)} cm`
      },
      radius: `${this.radius} cm`
    };
  }
}

/**
 * Color Mixing Zone - visualizes where beams overlap on the backdrop
 * Shows additive color mixing effects (R+G=Yellow, G+B=Cyan, R+B=Magenta, R+G+B=White)
 */
export class ColorMixingDisplay {
  private group: THREE.Group;
  private mixingSpots: THREE.Mesh[] = [];
  private backdropPosition: THREE.Vector3;
  
  // Track which color groups are hitting where
  private colorGroupEndpoints: Map<string, THREE.Vector3[]> = new Map();
  
  constructor(backdropPosition: THREE.Vector3) {
    this.group = new THREE.Group();
    this.group.name = 'color-mixing-display';
    this.backdropPosition = backdropPosition.clone();
  }
  
  getGroup(): THREE.Group {
    return this.group;
  }
  
  /**
   * Clear all mixing visualizations
   */
  clear(): void {
    for (const mesh of this.mixingSpots) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      this.group.remove(mesh);
    }
    this.mixingSpots = [];
    this.colorGroupEndpoints.clear();
  }
  
  /**
   * Add a beam endpoint for color mixing calculation
   */
  addEndpoint(endpoint: BeamEndpointData): void {
    const group = getColorGroupForWavelength(endpoint.wavelength);
    if (!group) return;
    
    const groupName = group.name.toLowerCase();
    if (!this.colorGroupEndpoints.has(groupName)) {
      this.colorGroupEndpoints.set(groupName, []);
    }
    this.colorGroupEndpoints.get(groupName)!.push(endpoint.position.clone());
  }
  
  /**
   * Calculate and display mixing zones after all endpoints are added
   */
  calculateMixingZones(): { hasOverlap: boolean; isWhiteMix: boolean; mixingInfo: string } {
    const proximityThreshold = 3; // cm - how close beams need to be to "mix"
    
    // Get average position for each color group
    const groupCenters = new Map<string, THREE.Vector3>();
    for (const [groupName, positions] of this.colorGroupEndpoints) {
      if (positions.length > 0) {
        const center = new THREE.Vector3();
        positions.forEach(p => center.add(p));
        center.divideScalar(positions.length);
        groupCenters.set(groupName, center);
      }
    }
    
    // Check for overlaps between groups
    const groups = Array.from(groupCenters.keys());
    const overlaps: { groups: string[]; position: THREE.Vector3; color: THREE.Color }[] = [];
    
    // Check all pairs
    for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        const pos1 = groupCenters.get(groups[i])!;
        const pos2 = groupCenters.get(groups[j])!;
        const distance = pos1.distanceTo(pos2);
        
        if (distance < proximityThreshold * 2) {
          const midpoint = pos1.clone().add(pos2).multiplyScalar(0.5);
          const mixedColor = this.getMixedColor([groups[i], groups[j]]);
          overlaps.push({ groups: [groups[i], groups[j]], position: midpoint, color: mixedColor });
        }
      }
    }
    
    // Check for triple overlap (all three colors = white!)
    let isWhiteMix = false;
    if (groups.length >= 3) {
      const positions = groups.map(g => groupCenters.get(g)!);
      const centroid = new THREE.Vector3();
      positions.forEach(p => centroid.add(p));
      centroid.divideScalar(positions.length);
      
      // Check if all groups are close to centroid
      const allClose = positions.every(p => p.distanceTo(centroid) < proximityThreshold);
      if (allClose) {
        isWhiteMix = true;
        // Add white glow at centroid
        this.createMixingSpot(centroid, new THREE.Color(1, 1, 1), 4, 'WHITE LIGHT!');
      }
    }
    
    // Create mixing spots for pair overlaps (only if not all three converging)
    if (!isWhiteMix) {
      for (const overlap of overlaps) {
        this.createMixingSpot(overlap.position, overlap.color, 2);
      }
    }
    
    // Build info string
    let mixingInfo = '';
    if (isWhiteMix) {
      mixingInfo = '✨ WHITE LIGHT RECOMBINED! ✨';
    } else if (overlaps.length > 0) {
      const mixNames = overlaps.map(o => {
        const colorName = this.getMixColorName(o.groups);
        return colorName;
      });
      mixingInfo = `Color mixing: ${mixNames.join(', ')}`;
    }
    
    return {
      hasOverlap: overlaps.length > 0 || isWhiteMix,
      isWhiteMix,
      mixingInfo
    };
  }
  
  /**
   * Create a glowing spot where colors mix
   */
  private createMixingSpot(position: THREE.Vector3, color: THREE.Color, size: number, _label?: string): void {
    // Outer glow
    const glowGeometry = new THREE.CircleGeometry(size * 1.5, 32);
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide
    });
    const glow = new THREE.Mesh(glowGeometry, glowMaterial);
    glow.position.copy(position);
    glow.position.x = this.backdropPosition.x - 0.02;
    glow.rotation.y = Math.PI / 2;
    this.group.add(glow);
    this.mixingSpots.push(glow);
    
    // Core bright spot
    const coreGeometry = new THREE.CircleGeometry(size * 0.7, 32);
    const coreMaterial = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide
    });
    const core = new THREE.Mesh(coreGeometry, coreMaterial);
    core.position.copy(position);
    core.position.x = this.backdropPosition.x - 0.03;
    core.rotation.y = Math.PI / 2;
    this.group.add(core);
    this.mixingSpots.push(core);
  }
  
  /**
   * Get the mixed color for a set of color groups (additive mixing)
   */
  private getMixedColor(groupNames: string[]): THREE.Color {
    const colors: { r: number; g: number; b: number }[] = [];
    
    for (const name of groupNames) {
      const group = Object.values(COLOR_GROUPS).find(g => g.name.toLowerCase() === name);
      if (group) {
        colors.push(group.color);
      }
    }
    
    const mixed = mixColors(colors);
    return new THREE.Color(mixed.r / 255, mixed.g / 255, mixed.b / 255);
  }
  
  /**
   * Get human-readable name for a color mix
   */
  private getMixColorName(groupNames: string[]): string {
    const sorted = [...groupNames].sort();
    
    if (sorted.includes('warm') && sorted.includes('cool') && sorted.includes('green')) {
      return 'White';
    }
    if (sorted.includes('warm') && sorted.includes('green')) {
      return 'Yellow';
    }
    if (sorted.includes('green') && sorted.includes('cool')) {
      return 'Cyan';
    }
    if (sorted.includes('warm') && sorted.includes('cool')) {
      return 'Magenta';
    }
    
    return 'Mixed';
  }
  
  dispose(): void {
    this.clear();
  }
}

