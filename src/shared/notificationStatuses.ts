export type NotificationType = 'appointment' | 'payment' | 'message' | 'system';

export interface NotificationTypeOption {
  key: number;
  value: NotificationType;
  label: string;
  description: string;
}

export const NOTIFICATION_TYPES: NotificationTypeOption[] = [
  {
    key: 1,
    value: "appointment",
    label: "Appointment",
    description: "Appointment related notification"
  },
  {
    key: 2,
    value: "payment",
    label: "Payment",
    description: "Payment related notification"
  },
  {
    key: 3,
    value: "message",
    label: "Message",
    description: "General message notification"
  },
  {
    key: 4,
    value: "system",
    label: "System",
    description: "System notification"
  },
];

/**
 * Get notification type option by value/key
 */
export const getNotificationTypeOption = (typeValue: string | number): NotificationTypeOption | undefined => {
  if (typeof typeValue === 'number') {
    return NOTIFICATION_TYPES.find(t => t.key === typeValue);
  }
  return NOTIFICATION_TYPES.find(t => t.value === typeValue);
};

/**
 * Get notification type label by value
 */
export const getNotificationTypeLabel = (typeValue: string | number): string => {
  const type = getNotificationTypeOption(typeValue);
  return type?.label || String(typeValue);
};

/**
 * Get notification type description by value
 */
export const getNotificationTypeDescription = (typeValue: string | number): string => {
  const type = getNotificationTypeOption(typeValue);
  return type?.description || '';
};

/**
 * All valid notification type values
 */
export const VALID_NOTIFICATION_TYPES = NOTIFICATION_TYPES.map(t => t.value);

/**
 * Check if a value is a valid notification type
 */
export const isValidNotificationType = (value: string | number): boolean => {
  if (typeof value === 'number') {
    return NOTIFICATION_TYPES.some(t => t.key === value);
  }
  return VALID_NOTIFICATION_TYPES.includes(value as NotificationType);
};

/**
 * Notification type for TypeScript
 */
export type NotificationTypeValue = typeof NOTIFICATION_TYPES[number]['value'];
