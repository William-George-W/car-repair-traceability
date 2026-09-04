import { Navigate, Route, Routes } from "react-router-dom";
import AppLayout from "./components/AppLayout";
import ProtectedRoute from "./components/ProtectedRoute";
import RoleRoute from "./components/RoleRoute";
import { homePathForRole, readCurrentUser } from "./auth";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Vehicles from "./pages/Vehicles";
import RepairCreate from "./pages/RepairCreate";
import History from "./pages/History";
import Verify from "./pages/Verify";
import Abnormal from "./pages/Abnormal";
import AdminManagement from "./pages/AdminManagement";
import WarrantyClaims from "./pages/WarrantyClaims";

export default function App() {
  return <Routes>
    <Route path="/login" element={<Login />} />
    <Route element={<ProtectedRoute />}>
      <Route element={<AppLayout />}>
        <Route path="/" element={<RoleRoute roles={["ADMIN"]}><Dashboard /></RoleRoute>} />
        <Route path="/vehicles" element={<RoleRoute roles={["OWNER", "ADMIN"]}><Vehicles /></RoleRoute>} />
        <Route path="/repairs/create" element={<RoleRoute roles={["REPAIR_SHOP"]}><RepairCreate /></RoleRoute>} />
        <Route path="/history" element={<RoleRoute roles={["OWNER", "REPAIR_SHOP", "ADMIN"]}><History /></RoleRoute>} />
        <Route path="/verify" element={<RoleRoute roles={["OWNER", "REPAIR_SHOP", "ADMIN"]}><Verify /></RoleRoute>} />
        <Route path="/warranty-claims" element={<RoleRoute roles={["OWNER", "REPAIR_SHOP", "ADMIN"]}><WarrantyClaims /></RoleRoute>} />
        <Route path="/abnormal" element={<RoleRoute roles={["ADMIN"]}><Abnormal /></RoleRoute>} />
        <Route path="/admin" element={<RoleRoute roles={["ADMIN"]}><AdminManagement /></RoleRoute>} />
      </Route>
    </Route>
    <Route path="*" element={<Navigate to={localStorage.getItem("repair_token") ? homePathForRole(readCurrentUser()?.role) : "/login"} replace />} />
  </Routes>;
}
