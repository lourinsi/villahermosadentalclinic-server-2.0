export interface Staff {
  id?: string;
  name: string;
  role: string;
  department: string;
  email: string;
  phone: string;
  hireDate: string;
  baseSalary: number;
  status: string;
  employmentType: string;
  specialization: string;
  licenseNumber: string;
  password?: string;
  profilePicture?: string;
  bio?: string;
  createdAt?: Date;
  updatedAt?: Date;
  deleted?: boolean;
  deletedAt?: Date;
}

export interface StaffFinancialRecord {
  id: string;
  staffId: string;
  staffName: string;
  type: string;
  amount: number;
  date: string;
  status: string;
  notes: string;
  repaymentSchedule: string;
}

export interface Attendance {
  id?: string;
  staffId: string;
  staffName: string;
  date?: string;
  status?: string;
  hoursWorked: number;
  daysPresent: number;
  daysAbsent: number;
  overtimeHours: number;
}

export interface ApiResponse<T> {
  success: boolean;
  message: string;
  meta?: any;
  data?: T;
  error?: string;
}
