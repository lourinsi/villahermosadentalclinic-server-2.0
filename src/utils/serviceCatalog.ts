import fs from "fs";
import path from "path";
import {
  APPOINTMENT_TYPE_OPTIONS,
  OTHER_APPOINTMENT_TYPE_INDEX,
  type AppointmentTypeOption,
} from "../shared/appointmentTypes";

export type ServiceCatalogItem = AppointmentTypeOption & {
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

const DATA_DIR = path.resolve(process.cwd(), "data");
const CATALOG_FILE = path.join(DATA_DIR, "appointment-types.json");

const normalizeServiceName = (value: unknown) =>
  String(value || "").trim().replace(/\s+/g, " ");

const normalizeLookup = (value: unknown) =>
  normalizeServiceName(value).toLowerCase();

const toFiniteNumber = (value: unknown, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const normalizeDuration = (value: unknown, fallback = 30) => {
  const duration = Math.round(toFiniteNumber(value, fallback));
  return duration > 0 ? duration : fallback;
};

const normalizeItem = (item: Partial<ServiceCatalogItem>, fallbackId: number): ServiceCatalogItem => {
  const name = normalizeServiceName(item.label || item.value);
  const id = Number.isInteger(Number(item.id)) ? Number(item.id) : fallbackId;
  const price = Math.max(0, toFiniteNumber(item.price, 0));

  return {
    id,
    value: name || `Service ${id}`,
    label: name || `Service ${id}`,
    icon: String(item.icon || "").trim() || "🦷",
    price,
    duration: normalizeDuration(item.duration, 30),
    isActive: item.isActive !== false,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
};

const defaultCatalog = (): ServiceCatalogItem[] =>
  APPOINTMENT_TYPE_OPTIONS.map((option) => normalizeItem(option, option.id));

const readCatalogFromDisk = (): ServiceCatalogItem[] => {
  try {
    if (!fs.existsSync(CATALOG_FILE)) return defaultCatalog();
    const parsed = JSON.parse(fs.readFileSync(CATALOG_FILE, "utf8"));
    if (!Array.isArray(parsed)) return defaultCatalog();

    const seen = new Set<number>();
    const items = parsed
      .map((item, index) => normalizeItem(item, index))
      .filter((item) => {
        if (!item.label || seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      })
      .sort((left, right) => left.id - right.id);

    return items.length ? items : defaultCatalog();
  } catch (error) {
    console.warn("[SERVICE CATALOG] Failed to read catalog, using defaults:", error);
    return defaultCatalog();
  }
};

let serviceCatalogCache = readCatalogFromDisk();

const persistCatalog = async () => {
  await fs.promises.mkdir(DATA_DIR, { recursive: true });
  await fs.promises.writeFile(CATALOG_FILE, JSON.stringify(serviceCatalogCache, null, 2), "utf8");
};

export const getServiceCatalog = (includeInactive = false): ServiceCatalogItem[] =>
  serviceCatalogCache
    .filter((item) => includeInactive || item.isActive !== false)
    .map((item) => ({ ...item }));

export const getServiceCatalogItem = (id: number): ServiceCatalogItem | undefined =>
  serviceCatalogCache.find((item) => item.id === id);

export const getNextServiceId = () =>
  Math.max(-1, ...serviceCatalogCache.map((item) => Number(item.id) || 0)) + 1;

export const createServiceCatalogItem = async (input: Partial<ServiceCatalogItem>) => {
  const name = normalizeServiceName(input.label || input.value);
  if (!name) throw new Error("Service name is required");

  const duplicate = serviceCatalogCache.find(
    (item) => normalizeLookup(item.label) === normalizeLookup(name)
  );
  if (duplicate) throw new Error("A service with this name already exists");

  const now = new Date().toISOString();
  const item = normalizeItem(
    {
      ...input,
      id: getNextServiceId(),
      label: name,
      value: name,
      createdAt: now,
      updatedAt: now,
    },
    getNextServiceId()
  );

  serviceCatalogCache = [...serviceCatalogCache, item].sort((left, right) => left.id - right.id);
  await persistCatalog();
  return { ...item };
};

export const updateServiceCatalogItem = async (
  id: number,
  input: Partial<ServiceCatalogItem>
) => {
  const index = serviceCatalogCache.findIndex((item) => item.id === id);
  if (index < 0) throw new Error("Service not found");

  const current = serviceCatalogCache[index];
  const nextName = normalizeServiceName(input.label || input.value || current.label);
  if (!nextName) throw new Error("Service name is required");

  const duplicate = serviceCatalogCache.find(
    (item) => item.id !== id && normalizeLookup(item.label) === normalizeLookup(nextName)
  );
  if (duplicate) throw new Error("A service with this name already exists");

  const isOther = id === OTHER_APPOINTMENT_TYPE_INDEX;
  const updated = normalizeItem(
    {
      ...current,
      ...input,
      id,
      label: isOther ? "Other" : nextName,
      value: isOther ? "Other" : nextName,
      updatedAt: new Date().toISOString(),
    },
    id
  );

  serviceCatalogCache = [
    ...serviceCatalogCache.slice(0, index),
    updated,
    ...serviceCatalogCache.slice(index + 1),
  ].sort((left, right) => left.id - right.id);

  await persistCatalog();
  return { ...updated };
};

export const getAppointmentTypeNameFromCatalog = (typeIndex: number, customType?: string) => {
  if (typeIndex === OTHER_APPOINTMENT_TYPE_INDEX) return customType || "Other";
  return getServiceCatalogItem(typeIndex)?.label || "Unknown";
};

export const getAppointmentPriceFromCatalog = (typeIndex: number): number =>
  getServiceCatalogItem(typeIndex)?.price || 0;

export const getAppointmentDurationFromCatalog = (typeIndex: number): number | undefined =>
  getServiceCatalogItem(typeIndex)?.duration;
