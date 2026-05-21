import React, { useState, useEffect, useCallback, useRef } from "react";

const SUPABASE_URL = "https://iqhvdvvuonqxlnbnefgb.supabase.co";
const SUPABASE_KEY = "sb_publishable_nstXpLON-OZBhLpNAE5bdg_lMVSgGw9";

// ─── KREDENSIAL LOGIN ─────────────────────────────────────────────────────────
// Ganti username dan password di sini sesuai keinginan
const USERS = [
  { username: "admin",   password: "kuresapi123", role: "Admin" },
  { username: "kasir",   password: "kasir123",    role: "Kasir" },
];
// ─────────────────────────────────────────────────────────────────────────────

// Brand colors: header #2d4ba0 | bg #fadeeb | secondary #a1def9 | accent #ee4181
const C = {
  header:   "#2d4ba0",
  bg:       "#fadeeb",
  secondary:"#a1def9",
  accent:   "#ee4181",
  accentBg: "#fde8f0",
  navBorder:"#d4c8e0",
  cardBorder:"#d0e5f5",
  text:     "#1a2a5e",
  muted:    "#7a8ab0",
};

const ITEM_COLORS = {
  product:   { bg: "#e4f3fd", text: "#2d4ba0", border: "#a1def9", label: "📦 Produk" },
  workshop:  { bg: "#fde8f0", text: "#ee4181", border: "#f5a8c4", label: "🎓 Workshop" },
  equipment: { bg: "#e8edf8", text: "#1a3578", border: "#c8daff", label: "🔧 Perlengkapan" },
};

const CARD = { background: "#ffffff", borderRadius: 16, border: "1.5px solid #d0e5f5", boxShadow: "0 2px 14px rgba(45,75,160,0.08)" };

const api = async (path, opts = {}) => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: opts.prefer || "return=representation",
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.hint || `HTTP ${res.status}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : [];
};

const SETUP_SQL = `
create table if not exists kr_events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text check (type in ('art_market','workshop','online','other')) default 'other',
  location text,
  start_date date,
  end_date date,
  status text check (status in ('upcoming','ongoing','done')) default 'upcoming',
  notes text,
  created_at timestamptz default now()
);
alter table kr_events disable row level security;
create table if not exists kr_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('product','workshop','equipment')),
  sku text, price numeric(12,2) default 0,
  cost numeric(12,2) default 0, stock int default 0,
  unit text default 'pcs', description text,
  is_active boolean default true, created_at timestamptz default now()
);
create table if not exists kr_stock_moves (
  id uuid primary key default gen_random_uuid(),
  item_id uuid references kr_items(id),
  direction text check (direction in ('in','out')),
  qty int not null, note text, ref_id uuid,
  created_at timestamptz default now(), created_by text
);
create table if not exists kr_orders (
  id uuid primary key default gen_random_uuid(),
  order_no text not null unique, customer_name text, customer_phone text,
  payment_method text check (payment_method in ('cash','qris')),
  subtotal numeric(12,2), discount numeric(12,2) default 0, total numeric(12,2),
  status text default 'paid' check (status in ('paid','pending','cancelled')),
  event_id uuid,
  notes text, created_at timestamptz default now(), created_by text
);
create table if not exists kr_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references kr_orders(id) on delete cascade,
  item_id uuid references kr_items(id),
  item_name text, qty int not null, price numeric(12,2), subtotal numeric(12,2)
);
create table if not exists kr_reimbursements (
  id uuid primary key default gen_random_uuid(),
  expense_details text not null,
  event text,
  amount numeric(12,2) default 0,
  pic text,
  status text default 'unpaid' check (status in ('unpaid','paid')),
  transaction_date date,
  notes text,
  created_at timestamptz default now()
);
alter table kr_reimbursements disable row level security;
-- Bundle qty: berapa pcs fisik per 1 unit jual (default 1 = satuan)
alter table kr_items add column if not exists bundle_qty int default 1;
-- Varian desain per item (misal: Stiker Bundle → Kucing, Bunga, Bintang, dst)
create table if not exists kr_item_variants (
  id uuid primary key default gen_random_uuid(),
  item_id uuid references kr_items(id) on delete cascade,
  name text not null,
  stock int default 0,
  created_at timestamptz default now()
);
alter table kr_item_variants disable row level security;`;

const formatRp = (n) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n || 0);
const formatDate = (d) => new Date(d).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const genOrderNo = () => `KRS-${Date.now().toString().slice(-8)}`;
const useIsMobile = () => {
  const [m, setM] = useState(window.innerWidth < 768);
  useEffect(() => {
    const h = () => setM(window.innerWidth < 768);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return m;
};

const TABS = [
  { id: "pos",       icon: "🛒", label: "Kasir",         roles: ["Admin","Kasir"] },
  { id: "inventory", icon: "📦", label: "Inventory",     roles: ["Admin","Kasir"] },
  { id: "stock",     icon: "↕️", label: "Stok",          roles: ["Admin","Kasir"] },
  { id: "sales",     icon: "📊", label: "Penjualan",     roles: ["Admin","Kasir"] },
  { id: "events",    icon: "🎪", label: "Events",        roles: ["Admin"] },
  { id: "laporan",   icon: "📈", label: "Laporan",       roles: ["Admin"] },
  { id: "reimburse", icon: "💸", label: "Reimbursement", roles: ["Admin"] },
  { id: "setup",     icon: "⚙️", label: "Setup",         roles: ["Admin"] },
];

export default function App() {
  const [tab, setTab] = useState("pos");
  const [items, setItems] = useState([]);
  const [orders, setOrders] = useState([]);
  const [moves, setMoves] = useState([]);
  const [reimburses, setReimburses] = useState([]);
  const [events, setEvents]         = useState([]);
  const [variants, setVariants]     = useState([]); // kr_item_variants
  const [toast, setToast] = useState(null);
  const [user, setUser] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem("kr_user")) || null; } catch { return null; }
  });
  const isMobile = useIsMobile();

  const handleLogin = (u) => {
    setUser(u);
    try { sessionStorage.setItem("kr_user", JSON.stringify(u)); } catch {}
  };

  const handleLogout = () => {
    setUser(null);
    try { sessionStorage.removeItem("kr_user"); } catch {}
  };

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const loadItems = useCallback(async () => {
    try { setItems(await api("kr_items?is_active=eq.true&order=name.asc")); }
    catch (e) { if (!e.message.includes("does not exist")) showToast("Error: " + e.message, "error"); }
  }, []);
  const loadVariants = useCallback(async () => {
    try { setVariants(await api("kr_item_variants?order=name.asc")); } catch {}
  }, []);
  const loadOrders = useCallback(async () => {
    try { setOrders(await api("kr_orders?order=created_at.desc&limit=100")); } catch {}
  }, []);
  const loadMoves = useCallback(async () => {
    try { setMoves(await api("kr_stock_moves?order=created_at.desc&limit=200")); } catch {}
  }, []);
  const loadReimburses = useCallback(async () => {
    try { setReimburses(await api("kr_reimbursements?order=created_at.desc")); } catch {}
  }, []);
  const loadEvents = useCallback(async () => {
    try { setEvents(await api("kr_events?order=start_date.desc")); } catch {}
  }, []);

  useEffect(() => { loadItems(); loadVariants(); loadOrders(); loadMoves(); loadReimburses(); loadEvents(); }, []);

  // Tampilkan login screen kalau belum login
  if (!user) return <LoginScreen onLogin={handleLogin} isMobile={isMobile} />;

  return (
    <div style={{ fontFamily: "'Segoe UI', Tahoma, sans-serif", minHeight: "100vh", background: "#fadeeb", paddingBottom: isMobile ? 70 : 0 }}>
      <style>{`
        * { box-sizing: border-box; }
        @keyframes slideIn { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        input:focus, select:focus, textarea:focus { outline: 2px solid #2d4ba0 !important; border-color: #2d4ba0 !important; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-thumb { background: #f5a8c4; border-radius: 4px; }
        tbody tr:hover td { background: #e4f3fd !important; }
        .tap-btn:active { transform: scale(0.96); }
      `}</style>

      {/* ── Header ── */}
      <div style={{ background: "linear-gradient(135deg,#1a2d6e,#2d4ba0,#1a4080)", color: "#fff", padding: isMobile ? "0 16px" : "0 28px", display: "flex", alignItems: "center", gap: 12, height: isMobile ? 54 : 62, boxShadow: "0 4px 20px rgba(45,75,160,0.35)", position: "sticky", top: 0, zIndex: 100 }}>
        <img src="data:image/png;base64,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" alt="KURESAPI" style={{ width: 38, height: 38, borderRadius: 10, objectFit: "cover", flexShrink: 0 }} />
        <div>
          <div style={{ fontWeight: 800, fontSize: isMobile ? 15 : 18, letterSpacing: 1.5, color: "#a1def9" }}>KURESAPI</div>
          <div style={{ fontSize: 9, color: "#c8daff", letterSpacing: 1, marginTop: -2 }}>POS & INVENTORY</div>
        </div>
        <div style={{ flex: 1 }} />
        {!isMobile && (
          <div style={{ fontSize: 12, color: "#c8daff", background: "rgba(255,255,255,0.08)", padding: "5px 12px", borderRadius: 20 }}>
            📅 {new Date().toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </div>
        )}
        {isMobile && (
          <div style={{ fontSize: 11, color: "#c8daff" }}>
            {new Date().toLocaleDateString("id-ID", { day: "numeric", month: "short" })}
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 4 }}>
          <div style={{ fontSize: isMobile ? 11 : 12, color: "#c8daff", background: "rgba(255,255,255,0.1)", padding: "4px 10px", borderRadius: 20 }}>
            👤 {user.role}
          </div>
          <button onClick={handleLogout} className="tap-btn" style={{ fontSize: isMobile ? 11 : 12, color: "#fde8f0", background: "rgba(238,65,129,0.35)", border: "1px solid rgba(238,65,129,0.5)", padding: "4px 10px", borderRadius: 20, cursor: "pointer", fontWeight: 600 }}>
            Keluar
          </button>
        </div>
      </div>

      {/* ── Desktop Nav ── */}
      {!isMobile && (
        <div style={{ background: "#fff", borderBottom: "2px solid #d4c8e0", padding: "0 28px", display: "flex", gap: 2, position: "sticky", top: 62, zIndex: 99 }}>
          {TABS.filter(t => t.roles.includes(user.role)).map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} className="tap-btn" style={{ padding: "13px 18px", border: "none", background: "none", cursor: "pointer", borderBottom: tab === t.id ? "3px solid #2d4ba0" : "3px solid transparent", color: tab === t.id ? "#2d4ba0" : "#7a8ab0", fontWeight: tab === t.id ? 700 : 500, fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 16 }}>{t.icon}</span> {t.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Content ── */}
      <div style={{ padding: isMobile ? "16px" : "28px", maxWidth: 1320, margin: "0 auto" }}>
        {tab === "pos"       && <POS items={items} variants={variants} events={events} onRefresh={() => { loadItems(); loadOrders(); loadVariants(); }} showToast={showToast} isMobile={isMobile} />}
        {tab === "inventory" && <Inventory items={items} variants={variants} onRefresh={() => { loadItems(); loadVariants(); }} showToast={showToast} isMobile={isMobile} />}
        {tab === "stock"     && <StockMoves items={items} moves={moves} onRefresh={() => { loadItems(); loadMoves(); }} showToast={showToast} isMobile={isMobile} />}
        {tab === "sales"     && <Sales orders={orders} items={items} events={events} onRefresh={loadOrders} showToast={showToast} isMobile={isMobile} />}
        {tab === "events"    && <Events events={events} onRefresh={loadEvents} showToast={showToast} isMobile={isMobile} />}
        {tab === "laporan"   && <Laporan orders={orders} orderItems={[]} events={events} reimburses={reimburses} items={items} isMobile={isMobile} />}
        {tab === "reimburse" && <Reimbursement reimburses={reimburses} onRefresh={loadReimburses} showToast={showToast} isMobile={isMobile} />}
        {tab === "setup"     && user.role === "Admin" && <Setup setupSql={SETUP_SQL} showToast={showToast} onRefresh={() => { loadItems(); loadOrders(); loadMoves(); loadReimburses(); loadEvents(); }} />}
        {tab === "setup"     && user.role !== "Admin" && (
          <div style={{ textAlign: "center", padding: "80px 0", color: "#7a8ab0" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🔒</div>
            <div style={{ fontWeight: 700, fontSize: 18 }}>Akses Ditolak</div>
            <div style={{ fontSize: 14, marginTop: 6 }}>Halaman ini hanya untuk Admin</div>
          </div>
        )}
      </div>

      {/* ── Mobile Bottom Nav ── */}
      {isMobile && (
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "#fff", borderTop: "1.5px solid #d4c8e0", display: "flex", zIndex: 200, boxShadow: "0 -4px 20px rgba(233,30,140,0.1)" }}>
          {TABS.filter(t => t.roles.includes(user.role)).map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} className="tap-btn" style={{ flex: 1, padding: "10px 0 8px", border: "none", background: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
              <div style={{ fontSize: 20, lineHeight: 1 }}>{t.icon}</div>
              <div style={{ fontSize: 10, fontWeight: tab === t.id ? 700 : 400, color: tab === t.id ? "#2d4ba0" : "#7a8ab0" }}>{t.label}</div>
              {tab === t.id && <div style={{ width: 4, height: 4, borderRadius: 2, background: "#2d4ba0" }} />}
            </button>
          ))}
        </div>
      )}

      {/* ── Toast ── */}
      {toast && (
        <div style={{ position: "fixed", bottom: isMobile ? 82 : 28, right: isMobile ? 12 : 28, left: isMobile ? 12 : "auto", padding: "13px 18px", borderRadius: 14, background: toast.type === "error" ? "linear-gradient(135deg,#ef4444,#dc2626)" : "linear-gradient(135deg,#ee4181,#2d4ba0)", color: "#fff", fontSize: 14, fontWeight: 600, boxShadow: "0 6px 24px rgba(0,0,0,0.2)", zIndex: 9999, animation: "slideIn 0.3s ease", textAlign: isMobile ? "center" : "left" }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

// ─── LOGIN SCREEN ─────────────────────────────────────────────────────────────
function LoginScreen({ onLogin, isMobile }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = () => {
    if (!username || !password) return setError("Username dan password wajib diisi");
    setLoading(true);
    setTimeout(() => {
      const found = USERS.find(u => u.username === username && u.password === password);
      if (found) {
        setError("");
        onLogin(found);
      } else {
        setError("Username atau password salah");
      }
      setLoading(false);
    }, 500);
  };

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#1a2d6e,#2d4ba0,#1a4080)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: "'Segoe UI', Tahoma, sans-serif" }}>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        input:focus { outline: 2px solid #ee4181 !important; border-color: #ee4181 !important; }
      `}</style>
      <div style={{ width: "100%", maxWidth: 380, animation: "fadeIn 0.4s ease" }}>
        {/* Logo & Brand */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <img src="data:image/png;base64,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" alt="KURESAPI" onError={e => { e.target.style.display='none'; }} style={{ width: 80, height: 80, borderRadius: 20, objectFit: "contain", marginBottom: 12, mixBlendMode: "screen" }} />
          <div style={{ fontWeight: 900, fontSize: 28, letterSpacing: 2, color: "#a1def9" }}>KURESAPI</div>
          <div style={{ fontSize: 13, color: "#c8daff", letterSpacing: 1 }}>POS & INVENTORY</div>
        </div>

        {/* Login Card */}
        <div style={{ background: "#fff", borderRadius: 20, padding: isMobile ? 24 : 32, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
          <div style={{ fontWeight: 800, fontSize: 20, color: "#1a2a5e", marginBottom: 6 }}>Masuk</div>
          <div style={{ fontSize: 13, color: "#7a8ab0", marginBottom: 24 }}>Masukkan kredensial untuk melanjutkan</div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: "#1a2a5e", display: "block", marginBottom: 6 }}>Username</label>
              <input
                placeholder="Masukkan username..."
                value={username}
                onChange={e => { setUsername(e.target.value); setError(""); }}
                onKeyDown={e => e.key === "Enter" && handleSubmit()}
                autoCapitalize="none"
                style={{ width: "100%", padding: "11px 14px", border: "1.5px solid #d0e5f5", borderRadius: 10, fontSize: 14, boxSizing: "border-box" }}
              />
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: "#1a2a5e", display: "block", marginBottom: 6 }}>Password</label>
              <div style={{ position: "relative" }}>
                <input
                  type={showPass ? "text" : "password"}
                  placeholder="Masukkan password..."
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError(""); }}
                  onKeyDown={e => e.key === "Enter" && handleSubmit()}
                  style={{ width: "100%", padding: "11px 40px 11px 14px", border: "1.5px solid #d0e5f5", borderRadius: 10, fontSize: 14, boxSizing: "border-box" }}
                />
                <button onClick={() => setShowPass(s => !s)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "#7a8ab0" }}>
                  {showPass ? "🙈" : "👁️"}
                </button>
              </div>
            </div>

            {error && (
              <div style={{ background: "#fee2e2", color: "#ef4444", borderRadius: 10, padding: "10px 14px", fontSize: 13, fontWeight: 600 }}>
                ❌ {error}
              </div>
            )}

            <button onClick={handleSubmit} disabled={loading} style={{ width: "100%", padding: "14px 0", background: loading ? "#ddd" : "linear-gradient(135deg,#2d4ba0,#ee4181)", color: "#fff", border: "none", borderRadius: 12, fontWeight: 700, fontSize: 15, cursor: loading ? "not-allowed" : "pointer", marginTop: 4 }}>
              {loading ? "⏳ Memeriksa..." : "🔐 Masuk"}
            </button>
          </div>
        </div>

        <div style={{ textAlign: "center", marginTop: 20, fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
          KURESAPI POS & Inventory System
        </div>
      </div>
    </div>
  );
}

