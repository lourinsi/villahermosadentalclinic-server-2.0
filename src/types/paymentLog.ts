export interface PaymentLog {
  id: string;
  appointmentId: string;
  amount: number;
  paymentMethod: string;
  paymentStatus: string;
  changedBy: string; // userId
  changedByName?: string; // name of the user who made the change
  changedAt: string;
  previousBalance: number;
  newBalance: number;
}
