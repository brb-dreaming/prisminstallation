/**
 * Prism Light Simulator - Main Entry Point
 * 
 * An interactive 3D simulator for designing a sculptural light installation
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

import './style.css';

import { GLASS_MATERIALS, getDispersionTable } from './optics/refraction';
import { COLOR_GROUPS } from './optics/spectrum';
import { OpticalSystem } from './optics/optical-system';
import type { Prism } from './scene/prism';
import { createSplitterPrism, createDirectorPrism } from './scene/prism';
import { Wall, createWall } from './scene/wall';
import { LightSource } from './scene/light-source';
import { LightBeamRenderer, BeamEndpoints } from './scene/light-beam';
import { Backdrop, ColorMixingDisplay } from './scene/backdrop';
import { InteractionController } from './interaction/controls';
import type { DraggableObject } from './interaction/controls';
import { PuzzleSystem } from './interaction/puzzle';
import { XRManager } from './interaction/xr';
import { UIPanel } from './ui/panel';
import { generateBlueprintData, downloadBlueprint, downloadBlueprintJSON } from './export/blueprint';
import { 
  createSceneConfig, 
  saveConfig, 
  loadConfig, 
  getSavedConfigNames, 
  exportConfigToFile, 
  importConfigFromFile,
  getDefaultEnvironment,
  type SceneConfig,
  type EnvironmentConfig 
} from './config/config-manager';

/**
 * Main application class
 */
class PrismSimulator {
  // Three.js core
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer;
  
  // Scene objects
  private lightSource: LightSource;
  private splitterPrism: Prism;
  private directorPrisms: Prism[] = [];
  private walls: Wall[] = [];
  private backdrop: Backdrop;
  private beamRenderer: LightBeamRenderer;
  private beamEndpoints: BeamEndpoints;
  private colorMixingDisplay: ColorMixingDisplay;
  
  // Systems
  private controls: InteractionController;
  private puzzle: PuzzleSystem;
  private xr: XRManager;
  private ui: UIPanel;
  private opticalSystem: OpticalSystem;
  
  // State
  private clock: THREE.Clock;
  private needsRayUpdate: boolean = true;
  private prismCounter: number = 0;  // For generating unique IDs
  
  // Environment
  private ambientLight: THREE.AmbientLight | null = null;
  private environmentConfig: EnvironmentConfig;
  
  constructor() {
    this.clock = new THREE.Clock();
    this.environmentConfig = getDefaultEnvironment();
    
    // Initialize Three.js
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(this.environmentConfig.backgroundColor);
    
    this.camera = new THREE.PerspectiveCamera(
      60,  // Wider FOV
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    // Position camera for overhead view of the entire prism system
    this.camera.position.set(10, 30, 25);
    this.camera.lookAt(5, 5, 0);
    
    const canvas = document.getElementById('canvas') as HTMLCanvasElement;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    
    // Post-processing for bloom effect
    this.composer = new EffectComposer(this.renderer);
    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);
    
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.8,  // Bloom strength
      0.4,  // Radius
      0.2   // Threshold
    );
    this.composer.addPass(bloomPass);
    
    // Set up scene objects
    this.setupLighting();
    this.lightSource = this.createLightSource();
    this.splitterPrism = this.createSplitterPrism();
    this.directorPrisms = this.createDirectorPrisms();
    this.backdrop = this.createBackdrop();
    
    this.beamRenderer = new LightBeamRenderer();
    this.scene.add(this.beamRenderer.getGroup());
    
    this.beamEndpoints = new BeamEndpoints();
    this.scene.add(this.beamEndpoints.getGroup());
    
    this.colorMixingDisplay = new ColorMixingDisplay(this.backdrop.config.position);
    this.scene.add(this.colorMixingDisplay.getGroup());
    
