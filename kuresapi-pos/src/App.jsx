import { useState, useEffect, useCallback } from "react";

const SUPABASE_URL = "https://iqhvdvvuonqxlnbnefgb.supabase.co";
const SUPABASE_KEY = "sb_publishable_nstXpLON-OZBhLpNAE5bdg_lMVSgGw9";

// ─── THEME ────────────────────────────────────────────────────────────────────
const T = {
  pink:       "#e91e8c",
  pinkLight:  "#fce4f3",
  pinkMid:    "#f48cc8",
  blue:       "#2563eb",
  blueLight:  "#dbeafe",
  blueMid:    "#93c5fd",
  purple:     "#7c3aed",
  purpleLight:"#ede9fe",
  bg:         "#fdf4fb",
  card:       "#ffffff",
  border:     "#f0d6eb",
  text:       "#2d1a35",
  textMuted:  "#9a7aaa",
  success:    "#10b981",
  successBg:  "#d1fae5",
  error:      "#ef4444",
  errorBg:    "#fee2e2",
  warning:    "#f59e0b",
  warningBg:  "#fef3c7",
};

const ITEM_COLORS = {
  product:   { bg: "#dbeafe", text: "#2563eb", border: "#93c5fd", label: "📦 Produk" },
  workshop:  { bg: "#fce4f3", text: "#e91e8c", border: "#f48cc8", label: "🎓 Workshop" },
  equipment: { bg: "#ede9fe", text: "#7c3aed", border: "#c4b5fd", label: "🔧 Perlengkapan" },
};

const CARD = { background: "#ffffff", borderRadius: 16, border: "1.5px solid #f0d6eb", boxShadow: "0 2px 12px rgba(233,30,140,0.06)" };

const formatRp = (n) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n || 0);
const formatDate = (d) => new Date(d).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const genOrderNo = () => `KRS-${Date.now().toString().slice(-8)}`;

// ─── API ──────────────────────────────────────────────────────────────────────
const api = async (path, opts = {}) => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      "Prefer": opts.prefer || "return=representation",
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
-- Items table (products, workshop events, equipment)
create table if not exists kr_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('product','workshop','equipment')),
  sku text,
  price numeric(12,2) default 0,
  cost numeric(12,2) default 0,
  stock int default 0,
  unit text default 'pcs',
  description text,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- Stock movements
create table if not exists kr_stock_moves (
  id uuid primary key default gen_random_uuid(),
  item_id uuid references kr_items(id),
  direction text check (direction in ('in','out')),
  qty int not null,
  note text,
  ref_id uuid,
  created_at timestamptz default now(),
  created_by text
);

-- Sales orders
create table if not exists kr_orders (
  id uuid primary key default gen_random_uuid(),
  order_no text not null unique,
  customer_name text,
  customer_phone text,
  payment_method text check (payment_method in ('cash','qris')),
  subtotal numeric(12,2),
  discount numeric(12,2) default 0,
  total numeric(12,2),
  status text default 'paid' check (status in ('paid','pending','cancelled')),
  notes text,
  created_at timestamptz default now(),
  created_by text
);

