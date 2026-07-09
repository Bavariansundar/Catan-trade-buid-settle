import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { User } from "../domain/types.js";

export interface CreateUserInput {
  readonly email: string;
  readonly passwordHash: string;
  readonly displayName: string;
}

export interface UserRepository {
  create(input: CreateUserInput): Promise<User>;
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
}

export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: CreateUserInput): Promise<User> {
    return this.prisma.user.create({ data: input });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }
}

/** See docs/architecture/server.md §0 — exercises the exact same interface as the Prisma-backed repository. */
export class InMemoryUserRepository implements UserRepository {
  private readonly byId = new Map<string, User>();

  create(input: CreateUserInput): Promise<User> {
    const user: User = { id: randomUUID(), createdAt: new Date(), ...input };
    this.byId.set(user.id, user);
    return Promise.resolve(user);
  }

  findByEmail(email: string): Promise<User | null> {
    for (const user of this.byId.values()) {
      if (user.email === email) return Promise.resolve(user);
    }
    return Promise.resolve(null);
  }

  findById(id: string): Promise<User | null> {
    return Promise.resolve(this.byId.get(id) ?? null);
  }
}
