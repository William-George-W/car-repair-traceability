import { ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { DatabaseService } from "./database.service";
import { AuthUser, Role, UserRow } from "./types";

@Injectable()
export class AuthService {
  constructor(private readonly db: DatabaseService) {}

  async register(username: string, password: string, requestedRole?: string) {
    const role = (requestedRole || "OWNER").toUpperCase() as Role;
    if (!["OWNER", "REPAIR_SHOP"].includes(role)) throw new ConflictException("role must be OWNER or REPAIR_SHOP");
    if (await this.findByUsername(username)) throw new ConflictException("username already exists");
    const passwordHash = await bcrypt.hash(password, 10);
    const result = await this.db.query<any>(
      "INSERT INTO sys_user (username,password_hash,role,status,create_time) VALUES (?,?,?,?,?)",
      [username, passwordHash, role, 1, this.db.now()],
    );
    const user: UserRow = { userId: Number(result.insertId), username, role, passwordHash, status: 1 };
    return this.authResponse(user);
  }

  async login(username: string, password: string) {
    const user = await this.findByUsername(username);
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) throw new UnauthorizedException("username or password is incorrect");
    if (user.status !== 1) throw new UnauthorizedException("user is disabled");
    return this.authResponse(user);
  }

  async currentUser(userId: number): Promise<UserRow> {
    const rows = await this.db.query<any>("SELECT id AS userId,username,password_hash AS passwordHash,role,status FROM sys_user WHERE id=? LIMIT 1", [userId]);
    const user = rows[0] as UserRow | undefined;
    if (!user || Number(user.status) !== 1) throw new UnauthorizedException("current user not found or disabled");
    user.userId = Number(user.userId);
    user.status = Number(user.status);
    return user;
  }

  private async findByUsername(username: string): Promise<UserRow | undefined> {
    const rows = await this.db.query<any>("SELECT id AS userId,username,password_hash AS passwordHash,role,status FROM sys_user WHERE username=? LIMIT 1", [username]);
    const user = rows[0] as UserRow | undefined;
    if (user) { user.userId = Number(user.userId); user.status = Number(user.status); }
    return user;
  }

  private authResponse(user: UserRow) {
    const authUser: AuthUser = { userId: user.userId, username: user.username, role: user.role };
    const token = jwt.sign({ username: authUser.username, role: authUser.role }, process.env.JWT_SECRET || "change-this-development-secret-to-at-least-32-characters", { subject: String(authUser.userId), expiresIn: (process.env.JWT_EXPIRES_IN || "7200s") as any });
    return { token, tokenType: "Bearer", userId: authUser.userId, username: authUser.username, role: authUser.role };
  }
}
