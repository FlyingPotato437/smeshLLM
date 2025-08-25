import { CompositeLayer, LayerProps } from '@deck.gl/core';
import { ScatterplotLayer } from '@deck.gl/layers';

interface ConcentrationPoint {
  position: [number, number, number];
  concentration: number;
  uncertainty?: number;
  timestamp?: Date;
  source?: string;
  velocity?: [number, number, number];
  temperature?: number;
}

const defaultProps = {
  id: 'volumetric-smoke',
  data: { type: 'array', value: [], compare: true },
  particleCount: 100,
  turbulenceStrength: 0.3,
  windDirection: 180,
  windSpeed: 5.0,
  opacity: 0.8,
  smokeColor: [180, 160, 140] as [number, number, number],
};

export type VolumetricSmokeLayerProps = LayerProps & typeof defaultProps;

export default class VolumetricSmokeLayer extends CompositeLayer<VolumetricSmokeLayerProps> {
  static defaultProps = defaultProps;
  static layerName = 'VolumetricSmokeLayer';

  renderLayers() {
    const { data, opacity, smokeColor, turbulenceStrength, windDirection, windSpeed } = this.props;
    const concentrationData = Array.isArray(data) ? data as ConcentrationPoint[] : [];
    
    if (!concentrationData || concentrationData.length === 0) {
      return [];
    }

    const layers: any[] = [];
    const time = performance.now() * 0.001;

    // Generate enhanced particle data with multiple particles per concentration point
    const enhancedParticles = this.generateEnhancedParticles(concentrationData, time);

    // Layer 1: Main smoke particles (dense, primary smoke)
    layers.push(new ScatterplotLayer({
      id: `${this.props.id}-main-particles`,
      data: enhancedParticles.main,
      pickable: true,
      opacity: opacity * 0.9,
      stroked: false,
      filled: true,
      radiusScale: 1,
      radiusMinPixels: 80,
      radiusMaxPixels: 400,
      getPosition: (d: any) => d.position,
      getRadius: (d: any) => Math.max(120, d.concentration * 8 + Math.sin(d.turbulence) * 20),
      getFillColor: (d: any) => [
        Math.min(255, smokeColor[0] + d.colorVariation * 30),
        Math.min(255, smokeColor[1] + d.colorVariation * 25),
        Math.min(255, smokeColor[2] + d.colorVariation * 20),
        Math.floor(Math.min(255, 100 + d.concentration * 1.2))
      ],
      updateTriggers: {
        getRadius: [time, turbulenceStrength],
        getFillColor: [smokeColor, time],
        getPosition: [windDirection, windSpeed, time]
      }
    }));

    // Layer 2: Halo effect (larger, more transparent particles)
    layers.push(new ScatterplotLayer({
      id: `${this.props.id}-smoke-halo`,
      data: enhancedParticles.halo,
      pickable: false,
      opacity: opacity * 0.6,
      stroked: false,
      filled: true,
      radiusScale: 1,
      radiusMinPixels: 150,
      radiusMaxPixels: 600,
      getPosition: (d: any) => d.position,
      getRadius: (d: any) => Math.max(200, d.concentration * 12 + Math.cos(d.turbulence) * 30),
      getFillColor: (d: any) => [
        Math.max(80, smokeColor[0] - 20),
        Math.max(80, smokeColor[1] - 15),
        Math.max(80, smokeColor[2] - 10),
        Math.floor(Math.min(180, 60 + d.concentration * 0.8))
      ],
      updateTriggers: {
        getRadius: [time, turbulenceStrength],
        getFillColor: [smokeColor, time],
        getPosition: [windDirection, windSpeed, time]
      }
    }));

    // Layer 3: Turbulence particles (scattered, chaotic movement)
    layers.push(new ScatterplotLayer({
      id: `${this.props.id}-turbulence`,
      data: enhancedParticles.turbulence,
      pickable: false,
      opacity: opacity * 0.4,
      stroked: false,
      filled: true,
      radiusScale: 1,
      radiusMinPixels: 40,
      radiusMaxPixels: 200,
      getPosition: (d: any) => d.position,
      getRadius: (d: any) => Math.max(60, d.concentration * 4 + d.turbulence * 15),
      getFillColor: (d: any) => [
        Math.min(255, smokeColor[0] + d.brownVariation * 40),
        Math.min(255, smokeColor[1] + d.brownVariation * 30),
        Math.min(255, smokeColor[2] + d.brownVariation * 15),
        Math.floor(Math.min(150, 40 + d.concentration * 0.6))
      ],
      updateTriggers: {
        getRadius: [time, turbulenceStrength],
        getFillColor: [smokeColor, time],
        getPosition: [windDirection, windSpeed, time]
      }
    }));

    // Layer 4: Fine particles (small, dense detail)
    layers.push(new ScatterplotLayer({
      id: `${this.props.id}-fine-particles`,
      data: enhancedParticles.fine,
      pickable: false,
      opacity: opacity * 0.7,
      stroked: false,
      filled: true,
      radiusScale: 1,
      radiusMinPixels: 20,
      radiusMaxPixels: 100,
      getPosition: (d: any) => d.position,
      getRadius: (d: any) => Math.max(30, d.concentration * 2 + d.turbulence * 8),
      getFillColor: (d: any) => [
        Math.min(255, smokeColor[0] + 40),
        Math.min(255, smokeColor[1] + 35),
        Math.min(255, smokeColor[2] + 30),
        Math.floor(Math.min(200, 80 + d.concentration * 1.5))
      ],
      updateTriggers: {
        getRadius: [time, turbulenceStrength],
        getFillColor: [smokeColor, time],
        getPosition: [windDirection, windSpeed, time]
      }
    }));

    return layers;
  }

