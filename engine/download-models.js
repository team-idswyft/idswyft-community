#!/usr/bin/env node

/**
 * Download Face Recognition Models
 * Downloads pre-trained models for @vladmandic/face-api
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const modelsDir = path.join(__dirname, 'models');
const baseUrl = 'https://raw.githubusercontent.com/vladmandic/face-api/master/model';

/**
 * Validate an ONNX file by checking header bytes.
 * ONNX protobuf starts with 0x08 (varint field 1), not HTML (<) or empty.
 */
function isValidOnnx(filePath) {
  try {
    const stat = fs.statSync(filePath);
    if (stat.size < 1024) return false; // Too small to be a real model
    const buf = Buffer.alloc(4);
    const fd = fs.openSync(filePath, 'r');
    fs.readSync(fd, buf, 0, 4, 0);
    fs.closeSync(fd);
    // ONNX files start with protobuf varint (0x08), not HTML (0x3C '<') or text
    return buf[0] === 0x08;
  } catch {
    return false;
  }
}

// List of required model files (corrected names)
const modelFiles = [
  // SSD MobileNet v1 (face detection)
  'ssd_mobilenetv1_model-weights_manifest.json',
  'ssd_mobilenetv1_model.bin',
  
  // Face Landmark 68 Point Model
  'face_landmark_68_model-weights_manifest.json',
  'face_landmark_68_model.bin',
  
  // Face Recognition Model
  'face_recognition_model-weights_manifest.json',
  'face_recognition_model.bin',
  
  // Face Expression Model
  'face_expression_model-weights_manifest.json',
  'face_expression_model.bin',
  
  // Age Gender Model
  'age_gender_model-weights_manifest.json',
  'age_gender_model.bin'
];

/**
 * Download a file from URL to local path.
 * For GitHub private repo release assets, set GITHUB_TOKEN env var.
 */
function downloadFile(url, filePath, redirects = 0, headers = {}) {
  return new Promise((resolve, reject) => {
    if (redirects === 0) console.log(`📥 Downloading: ${path.basename(filePath)}`);
    if (redirects > 5) { reject(new Error('Too many redirects')); return; }

    const file = fs.createWriteStream(filePath);
    const parsed = new URL(url);
    const reqHeaders = { ...headers };

    // GitHub private release assets need token auth + octet-stream accept
    const ghToken = process.env.GITHUB_TOKEN;
    if (ghToken && redirects === 0 && parsed.hostname === 'github.com' && url.includes('/releases/download/')) {
      // Use GitHub API URL for authenticated asset downloads
      const match = url.match(/github\.com\/([^/]+)\/([^/]+)\/releases\/download\/([^/]+)\/(.+)/);
      if (match) {
        const [, owner, repo, tag, assetName] = match;
        console.log(`   🔑 Using GITHUB_TOKEN for private release asset`);
        // Resolve asset ID via API, then download with Accept: application/octet-stream
        return downloadGitHubReleaseAsset(owner, repo, tag, assetName, filePath, ghToken)
          .then(resolve, reject);
      }
    }

    https.get(url, { headers: reqHeaders }, (response) => {
      // Follow redirects (GitHub releases return 302)
      if ([301, 302, 307, 308].includes(response.statusCode) && response.headers.location) {
        file.close();
        fs.unlink(filePath, () => {});
        return downloadFile(response.headers.location, filePath, redirects + 1).then(resolve, reject);
      }

      if (response.statusCode !== 200) {
        file.close();
        fs.unlink(filePath, () => {});
        reject(new Error(`Failed to download ${url}: ${response.statusCode}`));
        return;
      }

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        console.log(`✅ Downloaded: ${path.basename(filePath)}`);
        resolve();
      });

    }).on('error', (error) => {
      fs.unlink(filePath, () => {}); // Delete partial file
      reject(error);
    });
  });
}

/**
 * Download a release asset from a private GitHub repo using the API.
 * 1. GET /repos/:owner/:repo/releases/tags/:tag → find asset by name
 * 2. GET /repos/:owner/:repo/releases/assets/:id with Accept: application/octet-stream
 */
function downloadGitHubReleaseAsset(owner, repo, tag, assetName, filePath, token) {
  return new Promise((resolve, reject) => {
    // Step 1: Get release metadata to find asset ID
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/releases/tags/${tag}`;
    https.get(apiUrl, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'idswyft-model-downloader',
      },
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`GitHub API error (${res.statusCode}): ${body.slice(0, 200)}`));
          return;
        }
        try {
          const release = JSON.parse(body);
          const asset = release.assets?.find(a => a.name === assetName);
          if (!asset) {
            reject(new Error(`Asset "${assetName}" not found in release ${tag}`));
            return;
          }
          // Step 2: Download the asset binary
          const assetUrl = `https://api.github.com/repos/${owner}/${repo}/releases/assets/${asset.id}`;
          downloadAssetBinary(assetUrl, filePath, token, asset.size).then(resolve, reject);
        } catch (e) {
          reject(new Error(`Failed to parse release metadata: ${e.message}`));
        }
      });
    }).on('error', reject);
  });
}

