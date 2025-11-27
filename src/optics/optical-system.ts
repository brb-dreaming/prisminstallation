/**
 * OpticalSystem - Unified ray tracing through any arrangement of optical elements
 * 
 * This replaces the hardcoded Source → Splitter → Director flow with a
 * generic recursive tracer that allows arbitrary prism chaining.
 */

import * as THREE from 'three';
import { Ray } from './ray';
import { reflect } from './refraction';
import type { Prism } from '../scene/prism';
import type { Wall } from '../scene/wall';

/**
 * Result of tracing a ray segment
 */
export interface RaySegment {
  start: THREE.Vector3;
  end: THREE.Vector3;
  ray: Ray;
  hitType: 'prism' | 'wall' | 'backdrop' | 'escaped';
  hitObject?: Prism | Wall;
}

/**
 * Full path of a ray through the optical system
 */
export interface RayPath {
  segments: RaySegment[];
  finalPosition: THREE.Vector3 | null;
  wavelength: number;
  intensity: number;
}

/**
 * Spatial bounds for the simulation - rays outside these bounds are terminated
 */
export interface SpatialBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

/**
 * Configuration for the optical system
 */
export interface OpticalSystemConfig {
  maxBounces: number;
  minIntensity: number;
  backdropPlane: { normal: THREE.Vector3; point: THREE.Vector3 };
  bounds: SpatialBounds;
}

/**
 * Intersection result with distance for sorting
 */
interface IntersectionCandidate {
  type: 'prism' | 'wall';
  distance: number;
  point: THREE.Vector3;
  object: Prism | Wall;
  hit: any;
}

/**
 * OpticalSystem manages ray tracing through an arbitrary arrangement
 * of prisms and walls, enabling multi-prism beam steering.
 */
export class OpticalSystem {
  private prisms: Prism[] = [];
  private walls: Wall[] = [];
  private config: OpticalSystemConfig;
  
  constructor(config: Partial<OpticalSystemConfig> = {}) {
    this.config = {
      maxBounces: 16,
      minIntensity: 0.01,
      backdropPlane: {
        normal: new THREE.Vector3(-1, 0, 0),  // Facing -X (toward the scene)
        point: new THREE.Vector3(35, 0, 5)    // Default backdrop position
      },
      // Spatial bounds - rays outside this box are terminated
      // This prevents infinite computation for rays that miss all objects
      bounds: {
        minX: -50,
        maxX: 100,
        minY: -20,
        maxY: 50,
        minZ: -50,
        maxZ: 60
      },
      ...config
    };
  }
  
  /**
   * Check if a point is within the simulation bounds
   */
  private isInBounds(point: THREE.Vector3): boolean {
    const { bounds } = this.config;
    return (
      point.x >= bounds.minX && point.x <= bounds.maxX &&
      point.y >= bounds.minY && point.y <= bounds.maxY &&
      point.z >= bounds.minZ && point.z <= bounds.maxZ
    );
  }
  
  /**
   * Update the spatial bounds
   */
  setBounds(bounds: Partial<SpatialBounds>): void {
    this.config.bounds = { ...this.config.bounds, ...bounds };
  }
  
  /**
   * Set the collection of prisms in the system
   */
  setPrisms(prisms: Prism[]): void {
    this.prisms = prisms;
  }
  
  /**
   * Set the collection of walls in the system
   */
  setWalls(walls: Wall[]): void {
    this.walls = walls;
  }
  
  /**
   * Update the backdrop plane configuration
   */
  setBackdropPlane(normal: THREE.Vector3, point: THREE.Vector3): void {
    this.config.backdropPlane = { normal: normal.clone(), point: point.clone() };
  }
  
  /**
   * Add a single prism to the system
   */
  addPrism(prism: Prism): void {
    if (!this.prisms.includes(prism)) {
      this.prisms.push(prism);
    }
  }
  
  /**
   * Remove a prism from the system
   */
  removePrism(prism: Prism): void {
    const index = this.prisms.indexOf(prism);
    if (index !== -1) {
      this.prisms.splice(index, 1);
    }
  }
  
