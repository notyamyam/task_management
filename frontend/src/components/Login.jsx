import { useState } from "react";
import { Check, LockKeyhole, Mail } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { ENDPOINTS, instance } from "./api";
import { GoogleLogin } from "@react-oauth/google";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const navigate = useNavigate();

  const handleOnSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    setIsSubmitting(true);

    try {
      const response = await instance.post(
        isRegistering ? ENDPOINTS.REGISTER() : ENDPOINTS.LOGIN(),
        {
          email,
          password,
        },
      );

      localStorage.setItem("token", response.data.token);
      navigate(response.data.profile_complete ? "/tasks" : "/account", {
        state: { completeProfile: true },
      });
    } catch (requestError) {
      const detail = requestError.response?.data?.detail;
      setError(
        typeof detail === "string"
          ? detail
          : isRegistering
            ? "We couldn't create your account. Please try again."
            : "We couldn't sign you in. Check your details and try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const switchMode = () => {
    setIsRegistering((current) => !current);
    setPassword("");
    setError("");
    setMessage("");
  };

  return (
    <main className="min-h-svh bg-[#f2f4ef] text-slate-950 lg:grid lg:grid-cols-[minmax(300px,0.72fr)_minmax(480px,1.28fr)]">
      <section className="hidden bg-[#173b35] px-10 py-8 text-white lg:flex lg:flex-col lg:justify-between xl:px-14">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-lg bg-[#dce993] text-sm font-black text-[#173b35]">
            C
          </span>
          <span className="text-sm font-bold tracking-[0.16em] uppercase">
            Corner
          </span>
        </div>

        <div className="max-w-lg">
          <p className="mb-3 text-xs font-bold tracking-[0.18em] text-[#dce993] uppercase">
            A clearer workday
          </p>
          <h1 className="text-4xl leading-[1.08] font-semibold tracking-[-0.045em] xl:text-5xl">
            Keep your tasks simple and your focus clear.
          </h1>
          <p className="mt-4 max-w-md text-sm leading-6 text-emerald-50/70">
            Capture what needs doing, stay organized, and move through your day
            with less noise.
          </p>
        </div>

        <p className="flex items-center gap-2 text-sm text-emerald-50/70">
          <Check aria-hidden="true" className="size-4 text-[#dce993]" />
          Your personal task space
        </p>
      </section>

      <section className="flex min-h-svh items-center justify-center px-4 py-5 sm:px-8 lg:px-12">
        <div className="w-full max-w-[400px]">
          <div className="mb-7 flex items-center gap-2.5 lg:hidden">
            <span className="grid size-9 place-items-center rounded-lg bg-[#173b35] text-sm font-black text-[#dce993]">
              C
            </span>
            <span className="text-sm font-bold tracking-[0.16em] text-[#173b35] uppercase">
              Corner
            </span>
          </div>

          <header className="mb-5">
            <p className="mb-1 text-xs font-semibold text-emerald-800">
              {isRegistering ? "Get started" : "Welcome back"}
            </p>
            <h2 className="text-3xl font-semibold tracking-[-0.04em] text-slate-950">
              {isRegistering ? "Create your account" : "Sign in to Corner"}
            </h2>
            <p className="mt-2 text-sm leading-5 text-slate-600">
              {isRegistering
                ? "Use your email and a password to create your workspace."
                : "Enter your details to continue to your tasks."}
            </p>
          </header>

          <GoogleLogin
            onSuccess={async ({ credential }) => {
              if (!credential) {
                setError("Google did not return a credential.");
                return;
              }

              setError("");

              try {
                const response = await instance.post(ENDPOINTS.GOOGLE_LOGIN(), {
                  credential,
                });

                localStorage.setItem("token", response.data.token);
                navigate(response.data.profile_complete ? "/tasks" : "/account", {
                  state: { completeProfile: true },
                });
              } catch (error) {
                setError(
                  error.response?.data?.detail ??
                    "We couldn't sign you in with Google.",
                );
              }
            }}
            onError={() => {
              setError("Google sign-in was cancelled or failed.");
            }}
          />

          <div className="my-4 flex items-center gap-3" aria-hidden="true">
            <span className="h-px flex-1 bg-slate-300" />
            <span className="text-xs font-medium tracking-wide text-slate-500 uppercase">
              or use your details
            </span>
            <span className="h-px flex-1 bg-slate-300" />
          </div>

          <form onSubmit={handleOnSubmit} className="space-y-3.5">
            <div>
              <label
                htmlFor="email"
                className="mb-1.5 block text-sm font-semibold text-slate-800"
              >
                Email address
              </label>
              <div className="relative">
                <Mail
                  aria-hidden="true"
                  className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-slate-400"
                />
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  className="h-11 w-full rounded-lg border border-slate-300 bg-white pr-4 pl-11 text-sm text-slate-950 shadow-sm outline-none placeholder:text-slate-400 focus:border-emerald-800 focus:ring-3 focus:ring-emerald-800/15"
                />
              </div>
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between gap-3">
                <label
                  htmlFor="password"
                  className="block text-sm font-semibold text-slate-800"
                >
                  Password
                </label>
                {!isRegistering ? (
                  <Link
                    to="/forgot-password"
                    className="text-xs font-bold text-emerald-800 underline decoration-emerald-800/30 underline-offset-4 hover:text-emerald-950 focus-visible:rounded-sm focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-emerald-800"
                  >
                    Forgot password?
                  </Link>
                ) : null}
              </div>
              <div className="relative">
                <LockKeyhole
                  aria-hidden="true"
                  className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-slate-400"
                />
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete={
                    isRegistering ? "new-password" : "current-password"
                  }
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={
                    isRegistering ? "Create a password" : "Enter your password"
                  }
                  className="h-11 w-full rounded-lg border border-slate-300 bg-white pr-4 pl-11 text-sm text-slate-950 shadow-sm outline-none placeholder:text-slate-400 focus:border-emerald-800 focus:ring-3 focus:ring-emerald-800/15"
                />
              </div>
            </div>

            <div aria-live="polite" className="min-h-5">
              {error ? (
                <p role="alert" className="text-sm font-medium text-red-700">
                  {error}
                </p>
              ) : null}
              {message ? (
                <p className="text-sm font-medium text-emerald-800">
                  {message}
                </p>
              ) : null}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="flex h-11 w-full cursor-pointer items-center justify-center rounded-lg bg-[#173b35] px-5 text-sm font-bold text-white shadow-sm hover:bg-[#204b43] focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting
                ? isRegistering
                  ? "Creating account..."
                  : "Signing in..."
                : isRegistering
                  ? "Create account"
                  : "Sign in"}
            </button>
          </form>

          <p className="mt-4 text-center text-sm text-slate-600">
            {isRegistering ? "Already have an account?" : "New to Corner?"}{" "}
            <button
              type="button"
              onClick={switchMode}
              className="min-h-11 cursor-pointer font-bold text-emerald-800 underline decoration-emerald-800/30 underline-offset-4 hover:text-emerald-950 focus-visible:rounded-sm focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-emerald-800"
            >
              {isRegistering ? "Sign in" : "Create an account"}
            </button>
          </p>
        </div>
      </section>
    </main>
  );
};

export default Login;
