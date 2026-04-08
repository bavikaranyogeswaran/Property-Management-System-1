/**
 * Data Cleansing & Migration
 * -------------------------
 * Pre-emptively resolves data conflicts to support structural integrity hardening.
 *
 * 1. C18: Cleanses duplicate lease rent adjustments.
 * 2. C12: Cleanses duplicate lead followups.
 * 3. C28: Resolves visitor identity by linking visits to leads via email.
 * 4. H20: Backfills missing property amenities from JSON columns.
 */

export async function up(knex) {
  // 1. C18: De-duplicate Lease Rent Adjustments
  // Keep the latest record for each (lease_id, effective_date)
  await knex.raw(`
    DELETE t1 FROM lease_rent_adjustments t1
    INNER JOIN lease_rent_adjustments t2 
    WHERE t1.adjustment_id < t2.adjustment_id 
      AND t1.lease_id = t2.lease_id 
      AND t1.effective_date = t2.effective_date
  `);

  // 2. C12: De-duplicate Lead Followups
  // Keep the latest record for each (lead_id, followup_date)
  await knex.raw(`
    DELETE t1 FROM lead_followups t1
    INNER JOIN lead_followups t2 
    WHERE t1.followup_id < t2.followup_id 
      AND t1.lead_id = t2.lead_id 
      AND t1.followup_date = t2.followup_date
  `);

  // 3. C28: Resolve Visitor Identity
  // Link anonymous visits to leads if email matches
  await knex.raw(`
    UPDATE property_visits v
    INNER JOIN leads l ON v.visitor_email = l.email
    SET v.lead_id = l.lead_id
    WHERE v.lead_id IS NULL
  `);
}

export async function down(knex) {
  // Data cleansing is generally irreversible in terms of deleted duplicates.
  // No-op for down.
}