  /**
   * Trace a ray through the entire optical system
   * This is the main entry point for ray tracing
   */
  traceRay(ray: Ray, rayQueue?: Ray[]): RayPath {
    const segments: RaySegment[] = [];
    const visited = new Set<Prism>();  // Track prisms we've already passed through
    
    let currentRay = ray.clone();
    let bounceCount = 0;
    
    while (bounceCount < this.config.maxBounces && currentRay.intensity >= this.config.minIntensity) {
      // Check if ray origin is out of bounds - terminate if so
      if (!this.isInBounds(currentRay.origin)) {
        // Draw a short segment to show the ray leaving bounds
        const endPoint = currentRay.origin.clone().add(currentRay.direction.clone().multiplyScalar(2));
        segments.push({
          start: currentRay.origin.clone(),
          end: endPoint,
          ray: currentRay,
          hitType: 'escaped'
        });
        
        return {
          segments,
          finalPosition: null,
          wavelength: currentRay.wavelength,
          intensity: 0  // Ray terminated at boundary
        };
      }
      
      const result = this.traceStep(currentRay, visited);
      
      if (!result) {
        // Ray escaped or hit backdrop
        const backdropHit = this.intersectBackdrop(currentRay);
        if (backdropHit && this.isInBounds(backdropHit.point)) {
          segments.push({
            start: currentRay.origin.clone(),
            end: backdropHit.point.clone(),
            ray: currentRay,
            hitType: 'backdrop'
          });
          
          return {
            segments,
            finalPosition: backdropHit.point,
            wavelength: currentRay.wavelength,
            intensity: currentRay.intensity
          };
        } else {
          // Ray escaped scene - draw limited segment to bounds edge
          const escapeDist = this.distanceToBoundsEdge(currentRay);
          const escapePoint = currentRay.origin.clone().add(
            currentRay.direction.clone().multiplyScalar(Math.min(escapeDist, 50))
          );
          
          segments.push({
            start: currentRay.origin.clone(),
            end: escapePoint,
            ray: currentRay,
            hitType: 'escaped'
          });
          
          return {
            segments,
            finalPosition: null,
            wavelength: currentRay.wavelength,
            intensity: 0
          };
        }
      }
      
      // Add segment from current position to hit point
      segments.push({
        start: currentRay.origin.clone(),
        end: result.hitPoint.clone(),
        ray: currentRay,
        hitType: result.type,
        hitObject: result.object
      });
      
      if (result.type === 'wall') {
        // Walls absorb light - ray path ends here
        return {
          segments,
          finalPosition: result.hitPoint,
          wavelength: currentRay.wavelength,
          intensity: 0  // Absorbed
        };
      }
      
      if (result.type === 'prism') {
        const prism = result.object as Prism;
        
        // Mark this prism as visited (for this specific pass-through)
        // We'll clear it after the ray exits to allow re-entry from different angles
        visited.add(prism);
        
        // Trace ray through the prism
        const { exitRays, internalRays } = prism.traceRay(currentRay);
        
        // Add internal rays as segments to visualize path inside prism
        if (internalRays.length > 0) {
            for (let i = 0; i < internalRays.length; i++) {
                const segRay = internalRays[i];
                let endPoint: THREE.Vector3 | null = null;
                
                if (i < internalRays.length - 1) {
                    endPoint = internalRays[i+1].origin;
                } else if (exitRays.length > 0) {
                    endPoint = exitRays[0].origin;
                }
                
                if (endPoint) {
                    segments.push({
                        start: segRay.origin.clone(),
                        end: endPoint.clone(),
                        ray: segRay,
                        hitType: 'prism',
                        hitObject: prism
                    });
                }
            }
        }
        
        if (exitRays.length === 0) {
          // Ray trapped in prism (TIR with no exit)
          // Try to handle TIR by reflecting
          const tirResult = this.handleTIR(currentRay, prism);
          if (tirResult) {
            currentRay = tirResult;
          } else {
            // Completely trapped - end trace
            return {
              segments,
              finalPosition: result.hitPoint,
              wavelength: currentRay.wavelength,
              intensity: currentRay.intensity
            };
          }
        } else {
          // Check for splitting (dispersion)
          if (exitRays.length > 1 && rayQueue) {
            // Branching event!
            // Add ALL exit rays to the queue to be traced as new paths
            // The current path ends here
            exitRays.forEach(r => rayQueue.push(r));
            
            // Return the path so far
            return {
              segments,
              finalPosition: result.hitPoint,
              wavelength: currentRay.wavelength,
              intensity: currentRay.intensity
            };
          }
          
          // No splitting, or no queue provided - continue with primary ray
          currentRay = exitRays[0];
          
          // If we had other rays but no queue, we are losing data (old behavior)
          
          // After exiting, the prism can potentially be hit again from outside
          // (but we add a small delay to prevent immediate re-intersection)
          visited.delete(prism);
        }
      }
      
      bounceCount++;
    }
    
    // Max bounces reached - extend to backdrop
    const backdropHit = this.intersectBackdrop(currentRay);
    if (backdropHit) {
      segments.push({
        start: currentRay.origin.clone(),
        end: backdropHit.point.clone(),
        ray: currentRay,
        hitType: 'backdrop'
      });
      
      return {
        segments,
        finalPosition: backdropHit.point,
        wavelength: currentRay.wavelength,
        intensity: currentRay.intensity
      };
    }
    
    return {
      segments,
      finalPosition: null,
      wavelength: currentRay.wavelength,
      intensity: currentRay.intensity
    };
  }
  
