import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  KeyRound,
  LockKeyhole,
  Mail,
  ShieldCheck,
} from "lucide-react";
import { Link } from "react-router-dom";
import { ENDPOINTS, instance } from "./api";

const getErrorMessage = (error, fallback) => {
  const detail = error.response?.data?.detail;
  if (typeof detail === "string") return detail;

  if (Array.isArray(detail) && detail[0]?.msg) {
    return detail[0].msg.replace(/^Value error, /, "");
  }

  return fallback;
};

const ForgotPassword = () => {
  const [step, setStep] = useState("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResendCoolingDown, setIsResendCoolingDown] = useState(false);

  useEffect(() => {
    if (!isResendCoolingDown) return undefined;

    const timeout = window.setTimeout(() => setIsResendCoolingDown(false), 60_000);
    return () => window.clearTimeout(timeout);
  }, [isResendCoolingDown]);

  const requestOtp = async (event) => {
    event?.preventDefault();
    setError("");
    setMessage("");
    setIsSubmitting(true);

    try {
      const response = await instance.post(ENDPOINTS.REQUEST_PASSWORD_RESET(), {
        email,
      });
      setStep("reset");
      setIsResendCoolingDown(true);
      setMessage(response.data.message);
    } catch (requestError) {
      setError(
        getErrorMessage(
          requestError,
          "We couldn't send a reset code. Please try again.",
        ),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetPassword = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await instance.post(ENDPOINTS.CONFIRM_PASSWORD_RESET(), {
        email,
        otp,
        new_password: newPassword,
      });
      setStep("complete");
      setMessage(response.data.message);
    } catch (requestError) {
      setError(
        getErrorMessage(
          requestError,
          "We couldn't reset your password. Please try again.",
        ),
      );
    } finally {
      setIsSubmitting(false);
    }
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
            Secure account recovery
          </p>
          <h1 className="text-4xl leading-[1.08] font-semibold tracking-[-0.045em] xl:text-5xl">
            Get back to your work without losing your place.
          </h1>
          <p className="mt-4 max-w-md text-sm leading-6 text-emerald-50/70">
            We use a one-time code to make sure only you can reset your
            password.
          </p>
        </div>

        <p className="flex items-center gap-2 text-sm text-emerald-50/70">
          <Check aria-hidden="true" className="size-4 text-[#dce993]" />
          Codes expire after 10 minutes
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

          {step === "complete" ? (
            <div>
              <span className="mb-5 grid size-12 place-items-center rounded-xl bg-emerald-100 text-emerald-800">
                <CheckCircle2 aria-hidden="true" className="size-6" />
              </span>
              <h2 className="text-3xl font-semibold tracking-[-0.04em]">
                Password updated
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {message}
              </p>
              <Link
                to="/"
                className="mt-6 flex h-11 w-full items-center justify-center rounded-lg bg-[#173b35] px-5 text-sm font-bold text-white shadow-sm hover:bg-[#204b43] focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-emerald-800"
              >
                Return to sign in
              </Link>
            </div>
          ) : (
            <>
              <Link
                to="/"
                className="mb-5 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-emerald-800 hover:text-emerald-950 focus-visible:rounded-sm focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-emerald-800"
              >
                <ArrowLeft aria-hidden="true" className="size-4" />
                Back to sign in
              </Link>

              <header className="mb-5">
                <p className="mb-1 text-xs font-semibold text-emerald-800">
                  {step === "email" ? "Account recovery" : "Check your inbox"}
                </p>
                <h2 className="text-3xl font-semibold tracking-[-0.04em]">
                  {step === "email" ? "Forgot your password?" : "Enter your reset code"}
                </h2>
                <p className="mt-2 text-sm leading-5 text-slate-600">
                  {step === "email"
                    ? "Enter your account email and we'll send you a six-digit code."
                    : `Use the code sent for ${email}. It expires in 10 minutes.`}
                </p>
              </header>

              <form
                onSubmit={step === "email" ? requestOtp : resetPassword}
                className="space-y-3.5"
              >
                {step === "email" ? (
                  <div>
                    <label htmlFor="reset-email" className="mb-1.5 block text-sm font-semibold text-slate-800">
                      Email address
                    </label>
                    <div className="relative">
                      <Mail aria-hidden="true" className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-slate-400" />
                      <input
                        id="reset-email"
                        type="email"
                        autoComplete="email"
                        required
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        placeholder="you@example.com"
                        className="h-11 w-full rounded-lg border border-slate-300 bg-white pr-4 pl-11 text-sm shadow-sm outline-none placeholder:text-slate-400 focus:border-emerald-800 focus:ring-3 focus:ring-emerald-800/15"
                      />
                    </div>
                  </div>
                ) : (
                  <>
                    <div>
                      <label htmlFor="otp" className="mb-1.5 block text-sm font-semibold text-slate-800">
                        Six-digit OTP
                      </label>
                      <div className="relative">
                        <KeyRound aria-hidden="true" className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-slate-400" />
                        <input
                          id="otp"
                          type="text"
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          pattern="[0-9]{6}"
                          maxLength={6}
                          required
                          value={otp}
                          onChange={(event) => setOtp(event.target.value.replace(/\D/g, ""))}
                          placeholder="000000"
                          className="h-11 w-full rounded-lg border border-slate-300 bg-white pr-4 pl-11 font-mono text-base tracking-[0.25em] shadow-sm outline-none placeholder:tracking-[0.25em] placeholder:text-slate-400 focus:border-emerald-800 focus:ring-3 focus:ring-emerald-800/15"
                        />
                      </div>
                    </div>

                    <div>
                      <label htmlFor="new-password" className="mb-1.5 block text-sm font-semibold text-slate-800">
                        New password
                      </label>
                      <div className="relative">
                        <LockKeyhole aria-hidden="true" className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-slate-400" />
                        <input
                          id="new-password"
                          type="password"
                          autoComplete="new-password"
                          minLength={8}
                          maxLength={128}
                          required
                          value={newPassword}
                          onChange={(event) => setNewPassword(event.target.value)}
                          placeholder="At least 8 characters"
                          className="h-11 w-full rounded-lg border border-slate-300 bg-white pr-4 pl-11 text-sm shadow-sm outline-none placeholder:text-slate-400 focus:border-emerald-800 focus:ring-3 focus:ring-emerald-800/15"
                        />
                      </div>
                    </div>

                    <div>
                      <label htmlFor="confirm-password" className="mb-1.5 block text-sm font-semibold text-slate-800">
                        Confirm new password
                      </label>
                      <div className="relative">
                        <ShieldCheck aria-hidden="true" className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-slate-400" />
                        <input
                          id="confirm-password"
                          type="password"
                          autoComplete="new-password"
                          minLength={8}
                          maxLength={128}
                          required
                          value={confirmPassword}
                          onChange={(event) => setConfirmPassword(event.target.value)}
                          placeholder="Repeat your new password"
                          className="h-11 w-full rounded-lg border border-slate-300 bg-white pr-4 pl-11 text-sm shadow-sm outline-none placeholder:text-slate-400 focus:border-emerald-800 focus:ring-3 focus:ring-emerald-800/15"
                        />
                      </div>
                    </div>
                  </>
                )}

                <div aria-live="polite" className="min-h-5">
                  {error ? <p role="alert" className="text-sm font-medium text-red-700">{error}</p> : null}
                  {message ? <p className="text-sm font-medium text-emerald-800">{message}</p> : null}
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex h-11 w-full cursor-pointer items-center justify-center rounded-lg bg-[#173b35] px-5 text-sm font-bold text-white shadow-sm hover:bg-[#204b43] focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSubmitting
                    ? step === "email" ? "Sending code..." : "Resetting password..."
                    : step === "email" ? "Send reset code" : "Reset password"}
                </button>

                {step === "reset" ? (
                  <button
                    type="button"
                    disabled={isSubmitting || isResendCoolingDown}
                    onClick={requestOtp}
                    className="flex min-h-11 w-full cursor-pointer items-center justify-center text-sm font-bold text-emerald-800 underline decoration-emerald-800/30 underline-offset-4 hover:text-emerald-950 focus-visible:rounded-sm focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isResendCoolingDown
                      ? "Another code can be sent shortly"
                      : "Send another code"}
                  </button>
                ) : null}
              </form>
            </>
          )}
        </div>
      </section>
    </main>
  );
};

export default ForgotPassword;
