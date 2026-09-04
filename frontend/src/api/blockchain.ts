import { http } from "./http";
import type { BlockchainStatus } from "../types";

export async function getBlockchainStatus() {
  const response = await http.get<BlockchainStatus>("/blockchain/status");
  return response.data;
}
