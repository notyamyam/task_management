import { useState } from "react";
import { ArrowRight, CheckCircle2, LockKeyhole, UserRound } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { ENDPOINTS, instance } from "./api";

const Login = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();

  const handleOnSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const response = await instance.post(ENDPOINTS.LOGIN(), {
        username,
        password,
      });
      localStorage.setItem("token", response.data.token);
      navigate("/tasks");
    } catch {
      setError("We couldn't sign you in. Check your details and try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="relative grid min-h-svh overflow-hidden bg-[#f7f8f3] lg:grid-cols-[1.05fr_0.95fr]">
      <section className="relative hidden overflow-hidden bg-[#102a2b] px-12 py-10 text-white lg:flex lg:flex-col lg:justify-between xl:px-20 xl:py-14">
        <div className="absolute -left-32 top-1/3 h-96 w-96 rounded-full bg-emerald-300/10 blur-3xl" />
        <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full border border-white/10" />
        <div className="absolute -right-8 top-8 h-56 w-56 rounded-full border border-emerald-200/10" />

        <div className="relative flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-[#d5f36b] text-lg font-black text-[#102a2b] shadow-[0_8px_30px_rgba(213,243,107,0.2)]">
            T
          </span>
          <span className="text-sm font-semibold tracking-[0.18em] uppercase">Taskflow</span>
        </div>

        <div className="relative max-w-xl">
          <p className="mb-5 text-xs font-semibold tracking-[0.24em] text-[#d5f36b] uppercase">
            Your work, in focus
          </p>
          <h1 className="text-5xl leading-[1.08] font-semibold tracking-[-0.045em] xl:text-6xl">
            Make room for the work that matters.
          </h1>
          <p className="mt-7 max-w-md text-base leading-7 text-slate-300">
            A calm, focused place to capture your tasks and turn plans into progress.
          </p>
        </div>

        <div className="relative flex items-center gap-3 text-sm text-slate-300">
          <CheckCircle2 aria-hidden="true" className="size-5 text-[#d5f36b]" />
          Simple planning. Clear momentum.
        </div>
      </section>

      <section className="relative flex min-h-svh items-center justify-center px-5 py-10 sm:px-10 lg:px-14">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#d5f36b] via-emerald-400 to-[#102a2b] lg:hidden" />
        <div className="w-full max-w-md">
          <div className="mb-10 flex items-center gap-3 lg:hidden">
            <span className="grid size-10 place-items-center rounded-xl bg-[#102a2b] font-black text-[#d5f36b]">T</span>
            <span className="text-sm font-bold tracking-[0.18em] text-[#102a2b] uppercase">Taskflow</span>
          </div>

          <div className="mb-8">
            <p className="mb-3 text-xs font-bold tracking-[0.2em] text-emerald-700 uppercase">Welcome back</p>
            <h2 className="text-4xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-[2.75rem]">Sign in to continue</h2>
            <p className="mt-3 text-[15px] leading-6 text-slate-500">Your tasks are waiting. Pick up right where you left off.</p>
          </div>

          <form onSubmit={handleOnSubmit} className="space-y-5">
            <div>
              <label htmlFor="username" className="mb-2 block text-sm font-semibold text-slate-700">Username</label>
              <div className="group relative">
                <UserRound aria-hidden="true" className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-emerald-700" />
                <input
                  id="username"
                  name="username"
                  type="text"
                  autoComplete="username"
                  required
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="Enter your username"
                  className="h-14 w-full rounded-xl border border-slate-200 bg-white pr-4 pl-12 text-base text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-emerald-700 focus:ring-4 focus:ring-emerald-700/10"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="mb-2 block text-sm font-semibold text-slate-700">Password</label>
              <div className="group relative">
                <LockKeyhole aria-hidden="true" className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-emerald-700" />
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter your password"
                  className="h-14 w-full rounded-xl border border-slate-200 bg-white pr-4 pl-12 text-base text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-emerald-700 focus:ring-4 focus:ring-emerald-700/10"
                />
              </div>
            </div>

            <div aria-live="polite" className="min-h-6">
              {error ? <p role="alert" className="text-sm font-medium text-red-700">{error}</p> : null}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="group flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#102a2b] px-5 text-sm font-bold text-white shadow-[0_14px_30px_rgba(16,42,43,0.2)] transition hover:-translate-y-0.5 hover:bg-[#183b3c] hover:shadow-[0_18px_34px_rgba(16,42,43,0.25)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-700 disabled:cursor-not-allowed disabled:opacity-65 disabled:hover:translate-y-0"
            >
              {isSubmitting ? "Signing in..." : "Sign in"}
              <ArrowRight aria-hidden="true" className="size-4 transition-transform group-hover:translate-x-1" />
            </button>
          </form>

          <p className="mt-8 text-center text-xs leading-5 text-slate-400">Secure access to your personal task workspace.</p>
        </div>
      </section>
    </main>
  );
};

export default Login;
