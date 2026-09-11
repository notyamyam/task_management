import Navbar from "./components/Navbar";
import Login from "./components/Login";
import Task from "./components/Task";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import "./App.css";
import { Navigate } from "react-router-dom";
import { ToastContainer } from 'react-toastify';

const ProtectedRoute = ({ children }) => {
  const token = localStorage.getItem("token");
  return token ? children : <Navigate to="/" />;
};

function App() {
  return (
    <>
      <ToastContainer />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Login />} />
          <Route
            path="/tasks"
            element={
              <ProtectedRoute>
                <Navbar />
                <Task />
              </ProtectedRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </>
  );
}

export default App;
