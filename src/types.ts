export interface PayrollRecord {
  id: string;
  serial_no: string;
  activity: string;
  duration: string;
  name: string;
  working_hours: number;
  total_days: number;
  rate: number;
  meal_allowance: number;
  total: number;
  net_pay: number;
  advance: number;
  balance: number;
  signature?: string;
  created_at?: string;
}

export interface Labourer {
  id: string;
  name: string;
  status: 'Active' | 'Inactive';
  position?: string;
  department?: string;
}

export interface LabourerHistory {
  id: string;
  labourer_id: string;
  position: string;
  department: string;
  update_date: string;
}

export interface Budget {
  id: string;
  activity: string;
  total_budget: number;
  spent?: number;
}

export interface Attendance {
  id: string;
  labourer_id: string;
  name: string;
  check_in: string | null;
  check_out: string | null;
  actual_hours: number;
  date: string;
}

export interface DashboardStats {
  total_records: number;
  total_amount: number;
  total_advance: number;
  total_balance: number;
  budgets: Budget[];
  present_count: number;
  absent_count: number;
}
