import { OCRProvider } from '../types.js';
import { OCRData } from '@/types/index.js';
import { logger } from '@/utils/logger.js';

export class OpenAIProvider implements OCRProvider {
  readonly name = 'openai';

  async processDocument(buffer: Buffer, documentType: string, _issuingCountry?: string): Promise<OCRData> {
    const base64Image = buffer.toString('base64');
    const mimeType = this.detectMimeType(buffer);
    const prompt = this.buildPrompt(documentType);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              {
                type: 'image_url',
                image_url: { url: `data:${mimeType};base64,${base64Image}`, detail: 'high' },
              },
            ],
          },
        ],
        max_tokens: 1000,
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`OpenAI API error: ${JSON.stringify(error)}`);
    }

    const result = await response.json();
    const extractedText = result.choices[0].message.content;
    return this.parseResponse(extractedText, documentType);
  }

  private buildPrompt(documentType: string): string {
    return `Extract ALL text and data from this ${documentType} document.

Please provide the response in JSON format with the following structure:
{
  "raw_text": "all visible text exactly as it appears",
  "name": "full legal name",
  "document_number": "ID/license number",
  "date_of_birth": "MM/DD/YYYY format",
  "expiration_date": "MM/DD/YYYY format",
  "address": "full address if present",
  "sex": "M/F if present",
  "height": "height if present",
  "eye_color": "eye color if present",
  "issuing_authority": "issuing state/authority if present"
}

Important:
- Extract EXACTLY what you see - don't correct misspellings or formatting
- If a field is not present or unclear, use null
- For dates, convert to MM/DD/YYYY format if possible
- Be very careful with numbers and dates - accuracy is critical
- Include ALL text you can see in the raw_text field`;
  }

  private parseResponse(aiResponse: string, _documentType: string): OCRData {
    try {
      let cleaned = aiResponse.trim()
        .replace(/^```json\n?/, '')
        .replace(/^```\n?/, '')
        .replace(/```$/, '');

      const parsed = JSON.parse(cleaned);
      const ocrData: OCRData = {
        raw_text: parsed.raw_text || aiResponse,
        confidence_scores: {},
      };

      const fields = ['name', 'document_number', 'date_of_birth', 'expiration_date',
        'address', 'sex', 'height', 'eye_color', 'issuing_authority'];

      for (const field of fields) {
        if (parsed[field] != null && parsed[field] !== '') {
          (ocrData as any)[field] = parsed[field];
          ocrData.confidence_scores![field] = 0.92;
        }
      }

      return ocrData;
    } catch (error) {
      logger.warn('OpenAIProvider: failed to parse JSON response, returning raw text', {
        error: error instanceof Error ? error.message : 'Unknown',
      });
      return { raw_text: aiResponse, confidence_scores: {} };
    }
  }

  private detectMimeType(buffer: Buffer): string {
    if (buffer[0] === 0xFF && buffer[1] === 0xD8) return 'image/jpeg';
    if (buffer[0] === 0x89 && buffer[1] === 0x50) return 'image/png';
    if (buffer[0] === 0x52 && buffer[1] === 0x49) return 'image/webp';
    return 'image/jpeg';
  }
}
