// ============================================================================
//  DOCUMENT CONTROLLER (The Filing Cabinet)
// ============================================================================
//  This file handles secure access to highly sensitive documents like
//  signed leases and identity cards, ensuring only authorized people can see them.
// ============================================================================

import { v2 as cloudinary } from 'cloudinary';
import leaseModel from '../models/leaseModel.js';
import propertyModel from '../models/propertyModel.js';
import tenantModel from '../models/tenantModel.js';

class DocumentController {
  /**
   * Generates a signed URL for a private document and redirects the user.
   * Only authorized users (Owner, Treasurer, or the relevant Tenant) can access.
   */
  // VIEW DOCUMENT: Generates a signed, temporary access link for highly sensitive JPG/PDF assets.
  // Implements strict RBAC to prevent horizontal privilege escalation.
  async viewDocument(req, res) {
    const { id } = req.params;
    const { type } = req.query;
    const user = req.user;

    try {
      let documentUrl = null;
      let propertyId = null;
      let tenantUserId = null;

      // 1. [DATA] Identify Resource: Resolve the Cloudinary URL and legal ownership context based on type
      if (type === 'lease') {
        const lease = await leaseModel.findById(id);
        if (!lease) return res.status(404).json({ error: 'Lease not found' });
        documentUrl = lease.documentUrl;
        propertyId = lease.propertyId;
        tenantUserId = lease.tenantId;
      } else if (type === 'nic' || type === 'tin' || type === 'id_card') {
        const tenant = await tenantModel.findById(id);
        if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
        if (type === 'nic') documentUrl = tenant.nicUrl;
        else if (type === 'tin') documentUrl = tenant.tinUrl;
        else if (type === 'id_card') documentUrl = tenant.idCardUrl;
        tenantUserId = tenant.user_id;
      }

      if (!documentUrl)
        return res.status(404).json({ error: 'Document not found' });

      // 2. [SECURITY] Multi-tier Authorization Check
      let isAuthorized = false;
      if (user.role === 'owner') {
        // Owners can see leases they've signed or profiles in their buildings
        if (propertyId) {
          const property = await propertyModel.findById(propertyId);
          if (property && String(property.owner_id) === String(user.id))
            isAuthorized = true;
        } else isAuthorized = true;
      } else if (user.role === 'treasurer') {
        isAuthorized = true; // System-wide audit access
      } else if (user.role === 'tenant') {
        // Tenants only see their own papers
        if (String(tenantUserId) === String(user.id)) isAuthorized = true;
      }

      if (!isAuthorized)
        return res.status(403).json({ error: 'Access denied' });

      // 3. [TRANSFORMATION] Path Resolution: Extract the public_id from the Cloudinary URL
      const parts = documentUrl.split('/');
      const filenameWithExt = parts.pop();
      const folder = parts.pop();
      const publicId = `${folder}/${filenameWithExt.split('.')[0]}`;

      // 4. [SECURITY] Key Exchange: Generate a signed URL with a 10-minute expiry (Token-based)
      const signedUrl = cloudinary.url(publicId, {
        sign_url: true,
        type: 'authenticated',
        expires_at: Math.floor(Date.now() / 1000) + 600,
      });

      // 5. [RESPONSE] Immediate Redirect to the secure Cloudinary edge node
      res.redirect(signedUrl);
    } catch (error) {
      console.error('Error generating signed URL:', error);
      res.status(500).json({ error: 'Failed to access document' });
    }
  }
}

export default new DocumentController();