-- Order line items
create table if not exists kr_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references kr_orders(id) on delete cascade,
  item_id uuid references kr_items(id),
  item_name text,
  qty int not null,
  price numeric(12,2),
  subtotal numeric(12,2)
);
`;

const TABS = [
  { id: "pos",       icon: "🛒", label: "Kasir" },
  { id: "inventory", icon: "📦", label: "Inventory" },
  { id: "stock",     icon: "↕️", label: "Stok" },
  { id: "sales",     icon: "📊", label: "Penjualan" },
  { id: "setup",     icon: "⚙️", label: "Setup" },
];

// ─── APP ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState("pos");
  const [items, setItems] = useState([]);
  const [orders, setOrders] = useState([]);
  const [moves, setMoves] = useState([]);
  const [toast, setToast] = useState(null);

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
    <div style={{ fontFamily: "'Segoe UI', Tahoma, sans-serif", minHeight: "100vh", background: "#fdf4fb" }}>
      <style>{`
        @keyframes slideIn { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        input:focus, select:focus, textarea:focus { outline: 2px solid #e91e8c !important; border-color: #e91e8c !important; }
        tbody tr:hover td { background: #fce4f3 !important; }
      `}</style>

      {/* ── Header ── */}
      <div style={{ background: "linear-gradient(135deg, #1a0830 0%, #2d1060 50%, #1a1a6e 100%)", color: "#fff", padding: "0 28px", display: "flex", alignItems: "center", gap: 16, height: 62, boxShadow: "0 4px 20px rgba(124,58,237,0.3)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: "linear-gradient(135deg, #e91e8c, #2563eb)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 20, boxShadow: "0 2px 10px rgba(233,30,140,0.5)" }}>✿</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 18, letterSpacing: 1.5, color: "#f9a8d4" }}>KURESAPI</div>
            <div style={{ fontSize: 10, color: "#a78bfa", letterSpacing: 1, marginTop: -2 }}>POS & INVENTORY</div>
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 12, color: "#c4b5fd", background: "rgba(255,255,255,0.08)", padding: "5px 12px", borderRadius: 20 }}>
          📅 {new Date().toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        </div>
      </div>

      {/* ── Nav ── */}
      <div style={{ background: "#fff", borderBottom: "2px solid #f0d6eb", padding: "0 28px", display: "flex", gap: 2 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: "13px 18px", border: "none", background: "none", cursor: "pointer", borderBottom: tab === t.id ? "3px solid #e91e8c" : "3px solid transparent", color: tab === t.id ? "#e91e8c" : "#9a7aaa", fontWeight: tab === t.id ? 700 : 500, fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 16 }}>{t.icon}</span> {t.label}
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      <div style={{ padding: "28px", maxWidth: 1320, margin: "0 auto" }}>
        {tab === "pos"       && <POS items={items} onRefresh={() => { loadItems(); loadOrders(); }} showToast={showToast} />}
        {tab === "inventory" && <Inventory items={items} onRefresh={loadItems} showToast={showToast} />}
        {tab === "stock"     && <StockMoves items={items} moves={moves} onRefresh={() => { loadItems(); loadMoves(); }} showToast={showToast} />}
        {tab === "sales"     && <Sales orders={orders} items={items} onRefresh={loadOrders} showToast={showToast} />}
        {tab === "setup"     && <Setup setupSql={SETUP_SQL} showToast={showToast} onRefresh={() => { loadItems(); loadOrders(); loadMoves(); }} />}
      </div>

      {/* ── Toast ── */}
      {toast && (
        <div style={{ position: "fixed", bottom: 28, right: 28, padding: "13px 22px", borderRadius: 14, background: toast.type === "error" ? "linear-gradient(135deg,#ef4444,#dc2626)" : "linear-gradient(135deg,#e91e8c,#7c3aed)", color: "#fff", fontSize: 14, fontWeight: 600, boxShadow: "0 6px 24px rgba(0,0,0,0.2)", zIndex: 9999, animation: "slideIn 0.3s ease" }}>{toast.msg}</div>
      )}
    </div>
  );
}

// ─── POS ──────────────────────────────────────────────────────────────────────
function POS({ items, onRefresh, showToast }) {
  const [cart, setCart] = useState([]);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [payment, setPayment] = useState("cash");
  const [customer, setCustomer] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [discount, setDiscount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [invoice, setInvoice] = useState(null);

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
      setCart([]); setCustomer(""); setCustomerPhone(""); setDiscount(0);
      onRefresh();
      showToast(`✨ Transaksi ${orderNo} berhasil!`);
    } catch (e) { showToast("Gagal: " + e.message, "error"); }
    setSaving(false);
  };

  if (invoice) return <InvoiceView invoice={invoice} onClose={() => setInvoice(null)} />;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 400px", gap: 24 }}>
      <div>
        <div style={{ display: "flex", gap: 10, marginBottom: 18 }}>
          <div style={{ flex: 1, position: "relative" }}>
            <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }}>🔍</span>
            <input placeholder="Cari produk atau SKU..." value={search} onChange={e => setSearch(e.target.value)} style={{ width: "100%", padding: "11px 14px 11px 36px", border: "1.5px solid #f0d6eb", borderRadius: 12, fontSize: 14, background: "#fff", boxSizing: "border-box" }} />
          </div>
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{ padding: "11px 14px", border: "1.5px solid #f0d6eb", borderRadius: 12, fontSize: 14, background: "#fff", color: "#2d1a35" }}>
            <option value="all">✨ Semua</option>
            <option value="product">📦 Produk</option>
            <option value="workshop">🎓 Workshop</option>
            <option value="equipment">🔧 Perlengkapan</option>
          </select>
        </div>

        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "80px 0", color: "#9a7aaa" }}>
            <div style={{ fontSize: 52, marginBottom: 10 }}>🌸</div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>Belum ada item</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>Tambah di tab Inventory ya!</div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(165px, 1fr))", gap: 14 }}>
            {filtered.map(item => {
              const c = ITEM_COLORS[item.type];
              const outOfStock = item.type !== "workshop" && item.stock <= 0;
              return (
                <button key={item.id} onClick={() => !outOfStock && addToCart(item)} disabled={outOfStock} style={{ background: outOfStock ? "#f5f5f5" : "#fff", border: `2px solid ${outOfStock ? "#e5e5e5" : c.border}`, borderRadius: 16, padding: 16, cursor: outOfStock ? "not-allowed" : "pointer", textAlign: "left", opacity: outOfStock ? 0.5 : 1, boxShadow: outOfStock ? "none" : `0 2px 10px ${c.bg}` }}>
                  <div style={{ fontSize: 11, padding: "3px 9px", borderRadius: 20, display: "inline-block", marginBottom: 8, background: c.bg, color: c.text, fontWeight: 700 }}>{c.label}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 5, lineHeight: 1.35, color: "#2d1a35" }}>{item.name}</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "#e91e8c" }}>{formatRp(item.price)}</div>
                  {item.type !== "workshop" && (
                    <div style={{ fontSize: 11, color: item.stock <= 5 ? "#ef4444" : "#9a7aaa", marginTop: 5, fontWeight: 600 }}>
                      {outOfStock ? "❌ Habis" : `📦 Stok: ${item.stock}`}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Cart */}
      <div style={{ ...CARD, padding: 22, height: "fit-content", position: "sticky", top: 20 }}>
        <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 16, color: "#2d1a35", display: "flex", alignItems: "center", gap: 8 }}>
          🛒 Keranjang
          {cart.length > 0 && <span style={{ background: "#e91e8c", color: "#fff", borderRadius: 20, fontSize: 12, padding: "2px 8px", fontWeight: 700 }}>{cart.length}</span>}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
          <input placeholder="👤 Nama customer (opsional)" value={customer} onChange={e => setCustomer(e.target.value)} style={{ width: "100%", padding: "9px 13px", border: "1.5px solid #f0d6eb", borderRadius: 10, fontSize: 13, boxSizing: "border-box" }} />
          <input placeholder="📱 No. HP (opsional)" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} style={{ width: "100%", padding: "9px 13px", border: "1.5px solid #f0d6eb", borderRadius: 10, fontSize: 13, boxSizing: "border-box" }} />
        </div>

        {cart.length === 0 ? (
          <div style={{ textAlign: "center", padding: "32px 0", color: "#9a7aaa", fontSize: 13 }}>
            <div style={{ fontSize: 36, marginBottom: 6 }}>🛍️</div>Pilih produk dari kiri
          </div>
        ) : (
          <div style={{ marginBottom: 14, maxHeight: 280, overflowY: "auto" }}>
            {cart.map(item => (
              <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 0", borderBottom: "1px solid #f0d6eb" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#2d1a35" }}>{item.name}</div>
                  <div style={{ fontSize: 12, color: "#9a7aaa" }}>{formatRp(item.price)} × {item.qty}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <button onClick={() => updateQty(item.id, item.qty - 1)} style={{ width: 26, height: 26, border: "1.5px solid #f0d6eb", borderRadius: 8, background: "#fce4f3", cursor: "pointer", fontSize: 14, color: "#e91e8c", fontWeight: 700 }}>−</button>
                  <span style={{ fontSize: 13, fontWeight: 700, minWidth: 20, textAlign: "center" }}>{item.qty}</span>
                  <button onClick={() => updateQty(item.id, item.qty + 1)} style={{ width: 26, height: 26, border: "1.5px solid #f0d6eb", borderRadius: 8, background: "#dbeafe", cursor: "pointer", fontSize: 14, color: "#2563eb", fontWeight: 700 }}>+</button>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, minWidth: 75, textAlign: "right", color: "#e91e8c" }}>{formatRp(item.price * item.qty)}</div>
              </div>
            ))}
          </div>
        )}

        <div style={{ borderTop: "2px dashed #f0d6eb", paddingTop: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#9a7aaa", marginBottom: 8 }}>
            <span>Subtotal</span><span style={{ fontWeight: 600, color: "#2d1a35" }}>{formatRp(subtotal)}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 13, color: "#9a7aaa", flex: 1 }}>🏷️ Diskon (Rp)</span>
            <input type="number" value={discount} onChange={e => setDiscount(Number(e.target.value))} min={0} style={{ width: 110, padding: "6px 10px", border: "1.5px solid #f0d6eb", borderRadius: 8, fontSize: 13, textAlign: "right" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: 19, marginBottom: 14 }}>
            <span style={{ color: "#2d1a35" }}>TOTAL</span>
            <span style={{ color: "#e91e8c" }}>{formatRp(total)}</span>
          </div>

          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            {[["cash", "💵 Tunai"], ["qris", "📲 QRIS"]].map(([m, l]) => (
              <button key={m} onClick={() => setPayment(m)} style={{ flex: 1, padding: "10px 0", border: `2px solid ${payment === m ? "#e91e8c" : "#f0d6eb"}`, borderRadius: 10, background: payment === m ? "#fce4f3" : "#fff", color: payment === m ? "#e91e8c" : "#9a7aaa", fontWeight: payment === m ? 700 : 500, cursor: "pointer", fontSize: 13 }}>{l}</button>
            ))}
          </div>

          <button onClick={checkout} disabled={saving || !cart.length} style={{ width: "100%", padding: "14px 0", fontSize: 15, background: saving || !cart.length ? "#ddd" : "linear-gradient(135deg, #e91e8c, #7c3aed)", color: "#fff", border: "none", borderRadius: 12, fontWeight: 700, cursor: saving || !cart.length ? "not-allowed" : "pointer" }}>
            {saving ? "⏳ Memproses..." : "✨ Proses Pembayaran"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── INVOICE ──────────────────────────────────────────────────────────────────
function InvoiceView({ invoice, onClose }) {
  return (
    <div style={{ maxWidth: 480, margin: "0 auto" }}>
      <div style={{ ...CARD, padding: 32 }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: "linear-gradient(135deg, #e91e8c, #7c3aed)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, margin: "0 auto 10px" }}>✿</div>
          <div style={{ fontWeight: 900, fontSize: 22, letterSpacing: 2, color: "#2d1a35" }}>KURESAPI</div>
          <div style={{ fontSize: 12, color: "#9a7aaa" }}>Bukti Pembayaran</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#e91e8c", marginTop: 4 }}>{invoice.order_no}</div>
          <div style={{ fontSize: 12, color: "#9a7aaa" }}>{new Date().toLocaleString("id-ID")}</div>
        </div>
        <div style={{ background: "#fce4f3", borderRadius: 10, padding: "12px 16px", marginBottom: 14 }}>
          <div style={{ fontSize: 13, marginBottom: 2 }}>👤 Customer: <b>{invoice.customer_name || invoice.customer || "Umum"}</b></div>
          {(invoice.customer_phone || invoice.customerPhone) && <div style={{ fontSize: 13 }}>📱 {invoice.customer_phone || invoice.customerPhone}</div>}
          <div style={{ fontSize: 13 }}>💳 {(invoice.payment_method || invoice.payment) === "cash" ? "💵 Tunai" : "📲 QRIS"}</div>
        </div>
        <div style={{ marginBottom: 14 }}>
          {invoice.items?.map((item, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "5px 0", borderBottom: "1px dashed #f0d6eb" }}>
              <span>{item.name} × {item.qty}</span>
              <span style={{ fontWeight: 600 }}>{formatRp(item.price * item.qty)}</span>
            </div>
          ))}
        </div>
        <div style={{ background: "#dbeafe", borderRadius: 10, padding: "12px 16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#9a7aaa", marginBottom: 4 }}>
            <span>Subtotal</span><span>{formatRp(invoice.subtotal)}</span>
          </div>
          {invoice.discount > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#ef4444", marginBottom: 4 }}>
              <span>🏷️ Diskon</span><span>- {formatRp(invoice.discount)}</span>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: 18, marginTop: 6 }}>
            <span>TOTAL</span><span style={{ color: "#e91e8c" }}>{formatRp(invoice.total)}</span>
          </div>
        </div>
        <div style={{ textAlign: "center", marginTop: 20, fontSize: 13, color: "#9a7aaa" }}>🌸 Terima kasih sudah berbelanja! 🌸</div>
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
        <button onClick={() => window.print()} style={{ flex: 1, padding: "12px 0", background: "linear-gradient(135deg, #2563eb, #7c3aed)", color: "#fff", border: "none", borderRadius: 12, fontWeight: 700, cursor: "pointer" }}>🖨️ Print</button>
        <button onClick={onClose} style={{ flex: 1, padding: "12px 0", background: "#fff", color: "#2d1a35", border: "1.5px solid #f0d6eb", borderRadius: 12, fontWeight: 600, cursor: "pointer" }}>← Kembali</button>
      </div>
    </div>
  );
}

// ─── INVENTORY ────────────────────────────────────────────────────────────────
function Inventory({ items, onRefresh, showToast }) {
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

  const deactivate = async (id) => {
    if (!confirm("Nonaktifkan item ini?")) return;
    try {
      await api(`kr_items?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ is_active: false }), prefer: "return=minimal" });
      showToast("Item dinonaktifkan"); onRefresh();
    } catch (e) { showToast("Error: " + e.message, "error"); }
  };

  const filtered = items.filter(i => filter === "all" || i.type === filter);
  const stats = { all: items.length, product: items.filter(x => x.type === "product").length, workshop: items.filter(x => x.type === "workshop").length, equipment: items.filter(x => x.type === "equipment").length };

  if (showForm) return (
    <div style={{ maxWidth: 560 }}>
      <div style={{ fontWeight: 800, fontSize: 20, marginBottom: 20, color: "#2d1a35" }}>{editing ? "✏️ Edit Item" : "✨ Tambah Item Baru"}</div>
      <div style={{ ...CARD, padding: 28, display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <label style={{ fontSize: 13, color: "#9a7aaa", display: "block", marginBottom: 8, fontWeight: 600 }}>Tipe Item *</label>
          <div style={{ display: "flex", gap: 8 }}>
            {[["product", "📦 Produk"], ["workshop", "🎓 Workshop"], ["equipment", "🔧 Perlengkapan"]].map(([v, l]) => {
              const c = ITEM_COLORS[v];
              return (
                <button key={v} onClick={() => setForm(f => ({ ...f, type: v }))} style={{ flex: 1, padding: "10px 0", border: `2px solid ${form.type === v ? c.text : "#f0d6eb"}`, borderRadius: 10, background: form.type === v ? c.bg : "#fff", color: form.type === v ? c.text : "#9a7aaa", fontWeight: form.type === v ? 700 : 500, cursor: "pointer", fontSize: 12 }}>{l}</button>
              );
            })}
          </div>
        </div>
        {[["name","Nama *","text","Nama produk / workshop..."],["sku","SKU / Kode","text","Opsional"],["unit","Satuan","text","pcs, lembar, slot, dll"],["price","💰 Harga Jual (Rp) *","number","0"],["cost","📉 Harga Modal (Rp)","number","0"],["stock","📦 Stok Awal","number","0"]].map(([k,l,t,ph]) => (
          <div key={k}>
            <label style={{ fontSize: 13, color: "#9a7aaa", display: "block", marginBottom: 5, fontWeight: 600 }}>{l}</label>
            <input type={t} placeholder={ph} value={form[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} style={{ width: "100%", padding: "10px 14px", border: "1.5px solid #f0d6eb", borderRadius: 10, fontSize: 14, boxSizing: "border-box" }} />
          </div>
        ))}
        <div>
          <label style={{ fontSize: 13, color: "#9a7aaa", display: "block", marginBottom: 5, fontWeight: 600 }}>Keterangan</label>
          <textarea rows={2} placeholder="Deskripsi opsional..." value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} style={{ width: "100%", padding: "10px 14px", border: "1.5px solid #f0d6eb", borderRadius: 10, fontSize: 14, boxSizing: "border-box", resize: "vertical" }} />
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={save} style={{ flex: 1, padding: "13px 0", background: "linear-gradient(135deg, #e91e8c, #7c3aed)", color: "#fff", border: "none", borderRadius: 12, fontWeight: 700, cursor: "pointer", fontSize: 14 }}>{editing ? "💾 Simpan" : "✨ Tambah Item"}</button>
          <button onClick={() => setShowForm(false)} style={{ flex: 1, padding: "13px 0", background: "#fff", color: "#2d1a35", border: "1.5px solid #f0d6eb", borderRadius: 12, fontWeight: 600, cursor: "pointer", fontSize: 14 }}>Batal</button>
        </div>
      </div>
    </div>
  );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[["all","✨ Semua"],["product","📦 Produk"],["workshop","🎓 Workshop"],["equipment","🔧 Perlengkapan"]].map(([v,l]) => (
            <button key={v} onClick={() => setFilter(v)} style={{ padding: "8px 16px", borderRadius: 20, border: `2px solid ${filter === v ? "#e91e8c" : "#f0d6eb"}`, background: filter === v ? "#fce4f3" : "#fff", color: filter === v ? "#e91e8c" : "#9a7aaa", fontWeight: filter === v ? 700 : 500, cursor: "pointer", fontSize: 13 }}>{l} <span style={{ opacity: 0.7, fontSize: 11 }}>({stats[v]})</span></button>
          ))}
        </div>
        <button onClick={openNew} style={{ padding: "10px 20px", background: "linear-gradient(135deg, #e91e8c, #7c3aed)", color: "#fff", border: "none", borderRadius: 12, fontWeight: 700, cursor: "pointer", fontSize: 13 }}>✨ Tambah Item</button>
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "80px 0", color: "#9a7aaa" }}>
          <div style={{ fontSize: 52, marginBottom: 10 }}>🌸</div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Belum ada item</div>
          <button onClick={openNew} style={{ marginTop: 14, padding: "11px 24px", background: "linear-gradient(135deg,#e91e8c,#7c3aed)", color: "#fff", border: "none", borderRadius: 12, fontWeight: 700, cursor: "pointer" }}>Tambah Sekarang</button>
        </div>
      ) : (
        <div style={{ ...CARD, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "linear-gradient(135deg, #fce4f3, #dbeafe)" }}>
                {["Nama","Tipe","SKU","Satuan","Harga Jual","Modal","Stok","Aksi"].map(h => (
                  <th key={h} style={{ padding: "12px 14px", textAlign: "left", fontSize: 12, color: "#2d1a35", fontWeight: 700, borderBottom: "2px solid #f0d6eb" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => {
                const c = ITEM_COLORS[item.type];
                return (
                  <tr key={item.id} style={{ borderBottom: "1px solid #f0d6eb" }}>
                    <td style={{ padding: "12px 14px", fontSize: 14, fontWeight: 600, color: "#2d1a35" }}>{item.name}</td>
                    <td style={{ padding: "12px 14px" }}><span style={{ fontSize: 11, padding: "4px 10px", borderRadius: 20, background: c.bg, color: c.text, fontWeight: 700 }}>{c.label}</span></td>
                    <td style={{ padding: "12px 14px", fontSize: 13, color: "#9a7aaa" }}>{item.sku || "—"}</td>
                    <td style={{ padding: "12px 14px", fontSize: 13 }}>{item.unit}</td>
                    <td style={{ padding: "12px 14px", fontSize: 14, fontWeight: 700, color: "#e91e8c" }}>{formatRp(item.price)}</td>
                    <td style={{ padding: "12px 14px", fontSize: 13, color: "#9a7aaa" }}>{formatRp(item.cost)}</td>
                    <td style={{ padding: "12px 14px", fontSize: 14, fontWeight: 700, color: item.stock <= 5 && item.type !== "workshop" ? "#ef4444" : "#10b981" }}>{item.type === "workshop" ? "—" : `${item.stock} ${item.unit}`}</td>
                    <td style={{ padding: "12px 14px" }}>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => openEdit(item)} style={{ padding: "5px 12px", background: "#dbeafe", color: "#2563eb", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>✏️ Edit</button>
                        <button onClick={() => deactivate(item.id)} style={{ padding: "5px 10px", background: "#fee2e2", color: "#ef4444", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 12 }}>🗑️</button>
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
function StockMoves({ items, moves, onRefresh, showToast }) {
  const [form, setForm] = useState({ item_id: "", direction: "in", qty: "", note: "" });
  const [saving, setSaving] = useState(false);

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
      onRefresh();
      showToast(`${form.direction === "in" ? "📥 Stok masuk" : "📤 Stok keluar"} dicatat!`);
    } catch (e) { showToast("Error: " + e.message, "error"); }
    setSaving(false);
  };

  const itemMap = Object.fromEntries(items.map(i => [i.id, i]));

  return (
    <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 24 }}>
      <div style={{ ...CARD, padding: 22, height: "fit-content" }}>
        <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 18, color: "#2d1a35" }}>↕️ Catat Mutasi Stok</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {[["in","📥 Masuk"],["out","📤 Keluar"]].map(([v,l]) => (
            <button key={v} onClick={() => setForm(f => ({ ...f, direction: v }))} style={{ flex: 1, padding: "10px 0", border: `2px solid ${form.direction === v ? (v==="in"?"#10b981":"#ef4444") : "#f0d6eb"}`, borderRadius: 10, background: form.direction === v ? (v==="in"?"#d1fae5":"#fee2e2") : "#fff", color: form.direction === v ? (v==="in"?"#10b981":"#ef4444") : "#9a7aaa", fontWeight: form.direction === v ? 700 : 500, cursor: "pointer", fontSize: 13 }}>{l}</button>
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={{ fontSize: 13, color: "#9a7aaa", display: "block", marginBottom: 5, fontWeight: 600 }}>Item *</label>
            <select value={form.item_id} onChange={e => setForm(f => ({ ...f, item_id: e.target.value }))} style={{ width: "100%", padding: "10px 12px", border: "1.5px solid #f0d6eb", borderRadius: 10, fontSize: 14 }}>
              <option value="">— Pilih item —</option>
              {items.filter(i => i.type !== "workshop").map(i => <option key={i.id} value={i.id}>{i.name} (stok: {i.stock})</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 13, color: "#9a7aaa", display: "block", marginBottom: 5, fontWeight: 600 }}>Jumlah *</label>
            <input type="number" min={1} placeholder="0" value={form.qty} onChange={e => setForm(f => ({ ...f, qty: e.target.value }))} style={{ width: "100%", padding: "10px 12px", border: "1.5px solid #f0d6eb", borderRadius: 10, fontSize: 14, boxSizing: "border-box" }} />
          </div>
          <div>
            <label style={{ fontSize: 13, color: "#9a7aaa", display: "block", marginBottom: 5, fontWeight: 600 }}>Keterangan</label>
            <input placeholder="Contoh: Restock dari supplier..." value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} style={{ width: "100%", padding: "10px 12px", border: "1.5px solid #f0d6eb", borderRadius: 10, fontSize: 14, boxSizing: "border-box" }} />
          </div>
          <button onClick={save} disabled={saving} style={{ padding: "12px 0", background: saving ? "#ddd" : "linear-gradient(135deg,#e91e8c,#7c3aed)", color: "#fff", border: "none", borderRadius: 12, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", fontSize: 14 }}>
            {saving ? "⏳ Menyimpan..." : "💾 Simpan Mutasi"}
          </button>
        </div>
      </div>

      <div>
        <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 14, color: "#2d1a35" }}>📋 Riwayat Mutasi Stok</div>
        <div style={{ ...CARD, overflow: "hidden" }}>
          {moves.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 0", color: "#9a7aaa" }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>📋</div>Belum ada mutasi stok
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "linear-gradient(135deg,#fce4f3,#dbeafe)" }}>
                  {["Waktu","Item","Arah","Qty","Keterangan"].map(h => (
                    <th key={h} style={{ padding: "11px 14px", textAlign: "left", fontSize: 12, color: "#2d1a35", fontWeight: 700, borderBottom: "2px solid #f0d6eb" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {moves.map(m => (
                  <tr key={m.id} style={{ borderBottom: "1px solid #f0d6eb" }}>
                    <td style={{ padding: "10px 14px", fontSize: 12, color: "#9a7aaa" }}>{formatDate(m.created_at)}</td>
                    <td style={{ padding: "10px 14px", fontSize: 13, fontWeight: 600 }}>{itemMap[m.item_id]?.name || "—"}</td>
                    <td style={{ padding: "10px 14px" }}>
                      <span style={{ fontSize: 12, padding: "4px 10px", borderRadius: 20, fontWeight: 700, background: m.direction === "in" ? "#d1fae5" : "#fee2e2", color: m.direction === "in" ? "#10b981" : "#ef4444" }}>
                        {m.direction === "in" ? "📥 Masuk" : "📤 Keluar"}
                      </span>
                    </td>
                    <td style={{ padding: "10px 14px", fontSize: 15, fontWeight: 800 }}>{m.qty}</td>
                    <td style={{ padding: "10px 14px", fontSize: 13, color: "#9a7aaa" }}>{m.note || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── SALES ────────────────────────────────────────────────────────────────────
function Sales({ orders, items, onRefresh, showToast }) {
  const [detail, setDetail] = useState(null);
  const [orderItems, setOrderItems] = useState([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const totalRevenue = orders.filter(o => o.status === "paid").reduce((s, o) => s + (o.total || 0), 0);
  const todayOrders = orders.filter(o => new Date(o.created_at).toDateString() === new Date().toDateString());
  const todayRevenue = todayOrders.filter(o => o.status === "paid").reduce((s, o) => s + (o.total || 0), 0);

  const openDetail = async (order) => {
    setDetail(order); setLoadingDetail(true);
    try { setOrderItems(await api(`kr_order_items?order_id=eq.${order.id}`)); } catch {}
    setLoadingDetail(false);
  };

  const statCards = [
    { label: "Total Transaksi", value: orders.length, icon: "🧾", accent: "#2563eb", bg: "#dbeafe" },
    { label: "Transaksi Hari Ini", value: todayOrders.length, icon: "📅", accent: "#7c3aed", bg: "#ede9fe" },
    { label: "Omzet Hari Ini", value: formatRp(todayRevenue), icon: "💰", accent: "#e91e8c", bg: "#fce4f3" },
    { label: "Total Omzet", value: formatRp(totalRevenue), icon: "📈", accent: "#10b981", bg: "#d1fae5" },
  ];

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
        {statCards.map(s => (
          <div key={s.label} style={{ ...CARD, padding: "18px 20px", borderTop: `4px solid ${s.accent}` }}>
            <div style={{ fontSize: 12, color: "#9a7aaa", marginBottom: 8, fontWeight: 600 }}>{s.icon} {s.label}</div>
            <div style={{ fontSize: 21, fontWeight: 800, color: s.accent }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: detail ? "1fr 370px" : "1fr", gap: 20 }}>
        <div style={{ ...CARD, overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: "2px solid #f0d6eb", fontWeight: 800, fontSize: 16, background: "linear-gradient(135deg,#fce4f3,#dbeafe)" }}>📊 Riwayat Penjualan</div>
          {orders.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 0", color: "#9a7aaa" }}><div style={{ fontSize: 40, marginBottom: 8 }}>📊</div>Belum ada penjualan</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#fafafa" }}>
                  {["No Order","Waktu","Customer","Pembayaran","Total","Status",""].map(h => (
                    <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 12, color: "#9a7aaa", fontWeight: 700, borderBottom: "1.5px solid #f0d6eb" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.map(o => (
                  <tr key={o.id} onClick={() => openDetail(o)} style={{ borderBottom: "1px solid #f0d6eb", cursor: "pointer", background: detail?.id === o.id ? "#fce4f3" : "transparent" }}>
                    <td style={{ padding: "10px 14px", fontSize: 13, fontWeight: 700, color: "#e91e8c" }}>{o.order_no}</td>
                    <td style={{ padding: "10px 14px", fontSize: 12, color: "#9a7aaa" }}>{formatDate(o.created_at)}</td>
                    <td style={{ padding: "10px 14px", fontSize: 13 }}>{o.customer_name || "Umum"}</td>
                    <td style={{ padding: "10px 14px", fontSize: 13 }}>{o.payment_method === "cash" ? "💵 Tunai" : "📲 QRIS"}</td>
                    <td style={{ padding: "10px 14px", fontSize: 14, fontWeight: 800, color: "#e91e8c" }}>{formatRp(o.total)}</td>
                    <td style={{ padding: "10px 14px" }}>
                      <span style={{ fontSize: 11, padding: "4px 10px", borderRadius: 20, fontWeight: 700, background: o.status === "paid" ? "#d1fae5" : "#fef3c7", color: o.status === "paid" ? "#10b981" : "#f59e0b" }}>
                        {o.status === "paid" ? "✅ Lunas" : "⏳ Pending"}
                      </span>
                    </td>
                    <td style={{ padding: "10px 14px", fontSize: 12, color: "#9a7aaa" }}>→</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {detail && (
          <div style={{ ...CARD, padding: 20, height: "fit-content", position: "sticky", top: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ fontWeight: 800, fontSize: 15, color: "#e91e8c" }}>{detail.order_no}</div>
              <button onClick={() => setDetail(null)} style={{ background: "#fce4f3", border: "none", cursor: "pointer", fontSize: 16, color: "#e91e8c", borderRadius: 8, width: 28, height: 28 }}>×</button>
            </div>
            <div style={{ background: "#dbeafe", borderRadius: 10, padding: "10px 14px", fontSize: 13, marginBottom: 12, lineHeight: 1.8 }}>
              <div>👤 <b>{detail.customer_name || "Umum"}</b></div>
              {detail.customer_phone && <div>📱 {detail.customer_phone}</div>}
              <div>💳 {detail.payment_method === "cash" ? "💵 Tunai" : "📲 QRIS"}</div>
              <div>🕐 {formatDate(detail.created_at)}</div>
            </div>
            {loadingDetail ? <div style={{ textAlign: "center", padding: 20, color: "#9a7aaa" }}>Memuat...</div> : (
              <>
                <div style={{ marginBottom: 12 }}>
                  {orderItems.map((oi, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "6px 0", borderBottom: "1px dashed #f0d6eb" }}>
                      <span>{oi.item_name} × {oi.qty}</span>
                      <span style={{ fontWeight: 600 }}>{formatRp(oi.subtotal)}</span>
                    </div>
                  ))}
                </div>
                <div style={{ background: "#fce4f3", borderRadius: 10, padding: "10px 14px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#9a7aaa", marginBottom: 4 }}>
                    <span>Subtotal</span><span>{formatRp(detail.subtotal)}</span>
                  </div>
                  {detail.discount > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#ef4444", marginBottom: 4 }}>
                      <span>🏷️ Diskon</span><span>- {formatRp(detail.discount)}</span>
                    </div>
                  )}
                  <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: 17, marginTop: 6 }}>
                    <span>Total</span><span style={{ color: "#e91e8c" }}>{formatRp(detail.total)}</span>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
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
      setStatus({ ok: true, msg: "✅ Tabel sudah ada dan terhubung! Sistem siap digunakan." });
      onRefresh();
    } catch (e) {
      if (e.message.includes("does not exist") || e.message.includes("42P01")) {
        setStatus({ ok: false, msg: "⚠️ Tabel belum ada. Jalankan SQL di bawah di Supabase SQL Editor." });
      } else {
        setStatus({ ok: false, msg: "❌ Error: " + e.message });
      }
    }
    setTesting(false);
  };

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ fontWeight: 800, fontSize: 20, marginBottom: 6, color: "#2d1a35" }}>⚙️ Setup Database</div>
      <div style={{ fontSize: 14, color: "#9a7aaa", marginBottom: 22, lineHeight: 1.7 }}>Jalankan langkah berikut untuk menginisialisasi database KURESAPI di Supabase.</div>

      <div style={{ ...CARD, padding: 24, marginBottom: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 12 }}>Langkah 1 — Cek koneksi</div>
        <button onClick={testConn} disabled={testing} style={{ padding: "11px 22px", background: testing ? "#ddd" : "linear-gradient(135deg,#2563eb,#7c3aed)", color: "#fff", border: "none", borderRadius: 12, fontWeight: 700, cursor: testing ? "not-allowed" : "pointer", fontSize: 14 }}>
          {testing ? "⏳ Mengecek..." : "🔌 Test Koneksi"}
        </button>
        {status && (
          <div style={{ marginTop: 12, padding: "12px 16px", borderRadius: 10, background: status.ok ? "#d1fae5" : "#fee2e2", color: status.ok ? "#10b981" : "#ef4444", fontSize: 14, fontWeight: 600 }}>{status.msg}</div>
        )}
      </div>

      <div style={{ ...CARD, padding: 24, marginBottom: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>Langkah 2 — Buat tabel (jika belum ada)</div>
        <div style={{ fontSize: 13, color: "#9a7aaa", marginBottom: 12 }}>Buka <b>Supabase Dashboard → SQL Editor</b>, paste SQL berikut lalu klik Run:</div>
        <pre style={{ background: "#1e1e2e", color: "#cdd6f4", borderRadius: 10, padding: 16, fontSize: 12, overflow: "auto", maxHeight: 340, lineHeight: 1.7 }}>{setupSql}</pre>
        <button onClick={() => { navigator.clipboard.writeText(setupSql); showToast("📋 SQL disalin!"); }} style={{ marginTop: 12, padding: "9px 18px", background: "#fff", color: "#2d1a35", border: "1.5px solid #f0d6eb", borderRadius: 10, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>📋 Salin SQL</button>
      </div>

      <div style={{ background: "#fce4f3", borderRadius: 14, border: "1.5px solid #f48cc8", padding: 20 }}>
        <div style={{ fontWeight: 700, color: "#e91e8c", marginBottom: 8 }}>📝 Tabel yang dibuat</div>
        <div style={{ fontSize: 13, color: "#2d1a35", lineHeight: 2 }}>
          <span style={{ background: "#dbeafe", color: "#2563eb", borderRadius: 6, padding: "2px 8px", fontWeight: 700, marginRight: 6 }}>kr_items</span> Produk, workshop & perlengkapan<br />
          <span style={{ background: "#dbeafe", color: "#2563eb", borderRadius: 6, padding: "2px 8px", fontWeight: 700, marginRight: 6 }}>kr_stock_moves</span> Riwayat mutasi stok<br />
          <span style={{ background: "#dbeafe", color: "#2563eb", borderRadius: 6, padding: "2px 8px", fontWeight: 700, marginRight: 6 }}>kr_orders</span> Transaksi penjualan<br />
          <span style={{ background: "#dbeafe", color: "#2563eb", borderRadius: 6, padding: "2px 8px", fontWeight: 700, marginRight: 6 }}>kr_order_items</span> Detail item per transaksi
        </div>
      </div>
    </div>
  );
}
