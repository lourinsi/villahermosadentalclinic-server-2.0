export interface PaymentMethod {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data?: T;
  error?: any;
}
