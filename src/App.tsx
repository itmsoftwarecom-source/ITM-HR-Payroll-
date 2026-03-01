import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  LayoutDashboard, 
  FileText, 
  PlusCircle, 
  Camera, 
  Trash2, 
  Edit3, 
  Save, 
  X, 
  ChevronRight,
  TrendingUp,
  Users,
  Wallet,
  Loader2,
  Search,
  Download,
  Briefcase,
  UserCheck,
  AlertCircle,
  Clock,
  LogIn,
  LogOut,
  QrCode,
  Maximize
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { QRCodeCanvas } from 'qrcode.react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { PayrollRecord, DashboardStats, Labourer, Budget, Attendance, LabourerHistory } from './types';
import { SignaturePad } from './components/SignaturePad';
import { extractPayrollFromImage } from './services/geminiService';

const QRScanner: React.FC<{ onScan: (id: string) => void; onClose: () => void }> = ({ onScan, onClose }) => {
  useEffect(() => {
    const scanner = new Html5QrcodeScanner("reader", { fps: 10, qrbox: 250 }, false);
    scanner.render((decodedText) => {
      onScan(decodedText);
      scanner.clear();
    }, (error) => {
      // console.warn(error);
    });
    return () => {
      scanner.clear().catch(e => console.error("Failed to clear scanner", e));
    };
  }, [onScan]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-white w-full max-w-md rounded-[2.5rem] overflow-hidden shadow-2xl">
        <div className="p-6 border-b border-zinc-100 flex justify-between items-center">
          <h3 className="font-black text-xl">QR စကင်ဖတ်ရန်</h3>
          <button onClick={onClose} className="p-2 hover:bg-zinc-100 rounded-full transition-all">
            <X size={24} />
          </button>
        </div>
        <div id="reader" className="p-4"></div>
        <div className="p-6 bg-zinc-50 text-center">
          <p className="text-zinc-500 text-sm font-bold">QR ကုဒ်ကို ကင်မရာရှေ့တွင် ထားပေးပါ</p>
        </div>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'records' | 'add' | 'labour' | 'budget' | 'attendance' | 'reports'>('dashboard');
  const [records, setRecords] = useState<PayrollRecord[]>([]);
  const [labourers, setLabourers] = useState<Labourer[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingRecord, setEditingRecord] = useState<PayrollRecord | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  
  // Selection for bulk delete
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showQRModal, setShowQRModal] = useState<Labourer | null>(null);
  const [showScanner, setShowScanner] = useState(false);

  const fetchData = async () => {
    try {
      const endpoints = [
        '/api/records',
        '/api/labourers',
        '/api/budgets',
        '/api/stats',
        '/api/attendance/today'
      ];

      const responses = await Promise.all(endpoints.map(url => fetch(url)));
      
      for (const res of responses) {
        if (!res.ok) {
          const text = await res.text();
          console.error(`API error for ${res.url}: ${res.status} ${text}`);
          return;
        }
        const contentType = res.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
          console.error(`Expected JSON for ${res.url}, got ${contentType}`);
          return;
        }
      }

      const [recData, labData, budData, statData, attData] = await Promise.all(responses.map(res => res.json()));
      
      setRecords(recData);
      setLabourers(labData);
      setBudgets(budData);
      setStats(statData);
      setAttendance(attData);
    } catch (error) {
      console.error("Failed to fetch data", error);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSaveRecord = async (record: PayrollRecord) => {
    setLoading(true);
    const isEdit = !!record.id;
    const url = isEdit ? `/api/records/${record.id}` : '/api/records';
    const method = isEdit ? 'PUT' : 'POST';
    
    await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record),
    });
    
    await fetchData();
    setLoading(false);
    setEditingRecord(null);
    setActiveTab('records');
  };

  const handleDeleteRecord = async (id: string) => {
    if (!window.confirm('ဤမှတ်တမ်းကို ဖျက်ရန် သေချာပါသလား?')) return;
    await fetch(`/api/records/${id}`, { method: 'DELETE' });
    await fetchData();
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`ရွေးချယ်ထားသော မှတ်တမ်း (${selectedIds.length}) ခုကို ဖျက်ရန် သေချာပါသလား?`)) return;
    
    setLoading(true);
    try {
      await fetch('/api/records/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds }),
      });
      
      setSelectedIds([]);
      await fetchData();
    } catch (error) {
      console.error("Bulk delete failed", error);
      alert("ဖျက်ရန် အဆင်မပြေပါ။ နောက်မှ ပြန်ကြိုးစားပါ။");
    } finally {
      setLoading(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsScanning(true);
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = reader.result as string;
      const extracted = await extractPayrollFromImage(base64);
      
      for (const record of extracted) {
        await fetch('/api/records', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...record, id: Date.now().toString() + Math.random() }),
        });
      }
      
      await fetchData();
      setIsScanning(false);
      setActiveTab('records');
    };
    reader.readAsDataURL(file);
  };

  const exportToExcel = async () => {
    setIsExporting(true);
    try {
      // Prepare budget summary data
      const data = budgets.map(b => {
        const status = budgetStatus[b.activity] || { spent: 0, budget: b.total_budget };
        return {
          'Project Name': b.activity,
          'Total Budget': `${b.total_budget.toLocaleString()} MMK`,
          'Total Spent': `${status.spent.toLocaleString()} MMK`,
          'Remaining Balance': `${(b.total_budget - status.spent).toLocaleString()} MMK`
        };
      });

      const worksheet = XLSX.utils.json_to_sheet(data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Budget Summary");
      
      // Auto-size columns
      const maxWidths = data.reduce((acc, row) => {
        Object.keys(row).forEach((key, i) => {
          const val = row[key as keyof typeof row].toString();
          acc[i] = Math.max(acc[i] || 0, val.length, key.length);
        });
        return acc;
      }, [] as number[]);
      worksheet['!cols'] = maxWidths.map(w => ({ w: w + 2 }));

      XLSX.writeFile(workbook, `ITM_Budget_Summary_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (error) {
      console.error("Excel export failed", error);
      alert("Excel ထုတ်ယူရန် အဆင်မပြေပါ။");
    } finally {
      setIsExporting(false);
    }
  };

  const filteredRecords = records.filter(r => 
    r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.activity.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredRecords.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredRecords.map(r => r.id));
    }
  };

  // Budget Calculations
  const budgetStatus = useMemo(() => {
    const status: Record<string, { spent: number; budget: number }> = {};
    budgets.forEach(b => {
      status[b.activity] = { spent: 0, budget: b.total_budget };
    });
    records.forEach(r => {
      if (status[r.activity]) {
        status[r.activity].spent += r.net_pay;
      }
    });
    return status;
  }, [budgets, records]);

  return (
    <div className="min-h-screen bg-[#F5F5F4] text-zinc-900 font-sans">
      {/* Sidebar Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-zinc-200 px-4 py-2 flex justify-around items-center z-50 md:top-0 md:bottom-auto md:flex-col md:w-64 md:h-full md:border-t-0 md:border-r md:justify-start md:pt-12 md:gap-2">
        <div className="hidden md:block mb-8 px-6">
          <h1 className="text-2xl font-black tracking-tighter text-emerald-600">ITM-HR</h1>
          <p className="text-[10px] text-zinc-400 uppercase tracking-widest font-bold">Business Payroll</p>
        </div>
        
        <NavItem active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} icon={<LayoutDashboard size={20} />} label="ပင်မစာမျက်နှာ" />
        <NavItem active={activeTab === 'records'} onClick={() => setActiveTab('records')} icon={<FileText size={20} />} label="မှတ်တမ်းများ" />
        <NavItem active={activeTab === 'attendance'} onClick={() => setActiveTab('attendance')} icon={<Clock size={20} />} label="တက်ရောက်မှု" />
        <NavItem active={activeTab === 'add'} onClick={() => { setEditingRecord(null); setActiveTab('add'); }} icon={<PlusCircle size={20} />} label="အသစ်ထည့်ရန်" />
        <NavItem active={activeTab === 'labour'} onClick={() => setActiveTab('labour')} icon={<Users size={20} />} label="ဝန်ထမ်းစာရင်း" />
        <NavItem active={activeTab === 'budget'} onClick={() => setActiveTab('budget')} icon={<Briefcase size={20} />} label="ဘတ်ဂျက်" />
        <NavItem active={activeTab === 'reports'} onClick={() => setActiveTab('reports')} icon={<TrendingUp size={20} />} label="အစီရင်ခံစာ" />
        
        <div className="md:mt-auto md:w-full md:px-4 md:pb-8">
          <label className="flex items-center justify-center gap-3 px-4 py-3 rounded-2xl cursor-pointer bg-emerald-600 text-white hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200">
            <Camera size={20} />
            <span className="text-sm font-bold md:block hidden">ပုံစကင်ဖတ်ရန်</span>
            <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
          </label>
        </div>
      </nav>

      {/* Main Content */}
      <main className="pb-24 pt-6 px-4 md:pl-72 md:pr-8 md:pt-12 max-w-7xl mx-auto">
        <AnimatePresence mode="wait">
          {isScanning && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100] flex items-center justify-center">
              <div className="bg-white p-10 rounded-[2.5rem] shadow-2xl flex flex-col items-center gap-6 max-w-sm w-full mx-4">
                <div className="relative">
                  <div className="absolute inset-0 bg-emerald-400 blur-2xl opacity-20 animate-pulse"></div>
                  <Loader2 className="animate-spin text-emerald-600 relative" size={64} />
                </div>
                <div className="text-center space-y-2">
                  <h3 className="font-black text-2xl tracking-tight">AI စကင်ဖတ်နေသည်...</h3>
                  <p className="text-sm text-zinc-500 leading-relaxed">ပုံမှ အချက်အလက်များကို အလိုအလျောက် ထုတ်ယူနေပါသည်။ ခေတ္တစောင့်ဆိုင်းပေးပါ။</p>
                </div>
              </div>
            </motion.div>
          )}

          {isExporting && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100] flex items-center justify-center">
              <div className="bg-white p-10 rounded-[2.5rem] shadow-2xl flex flex-col items-center gap-6 max-w-sm w-full mx-4">
                <div className="relative">
                  <div className="absolute inset-0 bg-emerald-400 blur-2xl opacity-20 animate-pulse"></div>
                  <Loader2 className="animate-spin text-emerald-600 relative" size={64} />
                </div>
                <div className="text-center space-y-2">
                  <h3 className="font-black text-2xl tracking-tight">ဖိုင်ထုတ်ယူနေပါသည်...</h3>
                  <p className="text-sm text-zinc-500 leading-relaxed">ခေတ္တစောင့်ဆိုင်းပေးပါ။</p>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'dashboard' && (
            <motion.div key="dashboard" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="space-y-10">
              <header className="flex justify-between items-end">
                <div>
                  <h2 className="text-4xl font-black tracking-tight">Dashboard</h2>
                  <p className="text-zinc-500 font-medium">လုပ်ငန်းအနှစ်ချုပ်နှင့် ဘတ်ဂျက်အခြေအနေ</p>
                </div>
                <button onClick={exportToExcel} className="flex items-center gap-2 px-6 py-3 bg-white border border-zinc-200 rounded-2xl text-sm font-bold hover:bg-zinc-50 transition-all shadow-sm">
                  <Download size={18} />
                  Excel ထုတ်ယူရန်
                </button>
              </header>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard label="မှတ်တမ်းစုစုပေါင်း" value={stats?.total_records || 0} icon={<Users className="text-blue-600" />} color="bg-blue-50" />
                <StatCard label="စုစုပေါင်းကျသင့်ငွေ" value={`${(stats?.total_amount || 0).toLocaleString()} MMK`} icon={<Wallet className="text-emerald-600" />} color="bg-emerald-50" />
                <StatCard label="စုစုပေါင်းကြိုတင်ငွေ" value={`${(stats?.total_advance || 0).toLocaleString()} MMK`} icon={<TrendingUp className="text-orange-600" />} color="bg-orange-50" />
                <StatCard label="အသားတင်ပေးရန်" value={`${(stats?.total_balance || 0).toLocaleString()} MMK`} icon={<ChevronRight className="text-purple-600" />} color="bg-purple-50" />
                <StatCard label="ယနေ့ အလုပ်ဆင်းသူ" value={stats?.present_count || 0} icon={<UserCheck className="text-emerald-600" />} color="bg-emerald-50" />
                <StatCard label="ခွင့်တိုင်/ပျက်ကွက်" value={stats?.absent_count || 0} icon={<AlertCircle className="text-red-600" />} color="bg-red-50" />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <section className="bg-white rounded-[2rem] p-8 shadow-sm border border-zinc-200">
                  <h3 className="font-black text-xl mb-6 flex items-center gap-2">
                    <Briefcase className="text-emerald-600" />
                    ဘတ်ဂျက်အခြေအနေ (Budget Status)
                  </h3>
                  <div className="space-y-6">
                    {budgets.map(b => {
                      const status = budgetStatus[b.activity] || { spent: 0, budget: b.total_budget };
                      const remaining = status.budget - status.spent;
                      const percent = Math.min((status.spent / status.budget) * 100, 100);
                      const isOver = status.spent > status.budget;
                      return (
                        <div key={b.id} className="space-y-3 p-4 rounded-2xl bg-zinc-50 border border-zinc-100">
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="font-black text-zinc-900">{b.activity}</p>
                              <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest mt-1">Activity</p>
                            </div>
                            <div className="text-right">
                              <p className={`font-black ${isOver ? 'text-red-600' : 'text-emerald-600'}`}>
                                {remaining.toLocaleString()} MMK
                              </p>
                              <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest mt-1">လက်ကျန် (Balance)</p>
                            </div>
                          </div>
                          
                          <div className="h-3 bg-zinc-200 rounded-full overflow-hidden">
                            <motion.div 
                              initial={{ width: 0 }} 
                              animate={{ width: `${percent}%` }} 
                              className={`h-full ${isOver ? 'bg-red-500' : 'bg-emerald-500'}`}
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-4 pt-2 border-t border-zinc-100">
                            <div>
                              <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">စုစုပေါင်း ဘတ်ဂျက်</p>
                              <p className="text-sm font-black">{status.budget.toLocaleString()} MMK</p>
                            </div>
                            <div className="text-right">
                              <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">သုံးစွဲပြီး</p>
                              <p className={`text-sm font-black ${isOver ? 'text-red-600' : 'text-zinc-900'}`}>{status.spent.toLocaleString()} MMK</p>
                            </div>
                          </div>

                          {isOver && (
                            <p className="text-[10px] text-red-500 font-bold flex items-center gap-1">
                              <AlertCircle size={10} /> ဘတ်ဂျက်ကျော်လွန်နေပါသည်
                            </p>
                          )}
                        </div>
                      );
                    })}
                    {budgets.length === 0 && <p className="text-center text-zinc-400 py-4">ဘတ်ဂျက်သတ်မှတ်ထားခြင်းမရှိသေးပါ</p>}
                  </div>
                </section>

                <section className="bg-white rounded-[2rem] p-8 shadow-sm border border-zinc-200">
                  <h3 className="font-black text-xl mb-6">လတ်တလော မှတ်တမ်းများ</h3>
                  <div className="space-y-4">
                    {records.slice(0, 5).map(record => (
                      <div key={record.id} className="flex items-center justify-between p-5 rounded-2xl bg-zinc-50 border border-zinc-100 group hover:border-emerald-200 transition-all">
                        <div>
                          <p className="font-bold text-zinc-900">{record.name}</p>
                          <p className="text-xs text-zinc-500 font-medium">{record.activity} • {record.duration}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-black text-emerald-600">{record.balance.toLocaleString()} MMK</p>
                          <p className="text-[10px] text-zinc-400 uppercase tracking-widest font-bold">Net Pay</p>
                        </div>
                      </div>
                    ))}
                    {records.length === 0 && <p className="text-center text-zinc-400 py-4">မှတ်တမ်းမရှိသေးပါ</p>}
                  </div>
                </section>
              </div>
            </motion.div>
          )}

          {activeTab === 'records' && (
            <motion.div key="records" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="space-y-8">
              <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-6">
                <div>
                  <h2 className="text-4xl font-black tracking-tight">မှတ်တမ်းအားလုံး</h2>
                  <p className="text-zinc-500 font-medium">မှတ်တမ်းများကို ရှာဖွေခြင်းနှင့် စီမံခန့်ခွဲခြင်း</p>
                </div>
                <div className="flex items-center gap-4">
                  {selectedIds.length > 0 && (
                    <button 
                      onClick={handleBulkDelete}
                      className="flex items-center gap-2 px-6 py-3 bg-red-600 text-white rounded-2xl text-sm font-bold hover:bg-red-700 transition-all shadow-lg shadow-red-100"
                    >
                      <Trash2 size={18} />
                      ရွေးထားသည် ({selectedIds.length}) ခုဖျက်ရန်
                    </button>
                  )}
                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
                    <input 
                      type="text" 
                      placeholder="အမည် သို့မဟုတ် လုပ်ငန်းဖြင့် ရှာဖွေရန်..."
                      className="pl-12 pr-6 py-3 bg-white border border-zinc-200 rounded-2xl text-sm w-full sm:w-80 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all shadow-sm"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                </div>
              </header>

              <div className="bg-white rounded-[2rem] shadow-sm border border-zinc-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-zinc-50/50 border-b border-zinc-100">
                        <th className="px-6 py-5">
                          <input 
                            type="checkbox" 
                            className="w-5 h-5 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
                            checked={selectedIds.length === filteredRecords.length && filteredRecords.length > 0}
                            onChange={toggleSelectAll}
                          />
                        </th>
                        <th className="px-6 py-5 text-[10px] font-black text-zinc-400 uppercase tracking-widest">စဉ်</th>
                        <th className="px-6 py-5 text-[10px] font-black text-zinc-400 uppercase tracking-widest">အမည်</th>
                        <th className="px-6 py-5 text-[10px] font-black text-zinc-400 uppercase tracking-widest">လုပ်ငန်း</th>
                        <th className="px-6 py-5 text-[10px] font-black text-zinc-400 uppercase tracking-widest">ပေါင်း</th>
                        <th className="px-6 py-5 text-[10px] font-black text-zinc-400 uppercase tracking-widest">အသားတင်</th>
                        <th className="px-6 py-5 text-[10px] font-black text-zinc-400 uppercase tracking-widest text-right">လုပ်ဆောင်ချက်</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-50">
                      {filteredRecords.map(record => (
                        <tr key={record.id} className={`hover:bg-zinc-50/50 transition-colors group ${selectedIds.includes(record.id) ? 'bg-emerald-50/30' : ''}`}>
                          <td className="px-6 py-5">
                            <input 
                              type="checkbox" 
                              className="w-5 h-5 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
                              checked={selectedIds.includes(record.id)}
                              onChange={() => toggleSelect(record.id)}
                            />
                          </td>
                          <td className="px-6 py-5 text-sm font-bold text-zinc-400">{record.serial_no}</td>
                          <td className="px-6 py-5">
                            <div className="flex items-center gap-3">
                              {record.signature && (
                                <img src={record.signature} alt="Sig" className="w-10 h-10 object-contain bg-zinc-100 rounded-lg p-1" />
                              )}
                              <div>
                                <p className="text-sm font-black text-zinc-900">{record.name}</p>
                                <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-tighter">{record.duration}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-5 text-sm font-bold text-zinc-600">{record.activity}</td>
                          <td className="px-6 py-5 text-sm font-bold">{record.total.toLocaleString()} MMK</td>
                          <td className="px-6 py-5 text-sm font-black text-emerald-600">{record.balance.toLocaleString()} MMK</td>
                          <td className="px-6 py-5 text-right">
                            <div className="flex justify-end gap-2">
                              <button onClick={() => { setEditingRecord(record); setActiveTab('add'); }} className="p-2.5 text-blue-600 hover:bg-blue-50 rounded-xl transition-all">
                                <Edit3 size={18} />
                              </button>
                              <button onClick={() => handleDeleteRecord(record.id)} className="p-2.5 text-red-600 hover:bg-red-50 rounded-xl transition-all">
                                <Trash2 size={18} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {filteredRecords.length === 0 && (
                  <div className="py-20 text-center space-y-4">
                    <div className="w-20 h-20 bg-zinc-50 rounded-full flex items-center justify-center mx-auto">
                      <Search size={32} className="text-zinc-200" />
                    </div>
                    <p className="text-zinc-400 font-bold">မှတ်တမ်းများ ရှာမတွေ့ပါ</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'attendance' && (
            <motion.div key="attendance" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="space-y-8">
              <div className="flex justify-between items-center">
                <header>
                  <h2 className="text-4xl font-black tracking-tight">တက်ရောက်မှု မှတ်တမ်း</h2>
                  <p className="text-zinc-500 font-medium">ယနေ့အတွက် အလုပ်ဝင်/ထွက် မှတ်တမ်းတင်ရန်</p>
                </header>
                <button 
                  onClick={() => setShowScanner(true)}
                  className="flex items-center gap-2 px-8 py-4 bg-emerald-600 text-white rounded-2xl font-black hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100"
                >
                  <QrCode size={20} /> QR စကင်ဖတ်ရန်
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {labourers.filter(l => l.status === 'Active').map(labourer => {
                  const record = attendance.find(a => a.labourer_id === labourer.id);
                  return (
                    <div key={labourer.id} className="bg-white p-6 rounded-[2rem] shadow-sm border border-zinc-200 space-y-4">
                      <div className="flex justify-between items-start">
                        <h3 className="font-black text-lg">{labourer.name}</h3>
                        {record?.check_out && (
                          <span className="bg-emerald-100 text-emerald-700 text-[10px] font-black px-3 py-1 rounded-full">
                            ပြီးစီး
                          </span>
                        )}
                      </div>
                      
                      <div className="space-y-2 text-xs font-bold text-zinc-500">
                        <div className="flex justify-between">
                          <span>အလုပ်ဝင်:</span>
                          <span className="text-zinc-900">{record?.check_in ? new Date(record.check_in).toLocaleTimeString() : '-'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>အလုပ်ထွက်:</span>
                          <span className="text-zinc-900">{record?.check_out ? new Date(record.check_out).toLocaleTimeString() : '-'}</span>
                        </div>
                        <div className="flex justify-between pt-2 border-t border-zinc-100">
                          <span>စုစုပေါင်းနာရီ:</span>
                          <span className="text-emerald-600 font-black">{record?.actual_hours?.toFixed(2) || '0.00'} နာရီ</span>
                        </div>
                      </div>

                      <div className="flex gap-2 pt-2">
                        <button 
                          disabled={!!record?.check_in}
                          onClick={async () => {
                            const now = new Date().toISOString();
                            // Optimistic update
                            setAttendance(prev => [...prev, {
                              id: 'temp-' + Date.now(),
                              labourer_id: labourer.id,
                              name: labourer.name,
                              check_in: now,
                              check_out: null,
                              actual_hours: 0,
                              date: now.split('T')[0]
                            }]);
                            
                            await fetch('/api/attendance/check-in', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ labourer_id: labourer.id, name: labourer.name })
                            });
                            fetchData();
                          }}
                          className="flex-1 flex items-center justify-center gap-2 py-3 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 disabled:opacity-50 transition-all"
                        >
                          <LogIn size={14} /> အလုပ်ဝင်
                        </button>
                        <button 
                          disabled={!record?.check_in || !!record?.check_out}
                          onClick={async () => {
                            const now = new Date().toISOString();
                            // Optimistic update
                            setAttendance(prev => prev.map(a => a.labourer_id === labourer.id ? { ...a, check_out: now } : a));
                            
                            await fetch('/api/attendance/check-out', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ labourer_id: labourer.id })
                            });
                            fetchData();
                          }}
                          className="flex-1 flex items-center justify-center gap-2 py-3 bg-orange-600 text-white rounded-xl text-xs font-bold hover:bg-orange-700 disabled:opacity-50 transition-all"
                        >
                          <LogOut size={14} /> အလုပ်ထွက်
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {attendance.length > 0 && (
                <section className="bg-white rounded-[2rem] p-8 shadow-sm border border-zinc-200">
                  <h3 className="font-black text-xl mb-6">ယနေ့ တက်ရောက်မှုစာရင်း</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-zinc-50/50 border-b border-zinc-100">
                          <th className="px-6 py-4 text-[10px] font-black text-zinc-400 uppercase tracking-widest">အမည်</th>
                          <th className="px-6 py-4 text-[10px] font-black text-zinc-400 uppercase tracking-widest">အလုပ်ဝင်</th>
                          <th className="px-6 py-4 text-[10px] font-black text-zinc-400 uppercase tracking-widest">အလုပ်ထွက်</th>
                          <th className="px-6 py-4 text-[10px] font-black text-zinc-400 uppercase tracking-widest">နာရီ</th>
                          <th className="px-6 py-4 text-[10px] font-black text-zinc-400 uppercase tracking-widest text-right">လုပ်ဆောင်ချက်</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-50">
                        {attendance.map(record => (
                          <tr key={record.id} className="hover:bg-zinc-50/50 transition-colors group">
                            <td className="px-6 py-4 text-sm font-bold">{record.name}</td>
                            <td className="px-6 py-4 text-sm">{record.check_in ? new Date(record.check_in).toLocaleTimeString() : '-'}</td>
                            <td className="px-6 py-4 text-sm">{record.check_out ? new Date(record.check_out).toLocaleTimeString() : '-'}</td>
                            <td className="px-6 py-4 text-sm font-bold text-emerald-600">{record.actual_hours.toFixed(2)}</td>
                            <td className="px-6 py-4 text-right">
                              <button 
                                onClick={async () => {
                                  if (!window.confirm('ဤတက်ရောက်မှုမှတ်တမ်းကို ဖျက်ရန် သေချာပါသလား?')) return;
                                  await fetch(`/api/attendance/${record.id}`, { method: 'DELETE' });
                                  fetchData();
                                }}
                                className="p-2 text-red-600 hover:bg-red-50 rounded-xl transition-all"
                              >
                                <Trash2 size={18} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            </motion.div>
          )}

          {activeTab === 'add' && (
            <motion.div key="add" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="max-w-3xl mx-auto">
              <header className="mb-10 flex items-center justify-between">
                <div>
                  <h2 className="text-4xl font-black tracking-tight">{editingRecord ? 'မှတ်တမ်းပြင်ဆင်ရန်' : 'မှတ်တမ်းအသစ်'}</h2>
                  <p className="text-zinc-500 font-medium">အသေးစိတ်အချက်အလက်များကို ဖြည့်သွင်းပါ</p>
                </div>
                {editingRecord && (
                  <button onClick={() => { setEditingRecord(null); setActiveTab('records'); }} className="p-3 hover:bg-zinc-200 rounded-2xl transition-all">
                    <X size={28} />
                  </button>
                )}
              </header>

              <RecordForm 
                initialData={editingRecord || undefined} 
                onSave={handleSaveRecord} 
                loading={loading}
                labourers={labourers.filter(l => l.status === 'Active')}
                budgets={budgets}
              />
            </motion.div>
          )}

          {activeTab === 'labour' && (
            <motion.div key="labour" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="space-y-8">
              <header>
                <h2 className="text-4xl font-black tracking-tight">ဝန်ထမ်းစာရင်း</h2>
                <p className="text-zinc-500 font-medium">ဝန်ထမ်းများ စီမံခန့်ခွဲခြင်း</p>
              </header>
              <LabourManager labourers={labourers} onUpdate={fetchData} onShowQR={(l) => setShowQRModal(l)} />
            </motion.div>
          )}

          {activeTab === 'budget' && (
            <motion.div key="budget" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="space-y-8">
              <header>
                <h2 className="text-4xl font-black tracking-tight">ဘတ်ဂျက်သတ်မှတ်ရန်</h2>
                <p className="text-zinc-500 font-medium">လုပ်ငန်းအလိုက် ဘတ်ဂျက်များ သတ်မှတ်ခြင်း</p>
              </header>
              <BudgetManager budgets={budgets} records={records} onUpdate={fetchData} />
            </motion.div>
          )}

          {activeTab === 'reports' && (
            <motion.div key="reports" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="space-y-8">
              <header>
                <h2 className="text-4xl font-black tracking-tight">အစီရင်ခံစာ (Reports)</h2>
                <p className="text-zinc-500 font-medium">နေ့စဉ်နှင့် လစဉ် အနှစ်ချုပ် အစီရင်ခံစာများ</p>
              </header>
              <ReportManager records={records} attendance={attendance} setIsExporting={setIsExporting} />
            </motion.div>
          )}
        </AnimatePresence>

        {showScanner && (
          <QRScanner 
            onScan={async (decodedText) => {
              let labourerId = decodedText;
              try {
                // Try to parse as JSON if it contains name and id
                const data = JSON.parse(decodedText);
                if (data.id) labourerId = data.id;
              } catch (e) {
                // Not JSON, assume it's just the ID
              }

              let location = 'Unknown';
              try {
                const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
                  navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
                });
                location = `${pos.coords.latitude}, ${pos.coords.longitude}`;
              } catch (e) {
                console.warn("Location access denied or timed out");
              }

              const res = await fetch('/api/attendance/scan', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ labourer_id: labourerId, location })
              });
              const data = await res.json();
              if (res.ok) {
                alert(`${data.name} - ${data.type === 'check-in' ? 'အလုပ်ဝင်ချိန် မှတ်တမ်းတင်ပြီး' : 'အလုပ်ထွက်ချိန် မှတ်တမ်းတင်ပြီး'}\nတည်နေရာ: ${location}`);
              } else {
                alert(data.error || 'အမှားအယွင်းရှိပါသည်');
              }
              setShowScanner(false);
              fetchData();
            }} 
            onClose={() => setShowScanner(false)} 
          />
        )}

        {showQRModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white p-10 rounded-[3rem] shadow-2xl text-center space-y-6 max-w-sm w-full">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-black text-2xl">{showQRModal.name}</h3>
                <button onClick={() => setShowQRModal(null)} className="p-2 hover:bg-zinc-100 rounded-full transition-all">
                  <X size={24} />
                </button>
              </div>
              <div className="bg-zinc-50 p-8 rounded-[2rem] flex justify-center border border-zinc-100">
                <QRCodeCanvas 
                  id="qr-canvas"
                  value={JSON.stringify({ id: showQRModal.id, name: showQRModal.name })} 
                  size={200} 
                  level="H" 
                  includeMargin 
                />
              </div>
              <p className="text-zinc-500 font-bold text-sm">ဤ QR ကုဒ်တွင် ဝန်ထမ်းအမည်နှင့် ID ပါဝင်ပါသည်</p>
              <div className="grid grid-cols-2 gap-4">
                <button 
                  onClick={() => {
                    const canvas = document.getElementById('qr-canvas') as HTMLCanvasElement;
                    if (canvas) {
                      const url = canvas.toDataURL('image/png');
                      const link = document.createElement('a');
                      link.download = `QR_${showQRModal.name}.png`;
                      link.href = url;
                      link.click();
                    }
                  }}
                  className="flex items-center justify-center gap-2 py-4 bg-emerald-600 text-white rounded-2xl font-black hover:bg-emerald-700 transition-all"
                >
                  <Download size={20} /> သိမ်းရန်
                </button>
                <button 
                  onClick={() => window.print()}
                  className="w-full py-4 bg-zinc-900 text-white rounded-2xl font-black hover:bg-black transition-all"
                >
                  ထုတ်ယူရန်
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </main>
    </div>
  );
};

const NavItem: React.FC<{ active: boolean; onClick: () => void; icon: React.ReactNode; label: string }> = ({ active, onClick, icon, label }) => (
  <button
    onClick={onClick}
    className={`flex flex-col md:flex-row items-center gap-2 md:gap-4 px-5 py-3 md:w-full rounded-2xl transition-all ${
      active 
        ? 'text-emerald-600 bg-emerald-50 font-black shadow-sm' 
        : 'text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 font-bold'
    }`}
  >
    <div className={`${active ? 'scale-110' : ''} transition-transform`}>{icon}</div>
    <span className="text-[10px] md:text-sm">{label}</span>
  </button>
);

const StatCard: React.FC<{ label: string; value: string | number; icon: React.ReactNode; color: string }> = ({ label, value, icon, color }) => (
  <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-zinc-200 flex flex-col gap-6 hover:shadow-md transition-all">
    <div className={`w-14 h-14 rounded-2xl ${color} flex items-center justify-center shadow-inner`}>
      {React.cloneElement(icon as React.ReactElement, { size: 28 })}
    </div>
    <div>
      <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">{label}</p>
      <p className="text-2xl font-black mt-2 tracking-tight">{value}</p>
    </div>
  </div>
);

const RecordForm: React.FC<{ initialData?: PayrollRecord; onSave: (data: PayrollRecord) => void; loading: boolean; labourers: Labourer[]; budgets: Budget[] }> = ({ initialData, onSave, loading, labourers, budgets }) => {
  const [formData, setFormData] = useState<PayrollRecord>(initialData || {
    id: '',
    serial_no: '',
    activity: '',
    duration: '',
    name: '',
    working_hours: 0,
    total_days: 0,
    rate: 0,
    meal_allowance: 0,
    total: 0,
    net_pay: 0,
    advance: 0,
    balance: 0,
    signature: ''
  });
  const [attendanceWarning, setAttendanceWarning] = useState('');

  useEffect(() => {
    const total = formData.rate + formData.meal_allowance;
    const net_pay = formData.working_hours * total;
    const balance = net_pay - formData.advance;
    setFormData(prev => ({ ...prev, total, net_pay, balance }));
  }, [formData.rate, formData.meal_allowance, formData.working_hours, formData.advance]);

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    
    if (name === 'name' && value) {
      const res = await fetch(`/api/attendance/hours/${encodeURIComponent(value)}`);
      const data = await res.json();
      if (data.hours > 0) {
        setFormData(prev => ({ ...prev, name: value, working_hours: data.hours }));
        setAttendanceWarning('');
      } else {
        setFormData(prev => ({ ...prev, name: value, working_hours: 0 }));
        setAttendanceWarning('ယနေ့အတွက် တက်ရောက်မှုမှတ်တမ်း မရှိသေးပါ');
      }
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: type === 'number' ? parseFloat(value) || 0 : value
      }));
    }
  };

  return (
    <form className="space-y-8 bg-white p-10 rounded-[2.5rem] shadow-sm border border-zinc-200" onSubmit={(e) => {
      e.preventDefault();
      onSave(formData);
    }}>
      <div className="grid grid-cols-2 gap-6">
        <Input label="စဉ် (Serial No)" name="serial_no" value={formData.serial_no} onChange={handleChange} required />
        <Input label="ကာလ (Duration)" name="duration" value={formData.duration} onChange={handleChange} required />
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div className="space-y-2">
          <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-2">အမည် (Name)</label>
          <div className="relative">
            <select 
              name="name" 
              value={formData.name} 
              onChange={handleChange} 
              required 
              className="w-full px-6 py-4 rounded-2xl border border-zinc-200 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all text-sm font-bold bg-zinc-50/50 cursor-pointer"
            >
              <option value="">ဝန်ထမ်းရွေးချယ်ပါ</option>
              {labourers.filter(l => l.status === 'Active').map(l => <option key={l.id} value={l.name}>{l.name}</option>)}
            </select>
            <ChevronRight className="absolute right-4 top-1/2 -translate-y-1/2 rotate-90 text-zinc-400 pointer-events-none" size={18} />
          </div>
          {attendanceWarning && (
            <p className="text-[10px] text-orange-500 font-bold flex items-center gap-1 mt-1">
              <AlertCircle size={10} /> {attendanceWarning}
            </p>
          )}
        </div>
        <div className="space-y-2">
          <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-2">လုပ်ငန်း (Activity)</label>
          <div className="relative">
            <select 
              name="activity" 
              value={formData.activity} 
              onChange={handleChange} 
              required
              className="w-full px-6 py-4 rounded-2xl border border-zinc-200 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all text-sm font-bold bg-zinc-50/50 cursor-pointer"
            >
              <option value="">လုပ်ငန်းရွေးချယ်ပါ</option>
              {budgets.map(b => <option key={b.id} value={b.activity}>{b.activity}</option>)}
              {budgets.length === 0 && <option disabled>ဘတ်ဂျက်တွင် လုပ်ငန်းအရင်ထည့်ပါ</option>}
            </select>
            <ChevronRight className="absolute right-4 top-1/2 -translate-y-1/2 rotate-90 text-zinc-400 pointer-events-none" size={18} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-6">
        <Input label="ဆင်းနာရီ (Working Hours)" name="working_hours" type="number" value={formData.working_hours} onChange={handleChange} />
        <Input label="နှုန်း (Rate)" name="rate" type="number" value={formData.rate} onChange={handleChange} />
        <Input label="စားစရိတ် (Meal Allowance)" name="meal_allowance" type="number" value={formData.meal_allowance} onChange={handleChange} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
        <Input label="ပေါင်း (Total)" name="total" type="number" value={formData.total} readOnly className="bg-zinc-50 font-bold" />
        <Input label="ကျသင့် (Net Pay)" name="net_pay" type="number" value={formData.net_pay} readOnly className="bg-zinc-50 font-bold" />
        <Input label="ကြိုတင် (Advance)" name="advance" type="number" value={formData.advance} onChange={handleChange} />
        <Input label="အသားတင် (Balance)" name="balance" type="number" value={formData.balance} readOnly className="bg-emerald-50 text-emerald-700 font-black" />
      </div>

      <SignaturePad 
        initialValue={formData.signature} 
        onSave={(sig) => setFormData(prev => ({ ...prev, signature: sig }))} 
      />

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black py-5 rounded-[1.5rem] shadow-xl shadow-emerald-200 transition-all flex items-center justify-center gap-3 disabled:opacity-50 text-lg"
      >
        {loading ? <Loader2 className="animate-spin" /> : <Save size={24} />}
        {initialData ? 'ပြင်ဆင်ချက်များ သိမ်းဆည်းရန်' : 'အသစ်ထည့်သွင်းရန်'}
      </button>
    </form>
  );
};

const LabourManager: React.FC<{ labourers: Labourer[]; onUpdate: () => void; onShowQR: (l: Labourer) => void }> = ({ labourers, onUpdate, onShowQR }) => {
  const [name, setName] = useState('');
  const [status, setStatus] = useState<'Active' | 'Inactive'>('Active');
  const [position, setPosition] = useState('');
  const [department, setDepartment] = useState('');
  const [showHistory, setShowHistory] = useState<Labourer | null>(null);
  const [historyData, setHistoryData] = useState<LabourerHistory[]>([]);
  const [editingLabour, setEditingLabour] = useState<Labourer | null>(null);

  const handleAdd = async () => {
    if (!name) return;
    await fetch('/api/labourers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, status, position, department }),
    });
    setName('');
    setPosition('');
    setDepartment('');
    onUpdate();
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLabour) return;
    await fetch(`/api/labourers/${editingLabour.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editingLabour),
    });
    setEditingLabour(null);
    onUpdate();
  };

  const fetchHistory = async (labourer: Labourer) => {
    const res = await fetch(`/api/labourers/${labourer.id}/history`);
    const data = await res.json();
    setHistoryData(data);
    setShowHistory(labourer);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('ဖျက်ရန် သေချာပါသလား?')) return;
    await fetch(`/api/labourers/${id}`, { method: 'DELETE' });
    onUpdate();
  };

  const toggleStatus = async (labourer: Labourer) => {
    await fetch(`/api/labourers/${labourer.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...labourer, status: labourer.status === 'Active' ? 'Inactive' : 'Active' }),
    });
    onUpdate();
  };

  return (
    <div className="space-y-8">
      <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-zinc-200 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <input 
            type="text" 
            placeholder="ဝန်ထမ်းအမည်..." 
            className="px-6 py-4 rounded-2xl border border-zinc-200 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 font-bold"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <select 
            className="px-6 py-4 rounded-2xl border border-zinc-200 focus:outline-none font-bold bg-zinc-50"
            value={status}
            onChange={(e) => setStatus(e.target.value as any)}
          >
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <input 
            type="text" 
            placeholder="ရာထူး (Position)..." 
            className="px-6 py-4 rounded-2xl border border-zinc-200 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 font-bold"
            value={position}
            onChange={(e) => setPosition(e.target.value)}
          />
          <input 
            type="text" 
            placeholder="ဌာန (Department)..." 
            className="px-6 py-4 rounded-2xl border border-zinc-200 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 font-bold"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
          />
        </div>
        <button onClick={handleAdd} className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-black hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100">
          ဝန်ထမ်းအသစ်ထည့်ရန်
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {labourers.map(l => (
          <div key={l.id} className="bg-white p-6 rounded-[1.5rem] shadow-sm border border-zinc-200 flex flex-col gap-4 group">
            <div className="flex justify-between items-start">
              <div>
                <p className="font-black text-lg">{l.name}</p>
                <p className="text-xs text-zinc-500 font-bold">{l.position || 'No Position'} • {l.department || 'No Dept'}</p>
                <button 
                  onClick={() => toggleStatus(l)}
                  className={`text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full mt-2 ${l.status === 'Active' ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-100 text-zinc-500'}`}
                >
                  {l.status}
                </button>
              </div>
              <div className="flex items-center gap-1">
                {l.status === 'Active' && (
                  <button 
                    onClick={() => onShowQR(l)}
                    className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all"
                    title="QR Code ထုတ်ရန်"
                  >
                    <QrCode size={18} />
                  </button>
                )}
                <button onClick={() => setEditingLabour(l)} className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all" title="Edit">
                  <Edit3 size={18} />
                </button>
                <button onClick={() => fetchHistory(l)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-xl transition-all" title="History">
                  <Clock size={18} />
                </button>
                <button onClick={() => handleDelete(l.id)} className="p-2 text-red-500 hover:bg-red-50 rounded-xl opacity-0 group-hover:opacity-100 transition-all">
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {editingLabour && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white p-8 rounded-[2.5rem] shadow-2xl w-full max-w-lg">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-black text-2xl">ဝန်ထမ်းအချက်အလက် ပြင်ဆင်ရန်</h3>
              <button onClick={() => setEditingLabour(null)} className="p-2 hover:bg-zinc-100 rounded-full transition-all">
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleUpdate} className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-2">ဝန်ထမ်းအမည်</label>
                <input 
                  type="text" 
                  className="w-full px-6 py-4 rounded-2xl border border-zinc-200 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 font-bold"
                  value={editingLabour.name}
                  onChange={(e) => setEditingLabour({ ...editingLabour, name: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-2">အခြေအနေ (Status)</label>
                <select 
                  className="w-full px-6 py-4 rounded-2xl border border-zinc-200 focus:outline-none font-bold bg-zinc-50"
                  value={editingLabour.status}
                  onChange={(e) => setEditingLabour({ ...editingLabour, status: e.target.value as any })}
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-2">ရာထူး (Position)</label>
                <input 
                  type="text" 
                  className="w-full px-6 py-4 rounded-2xl border border-zinc-200 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 font-bold"
                  value={editingLabour.position || ''}
                  onChange={(e) => setEditingLabour({ ...editingLabour, position: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-2">ဌာန (Department)</label>
                <input 
                  type="text" 
                  className="w-full px-6 py-4 rounded-2xl border border-zinc-200 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 font-bold"
                  value={editingLabour.department || ''}
                  onChange={(e) => setEditingLabour({ ...editingLabour, department: e.target.value })}
                />
              </div>
              <button type="submit" className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-black hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100 mt-4">
                ပြင်ဆင်ချက်များ သိမ်းဆည်းရန်
              </button>
            </form>
          </motion.div>
        </div>
      )}

      {showHistory && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white p-8 rounded-[2.5rem] shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="font-black text-2xl">{showHistory.name}</h3>
                <p className="text-zinc-500 font-bold text-sm">ရာထူးနှင့် ဌာန ပြောင်းလဲမှုမှတ်တမ်း</p>
              </div>
              <button onClick={() => setShowHistory(null)} className="p-2 hover:bg-zinc-100 rounded-full transition-all">
                <X size={24} />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto pr-2 space-y-4">
              {historyData.map((h, idx) => (
                <div key={h.id} className="relative pl-8 pb-4 border-l-2 border-zinc-100 last:border-0">
                  <div className="absolute left-[-9px] top-0 w-4 h-4 rounded-full bg-emerald-500 border-4 border-white shadow-sm"></div>
                  <div className="bg-zinc-50 p-4 rounded-2xl border border-zinc-100">
                    <div className="flex justify-between items-start mb-2">
                      <p className="font-black text-zinc-900">{h.position || 'No Position'}</p>
                      <p className="text-[10px] font-bold text-zinc-400">{new Date(h.update_date).toLocaleDateString()}</p>
                    </div>
                    <p className="text-sm text-zinc-600 font-bold">{h.department || 'No Department'}</p>
                  </div>
                </div>
              ))}
              {historyData.length === 0 && <p className="text-center text-zinc-400 py-10 font-bold">မှတ်တမ်းမရှိသေးပါ</p>}
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

const BudgetManager: React.FC<{ budgets: Budget[]; records: PayrollRecord[]; onUpdate: () => void }> = ({ budgets, records, onUpdate }) => {
  const [activity, setActivity] = useState('');
  const [total, setTotal] = useState(0);

  const budgetStatus = useMemo(() => {
    const status: Record<string, { spent: number; budget: number }> = {};
    budgets.forEach(b => {
      status[b.activity] = { spent: 0, budget: b.total_budget };
    });
    records.forEach(r => {
      if (status[r.activity]) {
        status[r.activity].spent += r.net_pay;
      }
    });
    return status;
  }, [budgets, records]);

  const handleAdd = async () => {
    if (!activity) return;
    await fetch('/api/budgets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activity, total_budget: total }),
    });
    setActivity('');
    setTotal(0);
    onUpdate();
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('ဖျက်ရန် သေချာပါသလား?')) return;
    await fetch(`/api/budgets/${id}`, { method: 'DELETE' });
    onUpdate();
  };

  return (
    <div className="space-y-8">
      <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-zinc-200 flex flex-col sm:flex-row gap-4">
        <div className="flex-1 space-y-2">
          <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-2">လုပ်ငန်းအမည် (Activity Name)</label>
          <input 
            type="text" 
            placeholder="ဥပမာ - ရေပြောင်းလုပ်ငန်း..." 
            className="w-full px-6 py-4 rounded-2xl border border-zinc-200 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 font-bold"
            value={activity}
            onChange={(e) => setActivity(e.target.value)}
          />
        </div>
        <div className="w-full sm:w-64 space-y-2">
          <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-2">စုစုပေါင်း ဘတ်ဂျက် (Total Budget)</label>
          <input 
            type="number" 
            placeholder="ပမာဏ..." 
            className="w-full px-6 py-4 rounded-2xl border border-zinc-200 focus:outline-none font-bold bg-zinc-50"
            value={total}
            onChange={(e) => setTotal(parseFloat(e.target.value) || 0)}
          />
        </div>
        <div className="flex items-end">
          <button onClick={handleAdd} className="w-full sm:w-auto px-8 py-4 bg-emerald-600 text-white rounded-2xl font-black hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100 h-[60px]">
            ဘတ်ဂျက်သတ်မှတ်ရန်
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {budgets.map(b => {
          const status = budgetStatus[b.activity] || { spent: 0, budget: b.total_budget };
          const remaining = status.budget - status.spent;
          const isOver = status.spent > status.budget;
          
          return (
            <div key={b.id} className="bg-white p-8 rounded-[2rem] shadow-sm border border-zinc-200 flex flex-col gap-6 group hover:shadow-md transition-all">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Activity</p>
                  <p className="font-black text-xl mt-1">{b.activity}</p>
                </div>
                <button onClick={() => handleDelete(b.id)} className="p-3 text-red-500 hover:bg-red-50 rounded-xl opacity-0 group-hover:opacity-100 transition-all">
                  <Trash2 size={20} />
                </button>
              </div>

              <div className="space-y-4">
                <div className="flex justify-between items-end">
                  <div>
                    <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">စုစုပေါင်း ဘတ်ဂျက်</p>
                    <p className="font-black text-lg">{b.total_budget.toLocaleString()} MMK</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">သုံးစွဲပြီး</p>
                    <p className={`font-black text-lg ${isOver ? 'text-red-600' : 'text-zinc-900'}`}>{status.spent.toLocaleString()} MMK</p>
                  </div>
                </div>

                <div className="pt-4 border-t border-zinc-100 flex justify-between items-center">
                  <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">လက်ကျန် (Balance)</p>
                  <p className={`font-black text-xl ${isOver ? 'text-red-600' : 'text-emerald-600'}`}>
                    {remaining.toLocaleString()} MMK
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const ReportManager: React.FC<{ records: PayrollRecord[]; attendance: Attendance[]; setIsExporting: (val: boolean) => void }> = ({ records, attendance, setIsExporting }) => {
  const [reportType, setReportType] = useState<'daily' | 'monthly'>('daily');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));

  const reportData = useMemo(() => {
    const filtered = reportType === 'daily' 
      ? records.filter(r => r.created_at?.startsWith(selectedDate))
      : records.filter(r => r.created_at?.startsWith(selectedMonth));
    
    const attFiltered = reportType === 'daily'
      ? attendance.filter(a => a.date === selectedDate)
      : attendance.filter(a => a.date.startsWith(selectedMonth));

    return {
      filtered,
      total_spent: filtered.reduce((sum, r) => sum + r.net_pay, 0),
      total_advance: filtered.reduce((sum, r) => sum + r.advance, 0),
      total_balance: filtered.reduce((sum, r) => sum + r.balance, 0),
      present_count: attFiltered.length,
      records_count: filtered.length,
      activities: Array.from(new Set(filtered.map(r => r.activity)))
    };
  }, [reportType, selectedDate, selectedMonth, records, attendance]);

  const generatePDF = async () => {
    setIsExporting(true);
    try {
      const doc = new jsPDF();
      
      // Load Myanmar Font (Noto Sans Myanmar)
      try {
        const fontUrl = 'https://cdn.jsdelivr.net/gh/googlefonts/noto-fonts@master/hinted/ttf/NotoSansMyanmar/NotoSansMyanmar-Regular.ttf';
        const response = await fetch(fontUrl);
        const buffer = await response.arrayBuffer();
        const base64 = btoa(
          new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
        );
        doc.addFileToVFS('NotoSansMyanmar.ttf', base64);
        doc.addFont('NotoSansMyanmar.ttf', 'NotoSansMyanmar', 'normal');
        doc.setFont('NotoSansMyanmar');
      } catch (e) {
        console.warn("Failed to load Myanmar font, falling back to standard font", e);
      }

      const title = reportType === 'daily' ? `Daily Report - ${selectedDate}` : `Monthly Report - ${selectedMonth}`;
      
      // Header & Logo
      doc.setFontSize(24);
      doc.setTextColor(5, 150, 105); // Emerald-600
      doc.text("ITM-HR", 14, 22);
      
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(`Payroll Management System`, 14, 28);
      doc.text(`Report Date: ${new Date().toLocaleDateString()}`, 14, 35);
      doc.text(`Type: ${reportType === 'daily' ? 'နေ့စဉ် (Daily)' : 'လစဉ် (Monthly)'}`, 14, 40);
      doc.text(`Period: ${reportType === 'daily' ? selectedDate : selectedMonth}`, 14, 45);

      // Summary Stats Section
      doc.setDrawColor(240);
      doc.line(14, 50, 196, 50);
      
      doc.setFontSize(12);
      doc.setTextColor(0);
      doc.text(`စုစုပေါင်း အသုံးစရိတ်: ${reportData.total_spent.toLocaleString()} MMK`, 14, 60);
      doc.text(`စုစုပေါင်း ကြိုတင်ငွေ: ${reportData.total_advance.toLocaleString()} MMK`, 14, 67);
      doc.text(`စုစုပေါင်း လက်ကျန်: ${reportData.total_balance.toLocaleString()} MMK`, 14, 74);

      // Table
      const tableData = reportData.filtered.map((r, index) => [
        index + 1,
        r.name,
        r.activity,
        `${r.working_hours} hrs`,
        `${r.rate.toLocaleString()} MMK`,
        `${r.net_pay.toLocaleString()} MMK`,
        r.signature ? '' : 'No Sig'
      ]);

      autoTable(doc, {
        startY: 85,
        head: [['စဉ်', 'အမည်', 'လုပ်ငန်း', 'နာရီ', 'နှုန်း', 'ပေါင်း', 'လက်မှတ်']],
        body: tableData,
        theme: 'grid',
        headStyles: { 
          fillColor: [5, 150, 105],
          font: 'NotoSansMyanmar',
          fontStyle: 'normal'
        },
        styles: {
          font: 'NotoSansMyanmar',
          fontStyle: 'normal'
        },
        didDrawCell: (data) => {
          if (data.section === 'body' && data.column.index === 6) {
            const record = reportData.filtered[data.row.index];
            if (record.signature) {
              try {
                doc.addImage(record.signature, 'PNG', data.cell.x + 2, data.cell.y + 2, 16, 10);
              } catch (e) {
                console.error("Failed to add signature image", e);
              }
            }
          }
        },
        columnStyles: {
          6: { cellWidth: 25 }
        }
      });

      doc.save(`ITM_Report_${reportType}_${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (error) {
      console.error("PDF generation failed", error);
      alert("PDF ထုတ်ယူရန် အဆင်မပြေပါ။");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-zinc-200 flex flex-col sm:flex-row gap-6 items-end">
        <div className="flex-1 space-y-2">
          <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-2">အမျိုးအစား (Type)</label>
          <div className="flex bg-zinc-100 p-1 rounded-2xl">
            <button 
              onClick={() => setReportType('daily')}
              className={`flex-1 py-3 rounded-xl text-sm font-black transition-all ${reportType === 'daily' ? 'bg-white shadow-sm text-emerald-600' : 'text-zinc-400'}`}
            >
              နေ့စဉ် (Daily)
            </button>
            <button 
              onClick={() => setReportType('monthly')}
              className={`flex-1 py-3 rounded-xl text-sm font-black transition-all ${reportType === 'monthly' ? 'bg-white shadow-sm text-emerald-600' : 'text-zinc-400'}`}
            >
              လစဉ် (Monthly)
            </button>
          </div>
        </div>
        
        <div className="flex-1 space-y-2">
          <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-2">
            {reportType === 'daily' ? 'ရက်စွဲ (Date)' : 'လ (Month)'}
          </label>
          <input 
            type={reportType === 'daily' ? 'date' : 'month'}
            className="w-full px-6 py-4 rounded-2xl border border-zinc-200 focus:outline-none font-bold bg-zinc-50"
            value={reportType === 'daily' ? selectedDate : selectedMonth}
            onChange={(e) => reportType === 'daily' ? setSelectedDate(e.target.value) : setSelectedMonth(e.target.value)}
          />
        </div>

        <button 
          onClick={generatePDF}
          className="px-8 py-4 bg-zinc-900 text-white rounded-2xl font-black hover:bg-black transition-all shadow-lg flex items-center gap-2 h-[60px]"
        >
          <Download size={20} /> PDF ထုတ်ယူရန်
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-zinc-200">
          <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">စုစုပေါင်း အသုံးစရိတ်</p>
          <p className="text-3xl font-black mt-2 text-emerald-600">{reportData.total_spent.toLocaleString()} MMK</p>
          <div className="mt-4 pt-4 border-t border-zinc-50 flex justify-between text-xs font-bold text-zinc-500">
            <span>ကြိုတင်ငွေ: {reportData.total_advance.toLocaleString()}</span>
            <span>လက်ကျန်: {reportData.total_balance.toLocaleString()}</span>
          </div>
        </div>

        <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-zinc-200">
          <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">တက်ရောက်မှု အခြေအနေ</p>
          <p className="text-3xl font-black mt-2 text-blue-600">{reportData.present_count} ဦး</p>
          <p className="text-xs font-bold text-zinc-500 mt-4">စုစုပေါင်း မှတ်တမ်း: {reportData.records_count} ခု</p>
        </div>

        <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-zinc-200">
          <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">လုပ်ငန်း အမျိုးအစားများ</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {reportData.activities.map(act => (
              <span key={act} className="px-3 py-1 bg-zinc-100 rounded-full text-[10px] font-black text-zinc-600 uppercase">
                {act}
              </span>
            ))}
            {reportData.activities.length === 0 && <p className="text-zinc-400 text-xs font-bold">မှတ်တမ်းမရှိပါ</p>}
          </div>
        </div>
      </div>
    </div>
  );
};

const Input: React.FC<{ 
  label: string; 
  name: string; 
  value: string | number; 
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void; 
  type?: string;
  required?: boolean;
  readOnly?: boolean;
  className?: string;
}> = ({ label, name, value, onChange, type = 'text', required, readOnly, className }) => (
  <div className="space-y-2">
    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-2">{label}</label>
    <div className="relative">
      <input
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        required={required}
        readOnly={readOnly}
        className={`w-full px-6 py-4 rounded-2xl border border-zinc-200 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all text-sm font-bold ${className}`}
      />
      {type === 'number' && !readOnly && (
        <span className="absolute right-6 top-1/2 -translate-y-1/2 text-[10px] font-black text-zinc-300 pointer-events-none">MMK</span>
      )}
    </div>
  </div>
);

export default App;
