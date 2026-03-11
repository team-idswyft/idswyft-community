import { logger } from '@/utils/logger.js';
import { StorageService } from './storage.js';
import { VERIFICATION_THRESHOLDS } from '@/config/verificationThresholds.js';
import { 
  VerificationFailureType,
  VerificationErrorClassifier
} from '@/types/verificationTypes.js';
// @ts-ignore - No types available for parse-usdl
import { parse as parseUSDL } from 'parse-usdl';

// Optional dependency imports with graceful fallbacks
let Jimp: any = null;
let Tesseract: any = null;
let ZXing: any = null;

// Type definitions for optional dependencies
type JimpImage = any;

try {
  Jimp = (await import('jimp')).default;
} catch (error) {
  logger.warn('Jimp not available, using AI-only processing');
}

try {
  Tesseract = await import('tesseract.js');
} catch (error) {
  logger.warn('Tesseract.js not available, using AI-only processing');
}

try {
  ZXing = await import('@zxing/library');
  console.log('📄 ZXing barcode library loaded for PDF417 detection');
} catch (error) {
  logger.warn('ZXing library not available, falling back to OCR-based detection');
}

export interface BarcodeResult {
  type: 'qr_code' | 'barcode' | 'pdf417' | 'datamatrix';
  data: string;
  decoded_data?: any;
  confidence: number;
  location?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface PDF417Data {
  raw_data: string;
  parsed_data: {
    firstName?: string;
    lastName?: string;
    middleName?: string;
    dateOfBirth?: string;
    licenseNumber?: string;
    expirationDate?: string;
    issueDate?: string;
    address?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    gender?: string;
    eyeColor?: string;
    height?: string;
    weight?: string;
    endorsements?: string;
    restrictions?: string;
    vehicleClass?: string;
    documentDiscriminator?: string;
    organ_donor?: boolean;
  };
  confidence: number;
  validation_status: 'valid' | 'invalid' | 'partial';
}

export interface BackOfIdData {
  magnetic_stripe?: string;
  qr_code?: string;
  barcode_data?: string;
  pdf417_data?: PDF417Data;
  raw_text?: string;
  parsed_data?: {
    id_number?: string;
    expiry_date?: string;
    issuing_authority?: string;
    address?: string;
    first_name?: string;
    last_name?: string;
    date_of_birth?: string;
    additional_info?: any;
  };
  verification_codes?: string[];
  security_features?: string[];
}

export class BarcodeService {
  private storageService: StorageService;

  constructor() {
    this.storageService = new StorageService();
    console.log('📊 Barcode scanning enabled (ZXing + parse-usdl)');
  }

  /**
   * Parse PDF417 barcode data from driver's license
   * Supports both live scan and uploaded images
   */
  async parsePDF417(rawBarcodeData: string): Promise<PDF417Data> {
    try {
      console.log('📄 Parsing PDF417 barcode data...', {
        dataLength: rawBarcodeData.length,
        preview: rawBarcodeData.substring(0, 50) + '...'
      });
      
      // First try parse-usdl library
      let parsedData = parseUSDL(rawBarcodeData, { suppressErrors: true });
      
      // Always run manual AAMVA parsing to ensure we get all fields
      console.log('📄 Running manual AAMVA parsing to supplement parse-usdl results...');
      const manualParsed = this.parseAAMVAFieldCodes(rawBarcodeData);
      
      // Merge parse-usdl with manual parsing (manual takes precedence for missing fields)
      parsedData = {
        ...(parsedData || {}),
        ...manualParsed
      };
      
      // (PII fields deliberately not logged)
      
      if (!parsedData) {
        throw new Error('PDF417 parsing returned null - invalid barcode format');
      }
      
      
      // Calculate confidence based on how many fields were successfully parsed
      const totalFields = Object.keys(parsedData).length;
      const populatedFields = Object.values(parsedData).filter(value => 
        value !== null && value !== undefined && value !== ''
      ).length;
      const confidence = Math.min(0.95, populatedFields / Math.max(totalFields, 10));
      
      // Determine validation status
      let validation_status: 'valid' | 'invalid' | 'partial' = 'valid';
      const criticalFields = ['firstName', 'lastName', 'licenseNumber', 'dateOfBirth'];
      const missingCriticalFields = criticalFields.filter(field => 
        !parsedData[field] || parsedData[field] === ''
      );
      
      if (missingCriticalFields.length > 2) {
        validation_status = 'invalid';
      } else if (missingCriticalFields.length > 0) {
        validation_status = 'partial';
      }
      
      const result: PDF417Data = {
        raw_data: rawBarcodeData,
        parsed_data: {
          firstName: parsedData.firstName || undefined,
          lastName: parsedData.lastName || undefined,
          middleName: parsedData.middleName || undefined,
          dateOfBirth: parsedData.dateOfBirth || undefined,
          licenseNumber: parsedData.licenseNumber || undefined,
          expirationDate: parsedData.expirationDate || undefined,
          issueDate: parsedData.issueDate || undefined,
          address: parsedData.address || undefined,
          city: parsedData.city || undefined,
          state: parsedData.state || undefined,
          zipCode: parsedData.zipCode || undefined,
          gender: parsedData.gender || undefined,
          eyeColor: parsedData.eyeColor || undefined,
          height: parsedData.height || undefined,
          weight: parsedData.weight || undefined,
          endorsements: parsedData.endorsements || undefined,
          restrictions: parsedData.restrictions || undefined,
          vehicleClass: parsedData.vehicleClass || undefined,
          documentDiscriminator: parsedData.documentDiscriminator || undefined,
          organ_donor: parsedData.organDonor || false
        },
        confidence,
        validation_status
      };
      
      
      logger.info('PDF417 parsing completed', {
        validation_status,
        confidence,
        criticalFieldsMissing: missingCriticalFields.length,
        totalFieldsParsed: populatedFields
      });
      
      return result;
      
    } catch (error) {
      logger.error('PDF417 parsing failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        dataLength: rawBarcodeData.length
      });
      
      return {
        raw_data: rawBarcodeData,
        parsed_data: {},
        confidence: 0,
        validation_status: 'invalid'
      };
    }
  }

  async scanBackOfId(imagePath: string): Promise<BackOfIdData> {
    logger.info('Starting back-of-ID scanning with PDF417 only', {
      imagePath,
      method: 'PDF417 barcode scanning only'
    });

    console.log('📄 Processing back-of-ID with PDF417 barcode detection...');
    const backOfIdData = await this.scanWithPDF417AndOCR(imagePath);
    return backOfIdData;
  }

