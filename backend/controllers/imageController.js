import propertyImageModel from '../models/propertyImageModel.js';
import propertyModel from '../models/propertyModel.js';
import unitModel from '../models/unitModel.js';
import unitImageModel from '../models/unitImageModel.js';

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
      const success = await propertyImageModel.deleteById(imageId);

      if (!success) {
        return res.status(404).json({ error: 'Image not found' });
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
      const success = await unitImageModel.deleteById(imageId);

      if (!success) {
        return res.status(404).json({ error: 'Image not found' });
      }

      res.json({ message: 'Image deleted' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
}

export default new ImageController();
