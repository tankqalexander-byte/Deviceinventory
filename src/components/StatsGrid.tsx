import React from "react";
import { Device } from "../types";
import { Laptop, Clock, AlertCircle, Wrench, CheckCircle } from "lucide-react";

interface StatsGridProps {
  devices: Device[];
}

export default function StatsGrid({ devices }: StatsGridProps) {
  const total = devices.length;
  const loaned = devices.filter((d) => d.status === "loaned").length;
  const available = devices.filter((d) => d.status === "available").length;
  const maintenance = devices.filter((d) => d.status === "maintenance").length;
  
  // Overdue represents devices currently marked as loaned where the currentLoan has an 'overdue' status
  const overdue = devices.filter(
    (d) => d.status === "loaned" && d.currentLoan?.status === "overdue"
  ).length;

  const availablePercent = total > 0 ? Math.round((available / total) * 100) : 0;
  const loanedPercent = total > 0 ? Math.round((loaned / total) * 100) : 0;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {/* Total Devices */}
      <div id="stat-total" className="bg-white border border-matcha-100 p-4 rounded-xl shadow-xs relative overflow-hidden transition-all hover:border-matcha-200">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-xs font-semibold text-warm-gray-800 uppercase tracking-wider">Total Inventory</p>
            <h3 className="text-3xl font-bold text-warm-gray-900 mt-1">{total}</h3>
          </div>
          <div className="p-2 bg-matcha-50 text-matcha-700 rounded-lg">
            <Laptop className="h-5 w-5" />
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <span className="text-xs text-matcha-600 bg-matcha-100 px-2 py-0.5 rounded-full font-medium">
            {available} available
          </span>
          <span className="text-xs text-warm-gray-800">
            {availablePercent}% ready
          </span>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-matcha-100">
          <div 
            className="h-full bg-matcha-500 transition-all duration-500" 
            style={{ width: `${availablePercent}%` }}
          />
        </div>
      </div>

      {/* Active Loans */}
      <div id="stat-active" className="bg-white border border-matcha-100 p-4 rounded-xl shadow-xs relative overflow-hidden transition-all hover:border-matcha-200">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-xs font-semibold text-warm-gray-800 uppercase tracking-wider">Checked Out</p>
            <h3 className="text-3xl font-bold text-warm-gray-900 mt-1">{loaned}</h3>
          </div>
          <div className="p-2 bg-emerald-50 text-emerald-700 rounded-lg">
            <CheckCircle className="h-5 w-5" />
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <span className="text-xs text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full font-medium">
            Active Loans
          </span>
          <span className="text-xs text-warm-gray-800">
            {loanedPercent}% deployment
          </span>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-emerald-100">
          <div 
            className="h-full bg-emerald-500 transition-all duration-500" 
            style={{ width: `${loanedPercent}%` }}
          />
        </div>
      </div>

      {/* Overdue Loans */}
      <div id="stat-overdue" className={`bg-white border p-4 rounded-xl shadow-xs relative overflow-hidden transition-all ${overdue > 0 ? "border-rose-200 bg-rose-50/10" : "border-matcha-100 hover:border-matcha-200"}`}>
        <div className="flex justify-between items-start">
          <div>
            <p className="text-xs font-semibold text-warm-gray-800 uppercase tracking-wider">Overdue Loans</p>
            <h3 className={`text-3xl font-bold mt-1 ${overdue > 0 ? "text-rose-600 animate-pulse" : "text-warm-gray-900"}`}>{overdue}</h3>
          </div>
          <div className={`p-2 rounded-lg ${overdue > 0 ? "bg-rose-100 text-rose-700" : "bg-warm-gray-100 text-warm-gray-800"}`}>
            <AlertCircle className="h-5 w-5" />
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2">
          {overdue > 0 ? (
            <span className="text-xs text-rose-700 bg-rose-100 px-2 py-0.5 rounded-full font-medium">
              Requires attention
            </span>
          ) : (
            <span className="text-xs text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full font-medium">
              All on track
            </span>
          )}
          <span className="text-xs text-warm-gray-800">
            Pending return
          </span>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-warm-gray-100">
          <div 
            className={`h-full transition-all duration-500 ${overdue > 0 ? "bg-rose-500" : "bg-warm-gray-300"}`} 
            style={{ width: total > 0 ? `${(overdue / total) * 100}%` : "0%" }}
          />
        </div>
      </div>

      {/* In Maintenance */}
      <div id="stat-maintenance" className="bg-white border border-matcha-100 p-4 rounded-xl shadow-xs relative overflow-hidden transition-all hover:border-matcha-200">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-xs font-semibold text-warm-gray-800 uppercase tracking-wider">In Maintenance</p>
            <h3 className="text-3xl font-bold text-warm-gray-900 mt-1">{maintenance}</h3>
          </div>
          <div className="p-2 bg-tea-amber-50 text-tea-amber-600 rounded-lg">
            <Wrench className="h-5 w-5" />
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <span className="text-xs text-tea-amber-700 bg-tea-amber-100 px-2 py-0.5 rounded-full font-medium">
            Service Bench
          </span>
          <span className="text-xs text-warm-gray-800">
            Testing & repairs
          </span>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-tea-amber-100">
          <div 
            className="h-full bg-tea-amber-500 transition-all duration-500" 
            style={{ width: total > 0 ? `${(maintenance / total) * 100}%` : "0%" }}
          />
        </div>
      </div>
    </div>
  );
}
