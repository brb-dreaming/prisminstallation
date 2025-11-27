/**
 * UI Panel - minimal info overlay with scene editing controls
 */

import type { Prism } from '../scene/prism';
import type { Wall } from '../scene/wall';
import type { ConvergenceResult } from '../interaction/puzzle';
import type { InteractionMode, DraggableObject } from '../interaction/controls';

export interface EnvironmentSettings {
  backgroundColor: string;
  gridColor: string;
  gridSecondaryColor: string;
  ambientIntensity: number;
  gridSize: number;
  gridExtent: number;
  snapRotationDegrees: number;
}

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
  
  // Config callbacks
  onSaveConfig: ((name: string) => void) | null = null;
  onLoadConfig: ((name: string) => void) | null = null;
  onImportConfig: (() => void) | null = null;
  onExportConfig: (() => void) | null = null;
  onNewConfig: (() => void) | null = null;
  
  // Environment callbacks
  onBackgroundColorChange: ((color: string) => void) | null = null;
  onGridColorChange: ((primary: string, secondary: string) => void) | null = null;
  onAmbientIntensityChange: ((intensity: number) => void) | null = null;
  onGridSizeChange: ((size: number) => void) | null = null;
  onGridExtentChange: ((extent: number) => void) | null = null;
  onSnapRotationChange: ((degrees: number) => void) | null = null;
  
  private currentMode: InteractionMode = 'rotate';
  private savedConfigs: string[] = [];
  
  constructor() {
    this.prismInfoEl = document.getElementById('prism-info');
    this.convergenceFillEl = document.getElementById('convergence-fill');
    this.convergenceValueEl = document.getElementById('convergence-value');
    this.modeToggleEl = null;
    
    this.createEditingPanel();
    this.createEnvironmentPanel();
    this.createConfigPanel();
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
      <div class="snap-rotation-control">
        <label>Snap Rotation (hold Shift)</label>
        <div class="snap-rotation-row">
          <input type="range" id="snap-rotation" min="1" max="45" value="15" step="1" class="slider-input">
          <span id="snap-rotation-value" class="slider-value">15°</span>
        </div>
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
    
    // Wire up snap rotation slider
    document.getElementById('snap-rotation')?.addEventListener('input', (e) => {
      const value = parseInt((e.target as HTMLInputElement).value);
      const valueEl = document.getElementById('snap-rotation-value');
      if (valueEl) valueEl.textContent = `${value}°`;
      this.onSnapRotationChange?.(value);
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
   * Create the environment panel with color and lighting controls
   */
  private createEnvironmentPanel(): void {
    const infoPanel = document.getElementById('info-panel');
    if (!infoPanel) return;
    
    const envSection = document.createElement('div');
    envSection.className = 'panel-section collapsible';
    envSection.innerHTML = `
      <h3 class="collapsible-header" data-target="env-content">
        <span class="collapse-icon">▸</span>
        Environment
      </h3>
      <div class="collapsible-content collapsed" id="env-content">
      <div class="env-controls">
        <div class="env-row">
          <label>Background</label>
          <input type="color" id="env-bg-color" value="#050507" class="color-input">
        </div>
        <div class="env-row">
          <label>Grid Primary</label>
          <input type="color" id="env-grid-color" value="#3a3a3a" class="color-input">
        </div>
        <div class="env-row">
          <label>Grid Secondary</label>
          <input type="color" id="env-grid-secondary" value="#1a1a1a" class="color-input">
        </div>
        <div class="env-row">
          <label>Ambient Light</label>
          <input type="range" id="env-ambient" min="0" max="100" value="50" class="slider-input">
          <span id="ambient-value" class="slider-value">50%</span>
        </div>
        <div class="env-row">
          <label>Grid Cell Size</label>
          <input type="range" id="env-grid-size" min="1" max="10" value="2" step="0.5" class="slider-input">
          <span id="grid-size-value" class="slider-value">2</span>
        </div>
        <div class="env-row">
          <label>Grid Extent</label>
          <input type="range" id="env-grid-extent" min="20" max="150" value="40" step="10" class="slider-input">
          <span id="grid-extent-value" class="slider-value">40</span>
        </div>
      </div>
      </div>
    `;
    
    infoPanel.appendChild(envSection);
    
    // Wire up collapsible header
    this.setupCollapsible(envSection);
    
    // Wire up color inputs
    document.getElementById('env-bg-color')?.addEventListener('input', (e) => {
      const color = (e.target as HTMLInputElement).value;
      this.onBackgroundColorChange?.(color);
    });
    
    document.getElementById('env-grid-color')?.addEventListener('input', (e) => {
      const primary = (e.target as HTMLInputElement).value;
      const secondary = (document.getElementById('env-grid-secondary') as HTMLInputElement)?.value || '#1a1a1a';
      this.onGridColorChange?.(primary, secondary);
    });
    
    document.getElementById('env-grid-secondary')?.addEventListener('input', (e) => {
      const secondary = (e.target as HTMLInputElement).value;
      const primary = (document.getElementById('env-grid-color') as HTMLInputElement)?.value || '#3a3a3a';
      this.onGridColorChange?.(primary, secondary);
    });
    
    // Wire up sliders
    document.getElementById('env-ambient')?.addEventListener('input', (e) => {
      const value = parseInt((e.target as HTMLInputElement).value);
      const valueEl = document.getElementById('ambient-value');
      if (valueEl) valueEl.textContent = `${value}%`;
      this.onAmbientIntensityChange?.(value / 100);
    });
    
    document.getElementById('env-grid-size')?.addEventListener('input', (e) => {
      const value = parseFloat((e.target as HTMLInputElement).value);
      const valueEl = document.getElementById('grid-size-value');
      if (valueEl) valueEl.textContent = value.toString();
      this.onGridSizeChange?.(value);
    });
    
    document.getElementById('env-grid-extent')?.addEventListener('input', (e) => {
      const value = parseInt((e.target as HTMLInputElement).value);
      const valueEl = document.getElementById('grid-extent-value');
      if (valueEl) valueEl.textContent = value.toString();
      this.onGridExtentChange?.(value);
    });
  }
  
  /**
   * Create the configuration save/load panel
   */
  private createConfigPanel(): void {
    const infoPanel = document.getElementById('info-panel');
    if (!infoPanel) return;
    
    const configSection = document.createElement('div');
    configSection.className = 'panel-section collapsible';
    configSection.innerHTML = `
      <h3 class="collapsible-header" data-target="config-content">
        <span class="collapse-icon">▸</span>
        Configuration
      </h3>
      <div class="collapsible-content collapsed" id="config-content">
      <div class="config-controls">
        <button id="config-new" class="new-config-btn" title="Clear all prisms and start fresh">
          + New Empty Config
        </button>
        <div class="config-group">
          <label class="config-label">Save Current</label>
          <input type="text" id="config-name" placeholder="Config name..." class="config-input">
          <button id="config-save" class="config-btn-full" title="Save to browser">Save</button>
        </div>
        <div class="config-group">
          <label class="config-label">Load Saved</label>
          <select id="config-select" class="config-select">
            <option value="">Select a config...</option>
          </select>
          <button id="config-load" class="config-btn-full" title="Load selected">Load</button>
        </div>
        <div class="config-buttons">
          <button id="config-import" class="export-btn" title="Import from file">Import File</button>
          <button id="config-export" class="export-btn" title="Export to file">Export File</button>
        </div>
      </div>
      </div>
    `;
    
    infoPanel.appendChild(configSection);
    
    // Wire up collapsible header
    this.setupCollapsible(configSection);
    
    // Wire up buttons
    document.getElementById('config-new')?.addEventListener('click', () => {
      this.onNewConfig?.();
    });
    
    document.getElementById('config-save')?.addEventListener('click', () => {
      const nameInput = document.getElementById('config-name') as HTMLInputElement;
      const name = nameInput?.value.trim();
      if (name) {
        this.onSaveConfig?.(name);
        this.updateSavedConfigsList();
      } else {
        alert('Please enter a configuration name');
      }
    });
    
    document.getElementById('config-load')?.addEventListener('click', () => {
      const select = document.getElementById('config-select') as HTMLSelectElement;
      const name = select?.value;
      if (name) {
        this.onLoadConfig?.(name);
      }
    });
    
    document.getElementById('config-import')?.addEventListener('click', () => {
      this.onImportConfig?.();
    });
    
    document.getElementById('config-export')?.addEventListener('click', () => {
      this.onExportConfig?.();
    });
  }
  
  /**
   * Update the saved configs dropdown list
   */
  updateSavedConfigsList(configs?: string[]): void {
    if (configs) {
      this.savedConfigs = configs;
    }
    
    const select = document.getElementById('config-select') as HTMLSelectElement;
    if (!select) return;
    
    // Clear existing options except the first placeholder
    while (select.options.length > 1) {
      select.remove(1);
    }
    
    // Add saved configs
    for (const name of this.savedConfigs) {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      select.appendChild(option);
    }
  }
  
  /**
   * Update environment UI to reflect current settings
   */
  updateEnvironmentUI(settings: EnvironmentSettings): void {
    const bgColor = document.getElementById('env-bg-color') as HTMLInputElement;
    const gridColor = document.getElementById('env-grid-color') as HTMLInputElement;
    const gridSecondary = document.getElementById('env-grid-secondary') as HTMLInputElement;
    const ambient = document.getElementById('env-ambient') as HTMLInputElement;
    const ambientValue = document.getElementById('ambient-value');
    const gridSize = document.getElementById('env-grid-size') as HTMLInputElement;
    const gridSizeValue = document.getElementById('grid-size-value');
    const gridExtent = document.getElementById('env-grid-extent') as HTMLInputElement;
    const gridExtentValue = document.getElementById('grid-extent-value');
    const snapRotation = document.getElementById('snap-rotation') as HTMLInputElement;
    const snapRotationValue = document.getElementById('snap-rotation-value');
    
    if (bgColor) bgColor.value = settings.backgroundColor;
    if (gridColor) gridColor.value = settings.gridColor;
    if (gridSecondary) gridSecondary.value = settings.gridSecondaryColor;
    if (ambient) ambient.value = String(Math.round(settings.ambientIntensity * 100));
    if (ambientValue) ambientValue.textContent = `${Math.round(settings.ambientIntensity * 100)}%`;
    if (gridSize) gridSize.value = String(settings.gridSize);
    if (gridSizeValue) gridSizeValue.textContent = String(settings.gridSize);
    if (gridExtent) gridExtent.value = String(settings.gridExtent);
    if (gridExtentValue) gridExtentValue.textContent = String(settings.gridExtent);
    if (snapRotation) snapRotation.value = String(settings.snapRotationDegrees);
    if (snapRotationValue) snapRotationValue.textContent = `${settings.snapRotationDegrees}°`;
  }
  
  /**
   * Create the export panel with buttons
   */
  private createExportPanel(): void {
    const infoPanel = document.getElementById('info-panel');
    if (!infoPanel) return;
    
    const exportSection = document.createElement('div');
    exportSection.className = 'panel-section collapsible';
    exportSection.innerHTML = `
      <h3 class="collapsible-header" data-target="export-content">
        <span class="collapse-icon">▸</span>
        Blueprint Export
      </h3>
      <div class="collapsible-content collapsed" id="export-content">
        <div class="export-buttons">
          <button id="export-blueprint" class="export-btn">Blueprint (TXT)</button>
          <button id="export-json" class="export-btn">Data (JSON)</button>
        </div>
      </div>
    `;
    
    infoPanel.appendChild(exportSection);
    
    // Wire up collapsible header
    this.setupCollapsible(exportSection);
    
    // Wire up buttons
    document.getElementById('export-blueprint')?.addEventListener('click', () => {
      this.onExportBlueprint?.();
    });
    
    document.getElementById('export-json')?.addEventListener('click', () => {
      this.onExportJSON?.();
    });
  }
  
  /**
   * Set up collapsible section behavior
   */
  private setupCollapsible(section: HTMLElement): void {
    const header = section.querySelector('.collapsible-header');
    if (!header) return;
    
    header.addEventListener('click', () => {
      const targetId = header.getAttribute('data-target');
      if (!targetId) return;
      
      const content = document.getElementById(targetId);
      const icon = header.querySelector('.collapse-icon');
      
      if (content) {
        content.classList.toggle('collapsed');
        if (icon) {
          icon.textContent = content.classList.contains('collapsed') ? '▸' : '▾';
        }
      }
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
          <span>Orbit: drag | Pan: right-drag | Zoom: scroll</span>
          <span>Move object: click + drag (snaps to grid)</span>
          <span>Press M to toggle mode</span>
        `;
      } else {
        hint.innerHTML = `
          <span>Orbit: drag | Pan: right-drag | Zoom: scroll</span>
          <span>Rotate: click + drag | Hold Shift for snap</span>
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
      
      let displayName: string;
      let typeLabel: string;
      
      if (prism.config.type === 'splitter') {
        displayName = 'Central';
        typeLabel = 'Splitter Prism';
      } else {
        // Get color group name from the attached colorGroup, or fallback to wavelength
        const colorGroup = (prism as any).colorGroup;
        if (colorGroup) {
          displayName = colorGroup.name;  // 'Warm', 'Green', or 'Cool'
        } else if (prism.config.targetWavelength) {
          displayName = this.wavelengthToColorName(prism.config.targetWavelength);
        } else {
          displayName = 'Director';
        }
        typeLabel = 'Director Prism';
      }
      
      const posX = prism.config.position.x.toFixed(1);
      const posZ = prism.config.position.z.toFixed(1);
      
      this.prismInfoEl.innerHTML = `
        <div class="prism-name">${displayName} ${typeLabel}</div>
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
