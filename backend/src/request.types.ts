import { Request } from "express";
import { AuthUser } from "./types";

export type AuthenticatedRequest = Request & { user: AuthUser };
