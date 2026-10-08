"use client";

import {
  ArrowDownLeft,
  ArrowUpRight,
  BarChart3,
  Bell,
  Check,
  ChevronDown,
  CircleHelp,
  CreditCard,
  Download,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Plus,
  Settings,
  SlidersHorizontal,
  Sun,
  Tag,
  Users,
  Wallet,
  X,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type TransactionType = "income" | "expense";
type PeriodKey =
  "day" | "week" | "month" | "3months" | "6months" | "year" | "3years";
type ViewKey =
  "overview" | "transactions" | "categories" | "settings" | "admin";
type Category = {
  id: string;
  name: string;
  type: TransactionType;
  color: string;
};
type Transaction = {
  id: string;
  title: string;
  amount: number;
  type: TransactionType;
  categoryId: string;
  date: string;
};
type AdminStats = {
  user_count: number;
  household_count: number;
  transaction_count: number;
  income_total: number;
  expense_total: number;
};

const periods: { key: PeriodKey; label: string; days: number }[] = [
  { key: "day", label: "วันนี้", days: 1 },
  { key: "week", label: "7 วัน", days: 7 },
  { key: "month", label: "1 เดือน", days: 30 },
  { key: "3months", label: "3 เดือน", days: 91 },
  { key: "6months", label: "6 เดือน", days: 183 },
  { key: "year", label: "1 ปี", days: 365 },
  { key: "3years", label: "3 ปี", days: 1095 },
];
const initialCategories: Category[] = [
  { id: "salary", name: "เงินเดือน", type: "income", color: "#4c8c72" },
  { id: "side-income", name: "รายได้เสริม", type: "income", color: "#85a878" },
  { id: "food", name: "อาหาร", type: "expense", color: "#dc8665" },
  { id: "transport", name: "เดินทาง", type: "expense", color: "#d2a044" },
  { id: "home", name: "ที่พักอาศัย", type: "expense", color: "#7487a0" },
  { id: "shopping", name: "ช้อปปิ้ง", type: "expense", color: "#ad7890" },
];

const initialAnchor = new Date("2026-10-08T12:00:00.000Z");

function shiftMonth(date: Date, monthOffset: number) {
  const shifted = new Date(date);
  const originalDay = shifted.getDate();
  shifted.setDate(1);
  shifted.setMonth(shifted.getMonth() + monthOffset);
  const lastDay = new Date(
    shifted.getFullYear(),
    shifted.getMonth() + 1,
    0,
  ).getDate();
  shifted.setDate(Math.min(originalDay, lastDay));
  return shifted;
}

function makeInitialTransactions(now: Date): Transaction[] {
  return Array.from({ length: 76 }, (_, index) => {
    const dayOffset = index === 0 ? 0 : (index * 43) % 1094;
    const date = new Date(now);
    date.setDate(now.getDate() - dayOffset);
    date.setHours((index * 5 + 9) % 24, 0, 0, 0);
    const type: TransactionType = index % 6 === 0 ? "income" : "expense";
    const expenseCategories = initialCategories.filter(
      (category) => category.type === "expense",
    );
    const incomeCategories = initialCategories.filter(
      (category) => category.type === "income",
    );
    const category =
      type === "income"
        ? incomeCategories[index % incomeCategories.length]
        : expenseCategories[index % expenseCategories.length];
    const title =
      type === "income"
        ? index % 2 === 0
          ? "เงินเดือนประจำ"
          : "งานฟรีแลนซ์"
        : ["กาแฟและอาหาร", "ค่าเดินทาง", "ของใช้ในบ้าน", "ซื้อของออนไลน์"][
            index % 4
          ];
    const amount =
      type === "income"
        ? 18000 + (index % 5) * 2750
        : 85 + ((index * 317) % 2380);
    return {
      id: `sample-${index}`,
      title,
      amount,
      type,
      categoryId: category.id,
      date: date.toISOString(),
    };
  });
}
const currency = (amount: number) =>
  new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    maximumFractionDigits: 0,
  }).format(amount);
const dateLabel = (date: string) =>
  new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "short",
    year: "2-digit",
  }).format(new Date(date));

