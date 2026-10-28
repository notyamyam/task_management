import { useState } from "react";
import { Check, KeyRound, LoaderCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { ENDPOINTS, instance } from "./api";

const getErrorMessage = (error) => {
  const detail = error.response?.data?.detail;
  return typeof detail === "string"
    ? detail
    : "We couldn't update your password. Please try again.";
};

const TemporaryPasswordChange = () => {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (isSubmitting) return;
    setError("");

    if (newPassword.length < 8 || newPassword.length > 128) {
      setError("Your new password must be between 8 and 128 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Your passwords do not match.");
      return;
    }

    setIsSubmitting(true);

    try {
      await instance.put(ENDPOINTS.UPDATE_TEMPORARY_PASSWORD(), {
        new_password: newPassword,
      });
      localStorage.removeItem("token");
      navigate("/", {
        replace: true,
        state: { message: "Password changed. Sign in with your new password." },
      });
    } catch (requestError) {
      setError(getErrorMessage(requestError));
      setIsSubmitting(false);
    }
  };

  return (
    <main className="grid min-h-svh place-items-center bg-[#f2f4ef] px-4 py-8 text-slate-950 sm:px-6">
      <section className="w-full max-w-[440px] bg-white p-6 shadow-[0_12px_35px_rgba(15,23,42,0.08)] ring-1 ring-slate-200 sm:p-8" aria-labelledby="temporary-password-heading">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-lg bg-[#173b35] text-[#dce993]">
            <KeyRound aria-hidden="true" className="size-5" />
          </span>
          <div>
            <p className="text-[10px] font-bold tracking-[0.16em] text-emerald-800 uppercase">Account security</p>
            <h1 id="temporary-password-heading" className="text-xl font-semibold tracking-[-0.03em]">Choose a new password</h1>
          </div>
        </div>

        <p className="mt-5 text-sm leading-6 text-slate-600">
          Your administrator gave you a temporary password. Set a new one before continuing to Corner.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="temporary-new-password" className="mb-1.5 block text-sm font-semibold text-slate-800">New password</label>
            <input
              id="temporary-new-password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              required
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-emerald-800 focus:ring-3 focus:ring-emerald-800/15"
            />
            <p className="mt-1.5 text-xs text-slate-500">Use 8 to 128 characters.</p>
          </div>

          <div>
            <label htmlFor="temporary-confirm-password" className="mb-1.5 block text-sm font-semibold text-slate-800">Confirm new password</label>
            <input
              id="temporary-confirm-password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              required
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-emerald-800 focus:ring-3 focus:ring-emerald-800/15"
            />
          </div>

          <div aria-live="polite" className="min-h-5">
            {error ? <p role="alert" className="text-sm font-medium text-red-700">{error}</p> : null}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-[#173b35] px-5 text-sm font-bold text-white shadow-sm hover:bg-[#204b43] focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <Check aria-hidden="true" className="size-4" />}
            {isSubmitting ? "Updating password..." : "Set new password"}
          </button>
        </form>
      </section>
    </main>
  );
};

export default TemporaryPasswordChange;
