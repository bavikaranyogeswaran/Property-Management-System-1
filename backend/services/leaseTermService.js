import leaseTermModel from '../models/leaseTermModel.js';

class LeaseTermService {
  async getLeaseTerms(user) {
    const ownerId = user.id;
    return await leaseTermModel.findAllByOwner(ownerId);
  }

  async createLeaseTerm(data, user) {
    const ownerId = user.id;
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
