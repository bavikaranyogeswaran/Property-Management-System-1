// ============================================================================
//  PROPERTY CONTEXT (The Property Registrar)
// ============================================================================
//  This context manages the global state of buildings and units.
//  It provides methods for adding houses, updating room details, and
//  tracking vacancy rates across the portfolio.
// ============================================================================

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from 'react';
import apiClient from '../../services/api';
import { useAuth } from './AuthContext';
import { toast } from 'sonner';
import { toLKRFromCents, toCentsFromLKR } from '../../utils/formatters';
import { enqueueFetch } from '../../utils/fetchQueue';

export interface Property {
  id: string;
  name: string;
  propertyTypeId: number;
  typeName?: string;
  propertyNo: string;
  street: string;
  city: string;
  district: string;
  createdAt: string;
  imageUrl?: string;
  description?: string;
  features?: string[];
  lateFeePercentage: number;
  lateFeeType: 'flat_percentage' | 'daily_fixed';
  lateFeeAmount: number;
  lateFeeGracePeriod: number;
  tenantDeactivationDays: number;
  managementFeePercentage?: number;
}

export interface PropertyType {
  id: number;
  name: string;
  description: string;
}

export interface UnitType {
  id: number;
  name: string;
  description?: string;
}

export interface Unit {
  id: string;
  propertyId: string;
  unitNumber: string;
  unitTypeId: number;
  type: string;
  monthlyRent: number;
  status: 'available' | 'occupied' | 'maintenance' | 'reserved';
  createdAt: string;
  imageUrl?: string;
  pendingApplicationsCount?: number;
}

interface PropertyContextType {
  properties: Property[];
  propertyTypes: PropertyType[];
  unitTypes: UnitType[];
  units: Unit[];
  fetchUnits: () => Promise<void>;

  // Property operations
  addProperty: (
    property: Omit<Property, 'id' | 'createdAt'>
  ) => Promise<Property | undefined>;
  updateProperty: (id: string, property: Partial<Property>) => Promise<void>;
  deleteProperty: (id: string) => Promise<void>;
  uploadPropertyImages: (propertyId: string, files: File[]) => Promise<any>;
  getPropertyImages: (propertyId: string) => Promise<any[]>;
  setPropertyPrimaryImage: (
    propertyId: string,
    imageId: string
  ) => Promise<void>;
  deletePropertyImage: (propertyId: string, imageId: string) => Promise<void>;

  // Unit operations
  addUnit: (unit: Omit<Unit, 'id' | 'createdAt'>) => Promise<Unit | undefined>;
  updateUnit: (id: string, unit: Partial<Unit>) => Promise<void>;
  deleteUnit: (id: string) => Promise<void>;
  markUnitAvailable: (unitId: string) => Promise<void>;
  uploadUnitImages: (unitId: string, files: File[]) => Promise<any>;
  getUnitImages: (unitId: string) => Promise<any[]>;
  setUnitPrimaryImage: (unitId: string, imageId: string) => Promise<void>;
  deleteUnitImage: (unitId: string, imageId: string) => Promise<void>;

  // Type operations
  addPropertyType: (type: Omit<PropertyType, 'id'>) => Promise<void>;
  deletePropertyType: (id: number) => Promise<void>;
  addUnitType: (type: Omit<UnitType, 'id'>) => Promise<void>;
  deleteUnitType: (id: number) => Promise<void>;
}

const PropertyContext = createContext<PropertyContextType | undefined>(
  undefined
);

