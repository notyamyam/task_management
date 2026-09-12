import { useState } from "react";
import Navbar from "./components/Navbar";
import Login from "./components/Login";
import Task from "./components/Task";
import Account from "./components/Account";
import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { ToastContainer } from 'react-toastify';

const ProtectedRoute = () => {
  const token = localStorage.getItem("token");
  return token ? <DashboardLayout /> : <Navigate to="/" replace />;
};

const DashboardLayout = () => {
  const [filter, setFilter] = useState("all");

  return (
    <div className="flex min-h-svh bg-[#f4f6f2]">
      <Navbar filter={filter} onFilterChange={setFilter} />
      <Outlet context={{ filter, onFilterChange: setFilter }} />
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
