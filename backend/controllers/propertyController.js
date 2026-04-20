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
  // ADD PROPERTY: Owner registers a new building into the system.
  createProperty = catchAsync(async (req, res, next) => {
    const ownerId = req.user.id;
    // 1. [DELEGATION] Registration Logic: Persist the building details with owner mapping
    const property = await propertyService.createProperty({
      ...req.body,
      ownerId,
    });
    res.status(201).json(property);
  });

  // LIST PROPERTIES: Shows all the buildings we manage.
  getProperties = catchAsync(async (req, res, next) => {
    // 1. [DELEGATION] Visibility Logic: Filter properties based on user role (Owner vs Staff vs Public)
    const properties = await propertyService.getProperties(req.user, req.query);
    res.json(properties);
  });

  // GET PROPERTY BY ID: Fetch detail view for a specific building.
  getPropertyById = catchAsync(async (req, res, next) => {
    // 1. [DATA] Resolution
    const property = await propertyService.getPropertyById(req.params.id);
    if (!property) throw new AppError('Property not found', 404);
    res.json(property);
  });

  // UPDATE PROPERTY: Modifies structural or contact details for a building.
  updateProperty = catchAsync(async (req, res, next) => {
    const { id } = req.params;
    // 1. [SECURITY] Ownership check: Ensure the user has the right to modify this specific property
    await propertyService.verifyOwnership(id, req.user.id, req.user.role);

    // 2. [DELEGATION] Vault Update
    const updated = await propertyService.updateProperty(id, req.body);
    res.json(updated);
  });

  // DELETE PROPERTY: Removes a building (and potentially its units/metadata) from management.
  deleteProperty = catchAsync(async (req, res, next) => {
    const { id } = req.params;
    // 1. [SECURITY] Authorization Guard
    await propertyService.verifyOwnership(id, req.user.id, req.user.role);

    // 2. [DELEGATION] Purge Logic
    await propertyService.deleteProperty(id);
    res.json({ message: 'Property deleted successfully' });
  });

  // UPLOAD IMAGES: Adds property gallery photos (evidence/marketing).
  uploadImages = catchAsync(async (req, res, next) => {
    const propertyId = req.params.id;
    const files = req.files;

    // 1. [VALIDATION] Integrity check
    if (!files || files.length === 0)
      throw new AppError('No images uploaded', 400);

    // 2. [DELEGATION] Asset Orchestration: Save to Cloudinary and map URLs to property record
    const images = await propertyService.addImages(propertyId, files);
    res.status(201).json({ message: 'Images uploaded successfully', images });
  });

  // GET PROPERTY TYPES: Lists valid categories (e.g., "Apartment", "House").
  getPropertyTypes = catchAsync(async (req, res, next) => {
    // 1. [DATA] Metadata fetch
    const types = await propertyService.getPropertyTypes();
    res.json(types);
  });

  // GET LEASE TERMS BY PROPERTY ID: Lists the available rental durations for this building.
  getLeaseTermsByPropertyId = catchAsync(async (req, res, next) => {
    // 1. [DATA] Retrieval
    const terms = await propertyService.getLeaseTermsByPropertyId(
      req.params.id
    );
    res.json(terms);
  });
}

export default new PropertyController();
