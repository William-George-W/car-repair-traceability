import { Navigate } from "react-router-dom";
import type { ReactElement } from "react";
import { homePathForRole, hasRole, readCurrentUser, type UserRole } from "../auth";

interface RoleRouteProps {
  roles: UserRole[];
  children: ReactElement;
}

export default function RoleRoute({ roles, children }: RoleRouteProps) {
  const user = readCurrentUser();
  if (!user) return <Navigate to="/login" replace />;
  if (!hasRole(roles, user.role)) return <Navigate to={homePathForRole(user.role)} replace />;
  return children;
}
