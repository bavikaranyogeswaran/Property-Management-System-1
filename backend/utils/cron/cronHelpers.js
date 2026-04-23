// ============================================================================
//  CRON HELPERS (Shared Utilities for Cron Domain Modules)
// ============================================================================
//  Contains infrastructure-level helpers used across all cron domain files:
//  - logCronExecution: Persists job run status to cron_checkpoints table
//  - extractPublicId: Extracts Cloudinary public_id from a CDN URL
//  - Cloudinary SDK configuration
// ============================================================================

import db from '../db.js';
import { v2 as cloudinary } from 'cloudinary';
import { extractPublicId } from '../cloudinaryUtils.js';

// Configure Cloudinary for background cleanup operations
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export { cloudinary, extractPublicId };

// [B5 FIX] Write checkpoint to cron_checkpoints table (UPSERT — one row per job)
export const logCronExecution = async (
  jobName,
  executionDate,
  status,
  message = null
) => {
  try {
    await db.query(
      `INSERT INTO cron_checkpoints (job_name, last_success_date, status, message) 
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE last_success_date = VALUES(last_success_date), status = VALUES(status), message = VALUES(message)`,
      [jobName, executionDate, status, message]
    );
  } catch (err) {
    console.error('[Cron] Failed to write checkpoint:', err);
  }
};
