import React, { useState, useEffect } from "react";
import { Device, DeviceStatus, DeviceCondition, StaffMember, Subscription, LoanRecord, EmploymentStatus, EMPLOYMENT_STATUSES } from "./types";
import { INITIAL_DEVICES, INITIAL_SUBSCRIPTIONS, STAFF_MEMBERS } from "./data";
import DeviceTable from "./components/DeviceTable";
import DeviceDetails from "./components/DeviceDetails";
import RecentActivityFeed from "./components/RecentActivityFeed";
import CategoryAvailabilityCards from "./components/CategoryAvailabilityCards";
import AddDeviceModal from "./components/AddDeviceModal";
import SettingsModal from "./components/SettingsModal";
import SubscriptionDirectory from "./components/SubscriptionDirectory";
import { SYSTEM_TODAY, getTodayDateString, getLoanRemainingDays, formatFriendlyDate, getEmploymentStatusMeta } from "./utils";
import { applyLoanDateChanges } from "./loanDates";
import { 
  Search, 
  Plus, 
  Users, 
  Leaf, 
  CheckCircle2, 
  Filter,
  Building,
  Settings,
  LogOut,
  LogIn,
  ShieldCheck,
  Loader2,
  Laptop,
  Mail,
  Clock,
  UserCheck,
  AlertCircle,
  KeyRound,
  Briefcase,
  Edit2
} from "lucide-react";
import { auth, signInWithGoogle, logoutUser } from "./firebase";
import {
  ApiError,
  fetchDevices,
  saveDevice,
  deleteDevice,
  fetchStaff,
  saveStaff,
  deleteStaff,
  fetchCategories,
  saveCategory,
  deleteCategory,
  fetchDepartments,
  saveDepartment,
  deleteDepartment,
  fetchSubscriptions,
  saveSubscription,
  deleteSubscription
} from "./api";

