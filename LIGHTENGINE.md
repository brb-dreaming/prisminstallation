# Light Engine Upgrade Plan: Digital Twin Initiative

## Overview
This document outlines the roadmap for evolving the current Prism Simulator from a visual approximation into a physically accurate "Digital Twin" optical engine. The goal is to support complex, emergent optical behaviors found in real-world installations, such as total internal reflection, multi-bounce paths, and non-linear optical assemblies.

## Current State Assessment
- **Strengths**: 
  - Excellent dispersion physics (Sellmeier equations).
  - Accurate geometric intersection (Möller–Trumbore).
  - Real glass material data.
- **Weaknesses**:
  - **Hardcoded Pathing**: The current loop (`Source -> Splitter -> Director`) prevents arbitrary object placement.
  - **Missing Physics**: Total Internal Reflection (TIR) terminates rays instead of reflecting them.
  - **No Branching**: Rays do not split into reflected/refracted components at interfaces, missing "ghost" reflections.

---

## Phase 1: Physics Fidelity (The "Truth" of the Ray)
**Goal**: Ensure that when a ray hits a surface, it behaves exactly as it would in reality, regardless of where it goes next.

### 1.1 Total Internal Reflection (TIR) Handling
- **Current**: Rays hitting the critical angle return `null` and vanish.
- **Required**: 
  - When `sin(theta_t) > 1`, the surface acts as a perfect mirror.
  - Calculate the reflection vector: `R = I - 2(N·I)N`.
  - Continue tracing the reflected ray *inside* the medium.

### 1.2 Intensity Conservation
- **Current**: Fresnel coefficients calculate loss, but reflected energy is discarded.
- **Required**: 
  - Even without full branching, we must track energy loss correctly.
  - If we don't trace the reflection, the refracted ray's intensity is correct ($$T = 1 - R$$).
  - If we do trace TIR, intensity is preserved ($$R = 1$$).

### 1.3 Intersection Robustness
- **Current**: `0.05` offset to avoid self-intersection.
- **Required**: 
  - Refine epsilon values for self-intersection checks.
  - Ensure normals are consistently oriented (always pointing out of the closed mesh).

---

## Phase 2: Architecture Refactoring (The "Flow" of the Ray)
**Goal**: Decouple the simulation loop from specific game objects. Light should interact with *anything* in the scene.

### 2.1 The `OpticalSystem` Class
- Create a central manager that holds a list of all `OpticalElement` objects (Prisms, Mirrors, Filters).
- Replace the hardcoded loop in `main.ts` with a generic `scene.trace(ray)` call.

### 2.2 Recursive / Iterative Tracer
- **Structure**:
  ```typescript
  function trace(ray, depth): Path {
      if (depth > MAX_DEPTH) return;
      hit = findNearestIntersection(ray, allObjects);
      if (!hit) return infiniteRay;
      
      // Handle interaction (Refract/Reflect)
      newRay = hit.object.interact(ray, hit);
      return [hit, ...trace(newRay, depth + 1)];
  }
  ```
- This allows light to bounce: `Source -> Prism A -> Prism B -> Prism A (again) -> Wall`.

### 2.3 Spatial Optimization (Optional for < 50 objects)
- For now, a simple list iteration is fast enough.
- If object count > 100, implement a Bounding Volume Hierarchy (BVH).

---

## Phase 3: Advanced Simulation (The "Ghost" Rays)
**Goal**: Simulate the complex splitting of light that creates richness in glass art.

### 3.1 Ray Branching
- At every interface, generate *two* rays:
  1. **Transmission**: Refracted ray (Intensity $$I * T$$)
  2. **Reflection**: Reflected ray (Intensity $$I * R$$)
- **Implication**: Exponential ray growth.
- **Control**: Implement an `IntensityThreshold` (e.g., stop tracing if $$I < 0.01$$).

### 3.2 Absorption
- Implement Beer-Lambert law for light traveling *through* glass.
- `I = I0 * e^(-alpha * distance)`
- Adds realism to thick glass or tinted materials.

---

## Execution Plan & Immediate Next Steps

1.  **Refactor `Prism.traceRay`**: Modify the internal bounce loop to handle TIR by reflecting instead of breaking.
2.  **Create `OpticalSystem`**: Draft the class structure to replace the manual ray tracing in `main.ts`.
3.  **Verify TIR**: Create a test case with a right-angle prism (porro prism) to confirm it acts as a mirror.

## Technical Specifications

### Data Structures
```typescript
interface RayHit {
  object: OpticalElement;
  distance: number;
  point: Vector3;
  normal: Vector3;
}

interface OpticalElement {
  intersect(ray: Ray): RayHit | null;
  interact(ray: Ray, hit: RayHit): RaySegment[]; // Returns produced rays
}
```

### Constants
- `MAX_BOUNCES`: 16 (Internal bounces can be frequent)
- `MIN_INTENSITY`: 0.005 (Cutoff for visual rendering)
- `INTERSECTION_EPSILON`: 1e-5

