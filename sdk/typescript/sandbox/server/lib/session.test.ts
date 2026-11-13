import type { Request, Response } from "express";
import { describe, expect, it } from "vitest";
import { getSessionId } from "./session";

const VALID_SID = "0b9c7a52-3f7e-4d0a-9a51-2c4c1d7e8f90";

function fakeReq(cookie?: string, secure = false): Request {
  return { headers: cookie ? { cookie } : {}, secure } as unknown as Request;
}

function fakeRes() {
  const setCookies: string[] = [];
  const res = {
    append: (name: string, value: string) => {
      if (name === "Set-Cookie") {
        setCookies.push(value);
      }
      return res;
    },
  };
  return { res: res as unknown as Response, setCookies };
}

describe("getSessionId", () => {
  it("mints a new id and sets an httpOnly, SameSite=Strict cookie when none is present", () => {
    const { res, setCookies } = fakeRes();
    const sid = getSessionId(fakeReq(), res);

    expect(sid).toMatch(/^[a-f0-9-]{36}$/);
    expect(setCookies).toEqual([`corti_sid=${sid}; HttpOnly; SameSite=Strict; Path=/`]);
  });

  it("marks the cookie Secure on HTTPS requests", () => {
    const { res, setCookies } = fakeRes();
    getSessionId(fakeReq(undefined, true), res);

    expect(setCookies[0]).toMatch(/; Secure$/);
  });

  it("reuses a valid existing cookie without setting a new one", () => {
    const { res, setCookies } = fakeRes();
    const sid = getSessionId(fakeReq(`theme=dark; corti_sid=${VALID_SID}; other=1`), res);

    expect(sid).toBe(VALID_SID);
    expect(setCookies).toEqual([]);
  });

  it("replaces a malformed cookie value with a fresh id", () => {
    const { res, setCookies } = fakeRes();
    const sid = getSessionId(fakeReq("corti_sid=not-a-session-id"), res);

    expect(sid).not.toBe("not-a-session-id");
    expect(sid).toMatch(/^[a-f0-9-]{36}$/);
    expect(setCookies).toHaveLength(1);
  });

  it("mints distinct ids for different browsers", () => {
    const a = getSessionId(fakeReq(), fakeRes().res);
    const b = getSessionId(fakeReq(), fakeRes().res);

    expect(a).not.toBe(b);
  });
});
