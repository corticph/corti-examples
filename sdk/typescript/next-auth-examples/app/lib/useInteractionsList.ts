"use client";

import { CortiClient } from "@corti/sdk";
import { useCallback, useEffect, useState } from "react";

export function useInteractionsList(
  accessToken: string | null,
  environment: string,
  tenant: string,
) {
  const [list, setList] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchList = useCallback(async (token: string, env: string, t: string) => {
    setLoading(true);
    setError(null);
    try {
      const client = new CortiClient({
        tenantName: t,
        environment: env,
        auth: { accessToken: token },
      });
      const pager = await client.interactions.list({
        pageSize: 10,
        index: 1,
      });
      const items: unknown[] = [];
      for await (const item of pager) {
        items.push(item);
      }
      setList(items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load interactions");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!accessToken || !environment.trim() || !tenant.trim()) {
      setList([]);
      setError(null);
      return;
    }
    fetchList(accessToken, environment.trim(), tenant.trim());
  }, [accessToken, environment, tenant, fetchList]);

  return { list, loading, error };
}
