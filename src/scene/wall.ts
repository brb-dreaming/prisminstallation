/**
 * Wall - solid blocking objects that stop light rays
 * Used to create obstacles and boundaries in the optical simulation
 */

import * as THREE from 'three';
import type { Ray, RayHit } from '../optics/ray';

export interface WallConfig {
  position: THREE.Vector3;
  width: number;
  height: number;
  depth: number;
  rotationY: number;
}

/**
 * Represents a solid wall/block that stops light rays
 */
export class Wall {
  config: WallConfig;
  mesh: THREE.Mesh;
  
  // Cached world-space data for ray intersection
  private boundingBox: THREE.Box3 = new THREE.Box3();
  
  // Interaction state
  isSelected: boolean = false;
  isHovered: boolean = false;
  
  // Selection indicator
  private selectionRing: THREE.LineLoop | null = null;
  
  constructor(config: Partial<WallConfig> = {}) {
    this.config = {
      position: new THREE.Vector3(0, 5, 0),
      width: 2,
      height: 10,
      depth: 2,
      rotationY: 0,
      ...config
    };
    
    this.mesh = this.createMesh();
    this.createSelectionIndicator();
    this.updateBoundingBox();
  }
  
  /**
   * Create a subtle rectangular ring indicator for selection state
   */
  private createSelectionIndicator(): void {
    const { width, depth } = this.config;
    const scale = 1.3;
    
    // Create a rectangular ring around the wall's base
    const halfW = (width / 2) * scale;
    const halfD = (depth / 2) * scale;
    
    const points = [
      new THREE.Vector3(-halfW, 0, -halfD),
      new THREE.Vector3(halfW, 0, -halfD),
      new THREE.Vector3(halfW, 0, halfD),
      new THREE.Vector3(-halfW, 0, halfD),
      new THREE.Vector3(-halfW, 0, -halfD), // Close the loop
    ];
    
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color: 0xd4af37, // Gold accent color
      transparent: true,
      opacity: 0,
      linewidth: 1,
    });
    
    this.selectionRing = new THREE.LineLoop(geometry, material);
    this.selectionRing.position.y = -this.config.height / 2 - 0.1; // Just below the wall
    this.selectionRing.visible = false;
    this.mesh.add(this.selectionRing);
  }
  
  /**
   * Create the Three.js mesh for the wall
   */
  private createMesh(): THREE.Mesh {
    const { width, height, depth } = this.config;
    
    const geometry = new THREE.BoxGeometry(width, height, depth);
    
    // Dark matte material - non-reflective solid
    const material = new THREE.MeshStandardMaterial({
      color: 0x2a2a2e,
      metalness: 0.1,
      roughness: 0.9,
      side: THREE.DoubleSide
    });
    
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(this.config.position);
    mesh.rotation.y = this.config.rotationY;
    
    // Store reference to this wall on the mesh for raycasting
    mesh.userData.wall = this;
    mesh.userData.isWall = true;
    
    return mesh;
  }
  
  /**
   * Update cached bounding box for ray intersection
   */
  updateBoundingBox(): void {
    this.mesh.updateMatrixWorld(true);
    this.boundingBox.setFromObject(this.mesh);
  }
  
  /**
   * Ray-box intersection test
   */
  intersectRay(ray: Ray, minDist: number = 0.001): RayHit | null {
    // Use Three.js raycaster for mesh intersection
    const raycaster = new THREE.Raycaster(ray.origin, ray.direction);
    raycaster.near = minDist;
    
    const intersects = raycaster.intersectObject(this.mesh, false);
    
    if (intersects.length > 0) {
      const hit = intersects[0];
      const normal = hit.face?.normal.clone().applyMatrix3(
        new THREE.Matrix3().getNormalMatrix(this.mesh.matrixWorld)
      ).normalize() || new THREE.Vector3(0, 1, 0);
      
      return {
        point: hit.point,
        normal,
        distance: hit.distance,
        entering: ray.direction.dot(normal) < 0
      };
    }
    
    return null;
  }
  
  /**
   * Set position and update mesh + bounding box
   */
  setPosition(position: THREE.Vector3): void {
    this.config.position.copy(position);
    this.mesh.position.copy(position);
    this.updateBoundingBox();
  }
  
  /**
   * Set rotation and update mesh + bounding box
   */
  setRotation(rotationY: number): void {
    this.config.rotationY = rotationY;
    this.mesh.rotation.y = rotationY;
    this.updateBoundingBox();
  }
  
  /**
   * Get current rotation in degrees
   */
  getRotationDegrees(): number {
    let deg = (this.config.rotationY * 180 / Math.PI) % 360;
    if (deg < 0) deg += 360;
    return deg;
  }
  
  /**
   * Set wall width (length) and rebuild mesh
   */
  setWidth(width: number): void {
    this.config.width = Math.max(0.5, Math.min(20, width));
    this.rebuildMesh();
  }
  
  /**
   * Rebuild the mesh after dimension changes
   */
  private rebuildMesh(): void {
    const { width, height, depth } = this.config;
    
    // Dispose old geometry
    this.mesh.geometry.dispose();
    
    // Create new geometry
    const geometry = new THREE.BoxGeometry(width, height, depth);
    this.mesh.geometry = geometry;
    
    // Update selection ring if it exists
    if (this.selectionRing) {
      this.mesh.remove(this.selectionRing);
      this.selectionRing.geometry.dispose();
      (this.selectionRing.material as THREE.Material).dispose();
      this.createSelectionIndicator();
      
      // Restore selection state
      if (this.isSelected && this.selectionRing) {
        this.selectionRing.visible = true;
        const ringMaterial = this.selectionRing.material as THREE.LineBasicMaterial;
        ringMaterial.opacity = 0.6;
      }
    }
    
    this.updateBoundingBox();
  }
  
  /**
   * Visual feedback for selection state
   */
  setSelected(selected: boolean): void {
    this.isSelected = selected;
    const material = this.mesh.material as THREE.MeshStandardMaterial;
    if (selected) {
      material.emissive = new THREE.Color(0x222222);
      // Show selection ring
      if (this.selectionRing) {
        this.selectionRing.visible = true;
        const ringMaterial = this.selectionRing.material as THREE.LineBasicMaterial;
        ringMaterial.opacity = 0.6;
      }
    } else {
      material.emissive = new THREE.Color(0x000000);
      // Hide selection ring
      if (this.selectionRing) {
        this.selectionRing.visible = false;
        const ringMaterial = this.selectionRing.material as THREE.LineBasicMaterial;
        ringMaterial.opacity = 0;
      }
    }
  }
  
  setHovered(hovered: boolean): void {
    this.isHovered = hovered;
    const material = this.mesh.material as THREE.MeshStandardMaterial;
    if (hovered && !this.isSelected) {
      material.emissive = new THREE.Color(0x222222);
    } else if (!this.isSelected) {
      material.emissive = new THREE.Color(0x000000);
    }
  }
  
  /**
   * Export specs for blueprint
   */
  getSpecs(): object {
    return {
      type: 'wall',
      dimensions: {
        width: `${this.config.width} cm`,
        height: `${this.config.height} cm`,
        depth: `${this.config.depth} cm`
      },
      position: {
        x: `${this.config.position.x.toFixed(2)} cm`,
        y: `${this.config.position.y.toFixed(2)} cm`,
        z: `${this.config.position.z.toFixed(2)} cm`
      },
      rotation: `${this.getRotationDegrees().toFixed(1)}°`
    };
  }
}

/**
 * Create a standard wall block
 */
export function createWall(
  position: THREE.Vector3,
  config: Partial<WallConfig> = {}
): Wall {
  return new Wall({
    position,
    width: 2,
    height: 10,
    depth: 2,
    ...config
  });
}

