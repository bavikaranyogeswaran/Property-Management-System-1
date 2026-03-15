import leaseTermModel from '../models/leaseTermModel.js';

class LeaseTermService {
  async getLeaseTerms(user) {
    const ownerId = user.id;
    return await leaseTermModel.findAllByOwner(ownerId);
  }

  async createLeaseTerm(data, user) {
    const ownerId = user.id;
    if (data.type === 'fixed' && (!data.durationMonths || data.durationMonths < 3)) {
      throw new Error('Minimum lease duration is 3 months');
    }
    if (data.isDefault) {
        await leaseTermModel.resetDefault(ownerId);
    }
    return await leaseTermModel.create({ ...data, ownerId });
  }

  async updateLeaseTerm(id, data, user) {
    const ownerId = user.id;
    const existing = await leaseTermModel.findById(id);
    if (!existing || existing.ownerId !== ownerId) {
        throw new Error('Lease term not found or unauthorized');
    }

    const updatedType = data.type || existing.type;
    const updatedDuration = data.durationMonths !== undefined ? data.durationMonths : existing.durationMonths;

    if (updatedType === 'fixed' && (updatedDuration === undefined || updatedDuration < 3)) {
      throw new Error('Minimum lease duration is 3 months');
    }

    if (data.isDefault) {
        await leaseTermModel.resetDefault(ownerId);
    }
    return await leaseTermModel.update(id, data);
  }

  async deleteLeaseTerm(id, user) {
    const ownerId = user.id;
    const existing = await leaseTermModel.findById(id);
    if (!existing || existing.ownerId !== ownerId) {
        throw new Error('Lease term not found or unauthorized');
    }
    return await leaseTermModel.delete(id);
  }
}

export default new LeaseTermService();
