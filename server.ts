import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const db = new Database("payroll.db");

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS payroll_records (
    id TEXT PRIMARY KEY,
    serial_no TEXT,
    activity TEXT,
    duration TEXT,
    name TEXT,
    working_hours REAL,
    total_days REAL,
    rate REAL,
    meal_allowance REAL,
    total REAL,
    net_pay REAL,
    advance REAL,
    balance REAL,
    signature TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS labourers (
    id TEXT PRIMARY KEY,
    name TEXT,
    status TEXT,
    position TEXT,
    department TEXT
  );

  CREATE TABLE IF NOT EXISTS labourer_history (
    id TEXT PRIMARY KEY,
    labourer_id TEXT,
    position TEXT,
    department TEXT,
    update_date DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS budgets (
    id TEXT PRIMARY KEY,
    activity TEXT,
    total_budget REAL
  );

  CREATE TABLE IF NOT EXISTS attendance (
    id TEXT PRIMARY KEY,
    labourer_id TEXT,
    name TEXT,
    check_in DATETIME,
    check_out DATETIME,
    actual_hours REAL DEFAULT 0,
    location TEXT,
    date TEXT
  );
`);

// Migrations to ensure columns exist if tables were created in older versions
const migrate = () => {
  const tables = {
    payroll_records: ['net_pay', 'serial_no', 'activity', 'duration', 'working_hours', 'total_days', 'rate', 'meal_allowance', 'total', 'advance', 'balance', 'signature'],
    labourers: ['position', 'department']
  };

  for (const [table, columns] of Object.entries(tables)) {
    const info = db.prepare(`PRAGMA table_info(${table})`).all() as any[];
    const existingColumns = info.map(c => c.name);
    
    for (const col of columns) {
      if (!existingColumns.includes(col)) {
        try {
          const type = (col === 'name' || col === 'id' || col === 'serial_no' || col === 'activity' || col === 'duration' || col === 'signature' || col === 'position' || col === 'department') ? 'TEXT' : 'REAL';
          db.prepare(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`).run();
          console.log(`Added column ${col} to ${table}`);
        } catch (e) {
          console.error(`Failed to add column ${col} to ${table}:`, e);
        }
      }
    }
  }
};