    // Initialize the optical system for unified ray tracing
    this.opticalSystem = new OpticalSystem({
      maxBounces: 16,
      minIntensity: 0.01,
      backdropPlane: this.backdrop.getPlane()
    });
    // Add all prisms to the optical system
    this.opticalSystem.addPrism(this.splitterPrism);
    this.opticalSystem.setPrisms([...this.directorPrisms, this.splitterPrism]);
    this.opticalSystem.setWalls(this.walls);
    
    // Set up interaction with grid snapping centered at light source
    this.controls = new InteractionController(this.camera, this.renderer.domElement, {
      gridSize: this.environmentConfig.gridSize,
      gridOrigin: new THREE.Vector3(0, 5, 0),  // Centered at splitter prism (light source direction)
      gridExtent: this.environmentConfig.gridExtent,
      gridColor: parseInt(this.environmentConfig.gridColor.replace('#', ''), 16),
      gridSecondaryColor: parseInt(this.environmentConfig.gridSecondaryColor.replace('#', ''), 16)
    });
    this.controls.setPrisms([this.splitterPrism, ...this.directorPrisms]);
    this.controls.setWalls(this.walls);
    
    // Create visual grid
    this.controls.createGridHelper(this.scene);
    
    this.controls.onPrismRotated = () => {
      this.needsRayUpdate = true;
      const selectedPrism = this.controls.getSelectedPrism();
      if (selectedPrism) {
        this.ui.updatePrismRotation(selectedPrism);
      }
    };
    this.controls.onPrismSelected = (prism) => {
      this.ui.updatePrismSelection(prism);
    };
    this.controls.onObjectMoved = (object: DraggableObject) => {
      this.needsRayUpdate = true;
      this.ui.updateObjectSelection(object);
    };
    this.controls.onObjectSelected = (object: DraggableObject | null) => {
      this.ui.updateObjectSelection(object);
    };
    this.controls.onModeChanged = (mode) => {
      this.ui.setMode(mode);
    };
    
    // Set up puzzle system - target on backdrop at +X side
    // This is the "recombination zone" where all three color beams should converge
    this.puzzle = new PuzzleSystem({
      targetPosition: new THREE.Vector3(35, 8, 5),  // Center of the backdrop
      targetRadius: 6,
      requiredBeams: 3,  // Need all 3 color groups to converge
      solveThreshold: 0.70  // 70% convergence to solve
    });
    this.scene.add(this.puzzle.targetZone.mesh);
    
    this.puzzle.onConvergenceChanged = (result) => {
      this.ui.updateConvergence(result);
    };
    this.puzzle.onSolved = () => {
      this.ui.showSolvedState();
    };
    
    // UI
    this.ui = new UIPanel();
    
    // Wire up UI callbacks
    this.setupUICallbacks();
    
    // XR (WebVR) support
    this.xr = new XRManager(this.renderer, this.scene, this.camera);
    this.initializeXR();
    
    // Handle resize
    window.addEventListener('resize', this.onResize.bind(this));
    
    // Handle delete key
    window.addEventListener('keydown', this.onKeyDown.bind(this));
    
    // Update all world matrices before first ray trace
    this.scene.updateMatrixWorld(true);
    
    // Initial ray trace
    this.traceRays();
    
