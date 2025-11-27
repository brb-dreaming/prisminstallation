/**
 * Spectrum utilities - wavelength to color mapping
 * Uses real spectral wavelengths: 380nm (violet) to 700nm (red)
 */

export interface SpectralColor {
  wavelength: number; // nanometers
  r: number;
  g: number;
  b: number;
  hex: string;
  name: string;
}

/**
 * Convert wavelength (nm) to RGB color
 * Based on CIE color matching functions approximation
 * Attempt to be physically accurate within display gamut limitations
 */
export function wavelengthToRGB(wavelength: number): { r: number; g: number; b: number } {
  let r: number, g: number, b: number;

  if (wavelength >= 380 && wavelength < 440) {
    r = -(wavelength - 440) / (440 - 380);
    g = 0;
    b = 1;
  } else if (wavelength >= 440 && wavelength < 490) {
    r = 0;
    g = (wavelength - 440) / (490 - 440);
    b = 1;
  } else if (wavelength >= 490 && wavelength < 510) {
    r = 0;
    g = 1;
    b = -(wavelength - 510) / (510 - 490);
  } else if (wavelength >= 510 && wavelength < 580) {
    r = (wavelength - 510) / (580 - 510);
    g = 1;
    b = 0;
  } else if (wavelength >= 580 && wavelength < 645) {
    r = 1;
    g = -(wavelength - 645) / (645 - 580);
    b = 0;
  } else if (wavelength >= 645 && wavelength <= 700) {
    r = 1;
    g = 0;
    b = 0;
  } else {
    r = 0;
    g = 0;
    b = 0;
  }

  // Intensity falloff at spectrum edges
  let factor: number;
  if (wavelength >= 380 && wavelength < 420) {
    factor = 0.3 + 0.7 * (wavelength - 380) / (420 - 380);
  } else if (wavelength >= 420 && wavelength <= 700) {
    factor = 1;
  } else if (wavelength > 700 && wavelength <= 780) {
    factor = 0.3 + 0.7 * (780 - wavelength) / (780 - 700);
  } else {
    factor = 0;
  }

  // Apply gamma correction for display
  const gamma = 0.8;
  r = Math.pow(r * factor, gamma);
  g = Math.pow(g * factor, gamma);
  b = Math.pow(b * factor, gamma);

  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255)
  };
}

export function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
}

export function wavelengthToHex(wavelength: number): string {
  const { r, g, b } = wavelengthToRGB(wavelength);
  return rgbToHex(r, g, b);
}

/**
 * Get a set of spectral colors for the visible spectrum
 * These represent the main bands that emerge from prism dispersion
 */
export function getSpectralBands(count: number = 7): SpectralColor[] {
  const bands: SpectralColor[] = [];
  const names = ['Violet', 'Blue', 'Cyan', 'Green', 'Yellow', 'Orange', 'Red'];
  
  // Key wavelengths for visible spectrum bands
  const wavelengths = [
    400,  // Violet
    460,  // Blue
    490,  // Cyan
    530,  // Green
    580,  // Yellow
    610,  // Orange
    660   // Red
  ];

  for (let i = 0; i < count && i < wavelengths.length; i++) {
    const wavelength = wavelengths[i];
    const { r, g, b } = wavelengthToRGB(wavelength);
    bands.push({
      wavelength,
      r, g, b,
      hex: rgbToHex(r, g, b),
      name: names[i] || `Band ${i}`
    });
  }

  return bands;
}

/**
 * Generate continuous spectrum samples for smooth rainbow effect
 */
export function getSpectrumSamples(count: number): SpectralColor[] {
  const samples: SpectralColor[] = [];
  const minWavelength = 400;
  const maxWavelength = 680;
  
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const wavelength = minWavelength + t * (maxWavelength - minWavelength);
    const { r, g, b } = wavelengthToRGB(wavelength);
    samples.push({
      wavelength,
      r, g, b,
      hex: rgbToHex(r, g, b),
      name: `${Math.round(wavelength)}nm`
    });
  }

  return samples;
}

/**
 * White light representation (for the source beam before dispersion)
 */
export const WHITE_LIGHT = {
  wavelength: 550, // Representative middle wavelength
  r: 255,
  g: 253,
  b: 245,
  hex: '#fffdf5',
  name: 'White'
} as const;

/**
 * Color group definitions for the three-prism director system
 * Each group catches a portion of the spectrum
 */
export interface ColorGroup {
  name: string;
  minWavelength: number;
  maxWavelength: number;
  centerWavelength: number;
  color: { r: number; g: number; b: number };
  hex: string;
}

export const COLOR_GROUPS: Record<string, ColorGroup> = {
  warm: {
    name: 'Warm',
    minWavelength: 580,
    maxWavelength: 680,
    centerWavelength: 620,  // Orange-red center
    color: { r: 255, g: 100, b: 50 },
    hex: '#ff6432'
  },
  green: {
    name: 'Green',
    minWavelength: 490,
    maxWavelength: 580,
    centerWavelength: 535,  // Pure green center
    color: { r: 50, g: 255, b: 100 },
    hex: '#32ff64'
  },
  cool: {
    name: 'Cool',
    minWavelength: 400,
    maxWavelength: 490,
    centerWavelength: 450,  // Blue-violet center
    color: { r: 100, g: 100, b: 255 },
    hex: '#6464ff'
  }
};

/**
 * Get spectrum samples for a specific color group
 */
export function getColorGroupSamples(group: ColorGroup, count: number): SpectralColor[] {
  const samples: SpectralColor[] = [];
  
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const wavelength = group.minWavelength + t * (group.maxWavelength - group.minWavelength);
    const { r, g, b } = wavelengthToRGB(wavelength);
    samples.push({
      wavelength,
      r, g, b,
      hex: rgbToHex(r, g, b),
      name: `${Math.round(wavelength)}nm`
    });
  }
  
  return samples;
}

/**
 * Determine which color group a wavelength belongs to
 */
export function getColorGroupForWavelength(wavelength: number): ColorGroup | null {
  for (const group of Object.values(COLOR_GROUPS)) {
    if (wavelength >= group.minWavelength && wavelength <= group.maxWavelength) {
      return group;
    }
  }
  return null;
}

/**
 * Additive color mixing - combine RGB values (light mixing)
 * Returns the mixed color when multiple beams overlap
 */
export function mixColors(colors: { r: number; g: number; b: number }[]): { r: number; g: number; b: number } {
  if (colors.length === 0) return { r: 0, g: 0, b: 0 };
  
  let r = 0, g = 0, b = 0;
  for (const color of colors) {
    r += color.r;
    g += color.g;
    b += color.b;
  }
  
  // Clamp to 255 (additive mixing can exceed display range)
  return {
    r: Math.min(255, r),
    g: Math.min(255, g),
    b: Math.min(255, b)
  };
}

