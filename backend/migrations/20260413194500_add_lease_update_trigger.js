export const up = async (knex) => {
  // Add BEFORE UPDATE trigger to prevent double-booking on lease updates
  await knex.raw(`
    CREATE TRIGGER prevent_duplicate_active_lease_update
    BEFORE UPDATE ON leases
    FOR EACH ROW
    BEGIN
      DECLARE overlap_count INT;
      SELECT COUNT(*) INTO overlap_count
      FROM leases
      WHERE unit_id = NEW.unit_id
        AND lease_id != NEW.lease_id
        AND status IN ('active', 'draft', 'pending')
        AND start_date <= IFNULL(NEW.end_date, '2099-12-31')
        AND (end_date IS NULL OR end_date >= NEW.start_date);
      
      IF overlap_count > 0 THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'DB_CONSTRAINT: Active or draft lease already exists for this unit and date range.';
      END IF;
    END;
  `);
};

export const down = async (knex) => {
  await knex.raw(
    `DROP TRIGGER IF EXISTS prevent_duplicate_active_lease_update`
  );
};
