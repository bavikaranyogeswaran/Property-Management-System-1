// ============================================================================
//  PROPERTY CONTROLLER (The Building Manager)
// ============================================================================
//  This file handles everything related to the physical buildings:
//  Adding new houses, listing them, and updating their details.
// ============================================================================

import propertyService from '../services/propertyService.js';
import catchAsync from '../utils/catchAsync.js';
import AppError from '../utils/AppError.js';

class PropertyController {
  //  ADD PROPERTY: Owner registers a new building into the system.
  createProperty = catchAsync(async (req, res, next) => {
    // Owner ID from authenticated user (assuming owner role verification in middleware)
    const ownerId = req.user.id;
    const property = await propertyService.createProperty({
      ...req.body,
      ownerId,
    });
    res.status(201).json(property);
  });

  //  LIST PROPERTIES: Shows all the buildings we manage.
  getProperties = catchAsync(async (req, res, next) => {
    const properties = await propertyService.getProperties(req.user, req.query);
    res.json(properties);
  });

  getPropertyById = catchAsync(async (req, res, next) => {
    const property = await propertyService.getPropertyById(req.params.id);
    if (!property) {
      throw new AppError('Property not found', 404);
    }
    res.json(property);
  });

  updateProperty = catchAsync(async (req, res, next) => {
    const { id } = req.params;
    // Ownership check moved to service
    await propertyService.verifyOwnership(id, req.user.id, req.user.role);

    const updated = await propertyService.updateProperty(id, req.body);
    res.json(updated);
  });

  deleteProperty = catchAsync(async (req, res, next) => {
    const { id } = req.params;
    // Ownership check moved to service
    await propertyService.verifyOwnership(id, req.user.id, req.user.role);

    await propertyService.deleteProperty(id);
    res.json({ message: 'Property deleted successfully' });
  });

  uploadImages = catchAsync(async (req, res, next) => {
    const propertyId = req.params.id;
    const files = req.files;

    if (!files || files.length === 0) {
      throw new AppError('No images uploaded', 400);
    }

    const images = await propertyService.addImages(propertyId, files);
    res.status(201).json({ message: 'Images uploaded successfully', images });
  });

  getPropertyTypes = catchAsync(async (req, res, next) => {
    const types = await propertyService.getPropertyTypes();
    res.json(types);
  });

  getLeaseTermsByPropertyId = catchAsync(async (req, res, next) => {
    const terms = await propertyService.getLeaseTermsByPropertyId(
      req.params.id
    );
    res.json(terms);
  });
}

export default new PropertyController();
