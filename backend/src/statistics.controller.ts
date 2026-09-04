import { Controller, ForbiddenException, Get, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "./auth.guard";
import { AuthService } from "./auth.service";
import { DatabaseService } from "./database.service";
import { AuthenticatedRequest } from "./request.types";

@Controller("statistics")
@UseGuards(AuthGuard)
export class StatisticsController {
  constructor(private readonly db: DatabaseService, private readonly auth: AuthService) {}

  @Get("repairs")
  async repairs(@Req() req: AuthenticatedRequest) {
    const user = await this.auth.currentUser(req.user.userId);
    if (user.role !== "ADMIN") throw new ForbiddenException("administrator access required");
    const records = await this.db.query<any>("SELECT repair_item AS repairItem,repair_time AS repairTime,warranty_start AS warrantyStart,warranty_end AS warrantyEnd,status FROM repair_record") as any[];
    const today = new Date().toISOString().slice(0, 10);
    const repairTypeRawCounts: Record<string, number> = {};
    const warrantyStatusCounts: Record<string, number> = {};
    const monthlyCounts: Record<string, number> = {};
    let onChainRecords = 0, pendingChainRecords = 0, revokedRecords = 0, inWarrantyRecords = 0, expiredWarrantyRecords = 0;
    for (const record of records) {
      const repairItem = String(record.repairItem || "未分类");
      repairTypeRawCounts[repairItem] = (repairTypeRawCounts[repairItem] || 0) + 1;
      const month = String(record.repairTime).slice(0, 7);
      monthlyCounts[month] = (monthlyCounts[month] || 0) + 1;
      if (record.status === "ON_CHAIN") onChainRecords++;
      if (record.status === "PENDING_CHAIN" || record.status === "LOCAL_ONLY") pendingChainRecords++;
      if (record.status === "REVOKED") revokedRecords++;
      let warrantyStatus = "IN_WARRANTY";
      if (record.status === "REVOKED") warrantyStatus = "REVOKED";
      else if (today < String(record.warrantyStart).slice(0, 10)) warrantyStatus = "NOT_STARTED";
      else if (today > String(record.warrantyEnd).slice(0, 10)) warrantyStatus = "EXPIRED";
      warrantyStatusCounts[warrantyStatus] = (warrantyStatusCounts[warrantyStatus] || 0) + 1;
      if (warrantyStatus === "IN_WARRANTY") inWarrantyRecords++;
      if (warrantyStatus === "EXPIRED") expiredWarrantyRecords++;
    }
    const sortedRepairTypes = Object.entries(repairTypeRawCounts).sort(([nameA, countA], [nameB, countB]) => countB - countA || nameA.localeCompare(nameB));
    const repairTypeCounts: Record<string, number> = Object.fromEntries(sortedRepairTypes.slice(0, 15));
    const otherRepairTypeCount = sortedRepairTypes.slice(15).reduce((sum, [, count]) => sum + count, 0);
    if (otherRepairTypeCount > 0) repairTypeCounts["其他"] = otherRepairTypeCount;
    const vehicleRows = await this.db.query<any>("SELECT COUNT(*) AS count FROM vehicle");
    const abnormalRows = await this.db.query<any>("SELECT status,COUNT(*) AS count FROM abnormal_record WHERE active=1 GROUP BY status") as any[];
    const falsePositiveRows = await this.db.query<any>("SELECT COUNT(*) AS count FROM abnormal_record WHERE status='FALSE_POSITIVE'") as any[];
    const userRows = await this.db.query<any>("SELECT COUNT(*) AS total, SUM(status=1) AS enabled, SUM(role='REPAIR_SHOP') AS repairShops FROM sys_user") as any[];
    const abnormalCounts: Record<string, number> = Object.fromEntries(abnormalRows.map((row) => [row.status, Number(row.count)]));
    const abnormalRecords = Object.values(abnormalCounts).reduce((sum, count) => sum + Number(count), 0);
    return {
      totalRecords: records.length, totalVehicles: Number(vehicleRows[0].count), onChainRecords, pendingChainRecords, revokedRecords,
      inWarrantyRecords, expiredWarrantyRecords, abnormalRecords, handledAbnormalRecords: (abnormalCounts.CONFIRMED || 0) + (abnormalCounts.HANDLED || 0),
      unhandledAbnormalRecords: abnormalCounts.UNHANDLED || 0, totalUsers: Number(userRows[0].total || 0), enabledUsers: Number(userRows[0].enabled || 0),
      falsePositiveAbnormalRecords: Number(falsePositiveRows[0]?.count || 0), repairShopUsers: Number(userRows[0].repairShops || 0), repairTypeCounts, warrantyStatusCounts, monthlyCounts,
    };
  }
}
