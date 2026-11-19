import { Device, StaffMember, Subscription } from "./types";

export const INITIAL_SUBSCRIPTIONS: Subscription[] = [
  {
    id: "sub-1",
    name: "Google Workspace Enterprise",
    url: "https://admin.google.com",
    username: "admin@company.com",
    password: "GSuite#2026!Secure",
    renewalDate: "2026-08-15",
    remarks: "Includes Gmail, Drive, Meet 5TB/user. Auto-renewal enabled with business credit card ending in 4092.",
    category: "SaaS & Software",
    cost: 1440,
    billingCycle: "Annual",
    status: "Active",
    contactPerson: "IT Administrator"
  },
  {
    id: "sub-2",
    name: "Amazon Web Services (AWS)",
    url: "https://console.aws.amazon.com",
    username: "cloud-admin@company.com",
    password: "Aws$Root9821#Key",
    renewalDate: "2026-08-01",
    remarks: "Main production Cloud infrastructure (EC2, S3, RDS). Reserved instances renewal due.",
    category: "Cloud Infrastructure",
    cost: 450,
    billingCycle: "Monthly",
    status: "Pending Renewal",
    contactPerson: "DevOps Lead"
  },
  {
    id: "sub-3",
    name: "GitHub Enterprise Cloud",
    url: "https://github.com/organizations/company",
    username: "dev-admin@company.com",
    password: "Git#HubSecret2026",
    renewalDate: "2026-11-20",
    remarks: "50 developer seats + GitHub Actions runner credits.",
    category: "SaaS & Software",
    cost: 1250,
    billingCycle: "Monthly",
    status: "Active",
    contactPerson: "Engineering Manager"
  },
  {
    id: "sub-4",
    name: "Cloudflare Business SSL & CDN",
    url: "https://dash.cloudflare.com",
    username: "security@company.com",
    password: "CF#Shield!2026",
    renewalDate: "2026-09-10",
    remarks: "Primary DNS, WAF rules, DDoS protection, and SSL wildcards for company domains.",
    category: "Domain & Hosting",
    cost: 200,
    billingCycle: "Monthly",
    status: "Active",
    contactPerson: "Systems Admin"
  },
  {
    id: "sub-5",
    name: "Figma Organization Plan",
    url: "https://www.figma.com/files",
    username: "design-leads@company.com",
    password: "Fig#Design2026Pass",
    renewalDate: "2026-12-05",
    remarks: "Design system workspace & FigJam collaboration boards.",
    category: "SaaS & Software",
    cost: 540,
    billingCycle: "Annual",
    status: "Active",
    contactPerson: "Head of Product Design"
  }
];

export const STAFF_MEMBERS: StaffMember[] = [
  {
    id: "staff-1",
    name: "Elena Rostova",
    email: "elena.r@tealoan.co",
    department: "Engineering",
    employmentStatus: "Full-Time",
    avatarUrl: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=120"
  },
  {
    id: "staff-2",
    name: "Kenji Takahashi",
    email: "kenji.t@tealoan.co",
    department: "Product & Design",
    employmentStatus: "Full-Time",
    avatarUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=120"
  },
  {
    id: "staff-3",
    name: "Chloe Patel",
    email: "chloe.p@tealoan.co",
    department: "Marketing & Ops",
    employmentStatus: "Contractor",
    avatarUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=120"
  },
  {
    id: "staff-4",
    name: "Marcus Vance",
    email: "marcus.v@tealoan.co",
    department: "Customer Success",
    employmentStatus: "Full-Time",
    avatarUrl: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=120"
  },
  {
    id: "staff-5",
    name: "Priya Nair",
    email: "priya.n@tealoan.co",
    department: "Finance & HR",
    employmentStatus: "Part-Time",
    avatarUrl: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=120"
  },
  {
    id: "staff-6",
    name: "Liam Carter",
    email: "liam.c@tealoan.co",
    department: "IT & Systems",
    employmentStatus: "Full-Time",
    avatarUrl: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&q=80&w=120"
  }
];

