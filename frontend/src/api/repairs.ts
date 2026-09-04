import { http } from "./http";
import type { RepairRecord, VerificationResult, WarrantyResult, WarrantyRule } from "../types";

export interface CreateRepairPayload {
  vehicleNo: string;
  vin: string;
  repairItem: string;
  faultDescription?: string;
  repairTime: string;
  mileage: number;
  partsInfo?: string;
  amount: number;
  warrantyStart: string;
  warrantyEnd?: string;
  warrantyRuleId?: number;
}

export async function createRepair(payload: CreateRepairPayload) {
  const response = await http.post<RepairRecord>("/repair-records", payload, { timeout: 60000 });
  return response.data;
}

export async function retryRepairChain(certificateNo: string) {
  const response = await http.post<RepairRecord>(`/repair-records/${encodeURIComponent(certificateNo)}/retry-chain`, undefined, { timeout: 60000 });
  return response.data;
}

export async function getRepair(certificateNo: string) {
  const response = await http.get<RepairRecord>(`/repair-records/${encodeURIComponent(certificateNo)}`);
  return response.data;
}

export async function listRepairHistory(vehicleNo: string) {
  const response = await http.get<RepairRecord[]>(`/vehicles/${vehicleNo}/repair-records`);
  return response.data;
}

export async function listMyRepairHistory(vehicleNo?: string) {
  const response = await http.get<RepairRecord[]>("/repair-records/my-history", {
    params: vehicleNo?.trim() ? { vehicleNo: vehicleNo.trim() } : undefined,
  });
  return response.data;
}

export async function verifyRepair(certificateNo: string) {
  const response = await http.get<VerificationResult>(`/repair-records/${encodeURIComponent(certificateNo)}/verify`);
  return response.data;
}

export async function getWarranty(certificateNo: string) {
  const response = await http.get<WarrantyResult>(`/repair-records/${encodeURIComponent(certificateNo)}/warranty`);
  return response.data;
}

export async function listWarrantyRules() {
  const response = await http.get<WarrantyRule[]>("/warranty-rules");
  return response.data;
}
