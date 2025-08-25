import { CompositeLayer, LayerProps, UpdateParameters } from '@deck.gl/core';
import type { PickingInfo } from '@deck.gl/core';
import * as THREE from 'three';

// This interface definition is kept for data prop validation
interface ConcentrationPoint {
  position: [number, number, number];
  concentration: number;
}

const defaultProps = {
  id: 'smoke-volume',
  data: { type: 'array', value: [], compare: true },
  longitude: -122.1697,
  latitude: 37.4275,
  altitude: 0,
  volumeSize: 10000, // in meters
  voxelResolution: 64, // e.g., 64x64x64
  density: 1.0,
  opacity: 0.5,
  absorption: 0.1,
  scattering: 0.5,
};

export type SmokePlumeVolumeLayerProps = LayerProps & typeof defaultProps;

export default class SmokePlumeVolumeLayer extends CompositeLayer<SmokePlumeVolumeLayerProps> {
  static defaultProps = defaultProps;
  static layerName = 'SmokePlumeVolumeLayer';

  state!: {
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    volumeMesh: THREE.Mesh;
    volumeTexture: THREE.Data3DTexture;
    volumeMaterial: THREE.ShaderMaterial;
    startTime: number;
  };

  initializeState() {
    const { gl } = this.context;
    const { voxelResolution } = this.props;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 100000);
    const renderer = new THREE.WebGLRenderer({
      context: gl,
      alpha: true,
      premultipliedAlpha: false,
    });
    renderer.autoClear = false;

    // Check for WebGL 3D texture support
    const isWebGL2 = renderer.capabilities.isWebGL2;
    const has3DTextureSupport = isWebGL2 || renderer.extensions.get('OES_texture_3D');

    if (!has3DTextureSupport) {
      console.error('SmokePlumeVolumeLayer Error: WebGL 3D textures are not supported on this device. The smoke plume cannot be rendered.');
      return; // Abort initialization
    }

    console.log('SmokePlumeVolumeLayer: WebGL 3D texture support confirmed, initializing volume rendering...');

    const res = voxelResolution;
    const textureData = new Float32Array(res * res * res);
    const volumeTexture = new THREE.Data3DTexture(
      textureData,
      res,
      res,
      res
    );
    volumeTexture.format = THREE.RedFormat;
    volumeTexture.type = THREE.FloatType;
    volumeTexture.minFilter = THREE.LinearFilter;
    volumeTexture.magFilter = THREE.LinearFilter;
    volumeTexture.unpackAlignment = 1;
    volumeTexture.needsUpdate = true;

    const volumeMaterial = this.createVolumeMaterial(volumeTexture);
    const volumeGeometry = new THREE.BoxGeometry(1, 1, 1);
    const volumeMesh = new THREE.Mesh(volumeGeometry, volumeMaterial);

    scene.add(volumeMesh);

    this.setState({
      scene,
      camera,
      renderer,
      volumeMesh,
      volumeTexture,
      volumeMaterial,
      startTime: performance.now(),
    });

    // Update volume texture with initial data
    this.updateVolumeTexture();
    this.updateVolumeMeshScale();