export const INITIAL_DEVICES: Device[] = [
  {
    id: "dev-1",
    name: "MacBook Pro 16\"",
    model: "Apple M3 Max (36GB RAM, 1TB SSD)",
    serialNumber: "C02F89G3Q05D",
    category: "Laptops",
    status: "loaned",
    condition: "Excellent",
    purchaseDate: "2025-11-10",
    location: "IT Storage Room A",
    image: "laptop",
    notes: "Assigned high-performance machine for engineering compile loads.",
    currentLoan: {
      id: "loan-101",
      deviceId: "dev-1",
      userId: "staff-1",
      userName: "Elena Rostova",
      userEmail: "elena.r@tealoan.co",
      userDepartment: "Engineering",
      checkoutDate: "2026-06-15",
      expectedReturnDate: "2026-07-15",
      status: "active",
      notes: "Need for building local Docker environments and mobile compilation tests."
    },
    history: [
      {
        id: "loan-101",
        deviceId: "dev-1",
        userId: "staff-1",
        userName: "Elena Rostova",
        userEmail: "elena.r@tealoan.co",
        userDepartment: "Engineering",
        checkoutDate: "2026-06-15",
        expectedReturnDate: "2026-07-15",
        status: "active",
        notes: "Need for building local Docker environments and mobile compilation tests."
      },
      {
        id: "loan-90",
        deviceId: "dev-1",
        userId: "staff-2",
        userName: "Kenji Takahashi",
        userEmail: "kenji.t@tealoan.co",
        userDepartment: "Product & Design",
        checkoutDate: "2026-05-01",
        expectedReturnDate: "2026-05-15",
        returnedDate: "2026-05-14",
        status: "returned",
        notes: "Required for high-res Figma rendering and design review preparations.",
        conditionOnReturn: "Excellent"
      }
    ]
  },
  {
    id: "dev-2",
    name: "ThinkPad X1 Carbon Gen 11",
    model: "Intel Core i7, 32GB RAM, 512GB SSD",
    serialNumber: "PF36A89X",
    category: "Laptops",
    status: "available",
    condition: "Good",
    purchaseDate: "2025-08-04",
    location: "IT Storage Room A",
    image: "laptop-thinkpad",
    notes: "Super lightweight travel laptop with mechanical keyboard.",
    history: [
      {
        id: "loan-81",
        deviceId: "dev-2",
        userId: "staff-4",
        userName: "Marcus Vance",
        userEmail: "marcus.v@tealoan.co",
        userDepartment: "Customer Success",
        checkoutDate: "2026-04-10",
        expectedReturnDate: "2026-04-20",
        returnedDate: "2026-04-19",
        status: "returned",
        notes: "Visiting customer sites in Seattle.",
        conditionOnReturn: "Good"
      }
    ]
  },
  {
    id: "dev-3",
    name: "iPad Pro 12.9\" M2",
    model: "M2 Chip, Wi-Fi + Cellular (256GB, Space Gray)",
    serialNumber: "DLXFF89HG271",
    category: "Tablets & Phones",
    status: "loaned",
    condition: "Excellent",
    purchaseDate: "2025-06-12",
    location: "Device Cabinet B",
    image: "tablet",
    notes: "Includes Apple Pencil Gen 2. Excellent for UI drawing or client presentations.",
    currentLoan: {
      id: "loan-102",
      deviceId: "dev-3",
      userId: "staff-2",
      userName: "Kenji Takahashi",
      userEmail: "kenji.t@tealoan.co",
      userDepartment: "Product & Design",
      checkoutDate: "2026-06-28",
      expectedReturnDate: "2026-07-12",
      status: "active",
      notes: "Sketching new wireframes for the user portal overhaul."
    },
    history: [
      {
        id: "loan-102",
        deviceId: "dev-3",
        userId: "staff-2",
        userName: "Kenji Takahashi",
        userEmail: "kenji.t@tealoan.co",
        userDepartment: "Product & Design",
        checkoutDate: "2026-06-28",
        expectedReturnDate: "2026-07-12",
        status: "active",
        notes: "Sketching new wireframes for the user portal overhaul."
      },
      {
        id: "loan-65",
        deviceId: "dev-3",
        userId: "staff-3",
        userName: "Chloe Patel",
        userEmail: "chloe.p@tealoan.co",
        userDepartment: "Marketing & Ops",
        checkoutDate: "2026-03-01",
        expectedReturnDate: "2026-03-07",
        returnedDate: "2026-03-07",
        status: "returned",
        notes: "Displaying product mockups during the spring launch photoshoot.",
        conditionOnReturn: "Excellent"
      }
    ]
  },
  {
    id: "dev-4",
    name: "iPhone 15 Pro Max",
    model: "256GB, Titanium Black (iOS 17)",
    serialNumber: "F39HK01SAX82",
    category: "Tablets & Phones",
    status: "maintenance",
    condition: "Needs Service",
    purchaseDate: "2025-09-22",
    location: "IT Repair Bench",
    image: "phone",
    notes: "Rear glass is slightly cracked. Touch panel is fully functional, but needs glass replacement before re-loaning.",
    history: [
      {
        id: "loan-77",
        deviceId: "dev-4",
        userId: "staff-1",
        userName: "Elena Rostova",
        userEmail: "elena.r@tealoan.co",
        userDepartment: "Engineering",
        checkoutDate: "2026-05-15",
        expectedReturnDate: "2026-05-25",
        returnedDate: "2026-05-24",
        status: "returned",
        notes: "iOS build verification and notifications troubleshooting.",
        conditionOnReturn: "Needs Service"
      }
    ]
  },
  {
    id: "dev-5",
    name: "Dell UltraSharp 34\" Curved Monitor",
    model: "U3421WE, IPS Black, USB-C Hub",
    serialNumber: "CN-08HX23-112B",
    category: "Peripherals",
    status: "available",
    condition: "Excellent",
    purchaseDate: "2025-02-15",
    location: "IT Storage Room B",
    image: "monitor",
    notes: "Shipped in original box with standard USB-C and DisplayPort cables.",
    history: [
      {
        id: "loan-43",
        deviceId: "dev-5",
        userId: "staff-5",
        userName: "Priya Nair",
        userEmail: "priya.n@tealoan.co",
        userDepartment: "Finance & HR",
        checkoutDate: "2026-01-10",
        expectedReturnDate: "2026-02-10",
        returnedDate: "2026-02-09",
        status: "returned",
        notes: "Required temporary second screen for end-of-year tax audits.",
        conditionOnReturn: "Excellent"
      }
    ]
  },
  {
    id: "dev-6",
    name: "Bose QuietComfort Ultra Headphones",
    model: "Over-Ear, CustomTune Noise Cancelling",
    serialNumber: "846201AA992",
    category: "Peripherals",
    status: "loaned",
    condition: "Good",
    purchaseDate: "2025-04-18",
    location: "Device Cabinet B",
    image: "headphones",
    notes: "Excellent sound cancellation for concentration. Comes with travel pouch and auxiliary cable.",
    currentLoan: {
      id: "loan-103",
      deviceId: "dev-6",
      userId: "staff-3",
      userName: "Chloe Patel",
      userEmail: "chloe.p@tealoan.co",
      userDepartment: "Marketing & Ops",
      checkoutDate: "2026-06-10",
      expectedReturnDate: "2026-07-01", // Notice this is before current local time (2026-07-06), so it's OVERDUE!
      status: "overdue",
      notes: "Focusing on large-scale winter planning campaigns. Needs quiet."
    },
    history: [
      {
        id: "loan-103",
        deviceId: "dev-6",
        userId: "staff-3",
        userName: "Chloe Patel",
        userEmail: "chloe.p@tealoan.co",
        userDepartment: "Marketing & Ops",
        checkoutDate: "2026-06-10",
        expectedReturnDate: "2026-07-01",
        status: "overdue",
        notes: "Focusing on large-scale winter planning campaigns. Needs quiet."
      }
    ]
  },
  {
    id: "dev-7",
    name: "Fellow Stagg EKG Pro Smart Kettle",
    model: "Electric Gooseneck Kettle (Matte Black)",
    serialNumber: "STG-EKG-112",
    category: "Tea & Pantry",
    status: "loaned",
    condition: "Excellent",
    purchaseDate: "2025-10-01",
    location: "Main Office Breakroom Lounge",
    image: "kettle",
    notes: "Precision temperature kettle with custom flow control for high-grade loose leaf tea brewing. Crucial for office tea rituals.",
    currentLoan: {
      id: "loan-104",
      deviceId: "dev-7",
      userId: "staff-5",
      userName: "Priya Nair",
      userEmail: "priya.n@tealoan.co",
      userDepartment: "Finance & HR",
      checkoutDate: "2026-07-01",
      expectedReturnDate: "2026-07-15",
      status: "active",
      notes: "Loaning for local department tea-tasting bonding session."
    },
    history: [
      {
        id: "loan-104",
        deviceId: "dev-7",
        userId: "staff-5",
        userName: "Priya Nair",
        userEmail: "priya.n@tealoan.co",
        userDepartment: "Finance & HR",
        checkoutDate: "2026-07-01",
        expectedReturnDate: "2026-07-15",
        status: "active",
        notes: "Loaning for local department tea-tasting bonding session."
      },
      {
        id: "loan-88",
        deviceId: "dev-7",
        userId: "staff-1",
        userName: "Elena Rostova",
        userEmail: "elena.r@tealoan.co",
        userDepartment: "Engineering",
        checkoutDate: "2026-04-20",
        expectedReturnDate: "2026-04-22",
        returnedDate: "2026-04-22",
        status: "returned",
        notes: "Hosted the weekly developer coffee-to-tea masterclass.",
        conditionOnReturn: "Excellent"
      }
    ]
  },
  {
    id: "dev-8",
    name: "Breville Barista Touch Impress",
    model: "Touchscreen Automatic Tea-Brewer & Espresso Station",
    serialNumber: "BVT-980-BSS",
    category: "Tea & Pantry",
    status: "available",
    condition: "Excellent",
    purchaseDate: "2025-12-15",
    location: "Office Pantry Hub",
    image: "coffee",
    notes: "High-end hot water and custom steep profile setup. Can be checked out by departments for workshops or external events.",
    history: [
      {
        id: "loan-52",
        deviceId: "dev-8",
        userId: "staff-3",
        userName: "Chloe Patel",
        userEmail: "chloe.p@tealoan.co",
        userDepartment: "Marketing & Ops",
        checkoutDate: "2026-02-14",
        expectedReturnDate: "2026-02-16",
        returnedDate: "2026-02-16",
        status: "returned",
        notes: "Valentine's Day client open house tea service.",
        conditionOnReturn: "Excellent"
      }
    ]
  },
  {
    id: "dev-9",
    name: "Yeti Roadie 24 Hard Cooler",
    model: "Lightweight High-Thermal Food/Beverage Cooler",
    serialNumber: "YT-RD24-WHT",
    category: "Tea & Pantry",
    status: "available",
    condition: "Good",
    purchaseDate: "2025-05-20",
    location: "Breakroom Storage C",
    image: "cooler",
    notes: "Ideal for keeping iced teas, cold infusions, and snacks cold during outdoor team retreats.",
    history: [
      {
        id: "loan-59",
        deviceId: "dev-9",
        userId: "staff-6",
        userName: "Liam Carter",
        userEmail: "liam.c@tealoan.co",
        userDepartment: "IT & Systems",
        checkoutDate: "2026-03-12",
        expectedReturnDate: "2026-03-14",
        returnedDate: "2026-03-14",
        status: "returned",
        notes: "Loaning for server room installation weekend to keep beverages chilled for team.",
        conditionOnReturn: "Good"
      }
    ]
  },
  {
    id: "dev-10",
    name: "Wacom Cintiq Pro 16",
    model: "Creative Pen Display (4K Resolution)",
    serialNumber: "WCM-DTH167-2A",
    category: "Peripherals",
    status: "available",
    condition: "Good",
    purchaseDate: "2025-03-10",
    location: "Device Cabinet A",
    image: "wacom",
    notes: "Includes active stylus pen and custom desktop adjustable stand.",
    history: [
      {
        id: "loan-31",
        deviceId: "dev-10",
        userId: "staff-2",
        userName: "Kenji Takahashi",
        userEmail: "kenji.t@tealoan.co",
        userDepartment: "Product & Design",
        checkoutDate: "2025-11-01",
        expectedReturnDate: "2025-11-15",
        returnedDate: "2025-11-15",
        status: "returned",
        notes: "Product branding session graphics illustration.",
        conditionOnReturn: "Good"
      }
    ]
  }
];
