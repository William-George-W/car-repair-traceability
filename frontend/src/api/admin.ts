import { http } from "./http";
import type { AbnormalRecord, AbnormalRescanResult, AdminOperationLog, AdminUser, RepairRecord, WarrantyRule } from "../types";

export async function listAdminUsers() {
  const response = await http.get<AdminUser[]>("/admin/users");
  return response.data;
}

export async function updateAdminUserStatus(userId: number, status: number) {
  const response = await http.patch(`/admin/users/${userId}/status`, { status });
  return response.data;
}

export async function listAdminOperationLogs(limit = 80) {
  const response = await http.get<AdminOperationLog[]>("/admin/operation-logs", { params: { limit } });
  return response.data;
}

export async function listAdminRepairs() {
  const response = await http.get<RepairRecord[]>("/admin/repair-records");
  return response.data;
}

export async function revokeAdminRepair(certificateNo: string, reason: string) {
  const response = await http.patch(`/admin/repair-records/${encodeURIComponent(certificateNo)}/revoke`, { reason });
  return response.data;
}

export async function listAdminAbnormalRecords(status?: string) {
  const response = await http.get<AbnormalRecord[]>("/admin/abnormal-records", { params: status ? { status } : undefined });
  return response.data;
}

export async function handleAdminAbnormal(id: number, note: string, resolution: "CONFIRMED" | "FALSE_POSITIVE") {
  const response = await http.patch(`/admin/abnormal-records/${id}/handle`, { note, resolution });
  return response.data;
}

export async function rescanAdminAbnormalRecords() {
  const response = await http.post<AbnormalRescanResult>("/admin/abnormal-records/rescan");
  return response.data;
}

export async function listAdminWarrantyRules() {
  const response = await http.get<WarrantyRule[]>("/admin/warranty-rules");
  return response.data;
}

export async function createAdminWarrantyRule(payload: Pick<WarrantyRule, "repairItem" | "warrantyDays"> & { description?: string }) {
  const response = await http.post<WarrantyRule>("/admin/warranty-rules", payload);
  return response.data;
}

export async function updateAdminWarrantyRule(id: number, payload: Partial<Pick<WarrantyRule, "repairItem" | "warrantyDays"> & { description?: string }>) {
  const response = await http.patch<WarrantyRule>(`/admin/warranty-rules/${id}`, payload);
  return response.data;
}

export async function updateAdminWarrantyRuleStatus(id: number, status: number) {
  const response = await http.patch(`/admin/warranty-rules/${id}/status`, { status });
  return response.data;
}
