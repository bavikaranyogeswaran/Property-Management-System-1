-- =============================================================================
-- MIGRATION: Decouple Leads from Users Table
-- =============================================================================
-- PURPOSE: Leads are guests, not system users. This migration:
--   1. Adds sender_lead_id + sender_type to messages (so leads can send messages without a users row)
--   2. Backfills existing lead messages
--   3. Removes user_id from leads table  
--   4. Cleans up orphaned 'lead' user rows
--   5. Removes 'lead' from users.role ENUM
--
-- ⚠️  BACK UP YOUR DATABASE BEFORE RUNNING THIS SCRIPT
-- =============================================================================

USE pms_database;

-- ---------------------------------------------------------------------------
-- STEP 1: Add new columns to messages table
-- ---------------------------------------------------------------------------
ALTER TABLE messages
    ADD COLUMN sender_lead_id INT NULL AFTER sender_id,
    ADD COLUMN sender_type ENUM('user','lead') NOT NULL DEFAULT 'user' AFTER sender_lead_id;

ALTER TABLE messages
    ADD CONSTRAINT fk_messages_sender_lead
    FOREIGN KEY (sender_lead_id) REFERENCES leads(lead_id) ON DELETE CASCADE;

-- ---------------------------------------------------------------------------
-- STEP 2: Backfill existing lead-sent messages
-- ---------------------------------------------------------------------------
-- Messages sent by users with role='lead' need to be reassigned.
-- We match via: messages.sender_id = users.user_id (role='lead')
--               AND leads.user_id = users.user_id
UPDATE messages m
    INNER JOIN users u ON m.sender_id = u.user_id AND u.role = 'lead'
    INNER JOIN leads l ON l.user_id = u.user_id AND l.lead_id = m.lead_id
SET
    m.sender_type = 'lead',
    m.sender_lead_id = l.lead_id,
    m.sender_id = NULL;

-- ---------------------------------------------------------------------------
-- STEP 3: Make sender_id NULLable (it was NOT NULL before)
-- ---------------------------------------------------------------------------
ALTER TABLE messages
    MODIFY COLUMN sender_id INT NULL;

-- ---------------------------------------------------------------------------
-- STEP 4: Remove user_id FK and column from leads
-- ---------------------------------------------------------------------------
-- Drop the FK constraint first (name may vary — check your DB)
-- MySQL auto-generates FK names. We find and drop it.
SET @fk_name = (
    SELECT CONSTRAINT_NAME 
    FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
    WHERE TABLE_SCHEMA = 'pms_database' 
      AND TABLE_NAME = 'leads' 
      AND COLUMN_NAME = 'user_id' 
      AND REFERENCED_TABLE_NAME = 'users'
    LIMIT 1
);

SET @drop_fk_sql = IF(@fk_name IS NOT NULL, 
    CONCAT('ALTER TABLE leads DROP FOREIGN KEY ', @fk_name), 
    'SELECT 1');
PREPARE stmt FROM @drop_fk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

ALTER TABLE leads DROP COLUMN user_id;

-- ---------------------------------------------------------------------------
-- STEP 5: Delete orphaned 'lead' user rows
-- ---------------------------------------------------------------------------
-- Only delete users with role='lead' who are NOT referenced as tenants,
-- lease holders, or anything else important.
DELETE FROM users 
WHERE role = 'lead' 
  AND user_id NOT IN (SELECT user_id FROM tenants)
  AND user_id NOT IN (SELECT tenant_id FROM leases);

-- ---------------------------------------------------------------------------
-- STEP 6: Remove 'lead' from users.role ENUM
-- ---------------------------------------------------------------------------
ALTER TABLE users 
    MODIFY COLUMN role ENUM('owner','tenant','treasurer') NOT NULL;

-- ---------------------------------------------------------------------------
-- DONE
-- ---------------------------------------------------------------------------
SELECT 'Migration complete: Leads decoupled from users table.' AS status;
