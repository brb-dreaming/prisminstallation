# Objects Engine: Optical Physics Architecture Spec

## 1. Executive Summary
This document specifies the architecture for refactoring the Prism Simulator from a specific-use-case demo into a general-purpose "Digital Twin" optical engine. 

**Current State**: The simulation hardcodes the light path: `Source -> Splitter -> Directors`.
**Target State**: A "Blind" Ray Tracer. The simulation loop emits rays into the scene, and physics determines where they go based strictly on geometry and material properties. This allows for arbitrary placement of prisms, multiple light sources, and emergent behaviors like retro-reflection or complex internal trapping.

---

## 2. Core Architecture

### 2.1 The Universal Ray Tracing Loop
The responsibility for determining ray paths moves entirely to `OpticalSystem`. The main application loop simply provides the "Scene" and the "Rays".

**Algorithm**:
```typescript
function trace(ray: Ray, scene: OpticalSystem): RayPath {
    let currentRay = ray;
    let path = [startPoint];
    
    for (let bounce = 0; bounce < MAX_BOUNCES; bounce++) {
        // 1. Find nearest intersection with ANY object in the scene
        const hit = scene.findNearestIntersection(currentRay);
        
        if (!hit) break; // Ray goes to infinity/backdrop
        
        // 2. Calculate Physics at the Interface
        const interaction = calculateInteraction(currentRay, hit);
        
        // 3. Apply changes
        path.push(hit.point);
        currentRay = interaction.nextRay;
        
        // 4. Energy/Physics Checks
        if (currentRay.intensity < MIN_INTENSITY) break;
        if (interaction.absorbed) break;
    }
    return path;
}
```

### 2.2 Object Interface Standardization
All objects (Prisms, Walls, Mirrors, Detectors) must implement a common interface so the physics engine can treat them uniformly.

```typescript
interface OpticalElement {
    // Unique ID for tracking
    id: string;
    
    // Returns the precise intersection point and surface normal
    intersect(ray: Ray): RayHit | null;
    
    // Returns the optical properties at a specific point
    getMaterialData(point: Vector3): {
        material: GlassMaterial; // Refractive Index info
        opacity: number;         // 0-1
        absorption: number;      // Beer-Lambert coefficient
    };
}
```

---

## 3. Implementation Phases

### Phase 1: The Decoupling (High Priority)
**Goal**: Remove the hardcoded `Source -> Splitter` logic in `main.ts`.

1.  **Unified Registration**:
    *   Modify `OpticalSystem` to maintain a single flattened list of `OpticalElement`s (combining Splitters, Directors, Walls).
    *   Ensure `Prism` and `Wall` classes implement the unified `intersect` method similarly.
2.  **Global Trace**:
    *   Update `main.ts` to call `opticalSystem.traceRays(sourceRays)` once.
    *   Remove the manual "Splitter First" check.
    *   Let the `OpticalSystem` discover if the ray hits the splitter, a wall, or misses everything.

### Phase 2: Internal Physics & Visibility (Medium Priority)
**Goal**: Visualize light trapped inside the glass and handle Total Internal Reflection (TIR) visually.

1.  **Internal State Tracking**:
    *   The `Ray` object needs a `currentRefractiveIndex` property (default 1.0 for air).
    *   When entering a prism, set `currentRefractiveIndex = material.n`.
    *   When exiting, set `currentRefractiveIndex = 1.0`.
2.  **TIR Logic Update**:
    *   Current: `Prism.traceRay` handles TIR internally and returns exit rays.
    *   New: `OpticalSystem` handles TIR as a standard reflection event. The ray bounces *inside* the prism, and this segment is added to the `RayPath` for rendering.
    *   *Visual Benefit*: Users will see the beam zigzagging inside the prism before exiting.

### Phase 3: Realistic Attenuation (Low Priority / Polish)
**Goal**: Simulate intensity loss for realism.

1.  **Fresnel Loss**:
    *   Ensure `fresnelReflectance` reduces the intensity of the *refracted* ray and spawns a *reflected* ray (ghost ray) if intensity is high enough.
2.  **Beer-Lambert Absorption**:
    *   As a ray travels distance $d$ through material with absorption $\alpha$:
    *   $$I_{new} = I_{current} \times e^{-\alpha \times d}$$
    *   This makes beams fade as they travel through thick glass, distinguishing "clear" from "tinted" optics.

---

## 4. Technical Specifications

### 4.1 Updated Ray Interface
```typescript
class Ray {
    origin: Vector3;
    direction: Vector3;
    wavelength: number;
    intensity: number;
    
    // New Properties
    currentMedium: GlassMaterial | null; // null = Air
    generation: number; // 0 = Source, 1 = Refracted/Reflected
}
```

### 4.2 Intersection Logic Refinement
*   **Epsilon Management**: Crucial for preventing "Self-Intersection" (a ray leaving a surface immediately hitting it again).
*   **Rule**: Push the ray origin `1e-5` units along the normal *away* from the surface (if reflecting) or *into* the surface (if refracting).

### 4.3 Visualization Strategy
*   **BeamRenderer**: Needs to accept a generic `RayPath` (array of points) rather than distinct `WhiteBeam` vs `ColoredBeam` types. The color is determined solely by the `Ray.wavelength`.

---

## 5. Context for Agents
*   **`src/optics/optical-system.ts`**: This is the brain. It currently exists but is under-utilized. Move logic from `Prism.traceRay` into here.
*   **`src/scene/prism.ts`**: Downgrade this class. It should primarily handle Geometry and Material data. It should *not* run its own simulation loop.
*   **`src/main.ts`**: Simplify. It should only setup the scene and call `trace()`.

This architecture ensures that if we add a mirror, a lens, or a second light source later, the engine requires zero changes—it just works.

