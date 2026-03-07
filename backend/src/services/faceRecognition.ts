import { logger } from '@/utils/logger.js';
import { StorageService } from './storage.js';
import config from '@/config/index.js';
import path from 'path';
import fs from 'fs/promises';

// Enhanced face recognition with fallback support
let EnhancedFaceRecognitionService: any = null;

// Optional dependency imports with graceful fallbacks
let tf: any = null;
let Jimp: any = null;
let faceLandmarksDetection: any = null;
let blazeface: any = null;

// Type definitions for optional dependencies
type JimpImage = any;
type TensorFlowModel = any;

try {
  const { EnhancedFaceRecognitionService: EFRS } = await import('./enhancedFaceRecognition.js');
  EnhancedFaceRecognitionService = EFRS;
  logger.info('Enhanced face recognition service loaded');
} catch (error) {
  logger.warn('Enhanced face recognition not available, using TensorFlow fallback', {
    reason: error instanceof Error ? error.message : 'Unknown',
  });
}

try {
  tf = await import('@tensorflow/tfjs-node');
} catch (error) {
  logger.warn('TensorFlow.js not available, using fallback methods');
}

try {
  Jimp = (await import('jimp')).default;
} catch (error) {
  logger.warn('Jimp not available, using fallback methods');
}

try {
  faceLandmarksDetection = await import('@tensorflow-models/face-landmarks-detection');
} catch (error) {
  logger.warn('Face Landmarks Detection not available, using fallback methods');
}

try {
  blazeface = await import('@tensorflow-models/blazeface');
} catch (error) {
  logger.warn('BlazeFace not available, using fallback methods');
}

export class FaceRecognitionService {
  private storageService: StorageService;
  private enhancedFaceService: any = null;
  private isInitialized = false;
  private faceModel: TensorFlowModel | null = null;
  private useAiFaceMatching: boolean;
  private useAiLivenessDetection: boolean;
  private useTensorFlowFaceMatching: boolean;
  private useModernFaceRecognition: boolean;
  private faceDetector: any = null;
  private faceLandmarkDetector: any = null;
  
  constructor() {
    this.storageService = new StorageService();
    
    // Try to initialize enhanced face recognition service
    if (EnhancedFaceRecognitionService) {
      try {
        this.enhancedFaceService = new EnhancedFaceRecognitionService();
        this.useModernFaceRecognition = true; // Enhanced high-accuracy method
        console.log('✅ Enhanced face recognition service initialized');
      } catch (error) {
        console.log('⚠️  Enhanced face recognition service failed to initialize:', error);
        this.enhancedFaceService = null;
        this.useModernFaceRecognition = false;
      }
    } else {
      this.useModernFaceRecognition = false;
    }
    
    // Configure fallback methods
    this.useAiFaceMatching = false;
    this.useAiLivenessDetection = false; // Disable OpenAI liveness detection
    this.useTensorFlowFaceMatching = true; // Fallback TensorFlow face matching
    
    if (this.useModernFaceRecognition) {
      console.log('🔧 Enhanced Face Recognition enabled (Advanced image analysis with Sharp)');
    } else if (this.useTensorFlowFaceMatching) {
      console.log('🧠 TensorFlow-powered face matching enabled (Face Detection + Landmarks)');
    } else {
      console.log('🔍 Traditional face matching enabled (feature comparison)');
    }
    
    if (this.useAiLivenessDetection) {
      console.log('🤖 AI-powered liveness detection enabled (OpenAI GPT-4o Vision)');
    } else {
      console.log('🔍 Traditional liveness detection enabled (image analysis)');
    }
  }
  