// ─── POS ──────────────────────────────────────────────────────────────────────
// ─── VARIANT PICKER MODAL ────────────────────────────────────────────────────
function VariantPickerModal({ item, variants, onConfirm, onCancel }) {
  const bq = item.bundle_qty || 1;
  const [counts, setCounts] = useState({}); // { variantId: qty }
  const total = Object.values(counts).reduce((s, n) => s + n, 0);
  const remaining = bq - total;

  const inc = (id) => {
    if (remaining <= 0) return;
    setCounts(c => ({ ...c, [id]: (c[id] || 0) + 1 }));
  };
  const dec = (id) => {
    if (!counts[id]) return;
    setCounts(c => ({ ...c, [id]: Math.max(0, (c[id] || 0) - 1) }));
  };

  const confirm = () => {
    if (remaining !== 0) return;
    const selected = variants
      .filter(v => counts[v.id] > 0)
      .flatMap(v => Array(counts[v.id]).fill({ id: v.id, name: v.name }));
    onConfirm(selected);
  };

  return (
    <div style={{ position:"fixed",inset:0,zIndex:500,background:"rgba(0,0,0,0.45)",display:"flex",alignItems:"center",justifyContent:"center",padding:16 }}>
      <div style={{ background:"#fff",borderRadius:20,padding:24,width:"100%",maxWidth:420,maxHeight:"80vh",overflowY:"auto",boxShadow:"0 20px 60px rgba(0,0,0,0.2)" }}>
        <div style={{ fontWeight:800,fontSize:17,color:"#1a2a5e",marginBottom:4 }}>🎨 Pilih Desain</div>
        <div style={{ fontSize:13,color:"#7a8ab0",marginBottom:16 }}>
          {item.name} — pilih <b>{bq} desain</b>
          {remaining > 0
            ? <span style={{ marginLeft:8,background:"#fef9c3",color:"#92400e",borderRadius:6,padding:"2px 8px",fontWeight:700 }}>{remaining} lagi</span>
            : <span style={{ marginLeft:8,background:"#d1fae5",color:"#10b981",borderRadius:6,padding:"2px 8px",fontWeight:700 }}>✓ Lengkap!</span>
          }
        </div>

        <div style={{ display:"flex",flexDirection:"column",gap:8,marginBottom:20 }}>
          {variants.map(v => {
            const cnt = counts[v.id] || 0;
            const stockOk = v.stock > cnt;
            return (
              <div key={v.id} style={{ display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:12,border:`2px solid ${cnt>0?"#ee4181":"#e8edf8"}`,background:cnt>0?"#fde8f0":"#fafbff" }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14,fontWeight:cnt>0?700:500,color:"#1a2a5e" }}>{v.name}</div>
                  <div style={{ fontSize:11,color:v.stock<=0?"#ef4444":"#7a8ab0" }}>
                    {v.stock<=0 ? "❌ Habis" : `Sisa ${v.stock} pcs`}
                  </div>
                </div>
                <div style={{ display:"flex",alignItems:"center",gap:6 }}>
                  <button onClick={()=>dec(v.id)} disabled={!cnt} className="tap-btn"
                    style={{ width:32,height:32,border:"1.5px solid #d4c8e0",borderRadius:8,background:"#fde8f0",cursor:cnt?"pointer":"not-allowed",fontSize:16,color:"#ee4181",fontWeight:700,opacity:cnt?1:0.4 }}>−</button>
                  <span style={{ fontSize:15,fontWeight:700,minWidth:20,textAlign:"center",color:cnt>0?"#ee4181":"#c8d2e0" }}>{cnt}</span>
                  <button onClick={()=>inc(v.id)} disabled={remaining<=0||!stockOk} className="tap-btn"
                    style={{ width:32,height:32,border:"1.5px solid #d4c8e0",borderRadius:8,background:"#e4f3fd",cursor:(remaining>0&&stockOk)?"pointer":"not-allowed",fontSize:16,color:"#2d4ba0",fontWeight:700,opacity:(remaining>0&&stockOk)?1:0.4 }}>+</button>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ display:"flex",gap:8 }}>
          <button onClick={confirm} disabled={remaining!==0} className="tap-btn"
            style={{ flex:2,padding:"13px 0",background:remaining===0?"linear-gradient(135deg,#ee4181,#2d4ba0)":"#ddd",color:"#fff",border:"none",borderRadius:12,fontWeight:700,cursor:remaining===0?"pointer":"not-allowed",fontSize:15 }}>
            ✅ Tambah ke Keranjang
          </button>
          <button onClick={onCancel} className="tap-btn"
            style={{ flex:1,padding:"13px 0",background:"#fff",color:"#7a8ab0",border:"1.5px solid #d4c8e0",borderRadius:12,fontWeight:600,cursor:"pointer",fontSize:15 }}>
            Batal
          </button>
        </div>
      </div>
    </div>
  );
}

function POS({ items, variants, events, onRefresh, showToast, isMobile }) {
  const [cart, setCart] = useState([]);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [payment, setPayment] = useState("cash");
  const [customer, setCustomer] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [discount, setDiscount] = useState(0);
  const [selectedEvent, setSelectedEvent] = useState("");
  const [saving, setSaving]             = useState(false);
  const [invoice, setInvoice]           = useState(null);
  const [showCart, setShowCart]         = useState(false);
  const [variantModal, setVariantModal] = useState(null); // { item }

  const activeEvents = (events || []).filter(e => e.status === "ongoing" || e.status === "upcoming");

  const filtered = items.filter(i =>
    i.type !== "equipment" &&
    (typeFilter === "all" || i.type === typeFilter) &&
    (i.name.toLowerCase().includes(search.toLowerCase()) || (i.sku || "").toLowerCase().includes(search.toLowerCase()))
  );

  const addToCart = (item) => {
    const itemVariants = variants.filter(v => v.item_id === item.id);
    // Buka picker hanya kalau bundle_qty > 1 DAN variants sudah dibuat
    if ((item.bundle_qty || 1) > 1 && itemVariants.length > 0) {
      setVariantModal({ item });
      return;
    }
    // Bundle tanpa variants / item biasa: langsung masuk keranjang
    setCart(c => {
      const ex = c.find(x => x.id === item.id);
      if (ex) return c.map(x => x.id === item.id ? { ...x, qty: x.qty + 1 } : x);
      return [...c, { ...item, qty: 1 }];
    });
  };

  const addBundleWithVariants = (item, selectedVariants) => {
    setVariantModal(null);
    setCart(c => {
      // Setiap bundle dengan pilihan desain disimpan sebagai entry terpisah
      const cartId = item.id + "_" + Date.now();
      return [...c, { ...item, qty: 1, cartId, selectedVariants }];
    });
  };

  const updateQty = (cartId, qty) => {
    if (qty <= 0) setCart(c => c.filter(x => (x.cartId || x.id) !== cartId));
    else setCart(c => c.map(x => (x.cartId || x.id) === cartId ? { ...x, qty } : x));
  };

  const subtotal = cart.reduce((s, x) => s + x.price * x.qty, 0);
  const total = Math.max(0, subtotal - discount);
  const cartCount = cart.reduce((s, x) => s + x.qty, 0);

  const checkout = async () => {
    if (!cart.length) return showToast("Keranjang kosong!", "error");
    setSaving(true);
    try {
      const orderNo = genOrderNo();
      const [order] = await api("kr_orders", {
        method: "POST",
        body: JSON.stringify({ order_no: orderNo, customer_name: customer || "Umum", customer_phone: customerPhone, payment_method: payment, subtotal, discount, total, status: "paid", event_id: selectedEvent || null }),
      });
      await api("kr_order_items", { method: "POST", body: JSON.stringify(cart.map(x => ({ order_id: order.id, item_id: x.id, item_name: x.name, qty: x.qty, price: x.price, subtotal: x.price * x.qty }))), prefer: "return=minimal" });
      const stockItems = cart.filter(x => x.type !== "workshop");
      if (stockItems.length) {
        await api("kr_stock_moves", { method: "POST", body: JSON.stringify(stockItems.map(x => ({ item_id: x.id, direction: "out", qty: x.qty * (x.bundle_qty||1), note: `Penjualan ${orderNo}`, ref_id: order.id }))), prefer: "return=minimal" });
        for (const m of stockItems) {
          if (m.selectedVariants?.length) {
            // Deduct per variant
            const variantTotals = {};
            m.selectedVariants.forEach(v => { variantTotals[v.id] = (variantTotals[v.id]||0) + m.qty; });
            for (const [vid, qty] of Object.entries(variantTotals)) {
              const vObj = variants.find(v => v.id === vid);
              if (vObj) await api(`kr_item_variants?id=eq.${vid}`, { method: "PATCH", body: JSON.stringify({ stock: Math.max(0, (vObj.stock||0) - qty) }), prefer: "return=minimal" });
            }
            // Update item.stock = sum of all variants after deduct
            const itemVars = variants.filter(v => v.item_id === m.id);
            const newTotal = itemVars.reduce((s, v) => s + Math.max(0, (v.stock||0) - (variantTotals[v.id]||0)), 0);
            await api(`kr_items?id=eq.${m.id}`, { method: "PATCH", body: JSON.stringify({ stock: newTotal }), prefer: "return=minimal" });
          } else {
            const item = items.find(i => i.id === m.id);
            const deduct = m.qty * (m.bundle_qty || 1);
            if (item) await api(`kr_items?id=eq.${m.id}`, { method: "PATCH", body: JSON.stringify({ stock: (item.stock||0) - deduct }), prefer: "return=minimal" });
          }
        }
      }
      setInvoice({ ...order, items: cart, customer, customerPhone, payment, subtotal, discount, total });
      setCart([]); setCustomer(""); setCustomerPhone(""); setDiscount(0); setSelectedEvent(""); setShowCart(false);
      onRefresh();
      showToast(`✨ Transaksi ${orderNo} berhasil!`);
    } catch (e) { showToast("Gagal: " + e.message, "error"); }
    setSaving(false);
  };

  if (invoice) return <InvoiceView invoice={invoice} onClose={() => setInvoice(null)} isMobile={isMobile} />;

  const cartProps = { cart, cartCount, customer, setCustomer, customerPhone, setCustomerPhone, selectedEvent, setSelectedEvent, activeEvents, isMobile, subtotal, discount, setDiscount, total, payment, setPayment, checkout, saving, updateQty };

  return (
    <div>
      {variantModal && (
        <VariantPickerModal
          item={variantModal.item}
          variants={variants.filter(v => v.item_id === variantModal.item.id)}
          onConfirm={(sel) => addBundleWithVariants(variantModal.item, sel)}
          onCancel={() => setVariantModal(null)}
        />
      )}
      {/* Search + Filter */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <div style={{ flex: 1, position: "relative" }}>
          <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)" }}>🔍</span>
          <input placeholder="Cari produk..." value={search} onChange={e => setSearch(e.target.value)} style={{ width: "100%", padding: "11px 12px 11px 34px", border: "1.5px solid #d4c8e0", borderRadius: 12, fontSize: 14, background: "#fff" }} />
        </div>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{ padding: "0 10px", border: "1.5px solid #d4c8e0", borderRadius: 12, fontSize: 13, background: "#fff", color: "#1a2a5e", minWidth: isMobile ? 90 : 140 }}>
          <option value="all">{isMobile ? "Semua" : "✨ Semua"}</option>
          <option value="product">{isMobile ? "Produk" : "📦 Produk"}</option>
          <option value="workshop">{isMobile ? "Workshop" : "🎓 Workshop"}</option>
        </select>
      </div>

      {/* Desktop: side-by-side. Mobile: products only + floating cart button */}
      {isMobile ? (
        <>
          {/* Product grid mobile */}
          {filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 0", color: "#7a8ab0" }}>
              <div style={{ fontSize: 48 }}>🌸</div>
              <div style={{ fontWeight: 600, marginTop: 8 }}>Belum ada item</div>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
              {filtered.map(item => {
                const c = ITEM_COLORS[item.type];
                const bq = item.bundle_qty || 1;
                const itemVariants = bq > 1 ? variants.filter(v => v.item_id === item.id) : [];
                const hasVariants = itemVariants.length > 0;
                const totalStock = hasVariants
                  ? itemVariants.reduce((s, v) => s + (v.stock || 0), 0)
                  : (item.stock || 0);
                const bundlesLeft = item.type === "workshop" ? Infinity : Math.floor(totalStock / bq);
                const outOfStock = item.type !== "workshop" && bundlesLeft <= 0;
                return (
                  <button key={item.id} onClick={() => { if (!outOfStock) { addToCart(item); } }} disabled={outOfStock} className="tap-btn" style={{ background: outOfStock ? "#f5f5f5" : "#fff", border: `2px solid ${outOfStock ? "#e5e5e5" : c.border}`, borderRadius: 14, padding: 12, cursor: outOfStock ? "not-allowed" : "pointer", textAlign: "left", opacity: outOfStock ? 0.5 : 1, width: "100%" }}>
                    <div style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, display: "inline-block", marginBottom: 6, background: c.bg, color: c.text, fontWeight: 700 }}>{c.label}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4, lineHeight: 1.3, color: "#1a2a5e" }}>{item.name}</div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: "#ee4181" }}>{formatRp(item.price)}{bq > 1 ? <span style={{fontSize:10,fontWeight:500,color:"#7a8ab0"}}> /{bq} pcs</span> : ""}</div>
                    {item.type !== "workshop" && <div style={{ fontSize: 11, color: bundlesLeft <= 3 ? "#ef4444" : "#7a8ab0", marginTop: 3 }}>
                      {outOfStock ? "❌ Habis"
                        : bq > 1 && !hasVariants ? <span style={{color:"#f59e0b"}}>⚙️ Setup desain dulu</span>
                        : bq > 1 ? `Sisa ${bundlesLeft} bundle`
                        : `Stok: ${totalStock}`}
                    </div>}
                  </button>
                );
              })}
            </div>
          )}

          {/* Floating cart button */}
          {cart.length > 0 && (
            <button onClick={() => setShowCart(true)} className="tap-btn" style={{ position: "fixed", bottom: 82, right: 16, background: "linear-gradient(135deg,#ee4181,#2d4ba0)", color: "#fff", border: "none", borderRadius: 20, padding: "12px 20px", fontSize: 14, fontWeight: 700, boxShadow: "0 4px 20px rgba(45,75,160,0.4)", zIndex: 150, display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              🛒 {cartCount} item · {formatRp(total)}
            </button>
          )}

          {/* Cart bottom sheet */}
          {showCart && (
            <div style={{ position: "fixed", inset: 0, zIndex: 300, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
              <div onClick={() => setShowCart(false)} style={{ flex: 1, background: "rgba(0,0,0,0.4)" }} />
              <div style={{ background: "#fadeeb", borderRadius: "20px 20px 0 0", padding: 20, maxHeight: "85vh", overflowY: "auto", animation: "slideUp 0.3s ease" }}>
                <div style={{ width: 36, height: 4, background: "#d4c8e0", borderRadius: 2, margin: "0 auto 16px" }} />
                <CartPanel {...cartProps} />
              </div>
            </div>
          )}
        </>
      ) : (
        /* Desktop: 2-column */
        <div style={{ display: "grid", gridTemplateColumns: "1fr 400px", gap: 24 }}>
          <div>
            {filtered.length === 0 ? (
              <div style={{ textAlign: "center", padding: "80px 0", color: "#7a8ab0" }}>
                <div style={{ fontSize: 52 }}>🌸</div>
                <div style={{ fontSize: 16, fontWeight: 600, marginTop: 8 }}>Belum ada item</div>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(165px, 1fr))", gap: 14 }}>
                {filtered.map(item => {
                  const c = ITEM_COLORS[item.type];
                  const bq = item.bundle_qty || 1;
                  const itemVariants = bq > 1 ? variants.filter(v => v.item_id === item.id) : [];
                  const hasVariants = itemVariants.length > 0;
                  const totalStock = hasVariants
                    ? itemVariants.reduce((s, v) => s + (v.stock || 0), 0)
                    : (item.stock || 0);
                  const bundlesLeft = item.type === "workshop" ? Infinity : Math.floor(totalStock / bq);
                  const outOfStock = item.type !== "workshop" && bundlesLeft <= 0;
                  return (
                    <button key={item.id} onClick={() => !outOfStock && addToCart(item)} disabled={outOfStock} className="tap-btn" style={{ background: outOfStock ? "#f5f5f5" : "#fff", border: `2px solid ${outOfStock ? "#e5e5e5" : c.border}`, borderRadius: 16, padding: 16, cursor: outOfStock ? "not-allowed" : "pointer", textAlign: "left", opacity: outOfStock ? 0.5 : 1, boxShadow: `0 2px 10px ${c.bg}` }}>
                      <div style={{ fontSize: 11, padding: "3px 9px", borderRadius: 20, display: "inline-block", marginBottom: 8, background: c.bg, color: c.text, fontWeight: 700 }}>{c.label}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 5, lineHeight: 1.35, color: "#1a2a5e" }}>{item.name}</div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: "#ee4181" }}>{formatRp(item.price)}{bq > 1 ? <span style={{fontSize:10,fontWeight:500,color:"#7a8ab0"}}> /{bq} pcs</span> : ""}</div>
                      {item.type !== "workshop" && <div style={{ fontSize: 11, color: bundlesLeft <= 3 ? "#ef4444" : "#7a8ab0", marginTop: 5 }}>
                        {outOfStock ? "❌ Habis"
                          : bq > 1 && !hasVariants ? <span style={{color:"#f59e0b"}}>⚙️ Setup desain dulu</span>
                          : bq > 1 ? (bundlesLeft <= 3 ? `⚠️ Sisa ${bundlesLeft} bundle` : `📦 Sisa ${bundlesLeft} bundle`)
                          : `📦 Stok: ${totalStock}`}
                      </div>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div style={{ position: "sticky", top: 110 }}>
            <CartPanel {...cartProps} />
          </div>
        </div>
      )}
    </div>
  );
}


// ─── CART PANEL ───────────────────────────────────────────────────────────────
function CartPanel({ cart, cartCount, customer, setCustomer, customerPhone, setCustomerPhone, selectedEvent, setSelectedEvent, activeEvents, isMobile, subtotal, discount, setDiscount, total, payment, setPayment, checkout, saving, updateQty }) {
  return (
    <div style={{ ...CARD, padding: 18 }}>
      <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 14, color: "#1a2a5e", display: "flex", alignItems: "center", gap: 8 }}>
        🛒 Keranjang
        {cart.length > 0 && <span style={{ background: "#2d4ba0", color: "#fff", borderRadius: 20, fontSize: 11, padding: "2px 8px", fontWeight: 700 }}>{cartCount}</span>}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
        <input placeholder="👤 Nama customer" value={customer} onChange={e => setCustomer(e.target.value)} style={{ width: "100%", padding: "9px 13px", border: "1.5px solid #d4c8e0", borderRadius: 10, fontSize: 14 }} />
        <input placeholder="📱 No. HP" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} style={{ width: "100%", padding: "9px 13px", border: "1.5px solid #d4c8e0", borderRadius: 10, fontSize: 14 }} />
        <select value={selectedEvent} onChange={e => setSelectedEvent(e.target.value)}
          style={{ width: "100%", padding: "9px 13px", border: `1.5px solid ${selectedEvent ? "#a1def9" : "#d4c8e0"}`, borderRadius: 10, fontSize: 14, background: selectedEvent ? "#e4f3fd" : "#fff", color: selectedEvent ? "#2d4ba0" : "#7a8ab0" }}>
          <option value="">🎪 Pilih event (opsional)</option>
          {activeEvents.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      </div>
      {cart.length === 0 ? (
        <div style={{ textAlign: "center", padding: "24px 0", color: "#7a8ab0", fontSize: 13 }}>
          <div style={{ fontSize: 32 }}>🛍️</div>Pilih produk dulu ya!
        </div>
      ) : (
        <div style={{ marginBottom: 14, maxHeight: isMobile ? 200 : 260, overflowY: "auto" }}>
          {cart.map(item => (
            <div key={item.cartId||item.id} style={{ padding: "8px 0", borderBottom: "1px solid #d4c8e0" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#1a2a5e", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</div>
                  <div style={{ fontSize: 12, color: "#7a8ab0" }}>{formatRp(item.price)}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
                  <button onClick={() => updateQty(item.cartId||item.id, item.qty - 1)} className="tap-btn" style={{ width: 28, height: 28, border: "1.5px solid #d4c8e0", borderRadius: 8, background: "#fde8f0", cursor: "pointer", fontSize: 15, color: "#ee4181", fontWeight: 700 }}>−</button>
                  <span style={{ fontSize: 13, fontWeight: 700, minWidth: 22, textAlign: "center" }}>{item.qty}</span>
                  <button onClick={() => updateQty(item.cartId||item.id, item.qty + 1)} className="tap-btn" style={{ width: 28, height: 28, border: "1.5px solid #d4c8e0", borderRadius: 8, background: "#e4f3fd", cursor: "pointer", fontSize: 15, color: "#2d4ba0", fontWeight: 700 }}>+</button>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#ee4181", minWidth: 72, textAlign: "right", flexShrink: 0 }}>{formatRp(item.price * item.qty)}</div>
              </div>
              {item.selectedVariants?.length > 0 && (
                <div style={{ marginTop: 4, display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {Object.entries(
                    item.selectedVariants.reduce((acc, v) => ({ ...acc, [v.name]: (acc[v.name]||0)+1 }), {})
                  ).map(([name, cnt]) => (
                    <span key={name} style={{ fontSize: 10, padding: "2px 7px", borderRadius: 20, background: "#fde8f0", color: "#ee4181", fontWeight: 600 }}>
                      {name}{cnt > 1 ? ` ×${cnt}` : ""}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <div style={{ borderTop: "2px dashed #d4c8e0", paddingTop: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#7a8ab0", marginBottom: 8 }}>
          <span>Subtotal</span><span style={{ fontWeight: 600, color: "#1a2a5e" }}>{formatRp(subtotal)}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 13, color: "#7a8ab0", flex: 1 }}>🏷️ Diskon</span>
          <input type="number" value={discount} onChange={e => setDiscount(Number(e.target.value))} min={0} style={{ width: 100, padding: "6px 10px", border: "1.5px solid #d4c8e0", borderRadius: 8, fontSize: 13, textAlign: "right" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: 20, marginBottom: 14 }}>
          <span style={{ color: "#1a2a5e" }}>TOTAL</span>
          <span style={{ color: "#ee4181" }}>{formatRp(total)}</span>
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          {[["cash", "💵 Tunai"], ["qris", "📲 QRIS"]].map(([m, l]) => (
            <button key={m} onClick={() => setPayment(m)} className="tap-btn" style={{ flex: 1, padding: "11px 0", border: `2px solid ${payment === m ? "#ee4181" : "#d4c8e0"}`, borderRadius: 10, background: payment === m ? "#fde8f0" : "#fff", color: payment === m ? "#ee4181" : "#7a8ab0", fontWeight: payment === m ? 700 : 500, cursor: "pointer", fontSize: 14 }}>{l}</button>
          ))}
        </div>
        <button onClick={checkout} disabled={saving || !cart.length} className="tap-btn" style={{ width: "100%", padding: "15px 0", fontSize: 16, background: saving || !cart.length ? "#ddd" : "linear-gradient(135deg,#ee4181,#2d4ba0)", color: "#fff", border: "none", borderRadius: 12, fontWeight: 700, cursor: saving || !cart.length ? "not-allowed" : "pointer" }}>
          {saving ? "⏳ Memproses..." : "✨ Proses Pembayaran"}
        </button>
      </div>
    </div>
  );
}

// ─── INVOICE ──────────────────────────────────────────────────────────────────

// ─── INVOICE SETTINGS ────────────────────────────────────────────────────────
const INV_DEF = {
  storeName:"KURESAPI", tagline:"Art, Workshop & Merchandise",
  address:"Jakarta, Indonesia", phone:"", website:"",
  thankYou:"Terima kasih sudah berbelanja!\nSampai jumpa lagi 🌸",
  accent:"#ee4181", showLogo:true,
};
const INV_COLORS=["#ee4181","#2d4ba0","#10b981","#f59e0b","#8b5cf6","#ef4444","#0ea5e9","#1a2a5e"];
function useInvSettings(){
  const[s,setS]=useState(()=>{try{return{...INV_DEF,...JSON.parse(localStorage.getItem("kr_inv")||"{}")}}catch{return INV_DEF;}});
  const save=(p)=>{const n={...s,...p};setS(n);try{localStorage.setItem("kr_inv",JSON.stringify(n));}catch{}};
  return[s,save];
}

function InvoiceView({ invoice, onClose, isMobile }) {
  const [settings, saveSettings] = useInvSettings();
  const [showEdit, setShowEdit] = useState(false);
  const [draft, setDraft] = useState(null);
  const ac = settings.accent;
  const invoiceRef = useRef(null);
  const [savingImg, setSavingImg] = useState(false);

  const openEdit = () => { setDraft({...settings}); setShowEdit(true); };
  const applyDraft = () => { saveSettings(draft); setShowEdit(false); };
  const df = (k,v) => setDraft(d=>({...d,[k]:v}));

  // ── Print: buka jendela baru hanya dengan invoice, lalu print/save PDF ──
  const printInvoice = () => {
    const el = invoiceRef.current;
    if (!el) return;
    const win = window.open('', '_blank', 'width=560,height=820');
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
      <title>Invoice ${invoice.order_no}</title>
      <style>
        *{box-sizing:border-box;margin:0;padding:0}
        body{font-family:'Segoe UI',Tahoma,sans-serif;background:#fff;padding:20px}
        @media print{@page{margin:8mm;size:A5}body{padding:0}}
      </style>
    </head><body>${el.outerHTML}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 600);
  };

  // ── Save Image: pakai html2canvas, tangkap div invoice saja ──
  const saveAsImage = async () => {
    const el = invoiceRef.current;
    if (!el) return;
    setSavingImg(true);
    try {
      if (!window.html2canvas) {
        await new Promise((res, rej) => {
          const s = document.createElement('script');
          s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
          s.onload = res; s.onerror = rej;
          document.head.appendChild(s);
        });
      }
      const canvas = await window.html2canvas(el, {
        scale: 2, useCORS: true, backgroundColor: '#ffffff',
        logging: false,
      });
      const a = document.createElement('a');
      a.download = `Invoice-${invoice.order_no}.png`;
      a.href = canvas.toDataURL('image/png');
      a.click();
    } catch(e) { alert('Gagal simpan gambar: ' + e.message); }
    setSavingImg(false);
  };

  const LOGO_SRC = "data:image/png;base64,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";

  const orderDate = new Date(invoice.created_at || Date.now()).toLocaleString("id-ID",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"});
  const payLabel = (invoice.payment_method||invoice.payment)==="cash" ? "💵 Tunai" : "📲 QRIS";

  // ── Edit Panel ──
  if (showEdit) {
    const d = draft || settings;
    return (
      <div style={{maxWidth:480,margin:"0 auto"}}>
        <div style={{fontWeight:800,fontSize:18,marginBottom:16,color:"#1a2a5e",display:"flex",alignItems:"center",gap:10}}>
          <button onClick={()=>setShowEdit(false)} style={{background:"none",border:"none",fontSize:20,cursor:"pointer",color:"#7a8ab0"}}>←</button>
          🎨 Kustomisasi Invoice
        </div>
        <div style={{...CARD,padding:20,display:"flex",flexDirection:"column",gap:14}}>
          {[["storeName","Nama Toko","text","KURESAPI"],["tagline","Tagline","text","Art, Workshop & Merchandise"],["address","Alamat","text","Jakarta, Indonesia"],["phone","No. Telepon","text","Opsional"],["website","Website / IG","text","Opsional"]].map(([k,label,t,ph])=>(
            <div key={k}>
              <label style={{fontSize:12,color:"#7a8ab0",fontWeight:600,display:"block",marginBottom:4}}>{label}</label>
              <input type={t} placeholder={ph} value={d[k]} onChange={e=>df(k,e.target.value)}
                style={{width:"100%",padding:"10px 12px",border:"1.5px solid #d4c8e0",borderRadius:9,fontSize:14}}/>
            </div>
          ))}
          <div>
            <label style={{fontSize:12,color:"#7a8ab0",fontWeight:600,display:"block",marginBottom:4}}>Pesan Terima Kasih</label>
            <textarea rows={2} value={d.thankYou} onChange={e=>df("thankYou",e.target.value)}
              style={{width:"100%",padding:"10px 12px",border:"1.5px solid #d4c8e0",borderRadius:9,fontSize:14,resize:"vertical"}}/>
          </div>
          <div>
            <label style={{fontSize:12,color:"#7a8ab0",fontWeight:600,display:"block",marginBottom:8}}>Warna Aksen</label>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              {INV_COLORS.map(c=>(
                <button key={c} onClick={()=>df("accent",c)} className="tap-btn"
                  style={{width:34,height:34,borderRadius:"50%",background:c,border:d.accent===c?"3px solid #1a2a5e":"3px solid transparent",cursor:"pointer",flexShrink:0}}/>
              ))}
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <input type="checkbox" id="showLogo" checked={d.showLogo} onChange={e=>df("showLogo",e.target.checked)}
              style={{width:18,height:18,accentColor:d.accent,cursor:"pointer"}}/>
            <label htmlFor="showLogo" style={{fontSize:14,color:"#1a2a5e",fontWeight:600,cursor:"pointer"}}>Tampilkan logo</label>
          </div>
          <div style={{display:"flex",gap:10,marginTop:4}}>
            <button onClick={applyDraft} className="tap-btn"
              style={{flex:1,padding:"13px 0",background:`linear-gradient(135deg,${d.accent},#1a3578)`,color:"#fff",border:"none",borderRadius:12,fontWeight:700,cursor:"pointer",fontSize:15}}>
              ✅ Simpan Desain
            </button>
            <button onClick={()=>setShowEdit(false)} className="tap-btn"
              style={{padding:"13px 18px",background:"#fff",color:"#7a8ab0",border:"1.5px solid #d4c8e0",borderRadius:12,fontWeight:600,cursor:"pointer"}}>
              Batal
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Invoice View ──
  return (
    <div style={{maxWidth:480,margin:"0 auto",fontFamily:"'Segoe UI',sans-serif"}}>
      <style>{`@media print{.no-print{display:none!important}.print-area{box-shadow:none!important;border:none!important}}`}</style>

      {/* ── Receipt Card ── */}
      <div ref={invoiceRef} className="print-area" style={{background:"#fff",borderRadius:20,overflow:"hidden",boxShadow:"0 8px 40px rgba(45,75,160,0.15)",border:"1px solid #e8edf8"}}>

        {/* Header Band */}
        <div style={{background:`linear-gradient(135deg,#1a2d6e,${ac})`,padding:"24px 28px 20px",color:"#fff",textAlign:"center",position:"relative"}}>
          <div style={{position:"absolute",top:0,right:0,width:120,height:120,background:"rgba(255,255,255,0.04)",borderRadius:"0 0 0 120px"}}/>
          <div style={{position:"absolute",bottom:-1,left:0,right:0,height:20,background:"#fff",borderRadius:"50% 50% 0 0 / 20px 20px 0 0"}}/>
          {settings.showLogo && (
            <img src={LOGO_SRC} alt="logo" style={{width:56,height:56,borderRadius:14,objectFit:"contain",marginBottom:10,display:"block",margin:"0 auto 10px",mixBlendMode:"screen"}}/>
          )}
          <div style={{fontWeight:900,fontSize:22,letterSpacing:2}}>{settings.storeName}</div>
          {settings.tagline && <div style={{fontSize:12,opacity:0.8,marginTop:2,letterSpacing:0.5}}>{settings.tagline}</div>}
          <div style={{fontSize:12,opacity:0.7,marginTop:4,display:"flex",justifyContent:"center",alignItems:"center",gap:6,flexWrap:"wrap"}}>
            <span>📍 {settings.address}</span>
            {settings.phone && <><span style={{opacity:0.4}}>·</span><span>📞 {settings.phone}</span></>}
            {settings.website && <><span style={{opacity:0.4}}>·</span><span>🌐 {settings.website}</span></>}
          </div>
        </div>

        <div style={{padding:"20px 24px"}}>
          {/* Order Info */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,paddingBottom:14,borderBottom:`2px dashed ${ac}33`}}>
            <div>
              <div style={{fontSize:11,color:"#7a8ab0",fontWeight:600,marginBottom:2}}>NO. TRANSAKSI</div>
              <div style={{fontWeight:800,fontSize:16,color:"#1a2a5e",letterSpacing:0.5}}>{invoice.order_no}</div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:11,color:"#7a8ab0",fontWeight:600,marginBottom:2}}>TANGGAL</div>
              <div style={{fontSize:13,fontWeight:600,color:"#1a2a5e"}}>{orderDate}</div>
            </div>
          </div>

          {/* Customer Info */}
          <div style={{background:"#f8faff",borderRadius:12,padding:"12px 16px",marginBottom:16,borderLeft:`4px solid ${ac}`}}>
            <div style={{display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
              <div>
                <div style={{fontSize:11,color:"#7a8ab0",fontWeight:600,marginBottom:3}}>PELANGGAN</div>
                <div style={{fontWeight:700,color:"#1a2a5e",fontSize:15}}>👤 {invoice.customer_name||invoice.customer||"Umum"}</div>
                {(invoice.customer_phone||invoice.customerPhone) && (
                  <div style={{fontSize:13,color:"#7a8ab0",marginTop:2}}>📱 {invoice.customer_phone||invoice.customerPhone}</div>
                )}
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:11,color:"#7a8ab0",fontWeight:600,marginBottom:3}}>PEMBAYARAN</div>
                <div style={{background:ac,color:"#fff",borderRadius:20,padding:"4px 12px",fontSize:12,fontWeight:700,display:"inline-block"}}>{payLabel}</div>
              </div>
            </div>
          </div>

          {/* Items */}
          <div style={{marginBottom:16}}>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"#7a8ab0",fontWeight:700,marginBottom:8,paddingBottom:6,borderBottom:"1px solid #e8edf8",letterSpacing:0.5}}>
              <span>ITEM</span><span>SUBTOTAL</span>
            </div>
            {invoice.items?.map((item,i)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",padding:"8px 0",borderBottom:"1px dashed #e8edf8"}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:14,fontWeight:600,color:"#1a2a5e",marginBottom:2}}>{item.name||item.item_name}</div>
                  <div style={{fontSize:12,color:"#7a8ab0"}}>{formatRp(item.price)} × {item.qty}</div>
                </div>
                <div style={{fontWeight:700,fontSize:14,color:"#1a2a5e",marginLeft:12,flexShrink:0}}>{formatRp(item.price*item.qty)}</div>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div style={{background:"#f8faff",borderRadius:12,padding:"14px 16px",marginBottom:16}}>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:13,color:"#7a8ab0",marginBottom:6}}>
              <span>Subtotal</span><span style={{fontWeight:600,color:"#1a2a5e"}}>{formatRp(invoice.subtotal)}</span>
            </div>
            {invoice.discount>0 && (
              <div style={{display:"flex",justifyContent:"space-between",fontSize:13,color:"#ef4444",marginBottom:6}}>
                <span>🏷️ Diskon</span><span style={{fontWeight:600}}>− {formatRp(invoice.discount)}</span>
              </div>
            )}
            <div style={{height:1,background:`${ac}33`,margin:"8px 0"}}/>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontWeight:800,fontSize:16,color:"#1a2a5e"}}>TOTAL</span>
              <span style={{fontWeight:900,fontSize:22,color:ac}}>{formatRp(invoice.total)}</span>
            </div>
          </div>

          {/* Footer */}
          <div style={{textAlign:"center",padding:"14px 0 6px",borderTop:`2px dashed ${ac}33`}}>
            <div style={{fontSize:14,color:ac,fontWeight:700,marginBottom:4,whiteSpace:"pre-line"}}>{settings.thankYou}</div>
            {/* Barcode-style strip */}
            <div style={{display:"flex",justifyContent:"center",gap:1.5,margin:"12px 0 8px",opacity:0.25}}>
              {Array.from({length:38},(_,i)=>(
                <div key={i} style={{width:i%3===0?3:1.5,height:i%5===0?32:24,background:"#1a2a5e",borderRadius:1}}/>
              ))}
            </div>
            <div style={{fontSize:11,color:"#7a8ab0",letterSpacing:2,fontFamily:"monospace"}}>{invoice.order_no}</div>
          </div>
        </div>
      </div>

      {/* ── Action Buttons ── */}
      <div className="no-print" style={{display:"flex",gap:8,marginTop:14,flexWrap:"wrap"}}>
        <button onClick={printInvoice} className="tap-btn"
          style={{flex:2,padding:"13px 0",background:`linear-gradient(135deg,${ac},#1a3578)`,color:"#fff",border:"none",borderRadius:12,fontWeight:700,cursor:"pointer",fontSize:14}}>
          🖨️ Print / Save PDF
        </button>
        <button onClick={saveAsImage} disabled={savingImg} className="tap-btn"
          style={{flex:2,padding:"13px 0",background:savingImg?"#ddd":"linear-gradient(135deg,#10b981,#059669)",color:"#fff",border:"none",borderRadius:12,fontWeight:700,cursor:savingImg?"not-allowed":"pointer",fontSize:14}}>
          {savingImg ? "⏳ Menyimpan..." : "🖼️ Simpan Gambar"}
        </button>
        <button onClick={openEdit} className="tap-btn"
          style={{flex:1,padding:"13px 0",background:"#e8edf8",color:"#1a2a5e",border:"none",borderRadius:12,fontWeight:700,cursor:"pointer",fontSize:14}}>
          🎨 Desain
        </button>
        <button onClick={onClose} className="tap-btn"
          style={{flex:1,padding:"13px 0",background:"#fff",color:"#7a8ab0",border:"1.5px solid #d4c8e0",borderRadius:12,fontWeight:600,cursor:"pointer",fontSize:14}}>
          ← Kembali
        </button>
      </div>
    </div>
  );
}
// ─── INVENTORY ────────────────────────────────────────────────────────────────
// ─── INLINE CELL ─────────────────────────────────────────────────────────────
// Defined OUTSIDE Inventory so React never unmounts/remounts it on re-render
function InlineCell({ val, isDirty, isActive, onActivate, onChange, onDeactivate, type="text", width, align="left", format, selectOpts }) {
  if (isActive) {
    if (selectOpts) return (
      <select autoFocus value={val}
        onChange={e => onChange(e.target.value)}
        onBlur={onDeactivate}
        style={{ width: width||"100%", padding: "4px 6px", border: "2px solid #2d4ba0", borderRadius: 6, fontSize: 13, background: "#fff" }}>
        {selectOpts.map(([v,l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    );
    return (
      <input autoFocus type={type} value={val ?? ""}
        onChange={e => onChange(e.target.value)}
        onBlur={onDeactivate}
        onKeyDown={e => { if(e.key==="Enter"||e.key==="Escape") { e.preventDefault(); onDeactivate(); } }}
        style={{ width: width||"100%", padding: "4px 8px", border: "2px solid #2d4ba0", borderRadius: 6, fontSize: 13, textAlign: align, background: "#fff" }}
      />
    );
  }
  const displayVal = format ? format(val) : val;
  return (
    <div onClick={onActivate} title="Klik untuk edit"
      style={{ cursor: "text", padding: "4px 6px", borderRadius: 6, minHeight: 28, display: "flex", alignItems: "center",
        justifyContent: align==="right" ? "flex-end" : "flex-start",
        background: isDirty ? "#fef9c3" : "transparent",
        border: isDirty ? "1.5px dashed #f59e0b" : "1.5px solid transparent",
        transition: "background 0.15s" }}>
      {displayVal || <span style={{color:"#c8d2e0",fontSize:12}}>—</span>}
    </div>
  );
}

function Inventory({ items, variants, onRefresh, showToast, isMobile }) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing]   = useState(null);
  const [filter, setFilter]     = useState("all");
  const [form, setForm]         = useState({ name: "", type: "product", sku: "", price: "", cost: "", stock: "", unit: "pcs", bundle_qty: 1, description: "" });
  const [importing, setImporting] = useState(false);
  const [selected, setSelected]   = useState(new Set());
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const fileInputRef = useRef(null);

  // ── Variant state ────────────────────────────────────────────────────────
  const [expandedItem, setExpandedItem]   = useState(null); // item.id yg lagi dibuka
  const [variantEdits, setVariantEdits]   = useState({});   // { [variantId]: newStock }
  const [variantName, setVariantName]     = useState("");   // input nama varian baru
  const [savingVariants, setSavingVariants] = useState(false);
  const [confirmDelVariant, setConfirmDelVariant] = useState(null);

  // ── Inline edit state ────────────────────────────────────────────────────
  const [inlineEdits, setInlineEdits] = useState({});   // { [id]: { field: val, ... } }
  const [activeCell, setActiveCell]   = useState(null); // { id, field }
  const [bulkSaving, setBulkSaving]   = useState(false);

  const getVal = (item, field) =>
    inlineEdits[item.id]?.[field] !== undefined ? inlineEdits[item.id][field] : item[field];

  const setCell = (id, field, val) =>
    setInlineEdits(prev => ({ ...prev, [id]: { ...prev[id], [field]: val } }));

  const dirtyCount = Object.keys(inlineEdits).length;

  // ── Variant helpers ──────────────────────────────────────────────────────
  const getItemVariants = (itemId) => variants.filter(v => v.item_id === itemId);

  const toggleExpand = (itemId) => {
    setExpandedItem(p => p === itemId ? null : itemId);
    setVariantEdits({});
    setVariantName("");
  };

  const addVariant = async (itemId) => {
    const name = variantName.trim();
    if (!name) return;
    try {
      await api("kr_item_variants", { method: "POST", body: JSON.stringify({ item_id: itemId, name, stock: 0 }), prefer: "return=minimal" });
      setVariantName("");
      onRefresh();
    } catch (e) { showToast("Error: " + e.message, "error"); }
  };

  const deleteVariant = async (v) => {
    try {
      await api(`kr_item_variants?id=eq.${v.id}`, { method: "DELETE", prefer: "return=minimal" });
      setConfirmDelVariant(null);
      onRefresh();
    } catch (e) { showToast("Error: " + e.message, "error"); }
  };

  const saveVariantStocks = async (itemId) => {
    if (!Object.keys(variantEdits).length) return;
    setSavingVariants(true);
    let ok = 0;
    for (const [vid, stock] of Object.entries(variantEdits)) {
      try {
        await api(`kr_item_variants?id=eq.${vid}`, { method: "PATCH", body: JSON.stringify({ stock: Number(stock) || 0 }), prefer: "return=minimal" });
        ok++;
      } catch {}
    }
    // Update item.stock = total variants
    const itemVars = getItemVariants(itemId);
    const newTotal = itemVars.reduce((s, v) => s + (Number(variantEdits[v.id] ?? v.stock) || 0), 0);
    await api(`kr_items?id=eq.${itemId}`, { method: "PATCH", body: JSON.stringify({ stock: newTotal }), prefer: "return=minimal" });
    setVariantEdits({});
    setSavingVariants(false);
    onRefresh();
    showToast(`✅ ${ok} desain diperbarui!`);
  };

  const bulkSave = async () => {
    if (!dirtyCount) return;
    setBulkSaving(true);
    let ok = 0, fail = 0;
    for (const [id, changes] of Object.entries(inlineEdits)) {
      const orig = items.find(i => i.id === id);
      if (!orig) continue;
      const payload = {
        ...orig,
        ...changes,
        price:      Number(changes.price      ?? orig.price)      || 0,
        cost:       Number(changes.cost       ?? orig.cost)       || 0,
        stock:      Number(changes.stock      ?? orig.stock)      || 0,
        bundle_qty: Number(changes.bundle_qty ?? orig.bundle_qty) || 1,
      };
      try {
        await api(`kr_items?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(payload), prefer: "return=minimal" });
        ok++;
      } catch { fail++; }
    }
    setInlineEdits({});
    setActiveCell(null);
    onRefresh();
    setBulkSaving(false);
    showToast(fail ? `⚠️ ${ok} tersimpan, ${fail} gagal` : `✅ ${ok} item berhasil diperbarui!`);
  };

  const discardEdits = () => { setInlineEdits({}); setActiveCell(null); };

  // ── Detail form save ─────────────────────────────────────────────────────
  const openNew  = () => { setForm({ name: "", type: "product", sku: "", price: "", cost: "", stock: "", unit: "pcs", bundle_qty: 1, description: "" }); setEditing(null); setShowForm(true); };
  const openEdit = (item) => { setForm({ ...item, price: item.price||"", cost: item.cost||"", stock: item.stock||"", bundle_qty: item.bundle_qty||1 }); setEditing(item.id); setShowForm(true); };

  const save = async () => {
    if (!form.name.trim()) return showToast("Nama wajib diisi", "error");
    try {
      const payload = { ...form, price: Number(form.price)||0, cost: Number(form.cost)||0, stock: Number(form.stock)||0, bundle_qty: Number(form.bundle_qty)||1 };
      if (editing) {
        await api(`kr_items?id=eq.${editing}`, { method: "PATCH", body: JSON.stringify(payload), prefer: "return=minimal" });
        showToast("✅ Item diperbarui!");
      } else {
        await api("kr_items", { method: "POST", body: JSON.stringify(payload), prefer: "return=minimal" });
        showToast("✨ Item ditambahkan!");
      }
      setShowForm(false); onRefresh();
    } catch (e) { showToast("Error: " + e.message, "error"); }
  };

  // ── Delete ───────────────────────────────────────────────────────────────
  const deleteItem = async (item) => {
    try {
      await api(`kr_items?id=eq.${item.id}`, { method: "DELETE", prefer: "return=minimal" });
      showToast("🗑️ Item dihapus permanen!"); setConfirmDelete(null); onRefresh();
    } catch (e) { showToast("Error: " + e.message, "error"); }
  };

  // ── Bulk delete ──────────────────────────────────────────────────────────
  const toggleSelect    = (id) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleSelectAll = () => { if (selected.size === filtered.length) setSelected(new Set()); else setSelected(new Set(filtered.map(i => i.id))); };
  const bulkDelete = async () => {
    let ok = 0;
    for (const id of selected) { try { await api(`kr_items?id=eq.${id}`, { method: "DELETE", prefer: "return=minimal" }); ok++; } catch {} }
    setSelected(new Set()); setConfirmBulk(false); onRefresh(); showToast(`🗑️ ${ok} item dihapus!`);
  };

  // ── Export ───────────────────────────────────────────────────────────────
  const exportExcel = () => {
    const headers = ["Nama","Tipe","SKU","Harga Modal","Harga Jual","Stok","Satuan","Keterangan"];
    const rows = items.map(i => [i.name,i.type,i.sku||"",i.cost,i.price,i.stock,i.unit,i.description||""]);
    const csv = [headers,...rows].map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8;"});
    const a = document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=`KURESAPI_Inventory_${new Date().toISOString().slice(0,10)}.csv`; a.click();
    showToast("📥 Export CSV berhasil!");
  };

  // ── Import ───────────────────────────────────────────────────────────────
  const handleImportFile = async (e) => {
    const file = e.target.files[0]; if (!file) return; e.target.value = ""; setImporting(true);
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter(l=>l.trim());
      if (lines.length < 2) { showToast("File kosong!","error"); setImporting(false); return; }
      const parseRow = (line) => { const cols=[]; let cur=""; let inQ=false; for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(inQ&&line[i+1]==='"'){cur+='"';i++;}else inQ=!inQ;}else if(c===','&&!inQ){cols.push(cur.trim());cur="";}else cur+=c;}cols.push(cur.trim());return cols;};
      const headers = parseRow(lines[0]).map(h=>h.toLowerCase().replace(/\s/g,""));
      const idx = (keys) => { for(const k of keys){const i=headers.indexOf(k.toLowerCase().replace(/\s/g,""));if(i>=0)return i;}return -1;};
      const iNama=idx(["nama","name"]),iTipe=idx(["tipe","type","kategori"]),iSKU=idx(["sku","kode"]),iHarga=idx(["hargajual","price","harga"]),iModal=idx(["hargamodal","cost","modal"]),iStok=idx(["stok","stock"]),iSatuan=idx(["satuan","unit"]),iKet=idx(["keterangan","description"]);
      if(iNama<0){showToast("Kolom 'Nama' tidak ditemukan!","error");setImporting(false);return;}
      const toImport=lines.slice(1).map(l=>parseRow(l)).filter(c=>c[iNama]?.trim()).map(cols=>{const t=(cols[iTipe]||"product").toLowerCase();return{name:cols[iNama]||"",type:t.includes("workshop")?"workshop":t.includes("equipment")||t.includes("perlengkapan")?"equipment":"product",sku:cols[iSKU]||"",price:Number(cols[iHarga])||0,cost:Number(cols[iModal])||0,stock:Number(cols[iStok])||0,unit:cols[iSatuan]||"pcs",description:cols[iKet]||"",is_active:true};});
      if(!toImport.length){showToast("Tidak ada data valid!","error");setImporting(false);return;}
      let success=0,fail=0;
      for(const item of toImport){try{await api("kr_items",{method:"POST",body:JSON.stringify(item),prefer:"return=minimal"});success++;}catch{fail++;}}
      onRefresh(); showToast(`✨ Import selesai! ${success} berhasil${fail>0?`, ${fail} gagal`:""}`);
    } catch(err){showToast("Gagal import: "+err.message,"error");}
    setImporting(false);
  };

  const getEffectiveStock = (item) => {
    if ((item.bundle_qty || 1) <= 1) return item.stock || 0; // item biasa, pakai stok langsung
    const iv = getItemVariants(item.id);
    return iv.length > 0 ? iv.reduce((s, v) => s + (v.stock || 0), 0) : (item.stock || 0);
  };

  const filtered = items.filter(i => {
    const bq = i.bundle_qty || 1;
    const bundles = (i.type === "workshop" || i.type === "equipment") ? Infinity : Math.floor(getEffectiveStock(i) / bq);
    if (filter === "low")  return i.type === "product" && bundles > 0 && bundles <= 3;
    if (filter === "out")  return i.type === "product" && bundles <= 0;
    return filter === "all" || i.type === filter;
  });
  const stats = {
    all:       items.length,
    product:   items.filter(x=>x.type==="product").length,
    workshop:  items.filter(x=>x.type==="workshop").length,
    equipment: items.filter(x=>x.type==="equipment").length,
    low: items.filter(x=>{ const bq=x.bundle_qty||1; const b=Math.floor(getEffectiveStock(x)/bq); return x.type==="product"&&b>0&&b<=3; }).length,
    out: items.filter(x=>{ const bq=x.bundle_qty||1; return x.type==="product"&&Math.floor(getEffectiveStock(x)/bq)<=0; }).length,
  };


  // ── Detail form ──────────────────────────────────────────────────────────────
  if (showForm) return (
    <div style={{ maxWidth: 540 }}>
      <div style={{ fontWeight: 800, fontSize: isMobile?17:20, marginBottom: 18, color: "#1a2a5e" }}>{editing ? "✏️ Edit Item" : "✨ Tambah Item Baru"}</div>
      <div style={{ ...CARD, padding: isMobile?18:28, display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <label style={{ fontSize: 13, color: "#7a8ab0", display: "block", marginBottom: 7, fontWeight: 600 }}>Tipe Item *</label>
          <div style={{ display: "flex", gap: 7 }}>
            {[["product","📦 Produk"],["workshop","🎓 Workshop"],["equipment","🔧 Perlengkapan"]].map(([v,l]) => {
              const c = ITEM_COLORS[v];
              return <button key={v} onClick={() => setForm(f=>({...f,type:v}))} className="tap-btn" style={{ flex:1,padding:"10px 0",border:`2px solid ${form.type===v?c.text:"#d4c8e0"}`,borderRadius:10,background:form.type===v?c.bg:"#fff",color:form.type===v?c.text:"#7a8ab0",fontWeight:form.type===v?700:500,cursor:"pointer",fontSize:isMobile?11:12 }}>{l}</button>;
            })}
          </div>
        </div>
        {[["name","Nama *","text","Nama produk / workshop..."],["sku","SKU / Kode","text","Opsional"],["unit","Satuan","text","pcs, lembar, slot, dll"],["price","💰 Harga Jual (Rp) *","number","0"],["cost","📉 Harga Modal (Rp)","number","0"],["stock","📦 Stok Awal (pcs fisik)","number","0"]].map(([k,l,t,ph]) => (
          <div key={k}>
            <label style={{ fontSize:13,color:"#7a8ab0",display:"block",marginBottom:5,fontWeight:600 }}>{l}</label>
            <input type={t} placeholder={ph} value={form[k]} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))} style={{ width:"100%",padding:"11px 13px",border:"1.5px solid #d4c8e0",borderRadius:10,fontSize:15 }} />
          </div>
        ))}
        <div style={{ background:"#fef9c3",border:"1.5px solid #f59e0b",borderRadius:10,padding:"12px 14px" }}>
          <label style={{ fontSize:13,color:"#92400e",display:"block",marginBottom:5,fontWeight:700 }}>📦 Bundle — Jual per berapa pcs?</label>
          <div style={{ display:"flex",alignItems:"center",gap:10 }}>
            <input type="number" min={1} placeholder="1" value={form.bundle_qty} onChange={e=>setForm(f=>({...f,bundle_qty:e.target.value}))}
              style={{ width:80,padding:"10px 12px",border:"1.5px solid #f59e0b",borderRadius:9,fontSize:15,fontWeight:700,textAlign:"center" }} />
            <span style={{ fontSize:13,color:"#92400e" }}>
              {Number(form.bundle_qty)>1
                ? `pcs → 1x klik kasir = ${form.bundle_qty} pcs fisik berkurang`
                : "pcs (satuan normal, tidak bundle)"}
            </span>
          </div>
          {Number(form.bundle_qty)>1 && Number(form.stock)>0 && (
            <div style={{ marginTop:8,fontSize:12,color:"#92400e" }}>
              💡 Stok {form.stock} pcs fisik = <b>{Math.floor(Number(form.stock)/Number(form.bundle_qty))} bundle</b> yang bisa dijual
            </div>
          )}
        </div>
        <div>
          <label style={{ fontSize:13,color:"#7a8ab0",display:"block",marginBottom:5,fontWeight:600 }}>Keterangan</label>
          <textarea rows={2} placeholder="Deskripsi opsional..." value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} style={{ width:"100%",padding:"11px 13px",border:"1.5px solid #d4c8e0",borderRadius:10,fontSize:14,resize:"vertical" }} />
        </div>
        <div style={{ display:"flex",gap:10 }}>
          <button onClick={save} className="tap-btn" style={{ flex:1,padding:"14px 0",background:"linear-gradient(135deg,#ee4181,#2d4ba0)",color:"#fff",border:"none",borderRadius:12,fontWeight:700,cursor:"pointer",fontSize:15 }}>{editing?"💾 Simpan":"✨ Tambah"}</button>
          <button onClick={()=>setShowForm(false)} className="tap-btn" style={{ flex:1,padding:"14px 0",background:"#fff",color:"#1a2a5e",border:"1.5px solid #d4c8e0",borderRadius:12,fontWeight:600,cursor:"pointer",fontSize:15 }}>Batal</button>
        </div>
      </div>
    </div>
  );

  return (
    <div>
      {confirmDelete && <ConfirmModal title="Hapus Item?" message={`Hapus "${confirmDelete.name}" secara permanen?`} onConfirm={()=>deleteItem(confirmDelete)} onCancel={()=>setConfirmDelete(null)} />}
      {confirmBulk  && <ConfirmModal title={`Hapus ${selected.size} Item?`} message={`Hapus ${selected.size} item yang dipilih secara permanen?`} onConfirm={bulkDelete} onCancel={()=>setConfirmBulk(false)} />}
      {confirmDelVariant && <ConfirmModal title="Hapus Desain?" message={`Hapus desain "${confirmDelVariant.name}"?`} onConfirm={()=>deleteVariant(confirmDelVariant)} onCancel={()=>setConfirmDelVariant(null)} />}

      {/* ── Bulk SAVE bar ── */}
      {dirtyCount > 0 && (
        <div style={{ ...CARD, padding: "11px 16px", marginBottom: 12, background: "linear-gradient(135deg,#fef9c3,#fefce8)", border: "2px solid #f59e0b", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: "#92400e", flex: 1 }}>
            ✏️ {dirtyCount} item memiliki perubahan yang belum disimpan
          </span>
          <button onClick={bulkSave} disabled={bulkSaving} className="tap-btn"
            style={{ padding: "8px 18px", background: bulkSaving?"#ddd":"linear-gradient(135deg,#10b981,#059669)", color: "#fff", border: "none", borderRadius: 10, fontWeight: 700, cursor: bulkSaving?"not-allowed":"pointer", fontSize: 13 }}>
            {bulkSaving ? "⏳ Menyimpan..." : `💾 Simpan ${dirtyCount} Perubahan`}
          </button>
          <button onClick={discardEdits} className="tap-btn"
            style={{ padding: "8px 14px", background: "#fff", color: "#7a8ab0", border: "1.5px solid #d4c8e0", borderRadius: 10, fontWeight: 600, cursor: "pointer", fontSize: 13 }}>
            ✕ Batalkan
          </button>
        </div>
      )}

      {/* ── Bulk DELETE bar ── */}
      {selected.size > 0 && (
        <div style={{ ...CARD, padding: "10px 16px", marginBottom: 12, background: "#fde8f0", border: "1.5px solid #f5a8c4", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#ee4181" }}>✓ {selected.size} item dipilih</span>
          <button onClick={()=>setConfirmBulk(true)} className="tap-btn" style={{ padding:"6px 14px",background:"#ef4444",color:"#fff",border:"none",borderRadius:8,fontWeight:700,cursor:"pointer",fontSize:13 }}>🗑️ Hapus Terpilih</button>
          <button onClick={()=>setSelected(new Set())} className="tap-btn" style={{ padding:"6px 12px",background:"#fff",color:"#7a8ab0",border:"1.5px solid #d4c8e0",borderRadius:8,fontWeight:600,cursor:"pointer",fontSize:13 }}>Batal</button>
        </div>
      )}

      {/* ── Toolbar ── */}
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,gap:8,flexWrap:"wrap" }}>
        <div style={{ display:"flex",gap:6,overflowX:"auto",paddingBottom:4,flex:1 }}>
          {[["all","Semua"],["product","Produk"],["workshop","Workshop"],["equipment","Perlengkapan"],["low","⚠️ Hampir Habis"],["out","❌ Habis"]].map(([v,l]) => (
            <button key={v} onClick={()=>setFilter(v)} className="tap-btn" style={{ padding:"7px 12px",borderRadius:20,border:`2px solid ${filter===v?(v==="out"?"#ef4444":v==="low"?"#f59e0b":"#ee4181"):"#d4c8e0"}`,background:filter===v?(v==="out"?"#fee2e2":v==="low"?"#fef9c3":"#fde8f0"):"#fff",color:filter===v?(v==="out"?"#ef4444":v==="low"?"#92400e":"#ee4181"):"#7a8ab0",fontWeight:filter===v?700:500,cursor:"pointer",fontSize:12,whiteSpace:"nowrap",flexShrink:0 }}>
              {l} <span style={{opacity:0.7}}>({stats[v]||0})</span>
            </button>
          ))}
        </div>
        <button onClick={openNew} className="tap-btn" style={{ padding:"9px 14px",background:"linear-gradient(135deg,#ee4181,#2d4ba0)",color:"#fff",border:"none",borderRadius:12,fontWeight:700,cursor:"pointer",fontSize:13,flexShrink:0 }}>+ Tambah</button>
        <button onClick={exportExcel} className="tap-btn" style={{ padding:"9px 14px",background:"#e4f3fd",color:"#2d4ba0",border:"1.5px solid #a1def9",borderRadius:12,fontWeight:600,cursor:"pointer",fontSize:13,flexShrink:0 }}>📥 Export</button>
        <button onClick={()=>fileInputRef.current?.click()} disabled={importing} className="tap-btn" style={{ padding:"9px 14px",background:"#fde8f0",color:"#ee4181",border:"1.5px solid #f5a8c4",borderRadius:12,fontWeight:600,cursor:importing?"not-allowed":"pointer",fontSize:13,flexShrink:0 }}>
          {importing?"⏳ Import...":"📤 Import CSV"}
        </button>
        <input ref={fileInputRef} type="file" accept=".csv" onChange={handleImportFile} style={{display:"none"}} />
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign:"center",padding:"60px 0",color:"#7a8ab0" }}>
          <div style={{fontSize:48}}>🌸</div>
          <div style={{fontWeight:700,marginTop:8}}>Belum ada item</div>
          <button onClick={openNew} className="tap-btn" style={{ marginTop:12,padding:"11px 22px",background:"linear-gradient(135deg,#ee4181,#2d4ba0)",color:"#fff",border:"none",borderRadius:12,fontWeight:700,cursor:"pointer" }}>Tambah Sekarang</button>
        </div>
      ) : isMobile ? (
        /* ── Mobile: card list ── */
        <div style={{ display:"flex",flexDirection:"column",gap:10 }}>
          {filtered.map(item => {
            const c = ITEM_COLORS[item.type];
            const isSelected = selected.has(item.id);
            const isDirtyRow = !!inlineEdits[item.id];
            return (
              <div key={item.id} style={{ ...CARD,padding:14,border:`1.5px solid ${isDirtyRow?"#f59e0b":isSelected?"#ee4181":"#d0e5f5"}`,background:isDirtyRow?"#fef9c3":isSelected?"#fde8f0":"#fff" }}>
                <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8 }}>
                  <div style={{ display:"flex",alignItems:"flex-start",gap:10,flex:1 }}>
                    <input type="checkbox" checked={isSelected} onChange={()=>toggleSelect(item.id)} style={{ width:18,height:18,marginTop:2,accentColor:"#ee4181",cursor:"pointer",flexShrink:0 }} />
                    <div style={{flex:1}}>
                      <div style={{ fontSize:15,fontWeight:700,color:"#1a2a5e",marginBottom:4 }}>{item.name}</div>
                      <span style={{ fontSize:11,padding:"3px 9px",borderRadius:20,background:c.bg,color:c.text,fontWeight:700 }}>{c.label}</span>
                    </div>
                  </div>
                  <div style={{ display:"flex",gap:6 }}>
                    <button onClick={()=>openEdit(item)} className="tap-btn" style={{ padding:"6px 12px",background:"#e4f3fd",color:"#2d4ba0",border:"none",borderRadius:8,cursor:"pointer",fontSize:12,fontWeight:600 }}>✏️ Detail</button>
                    <button onClick={()=>setConfirmDelete(item)} className="tap-btn" style={{ padding:"6px 10px",background:"#fee2e2",color:"#ef4444",border:"none",borderRadius:8,cursor:"pointer",fontSize:12 }}>🗑️</button>
                  </div>
                </div>
                {/* Mobile inline fields */}
                <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,fontSize:13 }}>
                  <div>
                    <div style={{fontSize:11,color:"#7a8ab0",marginBottom:3}}>💰 Harga Jual</div>
                    <InlineCell val={getVal(item,"price")} isDirty={!!inlineEdits[item.id]?.price} isActive={activeCell?.id===item.id&&activeCell?.field==="price"} onActivate={()=>setActiveCell({id:item.id,field:"price"})} onChange={v=>setCell(item.id,"price",v)} onDeactivate={()=>setActiveCell(null)} type="number" align="left" format={v=>formatRp(Number(v)||0)} />
                  </div>
                  <div>
                    <div style={{fontSize:11,color:"#7a8ab0",marginBottom:3}}>📉 Modal</div>
                    <InlineCell val={getVal(item,"cost")} isDirty={!!inlineEdits[item.id]?.cost} isActive={activeCell?.id===item.id&&activeCell?.field==="cost"} onActivate={()=>setActiveCell({id:item.id,field:"cost"})} onChange={v=>setCell(item.id,"cost",v)} onDeactivate={()=>setActiveCell(null)} type="number" align="left" format={v=>formatRp(Number(v)||0)} />
                  </div>
                  {item.type !== "workshop" && (
                    <div>
                      <div style={{fontSize:11,color:"#7a8ab0",marginBottom:3}}>📦 Stok</div>
                      <InlineCell val={getVal(item,"stock")} isDirty={!!inlineEdits[item.id]?.stock} isActive={activeCell?.id===item.id&&activeCell?.field==="stock"} onActivate={()=>setActiveCell({id:item.id,field:"stock"})} onChange={v=>setCell(item.id,"stock",v)} onDeactivate={()=>setActiveCell(null)} type="number" />
                    </div>
                  )}
                  <div>
                    <div style={{fontSize:11,color:"#7a8ab0",marginBottom:3}}>SKU</div>
                    <InlineCell val={getVal(item,"sku")} isDirty={!!inlineEdits[item.id]?.sku} isActive={activeCell?.id===item.id&&activeCell?.field==="sku"} onActivate={()=>setActiveCell({id:item.id,field:"sku"})} onChange={v=>setCell(item.id,"sku",v)} onDeactivate={()=>setActiveCell(null)} />
                  </div>
                </div>
                {isDirtyRow && (
                  <div style={{ marginTop:8,fontSize:11,color:"#92400e",fontWeight:600 }}>
                    ✏️ Ada perubahan — simpan via tombol di atas
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        /* ── Desktop: inline-editable table ── */
        <div style={{ ...CARD, overflow: "auto" }}>
          <div style={{ fontSize:12,color:"#7a8ab0",padding:"8px 14px 4px",display:"flex",alignItems:"center",gap:6 }}>
            <span style={{background:"#fef9c3",border:"1px solid #f59e0b",borderRadius:4,padding:"2px 8px",color:"#92400e",fontWeight:600}}>✏️ Klik sel untuk edit langsung</span>
            <span>· Tombol Detail untuk edit lengkap</span>
          </div>
          <table style={{ width:"100%",borderCollapse:"collapse" }}>
            <thead>
              <tr style={{ background:"linear-gradient(135deg,#e4f3fd,#fadeeb)" }}>
                <th style={{ padding:"12px 14px",width:40 }}>
                  <input type="checkbox" checked={filtered.length>0&&selected.size===filtered.length} onChange={toggleSelectAll} style={{ width:16,height:16,accentColor:"#ee4181",cursor:"pointer" }} />
                </th>
                {[
                  { label:"Nama",      w:200 },
                  { label:"Tipe",      w:120 },
                  { label:"SKU",       w:100 },
                  { label:"Satuan",    w:80  },
                  { label:"Bundle",    w:90  },
                  { label:"Harga Jual",w:120 },
                  { label:"Modal",     w:110 },
                  { label:"Stok (pcs)",w:100 },
                  { label:"Sisa Bundle",w:100},
                  { label:"Aksi",      w:130 },
                ].map(({ label, w }) => (
                  <th key={label} style={{ padding:"12px 8px",textAlign:"left",fontSize:12,color:"#1a2a5e",fontWeight:700,borderBottom:"2px solid #d4c8e0",minWidth:w }}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => {
                const c         = ITEM_COLORS[item.type];
                const isSelected = selected.has(item.id);
                const isDirtyRow = !!inlineEdits[item.id];
                const curType   = getVal(item, "type");
                return (
                  <React.Fragment key={item.id}>
                  <tr style={{ borderBottom:"1px solid #d4c8e0", background: isDirtyRow?"#fefce8":isSelected?"#fde8f0":"transparent" }}>
                    <td style={{ padding:"6px 14px" }}>
                      <input type="checkbox" checked={isSelected} onChange={()=>toggleSelect(item.id)} style={{ width:16,height:16,accentColor:"#ee4181",cursor:"pointer" }} />
                    </td>

                    {/* Nama */}
                    <td style={{ padding:"4px 8px",fontSize:14,fontWeight:600 }}>
                      <InlineCell val={getVal(item,"name")} isDirty={!!inlineEdits[item.id]?.name} isActive={activeCell?.id===item.id&&activeCell?.field==="name"} onActivate={()=>setActiveCell({id:item.id,field:"name"})} onChange={v=>setCell(item.id,"name",v)} onDeactivate={()=>setActiveCell(null)} width={180} />
                    </td>

                    {/* Tipe */}
                    <td style={{ padding:"4px 8px" }}>
                      <InlineCell val={getVal(item,"type")} isDirty={!!inlineEdits[item.id]?.type} isActive={activeCell?.id===item.id&&activeCell?.field==="type"} onActivate={()=>setActiveCell({id:item.id,field:"type"})} onChange={v=>setCell(item.id,"type",v)} onDeactivate={()=>setActiveCell(null)}
                        selectOpts={[["product","📦 Produk"],["workshop","🎓 Workshop"],["equipment","🔧 Perlengkapan"]]}
                        format={v => { const col=ITEM_COLORS[v]||ITEM_COLORS.product; return <span style={{fontSize:11,padding:"3px 9px",borderRadius:20,background:col.bg,color:col.text,fontWeight:700}}>{col.label}</span>; }}
                      />
                    </td>

                    {/* SKU */}
                    <td style={{ padding:"4px 8px",fontSize:13,color:"#7a8ab0" }}>
                      <InlineCell val={getVal(item,"sku")} isDirty={!!inlineEdits[item.id]?.sku} isActive={activeCell?.id===item.id&&activeCell?.field==="sku"} onActivate={()=>setActiveCell({id:item.id,field:"sku"})} onChange={v=>setCell(item.id,"sku",v)} onDeactivate={()=>setActiveCell(null)} width={90} />
                    </td>

                    {/* Satuan */}
                    <td style={{ padding:"4px 8px",fontSize:13 }}>
                      <InlineCell val={getVal(item,"unit")} isDirty={!!inlineEdits[item.id]?.unit} isActive={activeCell?.id===item.id&&activeCell?.field==="unit"} onActivate={()=>setActiveCell({id:item.id,field:"unit"})} onChange={v=>setCell(item.id,"unit",v)} onDeactivate={()=>setActiveCell(null)} width={70} />
                    </td>

                    {/* Bundle — hanya produk yg bundle_qty > 1 */}
                    <td style={{ padding:"4px 8px" }}>
                      {curType !== "product"
                        ? <span style={{color:"#d4c8e0",fontSize:12,paddingLeft:6}}>—</span>
                        : <InlineCell val={getVal(item,"bundle_qty")||1} isDirty={!!inlineEdits[item.id]?.bundle_qty} isActive={activeCell?.id===item.id&&activeCell?.field==="bundle_qty"} onActivate={()=>setActiveCell({id:item.id,field:"bundle_qty"})} onChange={v=>setCell(item.id,"bundle_qty",v)} onDeactivate={()=>setActiveCell(null)} type="number" align="center" width={70}
                            format={v => {
                              const n = Number(v)||1;
                              return n > 1
                                ? <span style={{background:"#fef9c3",border:"1px solid #f59e0b",borderRadius:6,padding:"2px 7px",fontSize:11,fontWeight:700,color:"#92400e"}}>{n} pcs</span>
                                : <span style={{color:"#c8d2e0",fontSize:12}}>—</span>;
                            }}
                          />
                      }
                    </td>

                    {/* Harga Jual */}
                    <td style={{ padding:"4px 8px" }}>
                      <InlineCell val={getVal(item,"price")} isDirty={!!inlineEdits[item.id]?.price} isActive={activeCell?.id===item.id&&activeCell?.field==="price"} onActivate={()=>setActiveCell({id:item.id,field:"price"})} onChange={v=>setCell(item.id,"price",v)} onDeactivate={()=>setActiveCell(null)} type="number" align="right" width={110}
                        format={v => <span style={{fontWeight:700,color:"#ee4181"}}>{formatRp(Number(v)||0)}</span>}
                      />
                    </td>

                    {/* Modal */}
                    <td style={{ padding:"4px 8px" }}>
                      <InlineCell val={getVal(item,"cost")} isDirty={!!inlineEdits[item.id]?.cost} isActive={activeCell?.id===item.id&&activeCell?.field==="cost"} onActivate={()=>setActiveCell({id:item.id,field:"cost"})} onChange={v=>setCell(item.id,"cost",v)} onDeactivate={()=>setActiveCell(null)} type="number" align="right" width={100}
                        format={v => <span style={{color:"#7a8ab0"}}>{formatRp(Number(v)||0)}</span>}
                      />
                    </td>

                    {/* Stok pcs */}
                    <td style={{ padding:"4px 8px" }}>
                      {curType === "workshop"
                        ? <span style={{color:"#d4c8e0",fontSize:13,paddingLeft:6}}>—</span>
                        : <InlineCell val={getVal(item,"stock")} isDirty={!!inlineEdits[item.id]?.stock} isActive={activeCell?.id===item.id&&activeCell?.field==="stock"} onActivate={()=>setActiveCell({id:item.id,field:"stock"})} onChange={v=>setCell(item.id,"stock",v)} onDeactivate={()=>setActiveCell(null)} type="number" align="right" width={80}
                            format={v => {
                              const n = Number(v)||0;
                              const bq = Number(getVal(item,"bundle_qty"))||1;
                              // equipment: plain number, no color warning
                              if (curType === "equipment") return <span style={{fontWeight:600,color:"#1a2a5e"}}>{n}</span>;
                              const low = n < bq;
                              return <span style={{fontWeight:700,color:low?"#ef4444":n<=(bq*3)?"#f59e0b":"#10b981"}}>{n} pcs</span>;
                            }}
                          />
                      }
                    </td>

                    {/* Sisa Bundle — hanya produk */}
                    <td style={{ padding:"4px 8px",textAlign:"center" }}>
                      {curType !== "product"
                        ? <span style={{color:"#d4c8e0",fontSize:12}}>—</span>
                        : (() => {
                            const bq   = Number(getVal(item,"bundle_qty"))||1;
                            if (bq <= 1) return <span style={{color:"#d4c8e0",fontSize:12}}>—</span>;
                            const stok = getEffectiveStock(item);
                            const sisa = Math.floor(stok / bq);
                            const hasV = getItemVariants(item.id).length > 0;
                            return (
                              <div style={{display:"flex",alignItems:"center",gap:4,justifyContent:"center"}}>
                                {sisa <= 0
                                  ? <span style={{background:"#fee2e2",color:"#ef4444",borderRadius:6,padding:"3px 8px",fontSize:11,fontWeight:700}}>❌ Habis</span>
                                  : sisa <= 3
                                  ? <span style={{background:"#fef9c3",color:"#92400e",borderRadius:6,padding:"3px 8px",fontSize:11,fontWeight:700}}>⚠️ {sisa}</span>
                                  : <span style={{background:"#d1fae5",color:"#10b981",borderRadius:6,padding:"3px 8px",fontSize:11,fontWeight:700}}>✅ {sisa}</span>
                                }
                                {hasV && <span style={{fontSize:10,color:"#7a8ab0"}}>/{stok}pcs</span>}
                              </div>
                            );
                          })()
                      }
                    </td>

                    {/* Aksi */}
                    <td style={{ padding:"6px 8px" }}>
                      <div style={{ display:"flex",gap:5 }}>
                        {curType === "product" && (
                          <button onClick={()=>toggleExpand(item.id)} className="tap-btn"
                            style={{ padding:"5px 9px",background:expandedItem===item.id?"#fef9c3":"#f8faff",color:expandedItem===item.id?"#92400e":"#7a8ab0",border:`1.5px solid ${expandedItem===item.id?"#f59e0b":"#d4c8e0"}`,borderRadius:8,cursor:"pointer",fontSize:12,fontWeight:600 }}>
                            🎨 {getItemVariants(item.id).length > 0 ? getItemVariants(item.id).length : "+"}
                          </button>
                        )}
                        <button onClick={()=>openEdit(item)} className="tap-btn" style={{ padding:"5px 10px",background:"#e4f3fd",color:"#2d4ba0",border:"none",borderRadius:8,cursor:"pointer",fontSize:12,fontWeight:600,whiteSpace:"nowrap" }}>✏️</button>
                        <button onClick={()=>setConfirmDelete(item)} className="tap-btn" style={{ padding:"5px 9px",background:"#fee2e2",color:"#ef4444",border:"none",borderRadius:8,cursor:"pointer",fontSize:12 }}>🗑️</button>
                      </div>
                    </td>
                  </tr>

                  {/* ── Variant Panel (expanded row) ── */}
                  {expandedItem === item.id && (
                    <tr key={item.id + "-variants"}>
                      <td colSpan={10} style={{ padding:"0 14px 14px 48px", background:"#fffbeb" }}>
                        <div style={{ borderLeft:"3px solid #f59e0b",paddingLeft:16,paddingTop:12 }}>
                          <div style={{ fontWeight:700,fontSize:13,color:"#92400e",marginBottom:10 }}>
                            🎨 Desain untuk <b>{item.name}</b>
                            <span style={{ fontSize:11,fontWeight:500,color:"#7a8ab0",marginLeft:8 }}>
                              — update sisa stok per desain abis event
                            </span>
                          </div>

                          {/* Variant list */}
                          <div style={{ display:"flex",flexWrap:"wrap",gap:8,marginBottom:12 }}>
                            {getItemVariants(item.id).map(v => {
                              const editVal = variantEdits[v.id];
                              const isDirty = editVal !== undefined;
                              const curStock = isDirty ? editVal : v.stock;
                              return (
                                <div key={v.id} style={{ background:"#fff",border:`2px solid ${isDirty?"#f59e0b":"#e8edf8"}`,borderRadius:10,padding:"8px 10px",display:"flex",alignItems:"center",gap:8,minWidth:160 }}>
                                  <div style={{ flex:1 }}>
                                    <div style={{ fontSize:12,fontWeight:700,color:"#1a2a5e",marginBottom:4 }}>{v.name}</div>
                                    <div style={{ display:"flex",alignItems:"center",gap:6 }}>
                                      <span style={{ fontSize:11,color:"#7a8ab0" }}>Sisa:</span>
                                      <input type="number" min={0} value={curStock}
                                        onChange={e => setVariantEdits(p => ({...p,[v.id]:e.target.value}))}
                                        style={{ width:60,padding:"3px 6px",border:`1.5px solid ${isDirty?"#f59e0b":"#d4c8e0"}`,borderRadius:6,fontSize:13,fontWeight:700,textAlign:"center",background:isDirty?"#fef9c3":"#fff" }}
                                      />
                                      <span style={{ fontSize:11,color:"#7a8ab0" }}>pcs</span>
                                    </div>
                                  </div>
                                  <button onClick={()=>setConfirmDelVariant(v)} className="tap-btn"
                                    style={{ padding:"4px 7px",background:"#fee2e2",color:"#ef4444",border:"none",borderRadius:7,cursor:"pointer",fontSize:11 }}>✕</button>
                                </div>
                              );
                            })}

                            {/* Tambah desain baru */}
                            <div style={{ background:"#f8faff",border:"2px dashed #d4c8e0",borderRadius:10,padding:"8px 10px",display:"flex",alignItems:"center",gap:6,minWidth:160 }}>
                              <input placeholder="Nama desain baru..." value={variantName}
                                onChange={e=>setVariantName(e.target.value)}
                                onKeyDown={e=>{ if(e.key==="Enter") addVariant(item.id); }}
                                style={{ flex:1,padding:"4px 8px",border:"1.5px solid #d4c8e0",borderRadius:6,fontSize:12 }}
                              />
                              <button onClick={()=>addVariant(item.id)} className="tap-btn"
                                style={{ padding:"5px 10px",background:"#e4f3fd",color:"#2d4ba0",border:"none",borderRadius:7,cursor:"pointer",fontSize:12,fontWeight:700 }}>+</button>
                            </div>
                          </div>

                          {/* Save bar */}
                          {Object.keys(variantEdits).length > 0 && (
                            <div style={{ display:"flex",alignItems:"center",gap:10 }}>
                              <button onClick={()=>saveVariantStocks(item.id)} disabled={savingVariants} className="tap-btn"
                                style={{ padding:"8px 18px",background:savingVariants?"#ddd":"linear-gradient(135deg,#10b981,#059669)",color:"#fff",border:"none",borderRadius:10,fontWeight:700,cursor:savingVariants?"not-allowed":"pointer",fontSize:13 }}>
                                {savingVariants ? "⏳ Menyimpan..." : `💾 Simpan ${Object.keys(variantEdits).length} Perubahan`}
                              </button>
                              <button onClick={()=>setVariantEdits({})} className="tap-btn"
                                style={{ padding:"8px 12px",background:"#fff",color:"#7a8ab0",border:"1.5px solid #d4c8e0",borderRadius:10,fontWeight:600,cursor:"pointer",fontSize:13 }}>
                                Batalkan
                              </button>
                              <span style={{ fontSize:12,color:"#92400e" }}>
                                Total: {getItemVariants(item.id).reduce((s,v)=>s+(Number(variantEdits[v.id]??v.stock)||0),0)} pcs
                                → {Math.floor(getItemVariants(item.id).reduce((s,v)=>s+(Number(variantEdits[v.id]??v.stock)||0),0) / (item.bundle_qty||1))} bundle
                              </span>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── STOCK MOVES ──────────────────────────────────────────────────────────────
function StockMoves({ items, moves, onRefresh, showToast, isMobile }) {
  const [form, setForm] = useState({ item_id: "", direction: "in", qty: "", note: "" });
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const deleteMove = async (move) => {
    try {
      await api(`kr_stock_moves?id=eq.${move.id}`, { method: "DELETE", prefer: "return=minimal" });
      showToast("🗑️ Mutasi dihapus!"); setConfirmDelete(null); onRefresh();
    } catch (e) { showToast("Error: " + e.message, "error"); }
  };

  const save = async () => {
    if (!form.item_id || !form.qty) return showToast("Pilih item dan isi qty", "error");
    setSaving(true);
    try {
      const item = items.find(i => i.id === form.item_id);
      const qty = Number(form.qty);
      const newStock = form.direction === "in" ? (item.stock || 0) + qty : Math.max(0, (item.stock || 0) - qty);
      await api("kr_stock_moves", { method: "POST", body: JSON.stringify({ ...form, qty }), prefer: "return=minimal" });
      await api(`kr_items?id=eq.${form.item_id}`, { method: "PATCH", body: JSON.stringify({ stock: newStock }), prefer: "return=minimal" });
      setForm({ item_id: "", direction: "in", qty: "", note: "" });
      setShowForm(false);
      onRefresh();
      showToast(`${form.direction === "in" ? "📥 Stok masuk" : "📤 Stok keluar"} dicatat!`);
    } catch (e) { showToast("Error: " + e.message, "error"); }
    setSaving(false);
  };

  const itemMap = Object.fromEntries(items.map(i => [i.id, i]));

  const FormContent = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 8 }}>
        {[["in","📥 Masuk"],["out","📤 Keluar"]].map(([v,l]) => (
          <button key={v} onClick={() => setForm(f => ({ ...f, direction: v }))} className="tap-btn" style={{ flex: 1, padding: "11px 0", border: `2px solid ${form.direction===v?(v==="in"?"#10b981":"#ef4444"):"#d4c8e0"}`, borderRadius: 10, background: form.direction===v?(v==="in"?"#d1fae5":"#fee2e2"):"#fff", color: form.direction===v?(v==="in"?"#10b981":"#ef4444"):"#7a8ab0", fontWeight: form.direction===v?700:500, cursor: "pointer", fontSize: 14 }}>{l}</button>
        ))}
      </div>
      {[
        [<><label style={{ fontSize: 13, color: "#7a8ab0", display: "block", marginBottom: 5, fontWeight: 600 }}>Item *</label><select value={form.item_id} onChange={e => setForm(f => ({ ...f, item_id: e.target.value }))} style={{ width: "100%", padding: "11px 12px", border: "1.5px solid #d4c8e0", borderRadius: 10, fontSize: 14 }}><option value="">— Pilih item —</option>{items.filter(i => i.type !== "workshop").map(i => <option key={i.id} value={i.id}>{i.name} (stok: {i.stock})</option>)}</select></>, "sel"],
      ].map(([el, k]) => <div key={k}>{el}</div>)}
      <div>
        <label style={{ fontSize: 13, color: "#7a8ab0", display: "block", marginBottom: 5, fontWeight: 600 }}>Jumlah *</label>
        <input type="number" min={1} placeholder="0" value={form.qty} onChange={e => setForm(f => ({ ...f, qty: e.target.value }))} style={{ width: "100%", padding: "11px 12px", border: "1.5px solid #d4c8e0", borderRadius: 10, fontSize: 15 }} />
      </div>
      <div>
        <label style={{ fontSize: 13, color: "#7a8ab0", display: "block", marginBottom: 5, fontWeight: 600 }}>Keterangan</label>
        <input placeholder="Contoh: Restock dari supplier..." value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} style={{ width: "100%", padding: "11px 12px", border: "1.5px solid #d4c8e0", borderRadius: 10, fontSize: 14 }} />
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={save} disabled={saving} className="tap-btn" style={{ flex: 1, padding: "13px 0", background: saving ? "#ddd" : "linear-gradient(135deg,#ee4181,#2d4ba0)", color: "#fff", border: "none", borderRadius: 12, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", fontSize: 15 }}>
          {saving ? "⏳ Menyimpan..." : "💾 Simpan"}
        </button>
        {isMobile && <button onClick={() => setShowForm(false)} className="tap-btn" style={{ padding: "13px 16px", background: "#fff", color: "#1a2a5e", border: "1.5px solid #d4c8e0", borderRadius: 12, fontWeight: 600, cursor: "pointer" }}>Batal</button>}
      </div>
    </div>
  );

  return (
    <div>
      {confirmDelete && <ConfirmModal title="Hapus Mutasi?" message={`Hapus catatan mutasi ini dari database? Stok tidak akan otomatis dikembalikan.`} onConfirm={() => deleteMove(confirmDelete)} onCancel={() => setConfirmDelete(null)} />}
      {isMobile ? (
        <>
          <button onClick={() => setShowForm(true)} className="tap-btn" style={{ width: "100%", padding: "13px 0", background: "linear-gradient(135deg,#ee4181,#2d4ba0)", color: "#fff", border: "none", borderRadius: 12, fontWeight: 700, cursor: "pointer", fontSize: 15, marginBottom: 16 }}>+ Catat Mutasi Stok</button>
          {showForm && (
            <div style={{ ...CARD, padding: 18, marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14, color: "#1a2a5e" }}>↕️ Catat Mutasi Stok</div>
              <FormContent />
            </div>
          )}
        </>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 24 }}>
          <div style={{ ...CARD, padding: 22, height: "fit-content" }}>
            <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 18, color: "#1a2a5e" }}>↕️ Catat Mutasi Stok</div>
            <FormContent />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 14, color: "#1a2a5e" }}>📋 Riwayat</div>
            <MovesList moves={moves} itemMap={itemMap} onDelete={setConfirmDelete} />
          </div>
        </div>
      )}
      {isMobile && (
        <>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10, color: "#1a2a5e" }}>📋 Riwayat Mutasi</div>
          <MovesList moves={moves} itemMap={itemMap} isMobile={isMobile} onDelete={setConfirmDelete} />
        </>
      )}
    </div>
  );
}

function MovesList({ moves, itemMap, isMobile, onDelete }) {
  if (moves.length === 0) return (
    <div style={{ ...CARD, padding: 40, textAlign: "center", color: "#7a8ab0" }}>
      <div style={{ fontSize: 36 }}>📋</div>Belum ada mutasi stok
    </div>
  );
  if (isMobile) return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {moves.map(m => (
        <div key={m.id} style={{ ...CARD, padding: 12, display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 24 }}>{m.direction === "in" ? "📥" : "📤"}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{itemMap[m.item_id]?.name || "—"}</div>
            <div style={{ fontSize: 11, color: "#7a8ab0" }}>{formatDate(m.created_at)} · {m.note || "—"}</div>
          </div>
          <div style={{ fontSize: 16, fontWeight: 800, color: m.direction === "in" ? "#10b981" : "#ef4444", flexShrink: 0 }}>
            {m.direction === "in" ? "+" : "−"}{m.qty}
          </div>
          <button onClick={() => onDelete(m)} className="tap-btn" style={{ padding: "6px 8px", background: "#fee2e2", color: "#ef4444", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, flexShrink: 0 }}>🗑️</button>
        </div>
      ))}
    </div>
  );
  return (
    <div style={{ ...CARD, overflow: "hidden" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: "linear-gradient(135deg,#e4f3fd,#fadeeb)" }}>
            {["Waktu","Item","Arah","Qty","Keterangan",""].map(h => (
              <th key={h} style={{ padding: "11px 14px", textAlign: "left", fontSize: 12, color: "#1a2a5e", fontWeight: 700, borderBottom: "2px solid #d4c8e0" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {moves.map(m => (
            <tr key={m.id} style={{ borderBottom: "1px solid #d4c8e0" }}>
              <td style={{ padding: "10px 14px", fontSize: 12, color: "#7a8ab0" }}>{formatDate(m.created_at)}</td>
              <td style={{ padding: "10px 14px", fontSize: 13, fontWeight: 600 }}>{itemMap[m.item_id]?.name || "—"}</td>
              <td style={{ padding: "10px 14px" }}>
                <span style={{ fontSize: 12, padding: "4px 10px", borderRadius: 20, fontWeight: 700, background: m.direction === "in" ? "#d1fae5" : "#fee2e2", color: m.direction === "in" ? "#10b981" : "#ef4444" }}>{m.direction === "in" ? "📥 Masuk" : "📤 Keluar"}</span>
              </td>
              <td style={{ padding: "10px 14px", fontSize: 15, fontWeight: 800 }}>{m.qty}</td>
              <td style={{ padding: "10px 14px", fontSize: 13, color: "#7a8ab0" }}>{m.note || "—"}</td>
              <td style={{ padding: "10px 14px" }}>
                <button onClick={() => onDelete(m)} className="tap-btn" style={{ padding: "5px 10px", background: "#fee2e2", color: "#ef4444", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 12 }}>🗑️ Hapus</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── SALES ────────────────────────────────────────────────────────────────────
function Sales({ orders, items, onRefresh, showToast, isMobile }) {
  const [detail, setDetail] = useState(null);
  const [orderItems, setOrderItems] = useState([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [period, setPeriod] = useState("daily");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [reInvoice, setReInvoice] = useState(null); // invoice yg dibuka ulang

  const deleteOrder = async (order) => {
    try {
      await api(`kr_order_items?order_id=eq.${order.id}`, { method: "DELETE", prefer: "return=minimal" });
      await api(`kr_orders?id=eq.${order.id}`, { method: "DELETE", prefer: "return=minimal" });
      showToast("🗑️ Transaksi dihapus!"); setConfirmDelete(null); setDetail(null); onRefresh();
    } catch (e) { showToast("Error: " + e.message, "error"); }
  };

  const openDetail = async (order) => {
    setDetail(order); setLoadingDetail(true);
    try { setOrderItems(await api(`kr_order_items?order_id=eq.${order.id}`)); } catch {}
    setLoadingDetail(false);
  };

  const openInvoice = (order, oi) => {
    setReInvoice({
      ...order,
      items: oi.map(i => ({ name: i.item_name, price: i.price, qty: i.qty })),
    });
  };

  if (reInvoice) return <InvoiceView invoice={reInvoice} onClose={() => setReInvoice(null)} isMobile={isMobile} />;

  // Filter orders by period
  const now = new Date();
  const startOfDay = (d) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
  const startOfWeek = () => { const d = startOfDay(now); d.setDate(d.getDate() - d.getDay()); return d; };
  const startOfMonth = () => { const d = startOfDay(now); d.setDate(1); return d; };

  const filteredOrders = orders.filter(o => {
    const d = new Date(o.created_at);
    if (period === "daily")   return d >= startOfDay(now);
    if (period === "weekly")  return d >= startOfWeek();
    if (period === "monthly") return d >= startOfMonth();
    if (period === "custom" && customStart && customEnd) {
      const s = startOfDay(new Date(customStart));
      const e = new Date(new Date(customEnd).setHours(23,59,59,999));
      return d >= s && d <= e;
    }
    return true;
  });

  const periodRevenue = filteredOrders.filter(o => o.status === "paid").reduce((s, o) => s + (o.total || 0), 0);
  const totalRevenue = orders.filter(o => o.status === "paid").reduce((s, o) => s + (o.total || 0), 0);

  const PERIODS = [
    { id: "daily",   label: "Hari Ini" },
    { id: "weekly",  label: "Minggu Ini" },
    { id: "monthly", label: "Bulan Ini" },
    { id: "all",     label: "Semua" },
    { id: "custom",  label: "Custom" },
  ];

  const statCards = [
    { label: "Transaksi", value: filteredOrders.length, icon: "🧾", accent: "#2d4ba0" },
    { label: "Omzet Periode", value: formatRp(periodRevenue), icon: "💰", accent: "#ee4181" },
    { label: "Total Semua", value: formatRp(totalRevenue), icon: "📈", accent: "#10b981" },
    { label: "Rata-rata", value: filteredOrders.length ? formatRp(Math.round(periodRevenue / filteredOrders.filter(o=>o.status==="paid").length || 0)) : "Rp 0", icon: "📊", accent: "#1a3578" },
  ];

  return (
    <div>
      {confirmDelete && <ConfirmModal title="Hapus Transaksi?" message={`Hapus transaksi ${confirmDelete.order_no} (${formatRp(confirmDelete.total)}) secara permanen?`} onConfirm={() => deleteOrder(confirmDelete)} onCancel={() => setConfirmDelete(null)} danger />}

      {/* Period Filter */}
      <div style={{ ...CARD, padding: "14px 18px", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#1a2a5e", marginRight: 4 }}>📅 Periode:</span>
          {PERIODS.map(p => (
            <button key={p.id} onClick={() => setPeriod(p.id)} className="tap-btn" style={{
              padding: "6px 14px", borderRadius: 20, border: `2px solid ${period === p.id ? "#2d4ba0" : "#d0e5f5"}`,
              background: period === p.id ? "#e4f3fd" : "#fff",
              color: period === p.id ? "#2d4ba0" : "#7a8ab0",
              fontWeight: period === p.id ? 700 : 500, cursor: "pointer", fontSize: 12,
            }}>{p.label}</button>
          ))}
          {period === "custom" && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: isMobile ? 8 : 0, width: isMobile ? "100%" : "auto" }}>
              <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)}
                style={{ padding: "6px 10px", border: "1.5px solid #d0e5f5", borderRadius: 8, fontSize: 13 }} />
              <span style={{ color: "#7a8ab0", fontSize: 13 }}>s/d</span>
              <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)}
                style={{ padding: "6px 10px", border: "1.5px solid #d0e5f5", borderRadius: 8, fontSize: 13 }} />
            </div>
          )}
        </div>
      </div>

      {/* Stat Cards */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(4, 1fr)", gap: isMobile ? 10 : 16, marginBottom: 20 }}>
        {statCards.map(s => (
          <div key={s.label} style={{ ...CARD, padding: isMobile ? "12px 14px" : "18px 20px", borderTop: `4px solid ${s.accent}` }}>
            <div style={{ fontSize: isMobile ? 11 : 12, color: "#7a8ab0", marginBottom: 5, fontWeight: 600 }}>{s.icon} {s.label}</div>
            <div style={{ fontSize: isMobile ? 15 : 20, fontWeight: 800, color: s.accent }}>{s.value}</div>
          </div>
        ))}
      </div>

      {isMobile ? (
        <>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10, color: "#1a2a5e" }}>📊 Riwayat Penjualan</div>
          {filteredOrders.length === 0 ? (
            <div style={{ ...CARD, padding: 40, textAlign: "center", color: "#7a8ab0" }}><div style={{ fontSize: 36 }}>📊</div>Belum ada penjualan di periode ini</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {filteredOrders.map(o => (
                <div key={o.id} onClick={() => openDetail(o)} className="tap-btn" style={{ ...CARD, padding: 14, cursor: "pointer" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#ee4181" }}>{o.order_no}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 20, fontWeight: 700, background: o.status === "paid" ? "#d1fae5" : "#fef3c7", color: o.status === "paid" ? "#10b981" : "#f59e0b" }}>
                        {o.status === "paid" ? "✅ Lunas" : "⏳ Pending"}
                      </span>
                      <button onClick={e => { e.stopPropagation(); setConfirmDelete(o); }} className="tap-btn" style={{ padding: "4px 7px", background: "#fee2e2", color: "#ef4444", border: "none", borderRadius: 7, cursor: "pointer", fontSize: 12 }}>🗑️</button>
                    </div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: 13, color: "#1a2a5e", fontWeight: 500 }}>{o.customer_name || "Umum"} · {o.payment_method === "cash" ? "💵" : "📲"}</div>
                      <div style={{ fontSize: 11, color: "#7a8ab0" }}>{formatDate(o.created_at)}</div>
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: "#ee4181" }}>{formatRp(o.total)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {detail && (
            <div style={{ position: "fixed", inset: 0, zIndex: 300, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
              <div onClick={() => setDetail(null)} style={{ flex: 1, background: "rgba(0,0,0,0.4)" }} />
              <div style={{ background: "#fdf4fb", borderRadius: "20px 20px 0 0", padding: 20, maxHeight: "80vh", overflowY: "auto", animation: "slideUp 0.3s ease" }}>
                <div style={{ width: 36, height: 4, background: "#d4c8e0", borderRadius: 2, margin: "0 auto 16px" }} />
                <OrderDetail detail={detail} orderItems={orderItems} loadingDetail={loadingDetail} onClose={() => setDetail(null)} onDelete={() => setConfirmDelete(detail)} onInvoice={() => openInvoice(detail, orderItems)} />
              </div>
            </div>
          )}
        </>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: detail ? "1fr 370px" : "1fr", gap: 20 }}>
          <div style={{ ...CARD, overflow: "hidden" }}>
            <div style={{ padding: "14px 18px", borderBottom: "2px solid #d4c8e0", fontWeight: 800, fontSize: 15, background: "linear-gradient(135deg,#e4f3fd,#fadeeb)" }}>
              📊 Riwayat Penjualan
              <span style={{ fontSize: 12, fontWeight: 500, color: "#7a8ab0", marginLeft: 8 }}>({filteredOrders.length} transaksi)</span>
            </div>
            {filteredOrders.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 0", color: "#7a8ab0" }}><div style={{ fontSize: 36 }}>📊</div>Belum ada penjualan di periode ini</div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#fafafa" }}>
                    {["No Order","Waktu","Customer","Pembayaran","Total","Status",""].map(h => (
                      <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 12, color: "#7a8ab0", fontWeight: 700, borderBottom: "1.5px solid #d4c8e0" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map(o => (
                    <tr key={o.id} onClick={() => openDetail(o)} style={{ borderBottom: "1px solid #d4c8e0", cursor: "pointer", background: detail?.id === o.id ? "#e4f3fd" : "transparent" }}>
                      <td style={{ padding: "10px 14px", fontSize: 13, fontWeight: 700, color: "#ee4181" }}>{o.order_no}</td>
                      <td style={{ padding: "10px 14px", fontSize: 12, color: "#7a8ab0" }}>{formatDate(o.created_at)}</td>
                      <td style={{ padding: "10px 14px", fontSize: 13 }}>{o.customer_name || "Umum"}</td>
                      <td style={{ padding: "10px 14px", fontSize: 13 }}>{o.payment_method === "cash" ? "💵 Tunai" : "📲 QRIS"}</td>
                      <td style={{ padding: "10px 14px", fontSize: 14, fontWeight: 800, color: "#ee4181" }}>{formatRp(o.total)}</td>
                      <td style={{ padding: "10px 14px" }}>
                        <span style={{ fontSize: 11, padding: "4px 10px", borderRadius: 20, fontWeight: 700, background: o.status === "paid" ? "#d1fae5" : "#fef3c7", color: o.status === "paid" ? "#10b981" : "#f59e0b" }}>
                          {o.status === "paid" ? "✅ Lunas" : "⏳ Pending"}
                        </span>
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        <button onClick={e => { e.stopPropagation(); setConfirmDelete(o); }} className="tap-btn" style={{ padding: "5px 10px", background: "#fee2e2", color: "#ef4444", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 12 }}>🗑️ Hapus</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {detail && (
            <div style={{ ...CARD, padding: 20, height: "fit-content", position: "sticky", top: 110 }}>
              <OrderDetail detail={detail} orderItems={orderItems} loadingDetail={loadingDetail} onClose={() => setDetail(null)} onDelete={() => setConfirmDelete(detail)} onInvoice={() => openInvoice(detail, orderItems)} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function OrderDetail({ detail, orderItems, loadingDetail, onClose, onDelete, onInvoice }) {
  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontWeight: 800, fontSize: 15, color: "#ee4181" }}>{detail.order_no}</div>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={onInvoice} className="tap-btn" style={{ padding: "5px 10px", background: "#e4f3fd", color: "#2d4ba0", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>🧾 Invoice</button>
          <button onClick={onDelete} className="tap-btn" style={{ padding: "5px 10px", background: "#fee2e2", color: "#ef4444", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>🗑️ Hapus</button>
          <button onClick={onClose} className="tap-btn" style={{ background: "#fde8f0", border: "none", cursor: "pointer", fontSize: 16, color: "#ee4181", borderRadius: 8, width: 30, height: 30 }}>×</button>
        </div>
      </div>
      <div style={{ background: "#e4f3fd", borderRadius: 10, padding: "10px 14px", fontSize: 13, marginBottom: 12, lineHeight: 1.8 }}>
        <div>👤 <b>{detail.customer_name || "Umum"}</b></div>
        {detail.customer_phone && <div>📱 {detail.customer_phone}</div>}
        <div>💳 {detail.payment_method === "cash" ? "💵 Tunai" : "📲 QRIS"}</div>
        <div>🕐 {formatDate(detail.created_at)}</div>
      </div>
      {loadingDetail ? <div style={{ textAlign: "center", padding: 20, color: "#7a8ab0" }}>Memuat...</div> : (
        <>
          <div style={{ marginBottom: 12 }}>
            {orderItems.map((oi, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "6px 0", borderBottom: "1px dashed #d4c8e0" }}>
                <span>{oi.item_name} × {oi.qty}</span>
                <span style={{ fontWeight: 600 }}>{formatRp(oi.subtotal)}</span>
              </div>
            ))}
          </div>
          <div style={{ background: "#fde8f0", borderRadius: 10, padding: "10px 14px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#7a8ab0", marginBottom: 4 }}>
              <span>Subtotal</span><span>{formatRp(detail.subtotal)}</span>
            </div>
            {detail.discount > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#ef4444", marginBottom: 4 }}>
                <span>🏷️ Diskon</span><span>- {formatRp(detail.discount)}</span>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: 17, marginTop: 6 }}>
              <span>Total</span><span style={{ color: "#ee4181" }}>{formatRp(detail.total)}</span>
            </div>
          </div>
        </>
      )}
    </>
  );
}

// ─── REIMBURSEMENT ────────────────────────────────────────────────────────────
function Reimbursement({ reimburses, onRefresh, showToast, isMobile }) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [filterStatus, setFilterStatus] = useState("all");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [importing, setImporting] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const fileInputRef = useRef(null);
  const [form, setForm] = useState({ expense_details: "", event: "", amount: "", pic: "", status: "unpaid", transaction_date: "", notes: "" });

  const openNew = () => { setForm({ expense_details: "", event: "", amount: "", pic: "", status: "unpaid", transaction_date: "", notes: "" }); setEditing(null); setShowForm(true); };
  const openEdit = (r) => { setForm({ ...r, amount: r.amount || "", transaction_date: r.transaction_date || "" }); setEditing(r.id); setShowForm(true); };

  const toggleSelect = (id) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleSelectAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map(r => r.id)));
  };
  const bulkDelete = async () => {
    let ok = 0;
    for (const id of selected) {
      try { await api(`kr_reimbursements?id=eq.${id}`, { method: "DELETE", prefer: "return=minimal" }); ok++; } catch {}
    }
    setSelected(new Set()); setConfirmBulk(false); onRefresh();
    showToast(`🗑️ ${ok} item dihapus!`);
  };

  // ── EXPORT ────────────────────────────────────────────────────────────────
  const exportCSV = () => {
    const headers = ["Expense Details","Event","Jumlah","PIC","Status","Tanggal","Catatan"];
    const rows = reimburses.map(r => [
      r.expense_details, r.event||"", r.amount, r.pic||"",
      r.status, r.transaction_date||"", r.notes||""
    ]);
    const csv = [headers,...rows].map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF"+csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `KURESAPI_Reimbursement_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    showToast("📥 Export berhasil!");
  };

  // ── IMPORT ────────────────────────────────────────────────────────────────
  const handleImportCSV = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = "";
    setImporting(true);
    try {
      let text = await file.text();
      // Hapus BOM jika ada
      text = text.replace(/^\uFEFF/, "");
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) { showToast("File kosong!", "error"); setImporting(false); return; }

      const parseRow = (line) => {
        const cols = []; let cur = ""; let inQ = false;
        for (let i = 0; i < line.length; i++) {
          const c = line[i];
          if (c === '"') { if (inQ && line[i+1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
          else if (c === ',' && !inQ) { cols.push(cur.trim()); cur = ""; }
          else cur += c;
        }
        cols.push(cur.trim());
        return cols;
      };

      const headers = parseRow(lines[0]).map(h => h.toLowerCase().replace(/[\s_-]/g,""));
      const idx = (keys) => {
        for (const k of keys) {
          const i = headers.indexOf(k.toLowerCase().replace(/[\s_-]/g,""));
          if (i >= 0) return i;
        }
        return -1;
      };

      const iDetail = idx(["expensedetails","expense details","detail","pengeluaran","keterangan"]);
      const iEvent  = idx(["event","acara"]);
      const iAmount = idx(["jumlah","amount","nominal","harga","biaya"]);
      const iPic    = idx(["pic","nama","person"]);
      const iStatus = idx(["status","statusreimbursement"]);
      const iDate   = idx(["tanggal","date","transactiondate"]);
      const iNotes  = idx(["catatan","notes","keterangan"]);

      if (iDetail < 0) { showToast(`Kolom 'Expense Details' tidak ditemukan! Headers: ${headers.join(", ")}`, "error"); setImporting(false); return; }

      const toImport = lines.slice(1)
        .map(l => parseRow(l))
        .filter(cols => cols[iDetail]?.trim())
        .map(cols => {
          const s = (cols[iStatus]||"").toLowerCase();
          const dateVal = cols[iDate]?.trim() || null;
          return {
            expense_details: cols[iDetail]||"",
            event: cols[iEvent]||"",
            amount: Number((cols[iAmount]||"0").toString().replace(/[^\d.]/g,""))||0,
            pic: cols[iPic]||"",
            status: (s === "paid" || s === "done" || s === "lunas") ? "paid" : "unpaid",
            transaction_date: dateVal && dateVal !== "" ? dateVal : null,
            notes: cols[iNotes]||"",
          };
        });

      if (!toImport.length) { showToast("Tidak ada data valid!", "error"); setImporting(false); return; }

      let success = 0, fail = 0;
      for (const item of toImport) {
        try { await api("kr_reimbursements", { method: "POST", body: JSON.stringify(item), prefer: "return=minimal" }); success++; }
        catch { fail++; }
      }
      onRefresh();
      showToast(`✨ Import selesai! ${success} berhasil${fail>0?`, ${fail} gagal`:""}`);
    } catch (err) { showToast("Gagal: " + err.message, "error"); }
    setImporting(false);
  };

  const save = async () => {
    if (!form.expense_details.trim()) return showToast("Detail pengeluaran wajib diisi", "error");
    try {
      const payload = { ...form, amount: Number(form.amount) || 0, transaction_date: form.transaction_date || null };
      if (editing) {
        await api(`kr_reimbursements?id=eq.${editing}`, { method: "PATCH", body: JSON.stringify(payload), prefer: "return=minimal" });
        showToast("✅ Reimbursement diperbarui!");
      } else {
        await api("kr_reimbursements", { method: "POST", body: JSON.stringify(payload), prefer: "return=minimal" });
        showToast("✨ Reimbursement ditambahkan!");
      }
      setShowForm(false); onRefresh();
    } catch (e) { showToast("Error: " + e.message, "error"); }
  };

  const toggleStatus = async (r) => {
    const newStatus = r.status === "paid" ? "unpaid" : "paid";
    try {
      await api(`kr_reimbursements?id=eq.${r.id}`, { method: "PATCH", body: JSON.stringify({ status: newStatus }), prefer: "return=minimal" });
      showToast(newStatus === "paid" ? "✅ Ditandai sudah dibayar!" : "↩️ Ditandai belum dibayar");
      onRefresh();
    } catch (e) { showToast("Error: " + e.message, "error"); }
  };

  const deleteItem = async (r) => {
    try {
      await api(`kr_reimbursements?id=eq.${r.id}`, { method: "DELETE", prefer: "return=minimal" });
      showToast("🗑️ Dihapus!"); setConfirmDelete(null); onRefresh();
    } catch (e) { showToast("Error: " + e.message, "error"); }
  };

  const filtered = reimburses.filter(r => filterStatus === "all" || r.status === filterStatus);
  const totalUnpaid = reimburses.filter(r => r.status === "unpaid").reduce((s, r) => s + (r.amount || 0), 0);
  const totalPaid = reimburses.filter(r => r.status === "paid").reduce((s, r) => s + (r.amount || 0), 0);

  if (showForm) return (
    <div style={{ maxWidth: 560 }}>
      <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 18, color: "#1a2a5e" }}>{editing ? "✏️ Edit Reimbursement" : "✨ Tambah Reimbursement"}</div>
      <div style={{ ...CARD, padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
        {[
          ["expense_details", "Detail Pengeluaran *", "text", "Contoh: Beli kawat bulu..."],
          ["amount", "💰 Jumlah (Rp) *", "number", "0"],
          ["pic", "PIC", "text", "Nama yang mengajukan"],
          ["transaction_date", "Tanggal Transaksi", "date", ""],
          ["notes", "Catatan", "text", "Opsional"],
        ].map(([k, l, t, ph]) => (
          <div key={k}>
            <label style={{ fontSize: 13, color: "#7a8ab0", display: "block", marginBottom: 5, fontWeight: 600 }}>{l}</label>
            <input type={t} placeholder={ph} value={form[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))}
              style={{ width: "100%", padding: "10px 13px", border: "1.5px solid #d0e5f5", borderRadius: 10, fontSize: 14, boxSizing: "border-box" }} />
          </div>
        ))}

        {/* Event dropdown */}
        <div>
          <label style={{ fontSize: 13, color: "#7a8ab0", display: "block", marginBottom: 5, fontWeight: 600 }}>Event</label>
          <select value={["Workshop","Art Market","Lainnya"].includes(form.event) ? form.event : form.event ? "Lainnya" : ""}
            onChange={e => setForm(f => ({ ...f, event: e.target.value === "Lainnya" ? "" : e.target.value, _eventCustom: e.target.value === "Lainnya" ? true : false }))}
            style={{ width: "100%", padding: "10px 13px", border: "1.5px solid #d0e5f5", borderRadius: 10, fontSize: 14, background: "#fff" }}>
            <option value="">— Pilih event —</option>
            <option value="Workshop">🎨 Workshop</option>
            <option value="Art Market">🛍️ Art Market</option>
            <option value="Lainnya">✏️ Lainnya...</option>
          </select>
          {(form._eventCustom || (form.event && !["Workshop","Art Market",""].includes(form.event))) && (
            <input placeholder="Tulis nama event..." value={form.event}
              onChange={e => setForm(f => ({ ...f, event: e.target.value }))}
              style={{ width: "100%", padding: "10px 13px", border: "1.5px solid #d0e5f5", borderRadius: 10, fontSize: 14, boxSizing: "border-box", marginTop: 8 }} />
          )}
        </div>
        <div>
          <label style={{ fontSize: 13, color: "#7a8ab0", display: "block", marginBottom: 6, fontWeight: 600 }}>Status</label>
          <div style={{ display: "flex", gap: 8 }}>
            {[["unpaid", "⏳ Belum Dibayar"], ["paid", "✅ Sudah Dibayar"]].map(([v, l]) => (
              <button key={v} onClick={() => setForm(f => ({ ...f, status: v }))} style={{
                flex: 1, padding: "10px 0", border: `2px solid ${form.status === v ? (v === "paid" ? "#10b981" : "#f59e0b") : "#d0e5f5"}`,
                borderRadius: 10, background: form.status === v ? (v === "paid" ? "#d1fae5" : "#fef3c7") : "#fff",
                color: form.status === v ? (v === "paid" ? "#10b981" : "#f59e0b") : "#7a8ab0",
                fontWeight: form.status === v ? 700 : 500, cursor: "pointer", fontSize: 13,
              }}>{l}</button>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
          <button onClick={save} style={{ flex: 1, padding: "13px 0", background: "linear-gradient(135deg,#ee4181,#2d4ba0)", color: "#fff", border: "none", borderRadius: 12, fontWeight: 700, cursor: "pointer", fontSize: 14 }}>
            {editing ? "💾 Simpan" : "✨ Tambah"}
          </button>
          <button onClick={() => setShowForm(false)} style={{ flex: 1, padding: "13px 0", background: "#fff", color: "#1a2a5e", border: "1.5px solid #d0e5f5", borderRadius: 12, fontWeight: 600, cursor: "pointer", fontSize: 14 }}>Batal</button>
        </div>
      </div>
    </div>
  );

  return (
    <div>
      {confirmDelete && <ConfirmModal title="Hapus Reimbursement?" message={`Hapus "${confirmDelete.expense_details}" (${formatRp(confirmDelete.amount)}) secara permanen?`} onConfirm={() => deleteItem(confirmDelete)} onCancel={() => setConfirmDelete(null)} />}
      {confirmBulk && <ConfirmModal title={`Hapus ${selected.size} Item?`} message={`Hapus ${selected.size} reimbursement yang dipilih secara permanen?`} onConfirm={bulkDelete} onCancel={() => setConfirmBulk(false)} />}

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div style={{ ...CARD, padding: "10px 16px", marginBottom: 12, background: "#fde8f0", border: "1.5px solid #f5a8c4", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#ee4181" }}>✓ {selected.size} item dipilih</span>
          <button onClick={() => setConfirmBulk(true)} className="tap-btn" style={{ padding: "6px 14px", background: "#ef4444", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer", fontSize: 13 }}>🗑️ Hapus Terpilih</button>
          <button onClick={() => setSelected(new Set())} className="tap-btn" style={{ padding: "6px 12px", background: "#fff", color: "#7a8ab0", border: "1.5px solid #d0e5f5", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 }}>Batal</button>
        </div>
      )}

      {/* Stat Cards */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2,1fr)" : "repeat(3,1fr)", gap: isMobile ? 10 : 16, marginBottom: 20 }}>
        {[
          { label: "Total Entri", value: reimburses.length, icon: "🧾", accent: "#2d4ba0" },
          { label: "Belum Dibayar", value: formatRp(totalUnpaid), icon: "⏳", accent: "#f59e0b" },
          { label: "Sudah Dibayar", value: formatRp(totalPaid), icon: "✅", accent: "#10b981" },
        ].map(s => (
          <div key={s.label} style={{ ...CARD, padding: isMobile ? "12px 14px" : "18px 20px", borderTop: `4px solid ${s.accent}` }}>
            <div style={{ fontSize: 12, color: "#7a8ab0", marginBottom: 5, fontWeight: 600 }}>{s.icon} {s.label}</div>
            <div style={{ fontSize: isMobile ? 15 : 20, fontWeight: 800, color: s.accent }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Filter + Add */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", flex: 1 }}>
          {[["all","Semua"],["unpaid","⏳ Belum Dibayar"],["paid","✅ Sudah Dibayar"]].map(([v,l]) => (
            <button key={v} onClick={() => setFilterStatus(v)} className="tap-btn" style={{
              padding: "7px 14px", borderRadius: 20, fontSize: 12, cursor: "pointer",
              border: `2px solid ${filterStatus === v ? "#2d4ba0" : "#d0e5f5"}`,
              background: filterStatus === v ? "#e4f3fd" : "#fff",
              color: filterStatus === v ? "#2d4ba0" : "#7a8ab0",
              fontWeight: filterStatus === v ? 700 : 500, whiteSpace: "nowrap",
            }}>{l} <span style={{ opacity: 0.7 }}>({reimburses.filter(r => v === "all" || r.status === v).length})</span></button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <button onClick={openNew} className="tap-btn" style={{ padding: "9px 14px", background: "linear-gradient(135deg,#ee4181,#2d4ba0)", color: "#fff", border: "none", borderRadius: 12, fontWeight: 700, cursor: "pointer", fontSize: 13 }}>+ Tambah</button>
          <button onClick={exportCSV} className="tap-btn" style={{ padding: "9px 14px", background: "#e4f3fd", color: "#2d4ba0", border: "1.5px solid #a1def9", borderRadius: 12, fontWeight: 600, cursor: "pointer", fontSize: 13 }}>📥 Export</button>
          <button onClick={() => fileInputRef.current?.click()} disabled={importing} className="tap-btn" style={{ padding: "9px 14px", background: "#fde8f0", color: "#ee4181", border: "1.5px solid #f5a8c4", borderRadius: 12, fontWeight: 600, cursor: importing ? "not-allowed" : "pointer", fontSize: 13 }}>
            {importing ? "⏳..." : "📤 Import"}
          </button>
          <input ref={fileInputRef} type="file" accept=".csv" onChange={handleImportCSV} style={{ display: "none" }} />
        </div>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div style={{ ...CARD, padding: 60, textAlign: "center", color: "#7a8ab0" }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>💸</div>
          <div style={{ fontWeight: 600 }}>Belum ada reimbursement</div>
        </div>
      ) : isMobile ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map(r => {
            const isSel = selected.has(r.id);
            return (
              <div key={r.id} style={{ ...CARD, padding: 14, border: `1.5px solid ${isSel ? "#ee4181" : "#d0e5f5"}`, background: isSel ? "#fde8f0" : "#fff" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10, flex: 1, minWidth: 0 }}>
                    <input type="checkbox" checked={isSel} onChange={() => toggleSelect(r.id)}
                      style={{ width: 18, height: 18, marginTop: 2, accentColor: "#ee4181", cursor: "pointer", flexShrink: 0 }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#1a2a5e", marginBottom: 2 }}>{r.expense_details}</div>
                      <div style={{ fontSize: 12, color: "#7a8ab0" }}>{r.event || "—"} {r.pic ? `· ${r.pic}` : ""}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: "#ee4181", marginLeft: 10, flexShrink: 0 }}>{formatRp(r.amount)}</div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <button onClick={() => toggleStatus(r)} className="tap-btn" style={{
                    padding: "5px 12px", borderRadius: 20, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700,
                    background: r.status === "paid" ? "#d1fae5" : "#fef3c7",
                    color: r.status === "paid" ? "#10b981" : "#f59e0b",
                  }}>{r.status === "paid" ? "✅ Lunas" : "⏳ Belum Dibayar"}</button>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => openEdit(r)} className="tap-btn" style={{ padding: "5px 10px", background: "#e4f3fd", color: "#2d4ba0", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>✏️</button>
                    <button onClick={() => setConfirmDelete(r)} className="tap-btn" style={{ padding: "5px 8px", background: "#fee2e2", color: "#ef4444", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 12 }}>🗑️</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ ...CARD, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "linear-gradient(135deg,#e4f3fd,#fadeeb)" }}>
                <th style={{ padding: "11px 14px", width: 40 }}>
                  <input type="checkbox" checked={filtered.length > 0 && selected.size === filtered.length} onChange={toggleSelectAll}
                    style={{ width: 16, height: 16, accentColor: "#ee4181", cursor: "pointer" }} />
                </th>
                {["Detail Pengeluaran","Event","PIC","Jumlah","Tanggal","Status","Aksi"].map(h => (
                  <th key={h} style={{ padding: "11px 14px", textAlign: "left", fontSize: 12, color: "#1a2a5e", fontWeight: 700, borderBottom: "2px solid #d0e5f5" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const isSel = selected.has(r.id);
                return (
                  <tr key={r.id} style={{ borderBottom: "1px solid #d0e5f5", background: isSel ? "#fde8f0" : "transparent" }}>
                    <td style={{ padding: "11px 14px" }}>
                      <input type="checkbox" checked={isSel} onChange={() => toggleSelect(r.id)}
                        style={{ width: 16, height: 16, accentColor: "#ee4181", cursor: "pointer" }} />
                    </td>
                    <td style={{ padding: "11px 14px", fontSize: 13, fontWeight: 600, color: "#1a2a5e", maxWidth: 240 }}>{r.expense_details}</td>
                    <td style={{ padding: "11px 14px", fontSize: 13, color: "#7a8ab0" }}>{r.event || "—"}</td>
                    <td style={{ padding: "11px 14px", fontSize: 13, color: "#7a8ab0" }}>{r.pic || "—"}</td>
                    <td style={{ padding: "11px 14px", fontSize: 14, fontWeight: 700, color: "#ee4181" }}>{formatRp(r.amount)}</td>
                    <td style={{ padding: "11px 14px", fontSize: 12, color: "#7a8ab0" }}>{r.transaction_date ? new Date(r.transaction_date).toLocaleDateString("id-ID", { day:"2-digit", month:"short", year:"numeric" }) : "—"}</td>
                    <td style={{ padding: "11px 14px" }}>
                      <button onClick={() => toggleStatus(r)} className="tap-btn" style={{
                        padding: "5px 12px", borderRadius: 20, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700,
                        background: r.status === "paid" ? "#d1fae5" : "#fef3c7",
                        color: r.status === "paid" ? "#10b981" : "#f59e0b",
                      }}>{r.status === "paid" ? "✅ Lunas" : "⏳ Belum Dibayar"}</button>
                    </td>
                    <td style={{ padding: "11px 14px" }}>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => openEdit(r)} className="tap-btn" style={{ padding: "5px 10px", background: "#e4f3fd", color: "#2d4ba0", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>✏️ Edit</button>
                        <button onClick={() => setConfirmDelete(r)} className="tap-btn" style={{ padding: "5px 8px", background: "#fee2e2", color: "#ef4444", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 12 }}>🗑️</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── EVENTS ───────────────────────────────────────────────────────────────────
const EVENT_TYPES = { art_market: { label: "🛍️ Art Market", color: "#2d4ba0", bg: "#e4f3fd" }, workshop: { label: "🎨 Workshop", color: "#ee4181", bg: "#fde8f0" }, online: { label: "🌐 Online", color: "#10b981", bg: "#d1fae5" }, other: { label: "📌 Lainnya", color: "#7a8ab0", bg: "#f0f0f0" } };
const EVENT_STATUS = { upcoming: { label: "⏳ Upcoming", color: "#f59e0b", bg: "#fef3c7" }, ongoing: { label: "🟢 Ongoing", color: "#10b981", bg: "#d1fae5" }, done: { label: "✅ Selesai", color: "#7a8ab0", bg: "#f0f0f0" } };

function Events({ events, onRefresh, showToast, isMobile }) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [form, setForm] = useState({ name: "", type: "art_market", location: "", start_date: "", end_date: "", status: "upcoming", notes: "" });

  const openNew = () => { setForm({ name: "", type: "art_market", location: "", start_date: "", end_date: "", status: "upcoming", notes: "" }); setEditing(null); setShowForm(true); };
  const openEdit = (e) => { setForm({ ...e, start_date: e.start_date||"", end_date: e.end_date||"" }); setEditing(e.id); setShowForm(true); };

  const save = async () => {
    if (!form.name.trim()) return showToast("Nama event wajib diisi", "error");
    try {
      const payload = { ...form, start_date: form.start_date||null, end_date: form.end_date||null };
      if (editing) {
        await api(`kr_events?id=eq.${editing}`, { method: "PATCH", body: JSON.stringify(payload), prefer: "return=minimal" });
        showToast("✅ Event diperbarui!");
      } else {
        await api("kr_events", { method: "POST", body: JSON.stringify(payload), prefer: "return=minimal" });
        showToast("✨ Event ditambahkan!");
      }
      setShowForm(false); onRefresh();
    } catch (e) { showToast("Error: " + e.message, "error"); }
  };

  const deleteEvent = async (ev) => {
    try {
      await api(`kr_events?id=eq.${ev.id}`, { method: "DELETE", prefer: "return=minimal" });
      showToast("🗑️ Event dihapus!"); setConfirmDelete(null); onRefresh();
    } catch (e) { showToast("Error: " + e.message, "error"); }
  };

  const setStatus = async (ev, status) => {
    try {
      await api(`kr_events?id=eq.${ev.id}`, { method: "PATCH", body: JSON.stringify({ status }), prefer: "return=minimal" });
      showToast(`Status diubah ke ${EVENT_STATUS[status].label}`); onRefresh();
    } catch (e) { showToast("Error: " + e.message, "error"); }
  };

  if (showForm) return (
    <div style={{ maxWidth: 540 }}>
      <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 18, color: "#1a2a5e" }}>{editing ? "✏️ Edit Event" : "✨ Tambah Event"}</div>
      <div style={{ ...CARD, padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <label style={{ fontSize: 13, color: "#7a8ab0", display: "block", marginBottom: 7, fontWeight: 600 }}>Tipe *</label>
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
            {Object.entries(EVENT_TYPES).map(([v, t]) => (
              <button key={v} onClick={() => setForm(f => ({ ...f, type: v }))} className="tap-btn" style={{ padding: "8px 14px", border: `2px solid ${form.type === v ? t.color : "#d0e5f5"}`, borderRadius: 10, background: form.type === v ? t.bg : "#fff", color: form.type === v ? t.color : "#7a8ab0", fontWeight: form.type === v ? 700 : 500, cursor: "pointer", fontSize: 12 }}>{t.label}</button>
            ))}
          </div>
        </div>
        {[["name","Nama Event *","text","Contoh: Tomoland Vol 4"],["location","Lokasi","text","Kota / Venue"],["notes","Catatan","text","Opsional"]].map(([k,l,t,ph]) => (
          <div key={k}>
            <label style={{ fontSize: 13, color: "#7a8ab0", display: "block", marginBottom: 5, fontWeight: 600 }}>{l}</label>
            <input type={t} placeholder={ph} value={form[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))}
              style={{ width: "100%", padding: "10px 13px", border: "1.5px solid #d0e5f5", borderRadius: 10, fontSize: 14, boxSizing: "border-box" }} />
          </div>
        ))}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {[["start_date","Tanggal Mulai"],["end_date","Tanggal Selesai"]].map(([k,l]) => (
            <div key={k}>
              <label style={{ fontSize: 13, color: "#7a8ab0", display: "block", marginBottom: 5, fontWeight: 600 }}>{l}</label>
              <input type="date" value={form[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))}
                style={{ width: "100%", padding: "10px 13px", border: "1.5px solid #d0e5f5", borderRadius: 10, fontSize: 14, boxSizing: "border-box" }} />
            </div>
          ))}
        </div>
        <div>
          <label style={{ fontSize: 13, color: "#7a8ab0", display: "block", marginBottom: 7, fontWeight: 600 }}>Status</label>
          <div style={{ display: "flex", gap: 7 }}>
            {Object.entries(EVENT_STATUS).map(([v, s]) => (
              <button key={v} onClick={() => setForm(f => ({ ...f, status: v }))} className="tap-btn" style={{ flex: 1, padding: "8px 0", border: `2px solid ${form.status === v ? s.color : "#d0e5f5"}`, borderRadius: 10, background: form.status === v ? s.bg : "#fff", color: form.status === v ? s.color : "#7a8ab0", fontWeight: form.status === v ? 700 : 500, cursor: "pointer", fontSize: 12 }}>{s.label}</button>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={save} className="tap-btn" style={{ flex: 1, padding: "13px 0", background: "linear-gradient(135deg,#ee4181,#2d4ba0)", color: "#fff", border: "none", borderRadius: 12, fontWeight: 700, cursor: "pointer", fontSize: 14 }}>{editing ? "💾 Simpan" : "✨ Tambah"}</button>
          <button onClick={() => setShowForm(false)} className="tap-btn" style={{ flex: 1, padding: "13px 0", background: "#fff", color: "#1a2a5e", border: "1.5px solid #d0e5f5", borderRadius: 12, fontWeight: 600, cursor: "pointer", fontSize: 14 }}>Batal</button>
        </div>
      </div>
    </div>
  );

  return (
    <div>
      {confirmDelete && <ConfirmModal title="Hapus Event?" message={`Hapus event "${confirmDelete.name}" secara permanen?`} onConfirm={() => deleteEvent(confirmDelete)} onCancel={() => setConfirmDelete(null)} />}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={{ fontWeight: 800, fontSize: 18, color: "#1a2a5e" }}>🎪 Master Event</div>
        <button onClick={openNew} className="tap-btn" style={{ padding: "10px 18px", background: "linear-gradient(135deg,#ee4181,#2d4ba0)", color: "#fff", border: "none", borderRadius: 12, fontWeight: 700, cursor: "pointer", fontSize: 13 }}>+ Tambah Event</button>
      </div>
      {events.length === 0 ? (
        <div style={{ ...CARD, padding: 60, textAlign: "center", color: "#7a8ab0" }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>🎪</div>
          <div style={{ fontWeight: 600 }}>Belum ada event</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>Tambah event pertama untuk mulai tracking laporan</div>
          <button onClick={openNew} className="tap-btn" style={{ marginTop: 16, padding: "10px 22px", background: "linear-gradient(135deg,#ee4181,#2d4ba0)", color: "#fff", border: "none", borderRadius: 12, fontWeight: 700, cursor: "pointer" }}>Tambah Sekarang</button>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>
          {events.map(ev => {
            const t = EVENT_TYPES[ev.type] || EVENT_TYPES.other;
            const s = EVENT_STATUS[ev.status] || EVENT_STATUS.upcoming;
            return (
              <div key={ev.id} style={{ ...CARD, padding: 18 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#1a2a5e", marginBottom: 4 }}>{ev.name}</div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 20, background: t.bg, color: t.color, fontWeight: 700 }}>{t.label}</span>
                      <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 20, background: s.bg, color: s.color, fontWeight: 700 }}>{s.label}</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => openEdit(ev)} className="tap-btn" style={{ padding: "5px 10px", background: "#e4f3fd", color: "#2d4ba0", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>✏️</button>
                    <button onClick={() => setConfirmDelete(ev)} className="tap-btn" style={{ padding: "5px 8px", background: "#fee2e2", color: "#ef4444", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 12 }}>🗑️</button>
                  </div>
                </div>
                {ev.location && <div style={{ fontSize: 12, color: "#7a8ab0", marginBottom: 6 }}>📍 {ev.location}</div>}
                {(ev.start_date || ev.end_date) && (
                  <div style={{ fontSize: 12, color: "#7a8ab0", marginBottom: 10 }}>
                    📅 {ev.start_date ? new Date(ev.start_date).toLocaleDateString("id-ID", { day:"2-digit", month:"short", year:"numeric" }) : "—"}
                    {ev.end_date && ev.end_date !== ev.start_date ? ` – ${new Date(ev.end_date).toLocaleDateString("id-ID", { day:"2-digit", month:"short", year:"numeric" })}` : ""}
                  </div>
                )}
                <div style={{ display: "flex", gap: 6, borderTop: "1px solid #d0e5f5", paddingTop: 10 }}>
                  {Object.entries(EVENT_STATUS).filter(([v]) => v !== ev.status).map(([v, st]) => (
                    <button key={v} onClick={() => setStatus(ev, v)} className="tap-btn" style={{ flex: 1, padding: "5px 0", border: `1.5px solid ${st.color}`, borderRadius: 8, background: "#fff", color: st.color, fontWeight: 600, cursor: "pointer", fontSize: 11 }}>{st.label}</button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── LAPORAN ──────────────────────────────────────────────────────────────────
function Laporan({ orders, events, reimburses, items, isMobile }) {
  const [selectedEvent, setSelectedEvent] = useState(null);

  const eventMap = Object.fromEntries((events||[]).map(e => [e.id, e]));
  const EVENT_TYPES_L = { art_market: "🛍️ Art Market", workshop: "🎨 Workshop", online: "🌐 Online", other: "📌 Lainnya" };

  // Group orders by event
  const eventStats = (events||[]).map(ev => {
    const evOrders = orders.filter(o => o.event_id === ev.id && o.status === "paid");
    const omzet = evOrders.reduce((s, o) => s + (o.total||0), 0);
    const evReimburse = reimburses.filter(r => {
      const name = (r.event||"").toLowerCase();
      return name.includes(ev.name.toLowerCase().split(" ")[0]);
    }).reduce((s, r) => s + (r.amount||0), 0);
    const profit = omzet - evReimburse;
    const margin = omzet > 0 ? Math.round((profit / omzet) * 100) : 0;
    return { ev, omzet, reimburse: evReimburse, profit, margin, txCount: evOrders.length, orders: evOrders };
  }).filter(s => s.omzet > 0 || s.ev.status !== "upcoming");

  // Non-event orders
  const noEventOrders = orders.filter(o => !o.event_id && o.status === "paid");
  const noEventOmzet = noEventOrders.reduce((s, o) => s + (o.total||0), 0);

  const totalOmzet = eventStats.reduce((s, e) => s + e.omzet, 0) + noEventOmzet;
  const totalReimburse = reimburses.filter(r => r.status === "unpaid").reduce((s, r) => s + (r.amount||0), 0);
  const totalProfit = eventStats.reduce((s, e) => s + e.profit, 0);

  // Top items for selected event
  const getTopItems = async (evId) => {};

  const maxOmzet = Math.max(...eventStats.map(e => e.omzet), 1);

  return (
    <div>
      {/* Stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2,1fr)" : "repeat(4,1fr)", gap: isMobile ? 10 : 14, marginBottom: 20 }}>
        {[
          { label: "Total Omzet", value: formatRp(totalOmzet), icon: "📈", accent: "#ee4181" },
          { label: "Total Reimburse", value: formatRp(totalReimburse), icon: "💸", accent: "#f59e0b" },
          { label: "Estimasi Profit", value: formatRp(totalProfit), icon: "✨", accent: "#10b981" },
          { label: "Total Event", value: `${eventStats.length} event`, icon: "🎪", accent: "#2d4ba0" },
        ].map(s => (
          <div key={s.label} style={{ ...CARD, padding: isMobile ? "12px 14px" : "16px 18px", borderTop: `4px solid ${s.accent}` }}>
            <div style={{ fontSize: 11, color: "#7a8ab0", marginBottom: 5, fontWeight: 600 }}>{s.icon} {s.label}</div>
            <div style={{ fontSize: isMobile ? 15 : 19, fontWeight: 800, color: s.accent }}>{s.value}</div>
          </div>
        ))}
      </div>

      {eventStats.length === 0 ? (
        <div style={{ ...CARD, padding: 60, textAlign: "center", color: "#7a8ab0" }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>📈</div>
          <div style={{ fontWeight: 600 }}>Belum ada data laporan</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>Tambah event di tab Events, lalu pilih event saat transaksi di Kasir</div>
        </div>
      ) : (
        <>
          {/* Bar chart */}
          <div style={{ ...CARD, padding: 18, marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: "#1a2a5e" }}>Perbandingan omzet vs profit</div>
              <div style={{ display: "flex", gap: 10, fontSize: 11, color: "#7a8ab0" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: "#ee4181", display: "inline-block" }}></span>Omzet</span>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: "#10b981", display: "inline-block" }}></span>Profit</span>
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "flex-end", height: 120, paddingBottom: 24, position: "relative" }}>
              {eventStats.map(({ ev, omzet, profit }) => {
                const h = Math.round((omzet / maxOmzet) * 90);
                const ph = omzet > 0 ? Math.max(2, Math.round((profit / omzet) * h)) : 0;
                return (
                  <div key={ev.id} onClick={() => setSelectedEvent(selectedEvent?.ev.id === ev.id ? null : { ev, omzet, profit, reimburse: eventStats.find(e=>e.ev.id===ev.id)?.reimburse||0, txCount: eventStats.find(e=>e.ev.id===ev.id)?.txCount||0, margin: eventStats.find(e=>e.ev.id===ev.id)?.margin||0 })}
                    style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%", gap: 3, cursor: "pointer" }}>
                    <div style={{ fontSize: 10, color: "#1a2a5e", fontWeight: 600 }}>{formatRp(omzet).replace("Rp\xa0","").replace(".000","rb")}</div>
                    <div style={{ width: "100%", display: "flex", gap: 2, alignItems: "flex-end", justifyContent: "center" }}>
                      <div style={{ width: "44%", height: h, background: selectedEvent?.ev?.id === ev.id ? "#c0185a" : "#ee4181", borderRadius: "3px 3px 0 0", transition: "all 0.2s" }}></div>
                      <div style={{ width: "44%", height: ph, background: selectedEvent?.ev?.id === ev.id ? "#0a9060" : "#10b981", borderRadius: "3px 3px 0 0", transition: "all 0.2s" }}></div>
                    </div>
                    <div style={{ fontSize: 10, color: "#7a8ab0", textAlign: "center", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ev.name.split(" ").slice(0,2).join(" ")}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Event cards + detail */}
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : selectedEvent ? "1fr 320px" : "1fr", gap: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(280px,1fr))", gap: 12 }}>
              {eventStats.map(({ ev, omzet, profit, reimburse, margin, txCount }) => {
                const t = EVENT_TYPES_L[ev.type] || "📌";
                const isSelected = selectedEvent?.ev?.id === ev.id;
                return (
                  <div key={ev.id} onClick={() => setSelectedEvent(isSelected ? null : { ev, omzet, profit, reimburse, txCount, margin })}
                    style={{ ...CARD, padding: 16, cursor: "pointer", border: `${isSelected ? "2px" : "1.5px"} solid ${isSelected ? "#2d4ba0" : "#d0e5f5"}`, background: isSelected ? "#e4f3fd" : "#fff" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "#1a2a5e" }}>{ev.name}</div>
                        <div style={{ fontSize: 11, color: "#7a8ab0", marginTop: 2 }}>{t} · {ev.start_date ? new Date(ev.start_date).toLocaleDateString("id-ID", { day:"2-digit", month:"short", year:"numeric" }) : "—"}</div>
                      </div>
                      <div style={{ fontSize: 12, padding: "3px 8px", borderRadius: 20, background: margin >= 60 ? "#d1fae5" : margin >= 40 ? "#fef3c7" : "#fee2e2", color: margin >= 60 ? "#10b981" : margin >= 40 ? "#f59e0b" : "#ef4444", fontWeight: 700 }}>
                        {margin}% margin
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 10 }}>
                      <div><div style={{ fontSize: 10, color: "#7a8ab0" }}>Omzet</div><div style={{ fontSize: 13, fontWeight: 700, color: "#ee4181" }}>{formatRp(omzet)}</div></div>
                      <div><div style={{ fontSize: 10, color: "#7a8ab0" }}>Profit</div><div style={{ fontSize: 13, fontWeight: 700, color: "#10b981" }}>{formatRp(profit)}</div></div>
                      <div><div style={{ fontSize: 10, color: "#7a8ab0" }}>Transaksi</div><div style={{ fontSize: 13, fontWeight: 700, color: "#1a2a5e" }}>{txCount}</div></div>
                    </div>
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#7a8ab0", marginBottom: 3 }}>
                        <span>Margin profit</span><span style={{ color: "#1a2a5e", fontWeight: 600 }}>{margin}%</span>
                      </div>
                      <div style={{ height: 5, background: "#f0f0f0", borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${margin}%`, background: margin >= 60 ? "#10b981" : margin >= 40 ? "#f59e0b" : "#ef4444", borderRadius: 3, transition: "width 0.5s" }}></div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Detail panel */}
            {selectedEvent && (
              <div style={{ ...CARD, padding: 18, height: "fit-content", position: isMobile ? "relative" : "sticky", top: 100 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: "#1a2a5e" }}>{selectedEvent.ev.name}</div>
                  <button onClick={() => setSelectedEvent(null)} style={{ background: "#fde8f0", border: "none", cursor: "pointer", color: "#ee4181", borderRadius: 8, width: 28, height: 28, fontSize: 16 }}>×</button>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
                  {[
                    { label: "Omzet kotor", value: formatRp(selectedEvent.omzet), color: "#ee4181" },
                    { label: "Reimbursement", value: formatRp(selectedEvent.reimburse), color: "#f59e0b" },
                    { label: "Profit bersih", value: formatRp(selectedEvent.profit), color: "#10b981" },
                    { label: "Transaksi", value: selectedEvent.txCount, color: "#2d4ba0" },
                  ].map(s => (
                    <div key={s.label} style={{ background: "#f8f8f8", borderRadius: 10, padding: "10px 12px" }}>
                      <div style={{ fontSize: 10, color: "#7a8ab0", marginBottom: 3 }}>{s.label}</div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: s.color }}>{s.value}</div>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 12, color: "#7a8ab0", textAlign: "center", padding: "10px 0", borderTop: "1px dashed #d0e5f5" }}>
                  Klik event lain untuk lihat detailnya
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── CONFIRM MODAL ────────────────────────────────────────────────────────────
function ConfirmModal({ title, message, onConfirm, onCancel }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={onCancel} style={{ position: "absolute", inset: 0, background: "rgba(45,26,53,0.5)" }} />
      <div style={{ ...CARD, padding: 28, maxWidth: 380, width: "100%", position: "relative", zIndex: 1, animation: "slideIn 0.2s ease" }}>
        <div style={{ fontSize: 36, textAlign: "center", marginBottom: 12 }}>⚠️</div>
        <div style={{ fontWeight: 800, fontSize: 17, color: "#1a2a5e", textAlign: "center", marginBottom: 8 }}>{title}</div>
        <div style={{ fontSize: 14, color: "#7a8ab0", textAlign: "center", marginBottom: 24, lineHeight: 1.6 }}>{message}</div>
        <div style={{ background: "#fff8e6", border: "1.5px solid #fcd97a", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#a86a00", marginBottom: 20, textAlign: "center" }}>
          ⚠️ Tindakan ini <b>tidak bisa dibatalkan</b>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onCancel} className="tap-btn" style={{ flex: 1, padding: "13px 0", background: "#fff", color: "#1a2a5e", border: "1.5px solid #d4c8e0", borderRadius: 12, fontWeight: 600, cursor: "pointer", fontSize: 14 }}>Batal</button>
          <button onClick={onConfirm} className="tap-btn" style={{ flex: 1, padding: "13px 0", background: "linear-gradient(135deg,#ef4444,#dc2626)", color: "#fff", border: "none", borderRadius: 12, fontWeight: 700, cursor: "pointer", fontSize: 14 }}>🗑️ Hapus Permanen</button>
        </div>
      </div>
    </div>
  );
}

// ─── SETUP ────────────────────────────────────────────────────────────────────
function Setup({ setupSql, showToast, onRefresh }) {
  const [status, setStatus] = useState(null);
  const [testing, setTesting] = useState(false);

  const testConn = async () => {
    setTesting(true); setStatus(null);
    try {
      await api("kr_items?limit=1");
      setStatus({ ok: true, msg: "✅ Terhubung! Sistem siap digunakan." });
      onRefresh();
    } catch (e) {
      if (e.message.includes("does not exist") || e.message.includes("42P01")) {
        setStatus({ ok: false, msg: "⚠️ Tabel belum ada. Jalankan SQL di bawah." });
      } else {
        setStatus({ ok: false, msg: "❌ Error: " + e.message });
      }
    }
    setTesting(false);
  };

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ fontWeight: 800, fontSize: 20, marginBottom: 6, color: "#1a2a5e" }}>⚙️ Setup Database</div>
      <div style={{ fontSize: 14, color: "#7a8ab0", marginBottom: 20, lineHeight: 1.7 }}>Jalankan langkah berikut untuk menginisialisasi database KURESAPI di Supabase.</div>

      <div style={{ ...CARD, padding: 20, marginBottom: 14 }}>
        <div style={{ fontWeight: 700, marginBottom: 12, color: "#1a2a5e" }}>Langkah 1 — Cek koneksi</div>
        <button onClick={testConn} disabled={testing} className="tap-btn" style={{ padding: "12px 22px", background: testing ? "#ddd" : "linear-gradient(135deg,#2d4ba0,#1a3578)", color: "#fff", border: "none", borderRadius: 12, fontWeight: 700, cursor: testing ? "not-allowed" : "pointer", fontSize: 14 }}>
          {testing ? "⏳ Mengecek..." : "🔌 Test Koneksi"}
        </button>
        {status && (
          <div style={{ marginTop: 12, padding: "12px 16px", borderRadius: 10, background: status.ok ? "#d1fae5" : "#fee2e2", color: status.ok ? "#10b981" : "#ef4444", fontSize: 14, fontWeight: 600 }}>{status.msg}</div>
        )}
      </div>

      <div style={{ ...CARD, padding: 20, marginBottom: 14 }}>
        <div style={{ fontWeight: 700, marginBottom: 4, color: "#1a2a5e" }}>Langkah 2 — Buat tabel</div>
        <div style={{ fontSize: 13, color: "#7a8ab0", marginBottom: 10 }}>Buka <b>Supabase → SQL Editor</b>, paste & Run:</div>
        <pre style={{ background: "#1e1e2e", color: "#cdd6f4", borderRadius: 10, padding: 14, fontSize: 11, overflow: "auto", maxHeight: 300, lineHeight: 1.7 }}>{setupSql}</pre>
        <button onClick={() => { navigator.clipboard.writeText(setupSql); showToast("📋 SQL disalin!"); }} className="tap-btn" style={{ marginTop: 12, padding: "10px 18px", background: "#fff", color: "#1a2a5e", border: "1.5px solid #d4c8e0", borderRadius: 10, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>📋 Salin SQL</button>
      </div>

      <div style={{ background: "#fde8f0", borderRadius: 14, border: "1.5px solid #f5a8c4", padding: 18 }}>
        <div style={{ fontWeight: 700, color: "#ee4181", marginBottom: 8 }}>📝 Tabel yang dibuat</div>
        <div style={{ fontSize: 13, color: "#1a2a5e", lineHeight: 2 }}>
          {["kr_items · Produk, workshop & perlengkapan","kr_stock_moves · Riwayat mutasi stok","kr_orders · Transaksi penjualan","kr_order_items · Detail item per transaksi"].map(t => (
            <div key={t}><span style={{ background: "#e4f3fd", color: "#2d4ba0", borderRadius: 6, padding: "2px 8px", fontWeight: 700, marginRight: 6, fontSize: 12 }}>{t.split("·")[0].trim()}</span>{t.split("·")[1]}</div>
          ))}
        </div>
      </div>
    </div>
  );
}
