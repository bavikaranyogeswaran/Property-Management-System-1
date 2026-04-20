// ============================================================================
//  IMAGE CONTROLLER (The Photo Album)
// ============================================================================
//  This file handles uploading and deleting photos for properties and units.
//  It manages the Cloudinary integration and tracks "primary" hero images.
// ============================================================================

import propertyImageModel from '../models/propertyImageModel.js';
import propertyModel from '../models/propertyModel.js';
import unitModel from '../models/unitModel.js';
import unitImageModel from '../models/unitImageModel.js';
import { v2 as cloudinary } from 'cloudinary';

import { config } from '../config/config.js';
import logger from '../utils/logger.js';
import catchAsync from '../utils/catchAsync.js';
import AppError from '../utils/AppError.js';

// Configure Cloudinary for deletion (pattern matching upload.js)
cloudinary.config({
  cloud_name: config.cloudinary.cloudName,
  api_key: config.cloudinary.apiKey,
  api_secret: config.cloudinary.apiSecret,
});

// Helper to extract Cloudinary public_id from URL
const extractPublicId = (url) => {
  if (!url || !url.includes('cloudinary.com')) return null;
  // URL format: .../upload/v12345/pms_uploads/filename.ext
  const parts = url.split('/');
  const uploadIndex = parts.indexOf('upload');
  if (uploadIndex === -1) return null;

  // Public ID starts after the version (v12345)
  // Everything after upload/v... until the last dot
  const publicIdWithExt = parts.slice(uploadIndex + 2).join('/');
  return publicIdWithExt.split('.')[0];
};

class ImageController {
  // General File Upload
  uploadGeneralFile = catchAsync(async (req, res, next) => {
    // 1. [VALIDATION] Verify multpart payload contains a file
    if (!req.file) return next(new AppError('No file uploaded', 400));

    // 2. [RESPONSE] Dispatch the Cloudinary URL
    res.status(201).json({ url: req.file.url });
  });

  // Property Images
  // UPLOAD PROPERTY IMAGES: Receives multiple files and saves them to a building profile.
  uploadPropertyImages = catchAsync(async (req, res, next) => {
    const { propertyId } = req.params;
    if (!req.files || req.files.length === 0)
      return next(new AppError('No files uploaded', 400));

    // 1. [VALIDATION] Capacity Guard: Max 10 images per property
    const existing = await propertyImageModel.findByPropertyId(propertyId);
    if (existing.length + req.files.length > 10)
      return next(new AppError(`Limit reached (Max 10).`, 400));

    // 2. [TRANSFORMATION] Map uploaded files to database schema
    const images = req.files.map((file, index) => ({
      imageUrl: file.url,
      isPrimary: existing.length === 0 && index === 0, // Auto-primary for first image
      displayOrder: existing.length + index,
    }));

    // 3. [SIDE EFFECT] Atomically clear existing primary flag if new images contain a primary
    if (images.some((img) => img.isPrimary)) {
      const db = (await import('../config/db.js')).default;
      await db.query(
        'UPDATE property_images SET is_primary = FALSE WHERE property_id = ?',
        [propertyId]
      );
    }

    // 4. [DATA] Persist batch records
    await propertyImageModel.createMultiple(propertyId, images);
    const allImages = await propertyImageModel.findByPropertyId(propertyId);

    // 5. [LEGACY SYNC] Update properties table for backward compatibility with older UI components
    try {
      const currentPrimary = allImages.find((img) => img.is_primary);
      if (currentPrimary)
        await propertyModel.update(propertyId, {
          imageUrl: currentPrimary.image_url,
        });
    } catch (syncErr) {
      logger.warn(`Legacy sync failed: ${syncErr.message}`);
    }

    res.status(201).json({ images: allImages });
  });

  // GET PROPERTY IMAGES: Lists all photos associated with a building.
  getPropertyImages = catchAsync(async (req, res, next) => {
    const { propertyId } = req.params;
    const images = await propertyImageModel.findByPropertyId(propertyId);
    res.json({ images });
  });

  // SET PRIMARY IMAGE: Chooses which photo shows up first for a property.
  setPropertyPrimaryImage = catchAsync(async (req, res, next) => {
    const { propertyId, imageId } = req.params;

    // 1. [DATA] Atomic primary swap in the image table
    const success = await propertyImageModel.setPrimary(imageId, propertyId);
    if (!success) return next(new AppError('Image not found', 404));

    // 2. [LEGACY SYNC] Propagate new hero image to the property main record
    try {
      const images = await propertyImageModel.findByPropertyId(propertyId);
      const primary = images.find((img) => img.is_primary);
      if (primary)
        await propertyModel.update(propertyId, { imageUrl: primary.image_url });
    } catch (syncErr) {
      logger.warn(`Legacy sync failed: ${syncErr.message}`);
    }

    res.json({ message: 'Primary image updated' });
  });

