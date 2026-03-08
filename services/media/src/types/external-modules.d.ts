declare module 'exif-parser' {
  export function create(buffer: Buffer): {
    parse(): {
      tags?: {
        Make?: string;
        Model?: string;
        Software?: string;
        DateTime?: number;
        GPSLatitude?: number;
        GPSLongitude?: number;
      };
    };
  };
}

declare module 'image-hash' {
  export function imageHash(
    src: string | Buffer,
    bits: number,
    precise: boolean,
    callback: (error: Error | null, hash: string) => void
  ): void;
}

declare module 'clamav.js' {
  export function createScanner(port: number, host: string): {
    scan(buffer: Buffer, callback: (error: Error | null, object: any, malicious: string | null) => void): void;
  };
}

declare module 'obj-file-parser' {
  interface Vertex {
    x: number;
    y: number;
    z: number;
  }

  interface Face {
    vertices: Array<{ vertexIndex: number; textureCoordsIndex?: number; vertexNormalIndex?: number }>;
  }

  interface Model {
    name: string;
    vertices: Vertex[];
    faces: Face[];
  }

  interface ParseResult {
    models: Model[];
  }

  export default class OBJParser {
    constructor(content: string);
    parse(): ParseResult;
  }
}

declare module 'three/examples/jsm/loaders/GLTFLoader' {
  import { Loader, LoadingManager, Scene } from 'three';

  export interface GLTF {
    scene: Scene;
    scenes: Scene[];
    cameras: any[];
    asset: any;
    parser: any;
    userData: any;
  }

  export class GLTFLoader extends Loader {
    constructor(manager?: LoadingManager);
    load(
      url: string,
      onLoad: (gltf: GLTF) => void,
      onProgress?: (event: ProgressEvent) => void,
      onError?: (event: ErrorEvent) => void,
    ): void;
    loadAsync(url: string, onProgress?: (event: ProgressEvent) => void): Promise<GLTF>;
    parse(
      data: ArrayBuffer | string,
      path: string,
      onLoad: (gltf: GLTF) => void,
      onError?: (event: ErrorEvent) => void,
    ): void;
  }
}
