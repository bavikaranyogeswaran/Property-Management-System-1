-- Remove the old non-exclusive unique key
ALTER TABLE staff_property_assignments DROP INDEX unique_assignment;

-- Add the new exclusive unique key
ALTER TABLE staff_property_assignments ADD UNIQUE KEY unique_property (property_id);
