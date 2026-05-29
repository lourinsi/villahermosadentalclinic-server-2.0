export interface InventoryItem {
  id?: string;
  item: string;
  quantity: number;
  unit: string;
  costPerUnit: number;
  totalValue: number;
  supplier: string;
  lastOrdered: string;
  createdAt?: Date;
  updatedAt?: Date;
  deleted?: boolean;
  deletedAt?: Date;
}

export interface ApiResponse<T> {
  success: boolean;
  message: string;
  meta?: any;
  data?: T;
  error?: string;
}
