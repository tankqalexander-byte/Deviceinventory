import React from "react";
import { Device } from "../types";
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
  Wrench
} from "lucide-react";

interface DeviceCardProps {
  key?: React.Key;
  device: Device;
  isSelected: boolean;
  onClick: () => void;
}

export default function DeviceCard({ device, isSelected, onClick }: DeviceCardProps) {
  // Determine Category Icon
  const getCategoryIcon = () => {
    switch (device.category) {
      case "Laptops":
        return <Laptop className="h-5 w-5 text-matcha-700" />;
      case "Tablets & Phones":
        return <Smartphone className="h-5 w-5 text-matcha-700" />;
      case "Peripherals":
        if (device.image === "headphones") {
          return <Headphones className="h-5 w-5 text-matcha-700" />;
        }
        return <Monitor className="h-5 w-5 text-matcha-700" />;
      case "Tea & Pantry":
        return <Coffee className="h-5 w-5 text-tea-amber-600" />;
      default:
        return <Laptop className="h-5 w-5 text-matcha-700" />;
    }
  };

  // Determine loan duration state if loaned
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

  // Determine border and background styles based on status and selection
  const getCardStyle = () => {
    let base = "border rounded-xl p-4 transition-all duration-200 text-left cursor-pointer relative bg-white ";
    
    if (isSelected) {
      base += "ring-2 ring-matcha-600 border-matcha-300 shadow-sm ";
    } else {
      base += "border-warm-gray-200 hover:border-matcha-300 hover:shadow-xs hover:translate-y-[-1px] ";
    }

    if (loanInfo?.isOverdue) {
      base += isSelected ? "" : "border-rose-100 bg-rose-50/5 hover:border-rose-300";
    }

    return base;
  };

  return (
    <button
      id={`device-card-${device.id}`}
      onClick={onClick}
      className={getCardStyle()}
    >
      {/* Category Icon and Status Badge */}
      <div className="flex justify-between items-start gap-2 mb-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-matcha-50 rounded-lg">
            {getCategoryIcon()}
          </div>
          <span className="text-xs text-warm-gray-800 font-medium font-display uppercase tracking-wider">
            {device.category}
          </span>
        </div>

        {/* Status Badge */}
        <div>
          {device.status === "available" && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <ShieldCheck className="h-3.5 w-3.5" />
              Available
            </span>
          )}
          {device.status === "loaned" && !loanInfo?.isOverdue && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
              <User className="h-3.5 w-3.5" />
              Loaned
            </span>
          )}
          {device.status === "loaned" && loanInfo?.isOverdue && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-700 border border-rose-300 animate-pulse">
              <AlertCircle className="h-3.5 w-3.5" />
              Overdue
            </span>
          )}
          {device.status === "maintenance" && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-tea-amber-50 text-tea-amber-700 border border-tea-amber-200">
              <Wrench className="h-3.5 w-3.5" />
              Service
            </span>
          )}
          {device.status === "retired" && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-warm-gray-100 text-warm-gray-800 border border-warm-gray-200">
              <Ban className="h-3.5 w-3.5" />
              Retired
            </span>
          )}
        </div>
      </div>

      {/* Device Name and Model */}
      <h4 className="font-semibold text-warm-gray-900 line-clamp-1 group-hover:text-matcha-700 text-base">
        {device.name}
      </h4>
      <p className="text-xs text-warm-gray-800 line-clamp-1 font-mono mt-0.5">
        {device.model}
      </p>

      {/* Serial Number & Details */}
      <div className="mt-3 flex items-center justify-between text-xs text-warm-gray-800 border-t border-warm-gray-100/70 pt-2">
        <span className="font-mono bg-warm-gray-100 px-1.5 py-0.5 rounded text-[10px] text-warm-gray-800">
          S/N: {device.serialNumber}
        </span>
        <span className="text-warm-gray-800">
          Cond: <span className="font-semibold text-matcha-800">{device.condition}</span>
        </span>
      </div>

      {/* Borrower Info Summary (if active or overdue loan) */}
      {device.status === "loaned" && device.currentLoan && (
        <div className={`mt-3 p-2 rounded-lg text-xs flex flex-col gap-1 ${loanInfo?.isOverdue ? "bg-rose-50 text-rose-900 border border-rose-100" : "bg-matcha-50/50 text-matcha-900 border border-matcha-100/50"}`}>
          <div className="flex items-center justify-between font-medium">
            <span className="flex items-center gap-1 truncate max-w-[65%]">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-current"></span>
              {loanInfo?.userName}
            </span>
            <span className="text-[10px] uppercase font-bold tracking-wider opacity-80">
              {loanInfo?.userDepartment}
            </span>
          </div>
          <div className="flex justify-between items-center text-[10px] mt-0.5 opacity-90">
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              Due {formatFriendlyDate(device.currentLoan.expectedReturnDate)}
            </span>
            <span className={`font-semibold ${loanInfo?.isOverdue ? "text-rose-600 font-bold" : "text-matcha-700"}`}>
              {loanInfo?.text}
            </span>
          </div>
        </div>
      )}
    </button>
  );
}