migrate();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  // Attendance
  app.get("/api/attendance/today", (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    const attendance = db.prepare("SELECT * FROM attendance WHERE date = ?").all(today);
    res.json(attendance);
  });

  app.post("/api/attendance/check-in", (req, res) => {
    const { labourer_id, name } = req.body;
    const today = new Date().toISOString().split('T')[0];
    const now = new Date().toISOString();
    const id = Date.now().toString();

    // Check if already checked in
    const existing = db.prepare("SELECT * FROM attendance WHERE labourer_id = ? AND date = ?").get(labourer_id, today);
    if (existing) return res.status(400).json({ error: "Already checked in" });

    db.prepare("INSERT INTO attendance (id, labourer_id, name, check_in, date) VALUES (?, ?, ?, ?, ?)").run(id, labourer_id, name, now, today);
    res.json({ id });
  });

  app.post("/api/attendance/check-out", (req, res) => {
    const { labourer_id } = req.body;
    const today = new Date().toISOString().split('T')[0];
    const now = new Date().toISOString();

    const attendance = db.prepare("SELECT * FROM attendance WHERE labourer_id = ? AND date = ?").get(labourer_id, today);
    if (!attendance || !attendance.check_in) return res.status(400).json({ error: "No check-in found" });

    const checkInTime = new Date(attendance.check_in).getTime();
    const checkOutTime = new Date(now).getTime();
    const hours = (checkOutTime - checkInTime) / (1000 * 60 * 60);

    db.prepare("UPDATE attendance SET check_out = ?, actual_hours = ? WHERE id = ?").run(now, hours, attendance.id);
    res.json({ success: true, hours });
  });

  app.post("/api/attendance/scan", (req, res) => {
    const { labourer_id, location } = req.body;
    const today = new Date().toISOString().split('T')[0];
    const now = new Date().toISOString();
    const id = Date.now().toString();

    const labourer = db.prepare("SELECT * FROM labourers WHERE id = ?").get(labourer_id);
    if (!labourer) return res.status(404).json({ error: "ဝန်ထမ်း ရှာမတွေ့ပါ" });
    if (labourer.status !== 'Active') return res.status(403).json({ error: "ဤဝန်ထမ်းသည် Active မဟုတ်ပါ" });

    const existing = db.prepare("SELECT * FROM attendance WHERE labourer_id = ? AND date = ?").get(labourer_id, today);

    if (!existing) {
      db.prepare("INSERT INTO attendance (id, labourer_id, name, check_in, location, date) VALUES (?, ?, ?, ?, ?, ?)").run(id, labourer_id, labourer.name, now, location || 'Unknown', today);
      return res.json({ type: 'check-in', name: labourer.name });
    } else if (!existing.check_out) {
      const checkInTime = new Date(existing.check_in).getTime();
      const checkOutTime = new Date(now).getTime();
      const hours = (checkOutTime - checkInTime) / (1000 * 60 * 60);

      db.prepare("UPDATE attendance SET check_out = ?, actual_hours = ?, location = ? WHERE id = ?").run(now, hours, location || 'Unknown', existing.id);
      return res.json({ type: 'check-out', name: labourer.name, hours });
    } else {
      return res.status(400).json({ error: "Already checked out for today" });
    }
  });

  app.delete("/api/attendance/:id", (req, res) => {
    db.prepare("DELETE FROM attendance WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  app.get("/api/attendance/hours/:name", (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    const attendance = db.prepare("SELECT actual_hours FROM attendance WHERE name = ? AND date = ?").get(req.params.name, today);
    res.json({ hours: attendance ? attendance.actual_hours : 0 });
  });

  // Payroll Records
  app.get("/api/records", (req, res) => {
    const records = db.prepare("SELECT * FROM payroll_records ORDER BY created_at DESC").all();
    res.json(records);
  });

  app.post("/api/records", (req, res) => {
    const record = req.body;
    const id = record.id || Date.now().toString();
    
    db.prepare(`
      INSERT INTO payroll_records (
        id, serial_no, activity, duration, name, working_hours,
        total_days, rate, meal_allowance, total, net_pay, advance, balance, signature
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, record.serial_no, record.activity, record.duration, record.name, record.working_hours,
      record.total_days, record.rate, record.meal_allowance, record.total, record.net_pay, record.advance, record.balance, record.signature
    );

    res.json({ id });
  });

  app.put("/api/records/:id", (req, res) => {
    const { id } = req.params;
    const record = req.body;

    db.prepare(`
      UPDATE payroll_records SET
        serial_no = ?, activity = ?, duration = ?, name = ?, working_hours = ?,
        total_days = ?, rate = ?, meal_allowance = ?, total = ?, net_pay = ?, advance = ?,
        balance = ?, signature = ?
      WHERE id = ?
    `).run(
      record.serial_no, record.activity, record.duration, record.name, record.working_hours,
      record.total_days, record.rate, record.meal_allowance, record.total, record.net_pay, record.advance, record.balance, record.signature, id
    );

    res.json({ success: true });
  });

  app.delete("/api/records/:id", (req, res) => {
    db.prepare("DELETE FROM payroll_records WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  app.post("/api/records/bulk-delete", (req, res) => {
    const { ids } = req.body;
    if (!Array.isArray(ids)) return res.status(400).json({ error: "IDs must be an array" });
    
    const deleteMany = db.transaction((ids) => {
      for (const id of ids) db.prepare("DELETE FROM payroll_records WHERE id = ?").run(id);
    });
    deleteMany(ids);
    res.json({ success: true });
  });

  // Labourers
  app.get("/api/labourers", (req, res) => {
    const labourers = db.prepare("SELECT * FROM labourers").all();
    res.json(labourers);
  });

  app.post("/api/labourers", (req, res) => {
    const { name, status, position, department } = req.body;
    const id = Date.now().toString();
    db.prepare("INSERT INTO labourers (id, name, status, position, department) VALUES (?, ?, ?, ?, ?)").run(id, name, status, position || '', department || '');
    
    // Add initial history
    db.prepare("INSERT INTO labourer_history (id, labourer_id, position, department) VALUES (?, ?, ?, ?)").run(
      Date.now().toString() + "_hist", id, position || '', department || ''
    );
    
    res.json({ id });
  });

  app.put("/api/labourers/:id", (req, res) => {
    const { id } = req.params;
    const { name, status, position, department } = req.body;
    
    const old = db.prepare("SELECT * FROM labourers WHERE id = ?").get(id);
    db.prepare("UPDATE labourers SET name = ?, status = ?, position = ?, department = ? WHERE id = ?").run(name, status, position, department, id);
    
    // If position or department changed, add to history
    if (old && (old.position !== position || old.department !== department)) {
      db.prepare("INSERT INTO labourer_history (id, labourer_id, position, department) VALUES (?, ?, ?, ?)").run(
        Date.now().toString() + "_hist", id, position, department
      );
    }
    
    res.json({ success: true });
  });

  app.get("/api/labourers/:id/history", (req, res) => {
    const history = db.prepare("SELECT * FROM labourer_history WHERE labourer_id = ? ORDER BY update_date DESC").all(req.params.id);
    res.json(history);
  });

  app.delete("/api/labourers/:id", (req, res) => {
    db.prepare("DELETE FROM labourers WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  // Budgets
  app.get("/api/budgets", (req, res) => {
    const budgets = db.prepare("SELECT * FROM budgets").all();
    res.json(budgets);
  });

  app.post("/api/budgets", (req, res) => {
    const { activity, total_budget } = req.body;
    const id = Date.now().toString();
    db.prepare("INSERT INTO budgets (id, activity, total_budget) VALUES (?, ?, ?)").run(id, activity, total_budget);
    res.json({ id });
  });

  app.put("/api/budgets/:id", (req, res) => {
    const { id } = req.params;
    const { activity, total_budget } = req.body;
    db.prepare("UPDATE budgets SET activity = ?, total_budget = ? WHERE id = ?").run(activity, total_budget, id);
    res.json({ success: true });
  });

  app.delete("/api/budgets/:id", (req, res) => {
    db.prepare("DELETE FROM budgets WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  app.get("/api/stats", (req, res) => {
    const stats = db.prepare(`
      SELECT 
        COUNT(*) as total_records,
        SUM(net_pay) as total_amount,
        SUM(advance) as total_advance,
        SUM(balance) as total_balance
      FROM payroll_records
    `).get();
    
    const budgets = db.prepare(`
      SELECT 
        b.*,
        COALESCE((SELECT SUM(net_pay) FROM payroll_records WHERE activity = b.activity), 0) as spent
      FROM budgets b
    `).all();
    
    const today = new Date().toISOString().split('T')[0];
    const presentCount = db.prepare("SELECT COUNT(*) as count FROM attendance WHERE date = ?").get(today).count;
    const totalLabourers = db.prepare("SELECT COUNT(*) as count FROM labourers WHERE status = 'Active'").get().count;
    
    res.json({ 
      ...stats, 
      budgets, 
      present_count: presentCount,
      absent_count: Math.max(0, totalLabourers - presentCount)
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
