/**
 * Blueprint Export - Generate technical specifications and schematics
 * for building the physical prism light installation
 */

import type { Prism } from '../scene/prism';
import type { LightSource } from '../scene/light-source';
import type { Backdrop } from '../scene/backdrop';
import type { PuzzleSystem } from '../interaction/puzzle';

export interface BlueprintData {
  title: string;
  timestamp: string;
  scale: string;
  
  lightSource: {
    position: { x: number; y: number; z: number };
    direction: { x: number; y: number; z: number };
    type: string;
  };
  
  splitterPrism: {
    position: { x: number; y: number; z: number };
    rotation: number;
    material: string;
    sideLength: number;
    height: number;
  };
  
  directorPrisms: Array<{
    index: number;
    color: string;
    wavelength: number;
    position: { x: number; y: number; z: number };
    rotation: number;
    material: string;
    sideLength: number;
    height: number;
  }>;
  
  backdrop: {
    position: { x: number; y: number; z: number };
    width: number;
    height: number;
  };
  
  targetZone: {
    position: { x: number; y: number; z: number };
    radius: number;
  };
  
  partsList: Array<{
    item: string;
    quantity: number;
    specifications: string;
    notes?: string;
  }>;
}

/**
 * Generate blueprint data from current scene configuration
 */
export function generateBlueprintData(
  lightSource: LightSource,
  splitterPrism: Prism,
  directorPrisms: Prism[],
  backdrop: Backdrop,
  puzzle: PuzzleSystem
): BlueprintData {
  const wavelengthToColor = (wavelength: number): string => {
    if (wavelength < 450) return 'Violet';
    if (wavelength < 490) return 'Blue';
    if (wavelength < 520) return 'Cyan';
    if (wavelength < 565) return 'Green';
    if (wavelength < 590) return 'Yellow';
    if (wavelength < 625) return 'Orange';
    return 'Red';
  };
  
  const directors = directorPrisms.map((prism, index) => ({
    index: index + 1,
    color: wavelengthToColor(prism.config.targetWavelength || 550),
    wavelength: prism.config.targetWavelength || 550,
    position: {
      x: Math.round(prism.config.position.x * 10) / 10,
      y: Math.round(prism.config.position.y * 10) / 10,
      z: Math.round(prism.config.position.z * 10) / 10
    },
    rotation: Math.round(prism.getRotationDegrees() * 10) / 10,
    material: prism.config.material.name,
    sideLength: prism.config.sideLength,
    height: prism.config.height
  }));
  
  // Generate parts list
  const partsList = [
    {
      item: 'Collimated White Light Source',
      quantity: 1,
      specifications: 'LED or laser, collimated beam, adjustable intensity',
      notes: 'Consider using a bright white LED with collimating lens'
    },
    {
      item: `Equilateral Prism (Splitter)`,
      quantity: 1,
      specifications: `${splitterPrism.config.sideLength}cm sides, ${splitterPrism.config.height}cm tall, ${splitterPrism.config.material.name}`,
      notes: 'Primary dispersion element - quality optical glass recommended'
    },
    {
      item: `Equilateral Prism (Director)`,
      quantity: directorPrisms.length,
      specifications: `${directorPrisms[0]?.config.sideLength || 3}cm sides, ${directorPrisms[0]?.config.height || 6}cm tall, ${directorPrisms[0]?.config.material.name || 'BK7'}`,
      notes: 'Rotatable on vertical axis for beam redirection'
    },
    {
      item: 'Prism Mount (Rotatable)',
      quantity: directorPrisms.length,
      specifications: 'Allows rotation on vertical axis, secure grip on prism base/top',
      notes: 'Consider ball bearing or smooth rotation mechanism'
    },
    {
      item: 'Prism Mount (Fixed)',
      quantity: 1,
      specifications: 'Stable mount for splitter prism at calculated angle',
      notes: `Set at ${Math.round(splitterPrism.getRotationDegrees())}° rotation`
    },
    {
      item: 'Backdrop/Projection Surface',
      quantity: 1,
      specifications: `${backdrop.config.width}cm × ${backdrop.config.height}cm, matte dark finish`,
      notes: 'Low reflectivity surface for best beam visibility'
    },
    {
      item: 'Base Platform',
      quantity: 1,
      specifications: 'Sturdy platform to mount all components',
      notes: 'Consider optical breadboard or custom fabrication'
    }
  ];
  
  return {
    title: 'Prism Light Installation Blueprint',
    timestamp: new Date().toISOString(),
    scale: '1 unit = 1 cm',
    
    lightSource: {
      position: {
        x: Math.round(lightSource.config.position.x * 10) / 10,
        y: Math.round(lightSource.config.position.y * 10) / 10,
        z: Math.round(lightSource.config.position.z * 10) / 10
      },
      direction: {
        x: Math.round(lightSource.config.direction.x * 1000) / 1000,
        y: Math.round(lightSource.config.direction.y * 1000) / 1000,
        z: Math.round(lightSource.config.direction.z * 1000) / 1000
      },
      type: 'Collimated White Light'
    },
    
    splitterPrism: {
      position: {
        x: Math.round(splitterPrism.config.position.x * 10) / 10,
        y: Math.round(splitterPrism.config.position.y * 10) / 10,
        z: Math.round(splitterPrism.config.position.z * 10) / 10
      },
      rotation: Math.round(splitterPrism.getRotationDegrees() * 10) / 10,
      material: splitterPrism.config.material.name,
      sideLength: splitterPrism.config.sideLength,
      height: splitterPrism.config.height
    },
    
    directorPrisms: directors,
    
    backdrop: {
      position: {
        x: Math.round(backdrop.config.position.x * 10) / 10,
        y: Math.round(backdrop.config.position.y * 10) / 10,
        z: Math.round(backdrop.config.position.z * 10) / 10
      },
      width: backdrop.config.width,
      height: backdrop.config.height
    },
    
    targetZone: {
      position: {
        x: Math.round(puzzle.config.targetPosition.x * 10) / 10,
        y: Math.round(puzzle.config.targetPosition.y * 10) / 10,
        z: Math.round(puzzle.config.targetPosition.z * 10) / 10
      },
      radius: puzzle.config.targetRadius
    },
    
    partsList
  };
}

