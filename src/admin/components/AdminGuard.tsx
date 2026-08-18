import React from "react";
import { Navigate } from "react-router-dom";
import { useAdminAuthStore } from "../../store/useAdminAuthStore";

export default function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user, adminProfile, loading, isDenied, isUnverified } = useAdminAuthStore();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#090D14] text-white">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-blue-500/20 border-t-blue-500" />
          <p className="text-[13px] text-slate-400 font-medium">Verifying administrator identity...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (isUnverified) {
    return <Navigate to="/verify-email" replace />;
  }

  if (isDenied || !adminProfile) {
    return <Navigate to="/access-denied" replace />;
  }

  return <>{children}</>;
}
