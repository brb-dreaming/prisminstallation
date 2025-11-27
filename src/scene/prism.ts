/**
 * Prism geometry and physics
 * Handles both visual representation and optical calculations
 */

import * as THREE from 'three';
import type { RayHit } from '../optics/ray';
import { Ray } from '../optics/ray';
import type { GlassMaterial } from '../optics/refraction';
import { GLASS_MATERIALS, refractRay, reflect } from '../optics/refraction';

export interface PrismConfig {
  // Physical dimensions (in centimeters for real-world scale)
  sideLength: number;  // Equilateral triangle side length
  height: number;      // Prism height (extrusion depth)
  
  // Material
  material: GlassMaterial;
  
  // Position and rotation
  position: THREE.Vector3;
  rotationY: number;   // Rotation around vertical axis (radians)
  
  // Type
  type: 'splitter' | 'director';
  
  // For directors: which spectral band this catches
  targetWavelength?: number;
}

/**
 * Represents a triangular prism for light refraction
 */
export class Prism {
  config: PrismConfig;
  mesh: THREE.Mesh;
  
  // Cached world-space triangles for ray intersection
  private triangles: { v0: THREE.Vector3; v1: THREE.Vector3; v2: THREE.Vector3; normal: THREE.Vector3 }[] = [];
  
  // Interaction state
  isSelected: boolean = false;
  isHovered: boolean = false;
  
  constructor(config: PrismConfig) {
    this.config = { ...config };
    this.mesh = this.createMesh();
    this.updateTriangles();
  }
  
