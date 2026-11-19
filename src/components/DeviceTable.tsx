import React, { useState, useEffect } from "react";
import { Device, DeviceCondition } from "../types";
import { getLoanRemainingDays, formatFriendlyDate } from "../utils";
import { 
  Laptop, 
  Smartphone, 
  Monitor, 
  Headphones, 
  Coffee, 
  AlertCircle, 
  Calendar, 
  User,
  ShieldCheck,
  Ban,
  Wrench,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Eye
} from "lucide-react";

interface DeviceTableProps {
  devices: Device[];
  selectedDeviceId: string | null;
  onSelectDevice: (id: string) => void;
}

export default function DeviceTable({ devices, selectedDeviceId, onSelectDevice }: DeviceTableProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Reset to first page when the overall devices list size changes (due to filtering)
  useEffect(() => {
    setCurrentPage(1);
  }, [devices.length]);

  // Pagination calculation
  const totalItems = devices.length;
  const maxPage = Math.ceil(totalItems / itemsPerPage) || 1;
  const activePage = Math.min(currentPage, maxPage);

  const startIndex = (activePage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, totalItems);
  const currentItems = devices.slice(startIndex, endIndex);

  // Determine Category Icon
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

  // Determine Condition styling
  const getConditionStyle = (condition: DeviceCondition) => {
    switch (condition) {
      case "Excellent":
        return "bg-emerald-50 text-emerald-700 border-emerald-100";
      case "Good":
        return "bg-teal-50 text-teal-700 border-teal-100";
      case "Fair":
        return "bg-amber-50 text-amber-700 border-amber-100";
      case "Needs Service":
        return "bg-rose-50 text-rose-700 border-rose-100 font-semibold animate-pulse";
      default:
        return "bg-warm-gray-50 text-warm-gray-700 border-warm-gray-150";
    }
  };

  return (
    <div className="bg-white border border-matcha-100 rounded-2xl shadow-xs overflow-hidden flex flex-col w-full animate-in fade-in duration-300">
      
      {/* Scrollable Table Wrapper */}
      <div className="overflow-x-auto w-full">
        <table className="w-full text-left border-collapse min-w-[800px]">
          <thead>
            <tr className="bg-warm-gray-50/75 border-b border-warm-gray-100 text-[11px] font-semibold text-warm-gray-800 uppercase tracking-wider font-display">
              <th className="py-3 px-4 w-[35%]">Equipment / Specifications</th>
              <th className="py-3 px-4 w-[15%]">Location</th>
              <th className="py-3 px-4 w-[12%]">Condition</th>
              <th className="py-3 px-4 w-[15%]">Status</th>
              <th className="py-3 px-4 w-[23%]">Borrower & Timeline</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-warm-gray-100 text-xs">
            {currentItems.map((device) => {
              const isSelected = device.id === selectedDeviceId;
              
              // Check overdue state
              let loanInfo = null;
              if (device.status === "loaned" && device.currentLoan) {
                const timeStatus = getLoanRemainingDays(device.currentLoan.expectedReturnDate);
                loanInfo = {
                  isOverdue: timeStatus.isOverdue,
                  text: timeStatus.text,
                  userName: device.currentLoan.userName,
                  userDepartment: device.currentLoan.userDepartment
                };
              }

              return (
                <tr
                  key={device.id}
                  onClick={() => onSelectDevice(device.id)}
                  className={`group transition-all duration-150 cursor-pointer hover:bg-matcha-50/30 ${
                    isSelected 
                      ? "bg-matcha-50/60 border-l-4 border-l-matcha-600 font-medium" 
                      : "border-l-4 border-l-transparent"
                  } ${loanInfo?.isOverdue && !isSelected ? "bg-rose-50/10 hover:bg-rose-50/20" : ""}`}
                >
                  {/* Category & Name Column */}
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg shrink-0 ${isSelected ? "bg-matcha-100" : "bg-warm-gray-150/60"}`}>
                        {getCategoryIcon(device.category, device.image)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="font-semibold text-warm-gray-950 truncate text-sm group-hover:text-matcha-800 transition-colors">
                            {device.name}
                          </h4>
                          <span className="text-[10px] bg-warm-gray-100 text-warm-gray-800 px-1.5 py-0.5 rounded-md shrink-0 font-semibold uppercase tracking-wide">
                            {device.category}
                          </span>
                        </div>
                        <p className="text-warm-gray-800 font-mono text-[11px] truncate mt-0.5">
                          {device.model}
                        </p>
                        <div className="mt-1 flex items-center gap-2">
                          <span className="font-mono bg-warm-gray-100 px-1 rounded text-[10px] text-warm-gray-800">
                            S/N: {device.serialNumber}
                          </span>
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Location Column */}
                  <td className="py-3 px-4 text-warm-gray-900 font-medium">
                    {device.location || <span className="text-warm-gray-800 italic">Not Assigned</span>}
                  </td>

                  {/* Condition Column */}
                  <td className="py-3 px-4">
                    <span className={`inline-flex px-2 py-0.5 rounded text-[11px] font-medium border ${getConditionStyle(device.condition)}`}>
                      {device.condition}
                    </span>
                  </td>

                  {/* Status Column */}
                  <td className="py-3 px-4">
                    {device.status === "available" && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <ShieldCheck className="h-3.5 w-3.5" />
                        Available
                      </span>
                    )}
                    {device.status === "loaned" && !loanInfo?.isOverdue && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                        <User className="h-3.5 w-3.5" />
                        Checked Out
                      </span>
                    )}
                    {device.status === "loaned" && loanInfo?.isOverdue && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-100 text-rose-700 border border-rose-300 animate-pulse">
                        <AlertCircle className="h-3.5 w-3.5" />
                        Overdue
                      </span>
                    )}
                    {device.status === "maintenance" && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-tea-amber-50 text-tea-amber-700 border border-tea-amber-200">
                        <Wrench className="h-3.5 w-3.5" />
                        Maintenance
                      </span>
                    )}
                    {device.status === "retired" && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-warm-gray-100 text-warm-gray-800 border border-warm-gray-200">
                        <Ban className="h-3.5 w-3.5" />
                        Retired
                      </span>
                    )}
                  </td>

                  {/* Borrower & Timeline Column */}
                  <td className="py-3 px-4">
                    {device.status === "loaned" && device.currentLoan ? (
                      <div className={`p-1.5 rounded-lg border text-[11px] flex flex-col gap-0.5 ${
                        loanInfo?.isOverdue 
                          ? "bg-rose-50 text-rose-900 border-rose-100" 
                          : "bg-matcha-50/40 text-matcha-900 border-matcha-100/50"
                      }`}>
                        <div className="flex justify-between items-center font-semibold">
                          <span className="truncate max-w-[70%]">{loanInfo?.userName}</span>
                          <span className="text-[9px] uppercase tracking-wider opacity-80">{loanInfo?.userDepartment}</span>
                        </div>
                        <div className="flex justify-between items-center text-[9px] mt-0.5 opacity-90 font-medium">
                          <span className="flex items-center gap-0.5">
                            <Calendar className="h-2.5 w-2.5" />
                            Due {formatFriendlyDate(device.currentLoan.expectedReturnDate)}
                          </span>
                          <span className={`font-semibold ${loanInfo?.isOverdue ? "text-rose-600 font-bold" : "text-matcha-700"}`}>
                            {loanInfo?.text}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <span className="text-warm-gray-800 italic">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls Footer */}
      <div className="bg-warm-gray-50/75 border-t border-warm-gray-100 px-4 py-3 flex flex-col sm:flex-row justify-between items-center gap-3 text-xs text-warm-gray-800 font-medium">
        
        {/* Row selection option */}
        <div className="flex items-center gap-2">
          <span>Show</span>
          <select
            value={itemsPerPage}
            onChange={(e) => {
              setItemsPerPage(Number(e.target.value));
              setCurrentPage(1);
            }}
            className="p-1 rounded-lg border border-warm-gray-200 bg-white text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-matcha-500 text-warm-gray-900"
          >
            <option value={5}>5 entries</option>
            <option value={10}>10 entries</option>
            <option value={20}>20 entries</option>
            <option value={50}>50 entries</option>
          </select>
          <span>per page</span>
        </div>

        {/* Showing status */}
        <div>
          {totalItems === 0 ? (
            <span>No records to display</span>
          ) : (
            <span>
              Showing <span className="font-semibold text-warm-gray-950">{startIndex + 1}</span> to{" "}
              <span className="font-semibold text-warm-gray-950">{endIndex}</span> of{" "}
              <span className="font-semibold text-warm-gray-950">{totalItems}</span> equipment items
            </span>
          )}
        </div>

        {/* Navigator buttons */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setCurrentPage(1)}
            disabled={activePage === 1}
            className="p-1.5 rounded-lg border border-warm-gray-200 bg-white hover:bg-warm-gray-50 text-warm-gray-900 disabled:opacity-40 disabled:hover:bg-white cursor-pointer disabled:cursor-not-allowed transition-colors"
            title="First Page"
          >
            <ChevronsLeft className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
            disabled={activePage === 1}
            className="p-1.5 rounded-lg border border-warm-gray-200 bg-white hover:bg-warm-gray-50 text-warm-gray-900 disabled:opacity-40 disabled:hover:bg-white cursor-pointer disabled:cursor-not-allowed transition-colors"
            title="Previous Page"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>

          {/* Quick Page pills */}
          <div className="flex items-center gap-1">
            {Array.from({ length: maxPage }, (_, i) => i + 1)
              .filter((p) => {
                // Show current, first, last, and immediate neighbors
                return p === 1 || p === maxPage || Math.abs(p - activePage) <= 1;
              })
              .map((p, idx, arr) => {
                const elements = [];
                // Handle ellipsis spacer
                if (idx > 0 && p - arr[idx - 1] > 1) {
                  elements.push(
                    <span key={`ellipsis-${p}`} className="px-1 text-warm-gray-800">
                      ...
                    </span>
                  );
                }
                elements.push(
                  <button
                    key={p}
                    onClick={() => setCurrentPage(p)}
                    className={`h-7 px-2.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                      activePage === p
                        ? "bg-matcha-600 text-white font-bold"
                        : "border border-warm-gray-200 bg-white hover:bg-warm-gray-50 text-warm-gray-950"
                    }`}
                  >
                    {p}
                  </button>
                );
                return elements;
              })}
          </div>

          <button
            onClick={() => setCurrentPage((prev) => Math.min(prev + 1, maxPage))}
            disabled={activePage === maxPage}
            className="p-1.5 rounded-lg border border-warm-gray-200 bg-white hover:bg-warm-gray-50 text-warm-gray-900 disabled:opacity-40 disabled:hover:bg-white cursor-pointer disabled:cursor-not-allowed transition-colors"
            title="Next Page"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setCurrentPage(maxPage)}
            disabled={activePage === maxPage}
            className="p-1.5 rounded-lg border border-warm-gray-200 bg-white hover:bg-warm-gray-50 text-warm-gray-900 disabled:opacity-40 disabled:hover:bg-white cursor-pointer disabled:cursor-not-allowed transition-colors"
            title="Last Page"
          >
            <ChevronsRight className="h-3.5 w-3.5" />
          </button>
        </div>

      </div>

    </div>
  );
}
