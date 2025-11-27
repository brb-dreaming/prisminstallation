# Prism Light Simulator

An interactive 3D simulator for designing a sculptural light installation that uses prisms to bend and disperse light into beautiful rainbow patterns.

## Features

### Physically Accurate Optics
- **Snell's Law** refraction with real glass refractive indices
- **Sellmeier dispersion** for wavelength-dependent light bending
- Real spectral wavelengths (380nm violet to 700nm red)
- Support for multiple glass types (BK7, F2, SF11)

### Interactive Design
- **Splitter prism** that disperses white light into a spectrum
- **6 director prisms** that can be rotated to redirect colored beams
- Click and drag on director prisms to twist them
- Real-time ray tracing updates as you manipulate prisms

### Puzzle Mechanic
- Target convergence zone on the backdrop
- Convergence meter shows how close beams are to aligning
- "Secret garden" discovery feel when beams converge

### Blueprint Export
- Export technical specifications as TXT or JSON
- Includes all measurements, positions, and angles
- Parts list for building the physical installation

### VR Ready
- WebXR architecture prepared for future VR port
- Abstracted input handling for mouse and VR controllers

## Getting Started

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build
```

## Usage

1. **View the scene**: Drag to orbit, scroll to zoom
2. **Rotate prisms**: Click and drag on the smaller director prisms
3. **Export blueprint**: Click "Blueprint (TXT)" or "Data (JSON)" to download specs
4. **Solve the puzzle**: Align all beams to converge in the target zone

## Tech Stack

- TypeScript + Vite
- Three.js for 3D rendering
- Custom optics engine
- WebXR API for VR support

## Project Structure

```
src/
├── main.ts              # Entry point
├── optics/
│   ├── ray.ts           # Ray class and operations
│   ├── refraction.ts    # Snell's law, Sellmeier dispersion
│   └── spectrum.ts      # Wavelength to color mapping
├── scene/
│   ├── prism.ts         # Prism geometry and physics
│   ├── light-source.ts  # Collimated white light
│   ├── light-beam.ts    # Visual beam rendering
│   └── backdrop.ts      # Projection surface
├── interaction/
│   ├── controls.ts      # Orbit camera + prism rotation
│   ├── puzzle.ts        # Target convergence detection
│   └── xr.ts            # WebXR support
├── export/
│   └── blueprint.ts     # Spec generation
└── ui/
    └── panel.ts         # Minimal info overlay
```

## Building the Physical Installation

Use the exported blueprint to build the real installation:

1. Source optical-grade glass prisms (BK7 or F2 recommended)
2. Create rotatable mounts for director prisms
3. Set up a collimated white light source
4. Install a matte backdrop for projection
5. Position everything according to blueprint measurements

## License

MIT

