import propertyImageModel from '../models/propertyImageModel.js';
import propertyModel from '../models/propertyModel.js';
import unitModel from '../models/unitModel.js';
import unitImageModel from '../models/unitImageModel.js';
import { v2 as cloudinary } from 'cloudinary';

import { config } from '../config/config.js';
import logger from '../utils/logger.js';

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
  async uploadGeneralFile(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }
      res.status(201).json({ url: req.file.path || req.file.secure_url });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  // Property Images
  async uploadPropertyImages(req, res) {
    try {
      const { propertyId } = req.params;

      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'No files uploaded' });
      }

      // Validate max 10 images total
      const existing = await propertyImageModel.findByPropertyId(propertyId);
      if (existing.length + req.files.length > 10) {
        return res.status(400).json({
          error: `Maximum 10 images allowed. Currently ${existing.length} images, trying to add ${req.files.length}`,
        });
      }

      // Create image records with uploaded file paths
      const images = req.files.map((file, index) => ({
        imageUrl: file.path || file.secure_url,
        isPrimary: existing.length === 0 && index === 0, // First image of first batch is primary
        displayOrder: existing.length + index,
      }));

      // If any new image is primary, clear existing ones first
      const hasNewPrimary = images.some((img) => img.isPrimary);
      if (hasNewPrimary) {
        // Direct update to FALSE is safer/easier here
        await (
          await import('../config/db.js')
        ).default.query(
          'UPDATE property_images SET is_primary = FALSE WHERE property_id = ?',
          [propertyId]
        );
      }

      await propertyImageModel.createMultiple(propertyId, images);

      const allImages = await propertyImageModel.findByPropertyId(propertyId);

      // Sync primary image to properties table
      const currentPrimary = allImages.find((img) => img.is_primary);
      if (currentPrimary) {
        await propertyModel.update(propertyId, {
          imageUrl: currentPrimary.image_url,
        });
      }

      res.status(201).json({ images: allImages });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async getPropertyImages(req, res) {
    try {
      const { propertyId } = req.params;
      const images = await propertyImageModel.findByPropertyId(propertyId);
      res.json({ images });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async setPropertyPrimaryImage(req, res) {
    try {
      const { propertyId, imageId } = req.params;
      const success = await propertyImageModel.setPrimary(imageId, propertyId);

      if (!success) {
        return res.status(404).json({ error: 'Image not found' });
      }

      // Sync with properties table
      // We need to fetch the image URL first or just get it from DB
      const images = await propertyImageModel.findByPropertyId(propertyId);
      const primary = images.find((img) => img.is_primary);
      if (primary) {
        await propertyModel.update(propertyId, { imageUrl: primary.image_url });
      }

      res.json({ message: 'Primary image updated' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async deletePropertyImage(req, res) {
    try {
      const { imageId } = req.params;

      // Get image details first to get the URL
      const [rows] = await (
        await import('../config/db.js')
      ).default.query(
        'SELECT image_url FROM property_images WHERE image_id = ?',
        [imageId]
      );

      const imageUrl = rows[0]?.image_url;
      const success = await propertyImageModel.deleteById(imageId);

      if (!success) {
        return res.status(404).json({ error: 'Image not found' });
      }

      // Cleanup Cloudinary
      const publicId = extractPublicId(imageUrl);
      if (publicId) {
        try {
          await cloudinary.uploader.destroy(publicId);
          logger.info(`Cloudinary asset deleted: ${publicId}`);
        } catch (cloudinaryErr) {
          logger.error(
            `Failed to delete Cloudinary asset ${publicId}:`,
            cloudinaryErr
          );
        }
      }

      res.json({ message: 'Image deleted' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  // Unit Images
  async uploadUnitImages(req, res) {
    try {
      const { unitId } = req.params;

      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'No files uploaded' });
      }

      // Validate max 10 images total
      const existing = await unitImageModel.findByUnitId(unitId);
      if (existing.length + req.files.length > 10) {
        return res.status(400).json({
          error: `Maximum 10 images allowed. Currently ${existing.length} images, trying to add ${req.files.length}`,
        });
      }

      // Create image records with uploaded file paths
      const images = req.files.map((file, index) => ({
        imageUrl: file.path || file.secure_url,
        isPrimary: existing.length === 0 && index === 0,
        displayOrder: existing.length + index,
      }));

      // If any new image is primary, clear existing ones first
      const hasNewPrimary = images.some((img) => img.isPrimary);
      if (hasNewPrimary) {
        await (
          await import('../config/db.js')
        ).default.query(
          'UPDATE unit_images SET is_primary = FALSE WHERE unit_id = ?',
          [unitId]
        );
      }

      await unitImageModel.createMultiple(unitId, images);
      const allImages = await unitImageModel.findByUnitId(unitId);

      // Sync with units table
      const currentPrimary =
        allImages.find((img) => img.is_primary) || allImages[0];
      if (currentPrimary) {
        await unitModel.updateImageUrl(unitId, currentPrimary.image_url);
      }

      res.status(201).json({ images: allImages });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async getUnitImages(req, res) {
    try {
      const { unitId } = req.params;
      const images = await unitImageModel.findByUnitId(unitId);
      res.json({ images });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async setUnitPrimaryImage(req, res) {
    try {
      const { unitId, imageId } = req.params;
      const success = await unitImageModel.setPrimary(imageId, unitId);

      if (!success) {
        return res.status(404).json({ error: 'Image not found' });
      }

      // Sync with units table
      const images = await unitImageModel.findByUnitId(unitId);
      const primary = images.find((img) => img.is_primary);
      if (primary) {
        await unitModel.updateImageUrl(unitId, primary.image_url);
      }

      res.json({ message: 'Primary image updated' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async deleteUnitImage(req, res) {
    try {
      const { imageId } = req.params;

      // Get image details first to get the URL
      const [rows] = await (
        await import('../config/db.js')
      ).default.query('SELECT image_url FROM unit_images WHERE image_id = ?', [
        imageId,
      ]);

      const imageUrl = rows[0]?.image_url;
      const success = await unitImageModel.deleteById(imageId);

      if (!success) {
        return res.status(404).json({ error: 'Image not found' });
      }

      // Cleanup Cloudinary
      const publicId = extractPublicId(imageUrl);
      if (publicId) {
        try {
          await cloudinary.uploader.destroy(publicId);
          console.log(`Cloudinary asset deleted: ${publicId}`);
        } catch (cloudinaryErr) {
          console.error(
            `Failed to delete Cloudinary asset ${publicId}:`,
            cloudinaryErr
          );
        }
      }

      res.json({ message: 'Image deleted' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
}

export default new ImageController();
