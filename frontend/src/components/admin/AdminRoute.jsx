import { LoaderCircle } from "lucide-react";
import { Outlet, useOutletContext } from "react-router-dom";

import { hasAnyAdminPermission } from "./adminPermissions";
import AdminForbidden from "./AdminForbidden";

const AdminRoute = () => {
  const context = useOutletContext();
  const {
    adminError,
    adminPermissions,
    isAdminLoading,
    loadAdminCapabilities,
  } = context;

  if (isAdminLoading) {
    return (
      <main className="grid min-h-[calc(100svh-3rem)] place-items-center bg-[#f4f6f2] px-5 text-sm text-slate-600" role="status">
        <span className="flex items-center gap-2"><LoaderCircle aria-hidden="true" className="size-5 animate-spin text-emerald-800" />Checking administration access...</span>
      </main>
    );
  }

  if (adminError) {
    return (
      <AdminForbidden
        title="Administration is unavailable"
        message={adminError}
        retry={loadAdminCapabilities}
      />
    );
  }

  if (!hasAnyAdminPermission(adminPermissions)) {
    return <AdminForbidden />;
  }

  return <Outlet context={context} />;
};

export default AdminRoute;
