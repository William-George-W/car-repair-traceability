export type Role = "OWNER" | "REPAIR_SHOP" | "ADMIN";

export interface AuthUser {
  userId: number;
  username: string;
  role: Role;
}

export interface UserRow extends AuthUser {
  passwordHash: string;
  status: number;
}

export interface VehicleRow {
  id: number;
  vehicleNo: string;
  vin: string;
  plateNo: string;
  brandModel: string;
  ownerId: number;
  createTime: string;
}

export interface RepairRecordRow {
  id: number;
  certificateNo: string;
  vehicleNo: string;
  vin: string;
  repairShopId: number;
  repairItem: string;
  faultDescription?: string;
  repairTime: string;
  mileage: number;
  partsInfo?: string;
  amount: string | number;
  warrantyStart: string;
  warrantyEnd: string;
  dataHash: string;
  transactionHash?: string;
  contractAddress?: string;
  chainId?: number;
  chainBlockNumber?: number;
  chainTimestamp?: number;
  chainErrorMessage?: string;
  chainAttemptCount?: number;
  lastChainAttemptTime?: string;
  status: string;
  revokeReason?: string;
  revokeTransactionHash?: string;
  revokedBy?: number;
  revokedTime?: string;
  createTime: string;
}

export interface AbnormalRecordRow {
  id: number;
  repairRecordId: number;
  vehicleNo: string;
  abnormalType: string;
  riskLevel: string;
  description: string;
  ruleExplanation?: string;
  status: string;
  active: number | boolean;
  handleNote?: string;
  handledBy?: number;
  handledTime?: string;
  createTime: string;
}

export interface WarrantyRuleRow {
  id: number;
  repairItem: string;
  warrantyDays: number;
  description?: string | null;
  status: number;
  createTime: string;
  updateTime: string;
}
