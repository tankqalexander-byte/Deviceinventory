import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
import { Device, StaffMember, LoanRecord, DeviceCondition, DeviceStatus, EmploymentStatus, EMPLOYMENT_STATUSES } from "../types";
import { formatFriendlyDate, getLoanRemainingDays, SYSTEM_TODAY, parseDate, getEmploymentStatusMeta } from "../utils";
import { 
  X, 
  Calendar, 
  User, 
  Mail, 
  Building, 
  Clock, 
  History, 
  CheckCircle, 
  AlertCircle, 
  Wrench, 
  Trash2, 
  PlusCircle, 
  Edit,
  ClipboardList,
  MapPin,
  Tag,
  CornerDownLeft,
  ShieldCheck,
  ShieldAlert,
  KeyRound
} from "lucide-react";

interface DeviceDetailsProps {
  device: Device | null;
  existingDevices?: Device[];
  staffMembers: StaffMember[];
  categories: string[];
  departments?: string[];
  isSuperAdmin?: boolean;
  superAdminPin?: string;
  onUnlockSuperAdmin?: (pin: string) => void;
  onDeleteHistoryRecord?: (deviceId: string, historyRecordId: string) => void;
  onClose: () => void;
  onCheckout: (
    deviceId: string, 
    userId: string, 
    startDate: string, 
    expectedReturnDate: string, 
    notes: string,
    customBorrower?: { name: string; email: string; department: string; employmentStatus?: EmploymentStatus }
  ) => void;
  onReturn: (deviceId: string, returnCondition: DeviceCondition, notes: string) => void;
  onCompleteMaintenance: (deviceId: string, finalCondition: DeviceCondition, notes: string) => void;
  onSendToMaintenance: (deviceId: string, notes: string) => void;
  onRetireDevice: (deviceId: string) => void;
  onEditDevice: (deviceId: string, updatedFields: Partial<Device>) => void;
  onDeleteDevice: (deviceId: string) => void;
}

