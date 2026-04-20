import { v2 as cloudinary } from 'cloudinary';
import { mainQueue } from '../config/queue.js';
import logger from '../utils/logger.js';
import { config } from '../config/config.js';

// Configure Cloudinary (v2)
cloudinary.config({
  cloud_name: config.cloudinary.cloudName,
  api_key: config.cloudinary.apiKey,
  api_secret: config.cloudinary.apiSecret,
});

/**
 * Cleanup Assets from a Request
 * Automatically identifies and deletes files uploaded via Multer-Cloudinary
 * if the request ended in a failure.
 */
// CLEANUP ASSETS: Automatically identifies and deletes orphaned files uploaded via Multer-Cloudinary if a request fails.
export const cleanupRequestAssets = async (req) => {
  try {
    const assetsToDelete = [];

    // 1. Single File Collection (req.file)
    if (req.file?.url) assetsToDelete.push(req.file.filename);

    // 2. Multiple Files Collection (req.files)
    if (req.files) {
      if (Array.isArray(req.files))
        req.files.forEach((file) => assetsToDelete.push(file.filename));
      else
        Object.values(req.files).forEach((fieldArray) =>
          fieldArray.forEach((file) => assetsToDelete.push(file.filename))
        );
    }

    if (assetsToDelete.length === 0) return;

    logger.info(
      `[Asset Cleanup] Enqueueing ${assetsToDelete.length} orphaned assets for removal.`,
      { path: req.originalUrl, public_ids: assetsToDelete }
    );

    // 3. [SIDE EFFECT] Asynchronous Removal: Enqueue each publicId to the background task queue for reliable Cloudinary deletion
    await Promise.all(
      assetsToDelete.map((publicId) =>
        mainQueue.add(
          'cleanup_cloudinary_asset_task',
          { publicId },
          { retryLimit: 5, backoff: { type: 'exponential', delay: 10000 } }
        )
      )
    );
  } catch (error) {
    logger.error(
      '[Asset Cleanup] Critical failure in cleanup logic:',
      error.message
    );
  }
};

export default {
  cleanupRequestAssets,
};
