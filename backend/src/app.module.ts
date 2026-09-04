import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { DatabaseService } from "./database.service";
import { BlockchainService } from "./blockchain.service";
import { RepairController } from "./repair.controller";
import { RepairService } from "./repair.service";
import { StatisticsController } from "./statistics.controller";
import { VehicleController } from "./vehicle.controller";
import { VehicleService } from "./vehicle.service";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";
import { AuthGuard } from "./auth.guard";
import { BlockchainController } from "./blockchain.controller";
import { WarrantyRuleController } from "./warranty-rule.controller";
import { WarrantyRuleService } from "./warranty-rule.service";
import { WarrantyClaimController } from "./warranty-claim.controller";
import { WarrantyClaimService } from "./warranty-claim.service";

@Module({
  controllers: [AuthController, VehicleController, RepairController, StatisticsController, AdminController, BlockchainController, WarrantyRuleController, WarrantyClaimController],
  providers: [DatabaseService, AuthService, AuthGuard, BlockchainService, VehicleService, RepairService, AdminService, WarrantyRuleService, WarrantyClaimService],
})
export class AppModule {}
