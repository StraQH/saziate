"use client";
import { useEffect, useState } from "react";
import { useSession } from "@/components/providers/SessionProvider";
import { SaziateRepository } from "@/lib/repository";
import { MOCK_ORG_ID } from "@/lib/mockdata";
import { config } from "@/lib/config";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area
} from "recharts";
import { 
  TrendingUp, Activity, CreditCard, Wallet, Users, MapPin, AlertCircle, Calendar
} from "lucide-react";

// The mock chart data can be static for now or fetched.
const revenueData = [
  { month: "Jan", revenue: 450000 },
  { month: "Feb", revenue: 520000 },
  { month: "Mar", revenue: 610000 },
  { month: "Apr", revenue: 580000 },
  { month: "May", revenue: 750000 },
  { month: "Jun", revenue: 920000 },
  { month: "Jul", revenue: 1240000 },
];

const serviceData = [
  { day: "Mon", services: 120 },
  { day: "Tue", services: 150 },
  { day: "Wed", services: 90 },
  { day: "Thu", services: 170 },
  { day: "Fri", services: 200 },
  { day: "Sat", services: 210 },
  { day: "Sun", services: 50 },
];

export default function OrgDashboardPage() {
  const { user } = useSession();
  const [metrics, setMetrics] = useState<{ label: string; value: string }[]>([]);
  const [revenueTrend, setRevenueTrend] = useState<any[]>(revenueData);
  const [weeklyServices, setWeeklyServices] = useState<any[]>(serviceData);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    
    if (config.isMockMode) {
      setMetrics([
        { label: "Total Revenue Recovered", value: "₦1,240,000" },
        { label: "Accelerated Payouts",          value: "₦145,000" },
        { label: "Ready to Disburse",   value: "₦380,000" },
        { label: "Next Automated Payout",   value: new Date(Date.now() + 86400000).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) },
        { label: "Active Customer Base", value: "1,240" },
        { label: "Service Completed",          value: "245" },
        { label: "Pending Revenue",        value: "42" },
        { label: "Serviced Zones",          value: "14" },
      ]);
      setRevenueTrend(revenueData);
      setWeeklyServices(serviceData);
      setLoading(false);
      return;
    }

    setLoading(true);
    fetch("/api/v1/org/metrics")
      .then((res) => res.json() as any)
      .then((data: any) => {
        setMetrics(data.metrics || []);
        if (data.revenueTrend) setRevenueTrend(data.revenueTrend);
        if (data.weeklyServices) setWeeklyServices(data.weeklyServices);
      })
      .catch((err) => console.error("Failed to load metrics:", err))
      .finally(() => setLoading(false));
  }, [user]);

  // Map icons based on labels roughly
  const getIconForLabel = (label: string) => {
    if (label.includes("Revenue Recovered")) return <Wallet size={24} style={{ color: "var(--color-primary)" }} />;
    if (label.includes("Service Completed")) return <CreditCard size={24} style={{ color: "var(--color-primary)" }} />;
    if (label.includes("Accelerated Payouts")) return <TrendingUp size={24} style={{ color: "var(--color-primary)" }} />;
    if (label.includes("Ready to Disburse")) return <Activity size={24} style={{ color: "var(--color-primary)" }} />;
    if (label.includes("Next Automated Payout")) return <Calendar size={24} style={{ color: "var(--color-primary)" }} />;
    if (label.includes("Customer Base")) return <Users size={24} style={{ color: "var(--color-primary)" }} />;
    if (label.includes("Pending Revenue")) return <AlertCircle size={24} style={{ color: "var(--color-primary)" }} />;
    if (label.includes("Serviced Zones")) return <MapPin size={24} style={{ color: "var(--color-primary)" }} />;
    return <Activity size={24} style={{ color: "var(--color-primary)" }} />;
  };

  return (
    <div style={{ padding: "1.5rem" }}>

      <div style={{ display: "flex", flexDirection: "column", marginBottom: "2rem", gap: "1rem" }}>
        <div>
          <h1 style={{ fontSize: "1.875rem", fontWeight: 700, color: "var(--color-text)", margin: 0 }}>Dashboard</h1>
          <p style={{ color: "var(--color-text-muted)", marginTop: "0.25rem", margin: 0 }}>Welcome back! Let's accelerate your growth today. Here's a snapshot of your operational performance.</p>
        </div>
      </div>

      {loading ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "400px" }}>
          <div className="spinner" style={{ width: "3rem", height: "3rem" }} />
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "1.5rem", marginBottom: "2rem" }}>
            {metrics.map((m, i) => (
              <div 
                key={m.label} 
                className="card"
                style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "1.5rem", borderRadius: "var(--radius-lg)" }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
                  <span style={{ color: "var(--color-text-muted)", fontWeight: 500, fontSize: "0.875rem" }}>{m.label}</span>
                  <div style={{ background: "var(--color-primary-light)", padding: "0.5rem", borderRadius: "var(--radius-md)" }}>
                    {getIconForLabel(m.label)}
                  </div>
                </div>
                <h3 style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--color-text)", margin: 0 }}>{m.value}</h3>
              </div>
            ))}
          </div>

          {/* Charts Section */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "1.5rem" }}>
            
            {/* Revenue Trend Area Chart */}
            <div className="card" style={{ padding: "1.5rem", borderRadius: "var(--radius-lg)" }}>
              <div style={{ marginBottom: "1.5rem" }}>
                <h3 style={{ fontSize: "1.125rem", fontWeight: 600, color: "var(--color-text)", margin: 0 }}>Revenue Growth Trends</h3>
                <p style={{ fontSize: "0.875rem", color: "var(--color-text-muted)", margin: 0, marginTop: "0.25rem" }}>Monthly revenue trends for the current year</p>
              </div>
              <div style={{ height: "300px", width: "100%" }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={revenueTrend} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                    <XAxis 
                      dataKey="month" 
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#6B7280', fontSize: 12 }}
                      dy={10}
                    />
                    <YAxis 
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#6B7280', fontSize: 12 }}
                      tickFormatter={(val) => `\${config.locality.symbol}${val / 1000}k`}
                      width={50}
                    />
                    <Tooltip 
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                      formatter={(value) => [`\${config.locality.symbol}${Number(value).toLocaleString()}`, 'Revenue']}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="revenue" 
                      stroke="var(--color-primary)" 
                      strokeWidth={3}
                      fillOpacity={1} 
                      fill="url(#colorRevenue)" 
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Services Bar Chart */}
            <div className="card" style={{ padding: "1.5rem", borderRadius: "var(--radius-lg)" }}>
              <div style={{ marginBottom: "1.5rem" }}>
                <h3 style={{ fontSize: "1.125rem", fontWeight: 600, color: "var(--color-text)", margin: 0 }}>Weekly Services</h3>
                <p style={{ fontSize: "0.875rem", color: "var(--color-text-muted)", margin: 0, marginTop: "0.25rem" }}>Successful operations this week</p>
              </div>
              <div style={{ height: "300px", width: "100%" }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={weeklyServices} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                    <XAxis 
                      dataKey="day" 
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#6B7280', fontSize: 12 }}
                      dy={10}
                    />
                    <YAxis 
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#6B7280', fontSize: 12 }}
                      width={40}
                    />
                    <Tooltip 
                      cursor={{ fill: 'transparent' }}
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    />
                    <Bar 
                      dataKey="services" 
                      fill="var(--color-primary)" 
                      radius={[4, 4, 0, 0]} 
                      barSize={20}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

          </div>
        </>
      )}
    </div>
  );
}
