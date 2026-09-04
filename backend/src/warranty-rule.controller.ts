import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { IsInt, IsNotEmpty, IsOptional, IsString, Length, Max, Min } from "class-validator";
import { AuthGuard } from "./auth.guard";
import { AuthenticatedRequest } from "./request.types";
import { CreateWarrantyRuleInput, UpdateWarrantyRuleInput, WarrantyRuleService } from "./warranty-rule.service";

class CreateWarrantyRuleDto implements CreateWarrantyRuleInput {
  @IsString() @IsNotEmpty() @Length(1, 255) repairItem!: string;
  @IsInt() @Min(1) @Max(3650) warrantyDays!: number;
  @IsOptional() @IsString() @Length(0, 500) description?: string;
}

class UpdateWarrantyRuleDto implements UpdateWarrantyRuleInput {
  @IsOptional() @IsString() @IsNotEmpty() @Length(1, 255) repairItem?: string;
  @IsOptional() @IsInt() @Min(1) @Max(3650) warrantyDays?: number;
  @IsOptional() @IsString() @Length(0, 500) description?: string;
}

class WarrantyRuleStatusDto {
  @IsInt() @Min(0) @Max(1) status!: number;
}

@Controller()
@UseGuards(AuthGuard)
export class WarrantyRuleController {
  constructor(private readonly rules: WarrantyRuleService) {}

  @Get("warranty-rules") activeRules(@Req() req: AuthenticatedRequest) { return this.rules.activeRules(req.user); }
  @Get("admin/warranty-rules") allRules(@Req() req: AuthenticatedRequest) { return this.rules.allRules(req.user); }
  @Post("admin/warranty-rules") create(@Body() body: CreateWarrantyRuleDto, @Req() req: AuthenticatedRequest) { return this.rules.create(body, req.user); }
  @Patch("admin/warranty-rules/:id") update(@Param("id") id: string, @Body() body: UpdateWarrantyRuleDto, @Req() req: AuthenticatedRequest) { return this.rules.update(Number(id), body, req.user); }
  @Patch("admin/warranty-rules/:id/status") updateStatus(@Param("id") id: string, @Body() body: WarrantyRuleStatusDto, @Req() req: AuthenticatedRequest) { return this.rules.updateStatus(Number(id), body.status, req.user); }
}
