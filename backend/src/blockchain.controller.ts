import { Controller, Get, UseGuards } from "@nestjs/common";
import { AuthGuard } from "./auth.guard";
import { BlockchainService } from "./blockchain.service";

@Controller("blockchain")
@UseGuards(AuthGuard)
export class BlockchainController {
  constructor(private readonly blockchain: BlockchainService) {}

  @Get("status") status() { return this.blockchain.status(); }
}
