import { createContext } from "react";
import type { BunPageClient } from "./client.js";
import type { BunwirePage } from "./page-protocol.js";

export interface ReactPageContextValue {
  readonly client?: BunPageClient<any>;
  readonly page?: BunwirePage;
}

export const ReactPageContext = createContext<ReactPageContextValue | undefined>(undefined);