/**
 * Format blueprint data as readable text
 */
export function formatBlueprintText(data: BlueprintData): string {
  const lines: string[] = [];
  
  lines.push('═'.repeat(60));
  lines.push(data.title.toUpperCase());
  lines.push('═'.repeat(60));
  lines.push('');
  lines.push(`Generated: ${new Date(data.timestamp).toLocaleString()}`);
  lines.push(`Scale: ${data.scale}`);
  lines.push('');
  
  lines.push('─'.repeat(60));
  lines.push('LIGHT SOURCE');
  lines.push('─'.repeat(60));
  lines.push(`  Type: ${data.lightSource.type}`);
  lines.push(`  Position: (${data.lightSource.position.x}, ${data.lightSource.position.y}, ${data.lightSource.position.z}) cm`);
  lines.push(`  Direction: (${data.lightSource.direction.x}, ${data.lightSource.direction.y}, ${data.lightSource.direction.z})`);
  lines.push('');
  
  lines.push('─'.repeat(60));
  lines.push('SPLITTER PRISM');
  lines.push('─'.repeat(60));
  lines.push(`  Material: ${data.splitterPrism.material}`);
  lines.push(`  Dimensions: ${data.splitterPrism.sideLength}cm sides × ${data.splitterPrism.height}cm tall`);
  lines.push(`  Position: (${data.splitterPrism.position.x}, ${data.splitterPrism.position.y}, ${data.splitterPrism.position.z}) cm`);
  lines.push(`  Rotation: ${data.splitterPrism.rotation}°`);
  lines.push('');
  
  lines.push('─'.repeat(60));
  lines.push('DIRECTOR PRISMS');
  lines.push('─'.repeat(60));
  for (const prism of data.directorPrisms) {
    lines.push(`  [${prism.index}] ${prism.color} (${prism.wavelength}nm)`);
    lines.push(`      Position: (${prism.position.x}, ${prism.position.y}, ${prism.position.z}) cm`);
    lines.push(`      Rotation: ${prism.rotation}°`);
    lines.push(`      Material: ${prism.material}`);
    lines.push(`      Size: ${prism.sideLength}cm × ${prism.height}cm`);
  }
  lines.push('');
  
  lines.push('─'.repeat(60));
  lines.push('BACKDROP');
  lines.push('─'.repeat(60));
  lines.push(`  Position: (${data.backdrop.position.x}, ${data.backdrop.position.y}, ${data.backdrop.position.z}) cm`);
  lines.push(`  Dimensions: ${data.backdrop.width}cm × ${data.backdrop.height}cm`);
  lines.push('');
  
  lines.push('─'.repeat(60));
  lines.push('TARGET CONVERGENCE ZONE');
  lines.push('─'.repeat(60));
  lines.push(`  Position: (${data.targetZone.position.x}, ${data.targetZone.position.y}, ${data.targetZone.position.z}) cm`);
  lines.push(`  Radius: ${data.targetZone.radius}cm`);
  lines.push('');
  
  lines.push('─'.repeat(60));
  lines.push('PARTS LIST');
  lines.push('─'.repeat(60));
  for (const part of data.partsList) {
    lines.push(`  • ${part.item} (×${part.quantity})`);
    lines.push(`    Specs: ${part.specifications}`);
    if (part.notes) {
      lines.push(`    Notes: ${part.notes}`);
    }
  }
  lines.push('');
  
  lines.push('═'.repeat(60));
  lines.push('END OF BLUEPRINT');
  lines.push('═'.repeat(60));
  
  return lines.join('\n');
}

/**
 * Export blueprint as downloadable text file
 */
export function downloadBlueprint(data: BlueprintData): void {
  const text = formatBlueprintText(data);
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = `prism-blueprint-${Date.now()}.txt`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  URL.revokeObjectURL(url);
}

/**
 * Export blueprint as JSON for further processing
 */
export function downloadBlueprintJSON(data: BlueprintData): void {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = `prism-blueprint-${Date.now()}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  URL.revokeObjectURL(url);
}

