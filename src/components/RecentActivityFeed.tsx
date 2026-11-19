import React, { useState, useMemo } from "react";
import { Device, LoanRecord } from "../types";
import { formatFriendlyDate, getLoanRemainingDays, parseDate } from "../utils";
import { 
  ArrowUpRight, 
  ArrowDownLeft, 
  Clock, 
  Laptop, 
  Smartphone, 
  Headphones, 
  Monitor, 
  Coffee, 
  ChevronDown, 
  ChevronUp, 
  ExternalLink,
  Activity,
  CheckCircle2,
  Calendar,
  AlertTriangle,
  UserCheck
} from "lucide-react";

export interface ActivityEvent {
  id: string;
  recordId: string;
  type: "checkout" | "return";
  date: string;
  timestamp: number;
  deviceId: string;
  deviceName: string;
  deviceModel: string;
  deviceCategory: string;
  deviceImage: string;
  serialNumber: string;
  borrowerName: string;
  borrowerEmail: string;
  borrowerDepartment: string;
  expectedReturnDate?: string;
  conditionOnReturn?: string;
  notes?: string;
  status: "active" | "returned" | "overdue";
}

interface RecentActivityFeedProps {
  devices: Device[];
  onSelectDevice: (deviceId: string) => void;
}

export default function RecentActivityFeed({ devices, onSelectDevice }: RecentActivityFeedProps) {
  const [filterType, setFilterType] = useState<"all" | "checkout" | "return">("all");
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);

  // Extract all checkout and return activities from all devices
  const allActivities = useMemo(() => {
    const list: ActivityEvent[] = [];

    devices.forEach((device) => {
      // Collect records from history and active currentLoan without duplicates
      const recordsMap = new Map<string, LoanRecord>();
      
      if (device.currentLoan) {
        recordsMap.set(device.currentLoan.id, device.currentLoan);
      }
      
      (device.history || []).forEach((rec) => {
        recordsMap.set(rec.id, rec);
      });

      recordsMap.forEach((rec) => {
        // Skip purely internal service logs if desired or include them; here we include checkouts
        if (rec.checkoutDate) {
          // Extract timestamp from id if available, else date
          let ts = 0;
          if (rec.id.startsWith("loan-")) {
            const rawTs = Number(rec.id.replace("loan-", ""));
            ts = !isNaN(rawTs) && rawTs > 10000000 ? rawTs : parseDate(rec.checkoutDate).getTime();
          } else {
            ts = parseDate(rec.checkoutDate).getTime();
          }

          // 1. Checkout Event
          list.push({
            id: `${rec.id}-checkout`,
            recordId: rec.id,
            type: "checkout",
            date: rec.checkoutDate,
            timestamp: ts,
            deviceId: device.id,
            deviceName: device.name,
            deviceModel: device.model,
            deviceCategory: device.category,
            deviceImage: device.image,
            serialNumber: device.serialNumber,
            borrowerName: rec.userName,
            borrowerEmail: rec.userEmail,
            borrowerDepartment: rec.userDepartment,
            expectedReturnDate: rec.expectedReturnDate,
            notes: rec.notes,
            status: rec.status
          });
        }

        // 2. Return Event
        if (rec.returnedDate || rec.status === "returned") {
          const retDate = rec.returnedDate || rec.checkoutDate;
          const retTs = parseDate(retDate).getTime() + 1000; // slightly after checkout

          list.push({
            id: `${rec.id}-return`,
            recordId: rec.id,
            type: "return",
            date: retDate,
            timestamp: retTs,
            deviceId: device.id,
            deviceName: device.name,
            deviceModel: device.model,
            deviceCategory: device.category,
            deviceImage: device.image,
            serialNumber: device.serialNumber,
            borrowerName: rec.userName,
            borrowerEmail: rec.userEmail,
            borrowerDepartment: rec.userDepartment,
            conditionOnReturn: rec.conditionOnReturn || "Good",
            notes: rec.notes,
            status: "returned"
          });
        }
      });
    });

    // Sort descending by date, then tie-break with returns before checkouts on the same day
    list.sort((a, b) => {
      if (a.date !== b.date) {
        return b.date.localeCompare(a.date);
      }
      if (a.type !== b.type) {
        return a.type === "return" ? -1 : 1;
      }
      return b.timestamp - a.timestamp;
    });

    return list;
  }, [devices]);

  // Filter and pick top 5
  const filteredActivities = useMemo(() => {
    let result = allActivities;
    if (filterType !== "all") {
      result = result.filter(act => act.type === filterType);
    }
    return result.slice(0, 5);
  }, [allActivities, filterType]);

  const totalCheckoutsCount = useMemo(() => allActivities.filter(a => a.type === "checkout").length, [allActivities]);
  const totalReturnsCount = useMemo(() => allActivities.filter(a => a.type === "return").length, [allActivities]);

  // Helper for category icons
  const getCategoryIcon = (category: string, image: string) => {
    switch (category) {
      case "Laptops":
        return <Laptop className="h-4 w-4 text-matcha-700" />;
      case "Tablets & Phones":
        return <Smartphone className="h-4 w-4 text-matcha-700" />;
      case "Peripherals":
        if (image === "headphones") {
          return <Headphones className="h-4 w-4 text-matcha-700" />;
        }
        return <Monitor className="h-4 w-4 text-matcha-700" />;
      case "Tea & Pantry":
        return <Coffee className="h-4 w-4 text-tea-amber-600" />;
      default:
        return <Laptop className="h-4 w-4 text-matcha-700" />;
    }
  };

  return (
    <div className="bg-white border border-matcha-100 rounded-2xl shadow-xs overflow-hidden transition-all duration-200">
      {/* Header bar */}
      <div className="p-4 sm:px-6 sm:py-4.5 border-b border-warm-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-matcha-50 rounded-xl text-matcha-700 shrink-0">
            <Activity className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-sm text-warm-gray-900 font-display">Recent Activity Feed</h2>
              <span className="inline-flex items-center gap-1.5 text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 rounded-full font-medium">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live Monitoring
              </span>
            </div>
            <p className="text-xs text-warm-gray-800">
              Displaying the last 5 device checkouts &amp; returns across all departments
            </p>
          </div>
        </div>

        {/* Action Controls & Filter Tabs */}
        <div className="flex items-center gap-2 self-start sm:self-center">
          <div className="inline-flex p-1 bg-warm-gray-100 rounded-lg text-xs" role="tablist" aria-label="Activity filter">
            <button
              onClick={() => setFilterType("all")}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                filterType === "all"
                  ? "bg-white text-warm-gray-900 shadow-xs font-semibold"
                  : "text-warm-gray-700 hover:text-warm-gray-950"
              }`}
            >
              All (5)
            </button>
            <button
              onClick={() => setFilterType("checkout")}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer flex items-center gap-1 ${
                filterType === "checkout"
                  ? "bg-white text-blue-700 shadow-xs font-semibold"
                  : "text-warm-gray-700 hover:text-warm-gray-950"
              }`}
            >
              <ArrowUpRight className="h-3 w-3" />
              <span>Checkouts</span>
            </button>
            <button
              onClick={() => setFilterType("return")}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer flex items-center gap-1 ${
                filterType === "return"
                  ? "bg-white text-emerald-700 shadow-xs font-semibold"
                  : "text-warm-gray-700 hover:text-warm-gray-950"
              }`}
            >
              <ArrowDownLeft className="h-3 w-3" />
              <span>Returns</span>
            </button>
          </div>

          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1.5 text-warm-gray-600 hover:text-warm-gray-900 hover:bg-warm-gray-100 rounded-lg transition-colors cursor-pointer"
            title={isCollapsed ? "Expand activity feed" : "Collapse activity feed"}
            aria-label={isCollapsed ? "Expand activity feed" : "Collapse activity feed"}
          >
            {isCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Collapsible Content */}
      {!isCollapsed && (
        <div className="divide-y divide-warm-gray-100">
          {filteredActivities.length === 0 ? (
            <div className="p-8 text-center text-warm-gray-700 text-xs">
              <Clock className="h-8 w-8 text-warm-gray-400 mx-auto mb-2" />
              <p className="font-semibold text-warm-gray-900">No recent activity found</p>
              <p className="text-warm-gray-600 mt-1">
                {filterType === "all" 
                  ? "No equipment checkouts or returns have been recorded yet." 
                  : `No recent ${filterType}s match your selected filter.`}
              </p>
            </div>
          ) : (
            filteredActivities.map((activity, index) => {
              const isCheckout = activity.type === "checkout";
              const loanRemaining = isCheckout && activity.expectedReturnDate
                ? getLoanRemainingDays(activity.expectedReturnDate)
                : null;

              return (
                <div
                  key={activity.id}
                  className="p-3.5 sm:px-6 hover:bg-warm-gray-50/70 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 group"
                >
                  {/* Left: Event Type Badge + Device Details */}
                  <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
                    {/* Event Type Icon Indicator */}
                    <div
                      className={`p-2 rounded-xl shrink-0 border ${
                        isCheckout
                          ? "bg-blue-50 text-blue-700 border-blue-200/60"
                          : "bg-emerald-50 text-emerald-700 border-emerald-200/60"
                      }`}
                      title={isCheckout ? "Device Checked Out" : "Device Returned"}
                    >
                      {isCheckout ? (
                        <ArrowUpRight className="h-4 w-4" />
                      ) : (
                        <ArrowDownLeft className="h-4 w-4" />
                      )}
                    </div>

                    {/* Device & Borrower Details */}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span
                          className={`text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded ${
                            isCheckout
                              ? "bg-blue-100/70 text-blue-800"
                              : "bg-emerald-100/70 text-emerald-800"
                          }`}
                        >
                          {isCheckout ? "Checked Out" : "Returned"}
                        </span>
                        
                        <button
                          onClick={() => onSelectDevice(activity.deviceId)}
                          className="font-bold text-xs sm:text-sm text-warm-gray-900 hover:text-matcha-700 hover:underline transition-colors truncate max-w-[240px] sm:max-w-xs text-left cursor-pointer"
                          title="Click to view full device details and history"
                        >
                          {activity.deviceName}
                        </button>
                        
                        <span className="text-warm-gray-400 text-xs hidden sm:inline" aria-hidden="true">·</span>
                        
                        <span className="text-[11px] font-mono text-warm-gray-600 truncate max-w-[160px]">
                          {activity.deviceModel}
                        </span>
                      </div>

                      {/* Borrower info and metadata */}
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-warm-gray-700">
                        <span className="font-semibold text-warm-gray-900 inline-flex items-center gap-1">
                          <UserCheck className="h-3 w-3 text-warm-gray-500" />
                          {activity.borrowerName}
                        </span>
                        <span className="text-warm-gray-300" aria-hidden="true">·</span>
                        <span className="text-warm-gray-600">{activity.borrowerDepartment}</span>
                        <span className="text-warm-gray-300 hidden md:inline" aria-hidden="true">·</span>
                        <span className="font-mono text-warm-gray-500 hidden md:inline text-[10px]">
                          S/N: {activity.serialNumber}
                        </span>
                        {activity.conditionOnReturn && !isCheckout && (
                          <>
                            <span className="text-warm-gray-300" aria-hidden="true">·</span>
                            <span className="text-emerald-700 font-medium">
                              Condition: {activity.conditionOnReturn}
                            </span>
                          </>
                        )}
                        {activity.notes && (
                          <>
                            <span className="text-warm-gray-300 hidden lg:inline" aria-hidden="true">·</span>
                            <span className="text-warm-gray-500 italic truncate max-w-[200px] hidden lg:inline" title={activity.notes}>
                              "{activity.notes}"
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: Date, Timing Status & Quick View Action */}
                  <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-warm-gray-100">
                    <div className="text-left sm:text-right">
                      <div className="flex items-center sm:justify-end gap-1 text-xs font-semibold text-warm-gray-900 font-mono tabular-nums">
                        <Calendar className="h-3 w-3 text-warm-gray-400" />
                        <span>{formatFriendlyDate(activity.date)}</span>
                      </div>
                      
                      {isCheckout && loanRemaining && (
                        <div className="text-[10px] mt-0.5">
                          {loanRemaining.isOverdue ? (
                            <span className="inline-flex items-center gap-0.5 text-rose-600 font-semibold">
                              <AlertTriangle className="h-2.5 w-2.5" />
                              {loanRemaining.text}
                            </span>
                          ) : (
                            <span className="text-warm-gray-500 font-medium">
                              {loanRemaining.text}
                            </span>
                          )}
                        </div>
                      )}

                      {!isCheckout && (
                        <div className="text-[10px] text-emerald-600 font-medium mt-0.5 flex items-center sm:justify-end gap-0.5">
                          <CheckCircle2 className="h-2.5 w-2.5" />
                          <span>Checked in to inventory</span>
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => onSelectDevice(activity.deviceId)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-warm-gray-700 hover:text-matcha-700 hover:bg-matcha-50/80 px-2.5 py-1.5 rounded-lg border border-warm-gray-200 hover:border-matcha-200 transition-colors cursor-pointer group-hover:border-matcha-300"
                      title="Inspect device details, loan history, and actions"
                    >
                      <span>View</span>
                      <ExternalLink className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Quiet Footer Note with count totals */}
      {!isCollapsed && filteredActivities.length > 0 && (
        <div className="px-4 py-2.5 bg-warm-gray-50/60 border-t border-warm-gray-100 text-[11px] text-warm-gray-600 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <span>
              Total logged: <strong className="text-warm-gray-800 font-mono tabular-nums">{totalCheckoutsCount}</strong> checkouts · <strong className="text-warm-gray-800 font-mono tabular-nums">{totalReturnsCount}</strong> returns
            </span>
          </div>
          <span className="text-warm-gray-500 text-[10px]">
            Tip: Click any device name or View button to inspect its loan history or perform actions
          </span>
        </div>
      )}
    </div>
  );
}
