import {
  getAppointmentPriceFromCatalog,
  getAppointmentTypeNameFromCatalog,
  getServiceCatalog,
} from "./serviceCatalog";
import { OTHER_APPOINTMENT_TYPE_INDEX } from "../shared/appointmentTypes";

export { OTHER_APPOINTMENT_TYPE_INDEX };

export const getAppointmentTypes = () => getServiceCatalog().map((item) => item.label);

export const APPOINTMENT_TYPES = getAppointmentTypes();

export const getAppointmentPrices = () =>
  Object.fromEntries(getServiceCatalog().map((item) => [item.label, item.price || 0]));

export const getAppointmentTypeName = (typeIndex: number, customType?: string): string =>
  getAppointmentTypeNameFromCatalog(typeIndex, customType);

export const getAppointmentPrice = (typeIndex: number): number =>
  getAppointmentPriceFromCatalog(typeIndex);
