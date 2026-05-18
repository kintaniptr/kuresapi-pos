import { useState, useEffect, useCallback, useRef } from "react";

const SUPABASE_URL = "https://iqhvdvvuonqxlnbnefgb.supabase.co";
const SUPABASE_KEY = "sb_publishable_nstXpLON-OZBhLpNAE5bdg_lMVSgGw9";

// ─── KREDENSIAL LOGIN ─── v2
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
  notes text, created_at timestamptz default now(), created_by text
);
create table if not exists kr_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references kr_orders(id) on delete cascade,
  item_id uuid references kr_items(id),
  item_name text, qty int not null, price numeric(12,2), subtotal numeric(12,2)
);`;

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
  { id: "pos",       icon: "🛒", label: "Kasir" },
  { id: "inventory", icon: "📦", label: "Inventory" },
  { id: "stock",     icon: "↕️", label: "Stok" },
  { id: "sales",     icon: "📊", label: "Penjualan" },
  { id: "setup",     icon: "⚙️", label: "Setup" },
];

export default function App() {
  const [tab, setTab] = useState("pos");
  const [items, setItems] = useState([]);
  const [orders, setOrders] = useState([]);
  const [moves, setMoves] = useState([]);
  const [toast, setToast] = useState(null);
  const [user, setUser] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem("kr_user")) || null; } catch { return null; }
  });
  const isMobile = useIsMobile();

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleLogin = (u) => {
    setUser(u);
    try { sessionStorage.setItem("kr_user", JSON.stringify(u)); } catch {}
  };

  const handleLogout = () => {
    setUser(null);
    try { sessionStorage.removeItem("kr_user"); } catch {}
  };

  // Tampilkan login screen kalau belum login
  if (!user) return <LoginScreen onLogin={handleLogin} isMobile={isMobile} />;

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const loadItems = useCallback(async () => {
    try { setItems(await api("kr_items?is_active=eq.true&order=name.asc")); }
    catch (e) { if (!e.message.includes("does not exist")) showToast("Error: " + e.message, "error"); }
  }, []);
  const loadOrders = useCallback(async () => {
    try { setOrders(await api("kr_orders?order=created_at.desc&limit=100")); } catch {}
  }, []);
  const loadMoves = useCallback(async () => {
    try { setMoves(await api("kr_stock_moves?order=created_at.desc&limit=200")); } catch {}
  }, []);

  useEffect(() => { loadItems(); loadOrders(); loadMoves(); }, []);

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
        <img src="/logo.png" alt="KURESAPI" style={{ width: 38, height: 38, borderRadius: 10, objectFit: "cover", flexShrink: 0 }} />
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
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} className="tap-btn" style={{ padding: "13px 18px", border: "none", background: "none", cursor: "pointer", borderBottom: tab === t.id ? "3px solid #2d4ba0" : "3px solid transparent", color: tab === t.id ? "#2d4ba0" : "#7a8ab0", fontWeight: tab === t.id ? 700 : 500, fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 16 }}>{t.icon}</span> {t.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Content ── */}
      <div style={{ padding: isMobile ? "16px" : "28px", maxWidth: 1320, margin: "0 auto" }}>
        {tab === "pos"       && <POS items={items} onRefresh={() => { loadItems(); loadOrders(); }} showToast={showToast} isMobile={isMobile} />}
        {tab === "inventory" && <Inventory items={items} onRefresh={loadItems} showToast={showToast} isMobile={isMobile} />}
        {tab === "stock"     && <StockMoves items={items} moves={moves} onRefresh={() => { loadItems(); loadMoves(); }} showToast={showToast} isMobile={isMobile} />}
        {tab === "sales"     && <Sales orders={orders} items={items} onRefresh={loadOrders} showToast={showToast} isMobile={isMobile} />}
        {tab === "setup"     && <Setup setupSql={SETUP_SQL} showToast={showToast} onRefresh={() => { loadItems(); loadOrders(); loadMoves(); }} />}
      </div>

      {/* ── Mobile Bottom Nav ── */}
      {isMobile && (
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "#fff", borderTop: "1.5px solid #d4c8e0", display: "flex", zIndex: 200, boxShadow: "0 -4px 20px rgba(233,30,140,0.1)" }}>
          {TABS.map(t => (
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
          <img src="/logo.png" alt="KURESAPI" onError={e => { e.target.style.display='none'; }} style={{ width: 80, height: 80, borderRadius: 20, objectFit: "contain", marginBottom: 12, mixBlendMode: "screen" }} />
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
function POS({ items, onRefresh, showToast, isMobile }) {
  const [cart, setCart] = useState([]);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [payment, setPayment] = useState("cash");
  const [customer, setCustomer] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [discount, setDiscount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [invoice, setInvoice] = useState(null);
  const [showCart, setShowCart] = useState(false);

  const filtered = items.filter(i =>
    (typeFilter === "all" || i.type === typeFilter) &&
    (i.name.toLowerCase().includes(search.toLowerCase()) || (i.sku || "").toLowerCase().includes(search.toLowerCase()))
  );

  const addToCart = (item) => {
    setCart(c => {
      const ex = c.find(x => x.id === item.id);
      if (ex) return c.map(x => x.id === item.id ? { ...x, qty: x.qty + 1 } : x);
      return [...c, { ...item, qty: 1 }];
    });
  };

  const updateQty = (id, qty) => {
    if (qty <= 0) setCart(c => c.filter(x => x.id !== id));
    else setCart(c => c.map(x => x.id === id ? { ...x, qty } : x));
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
        body: JSON.stringify({ order_no: orderNo, customer_name: customer || "Umum", customer_phone: customerPhone, payment_method: payment, subtotal, discount, total, status: "paid" }),
      });
      await api("kr_order_items", { method: "POST", body: JSON.stringify(cart.map(x => ({ order_id: order.id, item_id: x.id, item_name: x.name, qty: x.qty, price: x.price, subtotal: x.price * x.qty }))), prefer: "return=minimal" });
      const stockItems = cart.filter(x => x.type !== "workshop");
      if (stockItems.length) {
        await api("kr_stock_moves", { method: "POST", body: JSON.stringify(stockItems.map(x => ({ item_id: x.id, direction: "out", qty: x.qty, note: `Penjualan ${orderNo}`, ref_id: order.id }))), prefer: "return=minimal" });
        for (const m of stockItems) {
          const item = items.find(i => i.id === m.id);
          if (item) await api(`kr_items?id=eq.${m.id}`, { method: "PATCH", body: JSON.stringify({ stock: (item.stock || 0) - m.qty }), prefer: "return=minimal" });
        }
      }
      setInvoice({ ...order, items: cart, customer, customerPhone, payment, subtotal, discount, total });
      setCart([]); setCustomer(""); setCustomerPhone(""); setDiscount(0); setShowCart(false);
      onRefresh();
      showToast(`✨ Transaksi ${orderNo} berhasil!`);
    } catch (e) { showToast("Gagal: " + e.message, "error"); }
    setSaving(false);
  };

  if (invoice) return <InvoiceView invoice={invoice} onClose={() => setInvoice(null)} isMobile={isMobile} />;

  const CartPanel = () => (
    <div style={{ ...CARD, padding: 18 }}>
      <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 14, color: "#1a2a5e", display: "flex", alignItems: "center", gap: 8 }}>
        🛒 Keranjang
        {cart.length > 0 && <span style={{ background: "#2d4ba0", color: "#fff", borderRadius: 20, fontSize: 11, padding: "2px 8px", fontWeight: 700 }}>{cartCount}</span>}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
        <input placeholder="👤 Nama customer" value={customer} onChange={e => setCustomer(e.target.value)} style={{ width: "100%", padding: "9px 13px", border: "1.5px solid #d4c8e0", borderRadius: 10, fontSize: 14 }} />
        <input placeholder="📱 No. HP" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} style={{ width: "100%", padding: "9px 13px", border: "1.5px solid #d4c8e0", borderRadius: 10, fontSize: 14 }} />
      </div>
      {cart.length === 0 ? (
        <div style={{ textAlign: "center", padding: "24px 0", color: "#7a8ab0", fontSize: 13 }}>
          <div style={{ fontSize: 32 }}>🛍️</div>Pilih produk dulu ya!
        </div>
      ) : (
        <div style={{ marginBottom: 14, maxHeight: isMobile ? 200 : 260, overflowY: "auto" }}>
          {cart.map(item => (
            <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px solid #d4c8e0" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#1a2a5e", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</div>
                <div style={{ fontSize: 12, color: "#7a8ab0" }}>{formatRp(item.price)}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
                <button onClick={() => updateQty(item.id, item.qty - 1)} className="tap-btn" style={{ width: 28, height: 28, border: "1.5px solid #d4c8e0", borderRadius: 8, background: "#fde8f0", cursor: "pointer", fontSize: 15, color: "#ee4181", fontWeight: 700 }}>−</button>
                <span style={{ fontSize: 13, fontWeight: 700, minWidth: 22, textAlign: "center" }}>{item.qty}</span>
                <button onClick={() => updateQty(item.id, item.qty + 1)} className="tap-btn" style={{ width: 28, height: 28, border: "1.5px solid #d4c8e0", borderRadius: 8, background: "#e4f3fd", cursor: "pointer", fontSize: 15, color: "#2d4ba0", fontWeight: 700 }}>+</button>
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#ee4181", minWidth: 72, textAlign: "right", flexShrink: 0 }}>{formatRp(item.price * item.qty)}</div>
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

  return (
    <div>
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
          <option value="equipment">{isMobile ? "Perlengkapan" : "🔧 Perlengkapan"}</option>
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
                const outOfStock = item.type !== "workshop" && item.stock <= 0;
                return (
                  <button key={item.id} onClick={() => { if (!outOfStock) { addToCart(item); } }} disabled={outOfStock} className="tap-btn" style={{ background: outOfStock ? "#f5f5f5" : "#fff", border: `2px solid ${outOfStock ? "#e5e5e5" : c.border}`, borderRadius: 14, padding: 12, cursor: outOfStock ? "not-allowed" : "pointer", textAlign: "left", opacity: outOfStock ? 0.5 : 1, width: "100%" }}>
                    <div style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, display: "inline-block", marginBottom: 6, background: c.bg, color: c.text, fontWeight: 700 }}>{c.label}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4, lineHeight: 1.3, color: "#1a2a5e" }}>{item.name}</div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: "#ee4181" }}>{formatRp(item.price)}</div>
                    {item.type !== "workshop" && <div style={{ fontSize: 11, color: item.stock <= 5 ? "#ef4444" : "#7a8ab0", marginTop: 3 }}>{outOfStock ? "❌ Habis" : `Stok: ${item.stock}`}</div>}
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
                <CartPanel />
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
                  const outOfStock = item.type !== "workshop" && item.stock <= 0;
                  return (
                    <button key={item.id} onClick={() => !outOfStock && addToCart(item)} disabled={outOfStock} className="tap-btn" style={{ background: outOfStock ? "#f5f5f5" : "#fff", border: `2px solid ${outOfStock ? "#e5e5e5" : c.border}`, borderRadius: 16, padding: 16, cursor: outOfStock ? "not-allowed" : "pointer", textAlign: "left", opacity: outOfStock ? 0.5 : 1, boxShadow: `0 2px 10px ${c.bg}` }}>
                      <div style={{ fontSize: 11, padding: "3px 9px", borderRadius: 20, display: "inline-block", marginBottom: 8, background: c.bg, color: c.text, fontWeight: 700 }}>{c.label}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 5, lineHeight: 1.35, color: "#1a2a5e" }}>{item.name}</div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: "#ee4181" }}>{formatRp(item.price)}</div>
                      {item.type !== "workshop" && <div style={{ fontSize: 11, color: item.stock <= 5 ? "#ef4444" : "#7a8ab0", marginTop: 5 }}>{outOfStock ? "❌ Habis" : `📦 Stok: ${item.stock}`}</div>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div style={{ position: "sticky", top: 110 }}>
            <CartPanel />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── INVOICE ──────────────────────────────────────────────────────────────────
function InvoiceView({ invoice, onClose, isMobile }) {
  return (
    <div style={{ maxWidth: 480, margin: "0 auto" }}>
      <div style={{ ...CARD, padding: isMobile ? 20 : 32 }}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <img src="/logo.png" alt="KURESAPI" style={{ width: 56, height: 56, borderRadius: 14, objectFit: "cover", margin: "0 auto 10px", display: "block" }} />
          <div style={{ fontWeight: 900, fontSize: 20, letterSpacing: 2, color: "#1a2a5e" }}>KURESAPI</div>
          <div style={{ fontSize: 12, color: "#7a8ab0" }}>Bukti Pembayaran</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#ee4181", marginTop: 4 }}>{invoice.order_no}</div>
          <div style={{ fontSize: 11, color: "#7a8ab0" }}>{new Date().toLocaleString("id-ID")}</div>
        </div>
        <div style={{ background: "#fde8f0", borderRadius: 10, padding: "10px 14px", marginBottom: 12, fontSize: 13, lineHeight: 1.8 }}>
          <div>👤 <b>{invoice.customer_name || invoice.customer || "Umum"}</b></div>
          {(invoice.customer_phone || invoice.customerPhone) && <div>📱 {invoice.customer_phone || invoice.customerPhone}</div>}
          <div>💳 {(invoice.payment_method || invoice.payment) === "cash" ? "💵 Tunai" : "📲 QRIS"}</div>
        </div>
        <div style={{ marginBottom: 12 }}>
          {invoice.items?.map((item, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "5px 0", borderBottom: "1px dashed #d4c8e0" }}>
              <span>{item.name} × {item.qty}</span>
              <span style={{ fontWeight: 600 }}>{formatRp(item.price * item.qty)}</span>
            </div>
          ))}
        </div>
        <div style={{ background: "#e4f3fd", borderRadius: 10, padding: "12px 14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#7a8ab0", marginBottom: 4 }}>
            <span>Subtotal</span><span>{formatRp(invoice.subtotal)}</span>
          </div>
          {invoice.discount > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#ef4444", marginBottom: 4 }}>
              <span>🏷️ Diskon</span><span>- {formatRp(invoice.discount)}</span>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: 18, marginTop: 6 }}>
            <span>TOTAL</span><span style={{ color: "#ee4181" }}>{formatRp(invoice.total)}</span>
          </div>
        </div>
        <div style={{ textAlign: "center", marginTop: 16, fontSize: 13, color: "#7a8ab0" }}>🌸 Terima kasih sudah berbelanja! 🌸</div>
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
        <button onClick={() => window.print()} className="tap-btn" style={{ flex: 1, padding: "13px 0", background: "linear-gradient(135deg,#2d4ba0,#1a3578)", color: "#fff", border: "none", borderRadius: 12, fontWeight: 700, cursor: "pointer", fontSize: 14 }}>🖨️ Print</button>
        <button onClick={onClose} className="tap-btn" style={{ flex: 1, padding: "13px 0", background: "#fff", color: "#1a2a5e", border: "1.5px solid #d4c8e0", borderRadius: 12, fontWeight: 600, cursor: "pointer", fontSize: 14 }}>← Kembali</button>
      </div>
    </div>
  );
}

// ─── INVENTORY ────────────────────────────────────────────────────────────────
function Inventory({ items, onRefresh, showToast, isMobile }) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [filter, setFilter] = useState("all");
  const [form, setForm] = useState({ name: "", type: "product", sku: "", price: "", cost: "", stock: "", unit: "pcs", description: "" });

  const openNew = () => { setForm({ name: "", type: "product", sku: "", price: "", cost: "", stock: "", unit: "pcs", description: "" }); setEditing(null); setShowForm(true); };
  const openEdit = (item) => { setForm({ ...item, price: item.price || "", cost: item.cost || "", stock: item.stock || "" }); setEditing(item.id); setShowForm(true); };

  const save = async () => {
    if (!form.name.trim()) return showToast("Nama wajib diisi", "error");
    try {
      const payload = { ...form, price: Number(form.price) || 0, cost: Number(form.cost) || 0, stock: Number(form.stock) || 0 };
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

  const [confirmDelete, setConfirmDelete] = useState(null);

  const deleteItem = async (item) => {
    try {
      await api(`kr_items?id=eq.${item.id}`, { method: "DELETE", prefer: "return=minimal" });
      showToast("🗑️ Item dihapus permanen!"); setConfirmDelete(null); onRefresh();
    } catch (e) { showToast("Error: " + e.message, "error"); }
  };

  const filtered = items.filter(i => filter === "all" || i.type === filter);
  const stats = { all: items.length, product: items.filter(x => x.type === "product").length, workshop: items.filter(x => x.type === "workshop").length, equipment: items.filter(x => x.type === "equipment").length };

  if (showForm) return (
    <div style={{ maxWidth: 540 }}>
      <div style={{ fontWeight: 800, fontSize: isMobile ? 17 : 20, marginBottom: 18, color: "#1a2a5e" }}>{editing ? "✏️ Edit Item" : "✨ Tambah Item Baru"}</div>
      <div style={{ ...CARD, padding: isMobile ? 18 : 28, display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <label style={{ fontSize: 13, color: "#7a8ab0", display: "block", marginBottom: 7, fontWeight: 600 }}>Tipe Item *</label>
          <div style={{ display: "flex", gap: 7 }}>
            {[["product", "📦 Produk"], ["workshop", "🎓 Workshop"], ["equipment", "🔧 Perlengkapan"]].map(([v, l]) => {
              const c = ITEM_COLORS[v];
              return <button key={v} onClick={() => setForm(f => ({ ...f, type: v }))} className="tap-btn" style={{ flex: 1, padding: "10px 0", border: `2px solid ${form.type === v ? c.text : "#d4c8e0"}`, borderRadius: 10, background: form.type === v ? c.bg : "#fff", color: form.type === v ? c.text : "#7a8ab0", fontWeight: form.type === v ? 700 : 500, cursor: "pointer", fontSize: isMobile ? 11 : 12 }}>{l}</button>;
            })}
          </div>
        </div>
        {[["name","Nama *","text","Nama produk / workshop..."],["sku","SKU / Kode","text","Opsional"],["unit","Satuan","text","pcs, lembar, slot, dll"],["price","💰 Harga Jual (Rp) *","number","0"],["cost","📉 Harga Modal (Rp)","number","0"],["stock","📦 Stok Awal","number","0"]].map(([k,l,t,ph]) => (
          <div key={k}>
            <label style={{ fontSize: 13, color: "#7a8ab0", display: "block", marginBottom: 5, fontWeight: 600 }}>{l}</label>
            <input type={t} placeholder={ph} value={form[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} style={{ width: "100%", padding: "11px 13px", border: "1.5px solid #d4c8e0", borderRadius: 10, fontSize: 15 }} />
          </div>
        ))}
        <div>
          <label style={{ fontSize: 13, color: "#7a8ab0", display: "block", marginBottom: 5, fontWeight: 600 }}>Keterangan</label>
          <textarea rows={2} placeholder="Deskripsi opsional..." value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} style={{ width: "100%", padding: "11px 13px", border: "1.5px solid #d4c8e0", borderRadius: 10, fontSize: 14, resize: "vertical" }} />
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={save} className="tap-btn" style={{ flex: 1, padding: "14px 0", background: "linear-gradient(135deg,#ee4181,#2d4ba0)", color: "#fff", border: "none", borderRadius: 12, fontWeight: 700, cursor: "pointer", fontSize: 15 }}>{editing ? "💾 Simpan" : "✨ Tambah"}</button>
          <button onClick={() => setShowForm(false)} className="tap-btn" style={{ flex: 1, padding: "14px 0", background: "#fff", color: "#1a2a5e", border: "1.5px solid #d4c8e0", borderRadius: 12, fontWeight: 600, cursor: "pointer", fontSize: 15 }}>Batal</button>
        </div>
      </div>
    </div>
  );

  return (
    <div>
      {/* Confirm Delete Modal */}
      {confirmDelete && <ConfirmModal title="Hapus Item?" message={`Hapus "${confirmDelete.name}" secara permanen dari database?`} onConfirm={() => deleteItem(confirmDelete)} onCancel={() => setConfirmDelete(null)} />}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, gap: 10 }}>
        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4, flex: 1 }}>
          {[["all","Semua"],["product","Produk"],["workshop","Workshop"],["equipment","Perlengkapan"]].map(([v,l]) => (
            <button key={v} onClick={() => setFilter(v)} className="tap-btn" style={{ padding: "7px 12px", borderRadius: 20, border: `2px solid ${filter === v ? "#ee4181" : "#d4c8e0"}`, background: filter === v ? "#fde8f0" : "#fff", color: filter === v ? "#ee4181" : "#7a8ab0", fontWeight: filter === v ? 700 : 500, cursor: "pointer", fontSize: 12, whiteSpace: "nowrap", flexShrink: 0 }}>
              {l} <span style={{ opacity: 0.7 }}>({stats[v]})</span>
            </button>
          ))}
        </div>
        <button onClick={openNew} className="tap-btn" style={{ padding: "9px 14px", background: "linear-gradient(135deg,#ee4181,#2d4ba0)", color: "#fff", border: "none", borderRadius: 12, fontWeight: 700, cursor: "pointer", fontSize: 13, flexShrink: 0 }}>+ Tambah</button>
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 0", color: "#7a8ab0" }}>
          <div style={{ fontSize: 48 }}>🌸</div>
          <div style={{ fontWeight: 700, marginTop: 8 }}>Belum ada item</div>
          <button onClick={openNew} className="tap-btn" style={{ marginTop: 12, padding: "11px 22px", background: "linear-gradient(135deg,#ee4181,#2d4ba0)", color: "#fff", border: "none", borderRadius: 12, fontWeight: 700, cursor: "pointer" }}>Tambah Sekarang</button>
        </div>
      ) : isMobile ? (
        /* Mobile: card list */
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map(item => {
            const c = ITEM_COLORS[item.type];
            return (
              <div key={item.id} style={{ ...CARD, padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#1a2a5e", marginBottom: 4 }}>{item.name}</div>
                    <span style={{ fontSize: 11, padding: "3px 9px", borderRadius: 20, background: c.bg, color: c.text, fontWeight: 700 }}>{c.label}</span>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => openEdit(item)} className="tap-btn" style={{ padding: "6px 12px", background: "#e4f3fd", color: "#2d4ba0", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>✏️</button>
                    <button onClick={() => setConfirmDelete(item)} className="tap-btn" style={{ padding: "6px 10px", background: "#fee2e2", color: "#ef4444", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 12 }}>🗑️</button>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 12, fontSize: 13 }}>
                  <div><span style={{ color: "#7a8ab0" }}>Jual: </span><b style={{ color: "#ee4181" }}>{formatRp(item.price)}</b></div>
                  {item.type !== "workshop" && <div><span style={{ color: "#7a8ab0" }}>Stok: </span><b style={{ color: item.stock <= 5 ? "#ef4444" : "#10b981" }}>{item.stock} {item.unit}</b></div>}
                  {item.sku && <div><span style={{ color: "#7a8ab0" }}>SKU: </span>{item.sku}</div>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Desktop: table */
        <div style={{ ...CARD, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "linear-gradient(135deg,#e4f3fd,#fadeeb)" }}>
                {["Nama","Tipe","SKU","Satuan","Harga Jual","Modal","Stok","Aksi"].map(h => (
                  <th key={h} style={{ padding: "12px 14px", textAlign: "left", fontSize: 12, color: "#1a2a5e", fontWeight: 700, borderBottom: "2px solid #d4c8e0" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => {
                const c = ITEM_COLORS[item.type];
                return (
                  <tr key={item.id} style={{ borderBottom: "1px solid #d4c8e0" }}>
                    <td style={{ padding: "12px 14px", fontSize: 14, fontWeight: 600 }}>{item.name}</td>
                    <td style={{ padding: "12px 14px" }}><span style={{ fontSize: 11, padding: "4px 10px", borderRadius: 20, background: c.bg, color: c.text, fontWeight: 700 }}>{c.label}</span></td>
                    <td style={{ padding: "12px 14px", fontSize: 13, color: "#7a8ab0" }}>{item.sku || "—"}</td>
                    <td style={{ padding: "12px 14px", fontSize: 13 }}>{item.unit}</td>
                    <td style={{ padding: "12px 14px", fontSize: 14, fontWeight: 700, color: "#ee4181" }}>{formatRp(item.price)}</td>
                    <td style={{ padding: "12px 14px", fontSize: 13, color: "#7a8ab0" }}>{formatRp(item.cost)}</td>
                    <td style={{ padding: "12px 14px", fontSize: 14, fontWeight: 700, color: item.stock <= 5 && item.type !== "workshop" ? "#ef4444" : "#10b981" }}>{item.type === "workshop" ? "—" : `${item.stock} ${item.unit}`}</td>
                    <td style={{ padding: "12px 14px" }}>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => openEdit(item)} className="tap-btn" style={{ padding: "5px 12px", background: "#e4f3fd", color: "#2d4ba0", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>✏️ Edit</button>
                        <button onClick={() => setConfirmDelete(item)} className="tap-btn" style={{ padding: "5px 10px", background: "#fee2e2", color: "#ef4444", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 12 }}>🗑️ Hapus</button>
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
function Sales({ orders, onRefresh, showToast, isMobile }) {
  const [detail, setDetail] = useState(null);
  const [orderItems, setOrderItems] = useState([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const deleteOrder = async (order) => {
    try {
      await api(`kr_order_items?order_id=eq.${order.id}`, { method: "DELETE", prefer: "return=minimal" });
      await api(`kr_orders?id=eq.${order.id}`, { method: "DELETE", prefer: "return=minimal" });
      showToast("🗑️ Transaksi dihapus!"); setConfirmDelete(null); setDetail(null); onRefresh();
    } catch (e) { showToast("Error: " + e.message, "error"); }
  };

  const totalRevenue = orders.filter(o => o.status === "paid").reduce((s, o) => s + (o.total || 0), 0);
  const todayOrders = orders.filter(o => new Date(o.created_at).toDateString() === new Date().toDateString());
  const todayRevenue = todayOrders.filter(o => o.status === "paid").reduce((s, o) => s + (o.total || 0), 0);

  const openDetail = async (order) => {
    setDetail(order); setLoadingDetail(true);
    try { setOrderItems(await api(`kr_order_items?order_id=eq.${order.id}`)); } catch {}
    setLoadingDetail(false);
  };

  const statCards = [
    { label: "Total Transaksi", value: orders.length, icon: "🧾", accent: "#2d4ba0" },
    { label: "Hari Ini", value: todayOrders.length, icon: "📅", accent: "#1a3578" },
    { label: "Omzet Hari Ini", value: formatRp(todayRevenue), icon: "💰", accent: "#ee4181" },
    { label: "Total Omzet", value: formatRp(totalRevenue), icon: "📈", accent: "#10b981" },
  ];

  return (
    <div>
      {confirmDelete && <ConfirmModal title="Hapus Transaksi?" message={`Hapus transaksi ${confirmDelete.order_no} (${formatRp(confirmDelete.total)}) secara permanen?`} onConfirm={() => deleteOrder(confirmDelete)} onCancel={() => setConfirmDelete(null)} danger />}

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(4, 1fr)", gap: isMobile ? 10 : 16, marginBottom: 20 }}>
        {statCards.map(s => (
          <div key={s.label} style={{ ...CARD, padding: isMobile ? "12px 14px" : "18px 20px", borderTop: `4px solid ${s.accent}` }}>
            <div style={{ fontSize: isMobile ? 11 : 12, color: "#7a8ab0", marginBottom: 5, fontWeight: 600 }}>{s.icon} {s.label}</div>
            <div style={{ fontSize: isMobile ? 16 : 21, fontWeight: 800, color: s.accent }}>{s.value}</div>
          </div>
        ))}
      </div>

      {isMobile ? (
        <>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10, color: "#1a2a5e" }}>📊 Riwayat Penjualan</div>
          {orders.length === 0 ? (
            <div style={{ ...CARD, padding: 40, textAlign: "center", color: "#7a8ab0" }}><div style={{ fontSize: 36 }}>📊</div>Belum ada penjualan</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {orders.map(o => (
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

          {/* Mobile detail bottom sheet */}
          {detail && (
            <div style={{ position: "fixed", inset: 0, zIndex: 300, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
              <div onClick={() => setDetail(null)} style={{ flex: 1, background: "rgba(0,0,0,0.4)" }} />
              <div style={{ background: "#fadeeb", borderRadius: "20px 20px 0 0", padding: 20, maxHeight: "80vh", overflowY: "auto", animation: "slideUp 0.3s ease" }}>
                <div style={{ width: 36, height: 4, background: "#d4c8e0", borderRadius: 2, margin: "0 auto 16px" }} />
                <OrderDetail detail={detail} orderItems={orderItems} loadingDetail={loadingDetail} onClose={() => setDetail(null)} onDelete={() => setConfirmDelete(detail)} />
              </div>
            </div>
          )}
        </>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: detail ? "1fr 370px" : "1fr", gap: 20 }}>
          <div style={{ ...CARD, overflow: "hidden" }}>
            <div style={{ padding: "14px 18px", borderBottom: "2px solid #d4c8e0", fontWeight: 800, fontSize: 15, background: "linear-gradient(135deg,#e4f3fd,#fadeeb)" }}>📊 Riwayat Penjualan</div>
            {orders.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 0", color: "#7a8ab0" }}><div style={{ fontSize: 36 }}>📊</div>Belum ada penjualan</div>
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
                  {orders.map(o => (
                    <tr key={o.id} onClick={() => openDetail(o)} style={{ borderBottom: "1px solid #d4c8e0", cursor: "pointer", background: detail?.id === o.id ? "#fde8f0" : "transparent" }}>
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
              <OrderDetail detail={detail} orderItems={orderItems} loadingDetail={loadingDetail} onClose={() => setDetail(null)} onDelete={() => setConfirmDelete(detail)} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function OrderDetail({ detail, orderItems, loadingDetail, onClose, onDelete }) {
  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontWeight: 800, fontSize: 15, color: "#ee4181" }}>{detail.order_no}</div>
        <div style={{ display: "flex", gap: 6 }}>
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
