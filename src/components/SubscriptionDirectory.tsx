import React, { useState } from "react";
import { Subscription, SubscriptionCategory, BillingCycle, SubscriptionStatus } from "../types";
import { SYSTEM_TODAY, formatFriendlyDate, parseDate, getTodayDateString } from "../utils";
import { effectiveRenewalDate } from "../subscriptionDates";
import { 
  Search, 
  Plus, 
  ExternalLink, 
  Copy, 
  Check, 
  Eye, 
  EyeOff, 
  Key, 
  Calendar, 
  User, 
  FileText, 
  Edit3, 
  Trash2, 
  ShieldCheck, 
  Clock, 
  Sparkles, 
  Download, 
  Filter, 
  LayoutGrid, 
  List, 
  Globe, 
  Lock,
  DollarSign,
  XCircle,
  RefreshCw
} from "lucide-react";

interface SubscriptionDirectoryProps {
  subscriptions: Subscription[];
  onAddSubscription: (sub: Omit<Subscription, "id">) => void;
  onUpdateSubscription: (sub: Subscription) => void;
  onDeleteSubscription: (id: string) => void;
  triggerToast: (msg: string) => void;
}

export const CATEGORIES: SubscriptionCategory[] = [
  "SaaS & Software",
  "Cloud Infrastructure",
  "Domain & Hosting",
  "Telecom & Utilities",
  "Security & Identity",
  "Other"
];

export const BILLING_CYCLES: BillingCycle[] = ["Monthly", "Annual", "Biennially", "Quarterly", "One-time"];

export const SUBSCRIPTION_STATUSES: SubscriptionStatus[] = ["Active", "Pending Renewal", "Pending Cancellation", "Paused", "Cancelled"];

const AutoRenewTag = ({ sub }: { sub: Subscription }) => {
  if (!sub.autoRenew || sub.status === "Cancelled") return null;
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-blue-50 text-blue-700 border-blue-200">
      <RefreshCw className="h-3 w-3 shrink-0" />
      Auto-renews
    </span>
  );
};

const StatusTag = ({ sub, nextRenewal }: { sub: Subscription; nextRenewal: string }) => {
  const status = sub.status || "Active";
  if (status === "Active") return null;
  const base = "inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border";
  if (status === "Pending Cancellation") {
    return (
      <span className={`${base} bg-rose-50 text-rose-700 border-rose-200`}>
        <XCircle className="h-3 w-3 shrink-0" />
        Pending cancellation{nextRenewal ? ` · cancel by ${formatFriendlyDate(nextRenewal)}` : ""}
      </span>
    );
  }
  if (status === "Pending Renewal") {
    return <span className={`${base} bg-amber-50 text-amber-700 border-amber-200`}>Pending renewal</span>;
  }
  if (status === "Paused") {
    return <span className={`${base} bg-slate-100 text-slate-600 border-slate-200`}>Paused</span>;
  }
  return <span className={`${base} bg-warm-gray-100 text-warm-gray-500 border-warm-gray-200`}><span className="line-through">Cancelled</span></span>;
};

