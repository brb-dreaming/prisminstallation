/**
 * UI Panel - minimal info overlay with scene editing controls
 */

import type { Prism } from '../scene/prism';
import type { Wall } from '../scene/wall';
import type { ConvergenceResult } from '../interaction/puzzle';
import type { InteractionMode, DraggableObject } from '../interaction/controls';

/**
 * Manages the UI overlay elements
 */
export class UIPanel {
  private prismInfoEl: HTMLElement | null;
  private convergenceFillEl: HTMLElement | null;
  private convergenceValueEl: HTMLElement | null;
  private modeToggleEl: HTMLElement | null;
  
  // Callbacks
  onExportBlueprint: (() => void) | null = null;
  onExportJSON: (() => void) | null = null;
  onEnterVR: (() => void) | null = null;
  onAddPrism: (() => void) | null = null;
  onAddWall: (() => void) | null = null;
  onDeleteSelected: (() => void) | null = null;
  onModeChange: ((mode: InteractionMode) => void) | null = null;
  
  private currentMode: InteractionMode = 'rotate';
  
  constructor() {
    this.prismInfoEl = document.getElementById('prism-info');
    this.convergenceFillEl = document.getElementById('convergence-fill');
    this.convergenceValueEl = document.getElementById('convergence-value');
    this.modeToggleEl = null;
    
    this.createEditingPanel();
    this.createExportPanel();
  }
  
