import { http } from "./http";
import type { AuthResponse } from "../types";

export async function login(username: string, password: string) {
  const response = await http.post<AuthResponse>("/auth/login", { username, password });
  return response.data;
}

export async function register(username: string, password: string, role: string) {
  const response = await http.post<AuthResponse>("/auth/register", { username, password, role });
  return response.data;
}
