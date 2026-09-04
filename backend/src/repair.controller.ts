import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { IsDateString, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from "class-validator";
import { AuthGuard } from "./auth.guard";
import { RepairService, CreateRepairInput } from "./repair.service";
import { AuthenticatedRequest } from "./request.types";

class CreateRepairDto implements CreateRepairInput {
  @IsString() @IsNotEmpty() vehicleNo!: string;
  @IsString() @IsNotEmpty() vin!: string;
  @IsString() @IsNotEmpty() repairItem!: string;
  @IsOptional() @IsString() faultDescription?: string;
  @IsDateString() repairTime!: string;
  @IsNumber() @Min(0) mileage!: number;
  @IsOptional() @IsString() partsInfo?: string;
  @IsNumber() @Min(0) amount!: number;
  @IsDateString() warrantyStart!: string;
  @IsOptional() @IsDateString() warrantyEnd?: string;
  @IsOptional() @IsNumber() @Min(1) warrantyRuleId?: number;
}

@Controller("repair-records")
export class RepairController {
  constructor(private readonly repairs: RepairService) {}

  @Post() @UseGuards(AuthGuard) create(@Body() body: CreateRepairDto, @Req() req: AuthenticatedRequest) { return this.repairs.create(body, req.user); }
  @Get("my-history") @UseGuards(AuthGuard) historyForUser(@Query("vehicleNo") vehicleNo: string | undefined, @Req() req: AuthenticatedRequest) { return this.repairs.historyForUser(req.user, vehicleNo); }
  @Post(":certificateNo/retry-chain") @UseGuards(AuthGuard) retryChain(@Param("certificateNo") certificateNo: string, @Req() req: AuthenticatedRequest) { return this.repairs.retryChain(certificateNo, req.user); }
  @Get(":certificateNo") get(@Param("certificateNo") certificateNo: string) { return this.repairs.get(certificateNo); }
  @Get(":certificateNo/verify") verify(@Param("certificateNo") certificateNo: string) { return this.repairs.verify(certificateNo); }
  @Get(":certificateNo/warranty") warranty(@Param("certificateNo") certificateNo: string) { return this.repairs.warranty(certificateNo); }
}
