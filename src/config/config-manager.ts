/**
 * Configuration Manager - Save and load scene configurations
 */

import type { Prism } from '../scene/prism';
import type { Wall } from '../scene/wall';

export interface PrismConfigData {
  position: { x: number; y: number; z: number };
  rotationY: number;
  targetWavelength?: number;
  colorGroupName?: string;
  type: 'splitter' | 'director';
  material: string;
  sideLength: number;
  height: number;
}

export interface WallConfigData {
  position: { x: number; y: number; z: number };
  rotationY: number;
  width: number;
  height: number;
  depth: number;
}

export interface EnvironmentConfig {
  backgroundColor: string;
  gridColor: string;
  gridSecondaryColor: string;
  ambientIntensity: number;
  gridSize: number;
  gridExtent: number;
}

export interface SceneConfig {
  version: string;
  timestamp: string;
  name: string;
  
  // Splitter prism
  splitterPrism: PrismConfigData;
  
  // Director prisms
  directorPrisms: PrismConfigData[];
  
  // Walls
  walls: WallConfigData[];
  
  // Environment settings
  environment: EnvironmentConfig;
  
  // Camera position
  camera?: {
    position: { x: number; y: number; z: number };
    target: { x: number; y: number; z: number };
  };
}

const CONFIG_VERSION = '1.0.0';
const STORAGE_KEY = 'prismsim_configs';
const CURRENT_CONFIG_KEY = 'prismsim_current';

/**
 * Extract configuration data from a Prism object
 */
export function extractPrismConfig(prism: Prism): PrismConfigData {
  const colorGroup = (prism as any).colorGroup;
  return {
    position: {
      x: prism.config.position.x,
      y: prism.config.position.y,
      z: prism.config.position.z
    },
    rotationY: prism.config.rotationY,
    targetWavelength: prism.config.targetWavelength,
    colorGroupName: colorGroup?.name,
    type: prism.config.type,
    material: prism.config.material.name,
    sideLength: prism.config.sideLength,
    height: prism.config.height
  };
}

/**
 * Extract configuration data from a Wall object
 */
export function extractWallConfig(wall: Wall): WallConfigData {
  return {
    position: {
      x: wall.config.position.x,
      y: wall.config.position.y,
      z: wall.config.position.z
    },
    rotationY: wall.config.rotationY,
    width: wall.config.width,
    height: wall.config.height,
    depth: wall.config.depth
  };
}

/**
 * Get list of saved configuration names
 */
export function getSavedConfigNames(): string[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const configs = JSON.parse(stored) as Record<string, SceneConfig>;
      return Object.keys(configs).sort();
    }
  } catch (e) {
    console.error('Error reading saved configs:', e);
  }
  return [];
}

/**
 * Save configuration to localStorage
 */
export function saveConfig(name: string, config: SceneConfig): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const configs: Record<string, SceneConfig> = stored ? JSON.parse(stored) : {};
    configs[name] = config;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(configs));
    localStorage.setItem(CURRENT_CONFIG_KEY, name);
    console.log(`Configuration "${name}" saved successfully`);
    return true;
  } catch (e) {
    console.error('Error saving config:', e);
    return false;
  }
}

/**
 * Load configuration from localStorage
 */
export function loadConfig(name: string): SceneConfig | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const configs = JSON.parse(stored) as Record<string, SceneConfig>;
      if (configs[name]) {
        localStorage.setItem(CURRENT_CONFIG_KEY, name);
        return configs[name];
      }
    }
  } catch (e) {
    console.error('Error loading config:', e);
  }
  return null;
}

/**
 * Delete a saved configuration
 */
export function deleteConfig(name: string): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const configs = JSON.parse(stored) as Record<string, SceneConfig>;
      if (configs[name]) {
        delete configs[name];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(configs));
        return true;
      }
    }
  } catch (e) {
    console.error('Error deleting config:', e);
  }
  return false;
}

/**
 * Get current config name
 */
export function getCurrentConfigName(): string | null {
  return localStorage.getItem(CURRENT_CONFIG_KEY);
}

/**
 * Export configuration as JSON file
 */
export function exportConfigToFile(config: SceneConfig, filename?: string): void {
  const json = JSON.stringify(config, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = filename || `prismsim-config-${config.name}-${Date.now()}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  URL.revokeObjectURL(url);
}

/**
 * Import configuration from JSON file
 */
export function importConfigFromFile(): Promise<SceneConfig | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      
      try {
        const text = await file.text();
        const config = JSON.parse(text) as SceneConfig;
        
        // Validate basic structure
        if (!config.version || !config.splitterPrism || !config.directorPrisms) {
          throw new Error('Invalid config file structure');
        }
        
        resolve(config);
      } catch (err) {
        console.error('Error reading config file:', err);
        resolve(null);
      }
    };
    
    input.click();
  });
}

/**
 * Create a new scene configuration
 */
export function createSceneConfig(
  name: string,
  splitterPrism: Prism,
  directorPrisms: Prism[],
  walls: Wall[],
  environment: EnvironmentConfig,
  camera?: { position: THREE.Vector3; target: THREE.Vector3 }
): SceneConfig {
  return {
    version: CONFIG_VERSION,
    timestamp: new Date().toISOString(),
    name,
    splitterPrism: extractPrismConfig(splitterPrism),
    directorPrisms: directorPrisms.map(extractPrismConfig),
    walls: walls.map(extractWallConfig),
    environment,
    camera: camera ? {
      position: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
      target: { x: camera.target.x, y: camera.target.y, z: camera.target.z }
    } : undefined
  };
}

/**
 * Get default environment configuration
 */
export function getDefaultEnvironment(): EnvironmentConfig {
  return {
    backgroundColor: '#050507',
    gridColor: '#3a3a3a',
    gridSecondaryColor: '#1a1a1a',
    ambientIntensity: 0.5,
    gridSize: 2,
    gridExtent: 40
  };
}

