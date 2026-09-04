export type UserRole = "OWNER" | "REPAIR_SHOP" | "ADMIN";

export interface StoredUser {
  token?: string;
  username?: string;
  role?: UserRole;
  userId?: number;
}

export const roleLabels: Record<UserRole, string> = {
  OWNER: "车主",
  REPAIR_SHOP: "维修商",
  ADMIN: "管理员",
};

export function readCurrentUser(): StoredUser | null {
  try {
    const value = JSON.parse(localStorage.getItem("repair_user") || "null") as StoredUser | null;
    if (!value || !value.role) return null;
    return value;
  } catch {
    return null;
  }
}

export function homePathForRole(role?: string): string {
  switch (role) {
    case "OWNER": return "/vehicles";
    case "REPAIR_SHOP": return "/repairs/create";
    case "ADMIN": return "/";
    default: return "/login";
  }
}

export function hasRole(roles: UserRole[], role?: string): role is UserRole {
  return !!role && roles.includes(role as UserRole);
}
