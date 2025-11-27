/**
 * WebXR Integration - VR support preparation
 * Abstracts input handling for both desktop and VR modes
 */

import * as THREE from 'three';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';

export interface XRConfig {
  enabled: boolean;
  sessionType: 'immersive-vr' | 'immersive-ar';
  referenceSpace: 'local' | 'local-floor' | 'bounded-floor' | 'unbounded';
}

/**
 * Manages WebXR session and controllers
 */
export class XRManager {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  
  private controllers: THREE.XRTargetRaySpace[] = [];
  private controllerGrips: THREE.XRGripSpace[] = [];
  private controllerModelFactory: XRControllerModelFactory;
  
  private isPresenting: boolean = false;
  private isSupported: boolean = false;
  
  // Callbacks
  onSelectStart: ((controller: THREE.XRTargetRaySpace) => void) | null = null;
  onSelectEnd: ((controller: THREE.XRTargetRaySpace) => void) | null = null;
  onSqueezeStart: ((controller: THREE.XRTargetRaySpace) => void) | null = null;
  onSqueezeEnd: ((controller: THREE.XRTargetRaySpace) => void) | null = null;
  
  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.controllerModelFactory = new XRControllerModelFactory();
    
    this.checkXRSupport();
  }
  
  /**
   * Check if WebXR is supported
   */
  private async checkXRSupport(): Promise<void> {
    if ('xr' in navigator) {
      try {
        this.isSupported = await navigator.xr!.isSessionSupported('immersive-vr');
      } catch {
        this.isSupported = false;
      }
    }
  }
  
  /**
   * Initialize XR mode
   */
  async initialize(): Promise<boolean> {
    if (!this.isSupported) {
      console.log('WebXR not supported on this device');
      return false;
    }
    
    // Enable XR on renderer
    this.renderer.xr.enabled = true;
    
    // Set up controllers
    this.setupControllers();
    
    return true;
  }
  
  /**
   * Set up VR controllers
   */
  private setupControllers(): void {
    // Controller 0 (usually right hand)
    const controller0 = this.renderer.xr.getController(0);
    controller0.addEventListener('selectstart', () => this.onSelectStart?.(controller0));
    controller0.addEventListener('selectend', () => this.onSelectEnd?.(controller0));
    controller0.addEventListener('squeezestart', () => this.onSqueezeStart?.(controller0));
    controller0.addEventListener('squeezeend', () => this.onSqueezeEnd?.(controller0));
    this.scene.add(controller0);
    this.controllers.push(controller0);
    
    // Controller 1 (usually left hand)
    const controller1 = this.renderer.xr.getController(1);
    controller1.addEventListener('selectstart', () => this.onSelectStart?.(controller1));
    controller1.addEventListener('selectend', () => this.onSelectEnd?.(controller1));
    controller1.addEventListener('squeezestart', () => this.onSqueezeStart?.(controller1));
    controller1.addEventListener('squeezeend', () => this.onSqueezeEnd?.(controller1));
    this.scene.add(controller1);
    this.controllers.push(controller1);
    
    // Controller models (grips)
    const grip0 = this.renderer.xr.getControllerGrip(0);
    grip0.add(this.controllerModelFactory.createControllerModel(grip0));
    this.scene.add(grip0);
    this.controllerGrips.push(grip0);
    
    const grip1 = this.renderer.xr.getControllerGrip(1);
    grip1.add(this.controllerModelFactory.createControllerModel(grip1));
    this.scene.add(grip1);
    this.controllerGrips.push(grip1);
    
    // Add visual rays to controllers
    for (const controller of this.controllers) {
      const geometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, -5)
      ]);
      const material = new THREE.LineBasicMaterial({ 
        color: 0xffffff,
        transparent: true,
        opacity: 0.5
      });
      const line = new THREE.Line(geometry, material);
      controller.add(line);
    }
  }
  
  /**
   * Start VR session
   */
  async enterVR(): Promise<boolean> {
    if (!this.isSupported) return false;
    
    try {
      const sessionInit = {
        optionalFeatures: ['local-floor', 'bounded-floor']
      };
      
      await this.renderer.xr.getSession()?.end();
      
      const session = await navigator.xr!.requestSession('immersive-vr', sessionInit);
      this.renderer.xr.setSession(session);
      
      session.addEventListener('end', () => {
        this.isPresenting = false;
      });
      
      this.isPresenting = true;
      return true;
    } catch (error) {
      console.error('Failed to enter VR:', error);
      return false;
    }
  }
  
  /**
   * Exit VR session
   */
  async exitVR(): Promise<void> {
    const session = this.renderer.xr.getSession();
    if (session) {
      await session.end();
    }
    this.isPresenting = false;
  }
  
  /**
   * Get controller position for interaction
   */
  getControllerPosition(index: number): THREE.Vector3 | null {
    if (index >= this.controllers.length) return null;
    return this.controllers[index].position.clone();
  }
  
  /**
   * Get controller direction for raycasting
   */
  getControllerDirection(index: number): THREE.Vector3 | null {
    if (index >= this.controllers.length) return null;
    
    const controller = this.controllers[index];
    const direction = new THREE.Vector3(0, 0, -1);
    direction.applyQuaternion(controller.quaternion);
    return direction;
  }
  
  /**
   * Check if currently in VR
   */
  getIsPresenting(): boolean {
    return this.isPresenting;
  }
  
  /**
   * Check if VR is supported
   */
  getIsSupported(): boolean {
    return this.isSupported;
  }
  
  /**
   * Get controllers for external use
   */
  getControllers(): THREE.XRTargetRaySpace[] {
    return this.controllers;
  }
}

/**
 * Unified input handler that works for both mouse and VR controllers
 */
export interface UnifiedInput {
  type: 'mouse' | 'controller';
  position: THREE.Vector3;
  direction: THREE.Vector3;
  isSelecting: boolean;
  controllerIndex?: number;
}

/**
 * Create a unified input from mouse event
 */
export function mouseToUnifiedInput(
  mouse: THREE.Vector2,
  camera: THREE.Camera
): UnifiedInput {
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(mouse, camera);
  
  return {
    type: 'mouse',
    position: raycaster.ray.origin.clone(),
    direction: raycaster.ray.direction.clone(),
    isSelecting: false
  };
}

/**
 * Create a unified input from VR controller
 */
export function controllerToUnifiedInput(
  controller: THREE.XRTargetRaySpace,
  index: number,
  isSelecting: boolean
): UnifiedInput {
  const direction = new THREE.Vector3(0, 0, -1);
  direction.applyQuaternion(controller.quaternion);
  
  return {
    type: 'controller',
    position: controller.position.clone(),
    direction,
    isSelecting,
    controllerIndex: index
  };
}