  generateEnhancedParticles(concentrationData: ConcentrationPoint[], time: number) {
    const { turbulenceStrength, windDirection, windSpeed } = this.props;
    const windRadians = (windDirection * Math.PI) / 180;
    const windVectorX = Math.cos(windRadians) * windSpeed * 0.0001;
    const windVectorY = Math.sin(windRadians) * windSpeed * 0.0001;

    const main: any[] = [];
    const halo: any[] = [];
    const turbulence: any[] = [];
    const fine: any[] = [];

    concentrationData.forEach((point, index) => {
      const [baseLon, baseLat, baseAlt] = point.position;
      const baseConcentration = point.concentration;

      // Generate multiple particles per concentration point for volumetric effect
      const particleCount = Math.max(3, Math.floor(baseConcentration / 20));

      for (let i = 0; i < particleCount; i++) {
        const particleId = index * 100 + i;
        const randomSeed = particleId + time * 0.5;
        
        // Deterministic but animated randomness
        const turbulenceX = Math.sin(randomSeed * 1.1) * turbulenceStrength * 0.002;
        const turbulenceY = Math.cos(randomSeed * 1.3) * turbulenceStrength * 0.002;
        const turbulenceZ = Math.sin(randomSeed * 0.9) * turbulenceStrength * 200;

        // Wind-affected position
        const windAffectedLon = baseLon + windVectorX * (time % 100) + turbulenceX;
        const windAffectedLat = baseLat + windVectorY * (time % 100) + turbulenceY;
        const windAffectedAlt = baseAlt + turbulenceZ + Math.sin(time + particleId) * 50;

        const particleConcentration = baseConcentration * (0.7 + Math.random() * 0.6);
        const colorVariation = Math.sin(randomSeed * 2.1);
        const brownVariation = Math.cos(randomSeed * 1.7);
        const turbulenceValue = Math.sin(randomSeed + time * 2);

        const particle = {
          position: [windAffectedLon, windAffectedLat, Math.max(0, windAffectedAlt)],
          concentration: particleConcentration,
          colorVariation,
          brownVariation,
          turbulence: turbulenceValue,
          id: particleId
        };

        // Distribute particles across layers based on characteristics
        if (i === 0) {
          main.push(particle); // Primary particle
        }
        
        if (i <= 1 && particleConcentration > 30) {
          halo.push({
            ...particle,
            position: [
              windAffectedLon + turbulenceX * 2,
              windAffectedLat + turbulenceY * 2,
              Math.max(0, windAffectedAlt + 100)
            ],
            concentration: particleConcentration * 0.8
          });
        }

        if (i <= 2) {
          turbulence.push({
            ...particle,
            position: [
              windAffectedLon + (Math.random() - 0.5) * 0.01,
              windAffectedLat + (Math.random() - 0.5) * 0.01,
              Math.max(0, windAffectedAlt + Math.random() * 300)
            ],
            concentration: particleConcentration * 0.6
          });
        }

        fine.push({
          ...particle,
          position: [
            windAffectedLon + (Math.random() - 0.5) * 0.005,
            windAffectedLat + (Math.random() - 0.5) * 0.005,
            Math.max(0, windAffectedAlt + Math.random() * 150)
          ],
          concentration: particleConcentration * 0.9
        });
      }
    });

    return { main, halo, turbulence, fine };
  }

  getPickingInfo({ info }: any) {
    if (info.object) {
      return {
        ...info,
        object: {
          concentration: info.object.concentration,
          position: info.object.position,
          layer: info.layer.id.split('-').pop() // main-particles, halo, etc.
        }
      };
    }
    return info;
  }
}