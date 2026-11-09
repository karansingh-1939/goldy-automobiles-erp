/**
 * Centralized Form and Domain Validation Utilities
 */

export function validateRequired(value) {
  if (value === undefined || value === null) return false;
  return String(value).trim().length > 0;
}

export function validateEmail(email) {
  if (!email) return true; // Optional fields are validated on presence only
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function validatePhone(phone) {
  if (!phone) return true;
  const phoneRegex = /^[0-9]{10}$/;
  return phoneRegex.test(phone);
}

export function validateGstin(gstin) {
  if (!gstin) return true;
  const gstinRegex = /^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}$/;
  return gstinRegex.test(gstin);
}

export function validateVehicleReg(reg) {
  if (!reg) return false;
  // Standard Indian vehicle registration formats
  const regRegex = /^[A-Z]{2}[0-9]{2}[A-Z]{1,2}[0-9]{4}$/;
  return regRegex.test(reg.replace(/[-\s]/g, '').toUpperCase());
}
