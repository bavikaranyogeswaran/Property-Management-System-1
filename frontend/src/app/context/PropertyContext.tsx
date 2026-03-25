import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import apiClient from '../../services/api';
import { useAuth } from './AuthContext';
import { toast } from 'sonner';

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
  image?: string;
  description?: string;
  features?: string[];
}

export interface PropertyType {
  type_id: number;
  name: string;
  description: string;
}

export interface UnitType {
  type_id: number;
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
  status: 'available' | 'occupied' | 'maintenance';
  createdAt: string;
  image?: string;
}

interface PropertyContextType {
  properties: Property[];
  propertyTypes: PropertyType[];
  unitTypes: UnitType[];
  units: Unit[];
  
  // Property operations
  addProperty: (property: Omit<Property, 'id' | 'createdAt'>) => Promise<Property | undefined>;
  updateProperty: (id: string, property: Partial<Property>) => Promise<void>;
  deleteProperty: (id: string) => Promise<void>;
  uploadPropertyImages: (propertyId: string, files: File[]) => Promise<any>;
  getPropertyImages: (propertyId: string) => Promise<any[]>;
  setPropertyPrimaryImage: (propertyId: string, imageId: string) => Promise<void>;
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
  addPropertyType: (type: Omit<PropertyType, 'type_id'>) => Promise<void>;
  deletePropertyType: (id: number) => Promise<void>;
  addUnitType: (type: Omit<UnitType, 'type_id'>) => Promise<void>;
  deleteUnitType: (id: number) => Promise<void>;
}

const PropertyContext = createContext<PropertyContextType | undefined>(undefined);

