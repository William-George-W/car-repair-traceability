import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { IsIn, IsInt, IsNotEmpty, IsString, Length, Max, Min } from "class-validator";
import { AuthGuard } from "./auth.guard";
import { AdminService } from "./admin.service";
import { AuthenticatedRequest } from "./request.types";

class UserStatusDto {
  @IsInt() @Min(0) @Max(1) status!: number;
}

class RevokeRepairDto {
  @IsString() @IsNotEmpty() @Length(2, 255) reason!: string;
}

class HandleAbnormalDto {
  @IsString() @IsNotEmpty() @Length(2, 500) note!: string;
  @IsString() @IsIn(["CONFIRMED", "FALSE_POSITIVE"]) resolution!: "CONFIRMED" | "FALSE_POSITIVE";
}

@Controller("admin")
@UseGuards(AuthGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get("users") users(@Req() req: AuthenticatedRequest) { return this.admin.users(req.user); }
  @Get("operation-logs") operationLogs(@Query("limit") limit: string | undefined, @Req() req: AuthenticatedRequest) { return this.admin.operationLogs(limit, req.user); }
  @Patch("users/:id/status") updateUserStatus(@Param("id") id: string, @Body() body: UserStatusDto, @Req() req: AuthenticatedRequest) { return this.admin.updateUserStatus(Number(id), body.status, req.user); }
  @Get("repair-records") repairs(@Req() req: AuthenticatedRequest) { return this.admin.repairs(req.user); }
  @Patch("repair-records/:certificateNo/revoke") revokeRepair(@Param("certificateNo") certificateNo: string, @Body() body: RevokeRepairDto, @Req() req: AuthenticatedRequest) { return this.admin.revokeRepair(certificateNo, body.reason, req.user); }
  @Get("abnormal-records") abnormalRecords(@Query("status") status: string | undefined, @Req() req: AuthenticatedRequest) { return this.admin.abnormalRecords(status, req.user); }
  @Patch("abnormal-records/:id/handle") handleAbnormal(@Param("id") id: string, @Body() body: HandleAbnormalDto, @Req() req: AuthenticatedRequest) { return this.admin.handleAbnormal(Number(id), body.note, body.resolution, req.user); }
  @Post("abnormal-records/rescan") rescanAbnormalRecords(@Req() req: AuthenticatedRequest) { return this.admin.rescanAbnormalRecords(req.user); }
}