export default function App() {
  // --- Auth & Sync State ---
  const [user, setUser] = useState<any>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState<string | null>(null);
  const [signInError, setSignInError] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);

  // Remove everything this app caches in the browser (including subscription passwords)
  const clearCachedData = () => {
    [
      "tealoan_devices",
      "tealoan_staff_members",
      "tealoan_subscriptions",
      "device_categories",
      "device_departments",
      "tealoan_superadmin",
    ].forEach((key) => localStorage.removeItem(key));
  };

  const handleSignOut = async () => {
    clearCachedData();
    await logoutUser();
  };

  const handleGoogleSignIn = async () => {
    setSignInError(null);
    setIsSigningIn(true);
    try {
      await signInWithGoogle();
    } catch (err: any) {
      const code: string = err?.code ?? "unknown";
      switch (code) {
        case "auth/popup-closed-by-user":
        case "auth/cancelled-popup-request":
          break;
        case "auth/unauthorized-domain":
          setSignInError("This web address isn't authorised for Google sign-in yet. Add it in Firebase console → Authentication → Settings → Authorized domains.");
          break;
        case "auth/popup-blocked":
          setSignInError("Your browser blocked the sign-in pop-up. Allow pop-ups for this site and try again.");
          break;
        case "auth/network-request-failed":
          setSignInError("Network error — check your connection and try again.");
          break;
        default:
          setSignInError("Google sign-in failed (" + code + "). Please try again.");
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  // --- 1. STATE INITIALIZATION ---
  const [devices, rawSetDevices] = useState<Device[]>([]);
  const [categories, rawSetCategories] = useState<string[]>(["Laptops", "Tablets & Phones", "Peripherals", "Tea & Pantry"]);
  const [staffMembers, rawSetStaffMembers] = useState<StaffMember[]>([]);
  const [departments, rawSetDepartments] = useState<string[]>(["Engineering", "Product & Design", "Marketing & Ops", "Customer Success", "Finance & HR", "IT & Systems", "Operations", "General Management", "Other"]);
  const [subscriptions, rawSetSubscriptions] = useState<Subscription[]>([]);

  // Wrapper setters to keep the SQL database synced in real-time
  const setSubscriptions = (update: React.SetStateAction<Subscription[]>) => {
    rawSetSubscriptions((prev) => {
      const next = typeof update === "function" ? (update as Function)(prev) : update;
      
      if (auth.currentUser) {
        const modified = next.filter((s: Subscription) => {
          const p = prev.find(x => x.id === s.id);
          return !p || JSON.stringify(p) !== JSON.stringify(s);
        });
        modified.forEach((sub: Subscription) => {
          saveSubscription(sub).catch(err => { console.error("Database sync error:", err); triggerToast("Couldn't save changes — please reload and try again."); });
        });
        
        const deleted = prev.filter((p: Subscription) => !next.some(s => s.id === p.id));
        deleted.forEach((sub: Subscription) => {
          deleteSubscription(sub.id).catch(err => { console.error("Database sync error:", err); triggerToast("Couldn't save changes — please reload and try again."); });
        });
      }
      
      localStorage.setItem("tealoan_subscriptions", JSON.stringify(next));
      return next;
    });
  };

  // Wrapper setters to keep the SQL database synced in real-time
  const setDevices = (update: React.SetStateAction<Device[]>) => {
    rawSetDevices((prev) => {
      const next = typeof update === "function" ? (update as Function)(prev) : update;
      
      // Sync only if signed in
      if (auth.currentUser) {
        // Find modified/added
        const modified = next.filter((d: Device) => {
          const p = prev.find(x => x.id === d.id);
          return !p || JSON.stringify(p) !== JSON.stringify(d);
        });
        modified.forEach((device: Device) => {
          saveDevice(device).catch(err => { console.error("Database sync error:", err); triggerToast("Couldn't save changes — please reload and try again."); });
        });
        
        // Find deleted
        const deleted = prev.filter((p: Device) => !next.some(d => d.id === p.id));
        deleted.forEach((device: Device) => {
          deleteDevice(device.id).catch(err => { console.error("Database sync error:", err); triggerToast("Couldn't save changes — please reload and try again."); });
        });
      }
      
      localStorage.setItem("tealoan_devices", JSON.stringify(next));
      return next;
    });
  };

  const setCategories = (update: React.SetStateAction<string[]>) => {
    rawSetCategories((prev) => {
      const next = typeof update === "function" ? (update as Function)(prev) : update;
      
      if (auth.currentUser) {
        // Find added/deleted
        const added = next.filter((c: string) => !prev.includes(c));
        const deleted = prev.filter((c: string) => !next.includes(c));
        
        added.forEach((catName: string) => {
          const catId = catName.toLowerCase().replace(/[^a-z0-9]/g, "-") || `cat-${Date.now()}`;
          saveCategory(catId, catName).catch(err => { console.error("Database sync error:", err); triggerToast("Couldn't save changes — please reload and try again."); });
        });
        deleted.forEach((catName: string) => {
          const catId = catName.toLowerCase().replace(/[^a-z0-9]/g, "-") || `cat-${Date.now()}`;
          deleteCategory(catId).catch(err => { console.error("Database sync error:", err); triggerToast("Couldn't save changes — please reload and try again."); });
        });
      }
      
      localStorage.setItem("device_categories", JSON.stringify(next));
      return next;
    });
  };

  const setStaffMembers = (update: React.SetStateAction<StaffMember[]>) => {
    rawSetStaffMembers((prev) => {
      const next = typeof update === "function" ? (update as Function)(prev) : update;
      
      if (auth.currentUser) {
        // Find added or modified
        const addedOrModified = next.filter((s: StaffMember) => {
          const p = prev.find(x => x.id === s.id);
          return !p || JSON.stringify(p) !== JSON.stringify(s);
        });
        const deleted = prev.filter((p: StaffMember) => !next.some(s => s.id === p.id));
        
        addedOrModified.forEach((staff: StaffMember) => {
          saveStaff(staff).catch(err => { console.error("Database sync error:", err); triggerToast("Couldn't save changes — please reload and try again."); });
        });
        deleted.forEach((staff: StaffMember) => {
          deleteStaff(staff.id).catch(err => { console.error("Database sync error:", err); triggerToast("Couldn't save changes — please reload and try again."); });
        });
      }
      
      localStorage.setItem("tealoan_staff_members", JSON.stringify(next));
      return next;
    });
  };

  const setDepartments = (update: React.SetStateAction<string[]>) => {
    rawSetDepartments((prev) => {
      const next = typeof update === "function" ? (update as Function)(prev) : update;
      
      if (auth.currentUser) {
        // Find added/deleted
        const added = next.filter((d: string) => !prev.includes(d));
        const deleted = prev.filter((d: string) => !next.includes(d));
        
        added.forEach((deptName: string) => {
          const deptId = deptName.toLowerCase().replace(/[^a-z0-9]/g, "-") || `dept-${Date.now()}`;
          saveDepartment(deptId, deptName).catch(err => { console.error("Database sync error:", err); triggerToast("Couldn't save changes — please reload and try again."); });
        });
        deleted.forEach((deptName: string) => {
          const deptId = deptName.toLowerCase().replace(/[^a-z0-9]/g, "-") || `dept-${Date.now()}`;
          deleteDepartment(deptId).catch(err => { console.error("Database sync error:", err); triggerToast("Couldn't save changes — please reload and try again."); });
        });
      }
      
      localStorage.setItem("device_departments", JSON.stringify(next));
      return next;
    });
  };

  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);

  // Active Main tab view ("devices", "staff", or "subscriptions")
  const [activeMainTab, setActiveMainTab] = useState<"devices" | "staff" | "subscriptions">("devices");

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [selectedStatus, setSelectedStatus] = useState<DeviceStatus | "overdue" | "All">("All");

  // Staff Search & Filter State
  const [staffSearchQuery, setStaffSearchQuery] = useState("");
  const [staffSelectedDept, setStaffSelectedDept] = useState("All");
  const [staffSelectedEmploymentStatus, setStaffSelectedEmploymentStatus] = useState<string>("All");

  // Modal control
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<"catalog" | "borrowers" | "backup" | "system">("catalog");
  const [editingBorrowerId, setEditingBorrowerId] = useState<string | null>(null);

  // Superadmin privileges state
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean>(() => localStorage.getItem("tealoan_superadmin") === "true");
  const [superAdminPin, setSuperAdminPin] = useState<string>(() => localStorage.getItem("tealoan_superadmin_pin") || "admin123");

  const handleUnlockSuperAdmin = (pin: string) => {
    if (pin.trim() === superAdminPin) {
      setIsSuperAdmin(true);
      localStorage.setItem("tealoan_superadmin", "true");
      triggerToast("Superadmin privileges granted.");
      return true;
    }
    return false;
  };

  const handleLockSuperAdmin = () => {
    setIsSuperAdmin(false);
    localStorage.removeItem("tealoan_superadmin");
    triggerToast("Superadmin mode deactivated.");
  };

  // Success indicator toast state (auto-fades)
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // --- 2. EFFECT FOR PERSISTENCE ---
  // Load local cache as instant fallback while auth initializes
  useEffect(() => {
    const cachedDevices = localStorage.getItem("tealoan_devices");
    const cachedCategories = localStorage.getItem("device_categories");
    const cachedStaff = localStorage.getItem("tealoan_staff_members");
    const cachedDepartments = localStorage.getItem("device_departments");
    const cachedSubscriptions = localStorage.getItem("tealoan_subscriptions");
    
    if (cachedDevices) {
      try { rawSetDevices(JSON.parse(cachedDevices)); } catch (e) {}
    } else {
      rawSetDevices(INITIAL_DEVICES);
    }
    
    if (cachedCategories) {
      try { rawSetCategories(JSON.parse(cachedCategories)); } catch (e) {}
    }
    
    if (cachedStaff) {
      try { rawSetStaffMembers(JSON.parse(cachedStaff)); } catch (e) {}
    }

    if (cachedDepartments) {
      try { rawSetDepartments(JSON.parse(cachedDepartments)); } catch (e) {}
    }

    if (cachedSubscriptions) {
      try { rawSetSubscriptions(JSON.parse(cachedSubscriptions)); } catch (e) {}
    } else {
      rawSetSubscriptions(INITIAL_SUBSCRIPTIONS);
    }
  }, []);

  // Listen to Auth state and load/seed cloud database
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (currentUser) => {
      setAccessDenied(null);

      // Leftover anonymous guest session from the old version: sign out, which
      // re-triggers this listener with no user and shows the sign-in screen.
      if (currentUser?.isAnonymous) {
        await logoutUser();
        return;
      }

      setUser(currentUser);

      if (currentUser) {
        setIsAuthLoading(true);
        try {
          // Fetch from the SQL database
          const dbDevices = await fetchDevices();
          const dbCategories = await fetchCategories();
          const dbStaff = await fetchStaff();
          const dbDepartments = await fetchDepartments();
          const dbSubscriptions = await fetchSubscriptions();
          
          // Seed if the database has absolutely no records (first run against an empty database)
          if (dbDevices.length === 0 && dbCategories.length === 0 && dbStaff.length === 0 && dbSubscriptions.length === 0) {
            console.log("Database is completely empty, seeding default data...");
            
            // Seed categories
            const defaultCategories = ["Laptops", "Tablets & Phones", "Peripherals", "Tea & Pantry"];
            for (const cat of defaultCategories) {
              const catId = cat.toLowerCase().replace(/[^a-z0-9]/g, "-") || `cat-${Date.now()}`;
              await saveCategory(catId, cat);
            }

            // Seed departments
            const defaultDepts = ["Engineering", "Product & Design", "Marketing & Ops", "Customer Success", "Finance & HR", "IT & Systems", "Operations", "General Management", "Other"];
            for (const dept of defaultDepts) {
              const deptId = dept.toLowerCase().replace(/[^a-z0-9]/g, "-") || `dept-${Date.now()}`;
              await saveDepartment(deptId, dept);
            }

            // Seed staff members
            for (const staff of STAFF_MEMBERS) {
              await saveStaff(staff);
            }
            
            // Seed devices
            for (const dev of INITIAL_DEVICES) {
              await saveDevice(dev);
            }

            // Seed subscriptions
            for (const sub of INITIAL_SUBSCRIPTIONS) {
              await saveSubscription(sub);
            }
            
            // Sync states
            const freshDevices = await fetchDevices();
            const freshCategories = await fetchCategories();
            const freshStaff = await fetchStaff();
            const freshDepts = await fetchDepartments();
            const freshSubs = await fetchSubscriptions();
            
            rawSetDevices(freshDevices.length > 0 ? freshDevices : INITIAL_DEVICES);
            rawSetCategories(freshCategories.length > 0 ? freshCategories : defaultCategories);
            rawSetStaffMembers(freshStaff.length > 0 ? freshStaff : STAFF_MEMBERS);
            rawSetDepartments(freshDepts.length > 0 ? freshDepts : defaultDepts);
            rawSetSubscriptions(freshSubs.length > 0 ? freshSubs : INITIAL_SUBSCRIPTIONS);
          } else {
            // Apply database loaded states exactly as the server returned them
            rawSetDevices(dbDevices);
            rawSetCategories(dbCategories);
            rawSetDepartments(dbDepartments);
            rawSetStaffMembers(dbStaff);
            rawSetSubscriptions(dbSubscriptions);
          }
        } catch (err) {
          console.error("Failed to load and seed database:", err);
          if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
            clearCachedData();
            setAccessDenied(currentUser.email ?? "This account");
          } else {
            triggerToast("Error connecting to cloud database.");
          }
        } finally {
          setIsAuthLoading(false);
        }
      } else {
        // Signed out: don't keep a previous user's data in memory
        rawSetDevices([]);
        rawSetCategories([]);
        rawSetStaffMembers([]);
        rawSetDepartments([]);
        rawSetSubscriptions([]);
        setIsAuthLoading(false);
      }
    });
    
    return () => unsubscribe();
  }, []);

  // Toast cleanup effect
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
  };

  // --- 3. INVENTORY STATE CONTROLLERS ---

  // CHECKOUT: Assigns device to a user with start and end dates
  const handleCheckout = (
    deviceId: string, 
    userId: string, 
    checkoutDate: string, 
    expectedReturnDate: string, 
    notes: string,
    customBorrower?: { name: string; email: string; department: string; employmentStatus?: EmploymentStatus }
  ) => {
    let borrower = staffMembers.find((s) => s.id === userId);

    if (!borrower && customBorrower && customBorrower.name.trim()) {
      borrower = {
        id: `staff-${Date.now()}`,
        name: customBorrower.name.trim(),
        email: customBorrower.email.trim() || `${customBorrower.name.trim().toLowerCase().replace(/\s+/g, ".")}@tealoan.co`,
        department: customBorrower.department.trim() || "General",
        employmentStatus: customBorrower.employmentStatus || "Full-Time",
        avatarUrl: `https://images.unsplash.com/photo-${1500000000000 + Math.floor(Math.random() * 999999)}?auto=format&fit=crop&q=80&w=120`
      };
      setStaffMembers((prev) => [...prev, borrower!]);
    }

    if (!borrower) {
      triggerToast("Error: Borrower record could not be found.");
      return;
    }

    setDevices((prevDevices) =>
      prevDevices.map((device) => {
        if (device.id !== deviceId) return device;

        const newLoanRecord: LoanRecord = {
          id: `loan-${Date.now()}`,
          deviceId,
          userId: borrower!.id,
          userName: borrower!.name,
          userEmail: borrower!.email,
          userDepartment: borrower!.department,
          checkoutDate,
          expectedReturnDate,
          status: "active" as const
        };

        if (notes && notes.trim()) {
          newLoanRecord.notes = notes.trim();
        }

        return {
          ...device,
          status: "loaned",
          currentLoan: newLoanRecord,
          history: [newLoanRecord, ...device.history]
        };
      })
    );
    triggerToast(`Successfully checked out item to ${borrower.name}.`);
  };

  // RETURN: Closes active loan
  const handleReturn = (deviceId: string, returnCondition: DeviceCondition, notes: string) => {
    setDevices((prevDevices) =>
      prevDevices.map((device) => {
        if (device.id !== deviceId || !device.currentLoan) return device;

        const updatedCurrentLoan = {
          ...device.currentLoan,
          returnedDate: SYSTEM_TODAY,
          conditionOnReturn: returnCondition,
          status: "returned" as const,
          notes: notes.trim() ? `${device.currentLoan.notes ? device.currentLoan.notes + " | " : ""}Return note: ${notes}` : device.currentLoan.notes
        };

        // Update the active loan inside history array
        const updatedHistory = device.history.map((record) => {
          if (record.id === device.currentLoan?.id) {
            return updatedCurrentLoan;
          }
          return record;
        });

        return {
          ...device,
          status: "available",
          condition: returnCondition,
          currentLoan: undefined,
          history: updatedHistory
        };
      })
    );
    triggerToast(`Hardware successfully returned and marked as ${returnCondition}.`);
  };

  // RESOLVE MAINTENANCE: Completes repairs
  const handleCompleteMaintenance = (deviceId: string, finalCondition: DeviceCondition, notes: string) => {
    setDevices((prevDevices) =>
      prevDevices.map((device) => {
        if (device.id !== deviceId) return device;

        // Append to history as a service record
        const serviceRecord = {
          id: `service-${Date.now()}`,
          deviceId,
          userId: "admin-it",
          userName: "IT Service Bench",
          userEmail: "tan.kq.alexander@gmail.com",
          userDepartment: "IT Support",
          checkoutDate: SYSTEM_TODAY,
          expectedReturnDate: SYSTEM_TODAY,
          returnedDate: SYSTEM_TODAY,
          status: "returned" as const,
          notes: `Maintenance Completed: ${notes}`,
          conditionOnReturn: finalCondition
        };

        return {
          ...device,
          status: "available",
          condition: finalCondition,
          notes: `Last Serviced: ${SYSTEM_TODAY}. Notes: ${notes}`,
          history: [serviceRecord, ...device.history]
        };
      })
    );
    triggerToast("Device successfully serviced and returned to active inventory.");
  };

  // SEND TO MAINTENANCE: Flags device for repairs
  const handleSendToMaintenance = (deviceId: string, notes: string) => {
    setDevices((prevDevices) =>
      prevDevices.map((device) => {
        if (device.id !== deviceId) return device;
        return {
          ...device,
          status: "maintenance",
          condition: "Needs Service",
          notes: `Service issue reported: ${notes}`
        };
      })
    );
    triggerToast("Equipment dispatched to the IT service bench.");
  };

  // RETIRE: Flags device as permanently out of service
  const handleRetireDevice = (deviceId: string) => {
    setDevices((prevDevices) =>
      prevDevices.map((device) => {
        if (device.id !== deviceId) return device;
        return {
          ...device,
          status: "retired",
          currentLoan: undefined
        };
      })
    );
    triggerToast("Equipment successfully retired from active circulation.");
  };

  // DELETE: Deletes device permanently
  const handleDeleteDevice = (deviceId: string) => {
    setDevices((prevDevices) => prevDevices.filter((device) => device.id !== deviceId));
    setSelectedDeviceId(null);
    triggerToast("Equipment record and loan history permanently deleted.");
  };

  // DELETE HISTORY RECORD: Superadmin action to remove single history entry
  const handleDeleteHistoryRecord = (deviceId: string, historyRecordId: string) => {
    setDevices((prevDevices) =>
      prevDevices.map((device) => {
        if (device.id !== deviceId) return device;
        const updatedHistory = device.history.filter((r) => r.id !== historyRecordId);
        let updatedCurrentLoan = device.currentLoan;
        let newStatus = device.status;
        if (device.currentLoan && device.currentLoan.id === historyRecordId) {
          updatedCurrentLoan = undefined;
          if (device.status === "loaned") {
            newStatus = "available";
          }
        }
        return {
          ...device,
          currentLoan: updatedCurrentLoan,
          status: newStatus,
          history: updatedHistory
        };
      })
    );
    triggerToast("History record removed by Superadmin.");
  };

  // EDIT DEVICE: Updates device details
  const handleEditDevice = (deviceId: string, updatedFields: Partial<Device>) => {
    setDevices((prevDevices) =>
      prevDevices.map((device) => {
        if (device.id !== deviceId) return device;
        return {
          ...device,
          ...updatedFields
        };
      })
    );
    triggerToast("Equipment details updated successfully.");
  };

  // EDIT LOAN DATES: updates both the history entry and (if active) currentLoan
  const handleEditLoanDates = (
    deviceId: string,
    loanId: string,
    changes: { checkoutDate?: string; expectedReturnDate?: string; returnedDate?: string }
  ) => {
    setDevices((prevDevices) =>
      prevDevices.map((device) =>
        device.id === deviceId ? applyLoanDateChanges(device, loanId, changes) : device
      )
    );
    triggerToast("Loan dates updated.");
  };

  // ADD NEW DEVICE: Inserts a fresh device record
  const handleAddDevice = (deviceData: Omit<Device, "id" | "history">) => {
    const newDevice: Device = {
      ...deviceData,
      id: `dev-${Date.now()}`,
      history: []
    };

    setDevices((prev) => [newDevice, ...prev]);
    setSelectedDeviceId(newDevice.id);
    triggerToast(`"${newDevice.name}" added successfully.`);
  };

  // BULK ADD DEVICES: Inserts multiple fresh device records from CSV
  const handleAddDevices = (devicesData: Omit<Device, "id" | "history">[]) => {
    const newDevices: Device[] = devicesData.map((device, idx) => ({
      ...device,
      id: `dev-${Date.now()}-${idx}`,
      history: []
    }));

    setDevices((prev) => [...newDevices, ...prev]);
    if (newDevices.length > 0) {
      setSelectedDeviceId(newDevices[0].id);
    }
    triggerToast(`Successfully imported ${newDevices.length} devices from CSV.`);
  };

  // SUBSCRIPTION HANDLERS
  const handleAddSubscription = (newSubData: Omit<Subscription, "id">) => {
    const newSub: Subscription = {
      ...newSubData,
      id: `sub-${Date.now()}`
    };
    setSubscriptions(prev => [newSub, ...prev]);
  };

  const handleUpdateSubscription = (updatedSub: Subscription) => {
    setSubscriptions(prev => prev.map(s => s.id === updatedSub.id ? updatedSub : s));
  };

  const handleDeleteSubscription = (id: string) => {
    setSubscriptions(prev => prev.filter(s => s.id !== id));
  };

  // RESET DATABASE: Re-seeds original initial arrays
  const handleResetData = () => {
    if (confirm("Reset inventory data back to default preset? This will clear all custom checkouts and devices you added.")) {
      setDevices(INITIAL_DEVICES);
      setSelectedDeviceId(null);
      triggerToast("System inventory reset to default presets.");
    }
  };

  // CLEAR ALL DATA: Entirely wipes the device catalog
  const handleClearAllData = () => {
    if (confirm("Delete ALL devices and their checkout history from the database? Staff, categories, departments and subscriptions are kept. This cannot be undone.")) {
      setDevices([]);
      setSelectedDeviceId(null);
      triggerToast("All data successfully removed from database.");
    }
  };

  // --- 4. DATA FILTERING LOGIC ---
  const filteredDevices = devices.filter((device) => {
    // A. Text Search Match (Name, Model, Serial, or Borrower)
    const matchesSearch = 
      device.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      device.model.toLowerCase().includes(searchQuery.toLowerCase()) ||
      device.serialNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (device.currentLoan?.userName || "").toLowerCase().includes(searchQuery.toLowerCase());

    // B. Category Filter Match
    const matchesCategory = selectedCategory === "All" || device.category === selectedCategory;

    // C. Status Filter Match
    let matchesStatus = true;
    if (selectedStatus !== "All") {
      if (selectedStatus === "overdue") {
        const remaining = device.currentLoan ? getLoanRemainingDays(device.currentLoan.expectedReturnDate) : null;
        matchesStatus = device.status === "loaned" && (remaining?.isOverdue ?? false);
      } else {
        matchesStatus = device.status === selectedStatus;
      }
    }

    return matchesSearch && matchesCategory && matchesStatus;
  });

  // --- 5. STAFF DATA FILTERING & METRICS ---
  const filteredStaff = staffMembers.filter((staff) => {
    const matchesSearch = 
      staff.name.toLowerCase().includes(staffSearchQuery.toLowerCase()) ||
      staff.email.toLowerCase().includes(staffSearchQuery.toLowerCase());
    
    const matchesDept = staffSelectedDept === "All" || staff.department === staffSelectedDept;
    const effectiveStatus = staff.employmentStatus || "Full-Time";
    const matchesEmploymentStatus = staffSelectedEmploymentStatus === "All" || effectiveStatus === staffSelectedEmploymentStatus;
    
    return matchesSearch && matchesDept && matchesEmploymentStatus;
  });

  const totalActiveLoans = devices.filter((d) => d.status === "loaned").length;
  const totalOverdueLoans = devices.filter((d) => {
    if (d.status !== "loaned" || !d.currentLoan) return false;
    const remaining = getLoanRemainingDays(d.currentLoan.expectedReturnDate);
    return remaining.isOverdue;
  }).length;

  const selectedDevice = devices.find((d) => d.id === selectedDeviceId) || null;

  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-warm-gray-50 flex flex-col items-center justify-center font-sans">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 text-matcha-600 animate-spin" />
          <p className="text-xs font-semibold text-warm-gray-800">Loading inventory...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-warm-gray-50 flex flex-col items-center justify-center font-sans p-4 selection:bg-matcha-200">
        <div className="w-full max-w-sm bg-white border border-matcha-100 rounded-2xl p-8 shadow-md space-y-6 text-center animate-in fade-in duration-500">
          <div className="inline-flex p-3.5 bg-matcha-50 rounded-xl text-matcha-700 mx-auto">
            <Leaf className="h-7 w-7" />
          </div>
          
          <div className="space-y-1">
            <h1 className="font-bold text-xl text-warm-gray-900 tracking-tight font-display">Mavis Device Inventory</h1>
            <p className="text-[10px] uppercase font-bold tracking-wider text-matcha-700 bg-matcha-100/50 px-2 py-0.5 rounded-full inline-block">
              Admin Hub
            </p>
          </div>

          <div className="py-2.5 border-y border-warm-gray-100 text-xs text-warm-gray-800 space-y-2 text-center">
            <p>Team Hardware Loan & Appliance Inventory Management.</p>
            <div className="flex items-center justify-center gap-1.5 text-matcha-700 font-medium bg-matcha-50/50 py-1.5 rounded-lg text-[11px]">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Google sign-in required</span>
            </div>
          </div>

          <button
            onClick={handleGoogleSignIn}
            disabled={isSigningIn}
            className="w-full inline-flex items-center justify-center gap-2 bg-matcha-600 hover:bg-matcha-700 text-white font-semibold text-xs px-4 py-2.5 rounded-xl transition-colors cursor-pointer group active:scale-98 shadow-xs disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <LogIn className="h-3.5 w-3.5" />
            <span>Sign in with Google</span>
          </button>
          {signInError && (
            <p className="text-xs text-red-600 text-center" role="alert">{signInError}</p>
          )}
        </div>
      </div>
    );
  }

  if (accessDenied) {
    return (
      <div className="min-h-screen bg-warm-gray-50 flex flex-col items-center justify-center font-sans p-4 selection:bg-matcha-200">
        <div className="w-full max-w-sm bg-white border border-matcha-100 rounded-2xl p-8 shadow-md space-y-6 text-center animate-in fade-in duration-500">
          <div className="inline-flex p-3.5 bg-matcha-50 rounded-xl text-matcha-700 mx-auto">
            <Leaf className="h-7 w-7" />
          </div>

          <div className="space-y-1">
            <h1 className="font-bold text-xl text-warm-gray-900 tracking-tight font-display">Access denied</h1>
          </div>

          <div className="py-2.5 border-y border-warm-gray-100 text-xs text-warm-gray-800 space-y-2 text-center">
            <p>
              <span className="font-semibold break-all">{accessDenied}</span> isn't approved for Mavis Device Inventory.
              Ask the administrator to add your Google account, or sign in with a different account.
            </p>
          </div>

          <button
            onClick={handleSignOut}
            className="w-full inline-flex items-center justify-center gap-2 bg-matcha-600 hover:bg-matcha-700 text-white font-semibold text-xs px-4 py-2.5 rounded-xl transition-colors cursor-pointer group active:scale-98 shadow-xs"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Sign out</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-warm-gray-50 flex flex-col font-sans selection:bg-matcha-200">

      {/* Dynamic Success Toast banner */}
      {toastMessage && (
        <div className="fixed top-4 right-4 z-50 bg-matcha-900 text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 border border-matcha-700 animate-in fade-in slide-in-from-top-4 duration-300">
          <CheckCircle2 className="h-5 w-5 text-matcha-300" />
          <span className="text-xs font-semibold">{toastMessage}</span>
        </div>
      )}

      {/* Primary Top Header */}
      <header className="bg-white border-b border-matcha-100 sticky top-0 z-40 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-col sm:flex-row justify-between items-center gap-3">
          {/* Logo Brand area */}
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-matcha-600 rounded-xl text-white shadow-xs">
              <Leaf className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-lg text-warm-gray-900 tracking-tight font-display">Mavis Device Inventory</h1>
                <span className="text-[10px] uppercase font-bold tracking-wider bg-matcha-100 text-matcha-800 px-1.5 py-0.5 rounded">
                  Admin Hub
                </span>
              </div>
              <p className="text-[11px] text-warm-gray-800 font-medium">Team Appliance & Device Loan Management</p>
            </div>
          </div>

          {/* User metadata & Calendar reference */}
          <div className="flex items-center gap-4 text-xs">
            <div className="text-right hidden md:block">
              <span className="block text-warm-gray-800 font-mono font-medium">
                Current Date: <span className="text-matcha-700 font-semibold">{formatFriendlyDate(getTodayDateString())}</span>
              </span>
              <span className="text-[10px] text-warm-gray-800 truncate max-w-[200px] block">
                Logged in: {user?.email}
              </span>
            </div>
            
            <div className="flex gap-2">
              {isSuperAdmin ? (
                <button
                  onClick={handleLockSuperAdmin}
                  className="inline-flex items-center gap-1 bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer shadow-xs"
                  title="Superadmin Privileges Unlocked (Click to lock)"
                >
                  <ShieldCheck className="h-3.5 w-3.5 text-amber-700 shrink-0" />
                  <span>Superadmin Active</span>
                </button>
              ) : (
                <button
                  onClick={() => {
                    setSettingsTab("system");
                    setIsSettingsOpen(true);
                  }}
                  className="inline-flex items-center gap-1 bg-warm-gray-100 hover:bg-warm-gray-200 text-warm-gray-800 px-2.5 py-1.5 rounded-lg border border-warm-gray-200 transition-colors cursor-pointer text-xs font-medium"
                  title="Unlock Superadmin Mode"
                >
                  <KeyRound className="h-3.5 w-3.5 text-warm-gray-700 shrink-0" />
                  <span>Superadmin Mode</span>
                </button>
              )}
              <button
                onClick={() => setIsSettingsOpen(true)}
                className="inline-flex items-center gap-1 bg-warm-gray-100 hover:bg-warm-gray-200 text-warm-gray-800 px-3 py-1.5 rounded-lg border border-warm-gray-200 transition-colors cursor-pointer text-xs font-medium"
                title="Customize Inventory Categories & Database Administration"
              >
                <Settings className="h-3.5 w-3.5 text-matcha-700" />
                Settings
              </button>
              <button
                onClick={() => setIsAddModalOpen(true)}
                className="inline-flex items-center gap-1 bg-matcha-600 hover:bg-matcha-700 text-white px-3 py-1.5 rounded-lg transition-colors cursor-pointer text-xs font-semibold shadow-xs"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Device
              </button>
              <button
                onClick={handleSignOut}
                className="inline-flex items-center gap-1 bg-rose-50 hover:bg-rose-100 text-rose-700 px-2.5 py-1.5 rounded-lg border border-rose-100 transition-colors cursor-pointer text-xs font-semibold shadow-xs"
                title="Sign Out of Inventory Hub"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 w-full flex flex-col gap-6">

        {/* Main Navigation Tabs */}
        <div className="flex border-b border-matcha-100 bg-white rounded-t-2xl px-4 pt-1 shadow-xs border-x border-t overflow-x-auto">
          <button
            onClick={() => setActiveMainTab("devices")}
            className={`flex items-center gap-2 py-3.5 px-5 sm:px-6 text-xs sm:text-sm font-semibold transition-all relative border-b-2 -mb-px cursor-pointer shrink-0 ${
              activeMainTab === "devices"
                ? "text-matcha-850 border-matcha-600 bg-matcha-50/10 font-bold"
                : "text-warm-gray-800 hover:text-warm-gray-950 border-transparent hover:bg-warm-gray-50/30"
            }`}
          >
            <Laptop className="h-4 w-4 text-matcha-700" />
            <span>Equipment Catalog</span>
            <span className="bg-warm-gray-100 text-warm-gray-800 px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold shrink-0">
              {devices.length}
            </span>
          </button>
          <button
            onClick={() => setActiveMainTab("staff")}
            className={`flex items-center gap-2 py-3.5 px-5 sm:px-6 text-xs sm:text-sm font-semibold transition-all relative border-b-2 -mb-px cursor-pointer shrink-0 ${
              activeMainTab === "staff"
                ? "text-matcha-850 border-matcha-600 bg-matcha-50/10 font-bold"
                : "text-warm-gray-800 hover:text-warm-gray-950 border-transparent hover:bg-warm-gray-50/30"
            }`}
          >
            <Users className="h-4 w-4 text-matcha-700" />
            <span>Borrower Directory</span>
            <span className="bg-warm-gray-100 text-warm-gray-800 px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold shrink-0">
              {staffMembers.length}
            </span>
          </button>
          <button
            onClick={() => setActiveMainTab("subscriptions")}
            className={`flex items-center gap-2 py-3.5 px-5 sm:px-6 text-xs sm:text-sm font-semibold transition-all relative border-b-2 -mb-px cursor-pointer shrink-0 ${
              activeMainTab === "subscriptions"
                ? "text-matcha-850 border-matcha-600 bg-matcha-50/10 font-bold"
                : "text-warm-gray-800 hover:text-warm-gray-950 border-transparent hover:bg-warm-gray-50/30"
            }`}
          >
            <KeyRound className="h-4 w-4 text-matcha-700" />
            <span>Subscriptions & Credentials</span>
            <span className="bg-warm-gray-100 text-warm-gray-800 px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold shrink-0">
              {subscriptions.length}
            </span>
          </button>
        </div>

        {/* Tab Selection Content */}
        {activeMainTab === "devices" ? (
          <div className="flex flex-col gap-6 flex-1 w-full animate-in fade-in duration-300">
            
            <CategoryAvailabilityCards
              devices={devices}
              categories={categories}
              selectedCategory={selectedCategory}
              selectedStatus={selectedStatus}
              onSelectCategory={(category) => {
                const isActive = selectedCategory === category && selectedStatus === "available";
                setSelectedCategory(isActive ? "All" : category);
                setSelectedStatus(isActive ? "All" : "available");
                if (!isActive) {
                  setTimeout(() => {
                    document.getElementById("catalog-filters")?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }, 0);
                }
              }}
            />

            {/* Recent Activity Feed Section for Quick Monitoring */}
            <RecentActivityFeed 
              devices={devices} 
              onSelectDevice={setSelectedDeviceId} 
            />

            <section className="space-y-6 w-full">
              
              {/* Search & Filter Controls */}
              <div id="catalog-filters" className="bg-white border border-matcha-100 rounded-b-2xl rounded-tr-2xl p-4 shadow-xs space-y-4 border-t-0">
                <div className="flex flex-col sm:flex-row gap-3">
                {/* Search Bar */}
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-warm-gray-800" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by device, specifications, serial, or staff name..."
                    className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-warm-gray-200 focus:outline-none focus:ring-2 focus:ring-matcha-500 bg-warm-gray-50/50"
                  />
                </div>

                {/* Status Dropdown */}
                <div className="flex items-center gap-2 sm:w-48">
                  <Filter className="h-3.5 w-3.5 text-warm-gray-800" />
                  <select
                    value={selectedStatus}
                    onChange={(e) => setSelectedStatus(e.target.value as any)}
                    className="w-full text-xs p-2 rounded-xl border border-warm-gray-200 focus:outline-none focus:ring-2 focus:ring-matcha-500 bg-white"
                  >
                    <option value="All">All Statuses</option>
                    <option value="available">Available</option>
                    <option value="loaned">Checked Out</option>
                    <option value="overdue">Overdue Items</option>
                    <option value="maintenance">In Maintenance</option>
                    <option value="retired">Retired</option>
                  </select>
                </div>
              </div>

              {/* Category Badge Pill Selector */}
              <div className="flex flex-wrap items-center gap-1.5 border-t border-warm-gray-100 pt-3 text-xs">
                <span className="text-warm-gray-800 font-semibold mr-1">Categories:</span>
                {(["All", ...categories]).map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-all cursor-pointer ${selectedCategory === cat ? "bg-matcha-600 border-matcha-600 text-white font-semibold" : "bg-warm-gray-50 border-warm-gray-200 hover:bg-warm-gray-100 text-warm-gray-900"}`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Device Inventory Feed Grid */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <h3 className="font-bold text-sm text-warm-gray-900 font-display flex items-center gap-1.5">
                  <span>Hardware Catalog</span>
                  <span className="bg-matcha-100 text-matcha-800 px-2 py-0.5 rounded-full text-xs font-mono">
                    {filteredDevices.length} items found
                  </span>
                </h3>
                {searchQuery || selectedCategory !== "All" || selectedStatus !== "All" ? (
                  <button
                    onClick={() => {
                      setSearchQuery("");
                      setSelectedCategory("All");
                      setSelectedStatus("All");
                    }}
                    className="text-xs text-matcha-700 hover:underline cursor-pointer"
                  >
                    Clear Filter Filters
                  </button>
                ) : null}
              </div>

              {filteredDevices.length === 0 ? (
                <div className="text-center py-12 px-4 bg-white border border-matcha-100 rounded-2xl">
                  <p className="text-sm text-warm-gray-800">No devices match your active search terms or filter selection.</p>
                  <button 
                    onClick={() => { setSearchQuery(""); setSelectedCategory("All"); setSelectedStatus("All"); }}
                    className="mt-3 text-xs font-semibold text-matcha-700 underline"
                  >
                    Reset and show all devices
                  </button>
                </div>
              ) : (
                <DeviceTable
                  devices={filteredDevices}
                  selectedDeviceId={selectedDeviceId}
                  onSelectDevice={setSelectedDeviceId}
                />
              )}
            </div>

          </section>

        </div>
        ) : activeMainTab === "staff" ? (
          <div className="flex flex-col gap-6 flex-1 w-full animate-in fade-in duration-300">
            
            {/* Staff Stats Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white border border-matcha-100 rounded-2xl p-4 shadow-xs flex items-center gap-3">
                <div className="p-3 bg-matcha-50 rounded-xl text-matcha-750 shrink-0">
                  <Users className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wider font-bold text-warm-gray-800">Total Registered Borrowers</p>
                  <p className="text-xl font-bold text-warm-gray-950 leading-tight mt-0.5">{staffMembers.length}</p>
                </div>
              </div>
              <div className="bg-white border border-matcha-100 rounded-2xl p-4 shadow-xs flex items-center gap-3">
                <div className="p-3 bg-indigo-50 rounded-xl text-indigo-700 shrink-0">
                  <Laptop className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wider font-bold text-warm-gray-800">Active Checked Out Items</p>
                  <p className="text-xl font-bold text-warm-gray-950 leading-tight mt-0.5">{totalActiveLoans}</p>
                </div>
              </div>
              <div className="bg-white border border-matcha-100 rounded-2xl p-4 shadow-xs flex items-center gap-3">
                <div className={`p-3 rounded-xl shrink-0 ${totalOverdueLoans > 0 ? "bg-rose-100 text-rose-700 animate-pulse" : "bg-warm-gray-100 text-warm-gray-800"}`}>
                  <AlertCircle className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wider font-bold text-warm-gray-800">Overdue Loan Alerts</p>
                  <p className={`text-xl font-bold leading-tight mt-0.5 ${totalOverdueLoans > 0 ? "text-rose-600" : "text-warm-gray-950"}`}>
                    {totalOverdueLoans}
                  </p>
                </div>
              </div>
            </div>

            {/* Staff Search & Filter Control Bar */}
            <div className="bg-white border border-matcha-100 rounded-2xl p-4 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row gap-3">
                {/* Staff Search Input */}
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-warm-gray-800" />
                  <input
                    type="text"
                    value={staffSearchQuery}
                    onChange={(e) => setStaffSearchQuery(e.target.value)}
                    placeholder="Search registered staff members by name or email..."
                    className="w-full pl-9 pr-4 py-2.5 text-xs rounded-xl border border-warm-gray-200 focus:outline-none focus:ring-2 focus:ring-matcha-500 bg-warm-gray-50/50"
                  />
                </div>

                {/* Staff Department Filter */}
                <div className="flex items-center gap-2 sm:w-52">
                  <Filter className="h-3.5 w-3.5 text-warm-gray-800 shrink-0" />
                  <select
                    value={staffSelectedDept}
                    onChange={(e) => setStaffSelectedDept(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-xl border border-warm-gray-200 focus:outline-none focus:ring-2 focus:ring-matcha-500 bg-white text-warm-gray-900 font-semibold cursor-pointer"
                  >
                    <option value="All">All Departments</option>
                    {departments.map((dept) => (
                      <option key={dept} value={dept}>{dept}</option>
                    ))}
                  </select>
                </div>

                {/* Staff Employment Status Filter */}
                <div className="flex items-center gap-2 sm:w-52">
                  <Briefcase className="h-3.5 w-3.5 text-warm-gray-800 shrink-0" />
                  <select
                    value={staffSelectedEmploymentStatus}
                    onChange={(e) => setStaffSelectedEmploymentStatus(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-xl border border-warm-gray-200 focus:outline-none focus:ring-2 focus:ring-matcha-500 bg-white text-warm-gray-900 font-semibold cursor-pointer"
                  >
                    <option value="All">All Employment Statuses</option>
                    {EMPLOYMENT_STATUSES.map((status) => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                </div>

                {/* Register New Borrower Button */}
                <button
                  onClick={() => {
                    setEditingBorrowerId(null);
                    setSettingsTab("borrowers");
                    setIsSettingsOpen(true);
                  }}
                  className="bg-matcha-600 hover:bg-matcha-700 text-white font-semibold text-xs py-2.5 px-4 rounded-xl shadow-xs transition-colors flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
                >
                  <Users className="h-4 w-4" />
                  <span>+ Register Borrower</span>
                </button>
              </div>
            </div>

            {/* Registered Staff Feed Grid */}
            {filteredStaff.length === 0 ? (
              <div className="text-center py-12 px-4 bg-white border border-matcha-100 rounded-2xl">
                <p className="text-sm text-warm-gray-800">No staff members match your search criteria or filter selection.</p>
                <button 
                  onClick={() => { setStaffSearchQuery(""); setStaffSelectedDept("All"); setStaffSelectedEmploymentStatus("All"); }}
                  className="mt-3 text-xs font-semibold text-matcha-700 underline cursor-pointer"
                >
                  Reset filters and show all registered staff
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {filteredStaff.map((staff) => {
                  // Filter out active loans of this staff
                  const activeLoans = devices.filter(
                    (d) => d.status === "loaned" && d.currentLoan?.userId === staff.id
                  );
                  const isOverdue = activeLoans.some((d) => {
                    const status = getLoanRemainingDays(d.currentLoan!.expectedReturnDate);
                    return status.isOverdue;
                  });
                  const statusMeta = getEmploymentStatusMeta(staff.employmentStatus);

                  return (
                    <div 
                      key={staff.id} 
                      className={`bg-white border rounded-2xl p-4 shadow-xs flex flex-col justify-between transition-all duration-200 hover:shadow-md ${
                        isOverdue 
                          ? "border-rose-250 hover:border-rose-350 bg-rose-50/10" 
                          : "border-matcha-100/70 hover:border-matcha-250 bg-white"
                      }`}
                    >
                      <div>
                        {/* Profile Details Header */}
                        <div className="flex items-start gap-3">
                          <div className="h-10 w-10 rounded-full bg-matcha-100 text-matcha-800 flex items-center justify-center font-bold text-xs shrink-0 overflow-hidden border border-warm-gray-200">
                            {staff.avatarUrl ? (
                              <img 
                                src={staff.avatarUrl} 
                                alt={staff.name} 
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              staff.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-1">
                              <h4 className="font-bold text-warm-gray-950 text-xs sm:text-sm truncate leading-snug">{staff.name}</h4>
                              <button
                                onClick={() => {
                                  setEditingBorrowerId(staff.id);
                                  setSettingsTab("borrowers");
                                  setIsSettingsOpen(true);
                                }}
                                className="p-1 text-warm-gray-500 hover:text-matcha-700 hover:bg-matcha-50 rounded-md transition-colors cursor-pointer shrink-0"
                                title={`Edit ${staff.name}'s profile`}
                                aria-label={`Edit ${staff.name}'s profile`}
                              >
                                <Edit2 className="h-3 w-3" />
                              </button>
                            </div>
                            <a 
                              href={`mailto:${staff.email}`} 
                              className="text-[10px] text-warm-gray-800 hover:text-matcha-700 truncate flex items-center gap-1 mt-0.5 font-medium"
                              title={`Send email to ${staff.name}`}
                            >
                              <Mail className="h-3 w-3 shrink-0 text-warm-gray-800" />
                              <span className="truncate">{staff.email}</span>
                            </a>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-2 text-[11px] text-warm-gray-800">
                              <span className="inline-flex items-center gap-1 font-medium text-warm-gray-800">
                                <Building className="h-3 w-3 text-matcha-600 shrink-0" />
                                {staff.department}
                              </span>
                              <span className="text-warm-gray-300" aria-hidden="true">·</span>
                              <span className={`inline-flex items-center gap-1.5 font-semibold ${statusMeta.textClass}`}>
                                <span className={`h-1.5 w-1.5 rounded-full ${statusMeta.dotClass}`} />
                                {statusMeta.label}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Loans Checklist Section */}
                        <div className="border-t border-warm-gray-100 pt-3 mt-3.5">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-warm-gray-800 mb-2 font-display">
                            Active Loan Status ({activeLoans.length})
                          </p>
                          
                          {activeLoans.length === 0 ? (
                            <div className="flex items-center gap-1.5 p-2 bg-emerald-50 text-emerald-800 border border-emerald-100 rounded-xl text-[11px] font-medium leading-none">
                              <UserCheck className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                              <span>Eligible (No items borrowed)</span>
                            </div>
                          ) : (
                            <div className="space-y-1.5">
                              {activeLoans.map((device) => {
                                const loan = device.currentLoan!;
                                const timeStatus = getLoanRemainingDays(loan.expectedReturnDate);
                                return (
                                  <div 
                                    key={device.id}
                                    onClick={() => setSelectedDeviceId(device.id)}
                                    className={`p-2 rounded-xl border text-[11px] cursor-pointer hover:scale-[1.01] hover:shadow-xs transition-all flex flex-col gap-0.5 ${
                                      timeStatus.isOverdue 
                                        ? "bg-rose-50 text-rose-950 border-rose-100 hover:border-rose-250" 
                                        : "bg-matcha-50/20 text-matcha-950 border-matcha-100 hover:border-matcha-200"
                                    }`}
                                    title="Click to manage checkout status or view timeline details"
                                  >
                                    <div className="flex items-center justify-between font-semibold">
                                      <span className="truncate flex-1 hover:underline text-warm-gray-950">
                                        {device.name}
                                      </span>
                                    </div>
                                    <p className="text-[10px] text-warm-gray-800 truncate font-mono">
                                      {device.model}
                                    </p>
                                    <div className="flex items-center justify-between text-[9px] mt-1 text-warm-gray-800 border-t border-warm-gray-100/50 pt-1">
                                      <span className="flex items-center gap-0.5">
                                        <Clock className="h-2.5 w-2.5" />
                                        Due {formatFriendlyDate(loan.expectedReturnDate)}
                                      </span>
                                      <span className={`font-semibold ${timeStatus.isOverdue ? "text-rose-600 font-bold" : "text-matcha-750"}`}>
                                        {timeStatus.text}
                                      </span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-6 flex-1 w-full animate-in fade-in duration-300">
            <SubscriptionDirectory
              subscriptions={subscriptions}
              onAddSubscription={handleAddSubscription}
              onUpdateSubscription={handleUpdateSubscription}
              onDeleteSubscription={handleDeleteSubscription}
              triggerToast={triggerToast}
            />
          </div>
        )}
      </main>

      {/* Device Details & History Popup Modal */}
      {selectedDevice && (
        <div 
          id="device-details-modal-overlay" 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-warm-gray-900/60 backdrop-blur-xs"
          onClick={() => setSelectedDeviceId(null)}
        >
          <div 
            className="w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden relative animate-in fade-in zoom-in-95 duration-200 shadow-2xl rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <DeviceDetails
              device={selectedDevice}
              existingDevices={devices}
              staffMembers={staffMembers}
              categories={categories}
              departments={departments}
              isSuperAdmin={isSuperAdmin}
              superAdminPin={superAdminPin}
              onUnlockSuperAdmin={handleUnlockSuperAdmin}
              onDeleteHistoryRecord={handleDeleteHistoryRecord}
              onClose={() => setSelectedDeviceId(null)}
              onCheckout={handleCheckout}
              onReturn={handleReturn}
              onCompleteMaintenance={handleCompleteMaintenance}
              onSendToMaintenance={handleSendToMaintenance}
              onRetireDevice={handleRetireDevice}
              onEditDevice={handleEditDevice}
              onEditLoanDates={handleEditLoanDates}
              onDeleteDevice={handleDeleteDevice}
            />
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="bg-white border-t border-matcha-100 mt-12 py-6 text-center text-xs text-warm-gray-800">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row justify-between items-center gap-3">
          <p>&copy; 2026 Mavis Device Inventory</p>
        </div>
      </footer>

      {/* New Device Form Dialog Backdrop */}
      <AddDeviceModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAddDevice={handleAddDevice}
        onAddDevices={handleAddDevices}
        categories={categories}
        existingDevices={devices}
      />

      {/* Settings Dialog Backdrop */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => {
          setIsSettingsOpen(false);
          setEditingBorrowerId(null);
        }}
        categories={categories}
        setCategories={setCategories}
        devices={devices}
        setDevices={setDevices}
        triggerToast={triggerToast}
        onResetPreset={handleResetData}
        onClearDatabase={handleClearAllData}
        staffMembers={staffMembers}
        setStaffMembers={setStaffMembers}
        departments={departments}
        setDepartments={setDepartments}
        initialTab={settingsTab}
        initialEditingStaffId={editingBorrowerId}
        isSuperAdmin={isSuperAdmin}
        setIsSuperAdmin={setIsSuperAdmin}
        superAdminPin={superAdminPin}
        setSuperAdminPin={setSuperAdminPin}
      />

    </div>
  );
}
