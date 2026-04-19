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
  async viewDocument(req, res) {
    const { id } = req.params; // lease_id or other entity ID
    const { type } = req.query; // 'lease', 'nic', etc.
    const user = req.user;

    try {
      let documentUrl = null;
      let propertyId = null;
      let tenantUserId = null;

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

      if (!documentUrl) {
        return res.status(404).json({ error: 'Document not found' });
      }

      // Authorization check
      let isAuthorized = false;

      if (user.role === 'owner') {
        // If it's a lease, check if owner owns the property
        if (propertyId) {
          const property = await propertyModel.findById(propertyId);
          if (property && String(property.owner_id) === String(user.id))
            isAuthorized = true;
        } else {
          // For NIC, allow any owner for now (or more strictly: owner of any unit they were in)
          isAuthorized = true;
        }
      } else if (user.role === 'treasurer') {
        // Treasurers are generally authorized for documents
        isAuthorized = true;
      } else if (user.role === 'tenant') {
        // Tenants can only see their own documents
        if (String(tenantUserId) === String(user.id)) isAuthorized = true;
      }

      if (!isAuthorized) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Extract public_id from Cloudinary URL
      // Format usually: https://res.cloudinary.com/cloud_name/image/upload/v12345/folder/public_id.ext
      // Private format: https://res.cloudinary.com/cloud_name/image/authenticated/s--signature--/v12345/folder/public_id.ext

      const parts = documentUrl.split('/');
      const filenameWithExt = parts.pop();
      const folder = parts.pop(); // e.g. 'pms_private'
      const publicId = `${folder}/${filenameWithExt.split('.')[0]}`;

      // Generate signed URL (expires in 10 minutes)
      const signedUrl = cloudinary.url(publicId, {
        sign_url: true,
        type: 'authenticated',
        expires_at: Math.floor(Date.now() / 1000) + 600,
      });

      res.redirect(signedUrl);
    } catch (error) {
      console.error('Error generating signed URL:', error);
      res.status(500).json({ error: 'Failed to access document' });
    }
  }
}

export default new DocumentController();