  /**
   * Perform a single step of ray tracing - find the nearest intersection
   */
  private traceStep(
    ray: Ray, 
    visited: Set<Prism>
  ): { type: 'prism' | 'wall'; hitPoint: THREE.Vector3; object: Prism | Wall } | null {
    const candidates: IntersectionCandidate[] = [];
    
    // Check all prisms
    for (const prism of this.prisms) {
      // Skip prisms we're currently inside of
      if (visited.has(prism)) continue;
      
      const hit = prism.intersectRay(ray, 0.01);
      if (hit) {
        candidates.push({
          type: 'prism',
          distance: hit.hit.distance,
          point: hit.hit.point.clone(),
          object: prism,
          hit: hit
        });
      }
    }
    
    // Check all walls
    for (const wall of this.walls) {
      const hit = wall.intersectRay(ray, 0.01);
      if (hit) {
        candidates.push({
          type: 'wall',
          distance: hit.distance,
          point: hit.point.clone(),
          object: wall,
          hit: hit
        });
      }
    }
    
    // Also check backdrop distance to ensure we don't miss it
    const backdropHit = this.intersectBackdrop(ray);
    
    if (candidates.length === 0) {
      return null;  // Nothing hit except possibly backdrop
    }
    
    // Sort by distance and return nearest
    candidates.sort((a, b) => a.distance - b.distance);
    const nearest = candidates[0];
    
    // If backdrop is closer than nearest object, return null (will hit backdrop)
    if (backdropHit && backdropHit.distance < nearest.distance) {
      return null;
    }
    
    return {
      type: nearest.type,
      hitPoint: nearest.point,
      object: nearest.object
    };
  }
  
  /**
   * Calculate distance from ray origin to the edge of bounds along ray direction
   * Used to limit how far we draw escaped rays
   */
  private distanceToBoundsEdge(ray: Ray): number {
    const { bounds } = this.config;
    const origin = ray.origin;
    const dir = ray.direction;
    
    let minT = Infinity;
    
    // Check intersection with each of the 6 boundary planes
    // X planes
    if (dir.x !== 0) {
      const t1 = (bounds.minX - origin.x) / dir.x;
      const t2 = (bounds.maxX - origin.x) / dir.x;
      if (t1 > 0) minT = Math.min(minT, t1);
      if (t2 > 0) minT = Math.min(minT, t2);
    }
    
    // Y planes
    if (dir.y !== 0) {
      const t1 = (bounds.minY - origin.y) / dir.y;
      const t2 = (bounds.maxY - origin.y) / dir.y;
      if (t1 > 0) minT = Math.min(minT, t1);
      if (t2 > 0) minT = Math.min(minT, t2);
    }
    
    // Z planes
    if (dir.z !== 0) {
      const t1 = (bounds.minZ - origin.z) / dir.z;
      const t2 = (bounds.maxZ - origin.z) / dir.z;
      if (t1 > 0) minT = Math.min(minT, t1);
      if (t2 > 0) minT = Math.min(minT, t2);
    }
    
    return minT === Infinity ? 50 : minT;
  }
  
  /**
   * Intersect ray with the backdrop plane
   */
  private intersectBackdrop(ray: Ray): { point: THREE.Vector3; distance: number } | null {
    const { normal, point } = this.config.backdropPlane;
    const hit = ray.intersectPlane(normal, point);
    
    if (hit && hit.distance > 0.01) {
      return {
        point: hit.point,
        distance: hit.distance
      };
    }
    
    return null;
  }
  
  /**
   * Handle Total Internal Reflection
   * When a ray is trapped inside a prism, reflect it internally
   */
  private handleTIR(ray: Ray, prism: Prism): Ray | null {
    // Find the internal surface the ray is hitting
    const hit = prism.intersectRay(ray, 0.001);
    
    if (!hit) {
      return null;
    }
    
    // Reflect the ray
    const reflectedDir = reflect(ray.direction, hit.hit.normal);
    
    return new Ray(
      hit.hit.point.clone().add(reflectedDir.clone().multiplyScalar(0.05)),
      reflectedDir,
      ray.wavelength,
      ray.intensity * 0.99  // Small loss on reflection
    );
  }
  
  /**
   * Trace multiple rays (e.g., all wavelengths from a light source)
   * Handles branching paths (dispersion) automatically via queue
   */
  traceRays(rays: Ray[]): RayPath[] {
    const completedPaths: RayPath[] = [];
    const queue: Ray[] = [...rays];
    const MAX_RAYS = 5000; // Safety limit
    let processedCount = 0;

    while (queue.length > 0 && processedCount < MAX_RAYS) {
      const ray = queue.shift()!;
      // traceRay will populate queue if splitting occurs
      const path = this.traceRay(ray, queue);
      completedPaths.push(path);
      processedCount++;
    }
    
    return completedPaths;
  }
  
  /**
   * Get all prisms in the system
   */
  getPrisms(): Prism[] {
    return [...this.prisms];
  }
  
  /**
   * Get all walls in the system  
   */
  getWalls(): Wall[] {
    return [...this.walls];
  }
}

