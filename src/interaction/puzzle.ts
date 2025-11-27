/**
 * Puzzle system - target convergence detection and solved state
 * Enhanced with white light recombination victory condition
 */

import * as THREE from 'three';
import { Prism } from '../scene/prism';
import { TargetZone } from '../scene/backdrop';
import { getColorGroupForWavelength } from '../optics/spectrum';

export interface ConvergenceResult {
  score: number;           // 0-1, how well beams converge
  beamsInTarget: number;   // How many beams hit the target zone
  totalBeams: number;      // Total number of beams
  averageDistance: number; // Average distance from target center
  isSolved: boolean;       // True if puzzle is solved
  colorGroupsPresent: Set<string>;  // Which color groups hit the target
  isWhiteLight: boolean;   // True if all three groups converge (white light!)
}

export interface PuzzleConfig {
  solveThreshold: number;      // Convergence score needed to solve (0-1)
  requiredBeams: number;       // Minimum beams that must hit target
  targetPosition: THREE.Vector3;
  targetRadius: number;
}

/**
 * Manages the puzzle state and convergence detection
 */
export class PuzzleSystem {
  config: PuzzleConfig;
  targetZone: TargetZone;
  
  // State
  private lastConvergence: ConvergenceResult | null = null;
  private wasSolved: boolean = false;
  
  // Callbacks
  onConvergenceChanged: ((result: ConvergenceResult) => void) | null = null;
  onSolved: (() => void) | null = null;
  
  constructor(config: Partial<PuzzleConfig> = {}) {
    this.config = {
      solveThreshold: 0.85,
      requiredBeams: 5,
      targetPosition: new THREE.Vector3(30, 0, 0),
      targetRadius: 4,
      ...config
    };
    
    this.targetZone = new TargetZone(
      this.config.targetPosition,
      this.config.targetRadius
    );
  }
  
  /**
   * Calculate convergence score from beam endpoints
   * Enhanced to track color groups and detect white light recombination
   */
  calculateConvergence(beamEndpoints: THREE.Vector3[], wavelengths?: number[]): ConvergenceResult {
    const colorGroupsPresent = new Set<string>();
    
    if (beamEndpoints.length === 0) {
      return {
        score: 0,
        beamsInTarget: 0,
        totalBeams: 0,
        averageDistance: Infinity,
        isSolved: false,
        colorGroupsPresent,
        isWhiteLight: false
      };
    }
    
    let beamsInTarget = 0;
    let totalDistance = 0;
    const targetCenter = this.config.targetPosition;
    
    for (let i = 0; i < beamEndpoints.length; i++) {
      const endpoint = beamEndpoints[i];
      // Calculate distance from target center (in Y-Z plane, since backdrop is on X)
      const dy = endpoint.y - targetCenter.y;
      const dz = endpoint.z - targetCenter.z;
      const distance = Math.sqrt(dy * dy + dz * dz);
      
      totalDistance += distance;
      
      if (distance <= this.config.targetRadius) {
        beamsInTarget++;
        
        // Track which color groups hit the target
        if (wavelengths && wavelengths[i]) {
          const group = getColorGroupForWavelength(wavelengths[i]);
          if (group) {
            colorGroupsPresent.add(group.name.toLowerCase());
          }
        }
      }
    }
    
    const averageDistance = totalDistance / beamEndpoints.length;
    
    // Score based on:
    // 1. What fraction of beams hit the target
    // 2. How close to center the beams are
    const targetScore = beamsInTarget / Math.max(this.config.requiredBeams, beamEndpoints.length);
    const distanceScore = Math.max(0, 1 - averageDistance / (this.config.targetRadius * 2));
    
    // Combined score
    const score = targetScore * 0.6 + distanceScore * 0.4;
    
    // Check for white light - all three color groups converging!
    const isWhiteLight = colorGroupsPresent.has('warm') && 
                         colorGroupsPresent.has('green') && 
                         colorGroupsPresent.has('cool') &&
                         score >= 0.5;  // Need reasonable convergence
    
    // Puzzle is solved if white light is achieved or standard convergence
    const isSolved = isWhiteLight || 
                     (score >= this.config.solveThreshold && 
                      beamsInTarget >= this.config.requiredBeams);
    
    const result: ConvergenceResult = {
      score: Math.min(1, score),
      beamsInTarget,
      totalBeams: beamEndpoints.length,
      averageDistance,
      isSolved,
      colorGroupsPresent,
      isWhiteLight
    };
    
    // Check for state changes
    if (!this.lastConvergence || 
        Math.abs(result.score - this.lastConvergence.score) > 0.01 ||
        result.isWhiteLight !== this.lastConvergence.isWhiteLight) {
      this.onConvergenceChanged?.(result);
    }
    
    if (result.isSolved && !this.wasSolved) {
      this.wasSolved = true;
      this.onSolved?.();
    } else if (!result.isSolved) {
      this.wasSolved = false;
    }
    
    this.lastConvergence = result;
    
    // Update target zone visual with white light mode
    this.targetZone.setConvergence(result.score, result.isWhiteLight);
    
    return result;
  }
  
  /**
   * Get a hint about which prisms need adjustment
   */
  getHint(_prisms: Prism[], beamEndpoints: Map<Prism, THREE.Vector3>): string | null {
    if (!this.lastConvergence || this.lastConvergence.isSolved) {
      return null;
    }
    
    const targetCenter = this.config.targetPosition;
    let worstPrism: Prism | null = null;
    let worstDistance = 0;
    
    for (const [prism, endpoint] of beamEndpoints) {
      if (prism.config.type !== 'director') continue;
      
      const dy = endpoint.y - targetCenter.y;
      const dz = endpoint.z - targetCenter.z;
      const distance = Math.sqrt(dy * dy + dz * dz);
      
      if (distance > worstDistance) {
        worstDistance = distance;
        worstPrism = prism;
      }
    }
    
    if (worstPrism && worstDistance > this.config.targetRadius) {
      const wavelength = worstPrism.config.targetWavelength;
      const colorName = this.wavelengthToColorName(wavelength || 550);
      return `The ${colorName} beam is furthest from target`;
    }
    
    return null;
  }
  
  private wavelengthToColorName(wavelength: number): string {
    if (wavelength < 450) return 'violet';
    if (wavelength < 490) return 'blue';
    if (wavelength < 520) return 'cyan';
    if (wavelength < 565) return 'green';
    if (wavelength < 590) return 'yellow';
    if (wavelength < 625) return 'orange';
    return 'red';
  }
  
  /**
   * Update animation state
   */
  update(deltaTime: number): void {
    this.targetZone.update(deltaTime);
  }
  
  /**
   * Reset puzzle state
   */
  reset(): void {
    this.lastConvergence = null;
    this.wasSolved = false;
    this.targetZone.setConvergence(0);
  }
  
  /**
   * Export configuration for blueprint
   */
  getSpecs(): object {
    return {
      puzzle: {
        targetPosition: this.config.targetPosition,
        targetRadius: `${this.config.targetRadius} cm`,
        solveThreshold: `${(this.config.solveThreshold * 100).toFixed(0)}%`,
        requiredBeams: this.config.requiredBeams
      },
      lastResult: this.lastConvergence ? {
        score: `${(this.lastConvergence.score * 100).toFixed(1)}%`,
        beamsInTarget: `${this.lastConvergence.beamsInTarget}/${this.lastConvergence.totalBeams}`,
        isSolved: this.lastConvergence.isSolved
      } : null
    };
  }
}

