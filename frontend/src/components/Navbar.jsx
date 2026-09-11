import { useNavigate } from "react-router-dom";

const Navbar = () => {
  const navigate = useNavigate();
  const logout = () => {
    localStorage.removeItem("token");
    navigate("/");
  };
  return (
    <>
      <div className="navbar">
        <h1>Task Management System</h1>
        <button type="button" onClick={logout}>Logout</button>
      </div>
    </>
  );
};

export default Navbar;
