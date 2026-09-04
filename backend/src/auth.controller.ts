import { Body, Controller, Post } from "@nestjs/common";
import { IsNotEmpty, IsOptional, IsString, Length, MinLength } from "class-validator";
import { AuthService } from "./auth.service";

class RegisterDto {
  @IsString() @Length(3, 50) username!: string;
  @IsString() @MinLength(6) password!: string;
  @IsOptional() @IsString() role?: string;
}

class LoginDto {
  @IsString() @IsNotEmpty() username!: string;
  @IsString() @IsNotEmpty() password!: string;
}

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("register") register(@Body() body: RegisterDto) { return this.auth.register(body.username, body.password, body.role); }
  @Post("login") login(@Body() body: LoginDto) { return this.auth.login(body.username, body.password); }
}
