import React, { useState, useRef, useEffect } from "react";
import { DeviceCondition, Device } from "../types";
import { X, Sparkles, AlertCircle, Upload, FileSpreadsheet, Copy, Check, Table, HelpCircle, CheckCircle2 } from "lucide-react";

interface AddDeviceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddDevice: (deviceData: Omit<Device, "id" | "history">) => void;
  onAddDevices: (devicesData: Omit<Device, "id" | "history">[]) => void;
  categories: string[];
  existingDevices?: Device[];
}

const CSV_TEMPLATE = `name,model,serialNumber,category,condition,location,notes
MacBook Pro 16",M3 Max 32GB 1TB,TL-MAC16MAX,Laptops,Excellent,IT Storage Room A,Developer workstation
iPad Pro 11",M2 128GB Wi-Fi,TL-IPADPRO2,Tablets & Phones,Good,IT Storage Room A,Executive model
Kyocera Matcha Maker,Fully Automatic Whisk,TL-MATCHA01,Tea & Pantry,Excellent,Breakroom,Ceremonial grade whippers`;

export default function AddDeviceModal({ isOpen, onClose, onAddDevice, onAddDevices, categories, existingDevices = [] }: AddDeviceModalProps) {
  const [activeTab, setActiveTab] = useState<"single" | "csv">("single");
  
  // Single form states
  const [name, setName] = useState("");
  const [model, setModel] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [category, setCategory] = useState<string>("");
  const [condition, setCondition] = useState<DeviceCondition>("Excellent");
  const [location, setLocation] = useState("IT Storage Room A");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  // Set default category
  useEffect(() => {
    if (categories && categories.length > 0) {
      setCategory(categories[0]);
    }
  }, [categories, isOpen]);

  // Check for duplicate serial number in single form
  const cleanSerial = serialNumber.trim().toUpperCase();
  const duplicateDevice = cleanSerial 
    ? existingDevices.find(d => d.serialNumber.trim().toUpperCase() === cleanSerial) 
    : null;

  // CSV States
  const [csvInput, setCsvInput] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [parsedPreview, setParsedPreview] = useState<(Omit<Device, "id" | "history"> & { isDuplicate?: boolean; duplicateReason?: string })[]>([]);
  const [csvError, setCsvError] = useState("");
  const [copiedTemplate, setCopiedTemplate] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  // Single: Auto-generate a valid-looking unique serial number
  const handleAutoGenerateSerial = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let serial = "";
    let attempts = 0;
    do {
      serial = "TL-";
      for (let i = 0; i < 9; i++) {
        serial += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      attempts++;
    } while (existingDevices.some(d => d.serialNumber.trim().toUpperCase() === serial) && attempts < 100);

    setSerialNumber(serial);
    setError("");
  };

  const handleSingleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError("Please enter a device name.");
    if (!model.trim()) return setError("Please specify model specifications.");
    if (!serialNumber.trim()) return setError("Please provide or generate a serial number.");
    
    if (duplicateDevice) {
      return setError(`Serial number '${cleanSerial}' is already assigned to '${duplicateDevice.name}' (${duplicateDevice.category}).`);
    }

    onAddDevice({
      name: name.trim(),
      model: model.trim(),
      serialNumber: cleanSerial,
      category,
      status: "available",
      condition,
      purchaseDate: new Date().toISOString().split("T")[0],
      location: location.trim(),
      image: category === "Tea & Pantry" ? "coffee" : "laptop",
      notes: notes.trim()
    });

    // Reset Form
    setName("");
    setModel("");
    setSerialNumber("");
    setCategory(categories[0] || "");
    setCondition("Excellent");
    setLocation("IT Storage Room A");
    setNotes("");
    setError("");
    onClose();
  };

  // CSV Parsing Engine
  const parseCSVData = (text: string) => {
    try {
      setCsvError("");
      const lines = text.split(/\r?\n/).map(line => line.trim());
      if (lines.length < 2 || (lines.length === 2 && !lines[1])) {
        setParsedPreview([]);
        return;
      }

      // Existing serial numbers set
      const existingSerialsMap = new Map<string, string>();
      existingDevices.forEach(d => {
        existingSerialsMap.set(d.serialNumber.trim().toUpperCase(), d.name);
      });

      const batchSerialsSeen = new Set<string>();

      // Parse header row
      const headerRow = lines[0];
      const headers = headerRow.split(",").map(h => h.trim().replace(/^["']|["']$/g, ""));
      
      const devices: (Omit<Device, "id" | "history"> & { isDuplicate?: boolean; duplicateReason?: string })[] = [];

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;

        // Smart split taking nested commas or quotes into account minimally
        const values: string[] = [];
        let current = "";
        let inQuotes = false;
        
        for (let charIndex = 0; charIndex < line.length; charIndex++) {
          const char = line[charIndex];
          if (char === '"' || char === "'") {
            inQuotes = !inQuotes;
          } else if (char === ',' && !inQuotes) {
            values.push(current.trim().replace(/^["']|["']$/g, ""));
            current = "";
          } else {
            current += char;
          }
        }
        values.push(current.trim().replace(/^["']|["']$/g, ""));

        // Match headers to keys
        const record: Record<string, string> = {};
        headers.forEach((header, index) => {
          const val = values[index];
          if (val !== undefined) {
            record[header.toLowerCase()] = val;
          }
        });

        const dName = record.name || record.title || record.device || "";
        const dModel = record.model || record.specs || record.specifications || "";
        const dSerial = (record.serialnumber || record.serial || record.sn || "").trim().toUpperCase();
        const dCategoryRaw = record.category || (categories[0] || "Laptops");
        const dConditionRaw = record.condition || "Excellent";
        const dLocation = record.location || "IT Storage Room A";
        const dNotes = record.notes || "";

        if (!dName.trim()) {
          continue; // Skip invalid row without name
        }

        // Normalize Category dynamically
        let finalCat = categories[0] || "Laptops";
        const catLower = dCategoryRaw.toLowerCase();
        
        const matchedCat = categories.find(c => c.toLowerCase() === catLower);
        if (matchedCat) {
          finalCat = matchedCat;
        } else {
          // Dynamic partial matching
          const partialMatch = categories.find(c => {
            const cLower = c.toLowerCase();
            return cLower.includes(catLower) || catLower.includes(cLower);
          });
          if (partialMatch) {
            finalCat = partialMatch;
          }
        }

        // Normalize Condition
        let finalCond: DeviceCondition = "Excellent";
        const condLower = dConditionRaw.toLowerCase();
        if (condLower.includes("good")) finalCond = "Good";
        else if (condLower.includes("fair")) finalCond = "Fair";
        else if (condLower.includes("need") || condLower.includes("serv") || condLower.includes("repair")) {
          finalCond = "Needs Service";
        }

        const effectiveSerial = dSerial || `TL-CSV${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
        let isDuplicate = false;
        let duplicateReason = "";

        if (existingSerialsMap.has(effectiveSerial)) {
          isDuplicate = true;
          duplicateReason = `Already registered (${existingSerialsMap.get(effectiveSerial)})`;
        } else if (batchSerialsSeen.has(effectiveSerial)) {
          isDuplicate = true;
          duplicateReason = `Duplicate within CSV file`;
        } else {
          batchSerialsSeen.add(effectiveSerial);
        }

        devices.push({
          name: dName.trim(),
          model: dModel.trim() || "Imported specs",
          serialNumber: effectiveSerial,
          category: finalCat,
          status: "available",
          condition: finalCond,
          purchaseDate: new Date().toISOString().split("T")[0],
          location: dLocation.trim(),
          image: finalCat.toLowerCase().includes("tea") ? "coffee" : "laptop",
          notes: dNotes.trim(),
          isDuplicate,
          duplicateReason
        });
      }

      setParsedPreview(devices);
      const dupCount = devices.filter(d => d.isDuplicate).length;
      if (devices.length === 0) {
        setCsvError("No valid rows detected. Make sure the header 'name' is present.");
      } else if (dupCount > 0) {
        setCsvError(`Detected ${dupCount} row(s) with duplicate serial numbers. Duplicate items will be skipped during import.`);
      }
    } catch (err) {
      setCsvError("Unable to parse CSV. Check formatting and try again.");
      setParsedPreview([]);
    }
  };

  const handleCsvTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setCsvInput(val);
    parseCSVData(val);
  };

  // Drag & Drop File Handling
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleFile = (file: File) => {
    if (!file.name.endsWith(".csv") && file.type !== "text/csv") {
      setCsvError("Please select a valid CSV (.csv) file.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (text) {
        setCsvInput(text);
        parseCSVData(text);
      }
    };
    reader.onerror = () => {
      setCsvError("Failed to read the file.");
    };
    reader.readAsText(file);
  };

  const handleCopyTemplate = () => {
    navigator.clipboard.writeText(CSV_TEMPLATE);
    setCopiedTemplate(true);
    setTimeout(() => setCopiedTemplate(false), 2000);
  };

  const handleBulkSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (parsedPreview.length === 0) {
      setCsvError("No valid devices parsed. Please provide CSV entries with at least a device name.");
      return;
    }

    const uniqueDevicesToImport = parsedPreview.filter(d => !d.isDuplicate);
    if (uniqueDevicesToImport.length === 0) {
      setCsvError("All devices in the CSV have duplicate serial numbers that are already registered or duplicated in the file.");
      return;
    }

    onAddDevices(uniqueDevicesToImport);

    // Reset CSV form
    setCsvInput("");
    setParsedPreview([]);
    setCsvError("");
    onClose();
  };

  return (
    <div id="add-device-modal-overlay" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-warm-gray-900/60 backdrop-blur-xs">
      <div className="bg-white border border-matcha-200 rounded-2xl shadow-xl w-full max-w-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="bg-matcha-50/50 border-b border-matcha-100 px-6 py-4 flex justify-between items-center flex-shrink-0">
          <div>
            <h3 className="font-bold text-lg text-warm-gray-900 font-display">Add Devices to Inventory</h3>
            <p className="text-xs text-warm-gray-800">Register individual equipment or upload spreadsheet CSV lists.</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-warm-gray-100 rounded-full text-warm-gray-800 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="flex border-b border-matcha-100 bg-matcha-50/20 px-6 py-2 gap-4 flex-shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab("single")}
            className={`py-1.5 px-3 text-xs font-semibold rounded-md transition-all ${
              activeTab === "single"
                ? "bg-white text-matcha-900 shadow-xs border border-matcha-100"
                : "text-warm-gray-800 hover:text-warm-gray-900"
            }`}
          >
            Single Device Registration
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("csv")}
            className={`py-1.5 px-3 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5 ${
              activeTab === "csv"
                ? "bg-white text-matcha-900 shadow-xs border border-matcha-100"
                : "text-warm-gray-800 hover:text-warm-gray-900"
            }`}
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-matcha-500" />
            Bulk CSV Import
          </button>
        </div>

        {/* Scrollable Form Body Container */}
        <div className="overflow-y-auto flex-1 p-6">
          
          {activeTab === "single" ? (
            <form onSubmit={handleSingleSubmit} className="space-y-4">
              {error && (
                <div className="bg-rose-50 text-rose-800 p-2.5 rounded-lg text-xs flex items-center gap-1.5 border border-rose-100 animate-in fade-in">
                  <AlertCircle className="h-4 w-4 text-rose-600 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                {/* Name */}
                <div className="col-span-2 space-y-1">
                  <label className="text-xs font-semibold text-warm-gray-800 block">Device Name / Model Line</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => { setName(e.target.value); setError(""); }}
                    placeholder='e.g., MacBook Air 13" M3'
                    className="w-full text-xs p-2.5 rounded-lg border border-warm-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-matcha-500 text-warm-gray-900"
                    required
                  />
                </div>

                {/* Spec Details */}
                <div className="col-span-2 space-y-1">
                  <label className="text-xs font-semibold text-warm-gray-800 block">Detailed Specifications</label>
                  <input
                    type="text"
                    value={model}
                    onChange={(e) => { setModel(e.target.value); setError(""); }}
                    placeholder="e.g., 16GB Unified Memory, 512GB SSD, Midnight Black"
                    className="w-full text-xs p-2.5 rounded-lg border border-warm-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-matcha-500 text-warm-gray-900"
                    required
                  />
                </div>

                {/* Category */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-warm-gray-800 block">Inventory Category</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-lg border border-warm-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-matcha-500 text-warm-gray-900"
                  >
                    {categories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Serial Number */}
                <div className="space-y-1 relative">
                  <label className="text-xs font-semibold text-warm-gray-800 block flex justify-between">
                    <span>Serial Number</span>
                    <button
                      type="button"
                      onClick={handleAutoGenerateSerial}
                      className="text-[10px] text-matcha-500 hover:text-matcha-700 hover:underline flex items-center gap-0.5"
                    >
                      <Sparkles className="h-3 w-3" />
                      Generate
                    </button>
                  </label>
                  <input
                    type="text"
                    value={serialNumber}
                    onChange={(e) => { setSerialNumber(e.target.value); setError(""); }}
                    placeholder="e.g., C02G69AA0X"
                    className={`w-full text-xs p-2.5 rounded-lg border uppercase focus:outline-none focus:ring-2 text-warm-gray-900 font-mono ${
                      duplicateDevice 
                        ? 'border-rose-400 bg-rose-50/30 focus:ring-rose-500' 
                        : 'border-warm-gray-200 bg-white focus:ring-matcha-500'
                    }`}
                    required
                  />
                  {duplicateDevice && (
                    <p className="text-[11px] text-rose-600 mt-1 font-medium flex items-center gap-1 animate-in fade-in">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                      <span>Duplicate: Already assigned to &quot;{duplicateDevice.name}&quot; ({duplicateDevice.category}).</span>
                    </p>
                  )}
                </div>

                {/* Initial Condition */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-warm-gray-800 block">Initial Condition</label>
                  <select
                    value={condition}
                    onChange={(e) => setCondition(e.target.value as DeviceCondition)}
                    className="w-full text-xs p-2.5 rounded-lg border border-warm-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-matcha-500 text-warm-gray-900"
                  >
                    <option value="Excellent">Excellent</option>
                    <option value="Good">Good</option>
                    <option value="Fair">Fair</option>
                    <option value="Needs Service">Needs Service</option>
                  </select>
                </div>

                {/* Location */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-warm-gray-800 block">Default Storage Location</label>
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="e.g., Cabinet A, Breakroom"
                    className="w-full text-xs p-2.5 rounded-lg border border-warm-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-matcha-500 text-warm-gray-900"
                    required
                  />
                </div>

                {/* Hardware Notes */}
                <div className="col-span-2 space-y-1">
                  <label className="text-xs font-semibold text-warm-gray-800 block">Hardware / Care Notes (Optional)</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Enter specialized warnings or hardware details (e.g., use only clean distilled water)..."
                    rows={2}
                    className="w-full text-xs p-2.5 rounded-lg border border-warm-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-matcha-500 text-warm-gray-900"
                  />
                </div>
              </div>

              {/* Action buttons */}
              <div className="pt-4 border-t border-warm-gray-100 flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-semibold border border-warm-gray-200 rounded-lg hover:bg-warm-gray-50 text-warm-gray-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-semibold bg-matcha-500 hover:bg-matcha-600 text-white rounded-lg transition-colors shadow-xs"
                >
                  Add Device to Catalog
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleBulkSubmit} className="space-y-5">
              
              {/* CSV Instructions & Helper */}
              <div className="bg-matcha-50/30 border border-matcha-100 rounded-xl p-3.5 space-y-3">
                <div className="flex justify-between items-start gap-3">
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-matcha-900 flex items-center gap-1">
                      <HelpCircle className="h-4 w-4 text-matcha-500" />
                      CSV Columns Guide
                    </p>
                    <p className="text-[11px] text-warm-gray-800 leading-relaxed">
                      Your spreadsheet should include columns: <code className="bg-white px-1 py-0.5 rounded border border-matcha-100 text-matcha-700 font-mono text-[10px]">name,model,serialNumber,category,condition,location,notes</code>. Missing fields default automatically.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyTemplate}
                    className="flex-shrink-0 flex items-center gap-1 text-[10px] font-semibold bg-white border border-matcha-100 text-matcha-800 px-2 py-1 rounded hover:bg-matcha-50 transition-colors"
                  >
                    {copiedTemplate ? (
                      <>
                        <Check className="h-3 w-3 text-emerald-600" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3" />
                        Copy Template
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Drag and Drop File Zone */}
              <div
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-2 ${
                  dragActive
                    ? "border-matcha-500 bg-matcha-50/40 scale-[0.98]"
                    : "border-warm-gray-200 hover:border-matcha-300 hover:bg-warm-gray-50/50"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileInput}
                  className="hidden"
                />
                <div className="w-10 h-10 rounded-full bg-matcha-50 flex items-center justify-center text-matcha-500">
                  <Upload className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-bold text-warm-gray-900">Drag and drop your device spreadsheet here</p>
                  <p className="text-[10px] text-warm-gray-800 mt-0.5">or click to browse local files (.csv)</p>
                </div>
              </div>

              {/* Live Paste Text Area */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-warm-gray-800 block">Or Paste CSV Plaintext</label>
                <textarea
                  value={csvInput}
                  onChange={handleCsvTextChange}
                  placeholder={`name,model,serialNumber,category,condition,location,notes\nMacBook Pro 14",M3 16GB,TL-CSV001,Laptops,Excellent,IT storage A,\nMatcha Bowl,Handmade ceramic,TL-BOWL01,Tea & Pantry,Excellent,Pantry Shelf,Fragile`}
                  rows={4}
                  className="w-full text-xs p-2.5 rounded-lg border border-warm-gray-200 bg-white font-mono focus:outline-none focus:ring-2 focus:ring-matcha-500 text-warm-gray-900"
                />
              </div>

              {csvError && (
                <div className="bg-rose-50 text-rose-800 p-2.5 rounded-lg text-xs flex items-center gap-1.5 border border-rose-100 animate-in fade-in">
                  <AlertCircle className="h-4 w-4 text-rose-600 flex-shrink-0" />
                  <span>{csvError}</span>
                </div>
              )}

              {/* Dynamic Preview List */}
              {parsedPreview.length > 0 && (
                <div className="space-y-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div className="flex justify-between items-center text-xs font-bold text-warm-gray-900">
                    <span className="flex items-center gap-1">
                      <Table className="h-4 w-4 text-matcha-500" />
                      Previewing {parsedPreview.length} Devices ({parsedPreview.filter(d => !d.isDuplicate).length} unique)
                    </span>
                    {parsedPreview.some(d => d.isDuplicate) && (
                      <span className="text-[10px] text-rose-600 font-semibold bg-rose-50 px-2 py-0.5 rounded border border-rose-100">
                        Skipping {parsedPreview.filter(d => d.isDuplicate).length} Duplicate(s)
                      </span>
                    )}
                  </div>
                  <div className="border border-warm-gray-100 rounded-xl overflow-hidden max-h-48 overflow-y-auto bg-warm-gray-50/50">
                    <table className="min-w-full text-[11px] text-left border-collapse">
                      <thead className="bg-warm-gray-100 text-warm-gray-800 font-semibold sticky top-0">
                        <tr>
                          <th className="px-3 py-2 border-b border-warm-gray-200">Device</th>
                          <th className="px-3 py-2 border-b border-warm-gray-200">Category</th>
                          <th className="px-3 py-2 border-b border-warm-gray-200">Serial</th>
                          <th className="px-3 py-2 border-b border-warm-gray-200">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-warm-gray-100 bg-white">
                        {parsedPreview.map((item, idx) => (
                          <tr key={idx} className={`hover:bg-warm-gray-50/50 text-warm-gray-900 ${item.isDuplicate ? 'bg-rose-50/30' : ''}`}>
                            <td className="px-3 py-1.5 font-medium">
                              <div>{item.name}</div>
                              <div className="text-[10px] text-warm-gray-800">{item.model}</div>
                            </td>
                            <td className="px-3 py-1.5 text-warm-gray-800">{item.category}</td>
                            <td className="px-3 py-1.5 font-mono text-warm-gray-800">{item.serialNumber}</td>
                            <td className="px-3 py-1.5 text-warm-gray-800">
                              {item.isDuplicate ? (
                                <span className="inline-flex items-center gap-1 text-[10px] text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded font-semibold" title={item.duplicateReason}>
                                  <AlertCircle className="h-3 w-3 shrink-0" />
                                  Duplicate
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[10px] text-matcha-700 bg-matcha-100 px-1.5 py-0.5 rounded font-semibold">
                                  <Check className="h-3 w-3 shrink-0" />
                                  Ready
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Footer Actions */}
              <div className="pt-4 border-t border-warm-gray-100 flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setCsvInput("");
                    setParsedPreview([]);
                    setCsvError("");
                    onClose();
                  }}
                  className="px-4 py-2 text-xs font-semibold border border-warm-gray-200 rounded-lg hover:bg-warm-gray-50 text-warm-gray-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={parsedPreview.filter(d => !d.isDuplicate).length === 0}
                  className={`px-5 py-2 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 shadow-xs ${
                    parsedPreview.filter(d => !d.isDuplicate).length > 0
                      ? "bg-matcha-500 hover:bg-matcha-600 text-white cursor-pointer"
                      : "bg-warm-gray-100 text-warm-gray-400 cursor-not-allowed"
                  }`}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Import {parsedPreview.filter(d => !d.isDuplicate).length} Assets
                </button>
              </div>
            </form>
          )}

        </div>
      </div>
    </div>
  );
}
