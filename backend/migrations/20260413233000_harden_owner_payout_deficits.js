export const up = async (knex) => {
  // 1. Repair missing columns from initial setup (Safeguard)
  if (await knex.schema.hasTable('owner_payouts')) {
    const hasGross = await knex.schema.hasColumn(
      'owner_payouts',
      'gross_amount'
    );
    const hasComm = await knex.schema.hasColumn(
      'owner_payouts',
      'commission_amount'
    );
    const hasExp = await knex.schema.hasColumn(
      'owner_payouts',
      'expenses_amount'
    );
    const hasBankRef = await knex.schema.hasColumn(
      'owner_payouts',
      'bank_reference'
    );
    const hasProof = await knex.schema.hasColumn('owner_payouts', 'proof_url');
    const hasTreas = await knex.schema.hasColumn(
      'owner_payouts',
      'treasurer_id'
    );
    const hasAck = await knex.schema.hasColumn(
      'owner_payouts',
      'acknowledged_at'
    );
    const hasDisp = await knex.schema.hasColumn(
      'owner_payouts',
      'dispute_reason'
    );

    await knex.schema.alterTable('owner_payouts', (table) => {
      if (!hasGross)
        table.bigInteger('gross_amount').notNullable().defaultTo(0);
      if (!hasComm)
        table.bigInteger('commission_amount').notNullable().defaultTo(0);
      if (!hasExp)
        table.bigInteger('expenses_amount').notNullable().defaultTo(0);
      if (!hasBankRef) table.string('bank_reference', 100).nullable();
      if (!hasProof) table.string('proof_url', 500).nullable();
      if (!hasTreas) {
        table.integer('treasurer_id').nullable();
        table
          .foreign('treasurer_id')
          .references('users.user_id')
          .onDelete('SET NULL');
      }
      if (!hasAck) table.datetime('acknowledged_at').nullable();
      if (!hasDisp) table.text('dispute_reason').nullable();
    });

    // Fix status enum (MySQL specific)
    await knex.raw(`
      ALTER TABLE owner_payouts 
      MODIFY COLUMN status ENUM('pending', 'paid', 'acknowledged', 'disputed') DEFAULT 'pending'
    `);

    // 2. Add deficit tracking columns (Original purpose of this migration)
    const hasDeficitAmount = await knex.schema.hasColumn(
      'owner_payouts',
      'deficit_amount'
    );
    const hasDeficitOffset = await knex.schema.hasColumn(
      'owner_payouts',
      'deficit_offset_payout_id'
    );

    await knex.schema.alterTable('owner_payouts', (table) => {
      if (!hasDeficitAmount) {
        table.bigInteger('deficit_amount').defaultTo(0).notNullable();
      }
      if (!hasDeficitOffset) {
        table.integer('deficit_offset_payout_id').nullable();
        table
          .foreign('deficit_offset_payout_id')
          .references('owner_payouts.payout_id')
          .onDelete('SET NULL');
      }
    });

    // 3. Update the generated 'amount' column to ensure it never drops below 0.
    const hasAmount = await knex.schema.hasColumn('owner_payouts', 'amount');
    let needsUpdate = !hasAmount;

    if (hasAmount) {
      const [amountDef] = await knex.raw(`
        SELECT GENERATION_EXPRESSION FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'owner_payouts'
          AND COLUMN_NAME = 'amount'
      `);

      const isHardenFormat =
        amountDef &&
        amountDef[0] &&
        amountDef[0].GENERATION_EXPRESSION &&
        amountDef[0].GENERATION_EXPRESSION.toLowerCase().includes('greatest');

      if (!isHardenFormat) {
        needsUpdate = true;
        await knex.schema.alterTable('owner_payouts', (table) => {
          table.dropColumn('amount');
        });
      }
    }

    if (needsUpdate) {
      await knex.raw(`
        ALTER TABLE owner_payouts 
        ADD COLUMN amount BIGINT 
        AS (GREATEST(0, gross_amount - commission_amount - expenses_amount)) STORED
      `);
    }
  }
};

export const down = async (knex) => {
  if (await knex.schema.hasTable('owner_payouts')) {
    await knex.schema.alterTable('owner_payouts', (table) => {
      table.dropForeign('deficit_offset_payout_id');
      table.dropColumn('deficit_offset_payout_id');
      table.dropColumn('deficit_amount');
      table.dropColumn('amount');
    });

    // Restore original generated column behavior
    await knex.raw(`
      ALTER TABLE owner_payouts 
      ADD COLUMN amount BIGINT 
      AS (gross_amount - commission_amount - expenses_amount) STORED
    `);
  }
};