export default function Home() {
  const [view, setView] = useState<ViewKey>("overview");
  const [period, setPeriod] = useState<PeriodKey>("month");
  const [categories, setCategories] = useState(initialCategories);
  const [today, setToday] = useState(initialAnchor);
  const [transactions, setTransactions] = useState<Transaction[]>(() =>
    makeInitialTransactions(initialAnchor),
  );
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [modal, setModal] = useState<
    "transaction" | "category" | "login" | "invite" | null
  >(null);
  const [showFilters, setShowFilters] = useState(false);
  const [toast, setToast] = useState("");
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminStats, setAdminStats] = useState<AdminStats | null>(null);
  const [databaseStatus, setDatabaseStatus] = useState<
    "not-configured" | "checking" | "connected" | "error"
  >(supabase ? "checking" : "not-configured");
  const [databaseError, setDatabaseError] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [inviteEmail, setInviteEmail] = useState("");
  const [newTransactionType, setNewTransactionType] =
    useState<TransactionType>("expense");
  const [storageReady, setStorageReady] = useState(false);
  const [transactionFilter, setTransactionFilter] = useState<
    "all" | TransactionType
  >("all");

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("save-siri-theme", theme);
  }, [theme]);
  useEffect(() => {
    if (!storageReady) return;
    window.localStorage.setItem("save-siri-categories", JSON.stringify(categories));
    window.localStorage.setItem("save-siri-transactions", JSON.stringify(transactions));
  }, [categories, storageReady, transactions]);
  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 3200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  async function loadAccount(userId: string, email: string) {
    if (!supabase) return;
    setSessionEmail(email);
    setDatabaseStatus("checking");
    setDatabaseError("");
    const { error: invitationError } = await supabase.rpc(
      "accept_household_invitation",
    );
    if (invitationError) {
      setDatabaseStatus("error");
      setDatabaseError(invitationError.message);
      return;
    }
    const [{ data: membership }, { data: profile }] = await Promise.all([
      supabase
        .from("household_members")
        .select("household_id")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle(),
      supabase
        .from("profiles")
        .select("is_admin")
        .eq("id", userId)
        .maybeSingle(),
    ]);
    const accountError = membership?.error ?? profile?.error;
    if (accountError) {
      setDatabaseStatus("error");
      setDatabaseError(accountError.message);
      return;
    }
    setIsAdmin(Boolean(profile?.is_admin));
    if (profile?.is_admin) {
      const { data } = await supabase.rpc("admin_overview");
      setAdminStats((Array.isArray(data) ? data[0] : null) as AdminStats | null);
    } else {
      setAdminStats(null);
    }
    if (!membership?.household_id) {
      setDatabaseStatus("error");
      setDatabaseError(
        "ไม่พบ household membership ให้รัน migration ฉบับล่าสุดใน Supabase",
      );
      return;
    }
    setHouseholdId(membership.household_id);
    const [{ data: cloudCategories }, { data: cloudTransactions }] =
      await Promise.all([
        supabase
          .from("categories")
          .select("id,name,type,color")
          .eq("household_id", membership.household_id),
        supabase
          .from("transactions")
          .select("id,title,amount,type,category_id,occurred_at")
          .eq("household_id", membership.household_id)
          .order("occurred_at", { ascending: false }),
      ]);
    const dataError = cloudCategories?.error ?? cloudTransactions?.error;
    if (dataError) {
      setDatabaseStatus("error");
      setDatabaseError(dataError.message);
      return;
    }
    if (cloudCategories?.length) setCategories(cloudCategories as Category[]);
    if (cloudTransactions)
      setTransactions(
        cloudTransactions.map((item) => ({
          id: item.id,
          title: item.title,
          amount: Number(item.amount),
          type: item.type as TransactionType,
          categoryId: item.category_id,
          date: item.occurred_at,
        })),
      );
    setDatabaseStatus("connected");
  }

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    const hydrateTimeout = window.setTimeout(() => {
      const currentDate = new Date();
      setToday(currentDate);
      setTransactions(makeInitialTransactions(currentDate));
      try {
        const savedCategories = window.localStorage.getItem("save-siri-categories");
        const savedTransactions = window.localStorage.getItem("save-siri-transactions");
        if (savedCategories) setCategories(JSON.parse(savedCategories) as Category[]);
        if (savedTransactions) setTransactions(JSON.parse(savedTransactions) as Transaction[]);
      } catch {
        window.localStorage.removeItem("save-siri-categories");
        window.localStorage.removeItem("save-siri-transactions");
      }
      setStorageReady(true);
      const savedTheme = window.localStorage.getItem("save-siri-theme");
      if (savedTheme === "dark" || savedTheme === "light") setTheme(savedTheme);
      if (!supabase) {
        setDatabaseStatus("not-configured");
        return;
      }
      void supabase.auth.getSession().then(({ data }) => {
        if (data.session?.user)
          void loadAccount(data.session.user.id, data.session.user.email ?? "");
      });
      const { data: authListener } = supabase.auth.onAuthStateChange(
        (_event, nextSession) => {
          if (nextSession?.user)
            void loadAccount(nextSession.user.id, nextSession.user.email ?? "");
          else {
            setSessionEmail(null);
            setHouseholdId(null);
            setIsAdmin(false);
            setDatabaseStatus("checking");
          }
        },
      );
      unsubscribe = () => authListener.subscription.unsubscribe();
    }, 0);
    return () => {
      window.clearTimeout(hydrateTimeout);
      unsubscribe?.();
    };
  }, []);

  const activePeriod = periods.find((item) => item.key === period)!;
  const rangeStart = useMemo(() => {
    const date = new Date(today);
    date.setHours(0, 0, 0, 0);
    if (period === "day") return date;
    if (period === "week") {
      date.setDate(date.getDate() - 6);
      return date;
    }
    const months =
      period === "month"
        ? 1
        : period === "3months"
          ? 3
          : period === "6months"
            ? 6
            : period === "year"
              ? 12
              : 36;
    return shiftMonth(date, -months);
  }, [period, today]);
  const filteredTransactions = useMemo(
    () =>
      transactions
        .filter(
          (item) =>
            new Date(item.date) >= rangeStart && new Date(item.date) <= today,
        )
        .sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
        ),
    [rangeStart, today, transactions],
  );
  const income = filteredTransactions
    .filter((item) => item.type === "income")
    .reduce((sum, item) => sum + item.amount, 0);
  const expense = filteredTransactions
    .filter((item) => item.type === "expense")
    .reduce((sum, item) => sum + item.amount, 0);
  const balance = income - expense;
  const chartData = useMemo(() => {
    const bucketCount =
      period === "day"
        ? 6
        : period === "week"
          ? 7
          : period === "month"
            ? 15
            : period === "3months"
              ? 13
              : period === "6months"
                ? 6
                : 12;
    return Array.from({ length: bucketCount }, (_, index) => {
      const bucketStart = new Date(rangeStart);
      const bucketEnd = new Date(rangeStart);
      if (period === "day") {
        bucketStart.setHours(index * 4);
        bucketEnd.setHours((index + 1) * 4);
      } else if (period === "week") {
        bucketStart.setDate(bucketStart.getDate() + index);
        bucketEnd.setDate(bucketEnd.getDate() + index + 1);
      } else if (period === "month") {
        const duration = today.getTime() - rangeStart.getTime();
        bucketStart.setTime(
          rangeStart.getTime() + (duration * index) / bucketCount,
        );
        bucketEnd.setTime(
          rangeStart.getTime() + (duration * (index + 1)) / bucketCount,
        );
      } else if (period === "3months") {
        bucketStart.setDate(bucketStart.getDate() + index * 7);
        bucketEnd.setDate(bucketEnd.getDate() + (index + 1) * 7);
      } else {
        const monthsPerBucket = period === "3years" ? 3 : 1;
        bucketStart.setTime(
          shiftMonth(rangeStart, index * monthsPerBucket).getTime(),
        );
        bucketEnd.setTime(
          shiftMonth(rangeStart, (index + 1) * monthsPerBucket).getTime(),
        );
      }
      const items = filteredTransactions.filter((item) => {
        const date = new Date(item.date);
        return (
          date >= bucketStart &&
          (index === bucketCount - 1 ? date <= today : date < bucketEnd)
        );
      });
      return {
        label:
          period === "day"
            ? new Intl.DateTimeFormat("th-TH", {
                hour: "2-digit",
                hourCycle: "h23",
              }).format(bucketStart)
            : period === "week"
              ? new Intl.DateTimeFormat("th-TH", { weekday: "short" }).format(
                  bucketStart,
                )
              : period === "month"
                ? `${bucketStart.getDate()}`
                : period === "3years"
                  ? new Intl.DateTimeFormat("th-TH", {
                      month: "short",
                      year: "2-digit",
                    }).format(bucketStart)
                  : new Intl.DateTimeFormat("th-TH", { month: "short" }).format(
                      bucketStart,
                    ),
        income: items
          .filter((item) => item.type === "income")
          .reduce((sum, item) => sum + item.amount, 0),
        expense: items
          .filter((item) => item.type === "expense")
          .reduce((sum, item) => sum + item.amount, 0),
      };
    });
  }, [filteredTransactions, period, rangeStart, today]);
  const expenseCategories = categories
    .filter((category) => category.type === "expense")
    .map((category) => ({
      ...category,
      amount: filteredTransactions
        .filter(
          (item) => item.type === "expense" && item.categoryId === category.id,
        )
        .reduce((sum, item) => sum + item.amount, 0),
    }))
    .sort((a, b) => b.amount - a.amount);
  const displayedTransactions = filteredTransactions.filter(
    (item) => transactionFilter === "all" || item.type === transactionFilter,
  );

  function notify(message: string) {
    setToast(message);
  }
  async function addTransaction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const type = form.get("type") as TransactionType;
    const categoryId = form.get("category") as string;
    const title = String(form.get("title") ?? "").trim();
    const amount = Number(form.get("amount"));
    const date = new Date(String(form.get("date"))).toISOString();
    if (!title || !amount || amount < 0.01) return;
    let id = crypto.randomUUID();
    if (supabase && householdId && sessionEmail) {
      const { data, error } = await supabase
        .from("transactions")
        .insert({
          household_id: householdId,
          title,
          amount,
          type,
          category_id: categoryId,
          occurred_at: date,
        })
        .select("id")
        .single();
      if (error) return notify("บันทึกไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่อ");
      id = data.id;
    }
    setTransactions((current) => [
      { id, title, amount, type, categoryId, date },
      ...current,
    ]);
    setModal(null);
    notify("เพิ่มรายการเรียบร้อย");
  }
  async function addCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const type = form.get("type") as TransactionType;
    if (!name) return;
    let category: Category = {
      id: crypto.randomUUID(),
      name,
      type,
      color: type === "income" ? "#4c8c72" : "#dc8665",
    };
    if (supabase && householdId && sessionEmail) {
      const { data, error } = await supabase
        .from("categories")
        .insert({
          household_id: householdId,
          name,
          type,
          color: category.color,
        })
        .select("id,name,type,color")
        .single();
      if (error) return notify("เพิ่มหมวดหมู่ไม่สำเร็จ");
      category = data as Category;
    }
    setCategories((current) => [...current, category]);
    setModal(null);
    notify("เพิ่มหมวดหมู่แล้ว");
  }
  async function removeCategory(category: Category) {
    if (transactions.some((item) => item.categoryId === category.id))
      return notify("ลบไม่ได้: ยังมีรายการใช้หมวดหมู่นี้");
    if (
      supabase &&
      householdId &&
      sessionEmail &&
      ![
        "salary",
        "side-income",
        "food",
        "transport",
        "home",
        "shopping",
      ].includes(category.id)
    ) {
      const { error } = await supabase
        .from("categories")
        .delete()
        .eq("id", category.id);
      if (error) return notify("ลบหมวดหมู่ไม่สำเร็จ");
    }
    setCategories((current) =>
      current.filter((item) => item.id !== category.id),
    );
    notify("ลบหมวดหมู่แล้ว");
  }
  async function deleteTransaction(transaction: Transaction) {
    if (supabase && householdId && sessionEmail) {
      const { error } = await supabase
        .from("transactions")
        .delete()
        .eq("id", transaction.id);
      if (error) return notify("ลบรายการไม่สำเร็จ");
    }
    setTransactions((current) =>
      current.filter((item) => item.id !== transaction.id),
    );
    notify("ลบรายการแล้ว");
  }
  async function sendMagicLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase)
      return notify("ตั้งค่า Supabase URL และ publishable key ใน .env.local ก่อน");
    const { error } = await supabase.auth.signInWithOtp({
      email: authEmail,
      options: {
        emailRedirectTo: window.location.origin,
        shouldCreateUser: authMode === "signup",
      },
    });
    if (error) {
      const message = error.message.toLowerCase();
      if (authMode === "login" && message.includes("user not found")) {
        return notify("ไม่พบบัญชีนี้ เลือกสมัครใช้งานก่อน");
      }
      if (message.includes("rate limit")) {
        return notify("ส่งอีเมลบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่");
      }
      return notify("ส่งลิงก์ไม่สำเร็จ ตรวจสอบการตั้งค่า Email ใน Supabase");
    }
    setModal(null);
    notify(
      authMode === "signup"
        ? "ส่งลิงก์ยืนยันการสมัครไปที่อีเมลแล้ว"
        : "ส่งลิงก์เข้าสู่ระบบไปที่อีเมลแล้ว",
    );
  }
  async function inviteMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !householdId)
      return notify("เข้าสู่ระบบและตั้งค่า Supabase เพื่อเชื่อมบัญชี");
    const { data } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token;
    if (!accessToken) return notify("กรุณาเข้าสู่ระบบใหม่อีกครั้ง");
    const response = await fetch("/api/invitations", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ householdId, email: inviteEmail.trim().toLowerCase() }),
    });
    if (!response.ok) return notify("ส่งคำเชิญไม่สำเร็จ ตรวจสอบการตั้งค่าอีเมลใน Supabase");
    setModal(null);
    notify("ส่งคำเชิญไปยังอีเมลแล้ว");
  }
  function exportPdf() {
    setView("overview");
    window.setTimeout(() => window.print(), 100);
  }

  const navigation: {
    key: ViewKey;
    label: string;
    icon: typeof LayoutDashboard;
  }[] = [
    { key: "overview", label: "ภาพรวม", icon: LayoutDashboard },
    { key: "transactions", label: "รายการทั้งหมด", icon: CreditCard },
    { key: "categories", label: "หมวดหมู่", icon: Tag },
    { key: "settings", label: "ตั้งค่า", icon: Settings },
  ];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#overview"
          onClick={() => setView("overview")}
        >
          <span className="brand-mark">
            <Wallet size={19} strokeWidth={2.3} />
          </span>
          <span>
            save<span className="brand-accent">siri</span>
          </span>
        </a>
        <div className="workspace-label">WORKSPACE</div>
        <nav className="side-nav" aria-label="เมนูหลัก">
          {navigation.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              className={`nav-item ${view === key ? "active" : ""}`}
              onClick={() => setView(key)}
            >
              <Icon size={18} strokeWidth={1.8} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="side-bottom">
          <button
            className={`nav-item ${view === "admin" ? "active" : ""}`}
            onClick={() => setView("admin")}
          >
            <SlidersHorizontal size={18} strokeWidth={1.8} />
            <span>ผู้ดูแลระบบ</span>
          </button>
          <div className="sidebar-help">
            <span className="help-icon">
              <CircleHelp size={17} />
            </span>
            <span>
              <strong>ต้องการความช่วยเหลือ?</strong>
              <small>ทีมงานพร้อมช่วยคุณ</small>
            </span>
            <ChevronDown size={15} />
          </div>
          <button
            className="account-chip"
            onClick={() => setModal(sessionEmail ? "invite" : "login")}
          >
            <span className="avatar">
              {sessionEmail ? sessionEmail.slice(0, 1).toUpperCase() : "S"}
            </span>
            <span className="account-copy">
              <strong>{sessionEmail ?? "บัญชีทดลอง"}</strong>
              <small>
                {sessionEmail ? "บัญชีที่เชื่อมต่อ" : "ยังไม่เชื่อมต่อ"}
              </small>
            </span>
            {sessionEmail && (
              <span
                className="logout-button"
                aria-label="ออกจากระบบ"
                title="ออกจากระบบ"
                onClick={(event) => {
                  event.stopPropagation();
                  void supabase?.auth.signOut();
                }}
              >
                <LogOut size={15} />
              </span>
            )}
          </button>
        </div>
      </aside>
      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb">
            <span>การเงินของฉัน</span>
            <span className="breadcrumb-slash">/</span>
            <strong>
              {navigation.find((item) => item.key === view)?.label ??
                "ผู้ดูแลระบบ"}
            </strong>
          </div>
          <div className="top-actions">
            <button
              className="icon-button theme-button"
              aria-label="เปลี่ยนธีม"
              title="เปลี่ยนธีม"
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            >
              {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
            </button>
            <button
              className="icon-button notification-button"
              aria-label="การแจ้งเตือน"
              title="การแจ้งเตือน"
            >
              <Bell size={18} />
              <i />
            </button>
            <button
              className="mobile-menu"
              aria-label="เมนู"
              onClick={() =>
                setView(view === "overview" ? "transactions" : "overview")
              }
            >
              <Menu size={21} />
            </button>
            <button
              className="primary-button top-add"
              onClick={() => {
                setNewTransactionType("expense");
                setModal("transaction");
              }}
            >
              <Plus size={17} />
              เพิ่มรายการ
            </button>
          </div>
        </header>
        <div className="page-content">
          {view === "overview" && (
            <>
              <section className="page-heading">
                <div>
                  <p className="eyebrow">WEDNESDAY, OCTOBER 08, 2026</p>
                  <h1>ภาพรวมการเงิน</h1>
                  <p className="subheading">
                    เห็นภาพชัดขึ้น วางแผนได้มั่นใจกว่าเดิม
                  </p>
                </div>
                <button
                  className="secondary-button export-button"
                  onClick={exportPdf}
                >
                  <Download size={16} />
                  ส่งออก PDF
                </button>
              </section>
              <section className="period-toolbar" aria-label="ช่วงเวลาสรุป">
                <div className="period-tabs">
                  {periods.map((item) => (
                    <button
                      key={item.key}
                      onClick={() => setPeriod(item.key)}
                      className={period === item.key ? "selected" : ""}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                <button
                  className={`filter-button ${showFilters ? "selected" : ""}`}
                  onClick={() => setShowFilters(!showFilters)}
                >
                  <SlidersHorizontal size={15} />
                  ตัวกรอง
                </button>
              </section>
              {showFilters && (
                <div className="filter-panel">
                  <span>แสดงรายการ</span>
                  <button
                    className={
                      transactionFilter === "all" ? "filter-active" : ""
                    }
                    onClick={() => setTransactionFilter("all")}
                  >
                    ทั้งหมด
                  </button>
                  <button
                    className={
                      transactionFilter === "income" ? "filter-active" : ""
                    }
                    onClick={() => setTransactionFilter("income")}
                  >
                    รายรับ
                  </button>
                  <button
                    className={
                      transactionFilter === "expense" ? "filter-active" : ""
                    }
                    onClick={() => setTransactionFilter("expense")}
                  >
                    รายจ่าย
                  </button>
                  <span className="filter-note">ใช้กับรายการล่าสุด</span>
                </div>
              )}
              <section className="summary-grid">
                <article className="summary-card balance-card">
                  <div className="summary-top">
                    <span>คงเหลือสุทธิ</span>
                    <span className="summary-icon balance-icon">
                      <Wallet size={18} />
                    </span>
                  </div>
                  <strong className="summary-value">{currency(balance)}</strong>
                  <div className="summary-foot">
                    <span
                      className={`change-pill ${balance >= 0 ? "positive" : "negative"}`}
                    >
                      {balance >= 0 ? (
                        <ArrowUpRight size={14} />
                      ) : (
                        <ArrowDownLeft size={14} />
                      )}
                      {income + expense
                        ? `${Math.round((Math.abs(balance) / (income + expense)) * 100)}%`
                        : "0%"}
                    </span>
                    <span>จากรายรับสุทธิในช่วงนี้</span>
                  </div>
                </article>
                <article className="summary-card">
                  <div className="summary-top">
                    <span>รายรับทั้งหมด</span>
                    <span className="summary-icon income-icon">
                      <ArrowDownLeft size={18} />
                    </span>
                  </div>
                  <strong className="summary-value">{currency(income)}</strong>
                  <div className="summary-foot">
                    <span className="mini-trend up">↗</span>
                    <span>
                      {
                        filteredTransactions.filter(
                          (item) => item.type === "income",
                        ).length
                      }{" "}
                      รายการในช่วงนี้
                    </span>
                  </div>
                </article>
                <article className="summary-card">
                  <div className="summary-top">
                    <span>รายจ่ายทั้งหมด</span>
                    <span className="summary-icon expense-icon">
                      <ArrowUpRight size={18} />
                    </span>
                  </div>
                  <strong className="summary-value">{currency(expense)}</strong>
                  <div className="summary-foot">
                    <span className="mini-trend down">↘</span>
                    <span>
                      {
                        filteredTransactions.filter(
                          (item) => item.type === "expense",
                        ).length
                      }{" "}
                      รายการในช่วงนี้
                    </span>
                  </div>
                </article>
                <article className="summary-card">
                  <div className="summary-top">
                    <span>อัตราการออม</span>
                    <span className="summary-icon savings-icon">
                      <BarChart3 size={18} />
                    </span>
                  </div>
                  <strong className="summary-value">
                    {income
                      ? `${Math.max(0, Math.round((balance / income) * 100))}%`
                      : "0%"}
                  </strong>
                  <div className="summary-foot">
                    <span className="mini-trend up">↗</span>
                    <span>เป้าหมายแนะนำ 20%</span>
                  </div>
                </article>
              </section>
              <section className="content-grid">
                <article className="panel chart-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>กระแสเงินสด</h2>
                      <p>รายรับและรายจ่ายตามช่วงเวลา</p>
                    </div>
                    <div className="chart-legend">
                      <span>
                        <i className="legend-income" />
                        รายรับ
                      </span>
                      <span>
                        <i className="legend-expense" />
                        รายจ่าย
                      </span>
                    </div>
                  </div>
                  <div className="chart-wrap">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={chartData}
                        margin={{ top: 12, right: 4, left: -17, bottom: 0 }}
                      >
                        <defs>
                          <linearGradient
                            id="incomeFill"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="0%"
                              stopColor="#44856e"
                              stopOpacity={0.16}
                            />
                            <stop
                              offset="100%"
                              stopColor="#44856e"
                              stopOpacity={0}
                            />
                          </linearGradient>
                          <linearGradient
                            id="expenseFill"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="0%"
                              stopColor="#df8c68"
                              stopOpacity={0.13}
                            />
                            <stop
                              offset="100%"
                              stopColor="#df8c68"
                              stopOpacity={0}
                            />
                          </linearGradient>
                        </defs>
                        <CartesianGrid
                          vertical={false}
                          stroke="var(--line)"
                          strokeDasharray="3 5"
                        />
                        <XAxis
                          dataKey="label"
                          axisLine={false}
                          tickLine={false}
                          tick={{ fill: "var(--muted)", fontSize: 11 }}
                          dy={10}
                        />
                        <YAxis
                          axisLine={false}
                          tickLine={false}
                          tick={{ fill: "var(--muted)", fontSize: 11 }}
                          tickFormatter={(value: number) =>
                            value >= 1000 ? `${value / 1000}k` : String(value)
                          }
                        />
                        <Tooltip
                          formatter={(value) => currency(Number(value))}
                          contentStyle={{
                            border: "1px solid var(--line)",
                            borderRadius: 8,
                            background: "var(--surface)",
                            color: "var(--text)",
                            fontSize: 12,
                          }}
                          labelStyle={{ color: "var(--muted)" }}
                        />
                        <Area
                          type="monotone"
                          dataKey="income"
                          name="รายรับ"
                          stroke="#4c8c72"
                          strokeWidth={2.5}
                          fill="url(#incomeFill)"
                          activeDot={{ r: 4 }}
                        />
                        <Area
                          type="monotone"
                          dataKey="expense"
                          name="รายจ่าย"
                          stroke="#d98865"
                          strokeWidth={2.5}
                          fill="url(#expenseFill)"
                          activeDot={{ r: 4 }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="chart-footer">
                    <span>แสดงข้อมูลย้อนหลัง {activePeriod.label}</span>
                    <span className="chart-period">
                      {dateLabel(rangeStart.toISOString())} –{" "}
                      {dateLabel(today.toISOString())}
                    </span>
                  </div>
                </article>
                <article className="panel category-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>รายจ่ายตามหมวดหมู่</h2>
                      <p>สัดส่วนการใช้จ่ายในช่วงนี้</p>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => setView("categories")}
                    >
                      ดูทั้งหมด <ArrowUpRight size={14} />
                    </button>
                  </div>
                  {expenseCategories.some((item) => item.amount > 0) ? (
                    <div className="category-list">
                      {expenseCategories
                        .filter((item) => item.amount > 0)
                        .slice(0, 5)
                        .map((item) => (
                          <div className="category-row" key={item.id}>
                            <span
                              className="category-dot"
                              style={{ backgroundColor: item.color }}
                            />
                            <span className="category-name">{item.name}</span>
                            <span className="category-amount">
                              {currency(item.amount)}
                            </span>
                            <span className="category-percent">
                              {expense
                                ? Math.round((item.amount / expense) * 100)
                                : 0}
                              %
                            </span>
                          </div>
                        ))}
                    </div>
                  ) : (
                    <div className="empty-small">
                      ยังไม่มีรายจ่ายในช่วงเวลานี้
                    </div>
                  )}
                  <button
                    className="add-category-link"
                    onClick={() => setModal("category")}
                  >
                    <Plus size={15} />
                    เพิ่มหมวดหมู่
                  </button>
                </article>
              </section>
              <section className="panel transactions-panel">
                <div className="panel-heading">
                  <div>
                    <h2>รายการล่าสุด</h2>
                    <p>รายการเคลื่อนไหวในช่วงเวลาที่เลือก</p>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => setView("transactions")}
                  >
                    ดูรายการทั้งหมด <ArrowUpRight size={14} />
                  </button>
                </div>
                <TransactionTable
                  transactions={displayedTransactions.slice(0, 5)}
                  categories={categories}
                  onDelete={deleteTransaction}
                />
              </section>
              <section className="print-report">
                <h1>รายงานการเงิน save siri</h1>
                <p>
                  ช่วงเวลา: {activePeriod.label} ·{" "}
                  {dateLabel(rangeStart.toISOString())} –{" "}
                  {dateLabel(today.toISOString())}
                </p>
                <p>
                  รายรับรวม: {currency(income)} · รายจ่ายรวม:{" "}
                  {currency(expense)} · คงเหลือสุทธิ: {currency(balance)}
                </p>
                <TransactionTable
                  transactions={filteredTransactions}
                  categories={categories}
                  onDelete={() => undefined}
                />
              </section>
            </>
          )}
          {view === "transactions" && (
            <section className="page-section">
              <div className="page-heading">
                <div>
                  <p className="eyebrow">ACTIVITY</p>
                  <h1>รายการทั้งหมด</h1>
                  <p className="subheading">
                    ตรวจสอบและจัดการความเคลื่อนไหวของคุณ
                  </p>
                </div>
                <button
                  className="primary-button"
                  onClick={() => {
                    setNewTransactionType("expense");
                    setModal("transaction");
                  }}
                >
                  <Plus size={17} />
                  เพิ่มรายการ
                </button>
              </div>
              <section className="period-toolbar">
                <div className="period-tabs">
                  {periods.map((item) => (
                    <button
                      key={item.key}
                      onClick={() => setPeriod(item.key)}
                      className={period === item.key ? "selected" : ""}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                <span className="transaction-count">
                  {displayedTransactions.length} รายการ
                </span>
              </section>
              <div className="panel transactions-panel">
                <div className="transaction-filters">
                  <button
                    className={
                      transactionFilter === "all" ? "filter-active" : ""
                    }
                    onClick={() => setTransactionFilter("all")}
                  >
                    ทั้งหมด
                  </button>
                  <button
                    className={
                      transactionFilter === "income" ? "filter-active" : ""
                    }
                    onClick={() => setTransactionFilter("income")}
                  >
                    รายรับ
                  </button>
                  <button
                    className={
                      transactionFilter === "expense" ? "filter-active" : ""
                    }
                    onClick={() => setTransactionFilter("expense")}
                  >
                    รายจ่าย
                  </button>
                </div>
                <TransactionTable
                  transactions={displayedTransactions}
                  categories={categories}
                  onDelete={deleteTransaction}
                />
              </div>
            </section>
          )}
          {view === "categories" && (
            <section className="page-section">
              <div className="page-heading">
                <div>
                  <p className="eyebrow">ORGANIZE</p>
                  <h1>หมวดหมู่</h1>
                  <p className="subheading">
                    จัดกลุ่มรายรับและรายจ่ายให้เป็นระเบียบ
                  </p>
                </div>
                <button
                  className="primary-button"
                  onClick={() => setModal("category")}
                >
                  <Plus size={17} />
                  เพิ่มหมวดหมู่
                </button>
              </div>
              <div className="category-manager-grid">
                {(["income", "expense"] as TransactionType[]).map((type) => (
                  <section className="panel manager-panel" key={type}>
                    <div className="panel-heading">
                      <div>
                        <h2>{type === "income" ? "รายรับ" : "รายจ่าย"}</h2>
                        <p>
                          {
                            categories.filter((item) => item.type === type)
                              .length
                          }{" "}
                          หมวดหมู่
                        </p>
                      </div>
                      <span
                        className={`summary-icon ${type === "income" ? "income-icon" : "expense-icon"}`}
                      >
                        {type === "income" ? (
                          <ArrowDownLeft size={18} />
                        ) : (
                          <ArrowUpRight size={18} />
                        )}
                      </span>
                    </div>
                    {categories
                      .filter((item) => item.type === type)
                      .map((item) => (
                        <div className="manager-category" key={item.id}>
                          <span
                            className="category-dot"
                            style={{ backgroundColor: item.color }}
                          />
                          <span>{item.name}</span>
                          <span className="manager-usage">
                            {
                              transactions.filter(
                                (transaction) =>
                                  transaction.categoryId === item.id,
                              ).length
                            }{" "}
                            รายการ
                          </span>
                          <button
                            className="delete-icon"
                            aria-label={`ลบหมวดหมู่ ${item.name}`}
                            title="ลบหมวดหมู่"
                            onClick={() => void removeCategory(item)}
                          >
                            <X size={16} />
                          </button>
                        </div>
                      ))}
                  </section>
                ))}
              </div>
            </section>
          )}
          {view === "settings" && (
            <section className="page-section">
              <div className="page-heading">
                <div>
                  <p className="eyebrow">PREFERENCES</p>
                  <h1>ตั้งค่า</h1>
                  <p className="subheading">
                    ปรับ save siri ให้เหมาะกับการใช้งานของคุณ
                  </p>
                </div>
              </div>
              <div className="settings-list">
                <section className="panel setting-row">
                  <span className="setting-icon">
                    <Sun size={19} />
                  </span>
                  <div className="setting-copy">
                    <strong>ธีมสี</strong>
                    <span>เลือกรูปแบบการแสดงผลที่คุณชอบ</span>
                  </div>
                  <div className="theme-switch">
                    <button
                      className={theme === "light" ? "chosen" : ""}
                      onClick={() => setTheme("light")}
                    >
                      <Sun size={15} />
                      สว่าง
                    </button>
                    <button
                      className={theme === "dark" ? "chosen" : ""}
                      onClick={() => setTheme("dark")}
                    >
                      <Moon size={15} />
                      มืด
                    </button>
                  </div>
                </section>
                <section className="panel setting-row">
                  <span className="setting-icon">
                    <Users size={19} />
                  </span>
                  <div className="setting-copy">
                    <strong>แชร์ข้อมูลกับคนในครอบครัว</strong>
                    <span>เชื่อมบัญชีผ่านอีเมล ใช้ข้อมูลชุดเดียวกัน</span>
                  </div>
                  <button
                    className="secondary-button"
                    onClick={() => setModal("invite")}
                  >
                    <Plus size={15} />
                    เชิญสมาชิก
                  </button>
                </section>
                <section className="panel setting-row">
                  <span className="setting-icon">
                    <Wallet size={19} />
                  </span>
                  <div className="setting-copy">
                    <strong>บัญชีและการเข้าสู่ระบบ</strong>
                    <span>
                      {sessionEmail ??
                        (supabase
                          ? "เข้าสู่ระบบด้วยลิงก์ทางอีเมล ไม่ต้องใช้รหัสผ่าน"
                          : "เพิ่ม Supabase keys เพื่อเปิดใช้บัญชีบนคลาวด์")}
                    </span>
                  </div>
                  {sessionEmail ? (
                    <button
                      className="secondary-button"
                      onClick={() => void supabase?.auth.signOut()}
                    >
                      <LogOut size={15} />
                      ออกจากระบบ
                    </button>
                  ) : (
                    <button
                      className="secondary-button"
                      onClick={() => setModal("login")}
                    >
                      เข้าสู่ระบบ
                    </button>
                  )}
                </section>
                <section className="panel setting-row">
                  <span className="setting-icon">
                    <Download size={19} />
                  </span>
                  <div className="setting-copy">
                    <strong>รายงานและข้อมูล</strong>
                    <span>ดาวน์โหลดสรุปรายการเป็น PDF</span>
                  </div>
                  <button className="secondary-button" onClick={exportPdf}>
                    <Download size={15} />
                    ส่งออก PDF
                  </button>
                </section>
              </div>
            </section>
          )}
          {view === "admin" && (
            <section className="page-section">
              <div className="page-heading">
                <div>
                  <p className="eyebrow">ADMINISTRATION</p>
                  <h1>แดชบอร์ดผู้ดูแล</h1>
                  <p className="subheading">ภาพรวมการใช้งานของระบบ</p>
                </div>
              </div>
              {isAdmin ? (
                <div className="admin-grid">
                  <article className="summary-card">
                    <div className="summary-top">
                      <span>ผู้ใช้งานทั้งหมด</span>
                      <Users size={18} />
                    </div>
                    <strong className="summary-value">
                      {adminStats?.user_count ?? "—"}
                    </strong>
                    <div className="summary-foot">บัญชีที่ลงทะเบียน</div>
                  </article>
                  <article className="summary-card">
                    <div className="summary-top">
                      <span>workspace ทั้งหมด</span>
                      <Wallet size={18} />
                    </div>
                    <strong className="summary-value">
                      {adminStats?.household_count ?? "—"}
                    </strong>
                    <div className="summary-foot">พื้นที่ใช้งานที่สร้างแล้ว</div>
                  </article>
                  <article className="summary-card">
                    <div className="summary-top">
                      <span>รายการทั้งหมด</span>
                      <CreditCard size={18} />
                    </div>
                    <strong className="summary-value">
                      {adminStats?.transaction_count ?? "—"}
                    </strong>
                    <div className="summary-foot">ธุรกรรมของผู้ใช้ทั้งหมด</div>
                  </article>
                  <article className="summary-card">
                    <div className="summary-top">
                      <span>รายรับรวมทั้งระบบ</span>
                      <BarChart3 size={18} />
                    </div>
                    <strong className="summary-value">
                      {currency(Number(adminStats?.income_total ?? 0))}
                    </strong>
                    <div className="summary-foot">
                      รายจ่ายรวม {currency(Number(adminStats?.expense_total ?? 0))}
                    </div>
                  </article>
                </div>
              ) : (
                <div className="panel access-denied">
                  <span className="lock-mark">
                    <Settings size={22} />
                  </span>
                  <h2>สำหรับผู้ดูแลระบบเท่านั้น</h2>
                  <p>
                    เข้าสู่ระบบด้วยบัญชีที่กำหนดสิทธิ์ผู้ดูแลใน Supabase
                    เพื่อดูข้อมูลระบบ
                  </p>
                  {!sessionEmail && (
                    <button
                      className="primary-button"
                      onClick={() => setModal("login")}
                    >
                      เข้าสู่ระบบ
                    </button>
                  )}
                </div>
              )}
            </section>
          )}
        </div>
      </main>
      <nav className="mobile-nav" aria-label="เมนูมือถือ">
        {navigation.slice(0, 4).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            className={view === key ? "active" : ""}
            onClick={() => setView(key)}
          >
            <Icon size={19} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      {modal && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setModal(null);
          }}
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">
                  {modal === "transaction"
                    ? "NEW ACTIVITY"
                    : modal === "category"
                      ? "ORGANIZE"
                      : modal === "invite"
                        ? "SHARED WORKSPACE"
                        : "SECURE SIGN IN"}
                </p>
                <h2 id="modal-title">
                  {modal === "transaction"
                    ? "เพิ่มรายการ"
                    : modal === "category"
                      ? "เพิ่มหมวดหมู่"
                      : modal === "invite"
                        ? "เชิญสมาชิก"
                        : "เข้าสู่ระบบ"}
                </h2>
              </div>
              <button
                className="icon-button close-button"
                aria-label="ปิด"
                onClick={() => setModal(null)}
              >
                <X size={19} />
              </button>
            </div>
            {modal === "transaction" && (
              <form className="form-grid" onSubmit={addTransaction}>
                <label>
                  ประเภทรายการ
                  <select
                    name="type"
                    value={newTransactionType}
                    onChange={(event) =>
                      setNewTransactionType(event.target.value as TransactionType)
                    }
                  >
                    <option value="expense">รายจ่าย</option>
                    <option value="income">รายรับ</option>
                  </select>
                </label>
                <label>
                  ชื่อรายการ
                  <input
                    name="title"
                    placeholder="เช่น ค่าอาหารกลางวัน"
                    required
                    autoFocus
                  />
                </label>
                <div className="form-row">
                  <label>
                    จำนวนเงิน
                    <input
                      name="amount"
                      type="number"
                      min="0.01"
                      step="0.01"
                      placeholder="0.00"
                      required
                    />
                  </label>
                  <label>
                    หมวดหมู่
                    <select name="category" required>
                      {categories
                        .filter((item) => item.type === newTransactionType)
                        .map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                    </select>
                  </label>
                </div>
                <label>
                  วันที่
                  <input
                    name="date"
                    type="date"
                    defaultValue={today.toISOString().slice(0, 10)}
                    required
                  />
                </label>
                <div className="modal-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setModal(null)}
                  >
                    ยกเลิก
                  </button>
                  <button className="primary-button" type="submit">
                    <Check size={16} />
                    บันทึกรายการ
                  </button>
                </div>
              </form>
            )}
            {modal === "category" && (
              <form className="form-grid" onSubmit={addCategory}>
                <label>
                  ชื่อหมวดหมู่
                  <input
                    name="name"
                    placeholder="เช่น สุขภาพ"
                    required
                    autoFocus
                  />
                </label>
                <label>
                  ประเภท
                  <select name="type">
                    <option value="expense">รายจ่าย</option>
                    <option value="income">รายรับ</option>
                  </select>
                </label>
                <div className="modal-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setModal(null)}
                  >
                    ยกเลิก
                  </button>
                  <button className="primary-button" type="submit">
                    <Plus size={16} />
                    เพิ่มหมวดหมู่
                  </button>
                </div>
              </form>
            )}
            {modal === "login" && (
              <form className="form-grid" onSubmit={sendMagicLink}>
                <p className="modal-description">
                  เราจะส่งลิงก์เข้าสู่ระบบแบบใช้ครั้งเดียวไปยังอีเมลของคุณ
                  ไม่ต้องจำรหัสผ่าน
                </p>
                <label>
                  อีเมล
                  <input
                    name="email"
                    type="email"
                    value={authEmail}
                    onChange={(event) => setAuthEmail(event.target.value)}
                    placeholder="you@example.com"
                    required
                    autoFocus
                  />
                </label>
                <div className="modal-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setModal(null)}
                  >
                    ยกเลิก
                  </button>
                  <button className="primary-button" type="submit">
                    ส่งลิงก์เข้าสู่ระบบ
                  </button>
                </div>
              </form>
            )}
            {modal === "invite" && (
              <form className="form-grid" onSubmit={inviteMember}>
                <p className="modal-description">
                  ผู้ที่ได้รับเชิญจะเข้าถึงรายการและหมวดหมู่ของ workspace นี้ได้
                  หลังลงทะเบียนด้วยอีเมลเดียวกัน
                </p>
                <label>
                  อีเมลผู้ร่วมใช้งาน
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(event) => setInviteEmail(event.target.value)}
                    placeholder="family@example.com"
                    required
                    autoFocus
                  />
                </label>
                <div className="modal-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setModal(null)}
                  >
                    ยกเลิก
                  </button>
                  <button className="primary-button" type="submit">
                    <Users size={16} />
                    ส่งคำเชิญ
                  </button>
                </div>
              </form>
            )}
          </section>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          {toast}
        </div>
      )}
    </div>
  );
}

function TransactionTable({
  transactions,
  categories,
  onDelete,
}: {
  transactions: Transaction[];
  categories: Category[];
  onDelete: (transaction: Transaction) => void;
}) {
  if (!transactions.length)
    return (
      <div className="empty-state">
        <span className="empty-icon">
          <Wallet size={22} />
        </span>
        <strong>ยังไม่มีรายการในช่วงนี้</strong>
        <span>ลองเปลี่ยนช่วงเวลาหรือเพิ่มรายการใหม่</span>
      </div>
    );
  return (
    <div className="table-scroll">
      <table className="transaction-table">
        <thead>
          <tr>
            <th>รายการ</th>
            <th>หมวดหมู่</th>
            <th>วันที่</th>
            <th>จำนวนเงิน</th>
            <th aria-label="จัดการ" />
          </tr>
        </thead>
        <tbody>
          {transactions.map((item) => {
            const category = categories.find(
              (candidate) => candidate.id === item.categoryId,
            );
            return (
              <tr key={item.id}>
                <td>
                  <span className={`transaction-icon ${item.type}`}>
                    <span>
                      {item.type === "income" ? (
                        <ArrowDownLeft size={17} />
                      ) : (
                        <ArrowUpRight size={17} />
                      )}
                    </span>
                  </span>
                  <span className="transaction-title">
                    <strong>{item.title}</strong>
                    <small>
                      {item.type === "income" ? "รายรับ" : "รายจ่าย"}
                    </small>
                  </span>
                </td>
                <td>
                  <span className="table-category">
                    <i style={{ backgroundColor: category?.color ?? "#aaa" }} />
                    {category?.name ?? "ไม่ระบุ"}
                  </span>
                </td>
                <td className="date-cell">{dateLabel(item.date)}</td>
                <td className={`amount-cell ${item.type}`}>
                  {item.type === "income" ? "+" : "−"}
                  {currency(item.amount)}
                </td>
                <td>
                  <button
                    className="delete-icon row-delete"
                    aria-label={`ลบรายการ ${item.title}`}
                    title="ลบรายการ"
                    onClick={() => onDelete(item)}
                  >
                    <X size={15} />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
