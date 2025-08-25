import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// EPA AQI Color Coding for Air Quality Visualization
export interface AQILevel {
  level: string;
  range: [number, number];
  color: [number, number, number, number]; // RGBA
  description: string;
  healthMessage: string;
}

export const EPA_AQI_LEVELS: AQILevel[] = [
  {
    level: "Good",
    range: [0, 12],
    color: [0, 228, 0, 180], // Green
    description: "Air quality is satisfactory",
    healthMessage: "Air quality is considered satisfactory, and air pollution poses little or no risk."
  },
  {
    level: "Moderate", 
    range: [12.1, 35.4],
    color: [255, 255, 0, 180], // Yellow
    description: "Air quality is acceptable",
    healthMessage: "Air quality is acceptable for most people. However, sensitive groups may experience minor symptoms."
  },
  {
    level: "Unhealthy for Sensitive Groups",
    range: [35.5, 55.4], 
    color: [255, 126, 0, 180], // Orange
    description: "Members of sensitive groups may experience health effects",
    healthMessage: "Members of sensitive groups may experience health effects. The general public is not likely to be affected."
  },
  {
    level: "Unhealthy",
    range: [55.5, 150.4],
    color: [255, 0, 0, 180], // Red
    description: "Everyone may begin to experience health effects",
    healthMessage: "Everyone may begin to experience health effects; members of sensitive groups may experience more serious health effects."
  },
  {
    level: "Very Unhealthy", 
    range: [150.5, 250.4],
    color: [143, 63, 151, 180], // Purple
    description: "Health warnings of emergency conditions",
    healthMessage: "Health warnings of emergency conditions. The entire population is more likely to be affected."
  },
  {
    level: "Hazardous",
    range: [250.5, 500],
    color: [126, 0, 35, 180], // Maroon
    description: "Health alert: everyone may experience serious health effects",
    healthMessage: "Health alert: everyone may experience more serious health effects."
  }
];

export function getAQILevel(pm25: number): AQILevel {
  for (const level of EPA_AQI_LEVELS) {
    if (pm25 >= level.range[0] && pm25 <= level.range[1]) {
      return level;
    }
  }
  // Return hazardous for extreme values
  return EPA_AQI_LEVELS[EPA_AQI_LEVELS.length - 1];
}

export function getAQIColor(pm25: number): [number, number, number, number] {
  return getAQILevel(pm25).color;
}

export function getAQIDescription(pm25: number): string {
  return getAQILevel(pm25).description;
}

// Enhanced color mapping with smooth transitions
export function getSmoothAQIColor(pm25: number): [number, number, number, number] {
  // Handle edge cases
  if (pm25 <= 0) return EPA_AQI_LEVELS[0].color;
  if (pm25 >= 500) return EPA_AQI_LEVELS[EPA_AQI_LEVELS.length - 1].color;
  
  // Find the appropriate range and interpolate
  for (let i = 0; i < EPA_AQI_LEVELS.length - 1; i++) {
    const current = EPA_AQI_LEVELS[i];
    const next = EPA_AQI_LEVELS[i + 1];
    
    if (pm25 >= current.range[0] && pm25 <= current.range[1]) {
      // Within current range - interpolate within range
      const t = (pm25 - current.range[0]) / (current.range[1] - current.range[0]);
      return interpolateColor(current.color, next.color, t * 0.3); // Gentle transition
    }
  }
  
  return EPA_AQI_LEVELS[EPA_AQI_LEVELS.length - 1].color;
}

function interpolateColor(
  color1: [number, number, number, number], 
  color2: [number, number, number, number], 
  t: number
): [number, number, number, number] {
  return [
    Math.round(color1[0] + (color2[0] - color1[0]) * t),
    Math.round(color1[1] + (color2[1] - color1[1]) * t),
    Math.round(color1[2] + (color2[2] - color1[2]) * t),
    Math.round(color1[3] + (color2[3] - color1[3]) * t)
  ];
}
