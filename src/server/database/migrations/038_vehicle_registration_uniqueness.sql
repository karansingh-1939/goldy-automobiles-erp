-- Preserve vehicle histories: collisions abort migration instead of merging records.
UPDATE vehicles SET registration_number_normalized = replace(replace(replace(replace(replace(replace(replace(replace(upper(registration_number), ' ', ''), '-', ''), '_', ''), '/', ''), char(9), ''), char(10), ''), char(13), ''), char(11), '');
CREATE UNIQUE INDEX idx_vehicles_canonical_unique ON vehicles (replace(replace(replace(replace(replace(replace(replace(replace(upper(registration_number), ' ', ''), '-', ''), '_', ''), '/', ''), char(9), ''), char(10), ''), char(13), ''), char(11), ''));
CREATE TRIGGER vehicles_canonical_insert AFTER INSERT ON vehicles BEGIN
  UPDATE vehicles SET registration_number_normalized = replace(replace(replace(replace(replace(replace(replace(replace(upper(registration_number), ' ', ''), '-', ''), '_', ''), '/', ''), char(9), ''), char(10), ''), char(13), ''), char(11), '') WHERE id = NEW.id;
END;
CREATE TRIGGER vehicles_canonical_update AFTER UPDATE OF registration_number, registration_number_normalized ON vehicles
WHEN NEW.registration_number_normalized IS NOT (replace(replace(replace(replace(replace(replace(replace(replace(upper(NEW.registration_number), ' ', ''), '-', ''), '_', ''), '/', ''), char(9), ''), char(10), ''), char(13), ''), char(11), '')) BEGIN
  UPDATE vehicles SET registration_number_normalized = replace(replace(replace(replace(replace(replace(replace(replace(upper(registration_number), ' ', ''), '-', ''), '_', ''), '/', ''), char(9), ''), char(10), ''), char(13), ''), char(11), '') WHERE id = NEW.id;
END;
