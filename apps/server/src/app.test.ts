import request from "supertest";
import { createApp } from "./app";

describe("server scaffold", () => {
  it("responds to health check", async () => {
    const response = await request(createApp()).get("/health");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
  });
});
