import { http } from "./http";
import type { EligibleWarrantyRepair, WarrantyClaim } from "../types";

export async function listWarrantyClaims(status?: string) {
  const response = await http.get<WarrantyClaim[]>("/warranty-claims", { params: status ? { status } : undefined });
  return response.data;
}

export async function listEligibleWarrantyRepairs() {
  const response = await http.get<EligibleWarrantyRepair[]>("/warranty-claims/eligible-repairs");
  return response.data;
}

export async function createWarrantyClaim(certificateNo: string, reason: string) {
  const response = await http.post<WarrantyClaim>("/warranty-claims", { certificateNo, reason });
  return response.data;
}

export async function processWarrantyClaim(claimNo: string, action: "ACCEPT" | "COMPLETE" | "REJECT", note?: string) {
  const response = await http.patch<WarrantyClaim>(`/warranty-claims/${encodeURIComponent(claimNo)}/process`, { action, note });
  return response.data;
}
