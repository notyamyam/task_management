import { useEffect, useState } from "react";
import Navbar from "./components/Navbar";
import Login from "./components/Login";
import Task from "./components/Task";
import Account from "./components/Account";
import ForgotPassword from "./components/ForgotPassword";
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { ToastContainer } from 'react-toastify';
import { ENDPOINTS, instance } from "./components/api";

const ProtectedRoute = () => {
  const token = localStorage.getItem("token");
  return token ? <DashboardLayout /> : <Navigate to="/" replace />;
};

const DashboardLayout = () => {
  const [filter, setFilter] = useState("all");
  const [profile, setProfile] = useState(null);
  const [isProfileLoading, setIsProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState("");
  const location = useLocation();

  const loadProfile = async () => {
    setIsProfileLoading(true);
    setProfileError("");
    try {
      const response = await instance.get(ENDPOINTS.GET_PROFILE());
      setProfile(response.data);
    } catch (error) {
      setProfileError(error.response?.data?.detail ?? "We couldn't load your account.");
    } finally {
      setIsProfileLoading(false);
    }
  };

  useEffect(() => {
    let isCurrent = true;

    instance
      .get(ENDPOINTS.GET_PROFILE())
      .then((response) => {
        if (isCurrent) setProfile(response.data);
      })
      .catch((error) => {
        if (isCurrent) setProfileError(error.response?.data?.detail ?? "We couldn't load your account.");
      })
      .finally(() => {
        if (isCurrent) setIsProfileLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  if (isProfileLoading) {
    return (
      <div className="flex min-h-svh bg-[#f4f6f2]">
        <Navbar filter={filter} onFilterChange={setFilter} profile={profile} />
        <main className="grid min-w-0 flex-1 place-items-center px-4 text-sm font-semibold text-slate-600" role="status">
          Loading your account...
        </main>
      </div>
    );
  }

  if (profileError && location.pathname !== "/account") {
    return <Navigate to="/account" replace state={{ completeProfile: true }} />;
  }

  if (!isProfileLoading && profile && !profile.profile_complete && location.pathname !== "/account") {
    return <Navigate to="/account" replace state={{ completeProfile: true }} />;
  }

  return (
    <div className="flex min-h-svh bg-[#f4f6f2]">
      <Navbar filter={filter} onFilterChange={setFilter} profile={profile} />
      <Outlet context={{ filter, onFilterChange: setFilter, profile, isProfileLoading, profileError, loadProfile, onProfileChange: setProfile }} />
    </div>
  );
};

function App() {
  return (
    <>
      <ToastContainer position="bottom-right" autoClose={3000} />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/tasks" element={<Task />} />
            <Route path="/account" element={<Account />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </>
  );
}

export default App;
