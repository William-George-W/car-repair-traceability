import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import jwt from "jsonwebtoken";
import { AuthService } from "./auth.service";
import { AuthUser } from "./types";

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ headers: { authorization?: string }; user?: AuthUser }>();
    const authorization = request.headers.authorization || "";
    if (!authorization.startsWith("Bearer ")) throw new UnauthorizedException("authentication required");
    try {
      const payload = jwt.verify(authorization.slice(7), process.env.JWT_SECRET || "change-this-development-secret-to-at-least-32-characters") as jwt.JwtPayload;
      const currentUser = await this.auth.currentUser(Number(payload.sub));
      const requestUser: AuthUser = { userId: currentUser.userId, username: currentUser.username, role: currentUser.role };
      request.user = requestUser;
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException("invalid or expired token");
    }
  }
}
