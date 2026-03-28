const fs = require('fs');
const path = 'backend/models/leaseModel.js';
let content = fs.readFileSync(path, 'utf8');

// Update SELECT and JOIN in findById
content = content.replace(
  /SELECT l\.\*,\s+u\.unit_number,\s+u\.property_id,\s+p\.name as property_name,\s+t_usr\.name as tenant_name\s+FROM leases l/g,
  `SELECT l.*, 
                   u.unit_number,
                   u.property_id,
                   p.name as property_name,
                   t_usr.name as tenant_name,
                   ri.magic_token
            FROM leases l`
);

// Add missing LEFT JOINs for findByTenantId and findActive
content = content.replace(
    /JOIN users t_usr ON l\.tenant_id = t_usr\.user_id\s+WHERE l\.tenant_id = \? AND l\.deleted_at IS NULL/g,
    `JOIN users t_usr ON l.tenant_id = t_usr.user_id
            LEFT JOIN rent_invoices ri ON l.lease_id = ri.lease_id AND ri.invoice_type = 'deposit'
            WHERE l.tenant_id = ? AND l.deleted_at IS NULL`
);

content = content.replace(
    /JOIN users t_usr ON l\.tenant_id = t_usr\.user_id\s+WHERE l\.status = 'active' AND l\.deleted_at IS NULL/g,
    `JOIN users t_usr ON l.tenant_id = t_usr.user_id
            LEFT JOIN rent_invoices ri ON l.lease_id = ri.lease_id AND ri.invoice_type = 'deposit'
            WHERE l.status = 'active' AND l.deleted_at IS NULL`
);

fs.writeFileSync(path, content);
console.log('Updated leaseModel.js successfully');