    // Start animation loop
    this.animate();
  }
  
  /**
   * Set up UI button callbacks
   */
  private setupUICallbacks(): void {
    // Export callbacks
    this.ui.onExportBlueprint = () => {
      const data = generateBlueprintData(
        this.lightSource,
        this.splitterPrism,
        this.directorPrisms,
        this.backdrop,
        this.puzzle
      );
      downloadBlueprint(data);
    };
    
    this.ui.onExportJSON = () => {
      const data = generateBlueprintData(
        this.lightSource,
        this.splitterPrism,
        this.directorPrisms,
        this.backdrop,
        this.puzzle
      );
      downloadBlueprintJSON(data);
    };
    
    // Add prism callback
    this.ui.onAddPrism = () => {
      this.addNewPrism();
    };
    
    // Add wall callback
    this.ui.onAddWall = () => {
      this.addNewWall();
    };
    
    // Delete selected callback
    this.ui.onDeleteSelected = () => {
      this.deleteSelected();
    };
    
    // Mode change callback
    this.ui.onModeChange = (mode) => {
      this.controls.setMode(mode);
    };
    
    // Configuration callbacks
    this.ui.onNewConfig = () => {
      this.createNewEmptyConfig();
    };
    
    this.ui.onSaveConfig = (name) => {
      this.saveConfiguration(name);
    };
    
    this.ui.onLoadConfig = (name) => {
      this.loadConfiguration(name);
    };
    
    this.ui.onImportConfig = async () => {
      const config = await importConfigFromFile();
      if (config) {
        this.applyConfiguration(config);
        console.log(`Imported configuration: ${config.name}`);
      }
    };
    
    this.ui.onExportConfig = () => {
      const config = this.createCurrentConfiguration('export');
      exportConfigToFile(config);
    };
    
    // Environment callbacks
    this.ui.onBackgroundColorChange = (color) => {
      this.setBackgroundColor(color);
    };
    
    this.ui.onGridColorChange = (primary, secondary) => {
      this.setGridColors(primary, secondary);
    };
    
    this.ui.onAmbientIntensityChange = (intensity) => {
      this.setAmbientIntensity(intensity);
    };
    
    this.ui.onGridSizeChange = (size) => {
      this.setGridSize(size);
    };
    
    this.ui.onGridExtentChange = (extent) => {
      this.setGridExtent(extent);
    };
    
    this.ui.onSnapRotationChange = (degrees) => {
      this.controls.setSnapRotationDegrees(degrees);
    };
    
    this.ui.onAngleChange = (angleDegrees) => {
      this.setSelectedObjectAngle(angleDegrees);
    };
    
    this.ui.onResetSplitterAngle = () => {
      this.resetSplitterToOptimalAngle();
    };
    
    // Initialize saved configs list
    this.ui.updateSavedConfigsList(getSavedConfigNames());
    
    // Update environment UI with current settings
    this.ui.updateEnvironmentUI({
      backgroundColor: this.environmentConfig.backgroundColor,
      gridColor: this.environmentConfig.gridColor,
      gridSecondaryColor: this.environmentConfig.gridSecondaryColor,
      ambientIntensity: this.environmentConfig.ambientIntensity,
      gridSize: this.environmentConfig.gridSize,
      gridExtent: this.environmentConfig.gridExtent,
      snapRotationDegrees: this.controls.getSnapRotationDegrees()
    });
  }
  
  /**
   * Create a new empty configuration (clears all director prisms and walls)
   */
  private createNewEmptyConfig(): void {
    // Clear existing director prisms (keep splitter)
    for (const prism of this.directorPrisms) {
      this.scene.remove(prism.mesh);
      this.controls.removePrism(prism);
    }
    this.directorPrisms = [];
    
    // Clear existing walls
    for (const wall of this.walls) {
      this.scene.remove(wall.mesh);
      this.controls.removeWall(wall);
    }
    this.walls = [];
    
    // Reset splitter to default rotation
    this.splitterPrism.setRotation(Math.PI / 6);
    
    // Update optical system
    this.opticalSystem.setPrisms([]);
    this.opticalSystem.setWalls([]);
    this.controls.setPrisms([this.splitterPrism]);
    this.controls.setWalls([]);
    
    // Deselect any selected object
    this.controls.deselectObject();
    
    // Reset prism counter
    this.prismCounter = 0;
    
    // Update ray tracing
    this.needsRayUpdate = true;
    
    console.log('Created new empty configuration');
  }
  
  /**
   * Create a configuration object from the current scene state
   */
  private createCurrentConfiguration(name: string): SceneConfig {
    const orbitControls = this.controls.getOrbitControls();
    return createSceneConfig(
      name,
      this.splitterPrism,
      this.directorPrisms,
      this.walls,
      this.environmentConfig,
      {
        position: this.camera.position.clone(),
        target: orbitControls.target.clone()
      }
    );
  }
  
  /**
   * Save the current configuration
   */
  private saveConfiguration(name: string): void {
    const config = this.createCurrentConfiguration(name);
    if (saveConfig(name, config)) {
      this.ui.updateSavedConfigsList(getSavedConfigNames());
      console.log(`Configuration "${name}" saved`);
    }
  }
  
  /**
   * Load a saved configuration
   */
  private loadConfiguration(name: string): void {
    const config = loadConfig(name);
    if (config) {
      this.applyConfiguration(config);
      console.log(`Configuration "${name}" loaded`);
    }
  }
  
  /**
   * Apply a configuration to the scene
   */
  private applyConfiguration(config: SceneConfig): void {
    // Clear existing director prisms (keep splitter)
    for (const prism of this.directorPrisms) {
      this.scene.remove(prism.mesh);
      this.controls.removePrism(prism);
    }
    this.directorPrisms = [];
    
    // Clear existing walls
    for (const wall of this.walls) {
      this.scene.remove(wall.mesh);
      this.controls.removeWall(wall);
    }
    this.walls = [];
    
    // Apply splitter prism configuration
    if (config.splitterPrism) {
      const sp = config.splitterPrism;
      this.splitterPrism.mesh.position.set(sp.position.x, sp.position.y, sp.position.z);
      this.splitterPrism.config.position.set(sp.position.x, sp.position.y, sp.position.z);
      this.splitterPrism.setRotation(sp.rotationY);
    }
    
    // Create director prisms from config
    for (const prismConfig of config.directorPrisms) {
      const position = new THREE.Vector3(
        prismConfig.position.x,
        prismConfig.position.y,
        prismConfig.position.z
      );
      
      const prism = createDirectorPrism(
        position,
        prismConfig.targetWavelength || 550,
        GLASS_MATERIALS.BK7
      );
      
      prism.setRotation(prismConfig.rotationY);
      
      // Restore color group if available
      if (prismConfig.colorGroupName) {
        (prism as any).colorGroup = { name: prismConfig.colorGroupName };
      }
      
      this.directorPrisms.push(prism);
      this.scene.add(prism.mesh);
      this.controls.addPrism(prism);
      this.prismCounter++;
    }
    
    // Create walls from config
    for (const wallConfig of config.walls) {
      const position = new THREE.Vector3(
        wallConfig.position.x,
        wallConfig.position.y,
        wallConfig.position.z
      );
      
      const wall = createWall(position, {
        width: wallConfig.width,
        height: wallConfig.height,
        depth: wallConfig.depth
      });
      
      wall.setRotation(wallConfig.rotationY);
      
      this.walls.push(wall);
      this.scene.add(wall.mesh);
      this.controls.addWall(wall);
    }
    
    // Update optical system
    this.opticalSystem.setPrisms(this.directorPrisms);
    this.opticalSystem.setWalls(this.walls);
    this.controls.setPrisms([this.splitterPrism, ...this.directorPrisms]);
    this.controls.setWalls(this.walls);
    
    // Apply environment settings
    if (config.environment) {
      this.environmentConfig = { ...config.environment };
      this.setBackgroundColor(config.environment.backgroundColor);
      this.setGridColors(config.environment.gridColor, config.environment.gridSecondaryColor);
      this.setAmbientIntensity(config.environment.ambientIntensity);
      this.setGridSize(config.environment.gridSize);
      this.setGridExtent(config.environment.gridExtent);
      
      // Update UI to reflect new settings
      this.ui.updateEnvironmentUI(config.environment);
    }
    
    // Apply camera position
    if (config.camera) {
      this.camera.position.set(
        config.camera.position.x,
        config.camera.position.y,
        config.camera.position.z
      );
      const orbitControls = this.controls.getOrbitControls();
      orbitControls.target.set(
        config.camera.target.x,
        config.camera.target.y,
        config.camera.target.z
      );
      orbitControls.update();
    }
    
    // Update ray tracing
    this.needsRayUpdate = true;
  }
  
  /**
   * Handle keyboard shortcuts at the app level
   */
  private onKeyDown(event: KeyboardEvent): void {
    // Delete selected object with Delete or Backspace
    if (event.key === 'Delete' || event.key === 'Backspace') {
      // Only if not in an input field
      if (document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        this.deleteSelected();
        event.preventDefault();
      }
    }
  }
  
  /**
   * Add a new director prism to the scene
   */
  private addNewPrism(): void {
    this.prismCounter++;
    
    // Find a free grid position (spiral outward from center)
    const position = this.findFreeGridPosition();
    
    // Create prism with a neutral target wavelength
    const prism = createDirectorPrism(
      position,
      550,  // Green center wavelength
      GLASS_MATERIALS.BK7
    );
    
    // Set a default rotation
    prism.setRotation(Math.PI / 4);
    
    // Give it a generic color group
    (prism as any).colorGroup = { name: `Director ${this.prismCounter}` };
    
    // Add to scene and tracking arrays
    this.directorPrisms.push(prism);
    this.scene.add(prism.mesh);
    this.controls.addPrism(prism);
    this.opticalSystem.addPrism(prism);
    
    // Update rays
    this.needsRayUpdate = true;
    
    console.log(`Added new prism at position (${position.x}, ${position.z})`);
  }
  
  /**
   * Add a new wall to the scene
   */
  private addNewWall(): void {
    // Find a free grid position
    const position = this.findFreeGridPosition();
    
    const wall = createWall(position, {
      width: 2,
      height: 10,
      depth: 2
    });
    
    // Add to scene and tracking arrays
    this.walls.push(wall);
    this.scene.add(wall.mesh);
    this.controls.addWall(wall);
    this.opticalSystem.setWalls(this.walls);
    
    // Update rays
    this.needsRayUpdate = true;
    
    console.log(`Added new wall at position (${position.x}, ${position.z})`);
  }
  
  /**
   * Find a free position on the grid for placing new objects
   */
  private findFreeGridPosition(): THREE.Vector3 {
    const gridSize = 2;
    const baseY = 5;  // Same Y as other prisms
    
    // Collect all occupied positions
    const occupied = new Set<string>();
    
    // Splitter prism position
    occupied.add(this.positionKey(this.splitterPrism.mesh.position));
    
    // Director prisms
    for (const prism of this.directorPrisms) {
      occupied.add(this.positionKey(prism.mesh.position));
    }
    
    // Walls
    for (const wall of this.walls) {
      occupied.add(this.positionKey(wall.mesh.position));
    }
    
    // Spiral search outward from a good starting point (right of the dispersed beams)
    const startX = 14;  // Start to the right of the initial director prisms
    const startZ = 5;   // Center Z
    
    // Check in a spiral pattern
    for (let radius = 0; radius < 20; radius++) {
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dz = -radius; dz <= radius; dz++) {
          // Only check the perimeter of each "ring"
          if (Math.abs(dx) !== radius && Math.abs(dz) !== radius) continue;
          
          const x = startX + dx * gridSize;
          const z = startZ + dz * gridSize;
          const pos = new THREE.Vector3(x, baseY, z);
          
          if (!occupied.has(this.positionKey(pos))) {
            return pos;
          }
        }
      }
    }
    
    // Fallback if somehow all positions are taken
    return new THREE.Vector3(startX + Math.random() * 10, baseY, startZ + Math.random() * 10);
  }
  
  /**
   * Create a position key for checking occupancy
   */
  private positionKey(pos: THREE.Vector3): string {
    const gridSize = 2;
    const gx = Math.round(pos.x / gridSize);
    const gz = Math.round(pos.z / gridSize);
    return `${gx},${gz}`;
  }
  
  /**
   * Reset the splitter prism to its optimal angle (30°)
   */
  private resetSplitterToOptimalAngle(): void {
    const optimalAngle = Math.PI / 6; // 30 degrees
    this.splitterPrism.setRotation(optimalAngle);
    this.ui.updatePrismRotation(this.splitterPrism);
    this.needsRayUpdate = true;
  }
  
  /**
   * Set the angle of the currently selected object (prism or wall)
   */
  private setSelectedObjectAngle(angleDegrees: number): void {
    const selected = this.controls.getSelectedObject();
    if (!selected) return;
    
    // Normalize angle to 0-360 range
    let normalizedAngle = angleDegrees % 360;
    if (normalizedAngle < 0) normalizedAngle += 360;
    
    // Convert to radians
    const radians = (normalizedAngle * Math.PI) / 180;
    
    if (selected instanceof Wall) {
      selected.setRotation(radians);
      this.ui.updateObjectSelection(selected);
    } else {
      // It's a Prism
      const prism = selected as Prism;
      prism.setRotation(radians);
      this.ui.updatePrismRotation(prism);
    }
    
    // Update ray tracing
    this.needsRayUpdate = true;
  }
  
  /**
   * Delete the currently selected object
   */
  private deleteSelected(): void {
    const selected = this.controls.getSelectedObject();
    if (!selected) return;
    
    if (selected instanceof Wall) {
      // Remove wall
      const index = this.walls.indexOf(selected);
      if (index !== -1) {
        this.walls.splice(index, 1);
      }
      this.scene.remove(selected.mesh);
      this.controls.removeWall(selected);
      this.opticalSystem.setWalls(this.walls);
      console.log('Deleted wall');
    } else {
      // It's a Prism - only delete if it's a director (not the splitter)
      const prism = selected as Prism;
      if (prism.config.type === 'director') {
        const index = this.directorPrisms.indexOf(prism);
        if (index !== -1) {
          this.directorPrisms.splice(index, 1);
        }
        this.scene.remove(prism.mesh);
        this.controls.removePrism(prism);
        this.opticalSystem.removePrism(prism);
        console.log('Deleted director prism');
      } else {
        console.log('Cannot delete the splitter prism');
        return;
      }
    }
    
    // Deselect and update
    this.controls.deselectObject();
    this.needsRayUpdate = true;
  }
  
  private setupLighting(): void {
    // Ambient light for subtle visibility (store reference for dimmer control)
    this.ambientLight = new THREE.AmbientLight(0x111111, this.environmentConfig.ambientIntensity);
    this.scene.add(this.ambientLight);
    
    // Subtle directional light for glass reflections
    const directional = new THREE.DirectionalLight(0xffffff, 0.3);
    directional.position.set(10, 20, 10);
    this.scene.add(directional);
    
    // Environment for glass material reflections
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    pmremGenerator.compileEquirectangularShader();
    
    // Simple environment (dark room feel)
    const envScene = new THREE.Scene();
    envScene.background = new THREE.Color(0x111111);
    this.scene.environment = pmremGenerator.fromScene(envScene).texture;
    pmremGenerator.dispose();
  }
  
  /**
   * Set ambient light intensity (0-1)
   */
  private setAmbientIntensity(intensity: number): void {
    this.environmentConfig.ambientIntensity = intensity;
    if (this.ambientLight) {
      this.ambientLight.intensity = intensity;
    }
  }
  
  /**
   * Set background color
   */
  private setBackgroundColor(colorHex: string): void {
    this.environmentConfig.backgroundColor = colorHex;
    this.scene.background = new THREE.Color(colorHex);
  }
  
  /**
   * Set grid colors
   */
  private setGridColors(primaryHex: string, secondaryHex: string): void {
    this.environmentConfig.gridColor = primaryHex;
    this.environmentConfig.gridSecondaryColor = secondaryHex;
    const primary = parseInt(primaryHex.replace('#', ''), 16);
    const secondary = parseInt(secondaryHex.replace('#', ''), 16);
    this.controls.setGridColors(primary, secondary);
  }
  
  /**
   * Set grid size
   */
  private setGridSize(size: number): void {
    this.environmentConfig.gridSize = size;
    this.controls.setGridSize(size);
  }
  
  /**
   * Set grid extent
   */
  private setGridExtent(extent: number): void {
    this.environmentConfig.gridExtent = extent;
    this.controls.setGridExtent(extent);
  }
  
  private createLightSource(): LightSource {
    // Light from -Z direction, aimed directly at prism's back face
    // Prism back face is at z ≈ -1.44 for sideLength=5
    const source = new LightSource({
      position: new THREE.Vector3(0, 5, -15),
      direction: new THREE.Vector3(0, 0, 1).normalize(),  // Straight along +Z
      wavelengthSamples: 18
    });
    this.scene.add(source.mesh);
    return source;
  }
  
  private createSplitterPrism(): Prism {
    // Use BK7 (crown glass) for good dispersion with minimal TIR issues
    // BK7 has n~1.52, giving critical angle ~41°
    const prism = createSplitterPrism(
      new THREE.Vector3(0, 5, 0),
      GLASS_MATERIALS.BK7
    );
    
    // Rotate prism so light enters a side face at an angle that allows exit
    // For minimum deviation through a 60° prism, light should enter at ~48° to normal
    // Rotating the prism by ~30° points a side face toward the incoming light
    // This allows proper refraction without TIR
    prism.setRotation(Math.PI / 6);  // 30° rotation
    
    // Log dispersion data for debugging/tuning
    const dispersionTable = getDispersionTable(Math.PI / 3, GLASS_MATERIALS.BK7);
    console.log('BK7 Dispersion Table (60° prism):');
    dispersionTable.forEach(d => {
      console.log(`  ${d.wavelength}nm: n=${d.refractiveIndex.toFixed(4)}, deviation=${d.deviationDeg.toFixed(2)}°`);
    });
    
    this.scene.add(prism.mesh);
    return prism;
  }
  
  private createDirectorPrisms(): Prism[] {
    const prisms: Prism[] = [];
    
    // Three color groups: warm (red-orange-yellow), green, cool (cyan-blue-violet)
    // BK7 dispersion gives about 1.5° spread between red and violet
    // Position directors along the dispersion arc after the splitter
    // Dispersed rays go roughly in +X direction with slight +Z spread (blue bends more)
    
    const groups = [
      { group: COLOR_GROUPS.warm, x: 10, z: 3, rotation: Math.PI / 3 },      // Warm: less deviation (red)
      { group: COLOR_GROUPS.green, x: 10, z: 5, rotation: Math.PI / 3 },     // Green: middle
      { group: COLOR_GROUPS.cool, x: 10, z: 7, rotation: Math.PI / 3 },      // Cool: more deviation (blue)
    ];
    
    for (const { group, x, z, rotation } of groups) {
      const prism = createDirectorPrism(
        new THREE.Vector3(x, 5, z),
        group.centerWavelength,
        GLASS_MATERIALS.BK7  // Directors use BK7 for less dispersion (redirect, not spread more)
      );
      
      // Set initial rotation - user can adjust these to aim at the convergence target
      prism.setRotation(rotation);
      
      // Store the color group info on the prism for reference
      (prism as any).colorGroup = group;
      
      prisms.push(prism);
      this.scene.add(prism.mesh);
      this.prismCounter++;
    }
    
    console.log('Created 3 director prisms for color groups: Warm, Green, Cool');
    
    return prisms;
  }
  
  private createBackdrop(): Backdrop {
    // Backdrop on +X side to catch dispersed/redirected light
    // The director prisms will aim their beams here
    const backdrop = new Backdrop({
      position: new THREE.Vector3(35, 0, 5),
      width: 60,
      height: 50,
      color: 0x050505
    });
    this.scene.add(backdrop.mesh);
    return backdrop;
  }
  
  /**
   * Trace rays through the optical system
   * Uses the OpticalSystem for unified multi-prism ray tracing
   */
  private traceRays(): void {
    this.beamRenderer.clear();
    this.beamEndpoints.clear();
    this.colorMixingDisplay.clear();
    
    const backdropPlane = this.backdrop.getPlane();
    const endpoints: THREE.Vector3[] = [];
    const wavelengths: number[] = [];
    
    // Update matrices for all optical elements
    this.splitterPrism.mesh.updateMatrixWorld(true);
    this.splitterPrism.updateTriangles();
    for (const p of this.directorPrisms) {
      p.mesh.updateMatrixWorld(true);
      p.updateTriangles();
    }
    for (const w of this.walls) {
      w.updateBoundingBox();
    }
    
    // Update the optical system's backdrop plane
    this.opticalSystem.setBackdropPlane(backdropPlane.normal, backdropPlane.point);
    
    // Get white light rays from the light source
    const rays = this.lightSource.generateRays();
    
    // Use unified optical system to trace all rays including splitting/dispersion
    const rayPaths = this.opticalSystem.traceRays(rays.rays);
    
    // Render paths
    for (const path of rayPaths) {
      for (const segment of path.segments) {
        this.beamRenderer.addBeam({
          start: segment.start,
          end: segment.end,
          wavelength: segment.ray.wavelength,
          intensity: segment.ray.intensity
        });
      }

      // Record endpoints if hitting backdrop
      if (path.finalPosition && path.intensity > 0) {
        const lastSegment = path.segments[path.segments.length - 1];
        
        // Only track endpoints on the backdrop for the puzzle
        if (lastSegment.hitType === 'backdrop') {
          endpoints.push(path.finalPosition);
          wavelengths.push(path.wavelength);
          
          this.beamEndpoints.addEndpoint(
            path.finalPosition,
            path.wavelength,
            path.intensity
          );
          
          // Track for color mixing
          this.colorMixingDisplay.addEndpoint({
            position: path.finalPosition,
            wavelength: path.wavelength,
            intensity: path.intensity,
            colorGroup: null
          });
        }
      }
    }
    
    // Calculate color mixing zones
    const mixingResult = this.colorMixingDisplay.calculateMixingZones();
    
    // Update puzzle convergence with wavelength info for white light detection
    this.puzzle.calculateConvergence(endpoints, wavelengths);
    
    // Log mixing info for debugging
    if (mixingResult.hasOverlap) {
      console.log(mixingResult.mixingInfo);
    }
    
    console.log(`Ray tracing complete: ${rayPaths.length} paths traced`);
    
    this.needsRayUpdate = false;
  }
  
  /**
   * Initialize WebXR support
   */
  private async initializeXR(): Promise<void> {
    const initialized = await this.xr.initialize();
    
    if (initialized && this.xr.getIsSupported()) {
      this.ui.showVRButton();
      
      this.ui.onEnterVR = async () => {
        if (this.xr.getIsPresenting()) {
          await this.xr.exitVR();
          this.ui.updateVRState(false);
        } else {
          const entered = await this.xr.enterVR();
          this.ui.updateVRState(entered);
        }
      };
      
      // Set up controller callbacks for VR prism interaction
      this.xr.onSelectStart = (controller) => {
        // TODO: Implement VR prism selection
        console.log('VR Select start', controller.position);
      };
      
      this.xr.onSelectEnd = () => {
        // TODO: Implement VR prism deselection
        console.log('VR Select end');
      };
    }
  }
  
  private onResize(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    
    this.renderer.setSize(width, height);
    this.composer.setSize(width, height);
  }
  
  private animate(): void {
    requestAnimationFrame(this.animate.bind(this));
    
    const deltaTime = this.clock.getDelta();
    
    // Update controls
    this.controls.update();
    
    // Update puzzle
    this.puzzle.update(deltaTime);
    
    // Re-trace rays if needed
    if (this.needsRayUpdate) {
      this.traceRays();
    }
    
    // Render with bloom
    this.composer.render();
  }
}

// Start the application
new PrismSimulator();