export function PropertyProvider({ children }: { children: ReactNode }) {
  // 1. [DEPENDENCIES] Context Injection: Accesses global identity to scope inventory visibility
  const { user } = useAuth();

  // 2. [STATE] Inventory Buffers: Holds the master list of assets, classifications, and rental units
  const [properties, setProperties] = useState<Property[]>([]);
  const [propertyTypes, setPropertyTypes] = useState<PropertyType[]>([]);
  const [unitTypes, setUnitTypes] = useState<UnitType[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);

  // FETCH PROPERTIES: Retrieves the high-level building registry.
  const fetchProperties = async () => {
    try {
      // 1. [API] Extraction
      const response = await apiClient.get('/properties');
      if (response.data) {
        // 2. [TRANSFORMATION] Data Normalization: converts row-level cents to display LKR
        setProperties(
          response.data.map((p: any) => ({
            ...p,
            id: p.id.toString(),
            lateFeeAmount: toLKRFromCents(p.lateFeeAmount),
          }))
        );
      }
    } catch (e) {
      console.error('Failed to fetch properties', e);
    }
  };

  // FETCH PROPERTY TYPES: Loads the static classification registry (e.g., Apartments, Offices).
  const fetchPropertyTypes = async () => {
    try {
      const response = await apiClient.get('/property-types');
      if (response.data) setPropertyTypes(response.data);
    } catch (e) {
      console.error('Failed to fetch property types', e);
    }
  };

  // FETCH UNIT TYPES: Loads room-level classifications (e.g., Studio, 1BR).
  const fetchUnitTypes = async () => {
    try {
      const response = await apiClient.get('/unit-types');
      if (response.data) setUnitTypes(response.data);
    } catch (e) {
      console.error('Failed to fetch unit types', e);
    }
  };

  // FETCH UNITS: Retrieves the granular rental inventory across all properties.
  const fetchUnits = async () => {
    try {
      // 1. [API] Extraction
      const response = await apiClient.get('/units');
      if (response.data) {
        // 2. [TRANSFORMATION] Data Normalization: standardizes IDs and resolves rental amounts to LKR
        setUnits(
          response.data.map((u: any) => ({
            ...u,
            id: u.id.toString(),
            propertyId: u.propertyId.toString(),
            monthlyRent: toLKRFromCents(u.monthlyRent),
          }))
        );
      }
    } catch (e) {
      console.error('Failed to fetch units', e);
    }
  };

  // INITIALIZATION EFFECT: Refresh inventory state on identity change.
  useEffect(() => {
    if (!user) return;
    // 1. [OPTIMIZATION] Sequential Execution: utilizes a shared global queue to prevent API request storms on app boot
    enqueueFetch(fetchPropertyTypes);
    enqueueFetch(fetchProperties);
    enqueueFetch(fetchUnitTypes);
    enqueueFetch(fetchUnits);
  }, [user]);

  // ADD PROPERTY: Registers a new building in the portfolio.
  const addProperty = async (
    property: Omit<Property, 'id' | 'createdAt'>
  ): Promise<Property | undefined> => {
    try {
      // 1. [API] Persistence: with currency normalization (LKR to Cents)
      const response = await apiClient.post('/properties', {
        ...property,
        lateFeeAmount: property.lateFeeAmount
          ? toCentsFromLKR(property.lateFeeAmount)
          : 0,
      });
      if (response.status === 201) {
        // 2. [SYNC] Local State Update
        const mapped = response.data;
        setProperties((prev) => [...prev, mapped]);
        return mapped;
      }
    } catch (e) {
      console.error('Failed to add property', e);
      throw e;
    }
  };

  // UPDATE PROPERTY: Modifies building metadata and fee structures.
  const updateProperty = async (id: string, updates: Partial<Property>) => {
    try {
      // 1. [API] Persistence: ensures cents-integrity for late fee amounts
      await apiClient.put(`/properties/${id}`, {
        ...updates,
        lateFeeAmount: updates.lateFeeAmount
          ? toCentsFromLKR(updates.lateFeeAmount)
          : undefined,
      });
      // 2. [TRANSFORMATION] UI Logic: resolves the human-readable type name if the ID changed
      if (updates.propertyTypeId) {
        const type = propertyTypes.find((t) => t.id === updates.propertyTypeId);
        if (type) updates.typeName = type.name;
      }
      // 3. [SYNC] Selective state update
      setProperties((prev) =>
        prev.map((p) => (p.id === id ? { ...p, ...updates } : p))
      );
    } catch (e) {
      console.error('Failed to update property', e);
      throw e;
    }
  };

  // DELETE PROPERTY: Removes a building from management (Soft-deletion usually handled on backend).
  const deleteProperty = async (id: string) => {
    try {
      await apiClient.delete(`/properties/${id}`);
      setProperties((prev) => prev.filter((p) => p.id !== id));
    } catch (e) {
      console.error('Failed to delete property', e);
      throw e;
    }
  };

  // UPLOAD PROPERTY IMAGES: Handles bulk photo gallery submissions and primary cover resolution.
  const uploadPropertyImages = async (propertyId: string, files: File[]) => {
    try {
      // 1. [TRANSFORMATION] Multipart Prep
      const formData = new FormData();
      files.forEach((file) => formData.append('images', file));
      // 2. [API] Execution
      const response = await apiClient.post(
        `/properties/${propertyId}/images`,
        formData
      );
      // 3. [SYNC] UI Logic: resolve the new primary image to show in the building cards
      if (response.status === 201 && response.data.images?.length > 0) {
        const primary = response.data.images.find((img: any) => img.isPrimary);
        if (primary) {
          setProperties((prev) =>
            prev.map((p) =>
              p.id === propertyId ? { ...p, imageUrl: primary.imageUrl } : p
            )
          );
        }
      }
      return response.data;
    } catch (e) {
      console.error('Failed to upload images', e);
      throw e;
    }
  };

  // GET PROPERTY IMAGES: Retrieves the photo gallery for a specific building.
  const getPropertyImages = async (propertyId: string) => {
    try {
      const response = await apiClient.get(`/properties/${propertyId}/images`);
      if (response.data && response.data.images) {
        // 1. [TRANSFORMATION] Standardize backend rows to frontend Image models
        return response.data.images.map((img: any) => ({
          id: img.image_id?.toString(),
          propertyId: img.property_id?.toString(),
          imageUrl: img.image_url,
          isPrimary: Boolean(img.is_primary),
          displayOrder: img.display_order,
          createdAt: img.created_at,
        }));
      }
      return [];
    } catch (e) {
      console.error('Failed to fetch property images', e);
      throw e;
    }
  };

  // SET PROPERTY PRIMARY IMAGE: Rotates the building's main cover photo.
  const setPropertyPrimaryImage = async (
    propertyId: string,
    imageId: string
  ) => {
    try {
      await apiClient.put(
        `/properties/${propertyId}/images/${imageId}/primary`
      );
    } catch (e) {
      console.error('Failed to set primary image', e);
      throw e;
    }
  };

  // DELETE PROPERTY IMAGE: Permanently removes a photo from the building's gallery.
  const deletePropertyImage = async (propertyId: string, imageId: string) => {
    try {
      await apiClient.delete(`/properties/images/${imageId}`);
    } catch (e) {
      console.error('Failed to delete property image', e);
      throw e;
    }
  };

  // ADD UNIT: Registers a new rental room within a building.
  const addUnit = async (
    unit: Omit<Unit, 'id' | 'createdAt'>
  ): Promise<Unit | undefined> => {
    try {
      // 1. [API] Persistence: normalized rent to storage-side cents
      const response = await apiClient.post('/units', {
        ...unit,
        monthlyRent: toCentsFromLKR(unit.monthlyRent),
      });
      if (response.status === 201) {
        // 2. [SYNC] Local state update
        const newUnit: Unit = { ...response.data, id: response.data.id };
        setUnits((prev) => [...prev, newUnit]);
        return newUnit;
      }
    } catch (e) {
      console.error('Failed to add unit', e);
      throw e;
    }
  };

  // UPDATE UNIT: Modifies room details (Rent, Type, or Operational Status).
  const updateUnit = async (id: string, updates: Partial<Unit>) => {
    try {
      // 1. [API] Persistence
      const response = await apiClient.put(`/units/${id}`, {
        ...updates,
        monthlyRent: updates.monthlyRent
          ? toCentsFromLKR(updates.monthlyRent)
          : undefined,
      });
      // 2. [SYNC]
      if (response.status === 200) {
        setUnits((prev) =>
          prev.map((u) =>
            u.id === id
              ? { ...u, ...response.data, id: response.data.id || u.id }
              : u
          )
        );
      }
    } catch (e) {
      console.error('Failed to update unit', e);
      throw e;
    }
  };

  // DELETE UNIT: Removes a specialized rental room.
  const deleteUnit = async (id: string) => {
    try {
      await apiClient.delete(`/units/${id}`);
      setUnits((prev) => prev.filter((u) => u.id !== id));
    } catch (e) {
      console.error('Failed to delete unit', e);
      throw e;
    }
  };

  // MARK UNIT AVAILABLE: Quick-status toggle for vacant rooms.
  const markUnitAvailable = async (unitId: string) => {
    try {
      await apiClient.patch(`/units/${unitId}/mark-available`);
      // 1. [UI] Optimistic Update
      setUnits((prev) =>
        prev.map((u) => (u.id === unitId ? { ...u, status: 'available' } : u))
      );
    } catch (e) {
      console.error('Failed to mark unit as available', e);
      throw e;
    }
  };

  // UPLOAD UNIT IMAGES: Manages bulk photo uploads for rental units.
  const uploadUnitImages = async (unitId: string, files: File[]) => {
    try {
      const formData = new FormData();
      files.forEach((file) => formData.append('images', file));
      const response = await apiClient.post(
        `/units/${unitId}/images`,
        formData
      );
      // 1. [SYNC] resolve unit thumbnail
      if (response.status === 201 && response.data.images?.length > 0) {
        const primary =
          response.data.images.find((img: any) => img.is_primary) ||
          response.data.images[0];
        if (primary) {
          setUnits((prev) =>
            prev.map((u) =>
              u.id === unitId ? { ...u, imageUrl: primary.image_url } : u
            )
          );
        }
      }
      return response.data;
    } catch (e) {
      console.error('Failed to upload unit images', e);
      throw e;
    }
  };

  // GET UNIT IMAGES: Retrieves the photo gallery for a room.
  const getUnitImages = async (unitId: string) => {
    try {
      const response = await apiClient.get(`/units/${unitId}/images`);
      if (response.data && response.data.images) {
        return response.data.images.map((img: any) => ({
          id: img.image_id?.toString(),
          unitId: img.unit_id?.toString(),
          imageUrl: img.image_url,
          isPrimary: Boolean(img.is_primary),
          displayOrder: img.display_order,
          createdAt: img.created_at,
        }));
      }
      return [];
    } catch (e) {
      console.error('Failed to fetch unit images', e);
      return [];
    }
  };

  // SET UNIT PRIMARY IMAGE: Rotates the room's main cover photo.
  const setUnitPrimaryImage = async (unitId: string, imageId: string) => {
    try {
      await apiClient.put(`/units/${unitId}/images/${imageId}/primary`);
    } catch (e) {
      console.error('Failed to set primary unit image', e);
      throw e;
    }
  };

  // DELETE UNIT IMAGE: Removes a photo from the room's gallery.
  const deleteUnitImage = async (unitId: string, imageId: string) => {
    try {
      await apiClient.delete(`/units/images/${imageId}`);
    } catch (e) {
      console.error('Failed to delete unit image', e);
      throw e;
    }
  };

  // TYPE MANAGEMENT: CRUD for building and room classifications.
  const addPropertyType = async (type: Omit<PropertyType, 'id'>) => {
    try {
      const response = await apiClient.post('/property-types', type);
      setPropertyTypes((prev) => [...prev, response.data]);
      toast.success('Property type added');
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to add property type');
    }
  };

  const deletePropertyType = async (id: number) => {
    try {
      await apiClient.delete(`/property-types/${id}`);
      setPropertyTypes((prev) => prev.filter((t) => t.id !== id));
      toast.success('Property type deleted');
    } catch (error: any) {
      toast.error(
        error.response?.data?.error || 'Failed to delete property type'
      );
    }
  };

  const addUnitType = async (type: Omit<UnitType, 'id'>) => {
    try {
      const response = await apiClient.post('/unit-types', type);
      setUnitTypes((prev) => [...prev, response.data]);
      toast.success('Unit type added');
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to add unit type');
    }
  };

  const deleteUnitType = async (id: number) => {
    try {
      await apiClient.delete(`/unit-types/${id}`);
      setUnitTypes((prev) => prev.filter((t) => t.id !== id));
      toast.success('Unit type deleted');
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to delete unit type');
    }
  };

  return (
    <PropertyContext.Provider
      value={{
        properties,
        propertyTypes,
        unitTypes,
        units,
        fetchUnits,
        addProperty,
        updateProperty,
        deleteProperty,
        uploadPropertyImages,
        getPropertyImages,
        setPropertyPrimaryImage,
        deletePropertyImage,
        addUnit,
        updateUnit,
        deleteUnit,
        markUnitAvailable,
        uploadUnitImages,
        getUnitImages,
        setUnitPrimaryImage,
        deleteUnitImage,
        addPropertyType,
        deletePropertyType,
        addUnitType,
        deleteUnitType,
      }}
    >
      {children}
    </PropertyContext.Provider>
  );
}

export function useProperty() {
  const context = useContext(PropertyContext);
  if (context === undefined)
    throw new Error('useProperty must be used within a PropertyProvider');
  return context;
}
