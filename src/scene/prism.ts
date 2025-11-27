/**
 * Prism geometry and physics
 * Handles both visual representation and optical calculations
 * Supports multiple prism shapes for diverse optical effects
 */

import * as THREE from 'three';
import type { RayHit } from '../optics/ray';
import { Ray } from '../optics/ray';
import type { GlassMaterial } from '../optics/refraction';
import { GLASS_MATERIALS, refractRay, reflect } from '../optics/refraction';

/**
 * Available prism shapes with different optical properties
 */
export type PrismShape = 
  | 'equilateral'    // Classic 60° prism - maximum dispersion
  | 'right-angle'    // 45-90-45° - total internal reflection, 90° beam deflection
  | 'isosceles'      // Custom apex angle - tunable dispersion
  | 'wedge'          // Thin angle - subtle beam steering
  | 'rectangular'    // Glass block - double refraction, educational
  | 'pentagonal'     // 90° deviation without image inversion
  | 'dove';          // Trapezoidal - image rotation effects

/**
 * Human-readable info about each prism shape
 */
export const PRISM_SHAPE_INFO: Record<PrismShape, { name: string; description: string; icon: string }> = {
  equilateral: { 
    name: 'Equilateral', 
    description: '60° apex - classic rainbow maker with maximum dispersion',
    icon: '△'
  },
  'right-angle': { 
    name: 'Right Angle', 
    description: '45-90-45° - perfect for 90° beam deflection via TIR',
    icon: '◢'
  },
  isosceles: { 
    name: 'Isosceles', 
    description: 'Custom apex angle for tunable dispersion',
    icon: '▲'
  },
  wedge: { 
    name: 'Wedge', 
    description: 'Thin wedge for subtle beam steering',
    icon: '◁'
  },
  rectangular: { 
    name: 'Glass Block', 
    description: 'Rectangular block - parallel beam displacement',
    icon: '▭'
  },
  pentagonal: { 
    name: 'Pentagonal', 
    description: '5-sided - 90° deviation, used in periscopes',
    icon: '⬠'
  },
  dove: { 
    name: 'Dove', 
    description: 'Trapezoidal - image rotation and inversion',
    icon: '⏢'
  }
};

export interface PrismConfig {
  // Shape type
  shape: PrismShape;
  
  // Physical dimensions (in centimeters for real-world scale)
  sideLength: number;  // Base reference size
  height: number;      // Prism height (extrusion depth)
  
  // Shape-specific parameters
  apexAngle?: number;  // For isosceles/wedge shapes (radians)
  aspectRatio?: number; // For rectangular (length/width ratio)
  
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
 * Represents a prism of any supported shape for light refraction
 */
export class Prism {
  config: PrismConfig;
  mesh: THREE.Mesh;
  
  // Cached world-space triangles for ray intersection
  private triangles: { v0: THREE.Vector3; v1: THREE.Vector3; v2: THREE.Vector3; normal: THREE.Vector3 }[] = [];
  
  // Cached local vertices for triangle updates
  private localVertices: THREE.Vector3[] = [];
  private faceIndices: number[][] = [];
  
  // Interaction state
  isSelected: boolean = false;
  isHovered: boolean = false;
  
  // Selection indicator
  private selectionRing: THREE.LineLoop | null = null;
  
  constructor(config: PrismConfig) {
    // Default shape to equilateral for backward compatibility
    this.config = { shape: 'equilateral', ...config };
    this.mesh = this.createMesh();
    this.createSelectionIndicator();
    this.updateTriangles();
  }
  
  /**
   * Create a subtle ring indicator for selection state
   * Adapts to the prism shape
   */
  private createSelectionIndicator(): void {
    const points = this.getSelectionRingPoints();
    
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color: 0xd4af37, // Gold accent color
      transparent: true,
      opacity: 0,
      linewidth: 1,
    });
    
