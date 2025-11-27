/**
 * Ray class for geometric optics ray tracing
 */

import * as THREE from 'three';

export interface RayHit {
  point: THREE.Vector3;
  normal: THREE.Vector3;
  distance: number;
  entering: boolean; // true if entering medium, false if exiting
}

export class Ray {
  origin: THREE.Vector3;
  direction: THREE.Vector3;
  wavelength: number; // nanometers
  intensity: number;  // 0-1

  constructor(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    wavelength: number = 550,
    intensity: number = 1
  ) {
    this.origin = origin.clone();
    this.direction = direction.clone().normalize();
    this.wavelength = wavelength;
    this.intensity = intensity;
  }

  /**
   * Get a point along the ray at distance t
   */
  at(t: number): THREE.Vector3 {
    return this.origin.clone().add(this.direction.clone().multiplyScalar(t));
  }

  /**
   * Create a copy of this ray
   */
  clone(): Ray {
    return new Ray(
      this.origin.clone(),
      this.direction.clone(),
      this.wavelength,
      this.intensity
    );
  }

  /**
   * Intersect ray with a triangle
   * Uses Möller–Trumbore algorithm
   */
  intersectTriangle(
    v0: THREE.Vector3,
    v1: THREE.Vector3,
    v2: THREE.Vector3
  ): RayHit | null {
    const EPSILON = 1e-8;

    const edge1 = v1.clone().sub(v0);
    const edge2 = v2.clone().sub(v0);
    const h = this.direction.clone().cross(edge2);
    const a = edge1.dot(h);

    if (Math.abs(a) < EPSILON) {
      return null; // Ray parallel to triangle
    }

    const f = 1 / a;
    const s = this.origin.clone().sub(v0);
    const u = f * s.dot(h);

    if (u < 0 || u > 1) {
      return null;
    }

    const q = s.clone().cross(edge1);
    const v = f * this.direction.dot(q);

    if (v < 0 || u + v > 1) {
      return null;
    }

    const t = f * edge2.dot(q);

    if (t > EPSILON) {
      // Calculate normal
      const normal = edge1.clone().cross(edge2).normalize();
      const entering = normal.dot(this.direction) < 0;

      return {
        point: this.at(t),
        normal: entering ? normal : normal.negate(),
        distance: t,
        entering
      };
    }

    return null;
  }

  /**
   * Intersect ray with an infinite plane
   */
  intersectPlane(planeNormal: THREE.Vector3, planePoint: THREE.Vector3): RayHit | null {
    const EPSILON = 1e-8;
    const denom = planeNormal.dot(this.direction);

    if (Math.abs(denom) < EPSILON) {
      return null; // Ray parallel to plane
    }

    const t = planePoint.clone().sub(this.origin).dot(planeNormal) / denom;

    if (t > EPSILON) {
      const entering = denom < 0;
      return {
        point: this.at(t),
        normal: entering ? planeNormal.clone() : planeNormal.clone().negate(),
        distance: t,
        entering
      };
    }

    return null;
  }
}

/**
 * Collection of rays, useful for representing dispersed light
 */
export class RayBundle {
  rays: Ray[];

  constructor(rays: Ray[] = []) {
    this.rays = rays;
  }

  add(ray: Ray): void {
    this.rays.push(ray);
  }

  /**
   * Create white light bundle (multiple wavelengths along same path)
   */
  static createWhiteLight(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    wavelengths: number[]
  ): RayBundle {
    const bundle = new RayBundle();
    for (const wavelength of wavelengths) {
      bundle.add(new Ray(origin, direction, wavelength, 1 / wavelengths.length));
    }
    return bundle;
  }
}