export default function SubscriptionDirectory({
  subscriptions,
  onAddSubscription,
  onUpdateSubscription,
  onDeleteSubscription,
  triggerToast
}: SubscriptionDirectoryProps) {
  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [renewalFilter, setRenewalFilter] = useState<"All" | "Urgent" | "Upcoming" | "Active" | "PendingCancellation">("All");
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");

  // Show/Hide password tracking per subscription ID
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});
  // Copied fields feedback tracking
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSub, setEditingSub] = useState<Subscription | null>(null);

  // Form State
  const [formData, setFormData] = useState<Omit<Subscription, "id">>({
    name: "",
    url: "",
    username: "",
    password: "",
    renewalDate: SYSTEM_TODAY,
    remarks: "",
    category: "SaaS & Software",
    cost: 0,
    billingCycle: "Monthly",
    contactPerson: "",
    status: "Active"
  });

  // Toggle password visibility
  const togglePasswordVisibility = (id: string) => {
    setVisiblePasswords(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Copy to clipboard helper
  const handleCopy = (text: string, label: string, fieldId: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedField(fieldId);
    triggerToast(`${label} copied to clipboard!`);
    setTimeout(() => setCopiedField(null), 2000);
  };

  // Calculate days remaining until renewal (negative if expired, positive if upcoming)
  const getDaysUntilRenewal = (dateStr: string): number => {
    if (!dateStr) return 999;
    const today = new Date();
    const due = parseDate(dateStr);
    today.setHours(0, 0, 0, 0);
    due.setHours(0, 0, 0, 0);
    const diffTime = due.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  // Effective (next) renewal date: auto-renewing subs roll forward; stored date is never modified
  const todayStr = getTodayDateString();
  const nextRenewalOf = (sub: Subscription): string => effectiveRenewalDate(sub, todayStr);

  // Filter subscriptions
  const filteredSubscriptions = subscriptions.filter(sub => {
    const matchesSearch = 
      sub.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sub.url.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sub.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (sub.remarks && sub.remarks.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (sub.contactPerson && sub.contactPerson.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesCategory = selectedCategory === "All" || sub.category === selectedCategory;

    const days = getDaysUntilRenewal(nextRenewalOf(sub));
    let matchesRenewal = true;
    const isCancelled = sub.status === "Cancelled";
    if (renewalFilter === "Urgent") {
      matchesRenewal = !isCancelled && days < 7;
    } else if (renewalFilter === "Upcoming") {
      matchesRenewal = !isCancelled && days >= 0 && days <= 30;
    } else if (renewalFilter === "Active") {
      matchesRenewal = days > 30;
    } else if (renewalFilter === "PendingCancellation") {
      matchesRenewal = sub.status === "Pending Cancellation";
    }

    return matchesSearch && matchesCategory && matchesRenewal;
  });

  // Calculate Metrics
  const totalCount = subscriptions.length;
  const urgentRenewals = subscriptions.filter(s => s.status !== "Cancelled" && getDaysUntilRenewal(nextRenewalOf(s)) <= 14).length;
  const totalMonthlySpend = subscriptions.reduce((acc, s) => {
    if (!s.cost || s.status === "Cancelled") return acc;
    if (s.billingCycle === "Monthly") return acc + s.cost;
    if (s.billingCycle === "Annual") return acc + (s.cost / 12);
    if (s.billingCycle === "Biennially") return acc + (s.cost / 24);
    if (s.billingCycle === "Quarterly") return acc + (s.cost / 3);
    return acc;
  }, 0);

  // Generate Password Helper
  const generatePassword = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=";
    let pwd = "";
    for (let i = 0; i < 16; i++) {
      pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setFormData(prev => ({ ...prev, password: pwd }));
    triggerToast("Generated new strong 16-character password!");
  };

  // Handle Form Open
  const handleOpenAddModal = () => {
    setEditingSub(null);
    setFormData({
      name: "",
      url: "https://",
      username: "",
      password: "",
      renewalDate: SYSTEM_TODAY,
      remarks: "",
      category: "SaaS & Software",
      cost: 0,
      billingCycle: "Monthly",
      contactPerson: "",
      status: "Active",
      autoRenew: false
    });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (sub: Subscription) => {
    setEditingSub(sub);
    setFormData({
      name: sub.name,
      url: sub.url,
      username: sub.username,
      password: sub.password,
      renewalDate: sub.renewalDate,
      remarks: sub.remarks || "",
      category: sub.category || "SaaS & Software",
      cost: sub.cost || 0,
      billingCycle: sub.billingCycle || "Monthly",
      contactPerson: sub.contactPerson || "",
      status: sub.status || "Active",
      autoRenew: !!sub.autoRenew
    });
    setIsModalOpen(true);
  };

  // Form Submit
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.username.trim()) {
      triggerToast("Please fill in required fields.");
      return;
    }

    // Ensure URL has http/https protocol prefix
    let formattedUrl = formData.url.trim();
    if (formattedUrl && !formattedUrl.startsWith("http://") && !formattedUrl.startsWith("https://")) {
      formattedUrl = "https://" + formattedUrl;
    }

    const { autoRenew: formAutoRenew, ...restForm } = formData;
    const autoRenewOn = !!formAutoRenew && formData.billingCycle !== "One-time";
    const payload: Omit<Subscription, "id"> = {
      ...restForm,
      url: formattedUrl
    };
    // Only write autoRenew: true when on; write false only if the record already had the key
    if (autoRenewOn) {
      payload.autoRenew = true;
    } else if (editingSub && "autoRenew" in editingSub) {
      payload.autoRenew = false;
    }

    if (editingSub) {
      onUpdateSubscription({
        ...payload,
        id: editingSub.id
      });
      triggerToast(`Updated subscription: ${payload.name}`);
    } else {
      onAddSubscription(payload);
      triggerToast(`Added new subscription record: ${payload.name}`);
    }

    setIsModalOpen(false);
  };

  // Export to CSV
  const handleExportCSV = () => {
    const headers = ["Name", "URL", "Username", "Password", "Renewal Date", "Category", "Cost", "Billing Cycle", "Contact Person", "Remarks", "Status", "Next Renewal", "Auto Renew"];
    const rows = subscriptions.map(s => [
      `"${s.name.replace(/"/g, '""')}"`,
      `"${s.url.replace(/"/g, '""')}"`,
      `"${s.username.replace(/"/g, '""')}"`,
      `"${s.password.replace(/"/g, '""')}"`,
      `"${s.renewalDate}"`,
      `"${s.category || ""}"`,
      s.cost || 0,
      `"${s.billingCycle || ""}"`,
      `"${(s.contactPerson || "").replace(/"/g, '""')}"`,
      `"${(s.remarks || "").replace(/"/g, '""')}"`,
      `"${s.status || "Active"}"`,
      `"${nextRenewalOf(s)}"`,
      `"${s.autoRenew ? "Yes" : "No"}"`
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `service_providers_directory_${SYSTEM_TODAY}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    triggerToast("Exported Directory to CSV!");
  };

  return (
    <div className="space-y-6">
      {/* Metrics Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-warm-gray-200 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-warm-gray-500 uppercase tracking-wider">Total Records</span>
            <div className="p-2 bg-matcha-50 text-matcha-700 rounded-lg">
              <Globe className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline">
            <span className="text-2xl font-bold text-warm-gray-900">{totalCount}</span>
            <span className="ml-2 text-xs text-warm-gray-500">Service Providers</span>
          </div>
        </div>

        <div className="bg-white border border-warm-gray-200 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-warm-gray-500 uppercase tracking-wider">Renewals Due Soon</span>
            <div className={`p-2 rounded-lg ${urgentRenewals > 0 ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-600"}`}>
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline">
            <span className={`text-2xl font-bold ${urgentRenewals > 0 ? "text-amber-600" : "text-warm-gray-900"}`}>
              {urgentRenewals}
            </span>
            <span className="ml-2 text-xs text-warm-gray-500">&lt; 14 Days</span>
          </div>
        </div>

        <div className="bg-white border border-warm-gray-200 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-warm-gray-500 uppercase tracking-wider">Est. Monthly Spend</span>
            <div className="p-2 bg-emerald-50 text-emerald-700 rounded-lg">
              <DollarSign className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline">
            <span className="text-2xl font-bold text-warm-gray-900">
              ${totalMonthlySpend.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </span>
            <span className="ml-2 text-xs text-warm-gray-500">/ month</span>
          </div>
        </div>

        <div className="bg-white border border-warm-gray-200 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-warm-gray-500 uppercase tracking-wider">Security</span>
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
              <ShieldCheck className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline">
            <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">
              Access control
            </span>
            <span className="ml-2 text-[11px] text-warm-gray-500">Google sign-in required</span>
          </div>
        </div>
      </div>

      {/* Control Toolbar */}
      <div className="bg-white border border-warm-gray-200 rounded-xl p-4 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-warm-gray-400" />
            <input
              type="text"
              placeholder="Search provider, URL, username, or remarks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs bg-warm-gray-50 border border-warm-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-matcha-500 focus:bg-white transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-warm-gray-400 hover:text-warm-gray-600 text-xs"
              >
                Clear
              </button>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCSV}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-warm-gray-700 bg-warm-gray-50 hover:bg-warm-gray-100 border border-warm-gray-200 rounded-lg transition-colors cursor-pointer"
              title="Export CSV"
            >
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Export</span>
            </button>

            {/* View Mode Toggle */}
            <div className="flex items-center border border-warm-gray-200 rounded-lg p-0.5 bg-warm-gray-50">
              <button
                onClick={() => setViewMode("grid")}
                className={`p-1.5 rounded-md text-xs cursor-pointer ${viewMode === "grid" ? "bg-white text-matcha-700 shadow-xs font-semibold" : "text-warm-gray-500 hover:text-warm-gray-800"}`}
                title="Grid View"
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setViewMode("table")}
                className={`p-1.5 rounded-md text-xs cursor-pointer ${viewMode === "table" ? "bg-white text-matcha-700 shadow-xs font-semibold" : "text-warm-gray-500 hover:text-warm-gray-800"}`}
                title="Table View"
              >
                <List className="h-3.5 w-3.5" />
              </button>
            </div>

            <button
              onClick={handleOpenAddModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-matcha-600 hover:bg-matcha-700 border border-matcha-700 rounded-lg shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              <span>Add Service Record</span>
            </button>
          </div>
        </div>

        {/* Filters Row */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-warm-gray-100">
          <span className="text-[11px] font-semibold text-warm-gray-500 uppercase tracking-wider flex items-center gap-1 mr-1">
            <Filter className="h-3 w-3" /> Filters:
          </span>

          {/* Category Dropdown */}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="text-xs bg-warm-gray-50 border border-warm-gray-200 rounded-lg px-2.5 py-1 text-warm-gray-700 focus:outline-none focus:ring-1 focus:ring-matcha-500"
          >
            <option value="All">All Categories</option>
            {CATEGORIES.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>

          {/* Renewal Status Pills */}
          <div className="flex items-center gap-1 bg-warm-gray-50 p-1 rounded-lg border border-warm-gray-200">
            <button
              onClick={() => setRenewalFilter("All")}
              className={`px-2 py-0.5 text-[11px] font-medium rounded-md transition-colors cursor-pointer ${renewalFilter === "All" ? "bg-white text-warm-gray-900 shadow-xs" : "text-warm-gray-500 hover:text-warm-gray-800"}`}
            >
              All Status
            </button>
            <button
              onClick={() => setRenewalFilter("Urgent")}
              className={`px-2 py-0.5 text-[11px] font-medium rounded-md transition-colors cursor-pointer ${renewalFilter === "Urgent" ? "bg-rose-50 text-rose-700 border border-rose-200" : "text-warm-gray-500 hover:text-warm-gray-800"}`}
            >
              Due &lt; 7 Days
            </button>
            <button
              onClick={() => setRenewalFilter("Upcoming")}
              className={`px-2 py-0.5 text-[11px] font-medium rounded-md transition-colors cursor-pointer ${renewalFilter === "Upcoming" ? "bg-amber-50 text-amber-700 border border-amber-200" : "text-warm-gray-500 hover:text-warm-gray-800"}`}
            >
              Due &lt; 30 Days
            </button>
            <button
              onClick={() => setRenewalFilter("PendingCancellation")}
              className={`px-2 py-0.5 text-[11px] font-medium rounded-md transition-colors cursor-pointer ${renewalFilter === "PendingCancellation" ? "bg-rose-50 text-rose-700 border border-rose-200" : "text-warm-gray-500 hover:text-warm-gray-800"}`}
            >
              Pending cancellation
            </button>
          </div>

          {(selectedCategory !== "All" || renewalFilter !== "All" || searchQuery !== "") && (
            <button
              onClick={() => {
                setSelectedCategory("All");
                setRenewalFilter("All");
                setSearchQuery("");
              }}
              className="text-[11px] text-matcha-700 hover:underline font-medium ml-auto"
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* Directory Content Display */}
      {filteredSubscriptions.length === 0 ? (
        <div className="bg-white border border-warm-gray-200 rounded-xl p-12 text-center">
          <div className="w-12 h-12 rounded-full bg-warm-gray-100 text-warm-gray-400 mx-auto flex items-center justify-between justify-center mb-3">
            <Globe className="h-6 w-6" />
          </div>
          <h3 className="text-sm font-semibold text-warm-gray-800">No Service Provider Records Found</h3>
          <p className="text-xs text-warm-gray-500 mt-1 max-w-md mx-auto">
            {searchQuery || selectedCategory !== "All" || renewalFilter !== "All"
              ? "No records match your current filter settings. Try clearing filters or searching for another provider."
              : "Start creating your subscription directory to securely manage service accounts, login credentials, and renewal dates."}
          </p>
          <button
            onClick={handleOpenAddModal}
            className="mt-4 inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-matcha-600 hover:bg-matcha-700 border border-matcha-700 rounded-lg shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>Add First Record</span>
          </button>
        </div>
      ) : viewMode === "grid" ? (
        /* GRID CARD VIEW */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredSubscriptions.map((sub) => {
            const nextRenewal = nextRenewalOf(sub);
            const daysLeft = getDaysUntilRenewal(nextRenewal);
            const isPasswordVisible = !!visiblePasswords[sub.id];

            let badgeColor = "bg-matcha-50 text-matcha-700 border-matcha-200";
            if (sub.status === "Cancelled") {
              badgeColor = "bg-warm-gray-50 text-warm-gray-500 border-warm-gray-200";
            } else if (daysLeft < 0) {
              badgeColor = "bg-rose-100 text-rose-800 border-rose-300 font-bold";
            } else if (daysLeft <= 7) {
              badgeColor = "bg-rose-50 text-rose-700 border-rose-200 font-semibold";
            } else if (daysLeft <= 30) {
              badgeColor = "bg-amber-50 text-amber-800 border-amber-200";
            }

            return (
              <div
                key={sub.id}
                className={`bg-white border border-warm-gray-200 hover:border-matcha-300 rounded-xl p-4 shadow-xs transition-all flex flex-col justify-between space-y-4 ${sub.status === "Cancelled" ? "opacity-60" : ""}`}
              >
                {/* Header */}
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <span className="text-[10px] font-semibold tracking-wider text-warm-gray-400 uppercase block mb-0.5">
                        {sub.category || "Service Provider"}
                      </span>
                      <h4 className="text-sm font-bold text-warm-gray-900 leading-snug">{sub.name}</h4>
                      {((sub.status || "Active") !== "Active" || (sub.autoRenew && sub.status !== "Cancelled")) && (
                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          <StatusTag sub={sub} nextRenewal={nextRenewal} />
                          <AutoRenewTag sub={sub} />
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleOpenEditModal(sub)}
                        className="p-1 text-warm-gray-400 hover:text-warm-gray-700 hover:bg-warm-gray-100 rounded-md transition-colors"
                        title="Edit Record"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Are you sure you want to delete ${sub.name}?`)) {
                            onDeleteSubscription(sub.id);
                            triggerToast(`Deleted ${sub.name}`);
                          }
                        }}
                        className="p-1 text-warm-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors"
                        title="Delete Record"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* URL */}
                  {sub.url && (
                    <a
                      href={sub.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-matcha-700 hover:text-matcha-800 hover:underline font-medium break-all mb-3"
                    >
                      <Globe className="h-3 w-3 shrink-0" />
                      <span className="truncate">{sub.url.replace(/^https?:\/\//, "")}</span>
                      <ExternalLink className="h-3 w-3 shrink-0 opacity-70" />
                    </a>
                  )}

                  {/* Account Credentials Box */}
                  <div className="bg-warm-gray-50 border border-warm-gray-100 rounded-lg p-3 space-y-2 mt-1">
                    {/* Username Field */}
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-warm-gray-500 text-[11px] flex items-center gap-1 shrink-0 font-medium">
                        <User className="h-3 w-3" /> User:
                      </span>
                      <div className="flex items-center gap-1 max-w-[200px]">
                        <span className="font-mono text-warm-gray-900 truncate bg-white px-1.5 py-0.5 rounded border border-warm-gray-200 select-all">
                          {sub.username}
                        </span>
                        <button
                          onClick={() => handleCopy(sub.username, "Username", `user-${sub.id}`)}
                          className="p-1 text-warm-gray-400 hover:text-warm-gray-800 hover:bg-warm-gray-200 rounded transition-colors"
                          title="Copy Username"
                        >
                          {copiedField === `user-${sub.id}` ? (
                            <Check className="h-3 w-3 text-emerald-600" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Password Field */}
                    <div className="flex items-center justify-between text-xs pt-1 border-t border-warm-gray-100">
                      <span className="text-warm-gray-500 text-[11px] flex items-center gap-1 shrink-0 font-medium">
                        <Lock className="h-3 w-3" /> Pass:
                      </span>
                      <div className="flex items-center gap-1">
                        <span className="font-mono text-warm-gray-900 bg-white px-1.5 py-0.5 rounded border border-warm-gray-200 select-all max-w-[140px] truncate">
                          {isPasswordVisible ? sub.password : "••••••••••••"}
                        </span>
                        <button
                          onClick={() => togglePasswordVisibility(sub.id)}
                          className="p-1 text-warm-gray-400 hover:text-warm-gray-800 hover:bg-warm-gray-200 rounded transition-colors"
                          title={isPasswordVisible ? "Hide Password" : "Show Password"}
                        >
                          {isPasswordVisible ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                        </button>
                        <button
                          onClick={() => handleCopy(sub.password, "Password", `pass-${sub.id}`)}
                          className="p-1 text-warm-gray-400 hover:text-warm-gray-800 hover:bg-warm-gray-200 rounded transition-colors"
                          title="Copy Password"
                        >
                          {copiedField === `pass-${sub.id}` ? (
                            <Check className="h-3 w-3 text-emerald-600" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Remarks Box */}
                  {sub.remarks && (
                    <div className="mt-2 text-xs text-warm-gray-600 bg-amber-50/50 border border-amber-100 rounded-lg p-2 flex items-start gap-1.5">
                      <FileText className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
                      <p className="line-clamp-2 italic">{sub.remarks}</p>
                    </div>
                  )}
                </div>

                {/* Footer Info */}
                <div className="pt-3 border-t border-warm-gray-100 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1 text-warm-gray-500">
                    <Calendar className="h-3.5 w-3.5" />
                    <span>Renew: {formatFriendlyDate(nextRenewal)}</span>
                  </div>

                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] border ${badgeColor}`}>
                    {sub.status === "Cancelled"
                      ? "No renewal"
                      : daysLeft < 0
                      ? `Expired (${Math.abs(daysLeft)}d ago)`
                      : daysLeft === 0
                      ? "Renews Today!"
                      : `${daysLeft} days left`}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* TABLE VIEW */
        <div className="bg-white border border-warm-gray-200 rounded-xl overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-warm-gray-50 border-b border-warm-gray-200 text-[11px] font-semibold uppercase tracking-wider text-warm-gray-500">
                  <th className="py-3 px-4">Service Provider</th>
                  <th className="py-3 px-4">Login URL</th>
                  <th className="py-3 px-4">Username</th>
                  <th className="py-3 px-4">Password</th>
                  <th className="py-3 px-4">Renewal Date</th>
                  <th className="py-3 px-4">Cost</th>
                  <th className="py-3 px-4">Remarks</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-warm-gray-100 text-xs">
                {filteredSubscriptions.map((sub) => {
                  const nextRenewal = nextRenewalOf(sub);
            const daysLeft = getDaysUntilRenewal(nextRenewal);
                  const isPasswordVisible = !!visiblePasswords[sub.id];

                  return (
                    <tr key={sub.id} className={`hover:bg-warm-gray-50/80 transition-colors ${sub.status === "Cancelled" ? "opacity-60" : ""}`}>
                      <td className="py-3 px-4 font-semibold text-warm-gray-900">
                        {sub.name}
                        {((sub.status || "Active") !== "Active" || (sub.autoRenew && sub.status !== "Cancelled")) && (
                          <span className="mt-1 flex flex-wrap items-center gap-1">
                            <StatusTag sub={sub} nextRenewal={nextRenewal} />
                            <AutoRenewTag sub={sub} />
                          </span>
                        )}
                        {sub.category && (
                          <span className="block text-[10px] font-normal text-warm-gray-400">
                            {sub.category}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {sub.url ? (
                          <a
                            href={sub.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-matcha-700 hover:underline max-w-[160px] truncate"
                          >
                            <Globe className="h-3 w-3 shrink-0" />
                            <span className="truncate">{sub.url.replace(/^https?:\/\//, "")}</span>
                          </a>
                        ) : (
                          <span className="text-warm-gray-400">-</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1">
                          <span className="font-mono text-warm-gray-800 bg-warm-gray-100 px-1.5 py-0.5 rounded text-[11px]">
                            {sub.username}
                          </span>
                          <button
                            onClick={() => handleCopy(sub.username, "Username", `tuser-${sub.id}`)}
                            className="p-1 text-warm-gray-400 hover:text-warm-gray-700"
                            title="Copy Username"
                          >
                            {copiedField === `tuser-${sub.id}` ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                          </button>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1">
                          <span className="font-mono text-warm-gray-800 bg-warm-gray-100 px-1.5 py-0.5 rounded text-[11px]">
                            {isPasswordVisible ? sub.password : "••••••••"}
                          </span>
                          <button
                            onClick={() => togglePasswordVisibility(sub.id)}
                            className="p-1 text-warm-gray-400 hover:text-warm-gray-700"
                            title={isPasswordVisible ? "Hide" : "Show"}
                          >
                            {isPasswordVisible ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                          </button>
                          <button
                            onClick={() => handleCopy(sub.password, "Password", `tpass-${sub.id}`)}
                            className="p-1 text-warm-gray-400 hover:text-warm-gray-700"
                            title="Copy Password"
                          >
                            {copiedField === `tpass-${sub.id}` ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                          </button>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="space-y-0.5">
                          <span className="block text-warm-gray-800 font-medium">
                            {formatFriendlyDate(nextRenewal)}
                          </span>
                          <span className={`inline-block px-1.5 py-0.2 rounded text-[10px] ${sub.status !== "Cancelled" && daysLeft <= 14 ? "text-amber-700 font-semibold" : "text-warm-gray-500"}`}>
                            {sub.status === "Cancelled" ? "No renewal" : daysLeft < 0 ? `Expired ${Math.abs(daysLeft)}d ago` : `${daysLeft} days remaining`}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-warm-gray-700 font-medium">
                        {sub.cost ? `$${sub.cost} / ${sub.billingCycle || "mo"}` : "-"}
                      </td>
                      <td className="py-3 px-4 text-warm-gray-600 max-w-[200px] truncate" title={sub.remarks}>
                        {sub.remarks || "-"}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleOpenEditModal(sub)}
                            className="p-1 text-warm-gray-400 hover:text-warm-gray-700 hover:bg-warm-gray-100 rounded"
                            title="Edit"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`Delete ${sub.name}?`)) {
                                onDeleteSubscription(sub.id);
                                triggerToast(`Deleted ${sub.name}`);
                              }
                            }}
                            className="p-1 text-warm-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded"
                            title="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ADD / EDIT SUBSCRIPTION MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-warm-gray-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-warm-gray-100">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-matcha-50 text-matcha-700 rounded-lg">
                  <Key className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-warm-gray-900">
                    {editingSub ? "Edit Service Record" : "Add Service Provider Record"}
                  </h3>
                  <p className="text-xs text-warm-gray-500">
                    Store account URL, credentials, renewal dates &amp; remarks.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-warm-gray-400 hover:text-warm-gray-600 text-sm font-semibold p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 mt-4 text-xs">
              {/* Provider Name */}
              <div>
                <label className="block text-warm-gray-700 font-semibold mb-1">
                  Service Provider / Subscription Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Google Workspace, AWS, GitHub Enterprise"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-warm-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-matcha-500"
                />
              </div>

              {/* Login URL */}
              <div>
                <label className="block text-warm-gray-700 font-semibold mb-1">
                  Login / Management URL <span className="text-rose-500">*</span>
                </label>
                <input
                  type="url"
                  required
                  placeholder="https://admin.service.com"
                  value={formData.url}
                  onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                  className="w-full px-3 py-2 border border-warm-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-matcha-500"
                />
              </div>

              {/* Username & Password */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-warm-gray-700 font-semibold mb-1">
                    User Name / Email <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="admin@company.com"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    className="w-full px-3 py-2 border border-warm-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-matcha-500"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-warm-gray-700 font-semibold">
                      Password <span className="text-rose-500">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={generatePassword}
                      className="text-[10px] text-matcha-700 hover:underline flex items-center gap-0.5 font-medium cursor-pointer"
                    >
                      <Sparkles className="h-3 w-3" /> Auto-Generate
                    </button>
                  </div>
                  <input
                    type="text"
                    required
                    placeholder="Password string"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full px-3 py-2 border border-warm-gray-200 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-matcha-500"
                  />
                </div>
              </div>

              {/* Renewal Date & Category */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-warm-gray-700 font-semibold mb-1">
                    Renewal Date <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.renewalDate}
                    onChange={(e) => setFormData({ ...formData, renewalDate: e.target.value })}
                    className="w-full px-3 py-2 border border-warm-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-matcha-500"
                  />
                </div>

                <div>
                  <label className="block text-warm-gray-700 font-semibold mb-1">Category</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value as SubscriptionCategory })}
                    className="w-full px-3 py-2 border border-warm-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-matcha-500"
                  >
                    {CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Cost & Billing Cycle */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-warm-gray-700 font-semibold mb-1">Cost / Amount ($)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={formData.cost || ""}
                    onChange={(e) => setFormData({ ...formData, cost: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-warm-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-matcha-500"
                  />
                </div>

                <div>
                  <label className="block text-warm-gray-700 font-semibold mb-1">Billing Cycle</label>
                  <select
                    value={formData.billingCycle}
                    onChange={(e) => setFormData({ ...formData, billingCycle: e.target.value as BillingCycle })}
                    className="w-full px-3 py-2 border border-warm-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-matcha-500"
                  >
                    {BILLING_CYCLES.map(cycle => (
                      <option key={cycle} value={cycle}>{cycle}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Status */}
              <div>
                <label className="block text-warm-gray-700 font-semibold mb-1">Status</label>
                <select
                  value={formData.status || "Active"}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as SubscriptionStatus })}
                  className="w-full px-3 py-2 border border-warm-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-matcha-500"
                >
                  {SUBSCRIPTION_STATUSES.map(st => (
                    <option key={st} value={st}>{st}</option>
                  ))}
                </select>
              </div>

              {/* Auto-renew */}
              <label className={`flex items-center gap-2 ${formData.billingCycle === "One-time" ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}>
                <input
                  type="checkbox"
                  checked={!!formData.autoRenew && formData.billingCycle !== "One-time"}
                  disabled={formData.billingCycle === "One-time"}
                  onChange={(e) => setFormData({ ...formData, autoRenew: e.target.checked })}
                  className="h-4 w-4 rounded border-warm-gray-300 text-matcha-600 focus:ring-matcha-500"
                />
                <span className="text-warm-gray-700 font-semibold">Renews automatically each billing cycle</span>
              </label>

              {/* Contact Person */}
              <div>
                <label className="block text-warm-gray-700 font-semibold mb-1">Contact Person / Account Owner</label>
                <input
                  type="text"
                  placeholder="e.g. John Doe (IT Manager)"
                  value={formData.contactPerson}
                  onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })}
                  className="w-full px-3 py-2 border border-warm-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-matcha-500"
                />
              </div>

              {/* Remarks */}
              <div>
                <label className="block text-warm-gray-700 font-semibold mb-1">Remarks &amp; Notes</label>
                <textarea
                  rows={3}
                  placeholder="Enter remarks, support hotline, credit card details, license seat limits, or special renewal terms..."
                  value={formData.remarks}
                  onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                  className="w-full px-3 py-2 border border-warm-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-matcha-500 resize-none"
                />
              </div>

              {/* Actions */}
              <div className="pt-4 border-t border-warm-gray-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-warm-gray-200 text-warm-gray-600 rounded-lg hover:bg-warm-gray-50 font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-matcha-600 hover:bg-matcha-700 text-white rounded-lg font-semibold shadow-xs transition-colors cursor-pointer"
                >
                  {editingSub ? "Save Changes" : "Save Service Record"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
