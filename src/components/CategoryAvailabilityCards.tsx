import React from "react";
import { Device } from "../types";
import { Laptop, Tablet, Smartphone, Monitor, Keyboard, Headphones, Coffee, Package } from "lucide-react";

interface CategoryAvailabilityCardsProps {
  devices: Device[];
  categories: string[];
  selectedCategory: string;
  selectedStatus: string;
  onSelectCategory: (category: string) => void;
}

function getCategoryIcon(name: string) {
  const n = name.toLowerCase();
  const has = (...keys: string[]) => keys.some((k) => n.includes(k));
  if (has("laptop", "macbook", "notebook")) return Laptop;
  if (has("ipad", "tablet")) return Tablet;
  if (has("phone", "mobile")) return Smartphone;
  if (has("computer", "pc", "desktop", "monitor", "display")) return Monitor;
  if (has("peripheral", "keyboard", "mouse", "accessor")) return Keyboard;
  if (has("headphone", "audio")) return Headphones;
  if (has("tea", "pantry", "coffee")) return Coffee;
  return Package;
}

export default function CategoryAvailabilityCards({
  devices,
  categories,
  selectedCategory,
  selectedStatus,
  onSelectCategory,
}: CategoryAvailabilityCardsProps) {
  const used = new Set(devices.map((d) => d.category));
  const extras = Array.from(used)
    .filter((c) => !categories.includes(c))
    .sort((a, b) => a.localeCompare(b));
  const names = [...categories, ...extras].filter((c, i, arr) => arr.indexOf(c) === i);

  if (names.length === 0) return null;

  const cards = names.map((name) => {
    const inCat = devices.filter((d) => d.category === name);
    const count = (s: Device["status"]) => inCat.filter((d) => d.status === s).length;
    const available = count("available");
    const inService = inCat.length - count("retired");
    return {
      name,
      available,
      inService,
      loaned: count("loaned"),
      maintenance: count("maintenance"),
      percent: inService > 0 ? Math.round((available / inService) * 100) : 0,
    };
  });

  // Skip categories with no devices that aren't configured (extras always have devices).
  return (
    <section aria-labelledby="available-now-heading" className="w-full">
      <div className="mb-3">
        <h2 id="available-now-heading" className="text-sm font-bold text-warm-gray-900">
          Available now
        </h2>
        <p className="text-xs text-warm-gray-800">Tap a category to see its available devices</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {cards.map((c) => {
          const Icon = getCategoryIcon(c.name);
          const active = selectedCategory === c.name && selectedStatus === "available";
          const none = c.available === 0;
          return (
            <button
              key={c.name}
              type="button"
              aria-pressed={active}
              onClick={() => onSelectCategory(c.name)}
              className={`text-left bg-white border p-4 rounded-xl shadow-xs transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-matcha-500 focus-visible:ring-offset-2 ${
                active
                  ? "border-matcha-600 ring-2 ring-matcha-500"
                  : none
                    ? "border-tea-amber-200 hover:border-tea-amber-500"
                    : "border-matcha-100 hover:border-matcha-300"
              }`}
            >
              <div className="flex justify-between items-start gap-2">
                <p className="text-xs font-semibold text-warm-gray-800 uppercase tracking-wider break-words min-w-0">
                  {c.name}
                </p>
                <div
                  className={`p-2 rounded-lg shrink-0 ${
                    none ? "bg-tea-amber-50 text-tea-amber-700" : "bg-matcha-50 text-matcha-700"
                  }`}
                >
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </div>
              </div>
              <div className="mt-1 flex items-baseline gap-2 flex-wrap">
                <span className={`text-3xl font-bold ${none ? "text-tea-amber-700" : "text-matcha-700"}`}>
                  {c.available}
                </span>
                {none && (
                  <span className="text-[10px] font-semibold text-tea-amber-700 bg-tea-amber-100 px-2 py-0.5 rounded-full">
                    None available
                  </span>
                )}
              </div>
              <p className="text-xs text-warm-gray-800">of {c.inService} in service</p>
              <p className="mt-2 text-[11px] text-warm-gray-800">
                {c.loaned} on loan
                {c.maintenance > 0 && <span> · {c.maintenance} in maintenance</span>}
              </p>
              <div
                className="mt-3 h-1.5 w-full rounded-full bg-warm-gray-100 overflow-hidden"
                role="progressbar"
                aria-label={`${c.name} availability`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={c.percent}
              >
                <div
                  className={`h-full rounded-full ${none ? "bg-tea-amber-500" : "bg-matcha-600"}`}
                  style={{ width: `${c.percent}%` }}
                />
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
