// ============================================================================
//  PROPERTY CONTROLLER (The Building Manager)
// ============================================================================
//  This file handles everything related to the physical buildings:
//  Adding new houses, listing them, and updating their details.
// ============================================================================

import propertyService from '../services/propertyService.js';
import propertyModel from '../models/propertyModel.js';
import leaseTermModel from '../models/leaseTermModel.js';
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
  //  - Public: Shows available units to potential tenants.
  //  - Owner: Shows all their assets.
  getProperties = catchAsync(async (req, res, next) => {
    const userId = req.user ? req.user.id : null;
    const isPublic = req.query.public === 'true';

    let properties;
    if (!isPublic && req.user && req.user.role === 'treasurer') {
      // Treasurer sees only assigned properties (unless browsing public)
      const staffModel = (await import('../models/staffModel.js')).default;
      properties = await staffModel.getAssignedProperties(req.user.id);
    } else if (!isPublic && req.user && req.user.role === 'owner') {
      // Owner sees only their own properties
      properties = await propertyService.getProperties(userId);
    } else {
      // Public view, Guest, or Tenant (tenants need to see all properties to look up their unit's info)
      properties = await propertyService.getProperties(null);
    }

    res.json(properties);
  });

  getPropertyById = catchAsync(async (req, res, next) => {
    const property = await propertyService.getPropertyById(req.params.id);
    if (!property) {
      return next(new AppError('Property not found', 404));
    }
    res.json(property);
  });

  updateProperty = catchAsync(async (req, res, next) => {
    const property = await propertyModel.findById(req.params.id);
    if (!property) {
      return next(new AppError('Property not found', 404));
    }
    if (
      req.user.role === 'owner' &&
      String(property.ownerId) !== String(req.user.id)
    ) {
      return next(new AppError('You do not own this property', 403));
    }

    const updated = await propertyService.updateProperty(
      req.params.id,
      req.body
    );
    res.json(updated);
  });

  deleteProperty = catchAsync(async (req, res, next) => {
    const property = await propertyModel.findById(req.params.id);
    if (!property) {
      return next(new AppError('Property not found', 404));
    }
    if (
      req.user.role === 'owner' &&
      String(property.ownerId) !== String(req.user.id)
    ) {
      return next(new AppError('You do not own this property', 403));
    }

    await propertyService.deleteProperty(req.params.id);
    res.json({ message: 'Property deleted successfully' });
  });

  uploadImages = catchAsync(async (req, res, next) => {
    const propertyId = req.params.id;
    const files = req.files;

    if (!files || files.length === 0) {
      return next(new AppError('No images uploaded', 400));
    }

    const images = await propertyService.addImages(propertyId, files);
    res.status(201).json({ message: 'Images uploaded successfully', images });
  });

  getPropertyTypes = catchAsync(async (req, res, next) => {
    const types = await propertyService.getPropertyTypes();
    res.json(types);
  });

  getLeaseTermsByPropertyId = catchAsync(async (req, res, next) => {
    const property = await propertyModel.findById(req.params.id);
    if (!property) {
      return next(new AppError('Property not found', 404));
    }
    const terms = await leaseTermModel.findAllByOwner(property.ownerId);
    res.json(terms);
  });
}

export default new PropertyController();
