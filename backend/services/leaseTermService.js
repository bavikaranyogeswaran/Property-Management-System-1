import leaseTermModel from '../models/leaseTermModel.js';

class LeaseTermService {
  // GET TERMS: Resolves the owner's portfolio of legal templates (e.g., 6-month fixed, Month-to-Month).
  async getLeaseTerms(user) {
    const ownerId = user.id;
    return await leaseTermModel.findAllByOwner(ownerId);
  }

  // CREATE TERM: Registers a new legal boilerplate. Implements minimum duration guards.
  async createLeaseTerm(data, user) {
    const ownerId = user.id;

    // 1. [VALIDATION] Legal Constraint: Fixed leases must be at least 3 months to comply with policy
    if (
      data.type === 'fixed' &&
      (!data.durationMonths || data.durationMonths < 3)
    ) {
      throw new Error('Minimum lease duration is 3 months');
    }

    // 2. [SIDE EFFECT] Primary Guard: If this is the new default, unset the 'isDefault' flag on all other terms for this owner
    if (data.isDefault) await leaseTermModel.resetDefault(ownerId);

    return await leaseTermModel.create({ ...data, ownerId });
  }

  // UPDATE TERM: Modifies existing boilerplate configuration.
  async updateLeaseTerm(id, data, user) {
    const ownerId = user.id;

    // 1. [SECURITY] Identify and verify ownership context
    const existing = await leaseTermModel.findById(id);
    if (!existing || existing.ownerId !== ownerId)
      throw new Error('Lease term not found or unauthorized');

    // 2. [VALIDATION] Re-check duration policy on type changes
    const updatedType = data.type || existing.type;
    const updatedDuration =
      data.durationMonths !== undefined
        ? data.durationMonths
        : existing.durationMonths;
    if (
      updatedType === 'fixed' &&
      (updatedDuration === undefined || updatedDuration < 3)
    ) {
      throw new Error('Minimum lease duration is 3 months');
    }

    // 3. [SIDE EFFECT] Maintain single-default constraint
    if (data.isDefault) await leaseTermModel.resetDefault(ownerId);

    return await leaseTermModel.update(id, data);
  }

  // DELETE TERM: Removes a legal template from the owner's selection list.
  async deleteLeaseTerm(id, user) {
    const ownerId = user.id;

    // 1. [SECURITY] Ownership verification
    const existing = await leaseTermModel.findById(id);
    if (!existing || existing.ownerId !== ownerId)
      throw new Error('Lease term not found or unauthorized');

    return await leaseTermModel.delete(id);
  }
}

export default new LeaseTermService();
