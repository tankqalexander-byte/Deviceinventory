import React, { useState } from "react";
import { 
  X, 
  Plus, 
  Edit2, 
  Check, 
  Trash2, 
  Settings, 
  FolderEdit, 
  RotateCcw, 
  Database, 
  AlertTriangle,
  UserPlus,
  Users,
  Mail,
  AlertCircle,
  Building,
  Download,
  Upload,
  ShieldCheck
} from "lucide-react";
import { Device, StaffMember, EmploymentStatus, EMPLOYMENT_STATUSES } from "../types";
import { getEmploymentStatusMeta } from "../utils";
import { 
  exportDevicesToCSV, 
  parseDevicesFromCSV, 
  exportStaffToCSV, 
  parseStaffFromCSV 
} from "../csvUtils";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: string[];
  setCategories: React.Dispatch<React.SetStateAction<string[]>>;
  devices: Device[];
  setDevices: React.Dispatch<React.SetStateAction<Device[]>>;
  triggerToast: (msg: string) => void;
  onResetPreset: () => void;
  onClearDatabase: () => void;
  staffMembers: StaffMember[];
  setStaffMembers: React.Dispatch<React.SetStateAction<StaffMember[]>>;
  departments: string[];
  setDepartments: React.Dispatch<React.SetStateAction<string[]>>;
  initialTab?: "catalog" | "borrowers" | "backup" | "system";
  initialEditingStaffId?: string | null;
  isSuperAdmin?: boolean;
  setIsSuperAdmin?: (val: boolean) => void;
  superAdminPin?: string;
  setSuperAdminPin?: (pin: string) => void;
}

