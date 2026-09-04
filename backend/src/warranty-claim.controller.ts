import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { IsIn, IsNotEmpty, IsOptional, IsString, Length } from "class-validator";
import { AuthGuard } from "./auth.guard";
import { AuthenticatedRequest } from "./request.types";
import { WarrantyClaimService } from "./warranty-claim.service";

class CreateWarrantyClaimDto {
  @IsString() @IsNotEmpty() certificateNo!: string;
  @IsString() @Length(5, 1000) reason!: string;
}

class ProcessWarrantyClaimDto {
  @IsString() @IsIn(["ACCEPT", "COMPLETE", "REJECT"]) action!: "ACCEPT" | "COMPLETE" | "REJECT";
  @IsOptional() @IsString() @Length(0, 1000) note?: string;
}

@Controller("warranty-claims")
@UseGuards(AuthGuard)
export class WarrantyClaimController {
  constructor(private readonly claims: WarrantyClaimService) {}

  @Get() list(@Query("status") status: string | undefined, @Req() req: AuthenticatedRequest) { return this.claims.list(status, req.user); }
  @Get("eligible-repairs") eligibleRepairs(@Req() req: AuthenticatedRequest) { return this.claims.eligibleRepairs(req.user); }
  @Post() create(@Body() body: CreateWarrantyClaimDto, @Req() req: AuthenticatedRequest) { return this.claims.create(body.certificateNo, body.reason, req.user); }
  @Patch(":claimNo/process") process(@Param("claimNo") claimNo: string, @Body() body: ProcessWarrantyClaimDto, @Req() req: AuthenticatedRequest) { return this.claims.process(claimNo, body.action, body.note, req.user); }
}
