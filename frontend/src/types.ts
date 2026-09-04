export interface AuthResponse {
  token: string;
  tokenType: string;
  userId: number;
  username: string;
  role: string;
}

export interface Vehicle {
  id: number;
  vehicleNo: string;
  vin: string;
  plateNo: string;
  brandModel: string;
  ownerId: number;
  createTime: string;
}

export interface RepairRecord {
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
  amount: number;
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
  revokedTime?: string;
  repairShopUsername?: string;
  ownerUsername?: string;
  brandModel?: string;
  revokedByUsername?: string;
}

export interface WarrantyRule {
  id: number;
  repairItem: string;
  warrantyDays: number;
  description?: string;
  status: number;
  createTime: string;
  updateTime: string;
}

export interface AbnormalRescanResult {
  recordsScanned: number;
  anomaliesCreated: number;
  anomaliesUpdated: number;
  anomaliesDeactivated: number;
  activeSignals: number;
}

export interface VerificationResult {
  certificateNo: string;
  valid: boolean;
  hashMatched: boolean;
  chainMatched: boolean | null;
  status: string;
  message: string;
}

export interface WarrantyResult {
  certificateNo: string;
  vehicleNo: string;
  repairItem: string;
  warrantyStart: string;
  warrantyEnd: string;
  warrantyStatus: string;
  remainingDays: number;
}

export interface EligibleWarrantyRepair {
  id: number;
  certificateNo: string;
  vehicleNo: string;
  vin: string;
  repairItem: string;
  repairTime: string;
  warrantyStart: string;
  warrantyEnd: string;
  transactionHash: string;
  brandModel?: string;
  repairShopUsername?: string;
  remainingDays: number;
}

export interface WarrantyClaim {
  id: number;
  claimNo: string;
  repairRecordId: number;
  ownerId: number;
  ownerUsername: string;
  repairShopId: number;
  repairShopUsername: string;
  reason: string;
  status: "PENDING" | "ACCEPTED" | "COMPLETED" | "REJECTED";
  acceptNote?: string;
  resultNote?: string;
  submittedTime: string;
  acceptedTime?: string;
  completedTime?: string;
  rejectedTime?: string;
  updatedTime: string;
  certificateNo: string;
  vehicleNo: string;
  vin: string;
  repairItem: string;
  repairTime: string;
  warrantyStart: string;
  warrantyEnd: string;
  transactionHash: string;
  brandModel?: string;
}

export interface AbnormalRecord {
  id: number;
  repairRecordId: number;
  vehicleNo: string;
  abnormalType: string;
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  description: string;
  ruleExplanation?: string;
  status: string;
  active: boolean;
  handleNote?: string;
  handledByUsername?: string;
  handledTime?: string;
  certificateNo?: string;
  repairItem?: string;
  createTime: string;
}

export interface AdminUser {
  userId: number;
  username: string;
  role: string;
  status: number;
  blockchainAddress?: string;
  createTime: string;
}

export interface AdminOperationLog {
  id: number;
  action: string;
  targetType: string;
  targetId: string;
  targetLabel: string;
  detail: string;
  createTime: string;
  operatorId: number;
  operatorUsername?: string;
}

export interface BlockchainStatus {
  enabled: boolean;
  available: boolean;
  chainId: number | null;
  message: string;
}

export interface RepairStatistics {
  totalRecords: number;
  totalVehicles: number;
  onChainRecords: number;
  pendingChainRecords: number;
  revokedRecords: number;
  inWarrantyRecords: number;
  expiredWarrantyRecords: number;
  abnormalRecords: number;
  handledAbnormalRecords: number;
  unhandledAbnormalRecords: number;
  falsePositiveAbnormalRecords: number;
  totalUsers: number;
  enabledUsers: number;
  repairShopUsers: number;
  repairTypeCounts: Record<string, number>;
  warrantyStatusCounts: Record<string, number>;
  monthlyCounts: Record<string, number>;
}
