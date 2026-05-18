import { useState, useEffect, useCallback } from "react";

const SUPABASE_URL = "https://iqhvdvvuonqxlnbnefgb.supabase.co";
const SUPABASE_KEY = "sb_publishable_nstXpLON-OZBhLpNAE5bdg_lMVSgGw9";

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

// DB Setup SQL (run once)
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

const COLORS = {
  product: { bg: "#e8f4fd", text: "#1a6fa8", label: "Produk" },
  workshop: { bg: "#fdf0e8", text: "#a85a1a", label: "Workshop" },
  equipment: { bg: "#e8fdf0", text: "#1a8a4a", label: "Perlengkapan" },
};

const formatRp = (n) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n || 0);
const formatDate = (d) => new Date(d).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const genOrderNo = () => `KRS-${Date.now().toString().slice(-8)}`;

// ─── TABS ─────────────────────────────────────────────────────────────────────
const TABS = [
  { id: "pos", icon: "🛒", label: "POS / Kasir" },
  { id: "inventory", icon: "📦", label: "Inventory" },
  { id: "stock", icon: "↕️", label: "Stok Masuk/Keluar" },
  { id: "sales", icon: "📊", label: "Penjualan" },
  { id: "setup", icon: "⚙️", label: "Setup DB" },
];

export default function App() {
  const [tab, setTab] = useState("pos");
  const [items, setItems] = useState([]);
  const [orders, setOrders] = useState([]);
  const [moves, setMoves] = useState([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const loadItems = useCallback(async () => {
    try {
      const data = await api("kr_items?is_active=eq.true&order=name.asc");
      setItems(data);
    } catch (e) {
      if (!e.message.includes("does not exist")) showToast("Error: " + e.message, "error");
    }
  }, []);

  const loadOrders = useCallback(async () => {
    try {
      const data = await api("kr_orders?order=created_at.desc&limit=100");
      setOrders(data);
    } catch {}
  }, []);

  const loadMoves = useCallback(async () => {
    try {
      const data = await api("kr_stock_moves?order=created_at.desc&limit=200");
      setMoves(data);
    } catch {}
  }, []);

  useEffect(() => {
    loadItems();
    loadOrders();
    loadMoves();
  }, []);

  return (
    <div style={{ fontFamily: "'Segoe UI', sans-serif", minHeight: "100vh", background: "#f7f6f3" }}>
      {/* Header */}
      <div style={{ background: "#1a1a2e", color: "#fff", padding: "0 24px", display: "flex", alignItems: "center", gap: 16, height: 56 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: "#e8a020", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14 }}>K</div>
          <span style={{ fontWeight: 700, fontSize: 17, letterSpacing: 1 }}>KURESAPI</span>
          <span style={{ fontSize: 12, color: "#888", marginLeft: 4 }}>POS & Inventory</span>
        </div>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: "#666" }}>{new Date().toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</span>
      </div>

      {/* Nav */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e5e5e5", padding: "0 24px", display: "flex", gap: 4 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: "12px 16px", border: "none", background: "none", cursor: "pointer",
            borderBottom: tab === t.id ? "2px solid #e8a020" : "2px solid transparent",
            color: tab === t.id ? "#e8a020" : "#555", fontWeight: tab === t.id ? 600 : 400,
            fontSize: 13, display: "flex", alignItems: "center", gap: 6,
          }}>
            <span>{t.icon}</span> {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ padding: "24px", maxWidth: 1280, margin: "0 auto" }}>
        {tab === "pos" && <POS items={items} onRefresh={() => { loadItems(); loadOrders(); }} showToast={showToast} />}
        {tab === "inventory" && <Inventory items={items} onRefresh={loadItems} showToast={showToast} />}
        {tab === "stock" && <StockMoves items={items} moves={moves} onRefresh={() => { loadItems(); loadMoves(); }} showToast={showToast} />}
        {tab === "sales" && <Sales orders={orders} items={items} onRefresh={loadOrders} showToast={showToast} />}
        {tab === "setup" && <Setup setupSql={SETUP_SQL} showToast={showToast} onRefresh={() => { loadItems(); loadOrders(); loadMoves(); }} />}
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 24, right: 24, padding: "12px 20px", borderRadius: 10,
          background: toast.type === "error" ? "#c0392b" : "#27ae60",
          color: "#fff", fontSize: 14, fontWeight: 500, boxShadow: "0 4px 20px rgba(0,0,0,0.2)", zIndex: 9999,
        }}>{toast.msg}</div>
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
        body: JSON.stringify({
          order_no: orderNo, customer_name: customer || "Umum", customer_phone: customerPhone,
          payment_method: payment, subtotal, discount, total, status: "paid",
        }),
      });

      await api("kr_order_items", {
        method: "POST",
        body: JSON.stringify(cart.map(x => ({
          order_id: order.id, item_id: x.id, item_name: x.name,
          qty: x.qty, price: x.price, subtotal: x.price * x.qty,
        }))),
        prefer: "return=minimal",
      });

      // Deduct stock for products & equipment
      const moves = cart.filter(x => x.type !== "workshop").map(x => ({
        item_id: x.id, direction: "out", qty: x.qty,
        note: `Penjualan ${orderNo}`, ref_id: order.id,
      }));
      if (moves.length) {
        await api("kr_stock_moves", { method: "POST", body: JSON.stringify(moves), prefer: "return=minimal" });
        for (const m of moves) {
          const item = items.find(i => i.id === m.item_id);
          if (item) {
            await api(`kr_items?id=eq.${m.item_id}`, {
              method: "PATCH", body: JSON.stringify({ stock: (item.stock || 0) - m.qty }), prefer: "return=minimal",
            });
          }
        }
      }

      setInvoice({ ...order, items: cart, customer, customerPhone, payment, subtotal, discount, total });
      setCart([]); setCustomer(""); setCustomerPhone(""); setDiscount(0);
      onRefresh();
      showToast(`✓ Transaksi ${orderNo} berhasil!`);
    } catch (e) {
      showToast("Gagal: " + e.message, "error");
    }
    setSaving(false);
  };

  if (invoice) return <InvoiceView invoice={invoice} onClose={() => setInvoice(null)} />;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 20 }}>
      {/* Products */}
      <div>
        <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
          <input placeholder="🔍 Cari produk / SKU..." value={search} onChange={e => setSearch(e.target.value)}
            style={{ flex: 1, padding: "10px 14px", border: "1px solid #ddd", borderRadius: 8, fontSize: 14 }} />
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
            style={{ padding: "10px 12px", border: "1px solid #ddd", borderRadius: 8, fontSize: 14 }}>
            <option value="all">Semua</option>
            <option value="product">Produk</option>
            <option value="workshop">Workshop</option>
            <option value="equipment">Perlengkapan</option>
          </select>
        </div>
        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: "#999" }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>📦</div>
            <div>Belum ada item. Tambah di tab Inventory.</div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
            {filtered.map(item => (
              <button key={item.id} onClick={() => addToCart(item)} style={{
                background: "#fff", border: "1px solid #e5e5e5", borderRadius: 10, padding: 14,
                cursor: item.type !== "workshop" && item.stock <= 0 ? "not-allowed" : "pointer",
                textAlign: "left", transition: "all 0.15s", opacity: item.type !== "workshop" && item.stock <= 0 ? 0.5 : 1,
              }} disabled={item.type !== "workshop" && item.stock <= 0}>
                <div style={{ fontSize: 10, padding: "2px 7px", borderRadius: 4, display: "inline-block", marginBottom: 6, background: COLORS[item.type].bg, color: COLORS[item.type].text, fontWeight: 600 }}>
                  {COLORS[item.type].label}
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, lineHeight: 1.3 }}>{item.name}</div>
                <div style={{ fontSize: 13, color: "#e8a020", fontWeight: 700 }}>{formatRp(item.price)}</div>
                {item.type !== "workshop" && (
                  <div style={{ fontSize: 11, color: item.stock <= 5 ? "#c0392b" : "#888", marginTop: 4 }}>
                    Stok: {item.stock} {item.unit}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Cart */}
      <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e5e5e5", padding: 20, height: "fit-content", position: "sticky", top: 20 }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 16 }}>🛒 Keranjang</div>
        <input placeholder="Nama customer (opsional)" value={customer} onChange={e => setCustomer(e.target.value)}
          style={{ width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: 8, fontSize: 13, marginBottom: 8, boxSizing: "border-box" }} />
        <input placeholder="No. HP (opsional)" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)}
          style={{ width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: 8, fontSize: 13, marginBottom: 12, boxSizing: "border-box" }} />

        {cart.length === 0 ? (
          <div style={{ textAlign: "center", padding: "30px 0", color: "#bbb", fontSize: 13 }}>Pilih produk dari kiri</div>
        ) : (
          <div style={{ marginBottom: 12 }}>
            {cart.map(item => (
              <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px solid #f0f0f0" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{item.name}</div>
                  <div style={{ fontSize: 12, color: "#888" }}>{formatRp(item.price)} × {item.qty}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <button onClick={() => updateQty(item.id, item.qty - 1)} style={{ width: 24, height: 24, border: "1px solid #ddd", borderRadius: 4, background: "#f5f5f5", cursor: "pointer", fontSize: 14 }}>−</button>
                  <span style={{ fontSize: 13, fontWeight: 600, minWidth: 20, textAlign: "center" }}>{item.qty}</span>
                  <button onClick={() => updateQty(item.id, item.qty + 1)} style={{ width: 24, height: 24, border: "1px solid #ddd", borderRadius: 4, background: "#f5f5f5", cursor: "pointer", fontSize: 14 }}>+</button>
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, minWidth: 72, textAlign: "right" }}>{formatRp(item.price * item.qty)}</div>
              </div>
            ))}
          </div>
        )}

        <div style={{ borderTop: "1px solid #eee", paddingTop: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#666", marginBottom: 6 }}>
            <span>Subtotal</span><span>{formatRp(subtotal)}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 13, color: "#666", flex: 1 }}>Diskon (Rp)</span>
            <input type="number" value={discount} onChange={e => setDiscount(Number(e.target.value))} min={0}
              style={{ width: 110, padding: "4px 8px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13, textAlign: "right" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 17, color: "#1a1a2e", marginBottom: 12 }}>
            <span>Total</span><span style={{ color: "#e8a020" }}>{formatRp(total)}</span>
          </div>

          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            {["cash", "qris"].map(m => (
              <button key={m} onClick={() => setPayment(m)} style={{
                flex: 1, padding: "8px 0", border: `2px solid ${payment === m ? "#e8a020" : "#ddd"}`,
                borderRadius: 8, background: payment === m ? "#fff8e6" : "#fff",
                color: payment === m ? "#e8a020" : "#666", fontWeight: payment === m ? 700 : 400,
                cursor: "pointer", fontSize: 13,
              }}>
                {m === "cash" ? "💵 Tunai" : "📲 QRIS"}
              </button>
            ))}
          </div>

          <button onClick={checkout} disabled={saving || !cart.length} style={{
            width: "100%", padding: "13px 0", background: saving || !cart.length ? "#ccc" : "#1a1a2e",
            color: "#fff", border: "none", borderRadius: 10, fontWeight: 700, fontSize: 15,
            cursor: saving || !cart.length ? "not-allowed" : "pointer",
          }}>
            {saving ? "Memproses..." : "✓ Proses Pembayaran"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── INVOICE VIEW ─────────────────────────────────────────────────────────────
function InvoiceView({ invoice, onClose }) {
  const print = () => window.print();
  return (
    <div style={{ maxWidth: 480, margin: "0 auto" }}>
      <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e5e5e5", padding: 32 }} id="invoice-print">
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontWeight: 800, fontSize: 22, letterSpacing: 2 }}>KURESAPI</div>
          <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>Bukti Pembayaran</div>
          <div style={{ fontSize: 12, color: "#888" }}>{invoice.order_no || invoice.orderNo}</div>
          <div style={{ fontSize: 12, color: "#888" }}>{new Date().toLocaleString("id-ID")}</div>
        </div>
        <div style={{ borderTop: "1px dashed #ddd", borderBottom: "1px dashed #ddd", padding: "12px 0", marginBottom: 12 }}>
          <div style={{ fontSize: 13, marginBottom: 4 }}>Customer: <b>{invoice.customer_name || invoice.customer || "Umum"}</b></div>
          {(invoice.customer_phone || invoice.customerPhone) && <div style={{ fontSize: 13 }}>HP: {invoice.customer_phone || invoice.customerPhone}</div>}
          <div style={{ fontSize: 13 }}>Pembayaran: <b>{(invoice.payment_method || invoice.payment) === "cash" ? "Tunai" : "QRIS"}</b></div>
        </div>
        {invoice.items?.map((item, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0" }}>
            <span>{item.name} × {item.qty}</span>
            <span>{formatRp(item.price * item.qty)}</span>
          </div>
        ))}
        <div style={{ borderTop: "1px dashed #ddd", marginTop: 12, paddingTop: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#666", marginBottom: 4 }}>
            <span>Subtotal</span><span>{formatRp(invoice.subtotal)}</span>
          </div>
          {invoice.discount > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#c0392b", marginBottom: 4 }}>
              <span>Diskon</span><span>- {formatRp(invoice.discount)}</span>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 16, marginTop: 4 }}>
            <span>TOTAL</span><span style={{ color: "#e8a020" }}>{formatRp(invoice.total)}</span>
          </div>
        </div>
        <div style={{ textAlign: "center", marginTop: 24, fontSize: 12, color: "#aaa" }}>Terima kasih sudah berbelanja! 🙏</div>
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
        <button onClick={print} style={{ flex: 1, padding: "11px 0", background: "#1a1a2e", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer" }}>🖨️ Print</button>
        <button onClick={onClose} style={{ flex: 1, padding: "11px 0", background: "#f5f5f5", color: "#333", border: "1px solid #ddd", borderRadius: 8, fontWeight: 600, cursor: "pointer" }}>← Kembali</button>
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
        showToast("Item diperbarui");
      } else {
        await api("kr_items", { method: "POST", body: JSON.stringify(payload), prefer: "return=minimal" });
        showToast("Item ditambahkan");
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
      <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 20 }}>{editing ? "Edit Item" : "Tambah Item Baru"}</div>
      <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e5e5e5", padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <label style={{ fontSize: 13, color: "#666", display: "block", marginBottom: 4 }}>Tipe *</label>
          <div style={{ display: "flex", gap: 8 }}>
            {[["product", "📦 Produk"], ["workshop", "🎓 Workshop"], ["equipment", "🔧 Perlengkapan"]].map(([v, l]) => (
              <button key={v} onClick={() => setForm(f => ({ ...f, type: v }))} style={{
                flex: 1, padding: "8px 0", border: `2px solid ${form.type === v ? "#e8a020" : "#ddd"}`,
                borderRadius: 8, background: form.type === v ? "#fff8e6" : "#fff", color: form.type === v ? "#e8a020" : "#555",
                fontWeight: form.type === v ? 700 : 400, cursor: "pointer", fontSize: 12,
              }}>{l}</button>
            ))}
          </div>
        </div>
        {[
          ["name", "Nama *", "text", "Nama produk/workshop..."],
          ["sku", "SKU / Kode", "text", "Opsional"],
          ["unit", "Satuan", "text", "pcs, lembar, slot, dll"],
          ["price", "Harga Jual (Rp) *", "number", "0"],
          ["cost", "Harga Modal (Rp)", "number", "0"],
          ["stock", "Stok Awal", "number", "0"],
        ].map(([k, l, t, ph]) => (
          <div key={k}>
            <label style={{ fontSize: 13, color: "#666", display: "block", marginBottom: 4 }}>{l}</label>
            <input type={t} placeholder={ph} value={form[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))}
              style={{ width: "100%", padding: "9px 12px", border: "1px solid #ddd", borderRadius: 8, fontSize: 14, boxSizing: "border-box" }} />
          </div>
        ))}
        <div>
          <label style={{ fontSize: 13, color: "#666", display: "block", marginBottom: 4 }}>Keterangan</label>
          <textarea rows={2} placeholder="Deskripsi opsional..." value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            style={{ width: "100%", padding: "9px 12px", border: "1px solid #ddd", borderRadius: 8, fontSize: 14, boxSizing: "border-box", resize: "vertical" }} />
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
          <button onClick={save} style={{ flex: 1, padding: "11px 0", background: "#1a1a2e", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer" }}>
            {editing ? "Simpan Perubahan" : "Tambah Item"}
          </button>
          <button onClick={() => setShowForm(false)} style={{ flex: 1, padding: "11px 0", background: "#f5f5f5", color: "#333", border: "1px solid #ddd", borderRadius: 8, fontWeight: 600, cursor: "pointer" }}>Batal</button>
        </div>
      </div>
    </div>
  );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 10 }}>
          {[["all", "Semua"], ["product", "Produk"], ["workshop", "Workshop"], ["equipment", "Perlengkapan"]].map(([v, l]) => (
            <button key={v} onClick={() => setFilter(v)} style={{
              padding: "7px 14px", borderRadius: 20, border: `1px solid ${filter === v ? "#e8a020" : "#ddd"}`,
              background: filter === v ? "#fff8e6" : "#fff", color: filter === v ? "#e8a020" : "#555",
              fontWeight: filter === v ? 700 : 400, cursor: "pointer", fontSize: 13,
            }}>{l} <span style={{ fontSize: 11, opacity: 0.7 }}>({stats[v]})</span></button>
          ))}
        </div>
        <button onClick={openNew} style={{ padding: "10px 18px", background: "#e8a020", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer", fontSize: 13 }}>
          + Tambah Item
        </button>
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "80px 0", color: "#bbb" }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>📦</div>
          <div style={{ fontSize: 16, marginBottom: 4 }}>Belum ada item</div>
          <button onClick={openNew} style={{ marginTop: 12, padding: "10px 20px", background: "#e8a020", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer" }}>Tambah Sekarang</button>
        </div>
      ) : (
        <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e5e5e5", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f8f8f8" }}>
                {["Nama", "Tipe", "SKU", "Satuan", "Harga Jual", "Modal", "Stok", "Aksi"].map(h => (
                  <th key={h} style={{ padding: "12px 14px", textAlign: "left", fontSize: 12, color: "#666", fontWeight: 600, borderBottom: "1px solid #eee" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => (
                <tr key={item.id} style={{ borderBottom: "1px solid #f5f5f5" }}>
                  <td style={{ padding: "12px 14px", fontSize: 14, fontWeight: 500 }}>{item.name}</td>
                  <td style={{ padding: "12px 14px" }}>
                    <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 4, background: COLORS[item.type].bg, color: COLORS[item.type].text, fontWeight: 600 }}>
                      {COLORS[item.type].label}
                    </span>
                  </td>
                  <td style={{ padding: "12px 14px", fontSize: 13, color: "#888" }}>{item.sku || "—"}</td>
                  <td style={{ padding: "12px 14px", fontSize: 13 }}>{item.unit}</td>
                  <td style={{ padding: "12px 14px", fontSize: 14, fontWeight: 600, color: "#1a1a2e" }}>{formatRp(item.price)}</td>
                  <td style={{ padding: "12px 14px", fontSize: 13, color: "#888" }}>{formatRp(item.cost)}</td>
                  <td style={{ padding: "12px 14px", fontSize: 14, fontWeight: 600, color: item.stock <= 5 && item.type !== "workshop" ? "#c0392b" : "#27ae60" }}>
                    {item.type === "workshop" ? "—" : `${item.stock} ${item.unit}`}
                  </td>
                  <td style={{ padding: "12px 14px" }}>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => openEdit(item)} style={{ padding: "5px 10px", background: "#f0f0f0", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 12 }}>Edit</button>
                      <button onClick={() => deactivate(item.id)} style={{ padding: "5px 10px", background: "#ffeaea", color: "#c0392b", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 12 }}>Nonaktif</button>
                    </div>
                  </td>
                </tr>
              ))}
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
      showToast(`Stok ${form.direction === "in" ? "masuk" : "keluar"} dicatat`);
    } catch (e) { showToast("Error: " + e.message, "error"); }
    setSaving(false);
  };

  const itemMap = Object.fromEntries(items.map(i => [i.id, i]));

  return (
    <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 24 }}>
      <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e5e5e5", padding: 20, height: "fit-content" }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 16 }}>Catat Mutasi Stok</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          {[["in", "📥 Masuk"], ["out", "📤 Keluar"]].map(([v, l]) => (
            <button key={v} onClick={() => setForm(f => ({ ...f, direction: v }))} style={{
              flex: 1, padding: "9px 0", border: `2px solid ${form.direction === v ? (v === "in" ? "#27ae60" : "#e74c3c") : "#ddd"}`,
              borderRadius: 8, background: form.direction === v ? (v === "in" ? "#edfaf4" : "#fdeaea") : "#fff",
              color: form.direction === v ? (v === "in" ? "#27ae60" : "#e74c3c") : "#555",
              fontWeight: form.direction === v ? 700 : 400, cursor: "pointer", fontSize: 13,
            }}>{l}</button>
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={{ fontSize: 13, color: "#666", display: "block", marginBottom: 4 }}>Item *</label>
            <select value={form.item_id} onChange={e => setForm(f => ({ ...f, item_id: e.target.value }))}
              style={{ width: "100%", padding: "9px 12px", border: "1px solid #ddd", borderRadius: 8, fontSize: 14 }}>
              <option value="">— Pilih item —</option>
              {items.filter(i => i.type !== "workshop").map(i => <option key={i.id} value={i.id}>{i.name} (stok: {i.stock})</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 13, color: "#666", display: "block", marginBottom: 4 }}>Jumlah *</label>
            <input type="number" min={1} placeholder="0" value={form.qty} onChange={e => setForm(f => ({ ...f, qty: e.target.value }))}
              style={{ width: "100%", padding: "9px 12px", border: "1px solid #ddd", borderRadius: 8, fontSize: 14, boxSizing: "border-box" }} />
          </div>
          <div>
            <label style={{ fontSize: 13, color: "#666", display: "block", marginBottom: 4 }}>Keterangan</label>
            <input placeholder="Contoh: Restock dari supplier..." value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
              style={{ width: "100%", padding: "9px 12px", border: "1px solid #ddd", borderRadius: 8, fontSize: 14, boxSizing: "border-box" }} />
          </div>
          <button onClick={save} disabled={saving} style={{
            padding: "11px 0", background: saving ? "#ccc" : "#1a1a2e",
            color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer",
          }}>{saving ? "Menyimpan..." : "Simpan Mutasi"}</button>
        </div>
      </div>

      <div>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 14 }}>Riwayat Mutasi Stok</div>
        <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e5e5e5", overflow: "hidden" }}>
          {moves.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 0", color: "#bbb" }}>Belum ada mutasi stok</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f8f8f8" }}>
                  {["Waktu", "Item", "Arah", "Qty", "Keterangan"].map(h => (
                    <th key={h} style={{ padding: "11px 14px", textAlign: "left", fontSize: 12, color: "#666", fontWeight: 600, borderBottom: "1px solid #eee" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {moves.map(m => (
                  <tr key={m.id} style={{ borderBottom: "1px solid #f5f5f5" }}>
                    <td style={{ padding: "10px 14px", fontSize: 12, color: "#888" }}>{formatDate(m.created_at)}</td>
                    <td style={{ padding: "10px 14px", fontSize: 13, fontWeight: 500 }}>{itemMap[m.item_id]?.name || "—"}</td>
                    <td style={{ padding: "10px 14px" }}>
                      <span style={{ fontSize: 12, padding: "3px 8px", borderRadius: 4, fontWeight: 600,
                        background: m.direction === "in" ? "#edfaf4" : "#fdeaea",
                        color: m.direction === "in" ? "#27ae60" : "#e74c3c",
                      }}>
                        {m.direction === "in" ? "📥 Masuk" : "📤 Keluar"}
                      </span>
                    </td>
                    <td style={{ padding: "10px 14px", fontSize: 14, fontWeight: 700 }}>{m.qty}</td>
                    <td style={{ padding: "10px 14px", fontSize: 13, color: "#666" }}>{m.note || "—"}</td>
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
    try {
      const data = await api(`kr_order_items?order_id=eq.${order.id}`);
      setOrderItems(data);
    } catch {}
    setLoadingDetail(false);
  };

  return (
    <div>
      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
        {[
          ["Total Transaksi", orders.length, "🧾"],
          ["Transaksi Hari Ini", todayOrders.length, "📅"],
          ["Omzet Hari Ini", formatRp(todayRevenue), "💰"],
          ["Total Omzet", formatRp(totalRevenue), "📈"],
        ].map(([l, v, icon]) => (
          <div key={l} style={{ background: "#fff", borderRadius: 10, border: "1px solid #e5e5e5", padding: "16px 18px" }}>
            <div style={{ fontSize: 11, color: "#888", marginBottom: 6 }}>{icon} {l}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#1a1a2e" }}>{v}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: detail ? "1fr 360px" : "1fr", gap: 20 }}>
        <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e5e5e5", overflow: "hidden" }}>
          <div style={{ padding: "14px 18px", borderBottom: "1px solid #eee", fontWeight: 700, fontSize: 15 }}>Riwayat Penjualan</div>
          {orders.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 0", color: "#bbb" }}>Belum ada penjualan</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f8f8f8" }}>
                  {["No Order", "Waktu", "Customer", "Pembayaran", "Total", "Status", ""].map(h => (
                    <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 12, color: "#666", fontWeight: 600, borderBottom: "1px solid #eee" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.map(o => (
                  <tr key={o.id} onClick={() => openDetail(o)} style={{ borderBottom: "1px solid #f5f5f5", cursor: "pointer", background: detail?.id === o.id ? "#fff8e6" : "transparent" }}>
                    <td style={{ padding: "10px 14px", fontSize: 13, fontWeight: 600, color: "#e8a020" }}>{o.order_no}</td>
                    <td style={{ padding: "10px 14px", fontSize: 12, color: "#888" }}>{formatDate(o.created_at)}</td>
                    <td style={{ padding: "10px 14px", fontSize: 13 }}>{o.customer_name || "Umum"}</td>
                    <td style={{ padding: "10px 14px", fontSize: 13 }}>{o.payment_method === "cash" ? "💵 Tunai" : "📲 QRIS"}</td>
                    <td style={{ padding: "10px 14px", fontSize: 14, fontWeight: 700 }}>{formatRp(o.total)}</td>
                    <td style={{ padding: "10px 14px" }}>
                      <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 4, fontWeight: 600,
                        background: o.status === "paid" ? "#edfaf4" : "#fff3e0",
                        color: o.status === "paid" ? "#27ae60" : "#e8a020",
                      }}>{o.status === "paid" ? "Lunas" : "Pending"}</span>
                    </td>
                    <td style={{ padding: "10px 14px", fontSize: 12, color: "#888" }}>→</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {detail && (
          <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e5e5e5", padding: 20, height: "fit-content", position: "sticky", top: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ fontWeight: 700 }}>Detail {detail.order_no}</div>
              <button onClick={() => setDetail(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "#888" }}>×</button>
            </div>
            <div style={{ fontSize: 13, color: "#666", marginBottom: 12 }}>
              <div>Customer: <b>{detail.customer_name || "Umum"}</b></div>
              {detail.customer_phone && <div>HP: {detail.customer_phone}</div>}
              <div>Pembayaran: {detail.payment_method === "cash" ? "💵 Tunai" : "📲 QRIS"}</div>
              <div>Waktu: {formatDate(detail.created_at)}</div>
            </div>
            {loadingDetail ? <div style={{ textAlign: "center", padding: 20, color: "#888" }}>Memuat...</div> : (
              <>
                <div style={{ borderTop: "1px solid #eee", paddingTop: 12, marginBottom: 12 }}>
                  {orderItems.map((oi, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "5px 0" }}>
                      <span>{oi.item_name} × {oi.qty}</span>
                      <span>{formatRp(oi.subtotal)}</span>
                    </div>
                  ))}
                </div>
                <div style={{ borderTop: "1px solid #eee", paddingTop: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#666", marginBottom: 4 }}>
                    <span>Subtotal</span><span>{formatRp(detail.subtotal)}</span>
                  </div>
                  {detail.discount > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#c0392b", marginBottom: 4 }}>
                      <span>Diskon</span><span>- {formatRp(detail.discount)}</span>
                    </div>
                  )}
                  <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 16 }}>
                    <span>Total</span><span style={{ color: "#e8a020" }}>{formatRp(detail.total)}</span>
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
      setStatus({ ok: true, msg: "✓ Tabel sudah ada dan terhubung! Sistem siap digunakan." });
      onRefresh();
    } catch (e) {
      if (e.message.includes("does not exist") || e.message.includes("42P01")) {
        setStatus({ ok: false, msg: "Tabel belum ada. Jalankan SQL di bawah di Supabase SQL Editor." });
      } else {
        setStatus({ ok: false, msg: "Error: " + e.message });
      }
    }
    setTesting(false);
  };

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>Setup Database</div>
      <div style={{ fontSize: 14, color: "#666", marginBottom: 20, lineHeight: 1.6 }}>
        Jalankan langkah berikut untuk menginisialisasi database KURESAPI di Supabase.
      </div>

      <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e5e5e5", padding: 24, marginBottom: 20 }}>
        <div style={{ fontWeight: 600, marginBottom: 12 }}>Langkah 1 — Cek koneksi</div>
        <button onClick={testConn} disabled={testing} style={{
          padding: "10px 20px", background: "#1a1a2e", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: testing ? "not-allowed" : "pointer",
        }}>{testing ? "Mengecek..." : "🔌 Test Koneksi"}</button>
        {status && (
          <div style={{ marginTop: 12, padding: "12px 16px", borderRadius: 8, background: status.ok ? "#edfaf4" : "#fdeaea", color: status.ok ? "#27ae60" : "#c0392b", fontSize: 14, fontWeight: 500 }}>
            {status.msg}
          </div>
        )}
      </div>

      <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e5e5e5", padding: 24 }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>Langkah 2 — Buat tabel (jika belum ada)</div>
        <div style={{ fontSize: 13, color: "#888", marginBottom: 12 }}>
          Buka <b>Supabase Dashboard → SQL Editor</b>, paste SQL berikut lalu klik Run:
        </div>
        <pre style={{ background: "#f5f5f5", borderRadius: 8, padding: 16, fontSize: 12, overflow: "auto", maxHeight: 360, lineHeight: 1.6, color: "#333" }}>
          {setupSql}
        </pre>
        <button onClick={() => { navigator.clipboard.writeText(setupSql); showToast("SQL disalin ke clipboard!"); }}
          style={{ marginTop: 12, padding: "9px 16px", background: "#f0f0f0", border: "1px solid #ddd", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
          📋 Salin SQL
        </button>
      </div>

      <div style={{ background: "#fff8e6", borderRadius: 12, border: "1px solid #fcd97a", padding: 18, marginTop: 20 }}>
        <div style={{ fontWeight: 600, color: "#a86a00", marginBottom: 6 }}>📝 Info Tabel</div>
        <div style={{ fontSize: 13, color: "#7a5200", lineHeight: 1.7 }}>
          <b>kr_items</b> — Produk, workshop, & perlengkapan<br />
          <b>kr_stock_moves</b> — Riwayat mutasi stok masuk/keluar<br />
          <b>kr_orders</b> — Transaksi penjualan<br />
          <b>kr_order_items</b> — Detail item per transaksi
        </div>
      </div>
    </div>
  );
}