  // DELETE PROPERTY IMAGE: Drops the record and purges the file from Cloudinary.
  deletePropertyImage = catchAsync(async (req, res, next) => {
    const { imageId } = req.params;

    // 1. [DATA] Resolve identity and existing URL
    const db = (await import('../config/db.js')).default;
    const [rows] = await db.query(
      'SELECT image_url FROM property_images WHERE image_id = ?',
      [imageId]
    );
    if (rows.length === 0) return next(new AppError('Image not found', 404));

    const imageUrl = rows[0].image_url;

    // 2. [DATA] Remove database record
    const success = await propertyImageModel.deleteById(imageId);
    if (!success) return next(new AppError('Deletion failed', 500));

    // 3. [SIDE EFFECT] Cloudinary Purge: Extract ID and call remote delete
    const publicId = extractPublicId(imageUrl);
    if (publicId) {
      try {
        await cloudinary.uploader.destroy(publicId);
        logger.info(`Asset purged: ${publicId}`);
      } catch (err) {
        logger.error(`Cloudinary cleanup failed: ${publicId}`, err);
      }
    }

    res.json({ message: 'Image deleted' });
  });

  // UPLOAD UNIT IMAGES: Similar to property upload but for specific apartment units.
  uploadUnitImages = catchAsync(async (req, res, next) => {
    const { unitId } = req.params;
    if (!req.files || req.files.length === 0)
      return next(new AppError('No files uploaded', 400));

    // 1. [VALIDATION] Capacity Guard
    const existing = await unitImageModel.findByUnitId(unitId);
    if (existing.length + req.files.length > 10)
      return next(new AppError(`Limit reached (Max 10).`, 400));

    // 2. [TRANSFORMATION] Map files
    const images = req.files.map((file, index) => ({
      imageUrl: file.url,
      isPrimary: existing.length === 0 && index === 0,
      displayOrder: existing.length + index,
    }));

    // 3. [SIDE EFFECT] Reset primary states
    if (images.some((img) => img.isPrimary)) {
      const db = (await import('../config/db.js')).default;
      await db.query(
        'UPDATE unit_images SET is_primary = FALSE WHERE unit_id = ?',
        [unitId]
      );
    }

    // 4. [DATA] Persist
    await unitImageModel.createMultiple(unitId, images);
    const allImages = await unitImageModel.findByUnitId(unitId);

    // 5. [LEGACY SYNC] Update unit record
    try {
      const currentPrimary =
        allImages.find((img) => img.is_primary) || allImages[0];
      if (currentPrimary)
        await unitModel.updateImageUrl(unitId, currentPrimary.image_url);
    } catch (syncErr) {
      logger.warn(`Legacy sync failed: ${syncErr.message}`);
    }

    res.status(201).json({ images: allImages });
  });

  // GET UNIT IMAGES: Lists photos for a specific unit.
  getUnitImages = catchAsync(async (req, res, next) => {
    const { unitId } = req.params;
    const images = await unitImageModel.findByUnitId(unitId);
    res.json({ images });
  });

  // SET UNIT PRIMARY: Hero image selector for units.
  setUnitPrimaryImage = catchAsync(async (req, res, next) => {
    const { unitId, imageId } = req.params;
    const success = await unitImageModel.setPrimary(imageId, unitId);
    if (!success) return next(new AppError('Image not found', 404));

    // 1. [LEGACY SYNC]
    try {
      const images = await unitImageModel.findByUnitId(unitId);
      const primary = images.find((img) => img.is_primary);
      if (primary) await unitModel.updateImageUrl(unitId, primary.image_url);
    } catch (err) {
      logger.warn(`Legacy sync failed: ${err.message}`);
    }

    res.json({ message: 'Primary image updated' });
  });

  // DELETE UNIT IMAGE: Removes record and purges Cloudinary asset.
  deleteUnitImage = catchAsync(async (req, res, next) => {
    const { imageId } = req.params;
    const db = (await import('../config/db.js')).default;
    const [rows] = await db.query(
      'SELECT image_url FROM unit_images WHERE image_id = ?',
      [imageId]
    );
    if (rows.length === 0) return next(new AppError('Image not found', 404));

    const imageUrl = rows[0].image_url;
    const success = await unitImageModel.deleteById(imageId);
    if (!success) return next(new AppError('Deletion failed', 500));

    // 1. [SIDE EFFECT] Remote Purge
    const publicId = extractPublicId(imageUrl);
    if (publicId) {
      try {
        await cloudinary.uploader.destroy(publicId);
      } catch (err) {
        logger.error(`Cloudinary cleanup failed`, err);
      }
    }

    res.json({ message: 'Image deleted' });
  });
}

export default new ImageController();
