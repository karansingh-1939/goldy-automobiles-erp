import { useEffect, useRef, useState } from 'react';
import { api } from '../../shared/api/api-client.js';

export function useIntakeLookup(addNotification) {
  const customerRequest = useRef(0);
  const vehicleRequest = useRef(0);
  const customerIdentity = useRef('');
  const phoneInput = useRef('');
  const loadedVehicle = useRef(null);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [vehicleLoading, setVehicleLoading] = useState(false);
  const [customerError, setCustomerError] = useState('');
  const [vehicleError, setVehicleError] = useState('');
  const cancelLookups = () => {
    customerRequest.current++;
    vehicleRequest.current++;
    setCustomerLoading(false);
    setVehicleLoading(false);
  };
  useEffect(
    () => () => {
      customerRequest.current++;
      vehicleRequest.current++;
    },
    [],
  );
  // Rebuilt Job Card Wizard States
  const [customerId, updateCustomerId] = useState('');
  const [isExistingCustomer, setIsExistingCustomer] = useState(false);
  const [existingCustomerVehicles, setExistingCustomerVehicles] = useState([]);
  const [customerPhone, updateCustomerPhone] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerCity, setCustomerCity] = useState('');
  const [customerNotes, setCustomerNotes] = useState('');

  const [vehicleId, setVehicleId] = useState('');
  const [vehicleReg, setVehicleReg] = useState('');
  const [isExistingVehicle, setIsExistingVehicle] = useState(false);
  const [vehicleMake, setVehicleMake] = useState('');
  const [vehicleModel, setVehicleModel] = useState('');
  const [vehicleFuelType, setVehicleFuelType] = useState('Petrol');
  const [vehicleChassis, setVehicleChassis] = useState('');
  const [vehicleEngine, setVehicleEngine] = useState('');
  const [transferOwnership, setTransferOwnership] = useState(false);
  const [showOwnerMismatchWarning, setShowOwnerMismatchWarning] = useState(false);
  const [vehicleOwnerName, setVehicleOwnerName] = useState('');
  const [vehicleOwnerPhone, setVehicleOwnerPhone] = useState('');

  const setCustomerId = (value) => {
    customerIdentity.current = value;
    updateCustomerId(value);
  };
  const setCustomerPhone = (value) => {
    phoneInput.current = value;
    updateCustomerPhone(value);
  };
  const checkVehicleOwner = (nextCustomerId, nextPhone) => {
    const vehicle = loadedVehicle.current;
    setTransferOwnership(false);
    setShowOwnerMismatchWarning(
      Boolean(
        vehicle &&
        nextPhone &&
        (nextCustomerId
          ? Number(vehicle.customer_id) !== Number(nextCustomerId)
          : nextPhone.replace(/[^0-9]/g, '') !==
            String(vehicle.customer_phone || '').replace(/[^0-9]/g, '')),
      ),
    );
  };
  // Real-time lookup methods
  const handleCustomerPhoneSearch = async (phoneVal) => {
    const requestId = ++customerRequest.current;
    setCustomerId('');
    setIsExistingCustomer(false);
    setExistingCustomerVehicles([]);
    setCustomerName('');
    setCustomerAddress('');
    setCustomerCity('');
    setCustomerNotes('');
    setCustomerError('');
    checkVehicleOwner('', phoneVal);
    const clean = phoneVal.replace(/[^0-9]/g, '');
    setCustomerLoading(clean.length >= 10);
    if (clean.length >= 10) {
      try {
        const res = await api.get(`/api/v1/customers/lookup?phone=${encodeURIComponent(clean)}`);
        if (requestId !== customerRequest.current) return;
        if (res.data) {
          const cust = res.data;
          setCustomerId(cust.id);
          setCustomerName(cust.name);
          setCustomerAddress(cust.address || '');
          setCustomerCity(cust.city || '');
          setCustomerNotes(cust.notes || '');
          setIsExistingCustomer(true);
          setExistingCustomerVehicles(cust.vehicles || []);
          checkVehicleOwner(cust.id, phoneVal);
          addNotification('Existing customer details loaded.', 'info');
        } else {
          setIsExistingCustomer(false);
          setCustomerId('');
          setCustomerName('');
          setCustomerAddress('');
          setCustomerCity('');
          setCustomerNotes('');
          setExistingCustomerVehicles([]);
        }
      } catch (err) {
        if (requestId === customerRequest.current)
          setCustomerError(err.message || 'Customer lookup failed.');
      } finally {
        if (requestId === customerRequest.current) setCustomerLoading(false);
      }
    }
  };

  const handleVehicleRegSearch = async (regVal) => {
    const requestId = ++vehicleRequest.current;
    setVehicleId('');
    setIsExistingVehicle(false);
    setTransferOwnership(false);
    setShowOwnerMismatchWarning(false);
    setVehicleMake('');
    setVehicleModel('');
    setVehicleChassis('');
    setVehicleEngine('');
    setVehicleFuelType('Petrol');
    loadedVehicle.current = null;
    setVehicleError('');
    const clean = regVal.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    setVehicleLoading(clean.length >= 4);
    if (clean.length >= 4) {
      try {
        const res = await api.get(
          `/api/v1/vehicles/lookup?registration_number=${encodeURIComponent(clean)}`,
        );
        if (requestId !== vehicleRequest.current) return;
        if (res.data) {
          const veh = res.data;
          loadedVehicle.current = veh;
          setVehicleOwnerName(veh.customer_name || '');
          setVehicleOwnerPhone(veh.customer_phone || '');
          setVehicleId(veh.id);
          setVehicleMake(veh.make || '');
          setVehicleModel(veh.model || '');
          setVehicleFuelType(veh.fuel_type || 'Petrol');
          setVehicleChassis(veh.chassis_number || '');
          setVehicleEngine(veh.engine_number || '');
          setIsExistingVehicle(true);

          checkVehicleOwner(customerIdentity.current, phoneInput.current);
          if (!customerIdentity.current && !phoneInput.current) {
            setCustomerId(veh.customer_id);
            setCustomerName(veh.customer_name);
            setCustomerPhone(veh.customer_phone || '');
            setCustomerAddress(veh.customer_address || '');
            setCustomerCity(veh.customer_city || '');
            setCustomerNotes(veh.customer_notes || '');
            setIsExistingCustomer(true);
          }
          addNotification('Existing vehicle details loaded.', 'info');
        } else {
          setIsExistingVehicle(false);
          setVehicleId('');
          setVehicleMake('');
          setVehicleModel('');
          setVehicleFuelType('Petrol');
          setVehicleChassis('');
          setVehicleEngine('');
          setShowOwnerMismatchWarning(false);
        }
      } catch (err) {
        if (requestId === vehicleRequest.current)
          setVehicleError(err.message || 'Vehicle lookup failed.');
      } finally {
        if (requestId === vehicleRequest.current) setVehicleLoading(false);
      }
    }
  };

  const resetIntake = () => {
    cancelLookups();
    setCustomerError('');
    setVehicleError('');
    loadedVehicle.current = null;
    setCustomerId('');
    setCustomerPhone('');
    setCustomerName('');
    setCustomerAddress('');
    setCustomerCity('');
    setCustomerNotes('');
    setIsExistingCustomer(false);
    setExistingCustomerVehicles([]);

    setVehicleId('');
    setVehicleReg('');
    setVehicleMake('');
    setVehicleModel('');
    setVehicleFuelType('Petrol');
    setVehicleChassis('');
    setVehicleEngine('');
    setIsExistingVehicle(false);
    setTransferOwnership(false);
    setShowOwnerMismatchWarning(false);
    setVehicleOwnerName('');
    setVehicleOwnerPhone('');
  };

  return {
    customerId,
    setCustomerId,
    isExistingCustomer,
    setIsExistingCustomer,
    existingCustomerVehicles,
    setExistingCustomerVehicles,
    customerPhone,
    setCustomerPhone,
    customerName,
    setCustomerName,
    customerAddress,
    setCustomerAddress,
    customerCity,
    setCustomerCity,
    customerNotes,
    setCustomerNotes,
    vehicleId,
    setVehicleId,
    vehicleReg,
    setVehicleReg,
    isExistingVehicle,
    setIsExistingVehicle,
    vehicleMake,
    setVehicleMake,
    vehicleModel,
    setVehicleModel,
    vehicleFuelType,
    setVehicleFuelType,
    vehicleChassis,
    setVehicleChassis,
    vehicleEngine,
    setVehicleEngine,
    transferOwnership,
    setTransferOwnership,
    showOwnerMismatchWarning,
    setShowOwnerMismatchWarning,
    vehicleOwnerName,
    setVehicleOwnerName,
    vehicleOwnerPhone,
    setVehicleOwnerPhone,
    handleCustomerPhoneSearch,
    handleVehicleRegSearch,
    resetIntake,
    cancelLookups,
    lookupError: customerError || vehicleError,
    lookupBusy: customerLoading || vehicleLoading,
  };
}