  /**
   * Create the Three.js mesh for the prism
   */
  private createMesh(): THREE.Mesh {
    const { sideLength, height } = this.config;
    
    // Create geometry manually for precise control
    const geometry = this.createPrismGeometry(sideLength, height);
    
    // Glass-like material
    const material = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 0,
      roughness: 0.05,
      transmission: 0.9,
      thickness: sideLength * 0.3,
      ior: this.config.material.nD,
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide,
      envMapIntensity: 0.5,
      clearcoat: 1,
      clearcoatRoughness: 0.1
    });
    
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(this.config.position);
    mesh.rotation.y = this.config.rotationY;
    
    // Store reference to this prism on the mesh for raycasting
    mesh.userData.prism = this;
    
    return mesh;
  }
  
  /**
   * Create triangular prism geometry
   */
  private createPrismGeometry(sideLength: number, height: number): THREE.BufferGeometry {
    const h = (sideLength * Math.sqrt(3)) / 2; // Triangle height
    const halfH = height / 2;
    
    // Equilateral triangle vertices (in XZ plane, centered)
    const v0 = new THREE.Vector3(0, 0, h * 2/3);           // Front vertex
    const v1 = new THREE.Vector3(-sideLength/2, 0, -h/3); // Back left
    const v2 = new THREE.Vector3(sideLength/2, 0, -h/3);  // Back right
    
    // 6 vertices: 3 on bottom (y=-halfH), 3 on top (y=+halfH)
    const vertices = new Float32Array([
      // Bottom triangle
      v0.x, -halfH, v0.z,  // 0
      v1.x, -halfH, v1.z,  // 1
      v2.x, -halfH, v2.z,  // 2
      // Top triangle
      v0.x, halfH, v0.z,   // 3
      v1.x, halfH, v1.z,   // 4
      v2.x, halfH, v2.z,   // 5
    ]);
    
    // Indices for faces (CCW winding for outward-facing normals)
    const indices = new Uint16Array([
      // Bottom face (normal pointing down)
      0, 2, 1,
      // Top face (normal pointing up)
      3, 4, 5,
      // Side faces
      // Front-left face (v0-v1 edge)
      0, 1, 4,
      0, 4, 3,
      // Front-right face (v0-v2 edge)
      0, 3, 5,
      0, 5, 2,
      // Back face (v1-v2 edge)
      1, 2, 5,
      1, 5, 4,
    ]);
    
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.computeVertexNormals();
    
    return geometry;
  }
  
  /**
   * Update cached world-space triangles for ray intersection
   */
  updateTriangles(): void {
    this.triangles = [];
    this.mesh.updateMatrixWorld(true);
    
    const { sideLength, height } = this.config;
    const h = (sideLength * Math.sqrt(3)) / 2;
    const halfH = height / 2;
    
    // Local vertices
    const localVerts = [
      new THREE.Vector3(0, -halfH, h * 2/3),           // 0 - bottom front
      new THREE.Vector3(-sideLength/2, -halfH, -h/3), // 1 - bottom back-left
      new THREE.Vector3(sideLength/2, -halfH, -h/3),  // 2 - bottom back-right
      new THREE.Vector3(0, halfH, h * 2/3),           // 3 - top front
      new THREE.Vector3(-sideLength/2, halfH, -h/3), // 4 - top back-left
      new THREE.Vector3(sideLength/2, halfH, -h/3),  // 5 - top back-right
    ];
    
    // Transform to world space
    const worldVerts = localVerts.map(v => v.clone().applyMatrix4(this.mesh.matrixWorld));
    
    // Helper to create triangle and compute outward normal
    const addTriangle = (i0: number, i1: number, i2: number) => {
      const v0 = worldVerts[i0];
      const v1 = worldVerts[i1];
      const v2 = worldVerts[i2];
      const edge1 = v1.clone().sub(v0);
      const edge2 = v2.clone().sub(v0);
      const normal = edge1.cross(edge2).normalize();
      this.triangles.push({ v0, v1, v2, normal });
    };
    
    // Bottom face (normal -Y) - CCW when viewed from below
    addTriangle(0, 1, 2);
    // Top face (normal +Y) - CCW when viewed from above
    addTriangle(3, 5, 4);
    // Front-left side face (v0-v1 edge, normal outward-left)
    addTriangle(0, 3, 4);
    addTriangle(0, 4, 1);
    // Front-right side face (v0-v2 edge, normal outward-right)
    addTriangle(0, 2, 5);
    addTriangle(0, 5, 3);
    // Back face (v1-v2 edge, normal outward-back)
    addTriangle(1, 4, 5);
    addTriangle(1, 5, 2);
  }
  
  /**
   * Ray-triangle intersection using Möller–Trumbore algorithm
   */
  private rayTriangleIntersect(
    ray: Ray, 
    v0: THREE.Vector3, 
    v1: THREE.Vector3, 
    v2: THREE.Vector3,
    minDist: number = 0.001
  ): { t: number; point: THREE.Vector3 } | null {
    const EPSILON = 1e-8;
    
    const edge1 = v1.clone().sub(v0);
    const edge2 = v2.clone().sub(v0);
    const h = ray.direction.clone().cross(edge2);
    const a = edge1.dot(h);
    
    if (Math.abs(a) < EPSILON) {
      return null; // Ray parallel to triangle
    }
    
    const f = 1 / a;
    const s = ray.origin.clone().sub(v0);
    const u = f * s.dot(h);
    
    if (u < 0 || u > 1) {
      return null;
    }
    
    const q = s.clone().cross(edge1);
    const v = f * ray.direction.dot(q);
    
    if (v < 0 || u + v > 1) {
      return null;
    }
    
    const t = f * edge2.dot(q);
    
    if (t > minDist) {
      return {
        t,
        point: ray.origin.clone().add(ray.direction.clone().multiplyScalar(t))
      };
    }
    
    return null;
  }
  
  /**
   * Intersect a ray with this prism using manual ray-triangle tests
   */
  intersectRay(ray: Ray, minDist: number = 0.001): { hit: RayHit; faceIndex: number } | null {
    let closestHit: { t: number; point: THREE.Vector3; normal: THREE.Vector3; faceIndex: number } | null = null;
    
    for (let i = 0; i < this.triangles.length; i++) {
      const tri = this.triangles[i];
      const result = this.rayTriangleIntersect(ray, tri.v0, tri.v1, tri.v2, minDist);
      
      if (result && (!closestHit || result.t < closestHit.t)) {
        closestHit = {
          t: result.t,
          point: result.point,
          normal: tri.normal,
          faceIndex: i
        };
      }
    }
    
    if (closestHit) {
      const dotProduct = ray.direction.dot(closestHit.normal);
      const entering = dotProduct < 0;
      
      return {
        hit: {
          point: closestHit.point,
          normal: entering ? closestHit.normal.clone() : closestHit.normal.clone().negate(),
          distance: closestHit.t,
          entering
        },
        faceIndex: closestHit.faceIndex
      };
    }
    
    return null;
  }
  
  /**
   * Trace a ray through the prism, handling entry, exit refraction, and TIR
   * Returns both the exiting rays and the internal ray segments for visualization
   */
  traceRay(ray: Ray, debug: boolean = false): { exitRays: Ray[], internalRays: Ray[] } {
    const exitRays: Ray[] = [];
    const internalRays: Ray[] = [];
    const maxBounces = 16;  // Increased for TIR bounces
    let currentRay = ray.clone();
    let inside = false;
    let tirCount = 0;
    const maxTIR = 6;  // Limit internal reflections to prevent infinite loops
    
    for (let bounce = 0; bounce < maxBounces; bounce++) {
      const intersection = this.intersectRay(currentRay, 0.01);
      
      if (!intersection) {
        if (debug) console.log(`  Bounce ${bounce}: No intersection found`);
        break;
      }
      
      const { hit } = intersection;
      if (debug) console.log(`  Bounce ${bounce}: Hit at`, hit.point, 'entering:', hit.entering, 'inside:', inside);
      
      // If we are inside, this segment (from origin to hit point) is an internal ray
      if (inside) {
         // We need to store the ray representing this segment
         // The segment is defined by currentRay.origin -> hit.point
         // We can just store currentRay, the renderer will use its origin and the hit point
         // We attach the hit point to the ray for easier segment creation later? 
         // No, the OpticalSystem handles segment creation from ray + hit distance
         internalRays.push(currentRay.clone());
      }

      // Refract through the surface
      const refracted = refractRay(
        currentRay,
        hit.point,
        hit.normal,
        inside ? this.config.material : null,
        inside ? null : this.config.material,
        !inside
      );
      
      if (refracted) {
        if (inside) {
          // Exiting the prism - this is our output ray
          if (debug) console.log(`  Bounce ${bounce}: Exiting prism, refracted ray:`, refracted.direction);
          exitRays.push(refracted);
          break;
        } else {
          // Entering the prism - continue tracing inside
          if (debug) console.log(`  Bounce ${bounce}: Entering prism, refracted ray:`, refracted.direction);
          currentRay = refracted;
          inside = true;
        }
      } else {
        // Total Internal Reflection - reflect inside the prism
        if (inside && tirCount < maxTIR) {
          tirCount++;
          if (debug) console.log(`  Bounce ${bounce}: TIR #${tirCount} - reflecting internally`);
          
          // Calculate reflection direction
          // The normal should point outward, so we need to flip it for internal reflection
          const internalNormal = hit.normal.clone().negate();
          const reflectedDir = reflect(currentRay.direction, internalNormal);
          
          // Create reflected ray, offset along the reflected direction
          currentRay = new Ray(
            hit.point.clone().add(reflectedDir.clone().multiplyScalar(0.05)),
            reflectedDir,
            currentRay.wavelength,
            currentRay.intensity * 0.99  // Tiny loss per TIR bounce
          );
          
          // Still inside the prism, continues loop
          inside = true;
        } else {
          // Not inside or max TIR reached
          if (debug) console.log(`  Bounce ${bounce}: TIR limit reached or not inside`);
          break;
        }
      }
    }
    
    return { exitRays, internalRays };
  }
  
  /**
   * Set rotation and update mesh + cached triangles
   */
  setRotation(rotationY: number): void {
    this.config.rotationY = rotationY;
    this.mesh.rotation.y = rotationY;
    this.mesh.updateMatrixWorld(true);
    this.updateTriangles();
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
   * Visual feedback for selection state
   */
  setSelected(selected: boolean): void {
    this.isSelected = selected;
    const material = this.mesh.material as THREE.MeshPhysicalMaterial;
    if (selected) {
      material.emissive = new THREE.Color(0x222222);
    } else {
      material.emissive = new THREE.Color(0x000000);
    }
  }
  
  setHovered(hovered: boolean): void {
    this.isHovered = hovered;
    const material = this.mesh.material as THREE.MeshPhysicalMaterial;
    if (hovered && !this.isSelected) {
      material.emissive = new THREE.Color(0x111111);
    } else if (!this.isSelected) {
      material.emissive = new THREE.Color(0x000000);
    }
  }
  
  /**
   * Export specs for blueprint
   */
  getSpecs(): object {
    return {
      type: this.config.type,
      material: this.config.material.name,
      sideLength: `${this.config.sideLength} cm`,
      height: `${this.config.height} cm`,
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
 * Create a splitter prism
 */
export function createSplitterPrism(
  position: THREE.Vector3,
  material: GlassMaterial = GLASS_MATERIALS.SF11
): Prism {
  return new Prism({
    sideLength: 5,
    height: 8,
    material,
    position,
    rotationY: 0,
    type: 'splitter'
  });
}

/**
 * Create a director prism
 * Larger size to catch broader color bands from the dispersed spectrum
 */
export function createDirectorPrism(
  position: THREE.Vector3,
  targetWavelength: number,
  material: GlassMaterial = GLASS_MATERIALS.BK7
): Prism {
  return new Prism({
    sideLength: 4.5,  // Larger to catch wider color bands
    height: 10,       // Taller for better beam interception
    material,
    position,
    rotationY: 0,
    type: 'director',
    targetWavelength
  });
}
