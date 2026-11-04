// Wraps a Supabase client so tokens are sealed on the way into the token tables and opened on the way out, with no
// change to the code that uses them. Only the tables below are touched; every other table, and rpc/auth/storage,
// is the plain client. Pure (no Deno or network APIs) so it can be tested with a fake client.

export const TOKEN_TABLES = ["tiktok_accounts", "bc_connections"];
const TOKEN_COLUMNS = ["access_token", "refresh_token"];
const WRITES = new Set(["insert", "update", "upsert"]);

export interface Codec {
  seal(value: string): Promise<string>;
  open(value: string): Promise<string>;
}

type Row = Record<string, unknown>;

async function mapRow(row: unknown, fn: (v: string) => Promise<string>): Promise<unknown> {
  if (!row || typeof row !== "object") return row;
  const out: Row = { ...(row as Row) };
  for (const col of TOKEN_COLUMNS) if (typeof out[col] === "string") out[col] = await fn(out[col] as string);
  return out;
}

const mapRows = (v: unknown, fn: (s: string) => Promise<string>) =>
  Array.isArray(v) ? Promise.all(v.map((r) => mapRow(r, fn))) : mapRow(v, fn);

// A builder that records the calls (.select().eq()…) and replays them on the real one when awaited, so the payload
// of an insert/update/upsert can be sealed first (sealing is async; chaining is not).
// deno-lint-ignore no-explicit-any
function deferred(client: any, table: string, codec: Codec): any {
  const calls: [string, unknown[]][] = [];
  const run = async () => {
    // deno-lint-ignore no-explicit-any
    let builder: any = client.from(table);
    for (const [method, args] of calls) {
      const a = WRITES.has(method) ? [await mapRows(args[0], codec.seal), ...args.slice(1)] : args;
      builder = builder[method](...a);
    }
    const res = await builder;
    if (res && res.data) res.data = await mapRows(res.data, codec.open);
    return res;
  };
  // deno-lint-ignore no-explicit-any
  const proxy: any = new Proxy(function () {}, {
    get(_t, prop) {
      if (typeof prop === "symbol") return undefined;
      if (prop === "then")
        return (onF?: (v: unknown) => unknown, onR?: (e: unknown) => unknown) => run().then(onF, onR);
      return (...args: unknown[]) => {
        calls.push([prop, args]);
        return proxy;
      };
    },
  });
  return proxy;
}

// deno-lint-ignore no-explicit-any
export function withTokenCrypto<C extends { from: (table: string) => any }>(client: C, codec: Codec): C {
  return new Proxy(client, {
    get(target, prop) {
      if (prop === "from")
        return (table: string) => (TOKEN_TABLES.includes(table) ? deferred(target, table, codec) : target.from(table));
      // deno-lint-ignore no-explicit-any
      const v = Reflect.get(target, prop, target) as any;
      return typeof v === "function" ? v.bind(target) : v;
    },
  });
}