export default function SettingsModal({
  isOpen,
  onClose,
  categories,
  setCategories,
  devices,
  setDevices,
  triggerToast,
  onResetPreset,
  onClearDatabase,
  staffMembers,
  setStaffMembers,
  departments,
  setDepartments,
  initialTab = "catalog",
  initialEditingStaffId = null,
  isSuperAdmin = false,
  setIsSuperAdmin,
  superAdminPin = "admin123",
  setSuperAdminPin
}: SettingsModalProps) {
  const [newCategoryName, setNewCategoryName] = useState("");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [error, setError] = useState("");

  // Departments State
  const [newDepartmentName, setNewDepartmentName] = useState("");
  const [editingDeptIndex, setEditingDeptIndex] = useState<number | null>(null);
  const [editingDeptValue, setEditingDeptValue] = useState("");
  const [deptError, setDeptError] = useState("");

  // User Manager State
  const [newUserName, setNewUserName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserDept, setNewUserDept] = useState("Engineering");
  const [newUserEmploymentStatus, setNewUserEmploymentStatus] = useState<EmploymentStatus>("Full-Time");
  const [userError, setUserError] = useState("");

  // Staff Member Edit State
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
  const [editingStaffName, setEditingStaffName] = useState("");
  const [editingStaffEmail, setEditingStaffEmail] = useState("");
  const [editingStaffDept, setEditingStaffDept] = useState("");
  const [editingStaffEmploymentStatus, setEditingStaffEmploymentStatus] = useState<EmploymentStatus>("Full-Time");

  const [activeTab, setActiveTab] = useState<"catalog" | "borrowers" | "backup" | "system">(initialTab);

  React.useEffect(() => {
    if (isOpen && initialTab) {
      setActiveTab(initialTab);
    }
    if (isOpen && initialEditingStaffId) {
      const target = staffMembers.find((s) => s.id === initialEditingStaffId);
      if (target) {
        setEditingStaffId(target.id);
        setEditingStaffName(target.name);
        setEditingStaffEmail(target.email);
        setEditingStaffDept(target.department);
        setEditingStaffEmploymentStatus(target.employmentStatus || "Full-Time");
        setUserError("");
      }
    } else if (!isOpen) {
      setEditingStaffId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialTab, initialEditingStaffId]);

  // Export Equipment to CSV
  const handleExportDevices = () => {
    try {
      const csvContent = exportDevicesToCSV(devices);
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `equipment-inventory_${new Date().toISOString().slice(0, 10)}.csv`);
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      triggerToast("Equipment catalog successfully exported to CSV.");
    } catch (err) {
      console.error(err);
      triggerToast("Failed to export equipment catalog.");
    }
  };

  // Import Equipment from CSV
  const handleImportDevices = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        if (!text) {
          triggerToast("Empty CSV file.");
          return;
        }

        const parsedDevices = parseDevicesFromCSV(text) as Device[];
        if (parsedDevices.length === 0) {
          triggerToast("No valid equipment records found in the CSV.");
          return;
        }

        const mode = confirm(
          `Found ${parsedDevices.length} equipment records in CSV.\n\nClick "OK" to MERGE with current inventory (updates matching IDs, appends new ones).\n\nClick "Cancel" to OVERWRITE and replace the entire inventory database.`
        );

        // Process categories to make sure imported categories exist
        const newCatsSet = new Set(categories);
        parsedDevices.forEach(d => {
          if (d.category) {
            newCatsSet.add(d.category);
          }
        });
        const updatedCategories = Array.from(newCatsSet);
        if (updatedCategories.length > categories.length) {
          setCategories(updatedCategories);
        }

        if (mode) {
          // Merge
          setDevices((prev) => {
            const merged = [...prev];
            parsedDevices.forEach((importedDev) => {
              const existingIdx = merged.findIndex((d) => d.id === importedDev.id || (d.serialNumber && d.serialNumber === importedDev.serialNumber));
              if (existingIdx > -1) {
                merged[existingIdx] = { ...merged[existingIdx], ...importedDev };
              } else {
                merged.push(importedDev);
              }
            });
            return merged;
          });
          triggerToast(`Successfully merged ${parsedDevices.length} equipment records.`);
        } else {
          // Overwrite
          if (confirm("Are you absolutely sure you want to WIPEOUT your entire equipment inventory and replace it with this CSV data? This cannot be undone.")) {
            setDevices(parsedDevices);
            triggerToast(`Successfully replaced inventory with ${parsedDevices.length} equipment records.`);
          }
        }
      } catch (err) {
        console.error(err);
        triggerToast("Error parsing CSV file. Please ensure it is a valid format.");
      }
      e.target.value = "";
    };
    reader.readAsText(file);
  };

  // Export Staff Directory to CSV
  const handleExportStaff = () => {
    try {
      const csvContent = exportStaffToCSV(staffMembers);
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `borrower-directory_${new Date().toISOString().slice(0, 10)}.csv`);
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      triggerToast("Borrower directory successfully exported to CSV.");
    } catch (err) {
      console.error(err);
      triggerToast("Failed to export borrower directory.");
    }
  };

  // Import Staff Directory from CSV
  const handleImportStaff = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        if (!text) {
          triggerToast("Empty CSV file.");
          return;
        }

        const parsedStaff = parseStaffFromCSV(text) as StaffMember[];
        if (parsedStaff.length === 0) {
          triggerToast("No valid borrower profiles found in the CSV.");
          return;
        }

        const mode = confirm(
          `Found ${parsedStaff.length} borrower records in CSV.\n\nClick "OK" to MERGE with current registered borrowers (updates matching IDs/emails, appends new ones).\n\nClick "Cancel" to OVERWRITE and replace all registered borrowers.`
        );

        // Process departments to make sure imported departments exist
        const newDeptsSet = new Set(departments);
        parsedStaff.forEach(s => {
          if (s.department) {
            newDeptsSet.add(s.department);
          }
        });
        const updatedDepts = Array.from(newDeptsSet);
        if (updatedDepts.length > departments.length) {
          setDepartments(updatedDepts);
        }

        if (mode) {
          // Merge
          setStaffMembers((prev) => {
            const merged = [...prev];
            parsedStaff.forEach((importedStaff) => {
              const existingIdx = merged.findIndex((s) => s.id === importedStaff.id || s.email.toLowerCase() === importedStaff.email.toLowerCase());
              if (existingIdx > -1) {
                merged[existingIdx] = { ...merged[existingIdx], ...importedStaff };
              } else {
                merged.push(importedStaff);
              }
            });
            return merged;
          });
          triggerToast(`Successfully merged ${parsedStaff.length} borrower profiles.`);
        } else {
          // Overwrite
          if (confirm("Are you absolutely sure you want to WIPEOUT your entire borrower directory and replace it with this CSV data? This cannot be undone.")) {
            setStaffMembers(parsedStaff);
            triggerToast(`Successfully replaced directory with ${parsedStaff.length} borrower profiles.`);
          }
        }
      } catch (err) {
        console.error(err);
        triggerToast("Error parsing CSV file. Please ensure it is a valid format.");
      }
      e.target.value = "";
    };
    reader.readAsText(file);
  };

  if (!isOpen) return null;

  // Add Category
  const handleAddCategory = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newCategoryName.trim();
    if (!cleanName) return;

    if (categories.some(c => c.toLowerCase() === cleanName.toLowerCase())) {
      setError("Category name already exists.");
      return;
    }

    setCategories((prev) => [...prev, cleanName]);
    setNewCategoryName("");
    setError("");
    triggerToast(`Category "${cleanName}" added.`);
  };

  // Start Editing Category
  const startEditing = (index: number, val: string) => {
    setEditingIndex(index);
    setEditingValue(val);
    setError("");
  };

  // Save Edited Category Name & Update Device categories
  const saveCategoryEdit = (index: number) => {
    const cleanValue = editingValue.trim();
    if (!cleanValue) return;

    const oldValue = categories[index];
    if (oldValue === cleanValue) {
      setEditingIndex(null);
      return;
    }

    if (categories.some((c, i) => i !== index && c.toLowerCase() === cleanValue.toLowerCase())) {
      setError("Another category with this name already exists.");
      return;
    }

    // Update categories list
    setCategories((prev) => {
      const next = [...prev];
      next[index] = cleanValue;
      return next;
    });

    // Update existing devices using this category
    setDevices((prevDevices) =>
      prevDevices.map((device) => {
        if (device.category === oldValue) {
          return { ...device, category: cleanValue };
        }
        return device;
      })
    );

    setEditingIndex(null);
    setError("");
    triggerToast(`Renamed "${oldValue}" to "${cleanValue}" across all devices.`);
  };

  // Delete Category
  const handleDeleteCategory = (index: number) => {
    const categoryToDelete = categories[index];
    
    if (categories.length <= 1) {
      setError("You must have at least one category in the inventory system.");
      return;
    }

    // Confirm deletion
    if (
      confirm(
        `Are you sure you want to delete category "${categoryToDelete}"? Devices assigned to this category will be updated to "${
          categories[index === 0 ? 1 : 0]
        }".`
      )
    ) {
      const targetFallbackCategory = categories[index === 0 ? 1 : 0];

      // Remove from categories list
      setCategories((prev) => prev.filter((_, i) => i !== index));

      // Re-assign devices with the deleted category to fallback
      setDevices((prevDevices) =>
        prevDevices.map((device) => {
          if (device.category === categoryToDelete) {
            return { ...device, category: targetFallbackCategory };
          }
          return device;
        })
      );

      setError("");
      triggerToast(`Deleted category "${categoryToDelete}" and updated associated devices.`);
    }
  };

  // Add Department
  const handleAddDepartment = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newDepartmentName.trim();
    if (!cleanName) return;

    if (departments.some(d => d.toLowerCase() === cleanName.toLowerCase())) {
      setDeptError("Department name already exists.");
      return;
    }

    setDepartments((prev) => [...prev, cleanName]);
    setNewDepartmentName("");
    setDeptError("");
    triggerToast(`Department "${cleanName}" added.`);
  };

  // Start Editing Department
  const startEditingDept = (index: number, val: string) => {
    setEditingDeptIndex(index);
    setEditingDeptValue(val);
    setDeptError("");
  };

  // Save Edited Department Name & Update Staff Members
  const saveDepartmentEdit = (index: number) => {
    const cleanValue = editingDeptValue.trim();
    if (!cleanValue) return;

    const oldValue = departments[index];
    if (oldValue === cleanValue) {
      setEditingDeptIndex(null);
      return;
    }

    if (departments.some((d, i) => i !== index && d.toLowerCase() === cleanValue.toLowerCase())) {
      setDeptError("Another department with this name already exists.");
      return;
    }

    // Update departments list
    setDepartments((prev) => {
      const next = [...prev];
      next[index] = cleanValue;
      return next;
    });

    // Update staff members using this department
    setStaffMembers((prevStaff) =>
      prevStaff.map((staff) => {
        if (staff.department === oldValue) {
          return { ...staff, department: cleanValue };
        }
        return staff;
      })
    );

    setEditingDeptIndex(null);
    setDeptError("");
    triggerToast(`Renamed "${oldValue}" to "${cleanValue}" across all staff members.`);
  };

  // Delete Department
  const handleDeleteDepartment = (index: number) => {
    const deptToDelete = departments[index];
    
    if (departments.length <= 1) {
      setDeptError("You must have at least one department in the system.");
      return;
    }

    // Confirm deletion
    if (
      confirm(
        `Are you sure you want to delete department "${deptToDelete}"? Staff members assigned to this department will be updated to "${
          departments[index === 0 ? 1 : 0]
        }".`
      )
    ) {
      const targetFallbackDept = departments[index === 0 ? 1 : 0];

      // Remove from departments list
      setDepartments((prev) => prev.filter((_, i) => i !== index));

      // Re-assign staff members with the deleted department to fallback
      setStaffMembers((prevStaff) =>
        prevStaff.map((staff) => {
          if (staff.department === deptToDelete) {
            return { ...staff, department: targetFallbackDept };
          }
          return staff;
        })
      );

      setDeptError("");
      triggerToast(`Deleted department "${deptToDelete}" and updated associated staff.`);
    }
  };

  // Add Eligible User
  const handleAddUser = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newUserName.trim();
    const cleanEmail = newUserEmail.trim();
    const cleanDept = newUserDept.trim();

    if (!cleanName || !cleanEmail || !cleanDept) {
      setUserError("Please fill out all fields.");
      return;
    }

    if (staffMembers.some((s) => s.email.toLowerCase() === cleanEmail.toLowerCase())) {
      setUserError("A staff member with this email already exists.");
      return;
    }

    const newUser: StaffMember = {
      id: `staff-${Date.now()}`,
      name: cleanName,
      email: cleanEmail,
      department: cleanDept,
      employmentStatus: newUserEmploymentStatus,
      avatarUrl: `https://images.unsplash.com/photo-${1500000000000 + Math.floor(Math.random() * 999999)}?auto=format&fit=crop&q=80&w=120`
    };

    setStaffMembers((prev) => [...prev, newUser]);
    setNewUserName("");
    setNewUserEmail("");
    setNewUserDept("Engineering");
    setNewUserEmploymentStatus("Full-Time");
    setUserError("");
    triggerToast(`Added "${cleanName}" to eligible borrowers.`);
  };

  // Remove Eligible User
  const handleRemoveUser = (userId: string, name: string) => {
    if (confirm(`Are you sure you want to remove "${name}" from eligible users? They will not be able to checkout new items, but historical logs referencing them will be preserved.`)) {
      setStaffMembers((prev) => prev.filter((s) => s.id !== userId));
      triggerToast(`Removed "${name}" from eligible users.`);
    }
  };

  // Start Editing Staff Member
  const startEditingStaff = (staff: StaffMember) => {
    setEditingStaffId(staff.id);
    setEditingStaffName(staff.name);
    setEditingStaffEmail(staff.email);
    setEditingStaffDept(staff.department);
    setEditingStaffEmploymentStatus(staff.employmentStatus || "Full-Time");
    setUserError("");
  };

  // Save Edited Staff Member Details & Sync Active/Historical Loans
  const saveStaffEdit = (staffId: string) => {
    const cleanName = editingStaffName.trim();
    const cleanEmail = editingStaffEmail.trim();
    const cleanDept = editingStaffDept.trim();

    if (!cleanName || !cleanEmail || !cleanDept) {
      setUserError("Please fill out all fields.");
      return;
    }

    if (staffMembers.some((s) => s.id !== staffId && s.email.toLowerCase() === cleanEmail.toLowerCase())) {
      setUserError("Another user with this email already exists.");
      return;
    }

    // Update staff members list
    setStaffMembers((prev) =>
      prev.map((s) => {
        if (s.id !== staffId) return s;
        return {
          ...s,
          name: cleanName,
          email: cleanEmail,
          department: cleanDept,
          employmentStatus: editingStaffEmploymentStatus
        };
      })
    );

    // Sync edited details into devices state
    setDevices((prevDevices) =>
      prevDevices.map((device) => {
        let updatedDevice = { ...device };
        let modified = false;

        // Sync active currentLoan
        if (device.currentLoan && device.currentLoan.userId === staffId) {
          updatedDevice.currentLoan = {
            ...device.currentLoan,
            userName: cleanName,
            userEmail: cleanEmail,
            userDepartment: cleanDept
          };
          modified = true;
        }

        // Sync history records
        if (device.history && device.history.some((h) => h.userId === staffId)) {
          updatedDevice.history = device.history.map((h) => {
            if (h.userId === staffId) {
              return {
                ...h,
                userName: cleanName,
                userEmail: cleanEmail,
                userDepartment: cleanDept
              };
            }
            return h;
          });
          modified = true;
        }

        return modified ? updatedDevice : device;
      })
    );

    setEditingStaffId(null);
    setUserError("");
    triggerToast(`Updated profile details for "${cleanName}".`);
  };

  return (
    <div id="settings-modal-overlay" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-warm-gray-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white border border-matcha-200 rounded-2xl shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[85vh]">
        
        {/* Header */}
        <div className="bg-matcha-50/50 border-b border-matcha-100 px-6 py-4 flex justify-between items-center flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-matcha-100 text-matcha-800 rounded-lg">
              <Settings className="h-4 w-4" />
            </div>
            <div>
              <h3 className="font-bold text-base text-warm-gray-900 font-display">System Settings</h3>
              <p className="text-[11px] text-warm-gray-800">Configure taxonomies, borrowers, backups & system administration</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-warm-gray-100 rounded-full text-warm-gray-800 transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Setting Tabs */}
        <div className="flex border-b border-warm-gray-100 bg-warm-gray-50/30 px-3 flex-shrink-0 overflow-x-auto scrollbar-none">
          <button
            type="button"
            onClick={() => setActiveTab("catalog")}
            className={`flex items-center gap-1.5 py-3 px-3.5 text-xs font-semibold transition-all relative border-b-2 -mb-px cursor-pointer shrink-0 ${
              activeTab === "catalog"
                ? "text-matcha-850 border-matcha-600 bg-white font-bold"
                : "text-warm-gray-800 hover:text-warm-gray-950 border-transparent hover:bg-warm-gray-50/20"
            }`}
          >
            <FolderEdit className="h-3.5 w-3.5 text-matcha-600" />
            <span>Taxonomy</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("borrowers")}
            className={`flex items-center gap-1.5 py-3 px-3.5 text-xs font-semibold transition-all relative border-b-2 -mb-px cursor-pointer shrink-0 ${
              activeTab === "borrowers"
                ? "text-matcha-850 border-matcha-600 bg-white font-bold"
                : "text-warm-gray-800 hover:text-warm-gray-950 border-transparent hover:bg-warm-gray-50/20"
            }`}
          >
            <Users className="h-3.5 w-3.5 text-matcha-600" />
            <span>Borrowers</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("backup")}
            className={`flex items-center gap-1.5 py-3 px-3.5 text-xs font-semibold transition-all relative border-b-2 -mb-px cursor-pointer shrink-0 ${
              activeTab === "backup"
                ? "text-matcha-850 border-matcha-600 bg-white font-bold"
                : "text-warm-gray-800 hover:text-warm-gray-950 border-transparent hover:bg-warm-gray-50/20"
            }`}
          >
            <Database className="h-3.5 w-3.5 text-matcha-600" />
            <span>CSV Backup</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("system")}
            className={`flex items-center gap-1.5 py-3 px-3.5 text-xs font-semibold transition-all relative border-b-2 -mb-px cursor-pointer shrink-0 ${
              activeTab === "system"
                ? "text-matcha-850 border-matcha-600 bg-white font-bold"
                : "text-warm-gray-800 hover:text-warm-gray-950 border-transparent hover:bg-warm-gray-50/20"
            }`}
          >
            <AlertTriangle className="h-3.5 w-3.5 text-matcha-600" />
            <span>System Admin</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {activeTab === "catalog" && (
            <div className="space-y-6 animate-in fade-in duration-200">
              {/* Section: Edit Categories */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-warm-gray-900 uppercase tracking-wider flex items-center gap-1.5">
                  <FolderEdit className="h-3.5 w-3.5 text-matcha-500" />
                  Manage Device Categories
                </h4>
                <p className="text-[11px] text-warm-gray-800 leading-relaxed">
                  Add new categories for your hardware catalog, rename existing options, or delete them. Renaming will automatically update all existing assets in the system.
                </p>

                {error && (
                  <p className="text-xs text-rose-600 bg-rose-50/50 border border-rose-100 p-2 rounded-lg font-medium">
                    {error}
                  </p>
                )}

                {/* Category list */}
                <div className="border border-warm-gray-100 rounded-xl divide-y divide-warm-gray-100 overflow-hidden bg-warm-gray-50/20">
                  {categories.map((cat, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 bg-white text-xs text-warm-gray-900">
                      {editingIndex === idx ? (
                        <div className="flex-1 flex gap-2 items-center">
                          <input
                            type="text"
                            value={editingValue}
                            onChange={(e) => setEditingValue(e.target.value)}
                            className="flex-1 p-1.5 rounded-lg border border-warm-gray-200 bg-white focus:outline-none focus:ring-1 focus:ring-matcha-500 text-xs font-medium text-warm-gray-900"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => saveCategoryEdit(idx)}
                            className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg transition-colors cursor-pointer"
                            title="Save changes"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingIndex(null)}
                            className="p-1.5 bg-warm-gray-50 hover:bg-warm-gray-100 text-warm-gray-800 rounded-lg transition-colors cursor-pointer"
                            title="Cancel"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="font-medium flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-matcha-500"></span>
                            {cat}
                            <span className="text-[10px] text-warm-gray-800 bg-warm-gray-50 px-1.5 py-0.5 rounded border border-warm-gray-100">
                              {devices.filter(d => d.category === cat).length} items
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => startEditing(idx, cat)}
                              className="p-1.5 hover:bg-warm-gray-50 rounded-lg text-warm-gray-800 hover:text-warm-gray-900 transition-colors cursor-pointer"
                              title="Rename Category"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteCategory(idx)}
                              className="p-1.5 hover:bg-rose-50 rounded-lg text-warm-gray-800 hover:text-rose-600 transition-colors cursor-pointer"
                              title="Delete Category"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>

                {/* Add Category Form */}
                <form onSubmit={handleAddCategory} className="flex gap-2 pt-2">
                  <input
                    type="text"
                    placeholder="New category name (e.g., Audio Visual)"
                    value={newCategoryName}
                    onChange={(e) => { setNewCategoryName(e.target.value); setError(""); }}
                    className="flex-1 p-2 text-xs rounded-lg border border-warm-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-matcha-500 text-warm-gray-900"
                    maxLength={30}
                  />
                  <button
                    type="submit"
                    className="bg-matcha-600 hover:bg-matcha-700 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors flex items-center gap-1 shrink-0 shadow-xs cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add
                  </button>
                </form>
              </div>

              <hr className="border-warm-gray-100" />

              {/* Section: Edit Departments */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-warm-gray-900 uppercase tracking-wider flex items-center gap-1.5">
                  <Building className="h-3.5 w-3.5 text-matcha-500" />
                  Manage Staff Departments
                </h4>
                <p className="text-[11px] text-warm-gray-800 leading-relaxed">
                  Add new staff departments, rename existing options, or delete them. Renaming will automatically update all registered staff members in that department.
                </p>

                {deptError && (
                  <p className="text-xs text-rose-600 bg-rose-50/50 border border-rose-100 p-2 rounded-lg font-medium">
                    {deptError}
                  </p>
                )}

                {/* Department list */}
                <div className="border border-warm-gray-100 rounded-xl divide-y divide-warm-gray-100 overflow-hidden bg-warm-gray-50/20 max-h-[160px] overflow-y-auto">
                  {departments.map((dept, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 bg-white text-xs text-warm-gray-900">
                      {editingDeptIndex === idx ? (
                        <div className="flex-1 flex gap-2 items-center">
                          <input
                            type="text"
                            value={editingDeptValue}
                            onChange={(e) => setEditingDeptValue(e.target.value)}
                            className="flex-1 p-1.5 rounded-lg border border-warm-gray-200 bg-white focus:outline-none focus:ring-1 focus:ring-matcha-500 text-xs font-medium text-warm-gray-900"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => saveDepartmentEdit(idx)}
                            className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg transition-colors cursor-pointer"
                            title="Save changes"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingDeptIndex(null)}
                            className="p-1.5 bg-warm-gray-50 hover:bg-warm-gray-100 text-warm-gray-800 rounded-lg transition-colors cursor-pointer"
                            title="Cancel"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="font-medium flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-matcha-500"></span>
                            {dept}
                            <span className="text-[10px] text-warm-gray-800 bg-warm-gray-50 px-1.5 py-0.5 rounded border border-warm-gray-100">
                              {staffMembers.filter(s => s.department === dept).length} users
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => startEditingDept(idx, dept)}
                              className="p-1.5 hover:bg-warm-gray-50 rounded-lg text-warm-gray-800 hover:text-warm-gray-900 transition-colors cursor-pointer"
                              title="Rename Department"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteDepartment(idx)}
                              className="p-1.5 hover:bg-rose-50 rounded-lg text-warm-gray-800 hover:text-rose-600 transition-colors cursor-pointer"
                              title="Delete Department"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>

                {/* Add Department Form */}
                <form onSubmit={handleAddDepartment} className="flex gap-2 pt-2">
                  <input
                    type="text"
                    placeholder="New department name (e.g. Creative Arts)"
                    value={newDepartmentName}
                    onChange={(e) => { setNewDepartmentName(e.target.value); setDeptError(""); }}
                    className="flex-1 p-2 text-xs rounded-lg border border-warm-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-matcha-500 text-warm-gray-900"
                    maxLength={40}
                  />
                  <button
                    type="submit"
                    className="bg-matcha-600 hover:bg-matcha-700 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors flex items-center gap-1 shrink-0 shadow-xs cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add
                  </button>
                </form>
              </div>
            </div>
          )}

          {activeTab === "borrowers" && (
            <div className="space-y-4 animate-in fade-in duration-200">
              {/* Section: Manage Eligible Users */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-warm-gray-900 uppercase tracking-wider flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5 text-matcha-500" />
                  Manage Eligible Users (Borrowers)
                </h4>
                <p className="text-[11px] text-warm-gray-800 leading-relaxed">
                  Register or remove eligible staff members who can check out items from the inventory system. Historical checkout records remain preserved even if a user is deleted.
                </p>

                {userError && (
                  <p className="text-xs text-rose-600 bg-rose-50/50 border border-rose-100 p-2 rounded-lg font-medium flex items-center gap-1">
                    <AlertCircle className="h-3.5 w-3.5" />
                    {userError}
                  </p>
                )}

                {/* List of current staff members */}
                <div className="border border-warm-gray-100 rounded-xl overflow-hidden bg-warm-gray-50/20 max-h-[220px] overflow-y-auto">
                  {staffMembers.length === 0 ? (
                    <div className="p-4 text-center text-xs text-warm-gray-800 italic">
                      No eligible users registered in the database. Add users below.
                    </div>
                  ) : (
                    <div className="divide-y divide-warm-gray-100">
                      {staffMembers.map((staff) => (
                        editingStaffId === staff.id ? (
                          /* Inline Editing View for User */
                          <div key={staff.id} className="p-3 bg-warm-gray-50/50 text-xs text-warm-gray-900 space-y-2.5">
                            <div className="grid grid-cols-2 gap-2">
                              <div className="space-y-0.5">
                                <label className="text-[10px] font-semibold text-warm-gray-800">Full Name</label>
                                <input
                                  type="text"
                                  value={editingStaffName}
                                  onChange={(e) => setEditingStaffName(e.target.value)}
                                  className="w-full p-1.5 border border-warm-gray-200 rounded-lg text-xs text-warm-gray-900 bg-white focus:outline-none focus:ring-1 focus:ring-matcha-500 font-medium"
                                  maxLength={40}
                                />
                              </div>
                              <div className="space-y-0.5">
                                <label className="text-[10px] font-semibold text-warm-gray-800">Email Address</label>
                                <input
                                  type="email"
                                  value={editingStaffEmail}
                                  onChange={(e) => setEditingStaffEmail(e.target.value)}
                                  className="w-full p-1.5 border border-warm-gray-200 rounded-lg text-xs text-warm-gray-900 bg-white focus:outline-none focus:ring-1 focus:ring-matcha-500"
                                  maxLength={50}
                                />
                              </div>
                            </div>
                            <div className="flex items-end gap-2">
                              <div className="flex-1 space-y-0.5">
                                <label className="text-[10px] font-semibold text-warm-gray-800">Department</label>
                                <select
                                  value={editingStaffDept}
                                  onChange={(e) => setEditingStaffDept(e.target.value)}
                                  className="w-full p-1.5 border border-warm-gray-200 rounded-lg text-xs text-warm-gray-900 bg-white focus:outline-none focus:ring-1 focus:ring-matcha-500 font-medium"
                                >
                                  {departments.map((dept) => (
                                    <option key={dept} value={dept}>{dept}</option>
                                  ))}
                                </select>
                              </div>
                              <div className="flex-1 space-y-0.5">
                                <label className="text-[10px] font-semibold text-warm-gray-800">Employment Status</label>
                                <select
                                  value={editingStaffEmploymentStatus}
                                  onChange={(e) => setEditingStaffEmploymentStatus(e.target.value as EmploymentStatus)}
                                  className="w-full p-1.5 border border-warm-gray-200 rounded-lg text-xs text-warm-gray-900 bg-white focus:outline-none focus:ring-1 focus:ring-matcha-500 font-medium"
                                >
                                  {EMPLOYMENT_STATUSES.map((status) => (
                                    <option key={status} value={status}>{status}</option>
                                  ))}
                                </select>
                              </div>
                              <div className="flex gap-1.5 shrink-0 pb-0.5">
                                <button
                                  type="button"
                                  onClick={() => saveStaffEdit(staff.id)}
                                  className="p-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg transition-colors cursor-pointer"
                                  title="Save details"
                                >
                                  <Check className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingStaffId(null)}
                                  className="p-2 bg-warm-gray-50 hover:bg-warm-gray-100 text-warm-gray-800 rounded-lg transition-colors cursor-pointer"
                                  title="Cancel"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          </div>
                        ) : (
                          /* Static View with Edit & Delete Options */
                          <div key={staff.id} className="flex items-center justify-between p-3 bg-white text-xs text-warm-gray-900 gap-2">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="w-8 h-8 rounded-full bg-matcha-100 text-matcha-800 flex items-center justify-center font-bold text-xs shrink-0 overflow-hidden">
                                {staff.avatarUrl ? (
                                  <img src={staff.avatarUrl} alt={staff.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                ) : (
                                  staff.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()
                                )}
                              </div>
                              <div className="min-w-0">
                                <p className="font-semibold text-warm-gray-900 truncate">{staff.name}</p>
                                <p className="text-[10px] text-warm-gray-800 truncate flex items-center gap-1">
                                  <Mail className="h-2.5 w-2.5 shrink-0" />
                                  {staff.email}
                                </p>
                                <div className="text-[10px] text-matcha-800 flex flex-wrap items-center gap-1.5 mt-0.5">
                                  <span className="inline-flex items-center gap-1">
                                    <Building className="h-2.5 w-2.5 shrink-0 text-matcha-600" />
                                    {staff.department}
                                  </span>
                                  <span className="text-warm-gray-300" aria-hidden="true">·</span>
                                  {(() => {
                                    const statusMeta = getEmploymentStatusMeta(staff.employmentStatus);
                                    return (
                                      <span className={`inline-flex items-center gap-1 font-semibold ${statusMeta.textClass}`}>
                                        <span className={`h-1.5 w-1.5 rounded-full ${statusMeta.dotClass}`} />
                                        {statusMeta.label}
                                      </span>
                                    );
                                  })()}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => startEditingStaff(staff)}
                                className="p-1.5 hover:bg-warm-gray-50 rounded-lg text-warm-gray-800 hover:text-warm-gray-900 transition-colors cursor-pointer"
                                title={`Edit ${staff.name}`}
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRemoveUser(staff.id, staff.name)}
                                className="p-1.5 hover:bg-rose-50 rounded-lg text-warm-gray-800 hover:text-rose-600 transition-colors cursor-pointer"
                                title={`Remove ${staff.name}`}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        )
                      ))}
                    </div>
                  )}
                </div>

                {/* Add New User Form */}
                <form onSubmit={handleAddUser} className="bg-warm-gray-50/50 p-3 rounded-xl border border-warm-gray-100 space-y-2.5">
                  <div className="text-xs font-semibold text-warm-gray-900 flex items-center gap-1">
                    <UserPlus className="h-3.5 w-3.5 text-matcha-600" />
                    Add New Eligible Borrower
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-0.5">
                      <label className="text-[10px] font-semibold text-warm-gray-800">Full Name</label>
                      <input
                        type="text"
                        placeholder="E.g. Chloe Patel"
                        value={newUserName}
                        onChange={(e) => { setNewUserName(e.target.value); setUserError(""); }}
                        className="w-full p-2 text-xs rounded-lg border border-warm-gray-200 bg-white focus:outline-none focus:ring-1 focus:ring-matcha-500 text-warm-gray-900"
                        maxLength={40}
                        required
                      />
                    </div>
                    <div className="space-y-0.5">
                      <label className="text-[10px] font-semibold text-warm-gray-800">Email Address</label>
                      <input
                        type="email"
                        placeholder="E.g. chloe@domain.com"
                        value={newUserEmail}
                        onChange={(e) => { setNewUserEmail(e.target.value); setUserError(""); }}
                        className="w-full p-2 text-xs rounded-lg border border-warm-gray-200 bg-white focus:outline-none focus:ring-1 focus:ring-matcha-500 text-warm-gray-900"
                        maxLength={50}
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-end">
                    <div className="space-y-0.5">
                      <label className="text-[10px] font-semibold text-warm-gray-800 block">Department</label>
                      <select
                        value={newUserDept}
                        onChange={(e) => setNewUserDept(e.target.value)}
                        className="w-full p-2 text-xs rounded-lg border border-warm-gray-200 bg-white focus:outline-none focus:ring-1 focus:ring-matcha-500 text-warm-gray-900"
                      >
                        {departments.map((dept) => (
                          <option key={dept} value={dept}>
                            {dept}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex gap-2 items-end">
                      <div className="flex-1 space-y-0.5">
                        <label className="text-[10px] font-semibold text-warm-gray-800 block">Employment Status</label>
                        <select
                          value={newUserEmploymentStatus}
                          onChange={(e) => setNewUserEmploymentStatus(e.target.value as EmploymentStatus)}
                          className="w-full p-2 text-xs rounded-lg border border-warm-gray-200 bg-white focus:outline-none focus:ring-1 focus:ring-matcha-500 text-warm-gray-900"
                        >
                          {EMPLOYMENT_STATUSES.map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </select>
                      </div>
                      <button
                        type="submit"
                        className="bg-matcha-600 hover:bg-matcha-700 text-white text-xs font-semibold px-4 py-2.5 rounded-lg transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer h-[34px] shrink-0"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add User
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            </div>
          )}

          {activeTab === "backup" && (
            <div className="space-y-4 animate-in fade-in duration-200">
              {/* Section: CSV Import & Export */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-warm-gray-900 uppercase tracking-wider flex items-center gap-1.5">
                  <Database className="h-3.5 w-3.5 text-matcha-500" />
                  CSV Database Import & Export
                </h4>
                <p className="text-[11px] text-warm-gray-800 leading-relaxed">
                  Backup your data by exporting to CSV, or batch upload items and profiles directly. Supports both equipment inventory and borrower directories.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  {/* Equipment Catalog CSV Handling */}
                  <div className="bg-warm-gray-50/50 border border-warm-gray-100 p-3.5 rounded-xl space-y-3">
                    <div>
                      <h5 className="text-xs font-bold text-warm-gray-950">Equipment Catalog</h5>
                      <p className="text-[10px] text-warm-gray-800">Manage device specifications & active loan states.</p>
                    </div>
                    <div className="flex flex-col gap-2">
                      <button
                        type="button"
                        onClick={handleExportDevices}
                        className="w-full inline-flex items-center justify-center gap-1.5 bg-white hover:bg-warm-gray-50 text-warm-gray-900 border border-warm-gray-200 px-3 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer shadow-xs"
                      >
                        <Download className="h-3.5 w-3.5 text-matcha-600" />
                        Export Catalog (.csv)
                      </button>
                      
                      <label className="w-full inline-flex items-center justify-center gap-1.5 bg-matcha-50 hover:bg-matcha-100/80 text-matcha-850 border border-matcha-200 px-3 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer shadow-xs">
                        <Upload className="h-3.5 w-3.5 text-matcha-700" />
                        <span>Import Catalog (.csv)</span>
                        <input
                          type="file"
                          accept=".csv"
                          onChange={handleImportDevices}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>

                  {/* Borrower Directory CSV Handling */}
                  <div className="bg-warm-gray-50/50 border border-warm-gray-100 p-3.5 rounded-xl space-y-3">
                    <div>
                      <h5 className="text-xs font-bold text-warm-gray-950">Borrower Directory</h5>
                      <p className="text-[10px] text-warm-gray-800">Manage staff names, emails, departments, and employment statuses.</p>
                    </div>
                    <div className="flex flex-col gap-2">
                      <button
                        type="button"
                        onClick={handleExportStaff}
                        className="w-full inline-flex items-center justify-center gap-1.5 bg-white hover:bg-warm-gray-50 text-warm-gray-900 border border-warm-gray-200 px-3 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer shadow-xs"
                      >
                        <Download className="h-3.5 w-3.5 text-matcha-600" />
                        Export Directory (.csv)
                      </button>

                      <label className="w-full inline-flex items-center justify-center gap-1.5 bg-matcha-50 hover:bg-matcha-100/80 text-matcha-850 border border-matcha-200 px-3 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer shadow-xs">
                        <Upload className="h-3.5 w-3.5 text-matcha-700" />
                        <span>Import Directory (.csv)</span>
                        <input
                          type="file"
                          accept=".csv"
                          onChange={handleImportStaff}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "system" && (
            <div className="space-y-4 animate-in fade-in duration-200">
              {/* Section: Superadmin Authorization */}
              <div className="space-y-3 bg-amber-50/40 border border-amber-200/60 p-3.5 rounded-xl">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="text-xs font-bold text-amber-900 uppercase tracking-wider flex items-center gap-1.5">
                      <ShieldCheck className="h-4 w-4 text-amber-600" />
                      Superadmin Privilege & Security
                    </h4>
                    <p className="text-[11px] text-warm-gray-800 leading-relaxed mt-0.5">
                      Only Superadmins are authorized to remove entries from the detailed checkout history log.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsSuperAdmin?.(!isSuperAdmin);
                      triggerToast(isSuperAdmin ? "Superadmin mode deactivated." : "Superadmin mode activated.");
                    }}
                    className={`px-2.5 py-1 text-xs rounded-lg font-bold transition-colors cursor-pointer shadow-xs shrink-0 ${
                      isSuperAdmin 
                        ? "bg-amber-600 text-white hover:bg-amber-700" 
                        : "bg-white text-warm-gray-800 border border-warm-gray-300 hover:bg-warm-gray-50"
                    }`}
                  >
                    {isSuperAdmin ? "Superadmin Active (Toggle Off)" : "Unlock Superadmin Mode"}
                  </button>
                </div>

                <div className="pt-2 border-t border-amber-200/50 flex items-center gap-2">
                  <div className="flex-1 space-y-1">
                    <label className="text-[10px] font-bold text-warm-gray-800 uppercase tracking-wider block">
                      Superadmin Passcode
                    </label>
                    <input
                      type="password"
                      value={superAdminPin}
                      onChange={(e) => {
                        const newPin = e.target.value;
                        setSuperAdminPin?.(newPin);
                        localStorage.setItem("tealoan_superadmin_pin", newPin);
                      }}
                      placeholder="e.g. admin123"
                      className="w-full text-xs p-2 rounded-lg border border-warm-gray-200 bg-white font-mono"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => triggerToast("Superadmin passcode updated.")}
                    className="self-end bg-matcha-600 hover:bg-matcha-700 text-white font-semibold text-xs px-3 py-2 rounded-lg transition-colors cursor-pointer shadow-xs"
                  >
                    Save Passcode
                  </button>
                </div>
              </div>

              {/* Section: System Actions */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-warm-gray-900 uppercase tracking-wider flex items-center gap-1.5">
                  <Database className="h-3.5 w-3.5 text-matcha-500" />
                  Database & System Administration
                </h4>
                <p className="text-[11px] text-warm-gray-800 leading-relaxed">
                  Perform administrative operations on the system database. These operations change the live database.
                </p>

                <div className="space-y-2 pt-1">
                  {/* Reset Preset */}
                  <div className="flex items-center justify-between p-3 bg-warm-gray-50/50 border border-warm-gray-100 rounded-xl">
                    <div className="space-y-0.5">
                      <div className="text-xs font-semibold text-warm-gray-900">Reset Default Preset</div>
                      <div className="text-[10px] text-warm-gray-800">Restore default devices, categories, and logs.</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        onResetPreset();
                        onClose();
                      }}
                      className="inline-flex items-center gap-1 bg-white hover:bg-warm-gray-50 text-warm-gray-900 border border-warm-gray-200 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer shadow-xs"
                    >
                      <RotateCcw className="h-3 w-3 text-matcha-600" />
                      Reset Preset
                    </button>
                  </div>

                  {/* Clear Database */}
                  <div className="flex items-center justify-between p-3 bg-rose-50/20 border border-rose-100 rounded-xl">
                    <div className="space-y-0.5">
                      <div className="text-xs font-semibold text-rose-800 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        Wipe All Data
                      </div>
                      <div className="text-[10px] text-warm-gray-800">Completely empty the hardware device inventory database.</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        onClearDatabase();
                        onClose();
                      }}
                      className="inline-flex items-center gap-1 bg-rose-600 hover:bg-rose-700 text-white px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer shadow-xs"
                    >
                      <Trash2 className="h-3 w-3" />
                      Wipe Database
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-4 bg-matcha-50/50 border-t border-matcha-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-warm-gray-900 hover:bg-warm-gray-800 text-white text-xs font-semibold rounded-lg transition-colors shadow-xs cursor-pointer"
          >
            Close Settings
          </button>
        </div>

      </div>
    </div>
  );
}
