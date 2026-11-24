export type DeviceStatus = "available" | "loaned" | "maintenance" | "retired";

export type DeviceCategory = string;

export type DeviceCondition = "Excellent" | "Good" | "Fair" | "Needs Service";

export type EmploymentStatus = "Full-Time" | "Part-Time" | "Contractor" | "Intern" | "On Leave" | "Offboarded";

export const EMPLOYMENT_STATUSES: EmploymentStatus[] = [
  "Full-Time",
  "Part-Time",
  "Contractor",
  "Intern",
  "On Leave",
  "Offboarded"
];

export interface StaffMember {
  id: string;
  name: string;
  email: string;
  department: string;
  employmentStatus?: EmploymentStatus;
  avatarUrl: string;
}

export interface LoanRecord {
  id: string;
  deviceId: string;
  userId: string;
  userName: string;
  userEmail: string;
  userDepartment: string;
  checkoutDate: string; // ISO format (YYYY-MM-DD)
  expectedReturnDate: string; // ISO format
  returnedDate?: string; // ISO format if returned
  notes?: string;
  status: "active" | "returned" | "overdue";
  conditionOnReturn?: DeviceCondition;
  formFileId?: string; // Google Drive file of the scanned issuance form (automation)
  returnFormFileId?: string; // Google Drive file of the scanned return form (automation)
}

export interface Device {
  id: string;
  name: string;
  model: string;
  serialNumber: string;
  category: DeviceCategory;
  status: DeviceStatus;
  condition: DeviceCondition;
  purchaseDate: string;
  location: string;
  image: string; // CSS style or icon name
  notes?: string;
  currentLoan?: LoanRecord;
  history: LoanRecord[];
}

export type SubscriptionCategory = "SaaS & Software" | "Cloud Infrastructure" | "Domain & Hosting" | "Telecom & Utilities" | "Security & Identity" | "Other";

export type BillingCycle = "Monthly" | "Annual" | "Quarterly" | "One-time";

export interface Subscription {
  id: string;
  name: string; // Service Provider or Subscription Name
  url: string; // Service or Login URL
  username: string; // User name or Account ID
  password: string; // Access Password
  renewalDate: string; // Renewal date in YYYY-MM-DD
  remarks?: string; // Remarks or additional notes
  category?: SubscriptionCategory;
  cost?: number;
  billingCycle?: BillingCycle;
  contactPerson?: string;
  status?: "Active" | "Pending Renewal" | "Cancelled" | "Paused";
}

