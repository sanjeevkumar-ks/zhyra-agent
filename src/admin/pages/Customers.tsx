import React, { useEffect, useState } from "react";
import { apiClient } from "../../lib/apiClient";
import { useNavigate } from "react-router-dom";
import { Users, Search, ChevronRight, Building2, CreditCard } from "lucide-react";

interface CustomerItem {
  id: string;
  email: string;
  name: string;
  workspace_id: string;
  workspace_name: string;
  plan: string;
  status: string;
  created_at: number;
  last_active: number;
}

export default function Customers() {
  const [customers, setCustomers] = useState<CustomerItem[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchCustomers = async () => {
      setLoading(true);
      try {
        const data = await apiClient.get<any>("/api/admin/customers");
        if (data?.customers) {
          setCustomers(data.customers);
        }
      } catch (e) {
        console.error("Failed to load customers:", e);
      } finally {
        setLoading(false);
      }
    };
    fetchCustomers();
  }, []);

  const filtered = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.email.toLowerCase().includes(search.toLowerCase()) ||
      c.workspace_name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Customers</h1>
          <p className="text-[13.5px] text-slate-400">
            Accounts and customer organizations using Zhyra AI.
          </p>
        </div>

        <div className="relative w-72">
          <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search customers or email..."
            className="w-full rounded-xl border border-slate-800 bg-slate-900/60 pl-10 pr-4 py-2 text-[13px] text-white focus:border-blue-500 focus:outline-none"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-[#0B0F17] shadow-soft">
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="border-b border-slate-800/80 bg-slate-900/60 text-[11.5px] font-semibold uppercase tracking-wider text-slate-400">
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Workspace</th>
              <th className="px-4 py-3">Plan</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Last Active</th>
              <th className="px-4 py-3 text-right">Detail</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {loading ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-500">
                  Loading platform customers...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-500">
                  {search ? "No customers match your search criteria." : "No customers registered yet."}
                </td>
              </tr>
            ) : (
              filtered.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => navigate(`/customers/${c.id}`)}
                  className="hover:bg-slate-900/50 transition-colors cursor-pointer"
                >
                  <td className="px-4 py-3 font-semibold text-white">{c.name || "Customer"}</td>
                  <td className="px-4 py-3 text-slate-400">{c.email}</td>
                  <td className="px-4 py-3 text-slate-300 flex items-center gap-1.5">
                    <Building2 className="h-3.5 w-3.5 text-slate-500" />
                    {c.workspace_name}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 rounded-md bg-blue-500/10 px-2 py-0.5 text-[11px] font-semibold text-blue-400">
                      <CreditCard className="h-3 w-3" />
                      {c.plan}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-md px-2 py-0.5 text-[11px] font-semibold capitalize ${
                        c.status === "active"
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                      }`}
                    >
                      {c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-[12px]">
                    {c.last_active ? new Date(c.last_active * 1000).toLocaleDateString() : "--"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <ChevronRight className="inline-block h-4 w-4 text-slate-500" />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
