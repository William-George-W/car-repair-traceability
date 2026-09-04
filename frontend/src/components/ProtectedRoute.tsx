import { Navigate, Outlet, useLocation } from "react-router-dom";
import { readCurrentUser } from "../auth";

export default function ProtectedRoute() {
  const location = useLocation();
  return localStorage.getItem("repair_token") && readCurrentUser()
    ? <Outlet />
    : <Navigate to="/login" replace state={{ from: location }} />;
}
