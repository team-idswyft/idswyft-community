/**
 * Ambient module declarations for optional peer dependencies.
 *
 * These packages are optional -- consumers install them as needed.
 * The backend Docker build does NOT include onnxruntime-node (only
 * the engine does). This declaration lets tsc compile shared/ without
 * requiring the package to be installed.
 *
 * The actual import in OnnxDeepfakeDetector.ts is dynamic (await import)
 * and wrapped in try/catch for graceful runtime fallback.
 */

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
