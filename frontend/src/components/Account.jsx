import { useEffect, useState } from "react";
import { Eye, EyeOff, KeyRound, LoaderCircle, LockKeyhole, UserRound } from "lucide-react";
import { toast } from "react-toastify";

import { ENDPOINTS, instance } from "./api";

const getErrorMessage = (error, fallback) => {
  const detail = error.response?.data?.detail;
  return typeof detail === "string" ? detail : fallback;
};

const Account = () => {
  const [username, setUsername] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const loadProfile = async () => {
    setIsLoading(true);
    setLoadError("");
    try {
      const response = await instance.get(ENDPOINTS.GET_PROFILE());
      setUsername(response.data.username);
    } catch (error) {
      setLoadError(getErrorMessage(error, "We couldn't load your account."));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let isCurrent = true;

    instance
      .get(ENDPOINTS.GET_PROFILE())
      .then((response) => {
        if (isCurrent) setUsername(response.data.username);
      })
      .catch((error) => {
        if (isCurrent) setLoadError(getErrorMessage(error, "We couldn't load your account."));
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  const resetPasswordForm = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setShowPasswords(false);
    setIsEditing(false);
  };

  const updatePassword = async (event) => {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match.");
      return;
    }

    setIsSaving(true);
    try {
      await instance.put(ENDPOINTS.UPDATE_PASSWORD(), {
        current_password: currentPassword,
        new_password: newPassword,
      });
      resetPasswordForm();
      toast.success("Password updated successfully.");
    } catch (error) {
      toast.error(getErrorMessage(error, "Couldn't update your password."));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <main className="min-w-0 flex-1 bg-[#f4f6f2] px-4 py-8 text-slate-950 sm:px-6 sm:py-12 lg:px-10">
      <div className="mx-auto max-w-4xl">
        <header className="border-b border-slate-300 pb-7">
          <p className="mb-2 text-xs font-bold tracking-[0.14em] text-emerald-800 uppercase">Settings</p>
          <h1 className="text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">Your account</h1>
          <p className="mt-2 text-sm text-slate-600">Review your sign-in details and keep your password secure.</p>
        </header>

        {isLoading ? (
          <div className="flex min-h-64 items-center justify-center gap-3 text-sm text-slate-600" role="status">
            <LoaderCircle aria-hidden="true" className="size-5 animate-spin text-emerald-800" />
            Loading account...
          </div>
        ) : loadError ? (
          <div className="flex min-h-64 flex-col items-center justify-center text-center">
            <p className="font-semibold">{loadError}</p>
            <button type="button" onClick={loadProfile} className="mt-4 min-h-11 rounded-lg border border-slate-300 bg-white px-4 text-sm font-bold hover:bg-slate-50 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-emerald-800">
              Try again
            </button>
          </div>
        ) : (
          <section aria-labelledby="account-details-heading" className="mt-8 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.08)] ring-1 ring-slate-200">
            <div className="border-b border-slate-200 px-5 py-5 sm:px-7">
              <h2 id="account-details-heading" className="flex items-center gap-2 font-semibold">
                <UserRound aria-hidden="true" className="size-5 text-emerald-800" />
                Account details
              </h2>
            </div>

            <div className="divide-y divide-slate-200 px-5 sm:px-7">
              <div className="grid gap-3 py-6 sm:grid-cols-[180px_1fr] sm:items-center">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Username</p>
                  <p className="mt-1 text-xs text-slate-500">Your username cannot be changed.</p>
                </div>
                <div className="relative">
                  <UserRound aria-hidden="true" className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-slate-400" />
                  <input type="text" value={username} readOnly aria-label="Username" className="h-12 w-full rounded-lg border border-slate-200 bg-slate-50 pr-4 pl-12 text-slate-600 outline-none" />
                </div>
              </div>

              <div className="py-6">
                <div className="grid gap-4 sm:grid-cols-[180px_1fr] sm:items-center">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Password</p>
                    <p className="mt-1 text-xs text-slate-500">Hidden for your security.</p>
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <div className="relative min-w-0 flex-1">
                      <LockKeyhole aria-hidden="true" className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-slate-400" />
                      <input type="password" value="password-hidden" readOnly aria-label="Password is hidden" className="h-12 w-full rounded-lg border border-slate-200 bg-slate-50 pr-4 pl-12 text-slate-600 outline-none" />
                    </div>
                    {!isEditing ? (
                      <button type="button" onClick={() => setIsEditing(true)} className="min-h-12 rounded-lg bg-[#173b35] px-5 text-sm font-bold text-white hover:bg-[#204b43] focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-emerald-800">
                        Edit password
                      </button>
                    ) : null}
                  </div>
                </div>

                {isEditing ? (
                  <form onSubmit={updatePassword} className="mt-6 border-t border-slate-200 pt-6 sm:ml-[180px]">
                    <div className="mb-5 flex items-center justify-between gap-4">
                      <h3 className="flex items-center gap-2 font-semibold"><KeyRound aria-hidden="true" className="size-5 text-emerald-800" />Change password</h3>
                      <button type="button" onClick={() => setShowPasswords((current) => !current)} className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-slate-600 hover:bg-slate-100 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-emerald-800">
                        {showPasswords ? <EyeOff aria-hidden="true" className="size-4" /> : <Eye aria-hidden="true" className="size-4" />}
                        {showPasswords ? "Hide" : "Show"}
                      </button>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <label htmlFor="current-password" className="mb-2 block text-sm font-semibold text-slate-800">Current password</label>
                        <input id="current-password" type={showPasswords ? "text" : "password"} autoComplete="current-password" required value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} className="h-12 w-full rounded-lg border border-slate-300 bg-white px-4 outline-none focus:border-emerald-800 focus:ring-3 focus:ring-emerald-800/15" />
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <label htmlFor="new-password" className="mb-2 block text-sm font-semibold text-slate-800">New password</label>
                          <input id="new-password" type={showPasswords ? "text" : "password"} autoComplete="new-password" required minLength={8} maxLength={128} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className="h-12 w-full rounded-lg border border-slate-300 bg-white px-4 outline-none focus:border-emerald-800 focus:ring-3 focus:ring-emerald-800/15" />
                        </div>
                        <div>
                          <label htmlFor="confirm-password" className="mb-2 block text-sm font-semibold text-slate-800">Confirm new password</label>
                          <input id="confirm-password" type={showPasswords ? "text" : "password"} autoComplete="new-password" required minLength={8} maxLength={128} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="h-12 w-full rounded-lg border border-slate-300 bg-white px-4 outline-none focus:border-emerald-800 focus:ring-3 focus:ring-emerald-800/15" />
                        </div>
                      </div>
                    </div>

                    <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                      <button type="button" onClick={resetPasswordForm} disabled={isSaving} className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-emerald-800 disabled:opacity-50">Cancel</button>
                      <button type="submit" disabled={isSaving} className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#173b35] px-5 text-sm font-bold text-white hover:bg-[#204b43] focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-emerald-800 disabled:cursor-not-allowed disabled:opacity-60">
                        {isSaving ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : null}
                        {isSaving ? "Saving..." : "Save password"}
                      </button>
                    </div>
                  </form>
                ) : null}
              </div>
            </div>
          </section>
        )}
      </div>
    </main>
  );
};

export default Account;