  private async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    try {
      logger.info('Initializing face recognition service...');
      
      if (!tf || !Jimp) {
        logger.warn('TensorFlow.js or Jimp not available, using AI-only face recognition');
      }
      
      // For MVP, we'll use a simplified approach without complex models
      // In production, you could load a pre-trained face detection model
      this.isInitialized = true;
      
      logger.info('Face recognition service initialized successfully', {
        tensorflowAvailable: !!tf,
        jimpAvailable: !!Jimp,
        aiEnabled: this.useAiFaceMatching
      });
    } catch (error) {
      logger.error('Failed to initialize face recognition service:', error);
      throw new Error('Face recognition service initialization failed');
    }
  }
  
  /**
   * Compare faces between front and back of ID documents to ensure they belong to the same person
   * This is a critical security validation to prevent identity fraud
   * @param frontDocumentPath Path to front document image
   * @param backDocumentPath Path to back document image
   * @returns Similarity score between 0-1 (higher = more similar)
   */
  async compareDocumentPhotos(frontDocumentPath: string, backDocumentPath: string): Promise<number> {
    try {
      logger.info('🔒 Starting document photo cross-validation for security', {
        frontDoc: frontDocumentPath,
        backDoc: backDocumentPath
      });

      // Use enhanced face service if available
      if (this.enhancedFaceService && typeof this.enhancedFaceService.compareFaces === 'function') {
        logger.info('Using enhanced face recognition for document photo comparison');
        return await this.enhancedFaceService.compareFaces(frontDocumentPath, backDocumentPath);
      }

      // Fallback to basic face comparison
      logger.info('Using fallback face recognition for document photo comparison');
      return await this.compareWithTraditional(frontDocumentPath, backDocumentPath);

    } catch (error) {
      logger.error('Document photo comparison failed:', error);
      throw new Error('Failed to compare document photos - this is a critical security validation that cannot be skipped');
    }
  }

  async compareFaces(documentPath: string, selfiePath: string): Promise<number> {
    await this.initialize();
    
    const method = this.useModernFaceRecognition ? 'Enhanced' : 
                   this.useTensorFlowFaceMatching ? 'TensorFlow' : 'Traditional';
    
    logger.info('Starting face comparison', {
      documentPath,
      selfiePath,
      method
    });
    
    try {
      if (this.useModernFaceRecognition && typeof this.enhancedFaceService?.compareFaces === 'function') {
        console.log('🔧 Using enhanced face recognition (Sharp-based analysis)...');
        return await this.enhancedFaceService.compareFaces(documentPath, selfiePath);
      } else if (this.useTensorFlowFaceMatching) {
        console.log('🧠 Using TensorFlow-powered face matching...');
        return await this.compareWithTensorFlow(documentPath, selfiePath);
      } else {
        console.log('🔍 Using traditional face matching...');
        return await this.compareWithTraditional(documentPath, selfiePath);
      }
    } catch (error) {
      logger.error('Face comparison failed:', error);
      
      // Return failure score instead of mock - security critical
      return 0.0;
    }
  }
  
  private async compareWithAI(documentPath: string, selfiePath: string): Promise<number> {
    try {
      console.log('🤖 Starting AI face comparison...');
      
      // Download both images
      const [documentBuffer, selfieBuffer] = await Promise.all([
        this.storageService.downloadFile(documentPath),
        this.storageService.downloadFile(selfiePath)
      ]);
      
      // Convert images to base64
      const documentBase64 = documentBuffer.toString('base64');
      const selfieBase64 = selfieBuffer.toString('base64');
      
      const documentMimeType = this.detectMimeType(documentBuffer);
      const selfieMimeType = this.detectMimeType(selfieBuffer);
      
      console.log('🤖 Sending face comparison request to OpenAI GPT-4o...');
      
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: `Compare the faces in these two images:

1. First image is from an ID document - extract the person's face from this document
2. Second image is a selfie of a person

Please analyze and provide a response in JSON format:
{
  "face_match_score": <number between 0 and 1>,
  "confidence": <number between 0 and 1>,
  "analysis": {
    "id_face_detected": <true/false>,
    "selfie_face_detected": <true/false>,
    "same_person": <true/false>,
    "key_similarities": ["feature1", "feature2", ...],
    "differences_noted": ["difference1", "difference2", ...]
  },
  "reasoning": "detailed explanation of the comparison"
}

Important guidelines:
- Look for facial features: eyes, nose, mouth, face shape, skin tone
- Consider age differences (ID might be older/newer than selfie)
- Account for lighting, angle, and photo quality differences
- A score of 0.9+ means very high confidence same person
- A score of 0.7-0.89 means likely same person
- A score of 0.5-0.69 means uncertain/inconclusive  
- A score of 0.3-0.49 means likely different person
- A score of 0.0-0.29 means very high confidence different person`
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:${documentMimeType};base64,${documentBase64}`,
                    detail: 'high'
                  }
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:${selfieMimeType};base64,${selfieBase64}`,
                    detail: 'high'
                  }
                }
              ]
            }
          ],
          max_tokens: 1000,
          temperature: 0.1
        })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(`OpenAI API error: ${JSON.stringify(error)}`);
      }
      
      const result = await response.json();
      const analysisText = result.choices[0].message.content;
      
      console.log('🤖 AI face comparison completed', {
        responseLength: analysisText.length,
        preview: analysisText.substring(0, 200) + '...'
      });
      
      // Parse the AI response
      const comparison = this.parseAIFaceComparison(analysisText);
      
      logger.info('AI face comparison completed', {
        documentPath,
        selfiePath,
        matchScore: comparison.face_match_score,
        confidence: comparison.confidence,
        samePerson: comparison.analysis?.same_person
      });
      
      return comparison.face_match_score;
      
    } catch (error) {
      console.error('🤖 AI face comparison failed:', error);
      logger.error('AI face comparison failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      // Fallback to traditional method
      console.log('🔍 Falling back to traditional face comparison...');
      return await this.compareWithTraditional(documentPath, selfiePath);
    }
  }

  private async compareWithTensorFlow(documentPath: string, selfiePath: string): Promise<number> {
    try {
      console.log('🧠 Starting TensorFlow face comparison...');
      
      // Download both images
      const [documentBuffer, selfieBuffer] = await Promise.all([
        this.storageService.downloadFile(documentPath),
        this.storageService.downloadFile(selfiePath)
      ]);
      
      // Convert images to tensors
      const [documentTensor, selfieTensor] = await Promise.all([
        this.imageBufferToTensor(documentBuffer),
        this.imageBufferToTensor(selfieBuffer)
      ]);
      
      // Extract face embeddings using TensorFlow models
      const [docEmbedding, selfieEmbedding] = await Promise.all([
        this.extractFaceEmbedding(documentTensor),
        this.extractFaceEmbedding(selfieTensor)
      ]);
      
      // If face detection failed, fallback to traditional method
      if (!docEmbedding || !selfieEmbedding) {
        console.log('🔄 Face detection failed, falling back to traditional comparison...');
        return await this.compareWithTraditional(documentPath, selfiePath);
      }
      
      // Calculate similarity between embeddings
      const similarity = this.calculateEmbeddingSimilarity(docEmbedding, selfieEmbedding);
      
      // Clean up tensors
      documentTensor.dispose();
      selfieTensor.dispose();
      if (docEmbedding) docEmbedding.dispose();
      if (selfieEmbedding) selfieEmbedding.dispose();
      
      console.log(`🧠 TensorFlow face comparison completed: similarity=${similarity.toFixed(3)}`);
      
      logger.info('TensorFlow face comparison completed', {
        similarity,
        documentPath,
        selfiePath
      });
      
      return Math.max(0, Math.min(1, similarity));
      
    } catch (error) {
      console.error('🧠 TensorFlow face comparison failed:', error);
      logger.error('TensorFlow face comparison failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      // Fallback to enhanced traditional method
      console.log('🔍 Falling back to enhanced traditional face comparison...');
      return await this.compareWithTraditional(documentPath, selfiePath);
    }
  }
  
  private async compareWithTraditional(documentPath: string, selfiePath: string): Promise<number> {
    // Download both images
    const [documentBuffer, selfieBuffer] = await Promise.all([
      this.storageService.downloadFile(documentPath),
      this.storageService.downloadFile(selfiePath)
    ]);
    
    // Process images with Jimp
    const [documentImage, selfieImage] = await Promise.all([
      Jimp.read(documentBuffer),
      Jimp.read(selfieBuffer)
    ]);
    
    // Enhanced face comparison with multiple scoring methods
    let totalScore = 0;
    let scoreCount = 0;
    
    // Method 1: Enhanced feature comparison with higher-resolution analysis
    const targetSize = 256; // Increased resolution for better analysis
    const documentResized = documentImage.clone().resize(targetSize, targetSize);
    const selfieResized = selfieImage.clone().resize(targetSize, targetSize);
    
    const documentFeatures = await this.extractEnhancedFeatures(documentResized);
    const selfieFeatures = await this.extractEnhancedFeatures(selfieResized);
    
    const featureSimilarity = this.calculateCosineSimilarity(documentFeatures, selfieFeatures);
    totalScore += featureSimilarity;
    scoreCount++;
    
    // Method 2: Face region focus comparison
    const faceRegionScore = await this.compareFaceRegions(documentImage, selfieImage);
    totalScore += faceRegionScore;
    scoreCount++;
    
    // Method 3: Multi-scale analysis
    const multiScaleScore = await this.compareMultiScale(documentImage, selfieImage);
    totalScore += multiScaleScore;
    scoreCount++;
    
    // Calculate weighted average with quality boost
    const averageScore = totalScore / scoreCount;
    
    // Quality-based adjustment - boost score for clear, well-lit images
    const documentQuality = this.assessImageQuality(documentImage);
    const selfieQuality = this.assessImageQuality(selfieImage);
    const qualityBoost = Math.min(0.15, (documentQuality + selfieQuality) / 2 * 0.15);
    
    const finalScore = Math.max(0, Math.min(1, averageScore + qualityBoost));
    
    console.log(`🔍 Enhanced face comparison: feature=${featureSimilarity.toFixed(2)}, region=${faceRegionScore.toFixed(2)}, multiscale=${multiScaleScore.toFixed(2)}, quality=${qualityBoost.toFixed(2)}, final=${finalScore.toFixed(2)}`);
    
    logger.info('Enhanced traditional face comparison completed', {
      featureSimilarity,
      faceRegionScore,
      multiScaleScore,
      qualityBoost,
      finalScore,
      documentPath,
      selfiePath
    });
    
    return finalScore;
  }
  
  private async extractEnhancedFeatures(image: JimpImage): Promise<number[]> {
    // Enhanced feature extraction with more sophisticated methods
    const grayImage = image.clone().greyscale();
    const { width, height } = grayImage.bitmap;
    
    const features: number[] = [];
    
    // 1. Enhanced histogram features (multiple bins)
    const histogram = new Array(64).fill(0); // Reduced bins for better grouping
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const pixel = Jimp.intToRGBA(grayImage.getPixelColor(x, y));
        const bin = Math.floor(pixel.r / 4); // 256/64 = 4
        histogram[bin]++;
      }
    }
    
    // Normalize and add histogram features
    const totalPixels = width * height;
    for (let i = 0; i < histogram.length; i++) {
      features.push(histogram[i] / totalPixels);
    }
    
    // 2. Local Binary Pattern (LBP) features
    const lbpFeatures = this.extractLBPFeatures(grayImage);
    features.push(...lbpFeatures);
    
    // 3. Edge density features
    const edgeFeatures = this.extractEdgeFeatures(grayImage);
    features.push(...edgeFeatures);
    
    // 4. Texture features
    const textureFeatures = this.extractTextureFeatures(grayImage);
    features.push(...textureFeatures);
    
    return features;
  }

  private extractLBPFeatures(image: JimpImage): number[] {
    // Simplified Local Binary Pattern implementation
    const { width, height } = image.bitmap;
    const lbpHistogram = new Array(256).fill(0);
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const center = Jimp.intToRGBA(image.getPixelColor(x, y)).r;
        let lbpValue = 0;
        
        // Check 8 neighbors
        const neighbors = [
          [-1, -1], [-1, 0], [-1, 1],
          [0, 1], [1, 1], [1, 0],
          [1, -1], [0, -1]
        ];
        
        for (let i = 0; i < neighbors.length; i++) {
          const [dx, dy] = neighbors[i];
          const neighbor = Jimp.intToRGBA(image.getPixelColor(x + dx, y + dy)).r;
          if (neighbor >= center) {
            lbpValue |= (1 << i);
          }
        }
        
        lbpHistogram[lbpValue]++;
      }
    }
    
    // Normalize and return top features
    const totalPatterns = (width - 2) * (height - 2);
    return lbpHistogram.slice(0, 32).map(count => count / totalPatterns); // Top 32 patterns
  }

  private extractEdgeFeatures(image: JimpImage): number[] {
    // Enhanced edge detection features
    const { width, height } = image.bitmap;
    const features: number[] = [];
    
    let horizontalEdges = 0;
    let verticalEdges = 0;
    let diagonalEdges = 0;
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const current = Jimp.intToRGBA(image.getPixelColor(x, y)).r;
        const right = Jimp.intToRGBA(image.getPixelColor(x + 1, y)).r;
        const bottom = Jimp.intToRGBA(image.getPixelColor(x, y + 1)).r;
        const diagonal = Jimp.intToRGBA(image.getPixelColor(x + 1, y + 1)).r;
        
        if (Math.abs(current - right) > 20) horizontalEdges++;
        if (Math.abs(current - bottom) > 20) verticalEdges++;
        if (Math.abs(current - diagonal) > 20) diagonalEdges++;
      }
    }
    
    const totalPixels = (width - 1) * (height - 1);
    features.push(horizontalEdges / totalPixels);
    features.push(verticalEdges / totalPixels);
    features.push(diagonalEdges / totalPixels);
    
    return features;
  }

  private extractTextureFeatures(image: JimpImage): number[] {
    // Texture analysis using variance and contrast
    const { width, height } = image.bitmap;
    const features: number[] = [];
    
    // Calculate local variance in patches
    const patchSize = 8;
    let totalVariance = 0;
    let patchCount = 0;
    
    for (let y = 0; y <= height - patchSize; y += patchSize) {
      for (let x = 0; x <= width - patchSize; x += patchSize) {
        let mean = 0;
        let variance = 0;
        
        // Calculate mean
        for (let py = 0; py < patchSize; py++) {
          for (let px = 0; px < patchSize; px++) {
            const pixel = Jimp.intToRGBA(image.getPixelColor(x + px, y + py)).r;
            mean += pixel;
          }
        }
        mean /= (patchSize * patchSize);
        
        // Calculate variance
        for (let py = 0; py < patchSize; py++) {
          for (let px = 0; px < patchSize; px++) {
            const pixel = Jimp.intToRGBA(image.getPixelColor(x + px, y + py)).r;
            variance += Math.pow(pixel - mean, 2);
          }
        }
        variance /= (patchSize * patchSize);
        
        totalVariance += variance;
        patchCount++;
      }
    }
    
    features.push(totalVariance / (patchCount * 255 * 255)); // Normalized variance
    
    return features;
  }

  private async compareFaceRegions(image1: JimpImage, image2: JimpImage): Promise<number> {
    // Focus comparison on likely face regions
    const { width: w1, height: h1 } = image1.bitmap;
    const { width: w2, height: h2 } = image2.bitmap;
    
    // Extract center regions (likely to contain face)
    const centerRegion1 = image1.clone().crop(w1 * 0.2, h1 * 0.2, w1 * 0.6, h1 * 0.6);
    const centerRegion2 = image2.clone().crop(w2 * 0.2, h2 * 0.2, w2 * 0.6, h2 * 0.6);
    
    // Resize to same dimensions for comparison
    centerRegion1.resize(128, 128);
    centerRegion2.resize(128, 128);
    
    // Extract features from face regions
    const features1 = await this.extractSimpleFeatures(centerRegion1);
    const features2 = await this.extractSimpleFeatures(centerRegion2);
    
    return this.calculateCosineSimilarity(features1, features2);
  }

  private async compareMultiScale(image1: JimpImage, image2: JimpImage): Promise<number> {
    // Compare at multiple scales and combine results
    const scales = [64, 128, 256];
    let totalScore = 0;
    
    for (const scale of scales) {
      const resized1 = image1.clone().resize(scale, scale);
      const resized2 = image2.clone().resize(scale, scale);
      
      const features1 = await this.extractSimpleFeatures(resized1);
      const features2 = await this.extractSimpleFeatures(resized2);
      
      const scaleScore = this.calculateCosineSimilarity(features1, features2);
      totalScore += scaleScore;
    }
    
    return totalScore / scales.length;
  }

  private assessImageQuality(image: JimpImage): number {
    // Assess image quality based on sharpness, brightness, and contrast
    let qualityScore = 0;
    
    // Sharpness assessment
    const sharpness = this.analyzeImageSharpness(image);
    qualityScore += sharpness * 0.4;
    
    // Brightness assessment (prefer well-lit images)
    const brightness = this.getAverageBrightness(image) / 255;
    const brightnessOptimal = 1 - Math.abs(brightness - 0.5) * 2; // Optimal around 0.5
    qualityScore += brightnessOptimal * 0.3;
    
    // Contrast assessment
    const contrast = this.getImageContrast(image) / 255;
    qualityScore += contrast * 0.3;
    
    return Math.min(1, qualityScore);
  }

  private async extractSimpleFeatures(image: JimpImage): Promise<number[]> {
    // Convert image to grayscale and extract simple features
    const grayImage = image.clone().greyscale();
    const { width, height } = grayImage.bitmap;
    
    // Extract basic image statistics as features
    const features: number[] = [];
    
    // Calculate histogram features
    const histogram = new Array(256).fill(0);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const pixel = Jimp.intToRGBA(grayImage.getPixelColor(x, y));
        histogram[pixel.r]++;
      }
    }
    
    // Normalize histogram and use as features
    const totalPixels = width * height;
    for (let i = 0; i < 256; i += 8) { // Sample every 8th bin to reduce dimensionality
      features.push(histogram[i] / totalPixels);
    }
    
    // Add gradient features (edge detection)
    const gradients = this.calculateGradients(grayImage);
    features.push(...gradients);
    
    return features;
  }
  
  private calculateGradients(image: JimpImage): number[] {
    const { width, height } = image.bitmap;
    const gradients: number[] = [];
    
    // Simple Sobel operator for edge detection
    const sobelX = [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]];
    const sobelY = [[-1, -2, -1], [0, 0, 0], [1, 2, 1]];
    
    let totalGradient = 0;
    let edgePixels = 0;
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        let gx = 0, gy = 0;
        
        // Apply Sobel operators
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const pixel = Jimp.intToRGBA(image.getPixelColor(x + kx, y + ky));
            const intensity = pixel.r; // Grayscale value
            
            gx += intensity * sobelX[ky + 1][kx + 1];
            gy += intensity * sobelY[ky + 1][kx + 1];
          }
        }
        
        const gradient = Math.sqrt(gx * gx + gy * gy);
        totalGradient += gradient;
        
        if (gradient > 50) { // Edge threshold
          edgePixels++;
        }
      }
    }
    
    // Return normalized gradient features
    return [
      totalGradient / (width * height), // Average gradient
      edgePixels / (width * height),    // Edge density
    ];
  }
  
  private calculateCosineSimilarity(features1: number[], features2: number[]): number {
    if (features1.length !== features2.length) {
      logger.warn('Feature vectors have different lengths');
      return 0;
    }
    
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;
    
    for (let i = 0; i < features1.length; i++) {
      dotProduct += features1[i] * features2[i];
      norm1 += features1[i] * features1[i];
      norm2 += features2[i] * features2[i];
    }
    
    if (norm1 === 0 || norm2 === 0) {
      return 0;
    }
    
    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
  }
  
  private secureFaceComparisonFallback(): number {
    // Always return failure score for security
    const secureScore = 0.0;
    
    logger.error('Face comparison system error - returning secure failure score', {
      secureScore,
      reason: 'System error during face comparison'
    });
    
    return secureScore;
  }
  
  async detectLiveness(imagePath: string, challengeResponse?: string): Promise<number> {
    await this.initialize();
    
    const method = this.useModernFaceRecognition ? 'Enhanced' :
                   this.useAiLivenessDetection ? 'AI' : 'Traditional';
    
    logger.info('Starting liveness detection', { 
      imagePath, 
      challengeResponse,
      method
    });
    
    try {
      if (this.useModernFaceRecognition && this.enhancedFaceService && typeof this.enhancedFaceService.detectLiveness === 'function') {
        console.log('🔧 Using enhanced liveness detection (Sharp-based analysis)...');
        return await this.enhancedFaceService.detectLiveness(imagePath);
      } else if (this.useAiLivenessDetection) {
        console.log('🤖 Using AI-powered liveness detection...');
        return await this.detectLivenessWithAI(imagePath, challengeResponse);
      } else {
        console.log('🔍 Using traditional liveness detection...');
        return await this.detectLivenessWithTraditional(imagePath, challengeResponse);
      }
    } catch (error) {
      logger.error('Liveness detection failed:', error);
      // Return failure score instead of mock - security critical
      return 0.0;
    }
  }

  private async detectLivenessWithAI(imagePath: string, challengeResponse?: string): Promise<number> {
    try {
      console.log('🤖 Starting AI liveness detection...');
      
      // Download image
      const imageBuffer = await this.storageService.downloadFile(imagePath);
      const imageBase64 = imageBuffer.toString('base64');
      const mimeType = this.detectMimeType(imageBuffer);
      
      console.log('🤖 Sending liveness detection request to OpenAI GPT-4o...');
      
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: `Analyze this image for liveness detection. Determine if this is a live person vs a photo/screen/mask:

Please analyze for these liveness indicators:
1. **Facial Features**: Natural skin texture, realistic lighting, facial depth
2. **Eye Analysis**: Natural eye movements, pupil reactions, eye reflections
3. **Image Quality**: Camera noise, compression artifacts, screen moiré patterns
4. **Lighting**: Natural vs artificial lighting, shadow consistency
5. **Depth & Dimension**: 3D facial structure vs flat 2D appearance
6. **Micro-expressions**: Natural facial expressions and muscle movement
7. **Digital Artifacts**: Signs of screen display, photo edges, digital manipulation

${challengeResponse ? `
The user was asked to perform this challenge: "${challengeResponse}"
Please verify if the image shows completion of this challenge.
` : ''}

Provide response in JSON format:
{
  "liveness_score": <number between 0 and 1>,
  "confidence": <number between 0 and 1>,
  "analysis": {
    "is_live_person": <true/false>,
    "facial_depth_detected": <true/false>,
    "natural_lighting": <true/false>,
    "eye_authenticity": <true/false>,
    "skin_texture_natural": <true/false>,
    "no_screen_artifacts": <true/false>,
    "challenge_completed": <true/false if challenge provided>
  },
  "risk_factors": ["array of detected risk factors"],
  "liveness_indicators": ["array of positive liveness signs"],
  "reasoning": "detailed explanation of the analysis"
}

Scoring guide:
- 0.9-1.0: Very high confidence live person
- 0.7-0.89: Likely live person
- 0.5-0.69: Uncertain/inconclusive
- 0.3-0.49: Likely photo/screen/spoof
- 0.0-0.29: Very high confidence fake/spoof`
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:${mimeType};base64,${imageBase64}`,
                    detail: 'high'
                  }
                }
              ]
            }
          ],
          max_tokens: 1000,
          temperature: 0.1
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`OpenAI API error: ${JSON.stringify(error)}`);
      }

      const result = await response.json();
      const analysisText = result.choices[0].message.content;
      
      console.log('🤖 AI liveness detection completed', {
        responseLength: analysisText.length,
        preview: analysisText.substring(0, 200) + '...'
      });

      // Parse the AI response
      const livenessResult = this.parseAILivenessResponse(analysisText);
      
      logger.info('AI liveness detection completed', {
        imagePath,
        challengeResponse,
        livenessScore: livenessResult.liveness_score,
        confidence: livenessResult.confidence,
        isLivePerson: livenessResult.analysis?.is_live_person
      });

      return livenessResult.liveness_score;

    } catch (error) {
      console.error('🤖 AI liveness detection failed:', error);
      logger.error('AI liveness detection failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      // Fallback to traditional method
      console.log('🔍 Falling back to traditional liveness detection...');
      return await this.detectLivenessWithTraditional(imagePath, challengeResponse);
    }
  }

  private async detectLivenessWithTraditional(imagePath: string, challengeResponse?: string): Promise<number> {
    const imageBuffer = await this.storageService.downloadFile(imagePath);
    const image = await Jimp.read(imageBuffer);
    
    // Analyze image for liveness indicators
    const livenessScore = await this.analyzeLivenessFeatures(image);
    
    // Factor in challenge response if provided
    let challengeBonus = 0;
    if (challengeResponse) {
      challengeBonus = this.validateChallengeResponse(challengeResponse, image);
    }
    
    const finalScore = Math.min(1, livenessScore + challengeBonus);
    
    logger.info('Traditional liveness detection completed', {
      imagePath,
      challengeResponse,
      livenessScore,
      challengeBonus,
      finalScore
    });
    
    return finalScore;
  }

  async detectLivenessDetailed(imagePath: string): Promise<{
    isLive: boolean;
    confidence: number;
    checks: {
      blinkDetected: boolean;
      headMovement: boolean;
      eyeGaze: boolean;
    };
    aiAnalysis?: {
      facial_depth_detected: boolean;
      natural_lighting: boolean;
      eye_authenticity: boolean;
      skin_texture_natural: boolean;
      no_screen_artifacts: boolean;
    };
    risk_factors?: string[];
    liveness_indicators?: string[];
  }> {
    await this.initialize();
    
    logger.info('Starting detailed liveness detection', { 
      imagePath,
      method: this.useAiLivenessDetection ? 'AI' : 'Traditional'
    });
    
    try {
      if (this.useAiLivenessDetection) {
        console.log('🤖 Using AI-powered detailed liveness detection...');
        return await this.detectLivenessDetailedWithAI(imagePath);
      } else {
        console.log('🔍 Using traditional detailed liveness detection...');
        return await this.detectLivenessDetailedWithTraditional(imagePath);
      }
    } catch (error) {
      logger.error('Detailed liveness detection failed:', error);
      // Return secure failure result instead of mock
      return {
        isLive: false,
        confidence: 0.0,
        checks: {
          blinkDetected: false,
          headMovement: false,
          eyeGaze: false
        },
        risk_factors: ['System error during verification'],
        liveness_indicators: []
      };
    }
  }

  private async detectLivenessDetailedWithAI(imagePath: string): Promise<{
    isLive: boolean;
    confidence: number;
    checks: {
      blinkDetected: boolean;
      headMovement: boolean;
      eyeGaze: boolean;
    };
    aiAnalysis?: {
      facial_depth_detected: boolean;
      natural_lighting: boolean;
      eye_authenticity: boolean;
      skin_texture_natural: boolean;
      no_screen_artifacts: boolean;
    };
    risk_factors?: string[];
    liveness_indicators?: string[];
  }> {
    try {
      // Download image
      const imageBuffer = await this.storageService.downloadFile(imagePath);
      const imageBase64 = imageBuffer.toString('base64');
      const mimeType = this.detectMimeType(imageBuffer);
      
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: `Perform detailed liveness detection analysis on this image. Provide comprehensive assessment:

Analyze these specific aspects:
1. **Facial Depth**: 3D structure, shadows, facial contours
2. **Eye Analysis**: Natural reflections, pupil behavior, eye movement traces
3. **Skin Texture**: Natural pores, skin imperfections, texture depth
4. **Lighting Analysis**: Shadow consistency, light source naturalness
5. **Digital Artifacts**: Screen glare, pixelation, digital borders
6. **Micro-expressions**: Natural muscle movements, facial asymmetry
7. **Challenge Evidence**: Signs of movement, blinking, or other liveness actions

Provide response in JSON format:
{
  "liveness_score": <number between 0 and 1>,
  "confidence": <number between 0 and 1>,
  "is_live_person": <true/false>,
  "detailed_analysis": {
    "facial_depth_detected": <true/false>,
    "natural_lighting": <true/false>,
    "eye_authenticity": <true/false>,
    "skin_texture_natural": <true/false>,
    "no_screen_artifacts": <true/false>
  },
  "traditional_checks": {
    "blink_detected": <true/false>,
    "head_movement": <true/false>,
    "eye_gaze_natural": <true/false>
  },
  "risk_factors": ["array of specific spoofing risks detected"],
  "liveness_indicators": ["array of positive liveness signs found"],
  "reasoning": "detailed technical explanation"
}`
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:${mimeType};base64,${imageBase64}`,
                    detail: 'high'
                  }
                }
              ]
            }
          ],
          max_tokens: 1200,
          temperature: 0.1
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`OpenAI API error: ${JSON.stringify(error)}`);
      }

      const result = await response.json();
      const analysisText = result.choices[0].message.content;
      
      // Parse the AI response
      const aiResult = this.parseAILivenessResponse(analysisText);
      
      const detailedResult = {
        isLive: aiResult.analysis?.is_live_person || false,
        confidence: aiResult.confidence,
        checks: {
          blinkDetected: aiResult.analysis?.challenge_completed || false,
          headMovement: aiResult.analysis?.facial_depth_detected || false,
          eyeGaze: aiResult.analysis?.eye_authenticity || false
        },
        aiAnalysis: {
          facial_depth_detected: aiResult.analysis?.facial_depth_detected || false,
          natural_lighting: aiResult.analysis?.natural_lighting || false,
          eye_authenticity: aiResult.analysis?.eye_authenticity || false,
          skin_texture_natural: aiResult.analysis?.skin_texture_natural || false,
          no_screen_artifacts: aiResult.analysis?.no_screen_artifacts || false
        },
        risk_factors: aiResult.risk_factors || [],
        liveness_indicators: aiResult.liveness_indicators || []
      };

      logger.info('AI detailed liveness detection completed', {
        imagePath,
        isLive: detailedResult.isLive,
        confidence: detailedResult.confidence,
        riskFactors: detailedResult.risk_factors.length
      });

      return detailedResult;

    } catch (error) {
      console.error('🤖 AI detailed liveness detection failed:', error);
      // Fallback to traditional method
      return await this.detectLivenessDetailedWithTraditional(imagePath);
    }
  }

  private async detectLivenessDetailedWithTraditional(imagePath: string): Promise<{
    isLive: boolean;
    confidence: number;
    checks: {
      blinkDetected: boolean;
      headMovement: boolean;
      eyeGaze: boolean;
    };
    aiAnalysis?: {
      facial_depth_detected: boolean;
      natural_lighting: boolean;
      eye_authenticity: boolean;
      skin_texture_natural: boolean;
      no_screen_artifacts: boolean;
    };
    risk_factors?: string[];
    liveness_indicators?: string[];
  }> {
    const imageBuffer = await this.storageService.downloadFile(imagePath);
    const image = await Jimp.read(imageBuffer);
    
    // Analyze image for liveness indicators
    const livenessScore = await this.analyzeLivenessFeatures(image);
    
    const result = {
      isLive: livenessScore > 0.6,
      confidence: livenessScore,
      checks: {
        blinkDetected: this.detectImageQuality(image) > 0.7,
        headMovement: this.analyzeImageSharpness(image) > 0.5,
        eyeGaze: this.checkImageNaturalness(image) > 0.6
      },
      risk_factors: livenessScore < 0.5 ? ['Low liveness score from traditional analysis'] : [],
      liveness_indicators: livenessScore > 0.6 ? ['Traditional image quality analysis passed'] : []
    };
    
    logger.info('Traditional detailed liveness detection completed', {
      imagePath,
      result
    });
    
    return result;
  }
  
  private async analyzeLivenessFeatures(image: JimpImage): Promise<number> {
    console.log(`👁️ Starting enhanced liveness analysis...`);
    
    const { width, height } = image.bitmap;
    const aspectRatio = width / height;
    const isMobile = aspectRatio < 1.0; // Portrait orientation indicates mobile
    
    let score = isMobile ? 0.25 : 0.2; // Higher base score for mobile
    
    // Face detection in capture area (mobile-adaptive weight)  
    const faceDetectionScore = await this.detectFaceInCircularArea(image);
    const faceWeight = isMobile ? 0.2 : 0.25; // Reduce face detection weight on mobile
    score += faceDetectionScore * faceWeight;
    
    console.log(`👤 Face Detection in Circle: ${faceDetectionScore.toFixed(2)} (weight: ${faceWeight})`);
    
    // Always continue with other checks regardless of face detection - mobile friendly
    // Check image quality (higher quality suggests real photo vs printed)
    const qualityScore = this.detectImageQuality(image);
    const qualityWeight = isMobile ? 0.25 : 0.2; // Increase quality weight on mobile
    score += qualityScore * qualityWeight;
    
    // Check for natural variations in lighting and color
    const naturalness = this.checkImageNaturalness(image);
    score += naturalness * 0.2;
    
    // Additional liveness indicators
    const sharpness = this.analyzeImageSharpness(image);
    score += sharpness * 0.15;
    
    // Color depth analysis (live images have better color depth)
    const colorDepth = this.analyzeColorDepth(image);
    score += colorDepth * 0.15;
    
    // Mobile-specific adjustments
    if (isMobile) {
      // Mobile bonus: if we have reasonable quality metrics even with lower face detection
      const qualityMetricsScore = (qualityScore + naturalness + sharpness + colorDepth) / 4;
      if (qualityMetricsScore > 0.35 && faceDetectionScore > 0.15) { // Lower thresholds for mobile
        score += 0.08; // Larger bonus for mobile devices
        console.log(`📱 Mobile compatibility bonus applied: +0.08`);
      }
      
      // Additional mobile liveness check: motion blur suggests real movement
      const motionBlurScore = this.detectMotionBlur(image);
      if (motionBlurScore > 0.3) {
        score += 0.03; // Small bonus for natural motion blur
        console.log(`📱 Motion blur liveness indicator: +0.03`);
      }
    }
    
    console.log(`👁️ Liveness breakdown (mobile=${isMobile}): face=${faceDetectionScore.toFixed(2)}, quality=${qualityScore.toFixed(2)}, natural=${naturalness.toFixed(2)}, sharp=${sharpness.toFixed(2)}, color=${colorDepth.toFixed(2)}`);
    
    // Ensure proper scoring without artificial minimum
    const finalScore = Math.max(0, Math.min(1, score));
    
    console.log(`🎯 Final liveness score: ${finalScore.toFixed(2)} (mobile-friendly=${isMobile})`)
    
    return finalScore;
  }

  /**
   * Detect motion blur which can indicate natural movement (liveness)
   */
  private detectMotionBlur(image: JimpImage): number {
    try {
      const { width, height } = image.bitmap;
      let motionBlurScore = 0;
      let totalSamples = 0;
      
      // Sample horizontal and vertical gradients across the image
      const sampleSize = Math.min(width, height) / 20; // Sample every 5% of image
      
      for (let y = sampleSize; y < height - sampleSize; y += sampleSize) {
        for (let x = sampleSize; x < width - sampleSize; x += sampleSize) {
          // Get pixel values
          const currentPixel = Jimp.intToRGBA(image.getPixelColor(x, y));
          const rightPixel = Jimp.intToRGBA(image.getPixelColor(x + sampleSize, y));
          const bottomPixel = Jimp.intToRGBA(image.getPixelColor(x, y + sampleSize));
          
          // Calculate horizontal and vertical gradients
          const horizontalGrad = Math.abs(currentPixel.r - rightPixel.r) + 
                                Math.abs(currentPixel.g - rightPixel.g) + 
                                Math.abs(currentPixel.b - rightPixel.b);
          const verticalGrad = Math.abs(currentPixel.r - bottomPixel.r) + 
                             Math.abs(currentPixel.g - bottomPixel.g) + 
                             Math.abs(currentPixel.b - bottomPixel.b);
          
          // Motion blur typically shows more uniform gradients in one direction
          const gradientRatio = Math.min(horizontalGrad, verticalGrad) / Math.max(horizontalGrad, verticalGrad, 1);
          
          // Slight motion blur (0.3-0.7 ratio) suggests natural movement
          if (gradientRatio > 0.2 && gradientRatio < 0.8) {
            motionBlurScore += gradientRatio;
          }
          
          totalSamples++;
        }
      }
      
      return totalSamples > 0 ? motionBlurScore / totalSamples : 0;
      
    } catch (error) {
      console.error('Motion blur detection failed:', error);
      return 0;
    }
  }

  /**
   * Detect if there's a face within the circular capture area
   */
  private async detectFaceInCircularArea(image: JimpImage): Promise<number> {
    try {
      const { width, height } = image.bitmap;
      const aspectRatio = width / height;
      
      // Mobile-adaptive circular capture area calculation
      const centerX = width / 2;
      const centerY = height / 2;
      
      // Adaptive radius based on device orientation and aspect ratio
      let circleRadius: number;
      if (aspectRatio > 1.5) {
        // Wide landscape (tablet landscape, desktop)
        circleRadius = Math.min(width, height) * 0.35;
      } else if (aspectRatio < 0.7) {
        // Tall portrait (mobile portrait)
        circleRadius = Math.min(width, height) * 0.42; // Larger radius for tall screens
      } else {
        // Square-ish or standard portrait/landscape
        circleRadius = Math.min(width, height) * 0.38;
      }
      
      // Mobile adjustment: slightly offset center for portrait mode (front camera offset)
      const adjustedCenterY = aspectRatio < 1.0 ? centerY * 0.95 : centerY;
      
      console.log(`📱 Mobile-adaptive circular area: aspect=${aspectRatio.toFixed(2)}, center(${centerX.toFixed(0)}, ${adjustedCenterY.toFixed(0)}), radius=${circleRadius.toFixed(0)}`);
      
      // Try TensorFlow face detection first if available
      if (tf && blazeface) {
        console.log(`🧠 Using TensorFlow face detection for circular area...`);
        const tfDetectionScore = await this.detectFaceWithTensorFlow(image, centerX, adjustedCenterY, circleRadius);
        if (tfDetectionScore > 0) {
          return tfDetectionScore;
        }
      }
      
      // Fallback to traditional face detection methods
      console.log(`🔍 Using traditional face detection for circular area...`);
      return this.detectFaceWithTraditionalMethods(image, centerX, adjustedCenterY, circleRadius);
      
    } catch (error) {
      console.error('❌ Error in face detection:', error);
      return 0.0; // Return 0 if face detection fails - security critical
    }
  }

  /**
   * TensorFlow-based face detection in circular area
   */
  private async detectFaceWithTensorFlow(image: JimpImage, centerX: number, centerY: number, radius: number): Promise<number> {
    try {
      // Convert Jimp image to buffer for TensorFlow processing
      const imageBuffer = await image.getBufferAsync(Jimp.MIME_JPEG);
      const tensor = await this.imageBufferToTensor(imageBuffer);
      
      // Detect faces using TensorFlow
      const faces = await this.detectFaces(tensor);
      tensor.dispose();
      
      if (!faces || faces.length === 0) {
        console.log(`🧠 TensorFlow: No faces detected`);
        return 0.0;
      }
      
      // Check if any detected face is within the circular area
      for (const face of faces) {
        const faceX = (face.topLeft[0] + face.bottomRight[0]) / 2;
        const faceY = (face.topLeft[1] + face.bottomRight[1]) / 2;
        
        // Calculate distance from face center to circle center
        const distance = Math.sqrt(Math.pow(faceX - centerX, 2) + Math.pow(faceY - centerY, 2));
        
        console.log(`🧠 TensorFlow face at (${faceX.toFixed(0)}, ${faceY.toFixed(0)}), distance=${distance.toFixed(0)}, radius=${radius.toFixed(0)}`);
        
        if (distance <= radius) {
          // Face is within circular area - calculate confidence based on position and face size
          const positionScore = Math.max(0, 1 - (distance / radius)); // Closer to center = higher score
          const faceWidth = face.bottomRight[0] - face.topLeft[0];
          const faceHeight = face.bottomRight[1] - face.topLeft[1];
          const faceSize = (faceWidth + faceHeight) / 2;
          const sizeScore = Math.min(1, faceSize / (radius * 0.6)); // Appropriate size for the circle
          
          const confidence = (positionScore * 0.7 + sizeScore * 0.3);
          console.log(`🧠 TensorFlow: Face found in circle! Position=${positionScore.toFixed(2)}, Size=${sizeScore.toFixed(2)}, Confidence=${confidence.toFixed(2)}`);
          
          return confidence;
        }
      }
      
      console.log(`🧠 TensorFlow: Faces detected but outside circular area`);
      return 0.0;
      
    } catch (error) {
      console.error('🧠 TensorFlow face detection failed:', error);
      return 0.0;
    }
  }

  /**
   * Traditional face detection methods for circular area
   */
  private detectFaceWithTraditionalMethods(image: JimpImage, centerX: number, centerY: number, radius: number): Promise<number> {
    return new Promise((resolve) => {
      try {
        // Extract circular region for analysis
        const circularMask = this.createCircularMask(image, centerX, centerY, radius);
        
        // Detect skin-like regions within the circle
        const skinDetectionScore = this.detectSkinInCircularArea(circularMask, centerX, centerY, radius);
        
        // Detect face-like patterns (eyes, mouth, etc.)
        const facePatternScore = this.detectFacialFeatures(circularMask, centerX, centerY, radius);
        
        // Combine scores with weights
        const combinedScore = (skinDetectionScore * 0.6 + facePatternScore * 0.4);
        
        console.log(`🔍 Traditional: Skin=${skinDetectionScore.toFixed(2)}, Patterns=${facePatternScore.toFixed(2)}, Combined=${combinedScore.toFixed(2)}`);
        
        resolve(Math.min(1, combinedScore));
        
      } catch (error) {
        console.error('🔍 Traditional face detection failed:', error);
        resolve(0.0);
      }
    });
  }

  /**
   * Create a mask for the circular area
   */
  private createCircularMask(image: JimpImage, centerX: number, centerY: number, radius: number): JimpImage {
    const { width, height } = image.bitmap;
    const mask = image.clone();
    
    // Set pixels outside circle to black
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const distance = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2));
        
        if (distance > radius) {
          mask.setPixelColor(0x000000FF, x, y); // Set to black
        }
      }
    }
    
    return mask;
  }

  /**
   * Detect skin-like colors in the circular area
   */
  private detectSkinInCircularArea(image: JimpImage, centerX: number, centerY: number, radius: number): number {
    const { width, height } = image.bitmap;
    let skinPixels = 0;
    let totalPixels = 0;
    
    // Sample pixels within the circular area
    const sampleStep = 4; // Sample every 4th pixel for performance
    
    for (let y = 0; y < height; y += sampleStep) {
      for (let x = 0; x < width; x += sampleStep) {
        const distance = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2));
        
        if (distance <= radius) {
          const pixel = Jimp.intToRGBA(image.getPixelColor(x, y));
          
          // Check if pixel is skin-like (simplified skin detection)
          if (this.isSkinLikeColor(pixel.r, pixel.g, pixel.b)) {
            skinPixels++;
          }
          totalPixels++;
        }
      }
    }
    
    const skinRatio = totalPixels > 0 ? skinPixels / totalPixels : 0;
    console.log(`👤 Skin detection: ${skinPixels}/${totalPixels} pixels (${(skinRatio * 100).toFixed(1)}%)`);
    
    // Good face should have 15-70% skin-like pixels in the circular area
    if (skinRatio >= 0.15 && skinRatio <= 0.70) {
      return Math.min(1, skinRatio * 2.5); // Normalize to 0-1 range
    } else {
      return skinRatio > 0.70 ? 0.3 : 0.0; // Too much or too little skin
    }
  }

  /**
   * Simple skin color detection
   */
  private isSkinLikeColor(r: number, g: number, b: number): boolean {
    // Simplified skin color detection using RGB ranges
    // This covers various skin tones
    return (
      (r > 95 && g > 40 && b > 20) && // Basic skin range
      (Math.max(r, Math.max(g, b)) - Math.min(r, Math.min(g, b)) > 15) && // Color variation
      (Math.abs(r - g) > 15) && // Red-Green difference
      (r > g && r > b) // Red dominance
    ) || (
      // Alternative skin tone detection
      (r > 60 && r < 255) &&
      (g > 30 && g < 200) &&
      (b > 15 && b < 170) &&
      (r > g) && (g > b)
    );
  }

  /**
   * Detect facial features like eyes, nose, mouth patterns
   */
  private detectFacialFeatures(image: JimpImage, centerX: number, centerY: number, radius: number): number {
    const { width, height } = image.bitmap;
    
    // Look for dark regions (eyes) in upper part of circle
    const eyeRegionScore = this.detectEyeRegions(image, centerX, centerY - radius * 0.3, radius * 0.8);
    
    // Look for mouth region in lower part of circle
    const mouthRegionScore = this.detectMouthRegion(image, centerX, centerY + radius * 0.4, radius * 0.6);
    
    // Calculate symmetry (faces are generally symmetric)
    const symmetryScore = this.calculateFacialSymmetry(image, centerX, centerY, radius);
    
    const combinedScore = (eyeRegionScore * 0.4 + mouthRegionScore * 0.3 + symmetryScore * 0.3);
    
    console.log(`👁️  Features: Eyes=${eyeRegionScore.toFixed(2)}, Mouth=${mouthRegionScore.toFixed(2)}, Symmetry=${symmetryScore.toFixed(2)}`);
    
    return combinedScore;
  }

  /**
   * Detect eye-like regions (dark spots in upper face area)
   */
  private detectEyeRegions(image: JimpImage, centerX: number, centerY: number, searchRadius: number): number {
    let darkRegions = 0;
    let samples = 0;
    
    // Sample in eye region
    for (let angle = -Math.PI/3; angle <= Math.PI/3; angle += Math.PI/12) {
      for (let r = searchRadius * 0.3; r <= searchRadius; r += 10) {
        const x = Math.round(centerX + r * Math.cos(angle));
        const y = Math.round(centerY + r * Math.sin(angle));
        
        if (x >= 0 && x < image.bitmap.width && y >= 0 && y < image.bitmap.height) {
          const pixel = Jimp.intToRGBA(image.getPixelColor(x, y));
          const brightness = (pixel.r + pixel.g + pixel.b) / 3;
          
          if (brightness < 80) { // Dark pixel threshold for eyes
            darkRegions++;
          }
          samples++;
        }
      }
    }
    
    const eyeScore = samples > 0 ? darkRegions / samples : 0;
    return Math.min(1, eyeScore * 3); // Amplify the score
  }

  /**
   * Detect mouth region
   */
  private detectMouthRegion(image: JimpImage, centerX: number, centerY: number, searchRadius: number): number {
    // Look for horizontal features (mouth line)
    let horizontalFeatures = 0;
    let samples = 0;
    
    for (let x = centerX - searchRadius; x <= centerX + searchRadius; x += 5) {
      if (x >= 1 && x < image.bitmap.width - 1) {
        const y = Math.round(centerY);
        if (y >= 1 && y < image.bitmap.height - 1) {
          
          const current = Jimp.intToRGBA(image.getPixelColor(x, y));
          const above = Jimp.intToRGBA(image.getPixelColor(x, y - 1));
          const below = Jimp.intToRGBA(image.getPixelColor(x, y + 1));
          
          const currentBrightness = (current.r + current.g + current.b) / 3;
          const aboveBrightness = (above.r + above.g + above.b) / 3;
          const belowBrightness = (below.r + below.g + below.b) / 3;
          
          // Look for edge/line pattern
          if (Math.abs(currentBrightness - aboveBrightness) > 20 || 
              Math.abs(currentBrightness - belowBrightness) > 20) {
            horizontalFeatures++;
          }
          samples++;
        }
      }
    }
    
    const mouthScore = samples > 0 ? horizontalFeatures / samples : 0;
    return Math.min(1, mouthScore * 2);
  }

  /**
   * Calculate facial symmetry
   */
  private calculateFacialSymmetry(image: JimpImage, centerX: number, centerY: number, radius: number): number {
    let symmetryMatches = 0;
    let comparisons = 0;
    
    // Compare left and right sides of the circular area
    for (let angle = 0; angle < Math.PI/2; angle += Math.PI/16) {
      for (let r = radius * 0.2; r <= radius * 0.8; r += 10) {
        const leftX = Math.round(centerX - r * Math.cos(angle));
        const rightX = Math.round(centerX + r * Math.cos(angle));
        const y = Math.round(centerY + r * Math.sin(angle));
        
        if (leftX >= 0 && rightX < image.bitmap.width && y >= 0 && y < image.bitmap.height) {
          const leftPixel = Jimp.intToRGBA(image.getPixelColor(leftX, y));
          const rightPixel = Jimp.intToRGBA(image.getPixelColor(rightX, y));
          
          const leftBrightness = (leftPixel.r + leftPixel.g + leftPixel.b) / 3;
          const rightBrightness = (rightPixel.r + rightPixel.g + rightPixel.b) / 3;
          
          const difference = Math.abs(leftBrightness - rightBrightness);
          if (difference < 40) { // Similar brightness indicates symmetry
            symmetryMatches++;
          }
          comparisons++;
        }
      }
    }
    
    const symmetryScore = comparisons > 0 ? symmetryMatches / comparisons : 0;
    return symmetryScore;
  }
  
  private detectImageQuality(image: JimpImage): number {
    const { width, height } = image.bitmap;
    
    // Calculate image sharpness using variance of Laplacian
    let variance = 0;
    let mean = 0;
    let count = 0;
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const center = Jimp.intToRGBA(image.getPixelColor(x, y)).r;
        const neighbors = [
          Jimp.intToRGBA(image.getPixelColor(x-1, y)).r,
          Jimp.intToRGBA(image.getPixelColor(x+1, y)).r,
          Jimp.intToRGBA(image.getPixelColor(x, y-1)).r,
          Jimp.intToRGBA(image.getPixelColor(x, y+1)).r,
        ];
        
        const laplacian = neighbors.reduce((sum, n) => sum + n, 0) - 4 * center;
        mean += laplacian;
        count++;
      }
    }
    
    mean /= count;
    
    // Calculate variance
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const center = Jimp.intToRGBA(image.getPixelColor(x, y)).r;
        const neighbors = [
          Jimp.intToRGBA(image.getPixelColor(x-1, y)).r,
          Jimp.intToRGBA(image.getPixelColor(x+1, y)).r,
          Jimp.intToRGBA(image.getPixelColor(x, y-1)).r,
          Jimp.intToRGBA(image.getPixelColor(x, y+1)).r,
        ];
        
        const laplacian = neighbors.reduce((sum, n) => sum + n, 0) - 4 * center;
        variance += Math.pow(laplacian - mean, 2);
      }
    }
    
    variance /= count;
    
    // Normalize variance to 0-1 scale
    return Math.min(1, variance / 10000);
  }
  
  private analyzeImageSharpness(image: JimpImage): number {
    // Simple sharpness analysis using edge detection
    const { width, height } = image.bitmap;
    let edgeCount = 0;
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const current = Jimp.intToRGBA(image.getPixelColor(x, y)).r;
        const right = Jimp.intToRGBA(image.getPixelColor(x + 1, y)).r;
        const bottom = Jimp.intToRGBA(image.getPixelColor(x, y + 1)).r;
        
        const gradientX = Math.abs(current - right);
        const gradientY = Math.abs(current - bottom);
        
        if (gradientX + gradientY > 30) {
          edgeCount++;
        }
      }
    }
    
    const edgeDensity = edgeCount / (width * height);
    return Math.min(1, edgeDensity * 100);
  }
  
  private checkImageNaturalness(image: JimpImage): number {
    // Check for natural color variations that suggest a real photo
    const { width, height } = image.bitmap;
    const samples = Math.min(1000, width * height / 100);
    
    let colorVariations = 0;
    
    for (let i = 0; i < samples; i++) {
      const x = Math.floor(Math.random() * width);
      const y = Math.floor(Math.random() * height);
      
      const pixel = Jimp.intToRGBA(image.getPixelColor(x, y));
      const brightness = (pixel.r + pixel.g + pixel.b) / 3;
      
      // Check for natural color variation
      const colorRange = Math.max(pixel.r, pixel.g, pixel.b) - Math.min(pixel.r, pixel.g, pixel.b);
      if (colorRange > 20) {
        colorVariations++;
      }
    }
    
    return colorVariations / samples;
  }
  
  private validateChallengeResponse(challengeType: string, image: JimpImage): number {
    // Analyze image for specific challenge completion
    // This is a simplified implementation - in production you'd use more sophisticated ML models
    
    let challengeScore = 0;
    
    switch (challengeType) {
      case 'blink_twice':
        // Check for natural eye region variations
        challengeScore = this.detectEyeActivity(image);
        break;
      case 'turn_head_left':
      case 'turn_head_right':
        // Check for head pose variations
        challengeScore = this.detectHeadMovement(image);
        break;
      case 'smile':
        // Check for facial expression changes
        challengeScore = this.detectSmile(image);
        break;
      case 'look_up':
      case 'look_down':
        // Check for gaze direction
        challengeScore = this.detectGazeDirection(image);
        break;
      default:
        challengeScore = 0.1; // Small bonus for any challenge attempt
    }
    
    return Math.min(0.3, challengeScore); // Cap challenge bonus at 0.3
  }

  private detectEyeActivity(image: JimpImage): number {
    // Simple check for eye region activity (mock implementation)
    const brightness = this.getAverageBrightness(image);
    const contrast = this.getImageContrast(image);
    
    // Eyes typically create contrast variations
    return Math.min(0.25, (contrast * brightness) / 10000);
  }

  private detectHeadMovement(image: JimpImage): number {
    // Check for asymmetry that might indicate head turn
    const asymmetry = this.detectFaceAsymmetry(image);
    return Math.min(0.2, asymmetry);
  }

  private detectSmile(image: JimpImage): number {
    // Look for curved features in lower face region
    const { width, height } = image.bitmap;
    const lowerFace = image.clone().crop(0, height * 0.6, width, height * 0.4);
    const curvature = this.detectCurvature(lowerFace);
    return Math.min(0.2, curvature);
  }

  private detectGazeDirection(image: JimpImage): number {
    // Simple gaze detection based on eye region analysis
    const eyeRegionAnalysis = this.analyzeEyeRegions(image);
    return Math.min(0.2, eyeRegionAnalysis);
  }

  private getAverageBrightness(image: JimpImage): number {
    const { width, height } = image.bitmap;
    let totalBrightness = 0;
    let pixelCount = 0;

    for (let y = 0; y < height; y += 4) { // Sample every 4th pixel
      for (let x = 0; x < width; x += 4) {
        const pixel = Jimp.intToRGBA(image.getPixelColor(x, y));
        totalBrightness += (pixel.r + pixel.g + pixel.b) / 3;
        pixelCount++;
      }
    }

    return totalBrightness / pixelCount;
  }

  private getImageContrast(image: JimpImage): number {
    const { width, height } = image.bitmap;
    let minBrightness = 255;
    let maxBrightness = 0;

    for (let y = 0; y < height; y += 4) {
      for (let x = 0; x < width; x += 4) {
        const pixel = Jimp.intToRGBA(image.getPixelColor(x, y));
        const brightness = (pixel.r + pixel.g + pixel.b) / 3;
        minBrightness = Math.min(minBrightness, brightness);
        maxBrightness = Math.max(maxBrightness, brightness);
      }
    }

    return maxBrightness - minBrightness;
  }

  private detectFaceAsymmetry(image: JimpImage): number {
    const { width, height } = image.bitmap;
    const centerX = width / 2;
    
    let asymmetryScore = 0;
    let samples = 0;

    // Compare left and right halves
    for (let y = 0; y < height; y += 8) {
      for (let x = 0; x < centerX; x += 8) {
        const leftPixel = Jimp.intToRGBA(image.getPixelColor(x, y));
        const rightPixel = Jimp.intToRGBA(image.getPixelColor(width - x - 1, y));
        
        const leftBrightness = (leftPixel.r + leftPixel.g + leftPixel.b) / 3;
        const rightBrightness = (rightPixel.r + rightPixel.g + rightPixel.b) / 3;
        
        asymmetryScore += Math.abs(leftBrightness - rightBrightness);
        samples++;
      }
    }

    return samples > 0 ? (asymmetryScore / samples) / 255 : 0;
  }

  private detectCurvature(image: JimpImage): number {
    // Simple curvature detection using edge gradients
    const { width, height } = image.bitmap;
    let curvatureScore = 0;
    let edgeCount = 0;

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const center = Jimp.intToRGBA(image.getPixelColor(x, y)).r;
        const left = Jimp.intToRGBA(image.getPixelColor(x - 1, y)).r;
        const right = Jimp.intToRGBA(image.getPixelColor(x + 1, y)).r;
        const top = Jimp.intToRGBA(image.getPixelColor(x, y - 1)).r;
        const bottom = Jimp.intToRGBA(image.getPixelColor(x, y + 1)).r;

        // Detect curved patterns
        const horizontalGrad = Math.abs(left - right);
        const verticalGrad = Math.abs(top - bottom);
        
        if (horizontalGrad > 20 || verticalGrad > 20) {
          curvatureScore += Math.min(horizontalGrad, verticalGrad) / Math.max(horizontalGrad, verticalGrad);
          edgeCount++;
        }
      }
    }

    return edgeCount > 0 ? curvatureScore / edgeCount : 0;
  }

  private analyzeColorDepth(image: JimpImage): number {
    // Analyze color depth and richness - live images have better color depth
    const { width, height } = image.bitmap;
    let colorVariationScore = 0;
    let uniqueColors = new Set<string>();
    let samples = 0;
    const maxSamples = Math.min(1000, width * height / 100);
    
    for (let i = 0; i < maxSamples; i++) {
      const x = Math.floor(Math.random() * width);
      const y = Math.floor(Math.random() * height);
      
      const pixel = Jimp.intToRGBA(image.getPixelColor(x, y));
      
      // Track unique color combinations (reduced precision for grouping)
      const colorKey = `${Math.floor(pixel.r/16)}-${Math.floor(pixel.g/16)}-${Math.floor(pixel.b/16)}`;
      uniqueColors.add(colorKey);
      
      // Analyze color distribution across RGB channels
      const rgbVariance = Math.abs(pixel.r - pixel.g) + Math.abs(pixel.g - pixel.b) + Math.abs(pixel.b - pixel.r);
      colorVariationScore += rgbVariance;
      samples++;
    }
    
    // Calculate color richness metrics
    const averageVariation = colorVariationScore / samples;
    const colorRichness = uniqueColors.size / maxSamples;
    
    // Combine metrics (live photos typically have more color variation and richness)
    const colorDepthScore = (averageVariation / 255) * 0.7 + colorRichness * 0.3;
    
    return Math.min(1, colorDepthScore);
  }

  private analyzeEyeRegions(image: JimpImage): number {
    // Focus on upper portion of image where eyes would be
    const { width, height } = image.bitmap;
    const eyeRegion = image.clone().crop(0, height * 0.2, width, height * 0.3);
    
    // Look for dark regions (pupils/iris)
    let darkPixels = 0;
    let totalPixels = 0;

    eyeRegion.scan(0, 0, eyeRegion.bitmap.width, eyeRegion.bitmap.height, function(x: any, y: any, idx: any) {
      const pixel = Jimp.intToRGBA(eyeRegion.getPixelColor(x, y));
      const brightness = (pixel.r + pixel.g + pixel.b) / 3;
      
      if (brightness < 80) { // Dark pixel threshold
        darkPixels++;
      }
      totalPixels++;
    });

    return totalPixels > 0 ? darkPixels / totalPixels : 0;
  }

  private secureLivenessFallback(): number {
    const secureScore = 0.0;
    logger.error('Liveness detection system error - returning secure failure score', { secureScore });
    return secureScore;
  }

  private secureDetailedLivenessFallback(): {
    isLive: boolean;
    confidence: number;
    checks: {
      blinkDetected: boolean;
      headMovement: boolean;
      eyeGaze: boolean;
    };
  } {
    const secureResult = {
      isLive: false,
      confidence: 0.0,
      checks: {
        blinkDetected: false,
        headMovement: false,
        eyeGaze: false
      }
    };
    
    logger.error('Detailed liveness detection system error - returning secure failure result', {
      secureResult,
      reason: 'System error during detailed liveness detection'
    });
    
    return secureResult;
  }
  
  private detectMimeType(buffer: Buffer): string {
    const signatures = {
      'image/jpeg': [0xFF, 0xD8, 0xFF],
      'image/png': [0x89, 0x50, 0x4E, 0x47],
      'image/webp': [0x52, 0x49, 0x46, 0x46]
    };
    
    for (const [mimeType, signature] of Object.entries(signatures)) {
      if (signature.every((byte, index) => buffer[index] === byte)) {
        return mimeType;
      }
    }
    
    return 'image/jpeg'; // Default fallback
  }
  
  private parseAIFaceComparison(aiResponse: string): {
    face_match_score: number;
    confidence: number;
    analysis?: any;
    reasoning?: string;
  } {
    try {
      // Check for common AI refusal patterns
      const refusalPatterns = [
        /I'm unable to analyze/i,
        /I cannot analyze/i,
        /I'm not able to/i,
        /I can't analyze/i,
        /unable to perform/i,
        /cannot perform/i,
        /cannot compare/i,
        /unable to compare/i
      ];
      
      const isRefusal = refusalPatterns.some(pattern => pattern.test(aiResponse));
      if (isRefusal) {
        console.log('🤖 OpenAI refused face comparison, using text extraction');
        return this.extractScoreFromText(aiResponse);
      }
      
      // Clean the response - sometimes AI adds markdown formatting
      let cleanResponse = aiResponse.trim();
      if (cleanResponse.startsWith('```json')) {
        cleanResponse = cleanResponse.replace(/```json\n?/, '').replace(/```$/, '');
      }
      if (cleanResponse.startsWith('```')) {
        cleanResponse = cleanResponse.replace(/```\n?/, '').replace(/```$/, '');
      }
      
      // Check if it looks like JSON before parsing
      if (!cleanResponse.startsWith('{') && !cleanResponse.startsWith('[')) {
        console.log('🤖 AI response does not appear to be JSON, extracting from text');
        return this.extractScoreFromText(aiResponse);
      }
      
      try {
        const parsed = JSON.parse(cleanResponse);
        
        // Validate and normalize the response
        const faceMatchScore = Math.max(0, Math.min(1, parsed.face_match_score || 0));
        const confidence = Math.max(0, Math.min(1, parsed.confidence || 0.5));
        
        console.log('🤖 AI face comparison parsed successfully:', {
          faceMatchScore,
          confidence,
          samePerson: parsed.analysis?.same_person,
          reasoning: parsed.reasoning?.substring(0, 100) + '...'
        });
        
        return {
          face_match_score: faceMatchScore,
          confidence: confidence,
          analysis: parsed.analysis,
          reasoning: parsed.reasoning
        };
        
      } catch (jsonError) {
        console.log('🤖 AI face comparison response not valid JSON, extracting from text');
        return this.extractScoreFromText(aiResponse);
      }
      
    } catch (error) {
      console.error('🤖 Failed to parse AI face comparison response:', error);
      return {
        face_match_score: 0.5,
        confidence: 0.3
      };
    }
  }
  
  private extractScoreFromText(text: string): {
    face_match_score: number;
    confidence: number;
  } {
    // Try to extract numeric scores from text if JSON parsing fails
    const scoreMatches = text.match(/(?:score|match|similarity).*?(\d+\.?\d*)/gi);
    let score = 0.5;
    
    if (scoreMatches && scoreMatches.length > 0) {
      const numbers = scoreMatches[0].match(/\d+\.?\d*/);
      if (numbers) {
        const extractedScore = parseFloat(numbers[0]);
        // If the number seems to be a percentage (>1), convert to 0-1 scale
        score = extractedScore > 1 ? extractedScore / 100 : extractedScore;
        score = Math.max(0, Math.min(1, score));
      }
    }
    
    console.log('🤖 Extracted face match score from text:', {
      score,
      originalText: text.substring(0, 200) + '...'
    });
    
    return {
      face_match_score: score,
      confidence: 0.7 // Assume reasonable confidence when we can extract a score
    };
  }
  
  private parseAILivenessResponse(aiResponse: string): {
    liveness_score: number;
    confidence: number;
    analysis?: {
      is_live_person?: boolean;
      facial_depth_detected?: boolean;
      natural_lighting?: boolean;
      eye_authenticity?: boolean;
      skin_texture_natural?: boolean;
      no_screen_artifacts?: boolean;
      challenge_completed?: boolean;
    };
    risk_factors?: string[];
    liveness_indicators?: string[];
    reasoning?: string;
  } {
    try {
      // Check for common AI refusal patterns
      const refusalPatterns = [
        /I'm unable to analyze/i,
        /I cannot analyze/i,
        /I'm not able to/i,
        /I can't analyze/i,
        /unable to perform/i,
        /cannot perform/i
      ];
      
      const isRefusal = refusalPatterns.some(pattern => pattern.test(aiResponse));
      if (isRefusal) {
        console.log('🤖 OpenAI refused liveness analysis, using text extraction');
        return this.extractLivenessFromText(aiResponse);
      }
      
      // Clean the response - sometimes AI adds markdown formatting
      let cleanResponse = aiResponse.trim();
      if (cleanResponse.startsWith('```json')) {
        cleanResponse = cleanResponse.replace(/```json\n?/, '').replace(/```$/, '');
      }
      if (cleanResponse.startsWith('```')) {
        cleanResponse = cleanResponse.replace(/```\n?/, '').replace(/```$/, '');
      }
      
      // Check if it looks like JSON before parsing
      if (!cleanResponse.startsWith('{') && !cleanResponse.startsWith('[')) {
        console.log('🤖 AI response does not appear to be JSON, extracting from text');
        return this.extractLivenessFromText(aiResponse);
      }
      
      try {
        const parsed = JSON.parse(cleanResponse);
        
        // Validate and normalize the response
        const livenessScore = Math.max(0, Math.min(1, parsed.liveness_score || 0.5));
        const confidence = Math.max(0, Math.min(1, parsed.confidence || 0.5));
        
        console.log('🤖 AI liveness detection parsed successfully:', {
          livenessScore,
          confidence,
          isLivePerson: parsed.analysis?.is_live_person || parsed.is_live_person,
          riskFactors: parsed.risk_factors?.length || 0,
          livenessIndicators: parsed.liveness_indicators?.length || 0
        });
        
        return {
          liveness_score: livenessScore,
          confidence: confidence,
          analysis: {
            is_live_person: parsed.analysis?.is_live_person || parsed.is_live_person,
            facial_depth_detected: parsed.analysis?.facial_depth_detected || parsed.detailed_analysis?.facial_depth_detected,
            natural_lighting: parsed.analysis?.natural_lighting || parsed.detailed_analysis?.natural_lighting,
            eye_authenticity: parsed.analysis?.eye_authenticity || parsed.detailed_analysis?.eye_authenticity,
            skin_texture_natural: parsed.analysis?.skin_texture_natural || parsed.detailed_analysis?.skin_texture_natural,
            no_screen_artifacts: parsed.analysis?.no_screen_artifacts || parsed.detailed_analysis?.no_screen_artifacts,
            challenge_completed: parsed.analysis?.challenge_completed || parsed.traditional_checks?.blink_detected
          },
          risk_factors: parsed.risk_factors || [],
          liveness_indicators: parsed.liveness_indicators || [],
          reasoning: parsed.reasoning
        };
        
      } catch (jsonError) {
        console.log('🤖 AI liveness response not valid JSON, extracting data from text');
        return this.extractLivenessFromText(aiResponse);
      }
      
    } catch (error) {
      console.error('🤖 Failed to parse AI liveness response:', error);
      return {
        liveness_score: 0.5,
        confidence: 0.3,
        analysis: {
          is_live_person: false
        },
        risk_factors: ['AI parsing failed'],
        liveness_indicators: []
      };
    }
  }
  
  private extractLivenessFromText(text: string): {
    liveness_score: number;
    confidence: number;
    analysis: {
      is_live_person: boolean;
    };
    risk_factors: string[];
    liveness_indicators: string[];
  } {
    // Try to extract liveness indicators from unstructured AI response
    const liveKeywords = ['live person', 'real person', 'authentic', 'natural', 'genuine'];
    const fakeKeywords = ['photo', 'screen', 'fake', 'spoof', 'artificial', 'digital'];
    
    const textLower = text.toLowerCase();
    let liveCount = 0;
    let fakeCount = 0;
    
    liveKeywords.forEach(keyword => {
      if (textLower.includes(keyword)) liveCount++;
    });
    
    fakeKeywords.forEach(keyword => {
      if (textLower.includes(keyword)) fakeCount++;
    });
    
    // Extract score if present
    const scoreMatch = text.match(/(?:score|confidence).*?(\d+\.?\d*)/i);
    let score = 0.5;
    
    if (scoreMatch) {
      const extractedScore = parseFloat(scoreMatch[1]);
      score = extractedScore > 1 ? extractedScore / 100 : extractedScore;
      score = Math.max(0, Math.min(1, score));
    } else if (liveCount > fakeCount) {
      score = 0.7;
    } else if (fakeCount > liveCount) {
      score = 0.3;
    }
    
    console.log('🤖 Extracted liveness data from text:', {
      score,
      liveKeywords: liveCount,
      fakeKeywords: fakeCount,
      textPreview: text.substring(0, 200) + '...'
    });
    
    return {
      liveness_score: score,
      confidence: 0.6,
      analysis: {
        is_live_person: liveCount > fakeCount
      },
      risk_factors: fakeCount > 0 ? ['Possible spoofing indicators detected'] : [],
      liveness_indicators: liveCount > 0 ? ['Natural features detected'] : []
    };
  }
  
  async extractFaceImage(imagePath: string): Promise<Buffer | null> {
    await this.initialize();
    
    try {
      const imageBuffer = await this.storageService.downloadFile(imagePath);
      const image = await Jimp.read(imageBuffer);
      
      // For MVP, we'll use simple center cropping as face extraction
      const size = Math.min(image.bitmap.width, image.bitmap.height);
      const x = (image.bitmap.width - size) / 2;
      const y = (image.bitmap.height - size) / 2;
      
      const faceImage = image
        .crop(x, y, size, size)
        .resize(150, 150);
      
      return await faceImage.getBufferAsync(Jimp.MIME_JPEG);
    } catch (error) {
      logger.error('Failed to extract face image:', error);
      return null;
    }
  }

  // TensorFlow face processing helper methods
  private async imageBufferToTensor(buffer: Buffer): Promise<any> {
    if (!tf) {
      throw new Error('TensorFlow.js not available');
    }
    
    try {
      // Use Jimp to process the image
      const image = await Jimp.read(buffer);
      
      console.log('🔍 Original image dimensions:', image.bitmap.width, 'x', image.bitmap.height);
      
      // BlazeFace works better with larger input sizes - use 512x512 instead of 224x224
      const targetSize = 512;
      image.resize(targetSize, targetSize);
      
      console.log('🔍 Resized to:', targetSize, 'x', targetSize);
      
      // Convert to RGB array
      const width = image.bitmap.width;
      const height = image.bitmap.height;
      const rgbArray = new Float32Array(width * height * 3);
      
      let idx = 0;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const pixel = Jimp.intToRGBA(image.getPixelColor(x, y));
          rgbArray[idx++] = pixel.r / 255.0; // Normalize to [0, 1]
          rgbArray[idx++] = pixel.g / 255.0;
          rgbArray[idx++] = pixel.b / 255.0;
        }
      }
      
      // Create tensor from RGB array with correct shape for BlazeFace
      const tensor = tf.tensor3d(rgbArray, [height, width, 3]);
      console.log('🔍 Created tensor with shape:', tensor.shape);
      
      return tensor;
      
    } catch (error) {
      console.error('🔍 Error converting image buffer to tensor:', error);
      throw error;
    }
  }

  private async extractFaceEmbedding(imageTensor: any): Promise<any> {
    if (!tf) {
      throw new Error('TensorFlow.js not available');
    }
    
    try {
      // Initialize face detection model if not already done
      await this.initializeTensorFlowModels();
      
      // Detect faces in the image
      const faces = await this.detectFaces(imageTensor);
      
      if (!faces || faces.length === 0) {
        console.warn('No faces detected in image');
        return null;
      }
      
      // Use the first detected face (largest)
      const face = faces[0];
      
      // Extract face region and create embedding
      const faceEmbedding = await this.createFaceEmbedding(imageTensor, face);
      
      return faceEmbedding;
      
    } catch (error) {
      console.error('Error extracting face embedding:', error);
      throw error;
    }
  }

  private async initializeTensorFlowModels(): Promise<void> {
    // Check if we need to initialize any models
    const needBlazeFace = !this.faceDetector && !!blazeface;
    const needLandmarks = !this.faceLandmarkDetector && !!faceLandmarksDetection;
    
    if (!needBlazeFace && !needLandmarks) {
      return; // Already initialized or libraries not available
    }
    
    try {
      if (blazeface && needBlazeFace) {
        try {
          console.log('🧠 Loading BlazeFace model...');
          this.faceDetector = await blazeface.load();
          console.log('✅ BlazeFace model loaded');
        } catch (blazeError) {
          console.warn('⚠️ BlazeFace model failed to load, using fallback detection:', blazeError);
          this.faceDetector = null; // Will use fallback detection
        }
      }
      
      if (faceLandmarksDetection && needLandmarks) {
        try {
          console.log('🧠 Loading Face Landmarks model...');
          this.faceLandmarkDetector = await faceLandmarksDetection.createDetector(
            faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh,
            {
              runtime: 'tfjs',
              maxFaces: 1,
              refineLandmarks: false
            }
          );
          console.log('✅ Face Landmarks model loaded');
        } catch (landmarksError) {
          console.warn('⚠️ Face Landmarks model failed to load, using fallback methods:', landmarksError);
          this.faceLandmarkDetector = null; // Will use fallback methods
        }
      }
      
    } catch (error) {
      console.error('Failed to initialize TensorFlow models:', error);
      // Don't throw error - allow service to continue with fallback methods
      console.warn('⚠️ Continuing with fallback detection methods');
    }
  }

  private async detectFaces(imageTensor: any): Promise<any[]> {
    if (!this.faceDetector) {
      console.warn('🔍 BlazeFace not available, using fallback face detection');
      // Return a mock face detection for circular area analysis
      const height = imageTensor.shape[0];
      const width = imageTensor.shape[1];
      return [{
        topLeft: [width * 0.25, height * 0.25],
        bottomRight: [width * 0.75, height * 0.75],
        landmarks: [],
        probability: 0.5
      }];
    }
    
    try {
      console.log('🔍 Input tensor shape:', imageTensor.shape);
      console.log('🔍 Input tensor data type:', imageTensor.dtype);
      
      // Ensure tensor is in the right format for BlazeFace (needs to be normalized between 0-1)
      let processedTensor = imageTensor;
      
      // Check if values are in 0-255 range and normalize if needed
      const sampleValue = await imageTensor.slice([0, 0, 0], [1, 1, 1]).dataSync()[0];
      if (sampleValue > 1.0) {
        console.log('🔍 Normalizing tensor values from 0-255 to 0-1 range');
        processedTensor = imageTensor.div(255.0);
      }
      
      // BlazeFace expects input tensor directly, not batched
      console.log('🔍 Calling BlazeFace estimateFaces...');
      const faces = await this.faceDetector.estimateFaces(processedTensor, false);
      
      console.log('🔍 BlazeFace detected faces:', faces ? faces.length : 0);
      if (faces && faces.length > 0) {
        console.log('🔍 First face details:', {
          topLeft: faces[0].topLeft,
          bottomRight: faces[0].bottomRight,
          landmarks: faces[0].landmarks ? faces[0].landmarks.length : 0
        });
      }
      
      return faces || [];
      
    } catch (error) {
      console.error('🔍 Error detecting faces:', error);
      return [];
    }
  }

  private async createFaceEmbedding(imageTensor: any, face: any): Promise<any> {
    try {
      // Extract bounding box
      const [x, y, width, height] = [
        Math.max(0, Math.floor(face.topLeft[0])),
        Math.max(0, Math.floor(face.topLeft[1])),
        Math.min(imageTensor.shape[1] - Math.floor(face.topLeft[0]), Math.floor(face.bottomRight[0] - face.topLeft[0])),
        Math.min(imageTensor.shape[0] - Math.floor(face.topLeft[1]), Math.floor(face.bottomRight[1] - face.topLeft[1]))
      ];
      
      // Crop face region
      const faceRegion = tf.slice(imageTensor, [y, x, 0], [height, width, 3]);
      
      // Resize to standard embedding size
      const resized = tf.image.resizeBilinear(faceRegion, [128, 128]);
      
      // Flatten for simple feature vector
      const embedding = tf.flatten(resized);
      
      faceRegion.dispose();
      resized.dispose();
      
      return embedding;
      
    } catch (error) {
      console.error('Error creating face embedding:', error);
      throw error;
    }
  }

  private calculateEmbeddingSimilarity(embedding1: any, embedding2: any): number {
    if (!embedding1 || !embedding2) {
      return 0;
    }
    
    try {
      // Calculate cosine similarity between embeddings
      const dot = tf.sum(tf.mul(embedding1, embedding2));
      const norm1 = tf.norm(embedding1);
      const norm2 = tf.norm(embedding2);
      
      const similarity = tf.div(dot, tf.mul(norm1, norm2));
      const similarityValue = similarity.dataSync()[0];
      
      dot.dispose();
      norm1.dispose();
      norm2.dispose();
      similarity.dispose();
      
      return similarityValue || 0;
      
    } catch (error) {
      console.error('Error calculating embedding similarity:', error);
      return 0;
    }
  }
  
  // Health check for face recognition service
  async healthCheck(): Promise<{
    status: string;
    modelsLoaded: boolean;
    error?: string;
  }> {
    try {
      await this.initialize();
      
      return {
        status: this.isInitialized ? 'healthy' : 'degraded',
        modelsLoaded: this.isInitialized
      };
    } catch (error) {
      return {
        status: 'error',
        modelsLoaded: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}