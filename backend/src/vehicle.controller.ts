import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { IsNotEmpty, IsString, Length } from "class-validator";
import { AuthGuard } from "./auth.guard";
import { VehicleService } from "./vehicle.service";
import { RepairService } from "./repair.service";
import { AuthenticatedRequest } from "./request.types";

class CreateVehicleDto {
  @IsString() @IsNotEmpty() @Length(1, 50) vehicleNo!: string;
  @IsString() @IsNotEmpty() @Length(1, 50) vin!: string;
  @IsString() @IsNotEmpty() @Length(1, 20) plateNo!: string;
  @IsString() @IsNotEmpty() @Length(1, 100) brandModel!: string;
}

@Controller("vehicles")
@UseGuards(AuthGuard)
export class VehicleController {
  constructor(private readonly vehicles: VehicleService, private readonly repairs: RepairService) {}

  @Post() create(@Body() body: CreateVehicleDto, @Req() req: AuthenticatedRequest) { return this.vehicles.create(body, req.user); }
  @Get() list(@Req() req: AuthenticatedRequest) { return this.vehicles.list(req.user); }
  @Get(":vehicleNo") get(@Param("vehicleNo") vehicleNo: string, @Req() req: AuthenticatedRequest) { return this.vehicles.get(vehicleNo, req.user); }
  @Get(":vehicleNo/repair-records") async history(@Param("vehicleNo") vehicleNo: string, @Req() req: AuthenticatedRequest) { await this.vehicles.assertAccessible(vehicleNo, req.user); return this.repairs.history(vehicleNo); }
  @Get(":vehicleNo/abnormal-records") async abnormal(@Param("vehicleNo") vehicleNo: string, @Req() req: AuthenticatedRequest) { await this.vehicles.assertAccessible(vehicleNo, req.user); return this.vehicles.abnormalRecords(vehicleNo); }
}
