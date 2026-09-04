import { createHash, randomUUID } from "crypto";
import { AbnormalRecordRow, RepairRecordRow, VehicleRow } from "./types";

export function normalizeDateTime(value: string | Date): string {
  const text = value instanceof Date ? value.toISOString() : String(value);
  return text.replace(" ", "T").replace(/\.\d{3}Z$/, "").replace(/Z$/, "");
}

export function dateForMysql(value: string): string {
  return normalizeDateTime(value).replace("T", " ").slice(0, 19);
}

export function dateOnly(value: string): string {
  return String(value).slice(0, 10);
}

export function money(value: string | number): string {
  return Number(value).toFixed(2);
}

export function calculateRepairHash(record: {
  certificateNo: string;
  vehicleNo: string;
  vin: string;
  repairItem: string;
  faultDescription?: string | null;
  repairTime: string;
  mileage: number;
  partsInfo?: string | null;
  amount: string | number;
  warrantyStart: string;
  warrantyEnd: string;
}): string {
  const canonical = [
    record.certificateNo,
    record.vehicleNo,
    record.vin,
    record.repairItem,
    record.faultDescription ?? "",
    normalizeDateTime(record.repairTime),
    String(record.mileage),
    record.partsInfo ?? "",
    money(record.amount),
    dateOnly(record.warrantyStart),
    dateOnly(record.warrantyEnd),
  ].join("|");
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export function generateCertificateNo(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `CERT${stamp}${randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase()}`;
}

export function epochSecondsForDateTime(value: string): bigint {
  const [date, time = "00:00:00"] = normalizeDateTime(value).split("T");
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute, second] = time.slice(0, 8).split(":").map(Number);
  return BigInt(Math.floor(Date.UTC(year, month - 1, day, hour, minute, second) / 1000));
}

export function epochSecondsForDate(value: string): bigint {
  const [year, month, day] = dateOnly(value).split("-").map(Number);
  return BigInt(Math.floor(Date.UTC(year, month - 1, day) / 1000));
}

export function toVehicleResponse(row: VehicleRow) {
  return { ...row, id: Number(row.id), ownerId: Number(row.ownerId) };
}

export function toRepairResponse(row: RepairRecordRow) {
  return {
    ...row,
    id: Number(row.id),
    repairShopId: Number(row.repairShopId),
    chainId: row.chainId === undefined || row.chainId === null ? undefined : Number(row.chainId),
    chainBlockNumber: row.chainBlockNumber === undefined || row.chainBlockNumber === null ? undefined : Number(row.chainBlockNumber),
    chainTimestamp: row.chainTimestamp === undefined || row.chainTimestamp === null ? undefined : Number(row.chainTimestamp),
    revokedBy: row.revokedBy ? Number(row.revokedBy) : undefined,
    chainAttemptCount: Number(row.chainAttemptCount || 0),
    mileage: Number(row.mileage),
    amount: Number(row.amount),
    repairTime: normalizeDateTime(row.repairTime),
    warrantyStart: dateOnly(row.warrantyStart),
    warrantyEnd: dateOnly(row.warrantyEnd),
    revokedTime: row.revokedTime ? normalizeDateTime(row.revokedTime) : undefined,
    lastChainAttemptTime: row.lastChainAttemptTime ? normalizeDateTime(row.lastChainAttemptTime) : undefined,
  };
}

export function toAbnormalResponse(row: AbnormalRecordRow) {
  return {
    ...row,
    id: Number(row.id),
    repairRecordId: Number(row.repairRecordId),
    active: Boolean(Number(row.active)),
    handledBy: row.handledBy ? Number(row.handledBy) : undefined,
    createTime: normalizeDateTime(row.createTime),
    handledTime: row.handledTime ? normalizeDateTime(row.handledTime) : undefined,
  };
}