  /**
   * Combined PDF417 + OCR scanning method
   * First attempts to detect and parse PDF417 barcode, then falls back to OCR
   */
  private async scanWithPDF417AndOCR(imagePath: string): Promise<BackOfIdData> {
    try {
      console.log('📄 Starting combined PDF417 + OCR scanning...');
      
      // First try proper PDF417 barcode detection with ZXing
      console.log('📄 Attempting proper PDF417 barcode detection with ZXing...');
      const pdf417RawData = await this.detectPDF417WithZXing(imagePath);
      
      let pdf417Data: PDF417Data = {
        raw_data: '',
        parsed_data: {},
        confidence: 0,
        validation_status: 'invalid'
      };
      
      if (pdf417RawData) {
        // Parse the actual PDF417 data using parse-usdl and manual AAMVA parsing
        console.log('✅ PDF417 barcode detected, parsing AAMVA data...');
        pdf417Data = await this.parsePDF417(pdf417RawData);
      } else {
        console.log('📄 ZXing detection failed, falling back to OCR-based detection...');
        pdf417Data = await this.detectPDF417WithOCR(imagePath);
      }
      
      // Also run OCR in parallel for additional data extraction
      const ocrData = await this.scanWithLocalOCR(imagePath);
      
      // Combine the results
      const combinedResult: BackOfIdData = {
        ...ocrData,
        pdf417_data: pdf417Data.validation_status !== 'invalid' ? pdf417Data : undefined
      };
      
      // If PDF417 parsing was successful, merge its data into parsed_data
      if (pdf417Data.validation_status !== 'invalid') {
        combinedResult.parsed_data = {
          ...ocrData.parsed_data,
          id_number: pdf417Data.parsed_data.licenseNumber || ocrData.parsed_data?.id_number,
          expiry_date: pdf417Data.parsed_data.expirationDate || ocrData.parsed_data?.expiry_date,
          issuing_authority: pdf417Data.parsed_data.state || ocrData.parsed_data?.issuing_authority,
          address: this.combineAddress(pdf417Data.parsed_data) || ocrData.parsed_data?.address,
          additional_info: {
            ...ocrData.parsed_data?.additional_info,
            pdf417_parsed: true,
            pdf417_confidence: pdf417Data.confidence,
            name: `${pdf417Data.parsed_data.firstName || ''} ${pdf417Data.parsed_data.middleName || ''} ${pdf417Data.parsed_data.lastName || ''}`.trim(),
            date_of_birth: pdf417Data.parsed_data.dateOfBirth,
            gender: pdf417Data.parsed_data.gender,
            eye_color: pdf417Data.parsed_data.eyeColor,
            height: pdf417Data.parsed_data.height,
            weight: pdf417Data.parsed_data.weight,
            endorsements: pdf417Data.parsed_data.endorsements,
            restrictions: pdf417Data.parsed_data.restrictions,
            vehicle_class: pdf417Data.parsed_data.vehicleClass,
            organ_donor: pdf417Data.parsed_data.organ_donor
          }
        };
        
        console.log('✅ PDF417 + OCR scanning successful:', {
          pdf417_confidence: pdf417Data.confidence,
          pdf417_validation: pdf417Data.validation_status,
          license_number: pdf417Data.parsed_data.licenseNumber,
          name: `${pdf417Data.parsed_data.firstName || ''} ${pdf417Data.parsed_data.lastName || ''}`.trim()
        });
      }
      
      logger.info('Combined PDF417 + OCR scanning completed', {
        imagePath,
        pdf417_success: pdf417Data.validation_status !== 'invalid',
        pdf417_confidence: pdf417Data.confidence,
        ocr_success: !!ocrData.parsed_data?.id_number
      });

      return combinedResult;
      
    } catch (error) {
      console.error('📄 Combined PDF417 + OCR scanning failed:', error);
      logger.error('Combined PDF417 + OCR scanning failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      // Fallback to just OCR
      console.log('🔍 Falling back to OCR-only scanning...');
      return await this.scanWithLocalOCR(imagePath);
    }
  }

  /**
   * Detect and extract PDF417 barcode using OCR and pattern matching
   */
  private async detectPDF417WithOCR(imagePath: string): Promise<PDF417Data> {
    try {
      console.log('📄 Attempting to detect PDF417 barcode with OCR...');
      
      // Use local OCR to scan for barcode-like patterns
      const ocrData = await this.scanWithLocalOCR(imagePath);
      
      // Look for PDF417-like patterns in OCR text
      // PDF417 barcodes on driver's licenses typically contain specific data patterns
      const ocrText = ocrData.raw_text || '';
      
      console.log(`📄 OCR text analysis: length=${ocrText.length}, hasIdNumber=${!!ocrData.parsed_data?.id_number}`);
      console.log(`📄 OCR first 100 chars: "${ocrText.substring(0, 100)}"`);
      
      // If OCR text is completely empty, this might be a processing issue
      if (ocrText.length === 0) {
        console.warn('📄 OCR returned completely empty text - image processing may have failed');
      }
      
      // Check if we have structured data that might be from a PDF417 barcode
      if (ocrData.parsed_data?.id_number) {
        console.log('📄 OCR detected structured data, treating as PDF417 equivalent');
        
        // Create a PDF417Data structure from OCR data
        return {
          raw_data: ocrText,
          parsed_data: {
            licenseNumber: ocrData.parsed_data.id_number,
            firstName: ocrData.parsed_data.first_name || '',
            lastName: ocrData.parsed_data.last_name || '',
            dateOfBirth: ocrData.parsed_data.date_of_birth,
            expirationDate: ocrData.parsed_data.expiry_date,
            state: ocrData.parsed_data.issuing_authority,
            address: ocrData.parsed_data.address
          },
          confidence: 0.6, // OCR-based detection has lower confidence
          validation_status: 'partial' as const
        };
      }
      
      // If no structured data, return invalid result
      throw new Error('No PDF417 barcode pattern detected in OCR text');
      
    } catch (error) {
      console.warn('📄 OCR PDF417 detection failed:', error);
      return {
        raw_data: '',
        parsed_data: {},
        confidence: 0,
        validation_status: 'invalid'
      };
    }
  }

  /**
   * Detect and decode PDF417 barcode from image using ZXing library
   */
  private async detectPDF417WithZXing(imagePath: string): Promise<string | null> {
    if (!ZXing || !Jimp) {
      console.log('📄 ZXing or Jimp not available, skipping barcode detection');
      return null;
    }

    try {
      console.log('📄 Starting ZXing PDF417 barcode detection...');
      
      // Download and process image
      const imageBuffer = await this.storageService.downloadFile(imagePath);
      const image = await Jimp.read(imageBuffer);
      
      // Preprocess image for better barcode detection
      image
        .greyscale()
        .contrast(0.5)
        .normalize();
      
      // Convert to format needed by ZXing
      const { width, height } = image.bitmap;
      const imageData = new Uint8ClampedArray(image.bitmap.data);
      
      console.log(`📄 Scanning image ${width}x${height} for PDF417 barcode...`);
      
      // Try different ZXing readers
      const readers = [
        new ZXing.PDF417Reader(),
        new ZXing.MultiFormatReader()
      ];
      
      for (const reader of readers) {
        try {
          // Set up hints for better detection
          const hints = new Map();
          hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [ZXing.BarcodeFormat.PDF_417]);
          hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
          hints.set(ZXing.DecodeHintType.PURE_BARCODE, false);
          
          // Create luminance source - convert RGBA to grayscale
          const grayscaleData = new Uint8ClampedArray(width * height);
          for (let i = 0; i < grayscaleData.length; i++) {
            const pixelIndex = i * 4;
            // Convert RGBA to grayscale using standard formula
            grayscaleData[i] = Math.round(
              0.299 * imageData[pixelIndex] +     // R
              0.587 * imageData[pixelIndex + 1] + // G
              0.114 * imageData[pixelIndex + 2]   // B
            );
          }
          
          const luminanceSource = new ZXing.PlanarYUVLuminanceSource(
            grayscaleData, width, height, 0, 0, width, height, false
          );
          const binaryBitmap = new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(luminanceSource));
          
          const result = reader.decode(binaryBitmap, hints);
          
          if (result && result.getText()) {
            const decodedText = result.getText();
            console.log(`✅ PDF417 barcode decoded successfully with ${reader.constructor.name}!`, {
              length: decodedText.length,
              preview: decodedText.substring(0, 100) + '...'
            });
            
            return decodedText;
          }
          
        } catch (readerError) {
          console.log(`📄 ${reader.constructor.name} failed:`, readerError instanceof Error ? readerError.message : String(readerError));
        }
      }
      
      console.log('❌ No PDF417 barcode found in image with any reader');
      return null;
      
    } catch (error) {
      console.warn('📄 ZXing PDF417 detection failed:', error);
      return null;
    }
  }

  /**
   * Manually parse AAMVA field codes from PDF417 raw data
   * Fallback when parse-usdl library doesn't extract sufficient data
   */
  private parseAAMVAFieldCodes(rawData: string): any {
    const fields: any = {};
    
    try {
      console.log('📄 Manually parsing AAMVA field codes...');
      console.log(`🔍 Raw AAMVA data (first 200 chars): ${rawData.substring(0, 200)}`);
      
      // AAMVA field code mappings
      const aamvaFields = {
        'DAA': 'fullName',         // Full Name
        'DAC': 'firstName',        // First Name  
        'DAD': 'middleName',       // Middle Name
        'DCS': 'lastName',         // Last Name (Family Name)
        'DBB': 'dateOfBirth',      // Date of Birth
        'DBA': 'expirationDate',   // License Expiry Date
        'DBD': 'issueDate',        // License Issue Date
        'DAG': 'address',          // Street Address
        'DAI': 'city',             // City
        'DAJ': 'state',            // State
        'DAK': 'zipCode',          // ZIP Code
        'DAQ': 'licenseNumber',    // License Number (primary)
        'DCF': 'documentDiscriminator', // Document Discriminator
        'DBC': 'gender',           // Sex/Gender
        'DAY': 'eyeColor',         // Eye Color
        'DAU': 'height',           // Height
        'DCE': 'weight',           // Weight
        'DCA': 'vehicleClass',     // License Class
        'DCB': 'restrictions',     // Restrictions
        'DCD': 'endorsements'      // Endorsements
      };
      
      // Parse each AAMVA field from the raw data
      for (const [code, fieldName] of Object.entries(aamvaFields)) {
        // Look for pattern: CODE + data until next CODE or end
        // More flexible pattern to handle various field separators
        const regex = new RegExp(`${code}([^\\r\\n\\x1e]*?)(?=\\x1e|[A-Z]{3}|$)`, 'g');
        const match = regex.exec(rawData);
        
        if (match && match[1]) {
          let value = match[1].trim();
          
          // Clean and format specific fields
          switch (fieldName) {
            case 'dateOfBirth':
              // Handle different date formats: YYYYMMDD or MMDDYYYY
              if (value.length === 8) {
                if (value.substring(0, 4) > '1900') {
                  // YYYYMMDD format
                  value = `${value.substring(4, 6)}/${value.substring(6, 8)}/${value.substring(0, 4)}`;
                } else {
                  // MMDDYYYY format
                  value = `${value.substring(0, 2)}/${value.substring(2, 4)}/${value.substring(4, 8)}`;
                }
              }
              break;
              
            case 'expirationDate':
            case 'issueDate':
              // Similar date formatting
              if (value.length === 8) {
                if (value.substring(0, 4) > '1900') {
                  value = `${value.substring(4, 6)}/${value.substring(6, 8)}/${value.substring(0, 4)}`;
                } else {
                  value = `${value.substring(0, 2)}/${value.substring(2, 4)}/${value.substring(4, 8)}`;
                }
              }
              break;
              
            case 'height':
              // Convert height format if needed (inches to feet/inches)
              if (/^\d{3}$/.test(value)) {
                const totalInches = parseInt(value);
                const feet = Math.floor(totalInches / 12);
                const inches = totalInches % 12;
                value = `${feet}'-${inches.toString().padStart(2, '0')}"`;
              }
              break;
          }
          
          fields[fieldName] = value;
          console.log(`📄 AAMVA ${code} (${fieldName}): ${value}`);
        }
      }
      
      // Special fallback for license number (DAQ) - try multiple patterns
      if (!fields.licenseNumber) {
        console.log('🔍 License number not found with standard regex, trying fallback patterns...');
        
        // Try more aggressive patterns for DAQ
        const daqPatterns = [
          /DAQ([A-Z0-9\-]+)/i,           // Basic DAQ pattern
          /DAQ\s*([A-Z0-9\-]+)/i,       // With optional space
          /DAQ([^\r\n\x1e]+)/i,         // Until line break or separator
          /DAQ([^D][^A-Z]{0,20})/i      // Until next likely field code
        ];
        
        for (const pattern of daqPatterns) {
          const match = rawData.match(pattern);
          if (match && match[1]) {
            fields.licenseNumber = match[1].trim();
            console.log(`📄 Found license number with fallback pattern: ${fields.licenseNumber}`);
            break;
          }
        }
        
        if (!fields.licenseNumber) {
          console.log('🔍 Still no license number found, showing all DAQ occurrences in raw data:');
          const allDAQMatches = [...rawData.matchAll(/DAQ/gi)];
          allDAQMatches.forEach((match, i) => {
            const start = Math.max(0, match.index! - 10);
            const end = Math.min(rawData.length, match.index! + 30);
            const context = rawData.substring(start, end);
            console.log(`📄 DAQ occurrence ${i + 1}: "${context}"`);
          });
        }
      }
      
      console.log(`📄 Manual AAMVA parsing extracted ${Object.keys(fields).length} fields`);
      return fields;
      
    } catch (error) {
      console.error('📄 Manual AAMVA parsing failed:', error);
      return {};
    }
  }

  /**
   * Convert height from display format (5'-07") to AAMVA format (507)
   */
  private convertToAAMVAHeight(height: string): string {
    // Match patterns like "5'-07"", "5'7"", "5 ft 7 in"
    const feetInchesMatch = height.match(/(\d+)['']?[^0-9]*(\d+)/);
    if (feetInchesMatch) {
      const feet = feetInchesMatch[1];
      const inches = feetInchesMatch[2].padStart(2, '0');
      return feet + inches; // e.g., "5" + "07" = "507"
    }
    
    // If already in AAMVA format (507), return as-is
    if (/^\d{3}$/.test(height.trim())) {
      return height.trim();
    }
    
    // If just inches (67"), convert to AAMVA format
    const inchesMatch = height.match(/(\d+)/);
    if (inchesMatch) {
      const totalInches = parseInt(inchesMatch[1]);
      if (totalInches > 12) {
        const feet = Math.floor(totalInches / 12);
        const inches = (totalInches % 12).toString().padStart(2, '0');
        return feet + inches;
      }
    }
    
    return height; // Return original if can't parse
  }

  /**
   * Calculate similarity between two addresses for flexible matching
   */
  private calculateAddressSimilarity(addr1: string, addr2: string): number {
    // Split addresses into words and compare
    const words1 = addr1.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    const words2 = addr2.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    
    let matches = 0;
    const totalWords = Math.max(words1.length, words2.length);
    
    for (const word1 of words1) {
      for (const word2 of words2) {
        if (word1.includes(word2) || word2.includes(word1) || 
            this.levenshteinDistance(word1, word2) <= 2) {
          matches++;
          break;
        }
      }
    }
    
    return totalWords > 0 ? matches / totalWords : 0;
  }
  
  /**
   * Compare height formats (handle various formats like "5'-07"", "507", etc.)
   */
  private compareHeightFormats(height1: string, height2: string): boolean {
    const normalizeHeight = (h: string): number => {
      // Extract feet and inches, convert to total inches
      const feetInchesMatch = h.match(/(\d+)'[^0-9]*(\d+)/);
      if (feetInchesMatch) {
        return parseInt(feetInchesMatch[1]) * 12 + parseInt(feetInchesMatch[2]);
      }
      
      // Check if it's just inches (like "67" for 5'7")
      const inchesMatch = h.match(/(\d+)/);
      if (inchesMatch) {
        const inches = parseInt(inchesMatch[1]);
        if (inches > 12) return inches; // Assume total inches
        return inches * 12; // Assume feet only
      }
      
      return 0;
    };
    
    const inches1 = normalizeHeight(height1);
    const inches2 = normalizeHeight(height2);
    
    // Allow 1 inch difference for measurement variations
    return Math.abs(inches1 - inches2) <= 1;
  }
  
  /**
   * Calculate Levenshtein distance for string similarity
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));
    
    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;
    
    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,
          matrix[j - 1][i] + 1,
          matrix[j - 1][i - 1] + cost
        );
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  /**
   * Helper method to combine address components from PDF417 data
   */
  private combineAddress(pdf417Data: PDF417Data['parsed_data']): string | undefined {
    const addressParts = [
      pdf417Data.address,
      pdf417Data.city,
      pdf417Data.state,
      pdf417Data.zipCode
    ].filter(part => part && part.trim().length > 0);
    
    return addressParts.length > 0 ? addressParts.join(', ') : undefined;
  }

  private async scanWithLocalOCR(imagePath: string): Promise<BackOfIdData> {
    try {
      console.log('🔍 Starting local OCR for back-of-ID scanning...');
      
      // Check if required dependencies are available
      if (!Tesseract || !Jimp) {
        console.warn('🔍 Required OCR dependencies not available, using AI fallback');
        throw new Error('OCR dependencies not available in production environment');
      }
      
      // Download and preprocess image
      const imageBuffer = await this.storageService.downloadFile(imagePath);
      const processedBuffer = await this.preprocessImageForBackOfId(imageBuffer);
      
      // Create Tesseract worker optimized for back-of-ID scanning
      console.log('🔍 Creating OCR worker for back-of-ID...');
      const worker = await Tesseract.createWorker('eng', 1, {
        logger: (m: any) => {
          if (m.status === 'recognizing text') {
            console.log(`🔍 OCR Progress: ${Math.round(m.progress * 100)}%`);
          }
        }
      });
      
      // Configure Tesseract for optimal back-of-ID recognition
      await worker.setParameters({
        // Allow alphanumeric characters, common punctuation, and spaces
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,/- :()[]',
        // Auto page segmentation works better for back-of-ID with mixed content
        tessedit_pageseg_mode: Tesseract.PSM.AUTO,
        preserve_interword_spaces: '1',
        // Use both neural net and classic engine for better results
        tessedit_ocr_engine_mode: Tesseract.OEM.DEFAULT,
        // Improve character classification
        classify_enable_learning: '0',
        classify_enable_adaptive_matcher: '1',
        // Better handling of mixed content
        textord_really_old_xheight: '1',
        // Improve word finding
        textord_use_cjk_fp_model: '1'
      });
      
      // Perform OCR
      console.log('🔍 Performing OCR on back-of-ID...');
      const { data } = await worker.recognize(processedBuffer);
      await worker.terminate();
      
      console.log('🔍 OCR completed, extracting structured data...', {
        textLength: data.text.length,
        confidence: data.confidence,
        textPreview: data.text.substring(0, 150) + '...'
      });
      
      // Extract structured data from OCR text
      const structuredData = this.extractBackOfIdStructuredData(data.text);
      structuredData.raw_text = data.text;
      
      console.log('✅ Local OCR extraction completed:', {
        hasIdNumber: !!structuredData.parsed_data?.id_number,
        hasExpiryDate: !!structuredData.parsed_data?.expiry_date,
        hasAddress: !!structuredData.parsed_data?.address,
        hasIssuer: !!structuredData.parsed_data?.issuing_authority,
        verificationCodes: structuredData.verification_codes?.length || 0
      });
      
      return structuredData;
      
    } catch (error) {
      console.error('🔍 Local OCR scanning failed:', error);
      logger.error('Local OCR back-of-ID scanning failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      // Return minimal structure indicating failure
      return {
        parsed_data: {
          additional_info: { 
            error: 'Local OCR failed, using fallback',
            error_message: error instanceof Error ? error.message : 'Unknown error',
            scan_method: 'fallback'
          }
        },
        verification_codes: [],
        security_features: []
      };
    }
  }

  private async preprocessImageForBackOfId(imageBuffer: Buffer): Promise<Buffer> {
    try {
      console.log('🔧 Preprocessing image for back-of-ID OCR...');
      
      // Check if Jimp is available
      if (!Jimp) {
        console.warn('⚠️ Jimp not available, skipping preprocessing');
        return imageBuffer; // Return original image if Jimp not available
      }
      
      // Load and process image
      const image = await Jimp.read(imageBuffer);
      
      // More aggressive preprocessing for back-of-ID cards (they're often harder to read)
      const enhancedImage = image
        // Resize first to a good size for OCR (bigger is often better for back-of-ID)
        .resize(
          image.getWidth() < 1200 ? 1200 : Math.max(image.getWidth(), 1200), 
          Jimp.default.AUTO
        )
        // Convert to grayscale
        .greyscale()
        // Much higher contrast for back-of-ID cards
        .contrast(0.3)
        // Adjust brightness more aggressively  
        .brightness(0.1)
        // Normalize colors
        .normalize()
        // REMOVED: Edge detection and sharpening filters were destroying barcode patterns
      
      const enhancedBuffer = await enhancedImage.getBufferAsync(Jimp.default.MIME_PNG);
      
      console.log('✅ Image preprocessing completed', {
        originalSize: imageBuffer.length,
        processedSize: enhancedBuffer.length,
        dimensions: `${image.getWidth()}x${image.getHeight()}`
      });
      
      return enhancedBuffer;
      
    } catch (error) {
      console.warn('⚠️ Image preprocessing failed, using original:', error);
      return imageBuffer;
    }
  }

  private extractBackOfIdStructuredData(ocrText: string): BackOfIdData {
    console.log('🔧 Extracting structured data from OCR text...');
    
    // Clean the text
    const cleanText = ocrText.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
    console.log('🔧 Cleaned OCR text:', cleanText.substring(0, 200) + '...');
    
    const result: BackOfIdData = {
      parsed_data: {},
      verification_codes: [],
      security_features: []
    };
    
    // Extract ID/License Number - look for various patterns
    const idPatterns = [
      // Specific ID patterns first (more precise)
      /(?:ID|DL|LICENSE)\s*(?:NO|NUM|NUMBER|#)?\s*:?\s*([A-Z0-9\-\s]{6,20})/i,
      /([A-Z]{1,3}\s*\d{6,12})/g, // State format patterns with optional spaces
      /(\d{3}\s*\d{3}\s*\d{3,6})/g, // Three-part number patterns like "793 398 654"
      /([A-Z]\d{8,12})/g, // Letter followed by digits
      /(\d{8,15})/g, // Long numeric sequences
      /\b([A-Z0-9]{8,15})\b/g  // General alphanumeric IDs (last resort)
    ];
    
    for (const pattern of idPatterns) {
      const matches = cleanText.match(pattern);
      if (matches) {
        for (const match of matches) {
          const candidate = Array.isArray(match) ? match[1] : match;
          // Skip if it looks like a date, phone number, or common non-ID words
          const skipWords = ['ENDORSEMENTS', 'RESTRICTIONS', 'VETERAN', 'DONOR', 'CLASS', 'NONE'];
          const normalizedCandidate = candidate.toUpperCase().replace(/\s+/g, '');
          
          if (!candidate.match(/\d{2}[\/\-\.]\d{2}/) && 
              !candidate.match(/^\d{10}$/) && 
              !skipWords.some(word => normalizedCandidate.includes(word)) &&
              normalizedCandidate.length >= 6) {
            result.parsed_data!.id_number = normalizedCandidate;
            console.log('✅ ID Number found:', result.parsed_data!.id_number);
            break;
          }
        }
        if (result.parsed_data!.id_number) break;
      }
    }
    
    // Extract Expiry/Expiration Date
    const datePatterns = [
      /(?:EXP|EXPIRES?|EXPIRY|VALID UNTIL)\s*:?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i,
      /(\d{2}[\/\-\.]\d{2}[\/\-\.]\d{4})/g
    ];
    
    for (const pattern of datePatterns) {
      const matches = cleanText.match(pattern);
      if (matches) {
        for (const match of matches) {
          const dateStr = Array.isArray(match) ? match[1] : match;
          const date = this.parseDate(dateStr);
          // Only consider future dates as expiry dates
          if (date && date > new Date()) {
            result.parsed_data!.expiry_date = this.standardizeDateFormat(dateStr);
            console.log('✅ Expiry Date found:', result.parsed_data!.expiry_date);
            break;
          }
        }
        if (result.parsed_data!.expiry_date) break;
      }
    }
    
    // Extract Address - look for structured address patterns
    const addressPatterns = [
      /(?:ADDRESS|ADDR|ADD)\s*:?\s*([0-9].{20,80}(?:ST|STREET|AVE|AVENUE|RD|ROAD|DR|DRIVE|BLVD|BOULEVARD|WAY|LANE|CT|COURT)[^A-Z]{0,30}[A-Z]{2}\s+\d{5})/i,
      /(\d+\s+[A-Z\s]+(?:ST|STREET|AVE|AVENUE|RD|ROAD|DR|DRIVE|BLVD|BOULEVARD|WAY|LANE)\s+[A-Z\s]+,?\s*[A-Z]{2}\s+\d{5})/i
    ];
    
    for (const pattern of addressPatterns) {
      const match = cleanText.match(pattern);
      if (match && match[1] && match[1].length > 10) {
        result.parsed_data!.address = match[1].trim().replace(/\s+/g, ' ');
        console.log('✅ Address found:', result.parsed_data!.address);
        break;
      }
    }
    
    // Extract Issuing Authority
    const authorityPatterns = [
      /(?:ISSUED BY|ISSUER|AUTHORITY|DEPARTMENT OF|STATE OF)\s*:?\s*([A-Z\s]{5,50})/i,
      /([A-Z\s]*DEPARTMENT[A-Z\s]*)/i,
      /([A-Z\s]*DMV[A-Z\s]*)/i
    ];
    
    for (const pattern of authorityPatterns) {
      const match = cleanText.match(pattern);
      if (match && match[1] && match[1].length > 3) {
        result.parsed_data!.issuing_authority = match[1].trim().replace(/\s+/g, ' ');
        console.log('✅ Issuing Authority found:', result.parsed_data!.issuing_authority);
        break;
      }
    }
    
    // Extract verification codes (barcodes, magnetic stripe data, etc.)
    const codePatterns = [
      /\b([A-Z0-9]{15,})\b/g, // Long alphanumeric codes
      /\b(\d{12,})\b/g        // Long numeric codes
    ];
    
    const codes: string[] = [];
    for (const pattern of codePatterns) {
      const matches = cleanText.match(pattern);
      if (matches) {
        matches.forEach(code => {
          if (code !== result.parsed_data!.id_number && !codes.includes(code)) {
            codes.push(code);
          }
        });
      }
    }
    result.verification_codes = codes.slice(0, 3); // Limit to first 3 codes
    
    // Detect security features mentioned in text
    const securityKeywords = ['MAGNETIC', 'STRIPE', 'BARCODE', 'QR', 'HOLOGRAM', 'WATERMARK', 'SECURITY'];
    result.security_features = securityKeywords.filter(keyword => 
      cleanText.toUpperCase().includes(keyword)
    );
    
    console.log('🔧 Structured data extraction completed:', {
      hasIdNumber: !!result.parsed_data!.id_number,
      hasExpiry: !!result.parsed_data!.expiry_date,
      hasAddress: !!result.parsed_data!.address,
      hasAuthority: !!result.parsed_data!.issuing_authority,
      verificationCodes: result.verification_codes!.length,
      securityFeatures: result.security_features!.length
    });
    
    return result;
  }

  private parseDate(dateStr: string): Date | null {
    try {
      const cleaned = dateStr.replace(/[^\d\/\-\.]/g, '');
      const parts = cleaned.split(/[\/\-\.]/);
      
      if (parts.length !== 3) return null;
      
      let [part1, part2, part3] = parts.map(p => parseInt(p));
      
      // Handle 2-digit years
      if (part3 < 100) {
        part3 = part3 > 30 ? 1900 + part3 : 2000 + part3;
      }
      
      // Try MM/DD/YYYY first, then DD/MM/YYYY
      const date1 = new Date(part3, part1 - 1, part2);
      const date2 = new Date(part3, part2 - 1, part1);
      
      // Return the date that makes more sense (not invalid)
      if (!isNaN(date1.getTime()) && date1.getMonth() === part1 - 1) {
        return date1;
      } else if (!isNaN(date2.getTime()) && date2.getMonth() === part2 - 1) {
        return date2;
      }
      
      return null;
    } catch (error) {
      return null;
    }
  }

  private standardizeDateFormat(dateStr: string): string {
    const date = this.parseDate(dateStr);
    if (!date) return dateStr;
    
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const year = date.getFullYear().toString();
    
    return `${month}/${day}/${year}`;
  }

  private normalizeDateForComparison(dateStr: string): string {
    // Normalize date format for comparison (remove all non-digits)
    const date = this.parseDate(dateStr);
    if (!date) return dateStr.replace(/\D/g, ''); // fallback: remove all non-digits
    
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const year = date.getFullYear().toString();
    
    return `${year}${month}${day}`; // YYYYMMDD format for reliable comparison
  }

  async crossValidateWithFrontId(frontOcrData: any, backOfIdData: BackOfIdData): Promise<{
    match_score: number;
    requires_manual_review?: boolean;
    manual_review_reason?: string;
    validation_results: {
      id_number_match?: boolean;
      expiry_date_match?: boolean;
      issuing_authority_match?: boolean;
      name_match?: boolean;
      pdf417_validation?: 'valid' | 'invalid' | 'partial' | 'not_found';
      overall_consistency: boolean;
    };
    discrepancies: string[];
    pdf417_insights?: {
      data_quality: number;
      fields_matched: number;
      critical_data_present: boolean;
    };
  }> {
    const discrepancies: string[] = [];
    let matches = 0;
    let totalChecks = 0;
    
    console.log('🔄 Starting enhanced cross-validation with PDF417 support...');

    // Compare ID/Document numbers (normalize field names)
    const frontIdNumber = frontOcrData?.document_number || frontOcrData?.id_number;
    const backIdNumber = backOfIdData.parsed_data?.id_number;
    
    if (frontIdNumber && backIdNumber) {
      totalChecks++;
      // Normalize both numbers by removing spaces and comparing
      const frontIdNormalized = frontIdNumber.replace(/\s+/g, '');
      const backIdNormalized = backIdNumber.replace(/\s+/g, '');
      const idMatch = frontIdNormalized === backIdNormalized;
      if (idMatch) {
        matches++;
      } else {
        discrepancies.push(`ID number mismatch: front="${frontIdNumber}" vs back="${backIdNumber}"`);
      }
    }

    // Compare expiry dates (normalize field names)
    const frontExpiryDate = frontOcrData?.expiration_date || frontOcrData?.expiry_date;
    const backExpiryDate = backOfIdData.parsed_data?.expiry_date;
    
    if (frontExpiryDate && backExpiryDate) {
      totalChecks++;
      // Normalize date formats for comparison
      const frontDateNormalized = this.normalizeDateForComparison(frontExpiryDate);
      const backDateNormalized = this.normalizeDateForComparison(backExpiryDate);
      const expiryMatch = frontDateNormalized === backDateNormalized;
      if (expiryMatch) {
        matches++;
      } else {
        discrepancies.push(`Expiry date mismatch: front="${frontExpiryDate}" vs back="${backExpiryDate}"`);
      }
    }

    // Compare issuing authority with intelligent matching
    if (frontOcrData?.issuing_authority && backOfIdData.parsed_data?.issuing_authority) {
      totalChecks++;
      const authorityMatch = this.matchIssuingAuthorities(
        frontOcrData.issuing_authority, 
        backOfIdData.parsed_data.issuing_authority
      );
      if (authorityMatch) matches++;
      else discrepancies.push(`Issuing authority mismatch: front="${frontOcrData.issuing_authority}" vs back="${backOfIdData.parsed_data.issuing_authority}"`);
    }

    // PDF417-specific validation and cross-checking
    let pdf417Insights: any = undefined;
    let nameMatch: boolean | undefined = undefined;
    let pdf417Validation: 'valid' | 'invalid' | 'partial' | 'not_found' = 'not_found';
    
    if (backOfIdData.pdf417_data) {
      pdf417Validation = backOfIdData.pdf417_data.validation_status;
      const pdf417 = backOfIdData.pdf417_data.parsed_data;
      
      console.log('📄 Performing PDF417 cross-validation...', {
        pdf417_confidence: backOfIdData.pdf417_data.confidence,
        pdf417_status: pdf417Validation
      });
      
      let fieldsMatched = 0;
      let pdf417Checks = 0;
      
      // Compare names from front ID OCR with PDF417 data
      const frontFirstName = frontOcrData?.first_name || frontOcrData?.given_name;
      const frontLastName = frontOcrData?.last_name || frontOcrData?.family_name || frontOcrData?.surname;
      
      if ((frontFirstName || frontLastName) && (pdf417.firstName || pdf417.lastName)) {
        totalChecks++;
        pdf417Checks++;
        
        const firstNameMatch = !frontFirstName || !pdf417.firstName || 
          frontFirstName.toLowerCase().trim() === pdf417.firstName.toLowerCase().trim();
        const lastNameMatch = !frontLastName || !pdf417.lastName || 
          frontLastName.toLowerCase().trim() === pdf417.lastName.toLowerCase().trim();
        
        nameMatch = firstNameMatch && lastNameMatch;
        
        if (nameMatch) {
          matches++;
          fieldsMatched++;
        } else {
          discrepancies.push(
            `Name mismatch: front="${frontFirstName} ${frontLastName}" vs PDF417="${pdf417.firstName} ${pdf417.lastName}"`
          );
        }
      }
      
      // Cross-validate ID numbers (PDF417 vs front ID) - normalize formats
      if (frontIdNumber && pdf417.licenseNumber) {
        pdf417Checks++;
        const pdf417IdNormalized = pdf417.licenseNumber.replace(/\s+/g, '');
        const frontIdNormalized = frontIdNumber.replace(/\s+/g, '');
        
        console.log(`🔍 ID number comparison: front="${frontIdNumber}" -> "${frontIdNormalized}" vs PDF417="${pdf417.licenseNumber}" -> "${pdf417IdNormalized}"`);
        
        if (pdf417IdNormalized === frontIdNormalized) {
          fieldsMatched++;
          console.log('✅ PDF417 ID number matches front ID');
        } else {
          discrepancies.push(
            `PDF417 ID mismatch: front="${frontIdNumber}" (${frontIdNormalized}) vs PDF417="${pdf417.licenseNumber}" (${pdf417IdNormalized})`
          );
        }
      }
      
      // Cross-validate dates of birth (PDF417 vs front ID)
      const frontDOB = frontOcrData?.date_of_birth || frontOcrData?.dateOfBirth;
      if (frontDOB && pdf417.dateOfBirth) {
        pdf417Checks++;
        const frontDOBNormalized = this.normalizeDateForComparison(frontDOB);
        const pdf417DOBNormalized = this.normalizeDateForComparison(pdf417.dateOfBirth);
        
        if (frontDOBNormalized === pdf417DOBNormalized) {
          fieldsMatched++;
          console.log('✅ PDF417 date of birth matches front ID');
        } else {
          discrepancies.push(
            `PDF417 DOB mismatch: front="${frontDOB}" vs PDF417="${pdf417.dateOfBirth}"`
          );
        }
      }
      
      // Cross-validate addresses (PDF417 vs front ID)
      const frontAddress = frontOcrData?.address;
      const pdf417FullAddress = this.combineAddress(pdf417);
      if (frontAddress && pdf417FullAddress) {
        pdf417Checks++;
        const frontAddressNormalized = frontAddress.toLowerCase().replace(/[^\w\s]/g, '').trim();
        const pdf417AddressNormalized = pdf417FullAddress.toLowerCase().replace(/[^\w\s]/g, '').trim();
        
        // More flexible address matching (check if major components are present)
        const addressSimilarity = this.calculateAddressSimilarity(frontAddressNormalized, pdf417AddressNormalized);
        if (addressSimilarity > 0.7) {
          fieldsMatched++;
          console.log(`✅ PDF417 address similarity: ${(addressSimilarity * 100).toFixed(1)}%`);
        } else {
          discrepancies.push(
            `PDF417 address mismatch (similarity: ${(addressSimilarity * 100).toFixed(1)}%): front="${frontAddress}" vs PDF417="${pdf417FullAddress}"`
          );
        }
      }
      
      // Cross-validate gender/sex (PDF417 vs front ID)
      const frontGender = frontOcrData?.sex || frontOcrData?.gender;
      if (frontGender && pdf417.gender) {
        pdf417Checks++;
        const frontGenderNormalized = frontGender.toUpperCase().charAt(0);
        const pdf417GenderNormalized = pdf417.gender.toUpperCase().charAt(0);
        
        if (frontGenderNormalized === pdf417GenderNormalized) {
          fieldsMatched++;
          console.log('✅ PDF417 gender matches front ID');
        } else {
          discrepancies.push(
            `PDF417 gender mismatch: front="${frontGender}" vs PDF417="${pdf417.gender}"`
          );
        }
      }
      
      // Cross-validate height (PDF417 vs front ID) - normalize formats
      const frontHeight = frontOcrData?.height;
      if (frontHeight && pdf417.height) {
        pdf417Checks++;
        
        // Convert front height to AAMVA format for comparison
        const frontHeightAAMVA = this.convertToAAMVAHeight(frontHeight);
        const pdf417HeightAAMVA = pdf417.height;
        
        console.log(`🔍 Height comparison: front="${frontHeight}" -> AAMVA="${frontHeightAAMVA}" vs PDF417="${pdf417HeightAAMVA}"`);
        
        if (frontHeightAAMVA === pdf417HeightAAMVA) {
          fieldsMatched++;
          console.log('✅ PDF417 height matches front ID');
        } else {
          discrepancies.push(
            `PDF417 height mismatch: front="${frontHeight}" (${frontHeightAAMVA}) vs PDF417="${pdf417HeightAAMVA}"`
          );
        }
      }

      // Cross-validate expiry dates (PDF417 vs front ID)
      if (frontExpiryDate && pdf417.expirationDate) {
        pdf417Checks++;
        const pdf417DateNormalized = this.normalizeDateForComparison(pdf417.expirationDate);
        const frontDateNormalized = this.normalizeDateForComparison(frontExpiryDate);
        
        if (pdf417DateNormalized === frontDateNormalized) {
          fieldsMatched++;
          console.log('✅ PDF417 expiry date matches front ID');
        } else {
          discrepancies.push(
            `PDF417 expiry mismatch: front="${frontExpiryDate}" vs PDF417="${pdf417.expirationDate}"`
          );
        }
      }
      


      // Cross-validate eye color (AAMVA field DAY)
      const frontEyeColor = frontOcrData?.eye_color || frontOcrData?.eyeColor;
      if (frontEyeColor && pdf417.eyeColor) {
        pdf417Checks++;
        const frontEyeNormalized = frontEyeColor.toUpperCase().trim();
        const pdf417EyeNormalized = pdf417.eyeColor.toUpperCase().trim();

        if (frontEyeNormalized === pdf417EyeNormalized ||
            frontEyeNormalized.includes(pdf417EyeNormalized) ||
            pdf417EyeNormalized.includes(frontEyeNormalized)) {
          fieldsMatched++;
          console.log('✅ PDF417 eye color matches front ID');
        } else {
          discrepancies.push(
            `PDF417 eye color mismatch: front="${frontEyeColor}" vs PDF417="${pdf417.eyeColor}"`
          );
        }
      }

      // Cross-validate weight (AAMVA field DCE)
      const frontWeight = frontOcrData?.weight;
      if (frontWeight && pdf417.weight) {
        pdf417Checks++;
        // Normalize weight values (remove units, compare numbers)
        const frontWeightNum = parseInt(frontWeight.replace(/\D/g, ''));
        const pdf417WeightNum = parseInt(pdf417.weight.replace(/\D/g, ''));

        // Allow 5 pound difference for weight variations
        if (Math.abs(frontWeightNum - pdf417WeightNum) <= 5) {
          fieldsMatched++;
          console.log('✅ PDF417 weight matches front ID (within tolerance)');
        } else {
          discrepancies.push(
            `PDF417 weight mismatch: front="${frontWeight}" vs PDF417="${pdf417.weight}"`
          );
        }
      }

      // Cross-validate middle name (AAMVA field DAD)
      const frontMiddleName = frontOcrData?.middle_name || frontOcrData?.middleName;
      if (frontMiddleName && pdf417.middleName) {
        pdf417Checks++;
        const frontMiddleNormalized = frontMiddleName.toLowerCase().trim();
        const pdf417MiddleNormalized = pdf417.middleName.toLowerCase().trim();

        // Allow partial matching for middle names (initials vs full name)
        if (frontMiddleNormalized === pdf417MiddleNormalized ||
            frontMiddleNormalized.charAt(0) === pdf417MiddleNormalized.charAt(0) ||
            frontMiddleNormalized.includes(pdf417MiddleNormalized) ||
            pdf417MiddleNormalized.includes(frontMiddleNormalized)) {
          fieldsMatched++;
          console.log('✅ PDF417 middle name matches front ID');
        } else {
          discrepancies.push(
            `PDF417 middle name mismatch: front="${frontMiddleName}" vs PDF417="${pdf417.middleName}"`
          );
        }
      }

      // Cross-validate vehicle class (AAMVA field DCA)
      const frontVehicleClass = frontOcrData?.vehicle_class || frontOcrData?.class;
      if (frontVehicleClass && pdf417.vehicleClass) {
        pdf417Checks++;
        const frontClassNormalized = frontVehicleClass.toUpperCase().trim();
        const pdf417ClassNormalized = pdf417.vehicleClass.toUpperCase().trim();

        if (frontClassNormalized === pdf417ClassNormalized) {
          fieldsMatched++;
          console.log('✅ PDF417 vehicle class matches front ID');
        } else {
          discrepancies.push(
            `PDF417 vehicle class mismatch: front="${frontVehicleClass}" vs PDF417="${pdf417.vehicleClass}"`
          );
        }
      }

      // Cross-validate document discriminator (AAMVA field DCF) - unique identifier
      const frontDocDiscriminator = frontOcrData?.document_discriminator || frontOcrData?.discriminator;
      if (frontDocDiscriminator && pdf417.documentDiscriminator) {
        pdf417Checks++;
        if (frontDocDiscriminator === pdf417.documentDiscriminator) {
          fieldsMatched++;
          console.log('✅ PDF417 document discriminator matches front ID - high confidence match');
        } else {
          discrepancies.push(
            `PDF417 document discriminator mismatch: front="${frontDocDiscriminator}" vs PDF417="${pdf417.documentDiscriminator}"`
          );
        }
      }      // Cross-validate issuing state/authority
      if (frontOcrData?.issuing_authority && pdf417.state) {
        pdf417Checks++;
        if (this.matchIssuingAuthorities(frontOcrData.issuing_authority, pdf417.state)) {
          fieldsMatched++;
          console.log('✅ PDF417 state matches front ID issuing authority');
        } else {
          discrepancies.push(
            `PDF417 state mismatch: front authority="${frontOcrData.issuing_authority}" vs PDF417 state="${pdf417.state}"`
          );
        }
      }
      
      // Assess PDF417 data quality
      const criticalFields = ['firstName', 'lastName', 'licenseNumber', 'dateOfBirth', 'expirationDate'];
      const presentCriticalFields = criticalFields.filter(field => {
        const value = (pdf417 as any)[field];
        return value && value.toString().trim().length > 0;
      }).length;
      
      pdf417Insights = {
        data_quality: backOfIdData.pdf417_data.confidence,
        fields_matched: fieldsMatched,
        critical_data_present: presentCriticalFields >= 4, // At least 4 out of 5 critical fields
        total_pdf417_checks: pdf417Checks,
        present_critical_fields: presentCriticalFields,
        pdf417_validation_status: pdf417Validation
      };
      
      console.log('📄 PDF417 validation completed:', pdf417Insights);
    }

    // Proper handling for data extraction failures using centralized thresholds
    // If no data can be compared (totalChecks = 0), this indicates extraction issues
    // that require manual admin review, not automatic approval
    let matchScore: number;
    let requiresManualReview = false;
    let manualReviewReason: string | undefined;
    
    if (totalChecks === 0) {
      console.log('⚠️  No comparable data fields found between front OCR and back PDF417');
      console.log('   📋 This indicates OCR/PDF417 extraction issues - routing to MANUAL REVIEW');
      console.log('   👥 Admin will need to verify documents manually for approval');
      
      matchScore = 0.6; // Below verification threshold but above complete failure
      requiresManualReview = true;
      manualReviewReason = 'Data extraction failed - unable to compare front OCR with back PDF417 data. Admin review required.';
    } else {
      matchScore = matches / totalChecks;
    }

    // If PDF417 extraction is partial and too little critical data was extracted,
    // avoid treating this as fraud. Route to manual review.
    if (
      !requiresManualReview &&
      pdf417Validation === 'partial' &&
      pdf417Insights &&
      !pdf417Insights.critical_data_present &&
      (pdf417Insights.present_critical_fields ?? 0) <= 1
    ) {
      requiresManualReview = true;
      manualReviewReason = 'Back-of-ID barcode extraction is partial and insufficient for reliable automated comparison.';
      matchScore = Math.max(matchScore || 0, 0.6);
    }
    
    const crossValidationThreshold = VERIFICATION_THRESHOLDS.CROSS_VALIDATION;
    const overallConsistency = matchScore >= crossValidationThreshold && discrepancies.length === 0 && !requiresManualReview;

    // Log cross-validation analysis with centralized thresholds
    logger.info('Cross-validation completed', {
      matchScore,
      totalChecks,
      matches,
      discrepancies: discrepancies.length,
      overallConsistency,
      threshold: crossValidationThreshold,
      requiresManualReview,
      pdf417Validation
    });

    return {
      match_score: matchScore,
      requires_manual_review: requiresManualReview,
      manual_review_reason: manualReviewReason,
      validation_results: {
        id_number_match: frontOcrData?.id_number && backOfIdData.parsed_data?.id_number ? 
          frontOcrData.id_number === backOfIdData.parsed_data.id_number : undefined,
        expiry_date_match: frontOcrData?.expiry_date && backOfIdData.parsed_data?.expiry_date ?
          frontOcrData.expiry_date === backOfIdData.parsed_data.expiry_date : undefined,
        issuing_authority_match: frontOcrData?.issuing_authority && backOfIdData.parsed_data?.issuing_authority ?
          this.matchIssuingAuthorities(frontOcrData.issuing_authority, backOfIdData.parsed_data.issuing_authority) : undefined,
        name_match: nameMatch,
        pdf417_validation: pdf417Validation,
        overall_consistency: overallConsistency
      },
      discrepancies,
      pdf417_insights: pdf417Insights
    };
  }

  private matchIssuingAuthorities(authority1: string, authority2: string): boolean {
    // Normalize both authorities to lowercase for comparison
    const auth1 = authority1.toLowerCase().trim();
    const auth2 = authority2.toLowerCase().trim();
    
    // Direct match
    if (auth1 === auth2) return true;
    
    // Authority mapping for known equivalents
    const authorityMappings = {
      'new york state': ['ny', 'new york', 'nys', 'dmv.ny.gov', 'new york dmv'],
      'california': ['ca', 'calif', 'dmv.ca.gov', 'california dmv'],
      'florida': ['fl', 'fla', 'flhsmv.gov', 'florida dmv'],
      'texas': ['tx', 'tex', 'txdmv.gov', 'texas dmv'],
      'illinois': ['il', 'ill', 'cyberdriveillinois.com', 'illinois dmv'],
      'pennsylvania': ['pa', 'penn', 'dmv.pa.gov', 'pennsylvania dmv'],
      'ohio': ['oh', 'bmv.ohio.gov', 'ohio dmv'],
      'georgia': ['ga', 'dds.georgia.gov', 'georgia dmv'],
      'north carolina': ['nc', 'ncdot.gov', 'north carolina dmv'],
      'michigan': ['mi', 'michigan.gov/sos', 'michigan dmv']
    };
    
    // Check if either authority matches any mapping
    for (const [canonical, variants] of Object.entries(authorityMappings)) {
      const allVariants = [canonical, ...variants];
      
      // Check if both authorities map to the same canonical authority
      const auth1Matches = allVariants.some(variant => 
        auth1.includes(variant) || variant.includes(auth1)
      );
      const auth2Matches = allVariants.some(variant => 
        auth2.includes(variant) || variant.includes(auth2)
      );
      
      if (auth1Matches && auth2Matches) {
        console.log(`🔄 Authority match found: "${authority1}" ↔ "${authority2}" (both map to ${canonical})`);
        return true;
      }
    }
    
    // Fallback: check if either authority contains the other
    if (auth1.includes(auth2) || auth2.includes(auth1)) {
      console.log(`🔄 Authority partial match: "${authority1}" ↔ "${authority2}"`);
      return true;
    }
    
    console.log(`❌ No authority match: "${authority1}" vs "${authority2}"`);
    return false;
  }

  // Health check for barcode service
  async healthCheck(): Promise<{
    status: string;
    error?: string;
  }> {
    try {
      return { status: 'healthy' };
    } catch (error) {
      return {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}
