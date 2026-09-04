import { http } from "./http";
import type { RepairStatistics } from "../types";

export async function getRepairStatistics() {
  const response = await http.get<RepairStatistics>("/statistics/repairs");
  return response.data;
}