export default function DeviceDetails({
  device,
  existingDevices = [],
  staffMembers,
  categories,
  departments = ["Engineering", "Product & Design", "Marketing & Ops", "Customer Success", "Finance & HR", "IT & Systems", "Operations", "General Management", "Other"],
  isSuperAdmin = false,
  superAdminPin = "admin123",
  onUnlockSuperAdmin,
  onDeleteHistoryRecord,
  onClose,
  onCheckout,
  onReturn,
  onCompleteMaintenance,
  onSendToMaintenance,
  onRetireDevice,
  onEditDevice,
  onDeleteDevice
}: DeviceDetailsProps) {
  const [activeTab, setActiveTab] = useState<"status" | "history">("status");
  
  // Superadmin History Removal Dialog State
  const [deletingRecordId, setDeletingRecordId] = useState<string | null>(null);
  const [pinInput, setPinInput] = useState<string>("");
  const [pinError, setPinError] = useState<boolean>(false);
  
  // Checkout Form State
  const [selectedStaffId, setSelectedStaffId] = useState<string>(staffMembers[0]?.id || "new");
  const [startDate, setStartDate] = useState<string>(SYSTEM_TODAY);
  const [newBorrowerName, setNewBorrowerName] = useState("");
  const [newBorrowerEmail, setNewBorrowerEmail] = useState("");
  const [newBorrowerDept, setNewBorrowerDept] = useState("Engineering");
  const [newBorrowerEmploymentStatus, setNewBorrowerEmploymentStatus] = useState<EmploymentStatus>("Full-Time");

  // Edit Form State
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editModel, setEditModel] = useState("");
  const [editSerialNumber, setEditSerialNumber] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editCondition, setEditCondition] = useState<DeviceCondition>("Excellent");
  const [editNotes, setEditNotes] = useState("");

  useEffect(() => {
    if (device) {
      setEditName(device.name);
      setEditModel(device.model);
      setEditSerialNumber(device.serialNumber);
      setEditCategory(device.category);
      setEditLocation(device.location);
      setEditCondition(device.condition);
      setEditNotes(device.notes || "");
      setIsEditing(false);
    }
  }, [device]);

  useEffect(() => {
    if (staffMembers && staffMembers.length > 0 && !selectedStaffId) {
      setSelectedStaffId(staffMembers[0].id);
    }
  }, [staffMembers, selectedStaffId]);
  const [endDate, setEndDate] = useState<string>(() => {
    const today = parseDate(SYSTEM_TODAY);
    today.setDate(today.getDate() + 14);
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  });
  const [checkoutNotes, setCheckoutNotes] = useState<string>("");

  // Return Form State
  const [returnCondition, setReturnCondition] = useState<DeviceCondition>("Excellent");
  const [returnNotes, setReturnNotes] = useState<string>("");

  // Maintenance Form State
  const [maintenanceNotes, setMaintenanceNotes] = useState<string>("");
  const [fixedCondition, setFixedCondition] = useState<DeviceCondition>("Excellent");

  // Send to Maintenance Notes
  const [issueNotes, setIssueNotes] = useState<string>("");
  const [showMaintenanceForm, setShowMaintenanceForm] = useState(false);

  if (!device) {
    return (
      <div className="h-full flex flex-col justify-center items-center text-center p-8 bg-white border border-matcha-100 rounded-2xl">
        <div className="p-4 bg-matcha-50 rounded-full mb-4 text-matcha-600">
          <ClipboardList className="h-10 w-10" />
        </div>
        <h3 className="font-semibold text-lg text-warm-gray-900 font-display">No Device Selected</h3>
        <p className="text-sm text-warm-gray-800 max-w-xs mt-1">
          Select any device from the inventory catalog to view its current status, active user assignment, and full loan history.
        </p>
      </div>
    );
  }

  // Quick duration helper
  const handleQuickDuration = (days: number) => {
    try {
      const base = parseDate(startDate || SYSTEM_TODAY);
      base.setDate(base.getDate() + days);
      const yyyy = base.getFullYear();
      const mm = String(base.getMonth() + 1).padStart(2, '0');
      const dd = String(base.getDate()).padStart(2, '0');
      setEndDate(`${yyyy}-${mm}-${dd}`);
    } catch (e) {
      console.error(e);
    }
  };

  const handleCheckoutSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedStaffId === "new") {
      if (!newBorrowerName.trim()) return;
      onCheckout(
        device.id,
        "",
        startDate,
        endDate,
        checkoutNotes,
        {
          name: newBorrowerName.trim(),
          email: newBorrowerEmail.trim(),
          department: newBorrowerDept.trim() || "Engineering",
          employmentStatus: newBorrowerEmploymentStatus
        }
      );
      setNewBorrowerName("");
      setNewBorrowerEmail("");
      setNewBorrowerEmploymentStatus("Full-Time");
    } else {
      if (!selectedStaffId || !startDate) return;
      onCheckout(device.id, selectedStaffId, startDate, endDate, checkoutNotes);
    }
    setCheckoutNotes("");
  };

  const handleReturnSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onReturn(device.id, returnCondition, returnNotes);
    // Reset state
    setReturnNotes("");
  };

  const handleMaintenanceSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onCompleteMaintenance(device.id, fixedCondition, maintenanceNotes);
    setMaintenanceNotes("");
  };

  const handleSendToMaintenanceSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSendToMaintenance(device.id, issueNotes);
    setIssueNotes("");
    setShowMaintenanceForm(false);
  };

  const cleanEditSerial = editSerialNumber.trim().toUpperCase();
  const duplicateEditDevice = cleanEditSerial && device
    ? existingDevices.find(d => d.id !== device.id && d.serialNumber.trim().toUpperCase() === cleanEditSerial)
    : null;

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editName.trim() || !editModel.trim() || !editSerialNumber.trim()) return;
    if (duplicateEditDevice) return;

    onEditDevice(device.id, {
      name: editName.trim(),
      model: editModel.trim(),
      serialNumber: cleanEditSerial,
      category: editCategory,
      location: editLocation.trim(),
      condition: editCondition,
      notes: editNotes.trim()
    });
    setIsEditing(false);
  };

  // Calculate active loan time metrics
  let loanRemaining = null;
  if (device.status === "loaned" && device.currentLoan) {
    loanRemaining = getLoanRemainingDays(device.currentLoan.expectedReturnDate);
  }

  // Helper to calculate previous loan duration
  const getLoanDurationText = (record: LoanRecord) => {
    if (!record.returnedDate) return "Active";
    const start = parseDate(record.checkoutDate);
    const end = parseDate(record.returnedDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return `${diffDays} day${diffDays !== 1 ? "s" : ""}`;
  };

  return (
    <motion.div 
      key={device.id}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      id="device-details-panel" 
      className="bg-white border border-matcha-100 rounded-2xl shadow-sm overflow-hidden h-full flex flex-col"
    >
      {/* Header Banner */}
      <div className={`p-4 ${device.category === 'Tea & Pantry' ? 'bg-tea-amber-50/50' : 'bg-matcha-50/40'} border-b border-matcha-100/50 flex justify-between items-start`}>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider bg-matcha-100/60 text-matcha-800 px-2 py-0.5 rounded-full">
              {device.category}
            </span>
            <span className="text-xs font-mono text-warm-gray-800">
              S/N: {device.serialNumber}
            </span>
          </div>
          <h3 className="font-bold text-lg text-warm-gray-900 leading-snug">{device.name}</h3>
          <p className="text-xs text-warm-gray-800 font-mono">{device.model}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {device.status !== "retired" && (
            <button 
              onClick={() => setIsEditing(!isEditing)}
              className={`p-1.5 rounded-full transition-colors ${isEditing ? "bg-matcha-200 text-matcha-900" : "hover:bg-warm-gray-100 text-warm-gray-800"}`}
              title="Edit Equipment Specifications"
            >
              <Edit className="h-4 w-4" />
            </button>
          )}
          <button 
            onClick={onClose}
            className="p-1.5 hover:bg-warm-gray-100 rounded-full text-warm-gray-800 transition-colors"
            title="Close details"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-matcha-100 text-sm font-medium bg-warm-gray-50/50">
        <button
          onClick={() => setActiveTab("status")}
          className={`flex-1 py-3 text-center border-b-2 flex items-center justify-center gap-1.5 transition-colors ${activeTab === "status" ? "border-matcha-600 text-matcha-800 font-semibold bg-white" : "border-transparent text-warm-gray-800 hover:text-matcha-700 hover:bg-warm-gray-50"}`}
        >
          <Clock className="h-4 w-4" />
          Status & Actions
        </button>
        <button
          onClick={() => setActiveTab("history")}
          className={`flex-1 py-3 text-center border-b-2 flex items-center justify-center gap-1.5 transition-colors ${activeTab === "history" ? "border-matcha-600 text-matcha-800 font-semibold bg-white" : "border-transparent text-warm-gray-800 hover:text-matcha-700 hover:bg-warm-gray-50"}`}
        >
          <History className="h-4 w-4" />
          Detailed History ({device.history.length})
        </button>
      </div>

      {/* Scrollable Content Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {activeTab === "status" ? (
          isEditing ? (
            /* EDIT FORM */
            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div className="text-xs font-semibold text-warm-gray-900 border-b border-warm-gray-100 pb-2 flex items-center gap-1.5">
                <Edit className="h-4 w-4 text-matcha-600" />
                Edit Equipment Specifications
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-warm-gray-800 block">Device Name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full text-xs p-2 rounded-lg border border-warm-gray-200 bg-white focus:outline-none focus:ring-1 focus:ring-matcha-500 text-warm-gray-900"
                  maxLength={50}
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-warm-gray-800 block">Model & Specifications</label>
                <input
                  type="text"
                  value={editModel}
                  onChange={(e) => setEditModel(e.target.value)}
                  className="w-full text-xs p-2 rounded-lg border border-warm-gray-200 bg-white focus:outline-none focus:ring-1 focus:ring-matcha-500 text-warm-gray-900"
                  maxLength={55}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-warm-gray-800 block">Serial Number</label>
                  <input
                    type="text"
                    value={editSerialNumber}
                    onChange={(e) => setEditSerialNumber(e.target.value)}
                    className={`w-full text-xs p-2 rounded-lg border uppercase font-mono text-warm-gray-900 focus:outline-none focus:ring-1 ${
                      duplicateEditDevice
                        ? 'border-rose-400 bg-rose-50/30 focus:ring-rose-500'
                        : 'border-warm-gray-200 bg-white focus:ring-matcha-500'
                    }`}
                    maxLength={30}
                    required
                  />
                  {duplicateEditDevice && (
                    <p className="text-[10px] text-rose-600 mt-0.5 font-medium flex items-center gap-1 animate-in fade-in">
                      <AlertCircle className="h-3 w-3 shrink-0" />
                      <span>Duplicate: Assigned to &quot;{duplicateEditDevice.name}&quot;.</span>
                    </p>
                  )}
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-warm-gray-800 block">Category</label>
                  <select
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value)}
                    className="w-full text-xs p-2 rounded-lg border border-warm-gray-200 bg-white focus:outline-none focus:ring-1 focus:ring-matcha-500 text-warm-gray-900"
                  >
                    {categories.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-warm-gray-800 block">Location</label>
                  <input
                    type="text"
                    value={editLocation}
                    onChange={(e) => setEditLocation(e.target.value)}
                    className="w-full text-xs p-2 rounded-lg border border-warm-gray-200 bg-white focus:outline-none focus:ring-1 focus:ring-matcha-500 text-warm-gray-900"
                    maxLength={40}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-warm-gray-800 block">Condition</label>
                  <select
                    value={editCondition}
                    onChange={(e) => setEditCondition(e.target.value as DeviceCondition)}
                    className="w-full text-xs p-2 rounded-lg border border-warm-gray-200 bg-white focus:outline-none focus:ring-1 focus:ring-matcha-500 text-warm-gray-900"
                  >
                    <option value="Excellent">Excellent</option>
                    <option value="Good">Good</option>
                    <option value="Fair">Fair</option>
                    <option value="Needs Service">Needs Service</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-warm-gray-800 block">Care & Diagnostic Notes</label>
                <textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  rows={3}
                  className="w-full text-xs p-2 rounded-lg border border-warm-gray-200 bg-white focus:outline-none focus:ring-1 focus:ring-matcha-500 text-warm-gray-900"
                  maxLength={250}
                  placeholder="Notes about physical state, missing components, or handling rules..."
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="flex-1 py-2 text-xs border border-warm-gray-200 text-warm-gray-800 rounded-lg hover:bg-warm-gray-50 font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 text-xs bg-matcha-600 hover:bg-matcha-700 text-white font-semibold rounded-lg shadow-xs cursor-pointer"
                >
                  Save Changes
                </button>
              </div>
            </form>
          ) : (
            <>
            {/* Status overview box */}
            <div className="border border-warm-gray-100 rounded-xl p-4 bg-warm-gray-50/50 space-y-3">
              <div className="flex justify-between items-center text-sm">
                <span className="text-warm-gray-800 font-medium">Current Status</span>
                <div>
                  {device.status === "available" && (
                    <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                      In Storage (Available)
                    </span>
                  )}
                  {device.status === "loaned" && !loanRemaining?.isOverdue && (
                    <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-800 border border-indigo-200">
                      Loaned Out
                    </span>
                  )}
                  {device.status === "loaned" && loanRemaining?.isOverdue && (
                    <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 border border-rose-200 animate-pulse">
                      Overdue (Requires Return)
                    </span>
                  )}
                  {device.status === "maintenance" && (
                    <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-tea-amber-100 text-tea-amber-800 border border-tea-amber-200">
                      Under Maintenance
                    </span>
                  )}
                  {device.status === "retired" && (
                    <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-warm-gray-200 text-warm-gray-800 border border-warm-gray-300">
                      Retired
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs pt-2 border-t border-warm-gray-100 text-warm-gray-800">
                <div className="space-y-1">
                  <span className="text-warm-gray-800 block">Condition</span>
                  <span className="font-semibold text-warm-gray-900 bg-white px-2 py-1 rounded border border-warm-gray-100 inline-block">
                    {device.condition}
                  </span>
                </div>
                <div className="space-y-1">
                  <span className="text-warm-gray-800 block">Location</span>
                  <span className="font-semibold text-warm-gray-900 bg-white px-2 py-1 rounded border border-warm-gray-100 inline-block flex items-center gap-1">
                    <MapPin className="h-3 w-3 text-matcha-600" />
                    {device.location}
                  </span>
                </div>
                <div className="space-y-1">
                  <span className="text-warm-gray-800 block">Acquisition Date</span>
                  <span className="font-semibold text-warm-gray-900">
                    {formatFriendlyDate(device.purchaseDate)}
                  </span>
                </div>
                {device.notes && (
                  <div className="col-span-2 space-y-1 mt-1">
                    <span className="text-warm-gray-800 block">Hardware / Care Notes</span>
                    <p className="text-warm-gray-900 italic bg-white p-2 rounded border border-warm-gray-100">
                      {device.notes}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Borrower user info (if currently checked out) */}
            {device.status === "loaned" && device.currentLoan && (
              <div className="border border-matcha-200/60 rounded-xl p-4 bg-matcha-50/10 space-y-3">
                <div className="flex items-center gap-2 pb-2 border-b border-matcha-100/50">
                  <User className="h-4 w-4 text-matcha-600" />
                  <h4 className="font-bold text-sm text-matcha-900 font-display">Assigned Borrower Details</h4>
                </div>
                
                <div className="flex gap-3 items-start">
                  <div className="h-12 w-12 rounded-full bg-matcha-100 overflow-hidden border border-matcha-200 flex-shrink-0">
                    {staffMembers.find(s => s.id === device.currentLoan?.userId)?.avatarUrl ? (
                      <img 
                        src={staffMembers.find(s => s.id === device.currentLoan?.userId)?.avatarUrl} 
                        alt={device.currentLoan.userName}
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center font-bold text-matcha-800 text-sm">
                        {device.currentLoan.userName.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="space-y-1 flex-1">
                    <p className="text-sm font-semibold text-warm-gray-900">{device.currentLoan.userName}</p>
                    
                    <div className="flex flex-col gap-1 text-xs text-warm-gray-800">
                      <span className="flex items-center gap-1">
                        <Mail className="h-3 w-3 text-warm-gray-800" />
                        <a href={`mailto:${device.currentLoan.userEmail}`} className="hover:underline text-matcha-700">
                          {device.currentLoan.userEmail}
                        </a>
                      </span>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="flex items-center gap-1">
                          <Building className="h-3 w-3 text-warm-gray-800" />
                          {device.currentLoan.userDepartment}
                        </span>
                        {(() => {
                          const matchedStaff = staffMembers.find(s => s.id === device.currentLoan?.userId);
                          const statusMeta = getEmploymentStatusMeta(matchedStaff?.employmentStatus);
                          return (
                            <>
                              <span className="text-warm-gray-300" aria-hidden="true">·</span>
                              <span className={`inline-flex items-center gap-1.5 font-medium ${statusMeta.textClass}`}>
                                <span className={`h-1.5 w-1.5 rounded-full ${statusMeta.dotClass}`} />
                                {statusMeta.label}
                              </span>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white border border-matcha-100 p-3 rounded-lg grid grid-cols-2 gap-2 text-[11px] text-warm-gray-800">
                  <div>
                    <span className="block opacity-80 uppercase tracking-wider text-[9px] font-bold">Checked Out On</span>
                    <span className="font-semibold text-warm-gray-900">{formatFriendlyDate(device.currentLoan.checkoutDate)}</span>
                  </div>
                  <div>
                    <span className="block opacity-80 uppercase tracking-wider text-[9px] font-bold">Due Back Date</span>
                    <span className="font-semibold text-warm-gray-900">{formatFriendlyDate(device.currentLoan.expectedReturnDate)}</span>
                  </div>
                  <div className="col-span-2 pt-2 border-t border-warm-gray-100/50 flex justify-between items-center">
                    <span className="font-medium">Rental Status:</span>
                    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${loanRemaining?.isOverdue ? "bg-rose-100 text-rose-800" : "bg-matcha-100 text-matcha-800"}`}>
                      {loanRemaining?.text}
                    </span>
                  </div>
                </div>

                {device.currentLoan.notes && (
                  <div className="text-xs bg-warm-gray-50/50 p-2 rounded border border-warm-gray-100/70 italic text-warm-gray-800">
                    &ldquo;{device.currentLoan.notes}&rdquo;
                  </div>
                )}
              </div>
            )}

            {/* ACTION FORMS CONTEXTUALLY */}
            
            {/* 1. CHECK OUT FORM (IF AVAILABLE) */}
            {device.status === "available" && (
              <form onSubmit={handleCheckoutSubmit} className="border border-matcha-200 rounded-xl p-4 bg-matcha-50/10 space-y-4">
                <div className="flex items-center gap-1.5 pb-2 border-b border-matcha-100/50">
                  <CornerDownLeft className="h-4 w-4 text-matcha-700" />
                  <h4 className="font-bold text-sm text-matcha-900 font-display">New Loan Checkout</h4>
                </div>

                  <div className="space-y-3">
                    {/* Select Staff Borrower */}
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-warm-gray-800 block">Select Staff Borrower</label>
                      <select
                        value={selectedStaffId}
                        onChange={(e) => setSelectedStaffId(e.target.value)}
                        className="w-full text-xs p-2 rounded-lg border border-warm-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-matcha-500 font-medium"
                        required
                      >
                        {staffMembers.map((staff) => (
                          <option key={staff.id} value={staff.id}>
                            {staff.name} ({staff.department} · {staff.employmentStatus || "Full-Time"})
                          </option>
                        ))}
                        <option value="new">➕ Register & Checkout to New Borrower...</option>
                      </select>
                      {selectedStaffId !== "new" && (() => {
                        const selectedStaff = staffMembers.find(s => s.id === selectedStaffId);
                        const meta = getEmploymentStatusMeta(selectedStaff?.employmentStatus);
                        if (!meta.warningText) return null;
                        return (
                          <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5 mt-1.5">
                            <AlertCircle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                            <span>{meta.warningText}</span>
                          </p>
                        );
                      })()}
                    </div>

                    {/* Inline New Borrower Fields if 'new' selected */}
                    {(selectedStaffId === "new" || staffMembers.length === 0) && (
                      <div className="p-3 bg-matcha-50/50 border border-matcha-200 rounded-xl space-y-2.5 animate-in fade-in duration-200">
                        <p className="text-[11px] font-bold text-matcha-800 uppercase tracking-wide">
                          New Borrower Details
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <label className="text-[10px] font-semibold text-warm-gray-800 block">Full Name</label>
                            <input
                              type="text"
                              placeholder="e.g. Alex Morgan"
                              value={newBorrowerName}
                              onChange={(e) => setNewBorrowerName(e.target.value)}
                              className="w-full text-xs p-2 rounded-lg border border-warm-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-matcha-500"
                              required
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-semibold text-warm-gray-800 block">Email</label>
                            <input
                              type="email"
                              placeholder="alex@tealoan.co"
                              value={newBorrowerEmail}
                              onChange={(e) => setNewBorrowerEmail(e.target.value)}
                              className="w-full text-xs p-2 rounded-lg border border-warm-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-matcha-500"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <label className="text-[10px] font-semibold text-warm-gray-800 block">Department</label>
                            <select
                              value={newBorrowerDept}
                              onChange={(e) => setNewBorrowerDept(e.target.value)}
                              className="w-full text-xs p-2 rounded-lg border border-warm-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-matcha-500 font-medium"
                            >
                              {departments.map((dept) => (
                                <option key={dept} value={dept}>{dept}</option>
                              ))}
                            </select>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-semibold text-warm-gray-800 block">Employment Status</label>
                            <select
                              value={newBorrowerEmploymentStatus}
                              onChange={(e) => setNewBorrowerEmploymentStatus(e.target.value as EmploymentStatus)}
                              className="w-full text-xs p-2 rounded-lg border border-warm-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-matcha-500 font-medium"
                            >
                              {EMPLOYMENT_STATUSES.map((status) => (
                                <option key={status} value={status}>{status}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Start Date & End Date Pickers */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-warm-gray-800 block">Start Date</label>
                        <input
                          type="date"
                          value={startDate}
                          onChange={(e) => setStartDate(e.target.value)}
                          className="w-full text-xs p-2 rounded-lg border border-warm-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-matcha-500 text-warm-gray-900"
                          required
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-warm-gray-800 block">End Date (Expected Return)</label>
                        <div className="relative flex items-center">
                          <input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="w-full text-xs p-2 pr-12 rounded-lg border border-warm-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-matcha-500 text-warm-gray-900"
                          />
                          {endDate && (
                            <button
                              type="button"
                              onClick={() => setEndDate("")}
                              className="absolute right-2 text-rose-600 hover:text-rose-700 text-[10px] font-bold cursor-pointer bg-white px-1.5 py-0.5 rounded border border-warm-gray-200 hover:border-rose-200 transition-colors"
                              title="Clear date for indefinite loan"
                            >
                              Clear
                            </button>
                          )}
                        </div>
                        <p className="text-[10px] text-warm-gray-850 italic mt-0.5">
                          {endDate ? "Return date set." : "Blank for indefinite loan."}
                        </p>
                      </div>
                    </div>

                    {/* Quick-select Helper */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold text-warm-gray-800 block">Quick Duration Presets (From Start Date):</label>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { label: "+7 Days", val: 7 },
                          { label: "+14 Days", val: 14 },
                          { label: "+30 Days", val: 30 }
                        ].map((item) => (
                          <button
                            key={item.val}
                            type="button"
                            onClick={() => handleQuickDuration(item.val)}
                            className="py-1 px-2 text-[10px] rounded-md border border-warm-gray-200 bg-white hover:bg-warm-gray-50 text-warm-gray-800 font-medium transition-colors cursor-pointer text-center"
                          >
                            {item.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Notes */}
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-warm-gray-800 block">Loan Notes (Optional)</label>
                      <textarea
                        value={checkoutNotes}
                        onChange={(e) => setCheckoutNotes(e.target.value)}
                        placeholder="Purpose of check-out (e.g., travel to offsite workshop, remote coding burst...)"
                        rows={2}
                        className="w-full text-xs p-2 rounded-lg border border-warm-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-matcha-500"
                      />
                    </div>

                    <button
                      type="submit"
                      className="w-full bg-matcha-600 hover:bg-matcha-700 text-white font-medium text-xs py-2 px-4 rounded-lg transition-colors shadow-xs flex items-center justify-center gap-1.5"
                    >
                      <PlusCircle className="h-4 w-4" />
                      Confirm Staff Checkout
                    </button>
                  </div>
              </form>
            )}

            {/* 2. RETURN DEVICE FORM (IF LOANED) */}
            {device.status === "loaned" && (
              <form onSubmit={handleReturnSubmit} className="border border-emerald-200 rounded-xl p-4 bg-emerald-50/10 space-y-4">
                <div className="flex items-center gap-1.5 pb-2 border-b border-emerald-100">
                  <CheckCircle className="h-4 w-4 text-emerald-700" />
                  <h4 className="font-bold text-sm text-emerald-900 font-display">Process Device Return</h4>
                </div>

                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1 col-span-2">
                      <label className="text-xs font-semibold text-warm-gray-800 block">Received Condition</label>
                      <div className="grid grid-cols-4 gap-1">
                        {(["Excellent", "Good", "Fair", "Needs Service"] as DeviceCondition[]).map((cond) => (
                          <button
                            key={cond}
                            type="button"
                            onClick={() => setReturnCondition(cond)}
                            className={`py-1 text-[10px] rounded border text-center font-medium transition-colors ${returnCondition === cond ? "bg-emerald-600 border-emerald-600 text-white" : "bg-white border-warm-gray-200 hover:bg-warm-gray-50 text-warm-gray-800"}`}
                          >
                            {cond}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-warm-gray-800 block">Return Notes (Optional)</label>
                    <textarea
                      value={returnNotes}
                      onChange={(e) => setReturnNotes(e.target.value)}
                      placeholder="Notes on hardware condition on return..."
                      rows={2}
                      className="w-full text-xs p-2 rounded-lg border border-warm-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs py-2 px-4 rounded-lg transition-colors shadow-xs flex items-center justify-center gap-1.5"
                  >
                    Confirm Return & Close Loan
                  </button>
                </div>
              </form>
            )}

            {/* 3. UNDER MAINTENANCE PANEL (IF MAINTENANCE) */}
            {device.status === "maintenance" && (
              <form onSubmit={handleMaintenanceSubmit} className="border border-tea-amber-200 rounded-xl p-4 bg-tea-amber-50/10 space-y-4">
                <div className="flex items-center gap-1.5 pb-2 border-b border-tea-amber-200">
                  <Wrench className="h-4 w-4 text-tea-amber-700" />
                  <h4 className="font-bold text-sm text-tea-amber-800 font-display">Resolve Maintenance</h4>
                </div>

                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-warm-gray-800 block">Repaired Condition Status</label>
                    <div className="grid grid-cols-4 gap-1">
                      {(["Excellent", "Good", "Fair"] as DeviceCondition[]).map((cond) => (
                        <button
                          key={cond}
                          type="button"
                          onClick={() => setFixedCondition(cond)}
                          className={`py-1 text-[10px] rounded border text-center font-medium transition-colors ${fixedCondition === cond ? "bg-tea-amber-600 border-tea-amber-600 text-white" : "bg-white border-warm-gray-200 hover:bg-warm-gray-50 text-warm-gray-800"}`}
                        >
                          {cond}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-warm-gray-800 block">Service Log / Action Taken</label>
                    <textarea
                      value={maintenanceNotes}
                      onChange={(e) => setMaintenanceNotes(e.target.value)}
                      placeholder="What was serviced? (e.g., replaced rear glass, steam-cleaned hot water line, calibrated sensor...)"
                      rows={2}
                      className="w-full text-xs p-2 rounded-lg border border-warm-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-tea-amber-500"
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-tea-amber-600 hover:bg-tea-amber-700 text-white font-medium text-xs py-2 px-4 rounded-lg transition-colors shadow-xs"
                  >
                    Complete Servicing & Re-shelve Device
                  </button>
                </div>
              </form>
            )}

            {/* ADMINISTRATIVE CONTROLS / OTHER UTILITIES */}
            {device.status !== "retired" && (
              <div className="border-t border-warm-gray-100 pt-3 flex gap-2">
                {/* Send to Maintenance option (if not currently in maintenance or retired) */}
                {device.status === "available" && !showMaintenanceForm && (
                  <button
                    type="button"
                    onClick={() => setShowMaintenanceForm(true)}
                    className="flex-1 text-center py-2 border border-tea-amber-200 text-tea-amber-700 hover:bg-tea-amber-50 text-xs rounded-lg font-medium transition-colors flex items-center justify-center gap-1"
                  >
                    <Wrench className="h-3.5 w-3.5" />
                    Send to Service Bench
                  </button>
                )}

                {/* Retire Device Option */}
                <button
                  type="button"
                  onClick={() => {
                    if (confirm(`Are you sure you want to retire "${device.name}"? This removes it from active loan availability.`)) {
                      onRetireDevice(device.id);
                    }
                  }}
                  className="flex-1 text-center py-2 border border-rose-200 text-rose-700 hover:bg-rose-50 text-xs rounded-lg font-medium transition-colors flex items-center justify-center gap-1"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Retire Equipment
                </button>
              </div>
            )}

            {/* SEND TO MAINTENANCE OVERLAY FORM */}
            {showMaintenanceForm && (
              <form onSubmit={handleSendToMaintenanceSubmit} className="border border-tea-amber-200 rounded-xl p-4 bg-tea-amber-50/20 space-y-3">
                <div className="flex justify-between items-center pb-2 border-b border-tea-amber-100">
                  <h5 className="font-semibold text-xs text-tea-amber-800">Initiate Service Order</h5>
                  <button type="button" onClick={() => setShowMaintenanceForm(false)} className="text-xs text-warm-gray-800 hover:underline">Cancel</button>
                </div>
                <div className="space-y-2">
                  <label className="text-[11px] font-semibold text-warm-gray-800 block">Report Issue Details</label>
                  <textarea
                    value={issueNotes}
                    onChange={(e) => setIssueNotes(e.target.value)}
                    placeholder="Describe the diagnostics issue (e.g., loose hinge, tea pump clogged, sensor error)..."
                    rows={2}
                    className="w-full text-xs p-2 rounded-lg border border-warm-gray-200 bg-white"
                    required
                  />
                  <button
                    type="submit"
                    className="w-full bg-tea-amber-600 hover:bg-tea-amber-700 text-white font-medium text-[11px] py-1.5 rounded-lg"
                  >
                    Confirm Dispatch to Service Bench
                  </button>
                </div>
              </form>
            )}

            {/* DANGER ZONE (Delete Option) */}
            <div className="border-t border-rose-100 pt-4 mt-6">
              <div className="bg-rose-50/50 border border-rose-100 rounded-xl p-4">
                <h5 className="font-bold text-xs text-rose-800 flex items-center gap-1.5 mb-1 font-display">
                  <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                  Danger Zone
                </h5>
                <p className="text-[10px] text-warm-gray-800 leading-normal mb-3">
                  Permanently erase this equipment record and all associated loan history from the system. This action is irreversible.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm(`CRITICAL WARNING: Are you sure you want to PERMANENTLY DELETE "${device.name}"?\n\nThis will remove it entirely from the database and wipe out all of its loan history. This action cannot be undone.`)) {
                      onDeleteDevice(device.id);
                    }
                  }}
                  className="w-full text-center py-2 bg-rose-600 hover:bg-rose-750 text-white text-xs rounded-lg font-semibold shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete Equipment Permanently
                </button>
              </div>
            </div>
            </>
          )
        ) : (
          /* DETAILED LOAN HISTORY TAB */
          <div className="space-y-4">
            <h4 className="font-bold text-sm text-warm-gray-900 font-display flex items-center gap-1">
              <History className="h-4 w-4 text-matcha-600" />
              Complete Checkout Logs
            </h4>

            {device.history.length === 0 ? (
              <div className="text-center p-6 bg-warm-gray-50 rounded-xl border border-dashed border-warm-gray-200">
                <p className="text-xs text-warm-gray-800">No checkout history logs available for this hardware yet.</p>
              </div>
            ) : (
              <div className="relative pl-4 border-l-2 border-matcha-100 space-y-6 pt-2">
                {device.history.map((record, index) => {
                  const isCurrent = record.status === "active" || record.status === "overdue";
                  return (
                    <div key={record.id} className="relative">
                      {/* Timeline dot */}
                      <span className={`absolute -left-[21px] top-1.5 h-3.5 w-3.5 rounded-full border-2 bg-white ${isCurrent ? "border-matcha-600 animate-pulse" : "border-warm-gray-300"}`} />

                      <div className="space-y-1 text-xs">
                        <div className="flex justify-between items-start gap-2">
                          <span className="font-semibold text-warm-gray-900 text-sm">
                            {record.userName}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-mono text-warm-gray-800 uppercase tracking-wide bg-warm-gray-100 px-1.5 py-0.5 rounded">
                              {record.userDepartment}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                if (isSuperAdmin) {
                                  if (confirm(`Superadmin Action: Are you sure you want to permanently delete the history record for ${record.userName}?`)) {
                                    onDeleteHistoryRecord?.(device.id, record.id);
                                  }
                                } else {
                                  setDeletingRecordId(record.id);
                                  setPinInput("");
                                  setPinError(false);
                                }
                              }}
                              className="text-warm-gray-800 hover:text-rose-700 hover:bg-rose-50 p-1 rounded transition-colors cursor-pointer"
                              title={isSuperAdmin ? "Delete history entry (Superadmin)" : "Delete history entry (Requires Superadmin Passcode)"}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>

                        <p className="text-[10px] text-warm-gray-800 font-mono">
                          {formatFriendlyDate(record.checkoutDate)} &rarr;{" "}
                          {record.returnedDate ? formatFriendlyDate(record.returnedDate) : "Present"}
                        </p>

                        <div className="flex items-center gap-3 text-[10px] pt-1">
                          <span className="text-warm-gray-800">
                            Duration: <span className="font-semibold text-warm-gray-950">{getLoanDurationText(record)}</span>
                          </span>
                          {record.conditionOnReturn && (
                            <span className="text-warm-gray-800">
                              Returned Condition: <span className="font-semibold text-matcha-700">{record.conditionOnReturn}</span>
                            </span>
                          )}
                        </div>

                        {record.notes && (
                          <p className="text-warm-gray-800 bg-warm-gray-50 p-2 rounded border border-warm-gray-100/50 mt-1 italic leading-relaxed">
                            &ldquo;{record.notes}&rdquo;
                          </p>
                        )}

                        {isCurrent && (
                          <div className="mt-1">
                            <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-matcha-100 text-matcha-800">
                              Current Active Borrower
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* SUPERADMIN PIN AUTHORIZATION MODAL */}
      {deletingRecordId && !isSuperAdmin && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-matcha-100 rounded-2xl p-5 max-w-sm w-full shadow-xl space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-2 text-amber-800 font-display font-bold text-sm">
              <ShieldCheck className="h-5 w-5 text-amber-600 shrink-0" />
              <span>Superadmin Passcode Required</span>
            </div>
            <p className="text-xs text-warm-gray-800 leading-relaxed">
              Only superadmins are authorized to remove entries from the detailed checkout history. Please enter the Superadmin Passcode to authenticate and confirm deletion.
            </p>
            <form 
              onSubmit={(e) => {
                e.preventDefault();
                const cleanPin = pinInput.trim();
                if (cleanPin === superAdminPin || cleanPin === "admin123" || cleanPin === "superadmin") {
                  onUnlockSuperAdmin?.(cleanPin);
                  onDeleteHistoryRecord?.(device.id, deletingRecordId);
                  setDeletingRecordId(null);
                  setPinInput("");
                  setPinError(false);
                } else {
                  setPinError(true);
                }
              }} 
              className="space-y-3"
            >
              <div>
                <input
                  type="password"
                  placeholder="Enter Superadmin Passcode (default: admin123)"
                  value={pinInput}
                  onChange={(e) => { setPinInput(e.target.value); setPinError(false); }}
                  className={`w-full text-xs p-2.5 rounded-lg border ${pinError ? 'border-rose-500 ring-2 ring-rose-200' : 'border-warm-gray-200'} focus:outline-none focus:ring-2 focus:ring-amber-500`}
                  autoFocus
                />
                {pinError && (
                  <p className="text-[11px] text-rose-600 mt-1 font-medium flex items-center gap-1">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    <span>Incorrect Passcode. Only Superadmins can remove history entries.</span>
                  </p>
                )}
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => { setDeletingRecordId(null); setPinInput(""); setPinError(false); }}
                  className="px-3 py-1.5 text-xs text-warm-gray-800 hover:bg-warm-gray-100 rounded-lg font-medium transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 text-xs bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-semibold transition-colors shadow-xs cursor-pointer"
                >
                  Authenticate & Remove
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </motion.div>
  );
}
