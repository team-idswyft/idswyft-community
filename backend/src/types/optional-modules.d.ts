/**
 * Ambient module declarations for optional ML dependencies.
 *
 * These packages have been moved to the Engine Worker container.
 * They are available in local dev (npm run dev) but NOT in production
 * Docker builds. The ambient declarations let tsc compile without
 * requiring the packages to be installed.
 *
 * All dynamic imports of these modules are wrapped in try/catch
 * so they fail gracefully at runtime when not installed.
 */

declare module 'ppu-paddle-ocr' {
  export class PaddleOcrService {
    constructor(opts?: any);
    initialize(): Promise<void>;
    recognize(buffer: Buffer, opts?: any): Promise<any>;
    destroy(): Promise<void>;
  }
  export interface PaddleOcrResult {
    data: any[];
    [key: string]: any;
  }
  export interface RecognitionResult {
    text: string;
    confidence: number;
    [key: string]: any;
  }
}

declare module 'tesseract.js' {
  const Tesseract: {
    createWorker(lang?: string, oem?: number, opts?: any): Promise<any>;
    PSM: Record<string, any>;
    [key: string]: any;
  };
  export default Tesseract;
}

declare module 'jimp' {
  const Jimp: {
    read(input: string | Buffer): Promise<any>;
    intToRGBA(color: number): { r: number; g: number; b: number; a: number };
    [key: string]: any;
  };
  export default Jimp;
}

declare module '@zxing/library' {
  export class BrowserMultiFormatReader {
    constructor();
    [key: string]: any;
  }
  export class BinaryBitmap {
    constructor(source: any);
    [key: string]: any;
  }
  export class HybridBinarizer {
    constructor(source: any);
    [key: string]: any;
  }
  export class RGBLuminanceSource {
    constructor(data: Uint8ClampedArray, width: number, height: number);
    [key: string]: any;
  }
  export const BarcodeFormat: Record<string, any>;
  export const DecodeHintType: Record<string, any>;
  export const NotFoundException: any;
  export const ChecksumException: any;
  export const FormatException: any;
  export class MultiFormatReader {
    constructor();
    decode(bitmap: any, hints?: any): any;
    [key: string]: any;
  }
  export const ResultMetadataType: Record<string, any>;
  export const PDF417Reader: any;
  export function createCanvas(w: number, h: number): any;
}

declare module 'canvas' {
  export function createCanvas(width: number, height: number): any;
  export function loadImage(src: string | Buffer): Promise<any>;
  export class Canvas {}
  export class Image {}
  export class ImageData {}
}

declare module '@vladmandic/face-api/dist/face-api.node-wasm.js' {
  const faceapi: {
    nets: Record<string, any>;
    env: { monkeyPatch: (opts: any) => void };
    tf: any;
    detectSingleFace(input: any, opts?: any): any;
    SsdMobilenetv1Options: new (opts?: any) => any;
    [key: string]: any;
  };
  export default faceapi;
}

declare module '@tensorflow/tfjs-backend-wasm' {
  export function setWasmPaths(path: string): void;
  export const version_wasm: string;
}

declare module 'onnxruntime-node' {
  export class InferenceSession {
    static create(path: string, opts?: any): Promise<InferenceSession>;
    run(feeds: Record<string, any>): Promise<Record<string, any>>;
    [key: string]: any;
  }
  export class Tensor {
    constructor(type: string, data: any, dims: number[]);
    [key: string]: any;
  }
}
