import { ShieldAlert } from "lucide-react";
import { Link } from "react-router-dom";

const AdminForbidden = ({ title = "Administration is restricted", message = "Your account does not have permission to view administration tools.", retry }) => (
  <main className="grid min-h-[calc(100svh-3rem)] place-items-center bg-[#f4f6f2] px-5 py-10 text-center text-slate-950">
    <section className="max-w-md">
      <span className="mx-auto grid size-12 place-items-center rounded-xl bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200">
        <ShieldAlert aria-hidden="true" className="size-6" />
      </span>
      <p className="mt-5 text-[11px] font-bold tracking-[0.14em] text-emerald-800 uppercase">Administration</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-[-0.035em]">{title}</h1>
      <p className="mt-2 text-sm leading-6 text-slate-600">{message}</p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Link to="/dashboard" className="inline-flex min-h-11 items-center rounded-lg bg-[#173b35] px-4 text-sm font-bold text-white hover:bg-[#204b43] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-emerald-800">
          Back to dashboard
        </Link>
        {retry ? (
          <button type="button" onClick={retry} className="min-h-11 cursor-pointer rounded-lg border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-emerald-800">
            Try again
          </button>
        ) : null}
      </div>
    </section>
  </main>
);

export default AdminForbidden;