    this.selectionRing = new THREE.LineLoop(geometry, material);
    this.selectionRing.position.y = -this.config.height / 2 - 0.1; // Just below the prism
    this.selectionRing.visible = false;
    this.mesh.add(this.selectionRing);
  }
  
  /**
   * Get selection ring points based on shape
   */
  private getSelectionRingPoints(): THREE.Vector3[] {
    const { sideLength, shape } = this.config;
    const scale = 1.25;
    
    switch (shape) {
      case 'rectangular': {
        const width = sideLength;
        const depth = sideLength * (this.config.aspectRatio || 1.5);
        return [
          new THREE.Vector3(-width/2 * scale, 0, -depth/2 * scale),
          new THREE.Vector3(width/2 * scale, 0, -depth/2 * scale),
          new THREE.Vector3(width/2 * scale, 0, depth/2 * scale),
          new THREE.Vector3(-width/2 * scale, 0, depth/2 * scale),
          new THREE.Vector3(-width/2 * scale, 0, -depth/2 * scale),
        ];
      }
      
      case 'pentagonal': {
        // Regular pentagon outline
        const r = sideLength * 0.6 * scale;
        const points: THREE.Vector3[] = [];
        for (let i = 0; i <= 5; i++) {
          const angle = (i * 2 * Math.PI / 5) - Math.PI / 2;
          points.push(new THREE.Vector3(Math.cos(angle) * r, 0, Math.sin(angle) * r));
        }
        return points;
      }
      
      case 'dove': {
        // Trapezoidal outline
        const baseWidth = sideLength * scale;
        const topWidth = sideLength * 0.6 * scale;
        const depth = sideLength * 1.2 * scale;
        return [
          new THREE.Vector3(-baseWidth/2, 0, -depth/2),
          new THREE.Vector3(baseWidth/2, 0, -depth/2),
          new THREE.Vector3(topWidth/2, 0, depth/2),
          new THREE.Vector3(-topWidth/2, 0, depth/2),
          new THREE.Vector3(-baseWidth/2, 0, -depth/2),
        ];
      }
      
      case 'wedge': {
        // Thin triangle
        const apexAngle = this.config.apexAngle || Math.PI / 12; // 15° default
        const baseWidth = sideLength * Math.tan(apexAngle / 2) * 2 * scale;
        const depth = sideLength * scale;
        return [
          new THREE.Vector3(0, 0, depth/2),
          new THREE.Vector3(-baseWidth/2, 0, -depth/2),
          new THREE.Vector3(baseWidth/2, 0, -depth/2),
          new THREE.Vector3(0, 0, depth/2),
        ];
      }
      
      case 'right-angle': {
        // Right triangle
        const h = sideLength * scale;
        return [
          new THREE.Vector3(0, 0, h/2),
          new THREE.Vector3(-h/2, 0, -h/2),
          new THREE.Vector3(h/2, 0, -h/2),
          new THREE.Vector3(0, 0, h/2),
        ];
      }
      
      case 'isosceles': {
        // Isosceles triangle with custom apex
        const apexAngle = this.config.apexAngle || Math.PI / 3;
        const baseWidth = sideLength * scale;
        const depth = (baseWidth / 2) / Math.tan(apexAngle / 2);
        return [
          new THREE.Vector3(0, 0, depth * 2/3),
          new THREE.Vector3(-baseWidth/2, 0, -depth/3),
          new THREE.Vector3(baseWidth/2, 0, -depth/3),
          new THREE.Vector3(0, 0, depth * 2/3),
        ];
      }
      
      default: {
        // Equilateral triangle
        const h = (sideLength * Math.sqrt(3)) / 2;
        return [
          new THREE.Vector3(0, 0, h * 2/3 * scale),
          new THREE.Vector3(-sideLength/2 * scale, 0, -h/3 * scale),
          new THREE.Vector3(sideLength/2 * scale, 0, -h/3 * scale),
          new THREE.Vector3(0, 0, h * 2/3 * scale),
        ];
      }
    }
  }
  
  /**
   * Create the Three.js mesh for the prism
   */
  private createMesh(): THREE.Mesh {
    const { sideLength, height, shape } = this.config;
    
    // Create geometry based on shape
    const geometry = this.createShapeGeometry(shape, sideLength, height);
    
    // Glass-like material with subtle tint based on shape for visual distinction
    const shapeColors: Record<PrismShape, number> = {
      equilateral: 0xffffff,
      'right-angle': 0xfff8f0,
      isosceles: 0xf8fff8,
      wedge: 0xf0f8ff,
      rectangular: 0xfff0f8,
      pentagonal: 0xf8f0ff,
      dove: 0xfffff0,
    };
    
    const material = new THREE.MeshPhysicalMaterial({
      color: shapeColors[shape] || 0xffffff,
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
   * Create geometry based on prism shape
   */
  private createShapeGeometry(shape: PrismShape, sideLength: number, height: number): THREE.BufferGeometry {
    switch (shape) {
      case 'right-angle':
        return this.createRightAngleGeometry(sideLength, height);
      case 'isosceles':
        return this.createIsoscelesGeometry(sideLength, height, this.config.apexAngle || Math.PI / 3);
      case 'wedge':
        return this.createWedgeGeometry(sideLength, height, this.config.apexAngle || Math.PI / 12);
      case 'rectangular':
        return this.createRectangularGeometry(sideLength, height, this.config.aspectRatio || 1.5);
      case 'pentagonal':
        return this.createPentagonalGeometry(sideLength, height);
      case 'dove':
        return this.createDoveGeometry(sideLength, height);
      default:
        return this.createEquilateralGeometry(sideLength, height);
    }
  }
  
  /**
   * Create equilateral triangular prism geometry (60° apex)
   */
  private createEquilateralGeometry(sideLength: number, height: number): THREE.BufferGeometry {
    const h = (sideLength * Math.sqrt(3)) / 2; // Triangle height
    const halfH = height / 2;
    
    // Equilateral triangle vertices (in XZ plane, centered)
    this.localVertices = [
      new THREE.Vector3(0, -halfH, h * 2/3),           // 0 - bottom front
      new THREE.Vector3(-sideLength/2, -halfH, -h/3), // 1 - bottom back-left
      new THREE.Vector3(sideLength/2, -halfH, -h/3),  // 2 - bottom back-right
      new THREE.Vector3(0, halfH, h * 2/3),           // 3 - top front
      new THREE.Vector3(-sideLength/2, halfH, -h/3), // 4 - top back-left
      new THREE.Vector3(sideLength/2, halfH, -h/3),  // 5 - top back-right
    ];
    
    // Face indices (each sub-array is a triangle)
    this.faceIndices = [
      [0, 2, 1],    // Bottom face
      [3, 4, 5],    // Top face
      [0, 1, 4], [0, 4, 3],  // Front-left side
      [0, 3, 5], [0, 5, 2],  // Front-right side
      [1, 2, 5], [1, 5, 4],  // Back side
    ];
    
    return this.buildGeometryFromVertices();
  }
  
  /**
   * Create right-angle (45-90-45) prism geometry
   * Perfect for total internal reflection and 90° beam deflection
   */
  private createRightAngleGeometry(sideLength: number, height: number): THREE.BufferGeometry {
    const halfH = height / 2;
    const s = sideLength;
    
    // Right triangle: 90° at one corner, 45° at the other two
    // Hypotenuse faces the incoming light for TIR applications
    this.localVertices = [
      new THREE.Vector3(0, -halfH, s/2),           // 0 - bottom apex (90° corner)
      new THREE.Vector3(-s/2, -halfH, -s/2),      // 1 - bottom back-left (45°)
      new THREE.Vector3(s/2, -halfH, -s/2),       // 2 - bottom back-right (45°)
      new THREE.Vector3(0, halfH, s/2),           // 3 - top apex
      new THREE.Vector3(-s/2, halfH, -s/2),      // 4 - top back-left
      new THREE.Vector3(s/2, halfH, -s/2),       // 5 - top back-right
    ];
    
    this.faceIndices = [
      [0, 2, 1],    // Bottom face
      [3, 4, 5],    // Top face
      [0, 1, 4], [0, 4, 3],  // Left side (45° face)
      [0, 3, 5], [0, 5, 2],  // Right side (45° face)
      [1, 2, 5], [1, 5, 4],  // Hypotenuse (back face)
    ];
    
    return this.buildGeometryFromVertices();
  }
  
  /**
   * Create isosceles triangular prism with custom apex angle
   */
  private createIsoscelesGeometry(sideLength: number, height: number, apexAngle: number): THREE.BufferGeometry {
    const halfH = height / 2;
    const baseWidth = sideLength;
    const triangleHeight = (baseWidth / 2) / Math.tan(apexAngle / 2);
    
    this.localVertices = [
      new THREE.Vector3(0, -halfH, triangleHeight * 2/3),           // 0 - bottom apex
      new THREE.Vector3(-baseWidth/2, -halfH, -triangleHeight/3), // 1 - bottom left
      new THREE.Vector3(baseWidth/2, -halfH, -triangleHeight/3),  // 2 - bottom right
      new THREE.Vector3(0, halfH, triangleHeight * 2/3),           // 3 - top apex
      new THREE.Vector3(-baseWidth/2, halfH, -triangleHeight/3), // 4 - top left
      new THREE.Vector3(baseWidth/2, halfH, -triangleHeight/3),  // 5 - top right
    ];
    
    this.faceIndices = [
      [0, 2, 1],    // Bottom
      [3, 4, 5],    // Top
      [0, 1, 4], [0, 4, 3],  // Left side
      [0, 3, 5], [0, 5, 2],  // Right side
      [1, 2, 5], [1, 5, 4],  // Back (base)
    ];
    
    return this.buildGeometryFromVertices();
  }
  
  /**
   * Create thin wedge prism for subtle beam steering
   */
  private createWedgeGeometry(sideLength: number, height: number, apexAngle: number): THREE.BufferGeometry {
    const halfH = height / 2;
    const depth = sideLength;
    const baseWidth = depth * Math.tan(apexAngle / 2) * 2;
    
    // Very thin triangular cross-section
    this.localVertices = [
      new THREE.Vector3(0, -halfH, depth/2),            // 0 - bottom apex (thin end)
      new THREE.Vector3(-baseWidth/2, -halfH, -depth/2), // 1 - bottom back-left
      new THREE.Vector3(baseWidth/2, -halfH, -depth/2),  // 2 - bottom back-right
      new THREE.Vector3(0, halfH, depth/2),             // 3 - top apex
      new THREE.Vector3(-baseWidth/2, halfH, -depth/2), // 4 - top back-left
      new THREE.Vector3(baseWidth/2, halfH, -depth/2),  // 5 - top back-right
    ];
    
    this.faceIndices = [
      [0, 2, 1],    // Bottom
      [3, 4, 5],    // Top
      [0, 1, 4], [0, 4, 3],  // Left face
      [0, 3, 5], [0, 5, 2],  // Right face
      [1, 2, 5], [1, 5, 4],  // Back (wide) face
    ];
    
    return this.buildGeometryFromVertices();
  }
  
  /**
   * Create rectangular glass block (parallel faces cause beam displacement without deviation)
   */
  private createRectangularGeometry(sideLength: number, height: number, aspectRatio: number): THREE.BufferGeometry {
    const halfH = height / 2;
    const width = sideLength;
    const depth = sideLength * aspectRatio;
    
    // 8 vertices for a box
    this.localVertices = [
      new THREE.Vector3(-width/2, -halfH, -depth/2), // 0 - bottom back-left
      new THREE.Vector3(width/2, -halfH, -depth/2),  // 1 - bottom back-right
      new THREE.Vector3(width/2, -halfH, depth/2),   // 2 - bottom front-right
      new THREE.Vector3(-width/2, -halfH, depth/2),  // 3 - bottom front-left
      new THREE.Vector3(-width/2, halfH, -depth/2),  // 4 - top back-left
      new THREE.Vector3(width/2, halfH, -depth/2),   // 5 - top back-right
      new THREE.Vector3(width/2, halfH, depth/2),    // 6 - top front-right
      new THREE.Vector3(-width/2, halfH, depth/2),   // 7 - top front-left
    ];
    
    // 12 triangles (2 per face, 6 faces)
    this.faceIndices = [
      [0, 1, 2], [0, 2, 3],  // Bottom
      [4, 6, 5], [4, 7, 6],  // Top
      [0, 4, 5], [0, 5, 1],  // Back
      [2, 6, 7], [2, 7, 3],  // Front
      [0, 3, 7], [0, 7, 4],  // Left
      [1, 5, 6], [1, 6, 2],  // Right
    ];
    
    return this.buildGeometryFromVertices();
  }
  
  /**
   * Create pentagonal prism (5-sided cross-section)
   * Used in periscopes for 90° deviation without image inversion
   */
  private createPentagonalGeometry(sideLength: number, height: number): THREE.BufferGeometry {
    const halfH = height / 2;
    const r = sideLength * 0.5;  // Circumradius
    
    // Regular pentagon vertices
    const pentVerts: THREE.Vector3[] = [];
    for (let i = 0; i < 5; i++) {
      const angle = (i * 2 * Math.PI / 5) - Math.PI / 2; // Start from top
      pentVerts.push(new THREE.Vector3(Math.cos(angle) * r, 0, Math.sin(angle) * r));
    }
    
    // 10 vertices: 5 bottom, 5 top
    this.localVertices = [
      ...pentVerts.map(v => new THREE.Vector3(v.x, -halfH, v.z)),
      ...pentVerts.map(v => new THREE.Vector3(v.x, halfH, v.z)),
    ];
    
    // Triangulate pentagon faces (fan from center for simplicity, but we use ear clipping)
    // Bottom pentagon: 0,1,2,3,4  Top pentagon: 5,6,7,8,9
    this.faceIndices = [
      // Bottom pentagon (CCW when viewed from below = CW from above)
      [0, 2, 1], [0, 3, 2], [0, 4, 3],
      // Top pentagon (CCW when viewed from above)
      [5, 6, 7], [5, 7, 8], [5, 8, 9],
      // Side faces (5 rectangular sides, each as 2 triangles)
      [0, 1, 6], [0, 6, 5],
      [1, 2, 7], [1, 7, 6],
      [2, 3, 8], [2, 8, 7],
      [3, 4, 9], [3, 9, 8],
      [4, 0, 5], [4, 5, 9],
    ];
    
    return this.buildGeometryFromVertices();
  }
  
  /**
   * Create Dove prism geometry (trapezoidal cross-section)
   * Used for image rotation - rotating the prism rotates the image at 2x rate
   */
  private createDoveGeometry(sideLength: number, height: number): THREE.BufferGeometry {
    const halfH = height / 2;
    const baseWidth = sideLength;
    const topWidth = sideLength * 0.6;
    const depth = sideLength * 1.2;
    
    // Trapezoid vertices (4 corners on each level)
    this.localVertices = [
      // Bottom trapezoid
      new THREE.Vector3(-baseWidth/2, -halfH, -depth/2),  // 0 - back-left (wide)
      new THREE.Vector3(baseWidth/2, -halfH, -depth/2),   // 1 - back-right (wide)
      new THREE.Vector3(topWidth/2, -halfH, depth/2),     // 2 - front-right (narrow)
      new THREE.Vector3(-topWidth/2, -halfH, depth/2),    // 3 - front-left (narrow)
      // Top trapezoid
      new THREE.Vector3(-baseWidth/2, halfH, -depth/2),   // 4 - back-left
      new THREE.Vector3(baseWidth/2, halfH, -depth/2),    // 5 - back-right
      new THREE.Vector3(topWidth/2, halfH, depth/2),      // 6 - front-right
      new THREE.Vector3(-topWidth/2, halfH, depth/2),     // 7 - front-left
    ];
    
    this.faceIndices = [
      // Bottom trapezoid
      [0, 1, 2], [0, 2, 3],
      // Top trapezoid
      [4, 6, 5], [4, 7, 6],
      // Back face (wide)
      [0, 4, 5], [0, 5, 1],
      // Front face (narrow)
      [2, 6, 7], [2, 7, 3],
      // Left angled face
      [0, 3, 7], [0, 7, 4],
      // Right angled face
      [1, 5, 6], [1, 6, 2],
    ];
    
    return this.buildGeometryFromVertices();
  }
  
  /**
   * Build Three.js geometry from local vertices and face indices
   */
  private buildGeometryFromVertices(): THREE.BufferGeometry {
    const vertices: number[] = [];
    for (const v of this.localVertices) {
      vertices.push(v.x, v.y, v.z);
    }
    
    const indices: number[] = [];
    for (const face of this.faceIndices) {
      indices.push(...face);
    }
    
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    
    return geometry;
  }
  
  /**
   * Update cached world-space triangles for ray intersection
   * Works with any prism shape using the cached localVertices and faceIndices
   */
  updateTriangles(): void {
    this.triangles = [];
    this.mesh.updateMatrixWorld(true);
    
    // Transform local vertices to world space
    const worldVerts = this.localVertices.map(v => v.clone().applyMatrix4(this.mesh.matrixWorld));
    
    // Create triangles from face indices
    for (const face of this.faceIndices) {
      const [i0, i1, i2] = face;
      const v0 = worldVerts[i0];
      const v1 = worldVerts[i1];
      const v2 = worldVerts[i2];
      
      // Compute outward normal
      const edge1 = v1.clone().sub(v0);
      const edge2 = v2.clone().sub(v0);
      const normal = edge1.cross(edge2).normalize();
      
      this.triangles.push({ v0, v1, v2, normal });
    }
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
      material.emissive = new THREE.Color(0x1a1a1a);
      // Show and animate selection ring
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
    const shapeInfo = PRISM_SHAPE_INFO[this.config.shape];
    return {
      type: this.config.type,
      shape: shapeInfo?.name || this.config.shape,
      material: this.config.material.name,
      sideLength: `${this.config.sideLength} cm`,
      height: `${this.config.height} cm`,
      ...(this.config.apexAngle && { apexAngle: `${(this.config.apexAngle * 180 / Math.PI).toFixed(1)}°` }),
      position: {
        x: `${this.config.position.x.toFixed(2)} cm`,
        y: `${this.config.position.y.toFixed(2)} cm`,
        z: `${this.config.position.z.toFixed(2)} cm`
      },
      rotation: `${this.getRotationDegrees().toFixed(1)}°`
    };
  }
  
  /**
   * Get the prism shape
   */
  getShape(): PrismShape {
    return this.config.shape;
  }
}

/**
 * Create a splitter prism (equilateral for maximum dispersion)
 */
export function createSplitterPrism(
  position: THREE.Vector3,
  material: GlassMaterial = GLASS_MATERIALS.SF11
): Prism {
  return new Prism({
    shape: 'equilateral',
    sideLength: 5,
    height: 8,
    material,
    position,
    rotationY: 0,
    type: 'splitter'
  });
}

/**
 * Create a director prism with specified shape
 * Default is equilateral, but supports all shapes
 */
export function createDirectorPrism(
  position: THREE.Vector3,
  targetWavelength: number,
  material: GlassMaterial = GLASS_MATERIALS.BK7,
  shape: PrismShape = 'equilateral',
  options?: { apexAngle?: number; aspectRatio?: number }
): Prism {
  return new Prism({
    shape,
    sideLength: 4.5,  // Larger to catch wider color bands
    height: 10,       // Taller for better beam interception
    material,
    position,
    rotationY: 0,
    type: 'director',
    targetWavelength,
    apexAngle: options?.apexAngle,
    aspectRatio: options?.aspectRatio
  });
}

/**
 * Create a prism with any shape and configuration
 */
export function createPrism(
  position: THREE.Vector3,
  shape: PrismShape,
  options?: {
    material?: GlassMaterial;
    sideLength?: number;
    height?: number;
    apexAngle?: number;
    aspectRatio?: number;
    type?: 'splitter' | 'director';
    targetWavelength?: number;
  }
): Prism {
  return new Prism({
    shape,
    sideLength: options?.sideLength || 4.5,
    height: options?.height || 10,
    material: options?.material || GLASS_MATERIALS.BK7,
    position,
    rotationY: 0,
    type: options?.type || 'director',
    targetWavelength: options?.targetWavelength,
    apexAngle: options?.apexAngle,
    aspectRatio: options?.aspectRatio
  });
}

/**
 * Get all available prism shapes
 */
export function getAvailableShapes(): PrismShape[] {
  return ['equilateral', 'right-angle', 'isosceles', 'wedge', 'rectangular', 'pentagonal', 'dove'];
}