function downloadAssetBinary(assetUrl, filePath, token, expectedSize) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filePath);

    function doGet(url, depth = 0) {
      if (depth > 5) { reject(new Error('Too many redirects')); return; }
      const parsed = new URL(url);
      const headers = {
        'User-Agent': 'idswyft-model-downloader',
        'Accept': 'application/octet-stream',
      };
      // Only send auth to api.github.com (not to S3 redirect targets)
      if (parsed.hostname === 'api.github.com') {
        headers['Authorization'] = `Bearer ${token}`;
      }
      https.get(url, { headers }, (res) => {
        if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
          return doGet(res.headers.location, depth + 1);
        }
        if (res.statusCode !== 200) {
          file.close();
          fs.unlink(filePath, () => {});
          reject(new Error(`Asset download failed: ${res.statusCode}`));
          return;
        }
        res.pipe(file);
        file.on('finish', () => {
          file.close();
          // Validate downloaded file size
          const stat = fs.statSync(filePath);
          if (expectedSize && stat.size !== expectedSize) {
            fs.unlink(filePath, () => {});
            reject(new Error(`Size mismatch: expected ${expectedSize} bytes, got ${stat.size}`));
            return;
          }
          console.log(`✅ Downloaded: ${path.basename(filePath)} (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);
          resolve();
        });
      }).on('error', (err) => {
        fs.unlink(filePath, () => {});
        reject(err);
      });
    }

    doGet(assetUrl);
  });
}

// Deepfake detector model (optional — system works without it)
const deepfakeModel = {
  fileName: 'deepfake-detector.onnx',
  url: process.env.DEEPFAKE_MODEL_URL ||
    'https://github.com/team-idswyft/idswyft/releases/download/models-v1.0.0/deepfake-detector.onnx',
};

// Voice authentication models (optional — only needed when voice auth is enabled)
const voiceModels = {
  speaker: {
    fileName: 'wespeaker_en_voxceleb_CAM++_LM.onnx',
    url: process.env.VOICE_SPEAKER_MODEL_URL ||
      'https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/wespeaker_en_voxceleb_CAM++_LM.onnx',
  },
  asr: {
    archiveName: 'sherpa-onnx-whisper-tiny.en.tar.bz2',
    dirName: 'sherpa-onnx-whisper-tiny.en',
    url: process.env.VOICE_ASR_MODEL_URL ||
      'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-whisper-tiny.en.tar.bz2',
    // Files expected after extraction:
    expectedFiles: [
      'tiny.en-encoder.int8.onnx',
      'tiny.en-decoder.int8.onnx',
      'tiny.en-tokens.txt',
    ],
  },
};

/**
 * Download a tar.bz2 archive and extract it to the target directory.
 * Falls back gracefully if tar is not available (Windows dev environments).
 */
async function downloadAndExtract(url, targetDir, archiveName) {
  const archivePath = path.join(targetDir, archiveName);
  await downloadFile(url, archivePath);
  try {
    execSync(`tar xjf "${archivePath}" -C "${targetDir}"`, { stdio: 'pipe' });
    fs.unlinkSync(archivePath);
  } catch (err) {
    // Clean up archive on failure
    if (fs.existsSync(archivePath)) fs.unlinkSync(archivePath);
    throw new Error(`tar extraction failed: ${err.message}. Install bzip2/tar or download models manually.`);
  }
}

/**
 * Main download function
 */
async function downloadModels() {
  console.log('🎯 Face Recognition Model Downloader');
  console.log('====================================\n');
  
  // Create models directory if it doesn't exist
  if (!fs.existsSync(modelsDir)) {
    fs.mkdirSync(modelsDir, { recursive: true });
    console.log(`📁 Created models directory: ${modelsDir}\n`);
  } else {
    console.log(`📁 Using models directory: ${modelsDir}\n`);
  }
  
  let downloaded = 0;
  let skipped = 0;
  let failed = 0;
  
  // Download each model file
  for (const fileName of modelFiles) {
    const filePath = path.join(modelsDir, fileName);
    const url = `${baseUrl}/${fileName}`;
    
    // Skip if file already exists
    if (fs.existsSync(filePath)) {
      console.log(`⏭️  Skipped: ${fileName} (already exists)`);
      skipped++;
      continue;
    }
    
    try {
      await downloadFile(url, filePath);
      downloaded++;
      
      // Add small delay to be nice to the server
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } catch (error) {
      console.error(`❌ Failed to download ${fileName}:`, error.message);
      failed++;
    }
  }
  
  // Attempt to download deepfake detector model (optional)
  // Stored in shared/models/ — matches OnnxDeepfakeDetector's path resolution
  const sharedModelsDir = path.join(__dirname, '..', 'shared', 'models');
  if (!fs.existsSync(sharedModelsDir)) {
    fs.mkdirSync(sharedModelsDir, { recursive: true });
  }
  const deepfakePath = path.join(sharedModelsDir, deepfakeModel.fileName);
  if (fs.existsSync(deepfakePath) && isValidOnnx(deepfakePath)) {
    console.log(`⏭️  Skipped: ${deepfakeModel.fileName} (already exists, valid ONNX)`);
    skipped++;
  } else {
    // Remove corrupt/placeholder file if it exists
    if (fs.existsSync(deepfakePath)) {
      console.log(`⚠️  Removing invalid ${deepfakeModel.fileName} — re-downloading`);
      fs.unlinkSync(deepfakePath);
    }
    if (deepfakeModel.url) {
      try {
        await downloadFile(deepfakeModel.url, deepfakePath);
        if (!isValidOnnx(deepfakePath)) {
          fs.unlinkSync(deepfakePath);
          throw new Error('Downloaded file is not a valid ONNX model (bad magic bytes)');
        }
        downloaded++;
      } catch (error) {
        console.log(`⏭️  Skipped: ${deepfakeModel.fileName} (optional — ${error.message})`);
      }
    } else {
      console.log(`⏭️  Skipped: ${deepfakeModel.fileName} (optional — no DEEPFAKE_MODEL_URL set)`);
    }
  }

  // ─── Voice Authentication Models (optional) ──────────────────────
  const voiceModelsDir = path.join(modelsDir, 'voice');
  if (!fs.existsSync(voiceModelsDir)) {
    fs.mkdirSync(voiceModelsDir, { recursive: true });
  }

  // Speaker embedding model (single ONNX file, ~28MB)
  const speakerPath = path.join(voiceModelsDir, voiceModels.speaker.fileName);
  if (fs.existsSync(speakerPath) && isValidOnnx(speakerPath)) {
    console.log(`⏭️  Skipped: ${voiceModels.speaker.fileName} (already exists, valid ONNX)`);
    skipped++;
  } else {
    if (fs.existsSync(speakerPath)) fs.unlinkSync(speakerPath);
    try {
      await downloadFile(voiceModels.speaker.url, speakerPath);
      if (!isValidOnnx(speakerPath)) {
        fs.unlinkSync(speakerPath);
        throw new Error('Downloaded file is not a valid ONNX model');
      }
      downloaded++;
    } catch (error) {
      console.log(`⏭️  Skipped: ${voiceModels.speaker.fileName} (optional — ${error.message})`);
    }
  }

  // ASR model (Whisper tiny.en — tar.bz2 archive, ~40MB)
  const asrDir = path.join(voiceModelsDir, voiceModels.asr.dirName);
  const asrReady = voiceModels.asr.expectedFiles.every(
    f => fs.existsSync(path.join(asrDir, f))
  );
  if (asrReady) {
    console.log(`⏭️  Skipped: ${voiceModels.asr.dirName} (already exists)`);
    skipped++;
  } else {
    try {
      await downloadAndExtract(voiceModels.asr.url, voiceModelsDir, voiceModels.asr.archiveName);
      downloaded++;
    } catch (error) {
      console.log(`⏭️  Skipped: ${voiceModels.asr.dirName} (optional — ${error.message})`);
    }
  }

  console.log('\n📊 Download Summary:');
  console.log(`✅ Downloaded: ${downloaded} files`);
  console.log(`⏭️  Skipped: ${skipped} files`);
  console.log(`❌ Failed: ${failed} files`);

  if (failed > 0) {
    console.log('\n⚠️  Some downloads failed. You may need to retry or download manually.');
    process.exit(1);
  } else {
    console.log('\n🎉 All models downloaded successfully!');
    console.log('\n📋 Model files ready:');
    console.log('   • Face Detection (SSD MobileNet v1)');
    console.log('   • 68-Point Facial Landmarks');
    console.log('   • Face Recognition Embeddings');
    console.log('   • Facial Expression Recognition');
    console.log('   • Age & Gender Estimation');
    if (fs.existsSync(speakerPath)) console.log('   • Speaker Embedding (wespeaker CAM++)');
    if (asrReady || fs.existsSync(asrDir)) console.log('   • Speech Recognition (Whisper tiny.en)');

    console.log('\n🚀 You can now use the modern face recognition service!');
  }
}

// Check if running directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  downloadModels().catch(console.error);
}

export { downloadModels };