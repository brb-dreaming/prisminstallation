/**
 * Controls - camera orbit, prism rotation, and drag-to-move interaction
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Prism } from '../scene/prism';
import { Wall } from '../scene/wall';

export interface ControlsConfig {
  enableOrbit: boolean;
  enablePrismRotation: boolean;
  enableDragMove: boolean;
  rotationSensitivity: number;
  gridSize: number;  // Grid cell size for snapping
  gridOrigin: THREE.Vector3;  // Origin of the grid (light source position)
}

export type DraggableObject = Prism | Wall;

export type InteractionMode = 'rotate' | 'move';

/**
 * Manages all user interactions
 */
export class InteractionController {
  private camera: THREE.Camera;
  private domElement: HTMLElement;
  private orbitControls: OrbitControls;
  private raycaster: THREE.Raycaster;
  private groundPlane: THREE.Plane;
  
  // Object interaction state
  private prisms: Prism[] = [];
  private walls: Wall[] = [];
  private selectedObject: DraggableObject | null = null;
  private hoveredObject: DraggableObject | null = null;
  private isDragging: boolean = false;
  private dragStartPosition: THREE.Vector3 = new THREE.Vector3();
  private dragStartRotation: number = 0;
  private dragStartAngle: number = 0;
  
  // Current interaction mode
  private mode: InteractionMode = 'rotate';
  
  // Mouse tracking
  private mouse: THREE.Vector2 = new THREE.Vector2();
  private lastMouse: THREE.Vector2 = new THREE.Vector2();
  
  // Visual grid helper
  private gridHelper: THREE.GridHelper | null = null;
  
  // Callbacks
  onPrismRotated: ((prism: Prism) => void) | null = null;
  onPrismSelected: ((prism: Prism | null) => void) | null = null;
  onObjectMoved: ((object: DraggableObject) => void) | null = null;
  onObjectSelected: ((object: DraggableObject | null) => void) | null = null;
  onModeChanged: ((mode: InteractionMode) => void) | null = null;
  
  config: ControlsConfig;
  
  constructor(
    camera: THREE.Camera,
    domElement: HTMLElement,
    config: Partial<ControlsConfig> = {}
  ) {
    this.camera = camera;
    this.domElement = domElement;
    this.raycaster = new THREE.Raycaster();
    
    this.config = {
      enableOrbit: true,
      enablePrismRotation: true,
      enableDragMove: true,
      rotationSensitivity: 0.01,
      gridSize: 2,  // 2cm grid cells
      gridOrigin: new THREE.Vector3(0, 0, 0),
      ...config
    };
    
    // Ground plane for drag calculations (horizontal at y=5, where prisms sit)
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -5);
    
    // Set up orbit controls
    this.orbitControls = new OrbitControls(camera, domElement);
    this.orbitControls.enableDamping = true;
    this.orbitControls.dampingFactor = 0.05;
    this.orbitControls.minDistance = 10;
    this.orbitControls.maxDistance = 100;
    this.orbitControls.maxPolarAngle = Math.PI * 0.9;
    this.orbitControls.target.set(-5, 5, 0); // Look at center of prism arrangement
    