export function PropertyProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [properties, setProperties] = useState<Property[]>([]);
  const [propertyTypes, setPropertyTypes] = useState<PropertyType[]>([]);
  const [unitTypes, setUnitTypes] = useState<UnitType[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);

  const fetchProperties = async () => {
    try {
      const response = await apiClient.get('/properties');
      if (response.status === 200) {
        setProperties(response.data.map((p: any) => ({
          id: p.id || p.property_id?.toString(),
          name: p.name,
          propertyTypeId: p.propertyTypeId || p.type_id,
          typeName: p.typeName || p.type_name,
          propertyNo: p.propertyNo || p.property_no,
          street: p.street,
          city: p.city,
          district: p.district,
          image: p.image || p.image_url,
          createdAt: p.createdAt || p.created_at,
          description: p.description,
          features: p.features,
        })));
      }
    } catch (e) {
      console.error('Failed to fetch properties', e);
    }
  };

  const fetchPropertyTypes = async () => {
    try {
      const response = await apiClient.get('/property-types');
      if (response.status === 200) setPropertyTypes(response.data);
    } catch (e) {
      console.error('Failed to fetch property types', e);
    }
  };

  const fetchUnitTypes = async () => {
    try {
      const response = await apiClient.get('/unit-types');
      if (response.status === 200) setUnitTypes(response.data);
    } catch (e) {
      console.error('Failed to fetch unit types', e);
    }
  };

  const fetchUnits = async () => {
    try {
      const response = await apiClient.get('/units');
      if (response.status === 200) {
        setUnits(response.data.map((u: any) => ({
          id: u.id,
          propertyId: u.propertyId,
          unitNumber: u.unitNumber,
          unitTypeId: u.unitTypeId,
          type: u.type,
          monthlyRent: u.monthlyRent,
          status: u.status,
          image: u.image,
          createdAt: u.createdAt,
        })));
      }
    } catch (e) {
      console.error('Failed to fetch units', e);
    }
  };

  useEffect(() => {
    fetchProperties();
    fetchPropertyTypes();
    fetchUnitTypes();
    fetchUnits();
  }, [user]);

  const addProperty = async (property: Omit<Property, 'id' | 'createdAt'>): Promise<Property | undefined> => {
    try {
      const response = await apiClient.post('/properties', { ...property, imageUrl: property.image });
      if (response.status === 201) {
        const newProp = response.data;
        const mapped: Property = {
          id: newProp.id,
          name: newProp.name,
          propertyTypeId: newProp.propertyTypeId,
          typeName: newProp.typeName,
          propertyNo: newProp.propertyNo,
          street: newProp.street,
          city: newProp.city,
          district: newProp.district,
          image: newProp.image,
          createdAt: newProp.createdAt,
          description: newProp.description,
          features: newProp.features,
        };
        setProperties(prev => [...prev, mapped]);
        return mapped;
      }
    } catch (e) {
      console.error('Failed to add property', e);
      throw e;
    }
  };

  const updateProperty = async (id: string, updates: Partial<Property>) => {
    try {
      await apiClient.put(`/properties/${id}`, { ...updates, imageUrl: updates.image });
      if (updates.propertyTypeId) {
        const type = propertyTypes.find(t => t.type_id === updates.propertyTypeId);
        if (type) updates.typeName = type.name;
      }
      setProperties(prev => prev.map(p => (p.id === id ? { ...p, ...updates } : p)));
    } catch (e) {
      console.error('Failed to update property', e);
      throw e;
    }
  };

  const deleteProperty = async (id: string) => {
    try {
      await apiClient.delete(`/properties/${id}`);
      setProperties(prev => prev.filter(p => p.id !== id));
    } catch (e) {
      console.error('Failed to delete property', e);
      throw e;
    }
  };

  const uploadPropertyImages = async (propertyId: string, files: File[]) => {
    try {
      const formData = new FormData();
      files.forEach(file => formData.append('images', file));
      const response = await apiClient.post(`/properties/${propertyId}/images`, formData);
      if (response.status === 201 && response.data.images?.length > 0) {
        const primary = response.data.images.find((img: any) => img.is_primary);
        if (primary) {
          setProperties(prev => prev.map(p => p.id === propertyId ? { ...p, image: primary.image_url } : p));
        }
      }
      return response.data;
    } catch (e) {
      console.error('Failed to upload images', e);
      throw e;
    }
  };

  const getPropertyImages = async (propertyId: string) => {
    try {
      const response = await apiClient.get(`/properties/${propertyId}/images`);
      return response.data.images;
    } catch (e) {
      console.error('Failed to fetch property images', e);
      throw e;
    }
  };

  const setPropertyPrimaryImage = async (propertyId: string, imageId: string) => {
    try {
      await apiClient.put(`/properties/${propertyId}/images/${imageId}/primary`);
    } catch (e) {
      console.error('Failed to set primary image', e);
      throw e;
    }
  };

  const deletePropertyImage = async (propertyId: string, imageId: string) => {
    try {
      await apiClient.delete(`/properties/images/${imageId}`);
    } catch (e) {
      console.error('Failed to delete property image', e);
      throw e;
    }
  };

  const addUnit = async (unit: Omit<Unit, 'id' | 'createdAt'>): Promise<Unit | undefined> => {
    try {
      const response = await apiClient.post('/units', { ...unit, imageUrl: unit.image });
      if (response.status === 201) {
        const newUnit: Unit = { ...response.data, id: response.data.id };
        setUnits(prev => [...prev, newUnit]);
        return newUnit;
      }
    } catch (e) {
      console.error('Failed to add unit', e);
      throw e;
    }
  };

  const updateUnit = async (id: string, updates: Partial<Unit>) => {
    try {
      const response = await apiClient.put(`/units/${id}`, updates);
      if (response.status === 200) {
        setUnits(prev => prev.map(u => (u.id === id ? { ...u, ...response.data, id: response.data.id || u.id } : u)));
      }
    } catch (e) {
      console.error('Failed to update unit', e);
      throw e;
    }
  };

  const deleteUnit = async (id: string) => {
    try {
      await apiClient.delete(`/units/${id}`);
      setUnits(prev => prev.filter(u => u.id !== id));
    } catch (e) {
      console.error('Failed to delete unit', e);
      throw e;
    }
  };

  const markUnitAvailable = async (unitId: string) => {
    try {
      await apiClient.patch(`/units/${unitId}/mark-available`);
      // Optimistically update local state
      setUnits(prev => prev.map(u => u.id === unitId ? { ...u, status: 'available' } : u));
    } catch (e) {
      console.error('Failed to mark unit as available', e);
      throw e;
    }
  };

  const uploadUnitImages = async (unitId: string, files: File[]) => {
    try {
      const formData = new FormData();
      files.forEach(file => formData.append('images', file));
      const response = await apiClient.post(`/units/${unitId}/images`, formData);
      if (response.status === 201 && response.data.images?.length > 0) {
        const primary = response.data.images.find((img: any) => img.is_primary) || response.data.images[0];
        if (primary) {
          setUnits(prev => prev.map(u => u.id === unitId ? { ...u, image: primary.image_url } : u));
        }
      }
      return response.data;
    } catch (e) {
      console.error('Failed to upload unit images', e);
      throw e;
    }
  };

  const getUnitImages = async (unitId: string) => {
    try {
      const response = await apiClient.get(`/units/${unitId}/images`);
      return response.data.images;
    } catch (e) {
      console.error('Failed to fetch unit images', e);
      return [];
    }
  };

  const setUnitPrimaryImage = async (unitId: string, imageId: string) => {
    try {
      await apiClient.put(`/units/${unitId}/images/${imageId}/primary`);
    } catch (e) {
      console.error('Failed to set primary unit image', e);
      throw e;
    }
  };

  const deleteUnitImage = async (unitId: string, imageId: string) => {
    try {
      await apiClient.delete(`/units/images/${imageId}`);
    } catch (e) {
      console.error('Failed to delete unit image', e);
      throw e;
    }
  };

  const addPropertyType = async (type: Omit<PropertyType, 'type_id'>) => {
    try {
      const response = await apiClient.post('/property-types', type);
      setPropertyTypes(prev => [...prev, response.data]);
      toast.success('Property type added');
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to add property type');
    }
  };

  const deletePropertyType = async (id: number) => {
    try {
      await apiClient.delete(`/property-types/${id}`);
      setPropertyTypes(prev => prev.filter(t => t.type_id !== id));
      toast.success('Property type deleted');
    } catch (error) {
      toast.error('Failed to delete property type');
    }
  };

  const addUnitType = async (type: Omit<UnitType, 'type_id'>) => {
    try {
      const response = await apiClient.post('/unit-types', type);
      setUnitTypes(prev => [...prev, response.data]);
      toast.success('Unit type added');
    } catch (error) {
      toast.error('Failed to add unit type');
    }
  };

  const deleteUnitType = async (id: number) => {
    try {
      await apiClient.delete(`/unit-types/${id}`);
      setUnitTypes(prev => prev.filter(t => t.type_id !== id));
      toast.success('Unit type deleted');
    } catch (error) {
      toast.error('Failed to delete unit type');
    }
  };

  return (
    <PropertyContext.Provider value={{
      properties, propertyTypes, unitTypes, units,
      addProperty, updateProperty, deleteProperty, uploadPropertyImages, getPropertyImages, setPropertyPrimaryImage, deletePropertyImage,
      addUnit, updateUnit, deleteUnit, markUnitAvailable, uploadUnitImages, getUnitImages, setUnitPrimaryImage, deleteUnitImage,
      addPropertyType, deletePropertyType, addUnitType, deleteUnitType
    }}>
      {children}
    </PropertyContext.Provider>
  );
}

export function useProperty() {
  const context = useContext(PropertyContext);
  if (context === undefined) throw new Error('useProperty must be used within a PropertyProvider');
  return context;
}