  /**
   * Create the editing panel with add/remove and mode controls
   */
  private createEditingPanel(): void {
    const infoPanel = document.getElementById('info-panel');
    if (!infoPanel) return;
    
    // Insert before other sections
    const editSection = document.createElement('div');
    editSection.className = 'panel-section';
    editSection.innerHTML = `
      <h3>Edit Mode</h3>
      <div class="mode-toggle" id="mode-toggle">
        <button class="mode-btn active" data-mode="rotate">
          <span class="mode-icon">↻</span>
          <span class="mode-label">Rotate</span>
        </button>
        <button class="mode-btn" data-mode="move">
          <span class="mode-icon">⊹</span>
          <span class="mode-label">Move</span>
        </button>
      </div>
      <h3 style="margin-top: 16px;">Add Objects</h3>
      <div class="add-buttons">
        <button id="add-prism" class="add-btn" title="Add a new director prism">
          <span class="btn-icon">◇</span> Prism
        </button>
        <button id="add-wall" class="add-btn" title="Add a blocking wall">
          <span class="btn-icon">■</span> Wall
        </button>
      </div>
      <button id="delete-selected" class="delete-btn" disabled>
        Delete Selected
      </button>
    `;
    
    // Insert at the beginning of info panel
    infoPanel.insertBefore(editSection, infoPanel.firstChild);
    
    this.modeToggleEl = document.getElementById('mode-toggle');
    
    // Wire up mode toggle buttons
    const modeBtns = editSection.querySelectorAll('.mode-btn');
    modeBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.getAttribute('data-mode') as InteractionMode;
        this.setMode(mode);
        this.onModeChange?.(mode);
      });
    });
    
    // Wire up add buttons
    document.getElementById('add-prism')?.addEventListener('click', () => {
      this.onAddPrism?.();
    });
    
    document.getElementById('add-wall')?.addEventListener('click', () => {
      this.onAddWall?.();
    });
    
    document.getElementById('delete-selected')?.addEventListener('click', () => {
      this.onDeleteSelected?.();
    });
  }
  
  /**
   * Create the export panel with buttons
   */
  private createExportPanel(): void {
    const infoPanel = document.getElementById('info-panel');
    if (!infoPanel) return;
    
    const exportSection = document.createElement('div');
    exportSection.className = 'panel-section';
    exportSection.innerHTML = `
      <h3>Export</h3>
      <div class="export-buttons">
        <button id="export-blueprint" class="export-btn">Blueprint (TXT)</button>
        <button id="export-json" class="export-btn">Data (JSON)</button>
      </div>
    `;
    
    infoPanel.appendChild(exportSection);
    
    // Wire up buttons
    document.getElementById('export-blueprint')?.addEventListener('click', () => {
      this.onExportBlueprint?.();
    });
    
    document.getElementById('export-json')?.addEventListener('click', () => {
      this.onExportJSON?.();
    });
  }
  
  /**
   * Set the current interaction mode (updates UI)
   */
  setMode(mode: InteractionMode): void {
    this.currentMode = mode;
    
    if (this.modeToggleEl) {
      const btns = this.modeToggleEl.querySelectorAll('.mode-btn');
      btns.forEach(btn => {
        if (btn.getAttribute('data-mode') === mode) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });
    }
    
    // Update hint text
    this.updateControlsHint();
  }
  
  /**
   * Update the controls hint based on current mode
   */
  private updateControlsHint(): void {
    const hint = document.getElementById('controls-hint');
    if (hint) {
      if (this.currentMode === 'move') {
        hint.innerHTML = `
          <span>Orbit: drag</span>
          <span>Move object: click + drag (snaps to grid)</span>
          <span>Press M to toggle mode</span>
        `;
      } else {
        hint.innerHTML = `
          <span>Orbit: drag</span>
          <span>Rotate prism: click + drag on prism</span>
          <span>Press M to toggle mode</span>
        `;
      }
    }
  }
  
  /**
   * Update selection display for any draggable object
   */
  updateObjectSelection(object: DraggableObject | null): void {
    const deleteBtn = document.getElementById('delete-selected') as HTMLButtonElement;
    
    if (object) {
      if (deleteBtn) {
        deleteBtn.disabled = false;
      }
      
      if ('config' in object && 'targetWavelength' in object.config) {
        // It's a Prism
        this.updatePrismSelection(object as Prism);
      } else {
        // It's a Wall
        this.updateWallSelection(object as Wall);
      }
    } else {
      if (deleteBtn) {
        deleteBtn.disabled = true;
      }
      
      document.body.classList.remove('prism-selected');
      if (this.prismInfoEl) {
        this.prismInfoEl.innerHTML = `<span class="label">None selected</span>`;
      }
    }
  }
  
  /**
   * Update prism selection display
   */
  updatePrismSelection(prism: Prism | null): void {
    if (!this.prismInfoEl) return;
    
    if (prism) {
      document.body.classList.add('prism-selected');
      
      // Get color group name from the attached colorGroup, or fallback to wavelength
      const colorGroup = (prism as any).colorGroup;
      let displayName: string;
      
      if (colorGroup) {
        displayName = colorGroup.name;  // 'Warm', 'Green', or 'Cool'
      } else if (prism.config.targetWavelength) {
        displayName = this.wavelengthToColorName(prism.config.targetWavelength);
      } else {
        displayName = 'Splitter';
      }
      
      const posX = prism.config.position.x.toFixed(1);
      const posZ = prism.config.position.z.toFixed(1);
      
      this.prismInfoEl.innerHTML = `
        <div class="prism-name">${displayName} Director</div>
        <div class="angle">${prism.getRotationDegrees().toFixed(1)}°</div>
        <div class="position">Position: (${posX}, ${posZ})</div>
        <div class="material">${prism.config.material.name}</div>
      `;
    } else {
      document.body.classList.remove('prism-selected');
      this.prismInfoEl.innerHTML = `<span class="label">None selected</span>`;
    }
  }
  
  /**
   * Update wall selection display
   */
  updateWallSelection(wall: Wall | null): void {
    if (!this.prismInfoEl) return;
    
    if (wall) {
      document.body.classList.add('prism-selected');
      
      const posX = wall.config.position.x.toFixed(1);
      const posZ = wall.config.position.z.toFixed(1);
      
      this.prismInfoEl.innerHTML = `
        <div class="prism-name">Wall Block</div>
        <div class="angle">${wall.getRotationDegrees().toFixed(1)}°</div>
        <div class="position">Position: (${posX}, ${posZ})</div>
        <div class="material">Solid obstruction</div>
      `;
    } else {
      document.body.classList.remove('prism-selected');
      this.prismInfoEl.innerHTML = `<span class="label">None selected</span>`;
    }
  }
  
  /**
   * Update prism rotation display (while dragging)
   */
  updatePrismRotation(prism: Prism): void {
    if (!this.prismInfoEl) return;
    
    const angleEl = this.prismInfoEl.querySelector('.angle');
    const posEl = this.prismInfoEl.querySelector('.position');
    
    if (angleEl) {
      angleEl.textContent = `${prism.getRotationDegrees().toFixed(1)}°`;
    }
    if (posEl) {
      const posX = prism.config.position.x.toFixed(1);
      const posZ = prism.config.position.z.toFixed(1);
      posEl.textContent = `Position: (${posX}, ${posZ})`;
    }
  }
  
  /**
   * Update convergence meter
   */
  updateConvergence(result: ConvergenceResult): void {
    if (this.convergenceFillEl) {
      this.convergenceFillEl.style.width = `${result.score * 100}%`;
      
      // Special styling for white light mode
      if (result.isWhiteLight) {
        this.convergenceFillEl.classList.add('white-light');
      } else {
        this.convergenceFillEl.classList.remove('white-light');
      }
    }
    
    if (this.convergenceValueEl) {
      if (result.isWhiteLight) {
        this.convergenceValueEl.textContent = '✨ WHITE LIGHT!';
        this.convergenceValueEl.classList.add('white-light');
      } else {
        this.convergenceValueEl.textContent = `${Math.round(result.score * 100)}%`;
        this.convergenceValueEl.classList.remove('white-light');
        
        // Show color groups present as a hint
        if (result.colorGroupsPresent && result.colorGroupsPresent.size > 0) {
          const groups = Array.from(result.colorGroupsPresent);
          const missing = ['warm', 'green', 'cool'].filter(g => !groups.includes(g));
          if (missing.length > 0 && missing.length < 3) {
            const missingNames = missing.map(g => g.charAt(0).toUpperCase() + g.slice(1));
            this.convergenceValueEl.textContent += ` (need ${missingNames.join(', ')})`;
          }
        }
      }
    }
    
    // Update body class for solved state
    if (result.isSolved) {
      document.body.classList.add('solved');
    } else {
      document.body.classList.remove('solved');
    }
    
    // Special class for white light achievement
    if (result.isWhiteLight) {
      document.body.classList.add('white-light-achieved');
    } else {
      document.body.classList.remove('white-light-achieved');
    }
  }
  
  /**
   * Show solved celebration
   */
  showSolvedState(): void {
    document.body.classList.add('solved');
  }
  
  private wavelengthToColorName(wavelength: number): string {
    if (wavelength < 450) return 'Violet';
    if (wavelength < 490) return 'Blue';
    if (wavelength < 520) return 'Cyan';
    if (wavelength < 565) return 'Green';
    if (wavelength < 590) return 'Yellow';
    if (wavelength < 625) return 'Orange';
    return 'Red';
  }
  
  /**
   * Show VR button when WebXR is supported
   */
  showVRButton(): void {
    const infoPanel = document.getElementById('info-panel');
    if (!infoPanel) return;
    
    // Check if VR section already exists
    if (document.getElementById('vr-section')) return;
    
    const vrSection = document.createElement('div');
    vrSection.className = 'panel-section';
    vrSection.id = 'vr-section';
    vrSection.innerHTML = `
      <h3>VR Mode</h3>
      <button id="enter-vr" class="export-btn vr-btn">Enter VR</button>
    `;
    
    infoPanel.appendChild(vrSection);
    
    document.getElementById('enter-vr')?.addEventListener('click', () => {
      this.onEnterVR?.();
    });
  }
  
  /**
   * Update VR button state
   */
  updateVRState(isInVR: boolean): void {
    const vrButton = document.getElementById('enter-vr');
    if (vrButton) {
      vrButton.textContent = isInVR ? 'Exit VR' : 'Enter VR';
    }
  }
}
