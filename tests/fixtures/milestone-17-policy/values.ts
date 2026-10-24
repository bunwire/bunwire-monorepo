import { Csrf, Auth } from "./middleware.js";
export const COMMON_SECURITY = ["csrf", "auth", "audit:strict"] as const;
export const ADMIN_GLOB = "controllers/admin/**";
export const GLOBAL = [Csrf, "audit:global"] as const;
export const GROUP_ARGS = ["web", COMMON_SECURITY] as const;
export const BASE_MAPPING = { [ADMIN_GLOB]: "web" };
export const ADMIN_MAPPING = { ...BASE_MAPPING, [ADMIN_GLOB]: "admin" };
export const CLASS_COLLECTION = [Auth, "audit:strict"] as const;
