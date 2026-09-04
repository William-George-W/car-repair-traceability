import { http } from "./http";
import type { AbnormalRecord, Vehicle } from "../types";

export async function listVehicles() {
  const response = await http.get<Vehicle[]>("/vehicles");
  return response.data;
}

export async function createVehicle(payload: Omit<Vehicle, "id" | "ownerId" | "createTime">) {
  const response = await http.post<Vehicle>("/vehicles", payload);
  return response.data;
}

export async function listAbnormalRecords(vehicleNo: string) {
  const response = await http.get<AbnormalRecord[]>(`/vehicles/${vehicleNo}/abnormal-records`);
  return response.data;
}