    this.setupEventListeners();
  }
  
  /**
   * Register prisms for interaction
   */
  setPrisms(prisms: Prism[]): void {
    this.prisms = prisms;
  }
  
  /**
   * Add a single prism to the interaction list
   */
  addPrism(prism: Prism): void {
    if (!this.prisms.includes(prism)) {
      this.prisms.push(prism);
    }
  }
  
  /**
   * Remove a prism from the interaction list
   */
  removePrism(prism: Prism): void {
    const index = this.prisms.indexOf(prism);
    if (index !== -1) {
      this.prisms.splice(index, 1);
      if (this.selectedObject === prism) {
        this.deselectObject();
      }
    }
  }
  
  /**
   * Register walls for interaction
   */
  setWalls(walls: Wall[]): void {
    this.walls = walls;
  }
  
  /**
   * Add a single wall to the interaction list
   */
  addWall(wall: Wall): void {
    if (!this.walls.includes(wall)) {
      this.walls.push(wall);
    }
  }
  
  /**
   * Remove a wall from the interaction list
   */
  removeWall(wall: Wall): void {
    const index = this.walls.indexOf(wall);
    if (index !== -1) {
      this.walls.splice(index, 1);
      if (this.selectedObject === wall) {
        this.deselectObject();
      }
    }
  }
  
  /**
   * Set interaction mode
   */
  setMode(mode: InteractionMode): void {
    this.mode = mode;
    this.onModeChanged?.(mode);
    
    // Update cursor based on mode
    if (this.hoveredObject) {
      this.domElement.style.cursor = mode === 'move' ? 'move' : 'grab';
    }
  }
  
  /**
   * Get current interaction mode
   */
  getMode(): InteractionMode {
    return this.mode;
  }
  
  /**
   * Toggle between modes
   */
  toggleMode(): void {
    this.setMode(this.mode === 'rotate' ? 'move' : 'rotate');
  }
  
  /**
   * Set up mouse/touch event listeners
   */
  private setupEventListeners(): void {
    this.domElement.addEventListener('mousedown', this.onMouseDown.bind(this));
    this.domElement.addEventListener('mousemove', this.onMouseMove.bind(this));
    this.domElement.addEventListener('mouseup', this.onMouseUp.bind(this));
    this.domElement.addEventListener('touchstart', this.onTouchStart.bind(this), { passive: false });
    this.domElement.addEventListener('touchmove', this.onTouchMove.bind(this), { passive: false });
    this.domElement.addEventListener('touchend', this.onTouchEnd.bind(this));
    
    // Keyboard shortcuts
    window.addEventListener('keydown', this.onKeyDown.bind(this));
  }
  
  /**
   * Handle keyboard shortcuts
   */
  private onKeyDown(event: KeyboardEvent): void {
    // 'M' toggles between move and rotate modes
    if (event.key === 'm' || event.key === 'M') {
      this.toggleMode();
    }
    // 'Escape' deselects
    if (event.key === 'Escape') {
      this.deselectObject();
    }
    // 'Delete' or 'Backspace' could trigger deletion (handled by main app)
  }
  
  /**
   * Update mouse position in normalized device coordinates
   */
  private updateMouse(clientX: number, clientY: number): void {
    const rect = this.domElement.getBoundingClientRect();
    this.lastMouse.copy(this.mouse);
    this.mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  }
  
  /**
   * Raycast to find interactive object under cursor
   */
  private getObjectUnderCursor(): DraggableObject | null {
    this.raycaster.setFromCamera(this.mouse, this.camera);
    
    // Collect all interactive meshes
    const meshes: THREE.Mesh[] = [];
    
    // Director prisms are interactive
    for (const p of this.prisms) {
      if (p.config.type === 'director') {
        meshes.push(p.mesh);
      }
    }
    
    // Walls are interactive
    for (const w of this.walls) {
      meshes.push(w.mesh);
    }
    
    const intersects = this.raycaster.intersectObjects(meshes, false);
    
    if (intersects.length > 0) {
      const userData = intersects[0].object.userData;
      if (userData.prism) {
        return userData.prism as Prism;
      }
      if (userData.wall) {
        return userData.wall as Wall;
      }
    }
    
    return null;
  }
  
  /**
   * Calculate rotation angle from mouse position relative to object center
   */
  private getMouseAngle(object: DraggableObject): number {
    const mesh = object instanceof Prism ? object.mesh : object.mesh;
    const objectPos = mesh.position.clone();
    objectPos.project(this.camera);
    
    const dx = this.mouse.x - objectPos.x;
    const dy = this.mouse.y - objectPos.y;
    
    return Math.atan2(dy, dx);
  }
  
  /**
   * Get world position from mouse ray intersection with ground plane
   */
  private getGroundIntersection(): THREE.Vector3 | null {
    this.raycaster.setFromCamera(this.mouse, this.camera);
    
    const intersection = new THREE.Vector3();
    const hit = this.raycaster.ray.intersectPlane(this.groundPlane, intersection);
    
    return hit ? intersection : null;
  }
  
  /**
   * Snap position to grid
   */
  snapToGrid(position: THREE.Vector3): THREE.Vector3 {
    const { gridSize, gridOrigin } = this.config;
    
    // Calculate position relative to grid origin
    const relX = position.x - gridOrigin.x;
    const relZ = position.z - gridOrigin.z;
    
    // Snap to nearest grid intersection
    const snappedX = Math.round(relX / gridSize) * gridSize + gridOrigin.x;
    const snappedZ = Math.round(relZ / gridSize) * gridSize + gridOrigin.z;
    
    return new THREE.Vector3(snappedX, position.y, snappedZ);
  }
  
  // Event handlers
  
  private onMouseDown(event: MouseEvent): void {
    if (event.button !== 0) return; // Left click only
    
    this.updateMouse(event.clientX, event.clientY);
    
    const object = this.getObjectUnderCursor();
    
    if (object) {
      this.isDragging = true;
      this.selectedObject = object;
      
      // Disable orbit controls while interacting with objects
      this.orbitControls.enabled = false;
      
      if (this.mode === 'move' && this.config.enableDragMove) {
        // Store starting position for move operation
        const mesh = object instanceof Prism ? object.mesh : object.mesh;
        this.dragStartPosition.copy(mesh.position);
      } else if (this.mode === 'rotate' && this.config.enablePrismRotation) {
        // Store starting angle for rotation operation
        this.dragStartAngle = this.getMouseAngle(object);
        if (object instanceof Prism) {
          this.dragStartRotation = object.config.rotationY;
        } else {
          this.dragStartRotation = object.config.rotationY;
        }
      }
      
      // Visual feedback
      if (object instanceof Prism) {
        object.setSelected(true);
        this.onPrismSelected?.(object);
      } else {
        object.setSelected(true);
      }
      this.onObjectSelected?.(object);
      
      // Clear hover on other objects
      if (this.hoveredObject && this.hoveredObject !== object) {
        if (this.hoveredObject instanceof Prism) {
          this.hoveredObject.setHovered(false);
        } else {
          this.hoveredObject.setHovered(false);
        }
      }
    }
  }
  
  private onMouseMove(event: MouseEvent): void {
    this.updateMouse(event.clientX, event.clientY);
    
    if (this.isDragging && this.selectedObject) {
      if (this.mode === 'move' && this.config.enableDragMove) {
        // Move object to new position with grid snapping
        const groundPos = this.getGroundIntersection();
        if (groundPos) {
          const snappedPos = this.snapToGrid(groundPos);
          
          if (this.selectedObject instanceof Prism) {
            this.selectedObject.config.position.copy(snappedPos);
            this.selectedObject.mesh.position.copy(snappedPos);
            this.selectedObject.mesh.updateMatrixWorld(true);
            this.selectedObject.updateTriangles();
          } else {
            this.selectedObject.setPosition(snappedPos);
          }
          
          this.onObjectMoved?.(this.selectedObject);
          if (this.selectedObject instanceof Prism) {
            this.onPrismRotated?.(this.selectedObject); // Triggers ray update
          }
        }
      } else if (this.mode === 'rotate') {
        // Rotate the selected object
        const currentAngle = this.getMouseAngle(this.selectedObject);
        const deltaAngle = currentAngle - this.dragStartAngle;
        const newRotation = this.dragStartRotation + deltaAngle * 2;
        
        if (this.selectedObject instanceof Prism) {
          this.selectedObject.setRotation(newRotation);
          this.onPrismRotated?.(this.selectedObject);
        } else {
          this.selectedObject.setRotation(newRotation);
          this.onObjectMoved?.(this.selectedObject);
        }
      }
    } else {
      // Update hover state
      const object = this.getObjectUnderCursor();
      
      if (object !== this.hoveredObject) {
        // Clear previous hover
        if (this.hoveredObject && !this.isObjectSelected(this.hoveredObject)) {
          if (this.hoveredObject instanceof Prism) {
            this.hoveredObject.setHovered(false);
          } else {
            this.hoveredObject.setHovered(false);
          }
        }
        
        // Set new hover
        if (object && !this.isObjectSelected(object)) {
          if (object instanceof Prism) {
            object.setHovered(true);
          } else {
            object.setHovered(true);
          }
        }
        
        this.hoveredObject = object;
        
        // Change cursor based on mode
        if (object) {
          this.domElement.style.cursor = this.mode === 'move' ? 'move' : 'grab';
        } else {
          this.domElement.style.cursor = 'default';
        }
      }
    }
  }
  
  private onMouseUp(_event: MouseEvent): void {
    if (this.isDragging) {
      this.isDragging = false;
      this.orbitControls.enabled = this.config.enableOrbit;
      this.domElement.style.cursor = 'default';
    }
  }
  
  // Touch handlers (for tablet/mobile)
  
  private onTouchStart(event: TouchEvent): void {
    if (event.touches.length === 1) {
      const touch = event.touches[0];
      this.updateMouse(touch.clientX, touch.clientY);
      
      const object = this.getObjectUnderCursor();
      
      if (object) {
        event.preventDefault();
        this.isDragging = true;
        this.selectedObject = object;
        this.orbitControls.enabled = false;
        
        if (this.mode === 'move') {
          const mesh = object instanceof Prism ? object.mesh : object.mesh;
          this.dragStartPosition.copy(mesh.position);
        } else {
          this.dragStartAngle = this.getMouseAngle(object);
          if (object instanceof Prism) {
            this.dragStartRotation = object.config.rotationY;
          } else {
            this.dragStartRotation = object.config.rotationY;
          }
        }
        
        if (object instanceof Prism) {
          object.setSelected(true);
          this.onPrismSelected?.(object);
        } else {
          object.setSelected(true);
        }
        this.onObjectSelected?.(object);
      }
    }
  }
  
  private onTouchMove(event: TouchEvent): void {
    if (this.isDragging && event.touches.length === 1) {
      event.preventDefault();
      const touch = event.touches[0];
      this.updateMouse(touch.clientX, touch.clientY);
      
      if (this.selectedObject) {
        if (this.mode === 'move') {
          const groundPos = this.getGroundIntersection();
          if (groundPos) {
            const snappedPos = this.snapToGrid(groundPos);
            
            if (this.selectedObject instanceof Prism) {
              this.selectedObject.config.position.copy(snappedPos);
              this.selectedObject.mesh.position.copy(snappedPos);
              this.selectedObject.mesh.updateMatrixWorld(true);
              this.selectedObject.updateTriangles();
            } else {
              this.selectedObject.setPosition(snappedPos);
            }
            
            this.onObjectMoved?.(this.selectedObject);
            if (this.selectedObject instanceof Prism) {
              this.onPrismRotated?.(this.selectedObject);
            }
          }
        } else {
          const currentAngle = this.getMouseAngle(this.selectedObject);
          const deltaAngle = currentAngle - this.dragStartAngle;
          const newRotation = this.dragStartRotation + deltaAngle * 2;
          
          if (this.selectedObject instanceof Prism) {
            this.selectedObject.setRotation(newRotation);
            this.onPrismRotated?.(this.selectedObject);
          } else {
            this.selectedObject.setRotation(newRotation);
            this.onObjectMoved?.(this.selectedObject);
          }
        }
      }
    }
  }
  
  private onTouchEnd(_event: TouchEvent): void {
    if (this.isDragging) {
      this.isDragging = false;
      this.orbitControls.enabled = this.config.enableOrbit;
    }
  }
  
  /**
   * Check if object is currently selected
   */
  private isObjectSelected(object: DraggableObject): boolean {
    return this.selectedObject === object;
  }
  
  /**
   * Deselect current object
   */
  deselectObject(): void {
    if (this.selectedObject) {
      if (this.selectedObject instanceof Prism) {
        this.selectedObject.setSelected(false);
        this.onPrismSelected?.(null);
      } else {
        this.selectedObject.setSelected(false);
      }
      this.selectedObject = null;
      this.onObjectSelected?.(null);
    }
  }
  
  /**
   * Get currently selected prism (for backwards compatibility)
   */
  getSelectedPrism(): Prism | null {
    return this.selectedObject instanceof Prism ? this.selectedObject : null;
  }
  
  /**
   * Get currently selected object
   */
  getSelectedObject(): DraggableObject | null {
    return this.selectedObject;
  }
  
  /**
   * Create and add a visual grid helper to the scene
   */
  createGridHelper(scene: THREE.Scene): THREE.GridHelper {
    // Remove existing grid if any
    if (this.gridHelper) {
      scene.remove(this.gridHelper);
    }
    
    const { gridSize, gridOrigin } = this.config;
    const gridExtent = 40; // Total grid size
    const divisions = gridExtent / gridSize;
    
    this.gridHelper = new THREE.GridHelper(
      gridExtent,
      divisions,
      0x3a3a3a,  // Center line color
      0x1a1a1a   // Grid line color
    );
    
    // Position at the same Y as prisms
    this.gridHelper.position.set(gridOrigin.x, 5, gridOrigin.z);
    
    scene.add(this.gridHelper);
    return this.gridHelper;
  }
  
  /**
   * Update (call every frame)
   */
  update(): void {
    this.orbitControls.update();
  }
  
  /**
   * Clean up
   */
  dispose(): void {
    this.orbitControls.dispose();
    window.removeEventListener('keydown', this.onKeyDown.bind(this));
    this.domElement.removeEventListener('mousedown', this.onMouseDown.bind(this));
    this.domElement.removeEventListener('mousemove', this.onMouseMove.bind(this));
    this.domElement.removeEventListener('mouseup', this.onMouseUp.bind(this));
  }
}
