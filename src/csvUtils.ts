import { Device, DeviceStatus, DeviceCondition, StaffMember, LoanRecord, EmploymentStatus, EMPLOYMENT_STATUSES } from "./types";
import { getTodayDateString } from "./utils";

export function escapeCSVField(val: string): string {
  if (val === undefined || val === null) return "";
  const str = String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function parseCSV(text: string): string[][] {
  const lines: string[][] = [];
  let currentLine: string[] = [];
  let currentField = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentField += '"';
        i++; // Skip the second quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      currentLine.push(currentField);
      currentField = "";
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++; // Skip LF if CRLF
      }
      currentLine.push(currentField);
      // Only push non-empty lines
      if (currentLine.length > 1 || currentLine[0] !== "") {
        lines.push(currentLine);
      }
      currentLine = [];
      currentField = "";
    } else {
      currentField += char;
    }
  }

  // Handle last field if file doesn't end with a newline
  if (currentField !== "" || currentLine.length > 0) {
    currentLine.push(currentField);
    if (currentLine.length > 1 || currentLine[0] !== "") {
      lines.push(currentLine);
    }
  }

  return lines;
}

export function exportDevicesToCSV(devices: Device[]): string {
  const headers = [
    "id",
    "name",
    "model",
    "serialNumber",
    "category",
    "status",
    "condition",
    "purchaseDate",
    "location",
    "image",
    "notes",
    "borrowerName",
    "borrowerEmail",
    "borrowerDepartment",
    "checkoutDate",
    "expectedReturnDate"
  ];

  const rows = devices.map((d) => {
    const loan = d.currentLoan;
    return [
      d.id,
      d.name,
      d.model,
      d.serialNumber,
      d.category,
      d.status,
      d.condition,
      d.purchaseDate || "",
      d.location,
      d.image,
      d.notes || "",
      loan ? loan.userName : "",
      loan ? loan.userEmail : "",
      loan ? loan.userDepartment : "",
      loan ? loan.checkoutDate : "",
      loan ? loan.expectedReturnDate : ""
    ].map(escapeCSVField).join(",");
  });

  return [headers.join(","), ...rows].join("\n");
}

export function parseDevicesFromCSV(csvText: string): Partial<Device>[] {
  const parsed = parseCSV(csvText);
  if (parsed.length <= 1) return [];

  const headers = parsed[0].map(h => h.trim().toLowerCase());
  const devices: Partial<Device>[] = [];

  for (let i = 1; i < parsed.length; i++) {
    const row = parsed[i];
    if (row.length === 0 || (row.length === 1 && row[0] === "")) continue;

    const record: any = {};
    headers.forEach((header, index) => {
      record[header] = row[index] !== undefined ? row[index].trim() : "";
    });

    if (!record.name) continue; // Skip empty row or invalid row without a device name

    const status: DeviceStatus = ["available", "loaned", "maintenance", "retired"].includes(record.status)
      ? record.status as DeviceStatus
      : "available";

    const condition: DeviceCondition = ["Excellent", "Good", "Fair", "Needs Service"].includes(record.condition)
      ? record.condition as DeviceCondition
      : "Excellent";

    let currentLoan: LoanRecord | undefined = undefined;
    if (status === "loaned" && record.borrowername && record.borroweremail) {
      currentLoan = {
        id: `loan-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        deviceId: record.id || `dev-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        userId: `temp-user-${Math.floor(Math.random() * 100000)}`,
        userName: record.borrowername,
        userEmail: record.borroweremail,
        userDepartment: record.borrowerdepartment || "General",
        checkoutDate: record.checkoutdate || getTodayDateString(),
        expectedReturnDate: record.expectedreturndate || (() => {
          const d = new Date();
          d.setDate(d.getDate() + 7);
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        })(),
        status: "active" as const
      };
    }

    const device: Partial<Device> = {
      id: record.id || `dev-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      name: record.name,
      model: record.model || "Unknown Model",
      serialNumber: record.serialnumber || `SN-${Math.floor(Math.random() * 1000000)}`,
      category: record.category || "Laptops",
      status: status,
      condition: condition,
      purchaseDate: record.purchasedate || getTodayDateString(),
      location: record.location || "Main Office",
      image: record.image || "Laptop",
      notes: record.notes || undefined,
      currentLoan: currentLoan,
      history: currentLoan ? [currentLoan] : []
    };

    devices.push(device);
  }

  return devices;
}

export function exportStaffToCSV(staff: StaffMember[]): string {
  const headers = ["id", "name", "email", "department", "employmentStatus", "avatarUrl"];
  const rows = staff.map((s) => {
    return [
      s.id,
      s.name,
      s.email,
      s.department,
      s.employmentStatus || "Full-Time",
      s.avatarUrl
    ].map(escapeCSVField).join(",");
  });

  return [headers.join(","), ...rows].join("\n");
}

function normalizeEmploymentStatus(raw?: string): EmploymentStatus {
  if (!raw) return "Full-Time";
  const match = EMPLOYMENT_STATUSES.find(
    (s) => s.toLowerCase() === raw.trim().toLowerCase()
  );
  return match || "Full-Time";
}

export function parseStaffFromCSV(csvText: string): Partial<StaffMember>[] {
  const parsed = parseCSV(csvText);
  if (parsed.length <= 1) return [];

  const headers = parsed[0].map(h => h.trim().toLowerCase());
  const staffMembers: Partial<StaffMember>[] = [];

  for (let i = 1; i < parsed.length; i++) {
    const row = parsed[i];
    if (row.length === 0 || (row.length === 1 && row[0] === "")) continue;

    const record: any = {};
    headers.forEach((header, index) => {
      record[header] = row[index] !== undefined ? row[index].trim() : "";
    });

    if (!record.name || !record.email) continue;

    const staff: Partial<StaffMember> = {
      id: record.id || `staff-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      name: record.name,
      email: record.email,
      department: record.department || "Engineering",
      employmentStatus: normalizeEmploymentStatus(record.employmentstatus),
      avatarUrl: record.avatarurl || `https://images.unsplash.com/photo-${1500000000000 + Math.floor(Math.random() * 999999)}?auto=format&fit=crop&q=80&w=120`
    };

    staffMembers.push(staff);
  }

  return staffMembers;
}