    console.log('SmokePlumeVolumeLayer: Initialization completed successfully');
  }

  updateState({ props, oldProps, changeFlags }: UpdateParameters<this>) {
    if (changeFlags.propsChanged) {
      if (
        props.density !== oldProps.density ||
        props.opacity !== oldProps.opacity ||
        props.absorption !== oldProps.absorption ||
        props.scattering !== oldProps.scattering
      ) {
        this.updateMaterialUniforms();
      }
      if (props.data !== oldProps.data || props.volumeSize !== oldProps.volumeSize || props.voxelResolution !== oldProps.voxelResolution) {
        this.updateVolumeTexture();
        this.updateVolumeMeshScale();
      }
    }
  }

  finalizeState() {
    const { renderer, scene, volumeTexture, volumeMaterial, volumeMesh } = this.state;
    renderer?.dispose();
    volumeTexture?.dispose();
    volumeMaterial?.dispose();
    volumeMesh?.geometry.dispose();
    if (scene) {
      scene.traverse(obj => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry?.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach(m => m.dispose());
          } else if(obj.material) {
            obj.material.dispose();
          }
        }
      });
    }
  }
  
  updateMaterialUniforms() {
    const { volumeMaterial } = this.state;
    const { density, opacity, absorption, scattering } = this.props;
    volumeMaterial.uniforms.u_density.value = density;
    volumeMaterial.uniforms.u_opacity.value = opacity;
    volumeMaterial.uniforms.u_absorption.value = absorption;
    volumeMaterial.uniforms.u_scattering.value = scattering;
  }

  updateVolumeMeshScale() {
    const { volumeMesh } = this.state;
    const { volumeSize } = this.props;
    volumeMesh.scale.set(volumeSize, volumeSize, volumeSize * 0.5); // Adjust Z-scale for plume shape
  }

  updateVolumeTexture() {
    const { data, longitude, latitude, volumeSize, voxelResolution } = this.props;
    const { volumeTexture } = this.state;
    const textureData = volumeTexture.image.data;
    textureData.fill(0);

    const dataArray = data as unknown as ConcentrationPoint[];

    console.log('SmokePlumeVolumeLayer: Updating volume texture with', dataArray?.length || 0, 'data points');

    if (dataArray && dataArray.length > 0) {
      for (const point of dataArray) {
        const [lon, lat, alt] = point.position;
        const normalizedConc = Math.min(point.concentration / 150.0, 1.0); // Normalize concentration

        // Convert geo-coordinates to voxel coordinates
        const x = Math.floor(
          ((lon - longitude) / (volumeSize / 111320)) * voxelResolution + voxelResolution / 2
        );
        const y = Math.floor(
          ((lat - latitude) / (volumeSize / 111320)) * voxelResolution + voxelResolution / 2
        );
        const z = Math.floor((alt / (volumeSize * 0.5)) * voxelResolution);

        if (x >= 0 && x < voxelResolution && y >= 0 && y < voxelResolution && z >= 0 && z < voxelResolution) {
          const radius = 5; // Influence radius in voxels
          for (let i = -radius; i <= radius; i++) {
            for (let j = -radius; j <= radius; j++) {
              for (let k = -radius; k <= radius; k++) {
                const vx = x + i;
                const vy = y + j;
                const vz = z + k;

                if (
                  vx >= 0 && vx < voxelResolution &&
                  vy >= 0 && vy < voxelResolution &&
                  vz >= 0 && vz < voxelResolution
                ) {
                  const dist = Math.sqrt(i * i + j * j + k * k);
                  if (dist <= radius) {
                    const falloff = Math.exp(-(dist * dist) / (2 * (radius / 2) * (radius / 2)));
                    const index = vz * voxelResolution * voxelResolution + vy * voxelResolution + vx;
                    textureData[index] = Math.min(textureData[index] + normalizedConc * falloff, 1.0);
                  }
                }
              }
            }
          }
        }
      }
    }
    volumeTexture.needsUpdate = true;
  }

  draw(_params: any) {
    const { viewport } = this.context;
    const { renderer, scene, camera, volumeMaterial, volumeMesh, startTime } = this.state;
    
    if (!renderer || !scene || !camera || !volumeMaterial || !volumeMesh) {
      console.warn('SmokePlumeVolumeLayer: Missing required objects for rendering');
      return;
    }
    
    // Position volume at the specified coordinates
    const { longitude, latitude, altitude } = this.props;
    const worldPos = viewport.projectPosition([longitude, latitude, altitude || 0]);
    volumeMesh.position.set(worldPos[0], worldPos[1], worldPos[2]);
    this.updateVolumeMeshScale();

    // Update camera
    camera.projectionMatrix.fromArray(viewport.projectionMatrix);
    const viewMatrix = new THREE.Matrix4().fromArray(viewport.viewMatrix);
    camera.matrixWorld.copy(viewMatrix.clone().invert());
    camera.matrixWorldInverse.copy(viewMatrix);
    camera.matrixAutoUpdate = false;
    
    // Update shader uniforms
    volumeMaterial.uniforms.u_time.value = (performance.now() - startTime) / 1000;
    volumeMaterial.uniforms.u_cameraPos.value.setFromMatrixPosition(camera.matrixWorld);
    
    // Render
    renderer.resetState();
    renderer.render(scene, camera);
    renderer.resetState();
  }

  createVolumeMaterial(volumeTexture: THREE.Data3DTexture) {
    const material = new THREE.ShaderMaterial({
      uniforms: {
        u_volumeTexture: { value: volumeTexture },
        u_time: { value: 0 },
        u_cameraPos: { value: new THREE.Vector3() },
        u_density: { value: this.props.density },
        u_opacity: { value: this.props.opacity },
        u_absorption: { value: this.props.absorption },
        u_scattering: { value: this.props.scattering }
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler3D u_volumeTexture;
        uniform float u_time;
        uniform vec3 u_cameraPos;
        uniform float u_density;
        uniform float u_opacity;
        uniform float u_absorption;
        uniform float u_scattering;
        varying vec3 vWorldPosition;

        float fbm(vec3 p) {
          float value = 0.0;
          float amplitude = 0.5;
          for (int i = 0; i < 5; i++) {
            value += amplitude * (sin(p.x * 1.0 + u_time) + cos(p.y * 1.0 + u_time) + sin(p.z * 1.0 + u_time));
            amplitude *= 0.5;
            p *= 2.0;
          }
          return value;
        }

        void main() {
          vec3 rayDir = normalize(vWorldPosition - u_cameraPos);
          vec3 rayPos = vec3(0.5, 0.5, 0.5); // Start at center
          float stepSize = 0.01;
          float densityAccum = 0.0;
          vec4 color = vec4(0.0);
          for (int i = 0; i < 100; i++) {
            vec3 samplePos = rayPos + rayDir * float(i) * stepSize;
            if (any(lessThan(samplePos, vec3(0.0))) || any(greaterThan(samplePos, vec3(1.0)))) continue;
            float rawDensity = texture(u_volumeTexture, samplePos).r;
            float turbulence = fbm(samplePos * 5.0 + u_time * 0.2);
            float density = rawDensity * u_density * (1.0 + turbulence * 0.3);
            densityAccum += density * stepSize;
            float absorption = exp(-density * u_absorption * stepSize);
            color.rgb += vec3(0.8, 0.8, 0.8) * density * u_scattering * stepSize * absorption;
            color.a += density * u_opacity * stepSize;
            if (color.a >= 1.0) break;
          }
          gl_FragColor = color;
        }
      `,
      side: THREE.BackSide,
      blending: THREE.NormalBlending,
      transparent: true,
      depthWrite: false
    });

    // Add error listener for shader compilation
    material.onBeforeCompile = (_shader) => {
      console.log('SmokePlumeVolumeLayer: Compiling volumetric shaders...');
    };

    console.log('SmokePlumeVolumeLayer: Volume material created successfully');
    return material;
  }

  getPickingInfo({ info }: { info: PickingInfo }) {
    return info;
  }

  renderLayers() {
    // This layer manages its own rendering via the draw() method
    return [];
  }
} 