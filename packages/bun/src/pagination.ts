import { createToken, type Token } from "@bunwire/core";
import { BunHttpException } from "./exceptions.js";

export interface BunPaginationOptions {
  readonly defaultPageSize?: number;
  readonly maxPageSize?: number;
}

export interface BunPaginationInput {
  readonly page: number;
  readonly pageSize: number;
  readonly offset: number;
}

export interface BunPaginationLinks {
  readonly self: string;
  readonly first: string;
  readonly previous?: string;
  readonly next?: string;
  readonly last: string;
}

export interface BunPaginationResult<T> extends BunPaginationInput {
  readonly items: readonly T[];
  readonly total: number;
  readonly pageCount: number;
  readonly links: BunPaginationLinks;
}

export class BunPaginationError extends Error {
  override readonly name = "BunPaginationError";
}

export const BUN_PAGINATION: Token<BunPaginationContext> = createToken<BunPaginationContext>("bunwire.bun.pagination");

export function validateBunPaginationOptions(options: BunPaginationOptions = {}): Required<BunPaginationOptions> {
  if (!options || typeof options !== "object" || Array.isArray(options)) throw new BunPaginationError("Pagination options must be an object.");
  const maxPageSize = options.maxPageSize ?? 100;
  const defaultPageSize = options.defaultPageSize ?? 20;
  if (!Number.isSafeInteger(maxPageSize) || maxPageSize < 1 || !Number.isSafeInteger(defaultPageSize)
    || defaultPageSize < 1 || defaultPageSize > maxPageSize) {
    throw new BunPaginationError("Pagination requires positive safe-integer sizes with defaultPageSize no greater than maxPageSize.");
  }
  return Object.freeze({ defaultPageSize, maxPageSize });
}

function queryInteger(search: URLSearchParams, name: string, fallback: number, maximum?: number): number {
  const values = search.getAll(name);
  if (values.length === 0) return fallback;
  if (values.length !== 1 || !/^[1-9][0-9]*$/.test(values[0]!)) throw new BunHttpException(400, `Invalid ${name} query parameter.`);
  const value = Number(values[0]);
  if (!Number.isSafeInteger(value) || (maximum !== undefined && value > maximum)) {
    throw new BunHttpException(400, `Invalid ${name} query parameter.`);
  }
  return value;
}

export class BunPaginationContext {
  readonly #url: URL;
  readonly #options: Required<BunPaginationOptions>;

  constructor(request: Request, options: BunPaginationOptions = {}) {
    this.#url = new URL(request.url);
    this.#options = validateBunPaginationOptions(options);
    Object.freeze(this);
  }

  input(): BunPaginationInput {
    const page = queryInteger(this.#url.searchParams, "page", 1);
    const pageSize = queryInteger(this.#url.searchParams, "perPage", this.#options.defaultPageSize, this.#options.maxPageSize);
    const offset = (page - 1) * pageSize;
    if (!Number.isSafeInteger(offset)) throw new BunHttpException(400, "Pagination offset exceeds the safe integer range.");
    return Object.freeze({ page, pageSize, offset });
  }

  result<T>(items: readonly T[], total: number): BunPaginationResult<T> {
    if (!Array.isArray(items) || !Number.isSafeInteger(total) || total < 0) {
      throw new BunPaginationError("Pagination results require an array of items and a non-negative safe-integer total.");
    }
    const input = this.input();
    const pageCount = Math.ceil(total / input.pageSize);
    const link = (page: number): string => {
      const query = new URLSearchParams(this.#url.searchParams);
      query.delete("page");
      query.delete("perPage");
      query.append("page", String(page));
      query.append("perPage", String(input.pageSize));
      return `${this.#url.pathname}?${query.toString()}`;
    };
    const links = Object.freeze({
      self: link(input.page),
      first: link(1),
      ...(input.page > 1 ? { previous: link(input.page - 1) } : {}),
      ...(input.page < pageCount ? { next: link(input.page + 1) } : {}),
      last: link(Math.max(1, pageCount)),
    });
    return Object.freeze({ ...input, items: Object.freeze([...items]), total, pageCount, links });
  }
}
